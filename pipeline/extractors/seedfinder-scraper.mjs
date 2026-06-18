#!/usr/bin/env node
/**
 * extractors/seedfinder-scraper.mjs
 *
 * Primer "tentáculo" del pipeline refactorizado.
 * Extrae lista de variedades desde Seedfinder para breeders que aún no tienen cantidad_variedades.
 *
 * Este archivo es un stub inicial que reutiliza la lógica del scraper-seedfinder.mjs original
 * pero preparado para:
 *   - Correr dentro de Docker
 *   - Usar lib/ compartida
 *   - Recibir configuración vía variables de entorno
 *   - Ser orquestado por n8n o un worker manager más adelante
 *
 * TODO futuro:
 *   - Añadir soporte real de proxies (rotación)
 *   - Convertir a clase Extractor con interfaz común
 *   - Emitir eventos/webhooks tras cada batch
 *   - Integrar con sistema de colas (BullMQ o n8n)
 */

import { createPipelineClient, sleep, log } from '../lib/supabase-client.js';
import * as cheerio from 'cheerio';

const BATCH = Number(process.env.BATCH || 15);
const DELAY_MS = Number(process.env.DELAY_MS || 2000);

const sb = createPipelineClient();

function normalizeSlug(raw) {
  return String(raw).trim().toLowerCase()
    .replace(/[_\s]+/g, '-').replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function deriveTipo(nombre, dominancia, seedtype) {
  const n = nombre.toLowerCase(), d = dominancia.toLowerCase(), s = seedtype.toLowerCase();
  if (/\bauto/.test(n) || /ruderalis/.test(d)) return 'automatica';
  if (/regular/.test(s) && !/fem/.test(s)) return 'regular';
  return 'feminizada';
}

function parseStrains(html, breederSlug) {
  const $ = cheerio.load(html);
  const out = [];
  $('a[href*="/strain-info/"]').each((i, el) => {
    const href = ($(el).attr('href') || '').toLowerCase();
    if (!href.endsWith('/' + breederSlug)) return;
    const nombre = $(el).text().trim();
    if (!nombre) return;

    const row = $(el).closest('tr');
    const daysText = row.find('td').eq(2).text().trim();
    const flor = parseInt(daysText, 10) || null;

    const dom = row.find('td').eq(1).text().trim();
    const seedType = row.find('td').eq(3).text().trim();

    out.push({
      nombre,
      floracion_dias: flor,
      tipo: deriveTipo(nombre, dom, seedType),
      genetica: dom || null,
      breeder_slug: breederSlug,
      data_source: 'seedfinder',
    });
  });
  return out;
}

async function processBreeder(breeder) {
  const slug = normalizeSlug(breeder.seedfinder_slug || breeder.breeder_name);
  if (!slug) return { inserted: 0, skipped: true };

  const url = `https://seedfinder.eu/en/database/breeder/${slug}/`;
  log(`Procesando ${breeder.breeder_name} → ${url}`);

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CannabicultorBot/1.0 (+https://cannabicultor.com)' },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const strains = parseStrains(html, slug);

    if (strains.length === 0) {
      log(`  Sin variedades encontradas para ${slug}`);
      await sb.from('breeders').update({ cantidad_variedades: 0 }).eq('id', breeder.id);
      return { inserted: 0 };
    }

    // Inserción en batch (upsert por nombre + breeder para evitar duplicados)
    const toInsert = strains.map(s => ({
      ...s,
      breeder_id: breeder.id,
      created_at: new Date().toISOString(),
    }));

    const { error } = await sb.from('variedades').upsert(toInsert, {
      onConflict: 'nombre,breeder_id',
      ignoreDuplicates: true,
    });

    if (error) throw error;

    await sb.from('breeders').update({
      cantidad_variedades: strains.length,
      seedfinder_synced: new Date().toISOString(),
    }).eq('id', breeder.id);

    log(`  ✓ ${strains.length} variedades insertadas/actualizadas`);
    return { inserted: strains.length };
  } catch (e) {
    log(`  ✗ Error: ${e.message}`);
    return { error: e.message };
  }
}

async function main() {
  log('=== Iniciando extractor Seedfinder (pipeline) ===');

  let query = sb.from('breeders')
    .select('id,breeder_name,seedfinder_slug,cantidad_variedades')
    .not('seedfinder_slug', 'is', null)
    .order('cantidad_variedades', { ascending: true, nullsFirst: true }) // prioriza los que tienen 0 o null
    .limit(BATCH);

  const { data: breeders, error } = await query;
  if (error) throw error;

  if (!breeders?.length) {
    log('No hay breeders pendientes de scraping. Terminando.');
    return;
  }

  log(`Encontrados ${breeders.length} breeders para procesar (batch=${BATCH})`);

  let totalInserted = 0;
  for (const b of breeders) {
    const res = await processBreeder(b);
    if (res.inserted) totalInserted += res.inserted;
    await sleep(DELAY_MS);
  }

  log(`Batch completado. Total variedades procesadas en este lote: ${totalInserted}`);
  log('Ejecuta de nuevo para continuar con el siguiente lote.');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
