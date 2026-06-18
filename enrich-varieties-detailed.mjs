#!/usr/bin/env node
/**
 * enrich-varieties-detailed.mjs
 *
 * Enriquece la tabla `variedades` con datos ricos:
 *   - Terpenos (cuando se encuentran en formato % o dominante)
 *   - Aromas / sabores / efectos (de reviews normalizadas)
 *   - Perfiles de cannabinoides (THC/CBD de labs o promedios)
 *   - image_url (foto de la cepa)
 *
 * Fuentes principales (orden de prioridad):
 *   1. Páginas individuales de Seedfinder (https://seedfinder.eu/en/database/strain-info/...)
 *      → Excelente para aromas/efectos vía su sistema de reviews + "Strain Cloud".
 *      → Tiene subpáginas de cannabinoids para algunos breeders.
 *   2. Sitio oficial del breeder (si tiene lab reports o terpene descriptions).
 *   3. Leafly (mejor fuente cuantitativa de terpenos %). Requiere más trabajo (páginas dinámicas).
 *
 * Patrón idéntico a tus otros scripts:
 *   - BATCH + DELAY
 *   - Solo parchea campos NULL (no pisa datos buenos)
 *   - Marca con enriched_at + enrichment_sources para poder reanudar
 *   - Resumeable: filtra por enriched_at IS NULL o por breeder
 *
 * Requisitos:
 *   npm install @supabase/supabase-js cheerio
 *
 * Ejecución recomendada (empieza con los breeders grandes):
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... BATCH=15 node enrich-varieties-detailed.mjs
 *
 * Para forzar un breeder concreto:
 *   node -e 'process.env.TARGET_BREEDER_ID=123; ...'  (o modifica el filtro abajo)
 */

import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const BATCH = Number(process.env.BATCH || 15);
const DELAY_MS = 2200;           // sé amable con Seedfinder
const TARGET_BREEDER_ID = process.env.TARGET_BREEDER_ID ? Number(process.env.TARGET_BREEDER_ID) : null;

