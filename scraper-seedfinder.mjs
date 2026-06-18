#!/usr/bin/env node
/**
 * scraper-seedfinder.mjs — Rellena la tabla `variedades` desde Seedfinder. SIN tokens de IA.
 *
 * Para cada breeder que tiene `seedfinder_slug` y aún no tiene variedades contadas,
 * descarga su página en seedfinder.eu, extrae la lista de variedades (nombre, días de
 * floración y tipo) y las inserta en Supabase, evitando duplicados.
 *
 * Requisitos:  Node 18+  ·  npm install @supabase/supabase-js cheerio
 * Ejecutar:    SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scraper-seedfinder.mjs
 *
 * Procesa un lote por ejecución (BATCH). Vuelve a lanzarlo para seguir con el resto.
 * Usa `cantidad_variedades` como marca de "ya procesado": si está vacío, lo procesa;
 * cuando termina, lo rellena. Para reprocesar un breeder, pon su cantidad_variedades a null.
 */

import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const BATCH  = Number(process.env.BATCH || 15);
const DELAY_MS = 2000;   // pausa entre breeders, para no saturar Seedfinder

if (!SB_URL || !SB_KEY) { console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
const sb = createClient(SB_URL, SB_KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Royal_Queen_Seeds  ó  Royal Queen Seeds  →  royal-queen-seeds
function normalizeSlug(raw) {
  return String(raw).trim().toLowerCase()
    .replace(/[_\s]+/g, '-').replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function deriveTipo(nombre, dominancia, seedtype) {
  const n = nombre.toLowerCase(), d = dominancia.toLowerCase(), s = seedtype.toLowerCase();
  if (/\bauto/.test(n) || /ruderalis/.test(d)) return 'automatica';
  if (/regular/.test(s) && !/fem/.test(s))     return 'regular';
  return 'feminizada';
}

function parseStrains(html, breederSlug) {
  const $ = cheerio.load(html);
  const out = [];
  $('a[href*="/strain-info/"]').each((i, el) => {
    const href = ($(el).attr('href') || '').toLowerCase();
    if (!href.endsWith('/' + breederSlug)) return;        // solo variedades de ESTE breeder
    const nombre = $(el).text().trim();
    if (!nombre) return;
    const cells = $(el).closest('tr').find('td').map((j, td) => $(td).text().trim()).get();
    const flo = (cells.find(c => /^\d{1,3}$/.test(c)) || '').match(/\d+/);
    const dom = cells.find(c => /indica|sativa|ruderalis/i.test(c)) || '';
    const st  = cells.find(c => /feminized|regular|fem\./i.test(c)) || '';
    out.push({ nombre, floracion_dias: flo ? parseInt(flo[0]) : null, tipo: deriveTipo(nombre, dom, st) });
  });
  const seen = new Set();
  return out.filter(v => { const k = v.nombre.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

async function run() {
  const { data, error } = await sb.from('breeders')
    .select('id,breeder_name,seedfinder_slug')
    .not('seedfinder_slug', 'is', null)
    .is('cantidad_variedades', null)     // cola de trabajo: aún sin procesar
    .order('id')
    .limit(BATCH);

  if (error) { console.error(error.message); return; }
  if (!data.length) { console.log('No quedan breeders pendientes con seedfinder_slug.'); return; }
  console.log(`Procesando ${data.length} breeders…\n`);

  let totalNuevas = 0;
  for (const b of data) {
    const slug = normalizeSlug(b.seedfinder_slug);
    const url = `https://seedfinder.eu/en/database/breeder/${slug}`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'CannabicultorBot/1.0 (+https://cannabicultor.com)' },
        redirect: 'follow', signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) { console.log(`✗ ${b.breeder_name}: HTTP ${res.status} (${slug})`); await sleep(DELAY_MS); continue; }

      const parsed = parseStrains(await res.text(), slug);
      if (!parsed.length) { console.log(`· ${b.breeder_name}: 0 variedades en Seedfinder (slug "${slug}"?)`); await sleep(DELAY_MS); continue; }

      // dedup contra lo que ya exista en la tabla
      const { data: ex } = await sb.from('variedades').select('nombre').eq('breeder_id', b.id);
      const have = new Set((ex || []).map(v => (v.nombre || '').toLowerCase().trim()));
      const nuevas = parsed.filter(v => !have.has(v.nombre.toLowerCase().trim()))
                           .map(v => ({ breeder_id: b.id, ...v }));

      if (nuevas.length) {
        const { error: insErr } = await sb.from('variedades').insert(nuevas);
        if (insErr) { console.log(`✗ ${b.breeder_name}: error al insertar — ${insErr.message}`); await sleep(DELAY_MS); continue; }
      }

      const total = have.size + nuevas.length;
      await sb.from('breeders').update({ cantidad_variedades: total }).eq('id', b.id);
      totalNuevas += nuevas.length;
      console.log(`✓ ${b.breeder_name}: +${nuevas.length} nuevas (${total} en total)`);
    } catch (e) {
      console.log(`✗ ${b.breeder_name}: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`\nHecho. ${totalNuevas} variedades nuevas añadidas. Reejecuta para el siguiente lote.`);
}

run();