if (!SB_URL || !SB_KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY');
  process.exit(1);
}
const sb = createClient(SB_URL, SB_KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => (s || '').toString().trim().toLowerCase();

function normalizeForUrl(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Intenta construir la URL de detalle de una variedad en Seedfinder
function buildSeedfinderStrainUrl(nombre, breederSlug) {
  const n = normalizeForUrl(nombre);
  const b = normalizeForUrl(breederSlug);
  if (!n || !b) return null;
  return `https://seedfinder.eu/en/database/strain-info/${n}/${b}/`;
}

// Parser básico de la página de variedad en Seedfinder.
// Seedfinder usa un sistema de "clouds" y reviews con checkboxes para aroma/taste/effect.
// También tiene secciones de cannabinoids en subpáginas.
async function enrichFromSeedfinder(nombre, breederSlug) {
  const url = buildSeedfinderStrainUrl(nombre, breederSlug);
  if (!url) return {};

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CannabicultorBot/1.0 (+https://cannabicultor.com)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return {};

    const html = await res.text();
    const $ = cheerio.load(html);

    const result = {};

    // === Aromas / sabores / efectos desde las nubes y reviews ===
    // Busca enlaces o spans con clases relacionadas a "smell", "taste", "effect", "cloud"
    const aromas = new Set();
    const sabores = new Set();
    const efectos = new Set();

    // Estrategia común: links tipo /cloud/smell/xxx , /cloud/taste/ , /cloud/high/
    $('a[href*="/cloud/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();
      if (!text) return;

      if (href.includes('/smell/') || href.includes('/aroma/')) aromas.add(text.toLowerCase());
      if (href.includes('/taste/') || href.includes('/flavor/')) sabores.add(text.toLowerCase());
      if (href.includes('/high/') || href.includes('/effect/') || href.includes('/effect')) efectos.add(text.toLowerCase());
    });

    // También parsea secciones de reviews (títulos o listas)
    $('.review, .strain-review, [class*="review"]').each((_, el) => {
      const t = $(el).text().toLowerCase();
      // Palabras clave comunes (puedes ampliar)
      ['citrus','lemon','earthy','sweet','pine','berry','diesel','skunk','floral','spicy','woody','cheese'].forEach(k => {
        if (t.includes(k)) aromas.add(k);
      });
    });

    if (aromas.size) result.aromas = Array.from(aromas).slice(0, 8);
    if (sabores.size) result.sabores = Array.from(sabores).slice(0, 8);
    if (efectos.size) result.efectos = Array.from(efectos).slice(0, 8);

    // === Cannabinoides (si hay sección o link a /cannabinoids) ===
    // Ejemplo real visto: /strain-info/.../cannabinoids
    const cannabinoidLink = $('a[href*="/cannabinoids"]').attr('href');
    if (cannabinoidLink) {
      // Podríamos seguir el link, pero para mantener simple y rápido
      // guardamos la URL para un paso posterior o la anotamos.
      result.cannabinoid_profile_url = new URL(cannabinoidLink, url).href;
    }

    // Intenta extraer números sueltos de THC/CBD que aparezcan en la página
    const thcMatch = html.match(/THC[^0-9]*(\d{1,2}(?:\.\d)?)\s*%/i);
    const cbdMatch = html.match(/CBD[^0-9]*(\d{1,2}(?:\.\d)?)\s*%/i);
    if (thcMatch) result.thc_max = parseFloat(thcMatch[1]);
    if (cbdMatch) result.cbd_max = parseFloat(cbdMatch[1]);

    // === Imagen de la cepa ===
    const img =
      $('meta[property="og:image"]').attr('content') ||
      $('img[src*="strain"], img[src*="bud"], img[src*="flower"]').first().attr('src') ||
      $('img').filter((i, el) => /product|bud|flower|strain/.test($(el).attr('src') || '')).first().attr('src');

    if (img) result.image_url = new URL(img, url).href;

    // Marca la fuente
    result.enrichment_sources = ['seedfinder'];

    return result;
  } catch (e) {
    return {};
  }
}

// Parser muy básico para páginas de breeders que publican terpenos (ej. tablas o secciones "terpene profile")
async function enrichFromBreederSite(website, nombre) {
  if (!website) return {};
  // Implementación mínima — amplía según los breeders que más te importen
  // Muchos publican PDFs de COA o tablas HTML.
  try {
    const res = await fetch(website, {
      headers: { 'User-Agent': 'CannabicultorBot/1.0' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return {};
    const html = await res.text();

    const out = {};

    // Ejemplo muy básico: busca "myrcene 0.3%" o similar
    const terpRegex = /(myrcene|limonene|pinene|caryophyllene|linalool|terpinolene|humulene|ocimene|bisabolol)[^\d]*(\d{1,2}(?:\.\d{1,2})?)\s*%/gi;
    let m;
    const terps = {};
    while ((m = terpRegex.exec(html)) !== null) {
      const name = m[1].toLowerCase();
      const val = parseFloat(m[2]);
      if (val > 0 && val < 10) terps[name] = val;
    }
    if (Object.keys(terps).length) {
      out.terpenos = { ...terps, dominant: Object.keys(terps).sort((a,b)=>terps[b]-terps[a]).slice(0,3) };
      out.enrichment_sources = ['breeder-site'];
    }

    return out;
  } catch {
    return {};
  }
}

async function run() {
  // Selecciona variedades que todavía no tienen datos ricos
  let q = sb.from('variedades')
    .select('id, nombre, floracion_dias, tipo, genetica, breeder_id, terpenos, efectos, aromas, image_url, enriched_at')
    .is('enriched_at', null)                    // las que nunca se han tocado
    .order('id')
    .limit(BATCH);

  if (TARGET_BREEDER_ID) {
    q = q.eq('breeder_id', TARGET_BREEDER_ID);
  }

  const { data: vars, error } = await q;
  if (error) { console.error(error.message); return; }
  if (!vars?.length) { console.log('No quedan variedades pendientes de enriquecer.'); return; }

  console.log(`Procesando ${vars.length} variedades...`);

  // Cargamos los breeders necesarios (para construir URLs de Seedfinder)
  const breederIds = [...new Set(vars.map(v => v.breeder_id))];
  const { data: breeders } = await sb.from('breeders')
    .select('id, breeder_name, seedfinder_slug, website')
    .in('id', breederIds);

  const breederMap = new Map((breeders || []).map(b => [b.id, b]));

  let updated = 0;

  for (const v of vars) {
    const breeder = breederMap.get(v.breeder_id);
    if (!breeder) { await sleep(200); continue; }

    let patch = {};

    // === 1. Seedfinder (aromas, efectos, imagen, algunos labs) ===
    const fromSF = await enrichFromSeedfinder(v.nombre, breeder.seedfinder_slug);
    for (const k of ['aromas', 'sabores', 'efectos', 'image_url', 'thc_max', 'cbd_max', 'cannabinoid_profile_url']) {
      if (fromSF[k] && !v[k]) patch[k] = fromSF[k];
    }
    if (fromSF.terpenos && !v.terpenos) patch.terpenos = fromSF.terpenos;

    // === 2. Web del breeder (terpenos cuando los publican) ===
    if (breeder.website && (!patch.terpenos || !patch.image_url)) {
      const fromSite = await enrichFromBreederSite(breeder.website, v.nombre);
      if (fromSite.terpenos && !patch.terpenos) patch.terpenos = fromSite.terpenos;
      if (fromSite.image_url && !patch.image_url) patch.image_url = fromSite.image_url;
      if (fromSite.enrichment_sources) {
        patch.enrichment_sources = [...(patch.enrichment_sources || []), ...fromSite.enrichment_sources];
      }
    }

    // Marcar como procesado
    patch.enriched_at = new Date().toISOString();
    if (!patch.enrichment_sources) patch.enrichment_sources = ['seedfinder'];

    // Solo actualizamos si realmente encontramos algo nuevo
    const keysWeCare = ['terpenos','aromas','efectos','image_url','thc_max','cbd_max'];
    const hasRealData = keysWeCare.some(k => patch[k]);

    if (hasRealData || Object.keys(patch).length > 2) {   // siempre marcamos enriched_at
      const { error: upErr } = await sb.from('variedades').update(patch).eq('id', v.id);
      if (upErr) {
        console.log(`✗ ${v.nombre}: ${upErr.message}`);
      } else {
        updated++;
        const changed = Object.keys(patch).filter(k => keysWeCare.includes(k) || k === 'enriched_at');
        console.log(`✓ ${breeder.breeder_name} — ${v.nombre}: ${changed.join(', ')}`);
      }
    } else {
      // Al menos marcamos que lo intentamos (evita reintentos infinitos)
      await sb.from('variedades').update({ enriched_at: new Date().toISOString(), enrichment_sources: ['tried'] }).eq('id', v.id);
      console.log(`· ${v.nombre}: sin datos nuevos encontrados`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nHecho. ${updated} variedades actualizadas en este lote.`);
  console.log('Re-ejecuta para continuar. Usa TARGET_BREEDER_ID=xxx para un breeder concreto.');
}

run();