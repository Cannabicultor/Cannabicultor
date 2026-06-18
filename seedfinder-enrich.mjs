#!/usr/bin/env node
/**
 * seedfinder-enrich.mjs — Enriquece la tabla `variedades` con datos de Seedfinder.
 *
 * Por cada breeder con `seedfinder_slug` aún no sincronizado, visita su página en
 * seedfinder.eu y, para TODAS sus variedades, rellena: días de floración, tipo
 * (fem/auto/regular) y dominancia (indica/sativa/ruderalis → campo `genetica`).
 *  - Actualiza las variedades que ya tienes SIN pisar datos que ya estuvieran rellenos.
 *  - Añade las variedades de Seedfinder que te falten.
 *
 * SIN tokens de IA. Páginas públicas, con pausa de cortesía entre breeders.
 *
 * Requisitos:  Node 18+  ·  npm install @supabase/supabase-js cheerio
 * Antes de la 1ª ejecución, en el SQL Editor de Supabase:
 *   ALTER TABLE breeders ADD COLUMN IF NOT EXISTS seedfinder_synced timestamptz;
 *
 * Ejecutar:  SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node seedfinder-enrich.mjs
 *   (opcional)  BATCH=200 delante, para procesar más breeders por tanda.
 *
 * Reanudable: cada breeder terminado se marca con seedfinder_synced. Si se corta,
 * al relanzarlo sigue donde lo dejó. Para reprocesar uno, pon su seedfinder_synced a NULL.
 */

import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const BATCH  = Number(process.env.BATCH || 25);
const DELAY_MS = 2000;

if (!SB_URL || !SB_KEY) { console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
const sb = createClient(SB_URL, SB_KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => (s || '').toString().trim().toLowerCase();

function normalizeSlug(raw) {
  return String(raw).trim().toLowerCase()
    .replace(/[_\s]+/g, '-').replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '');
}
function deriveTipo(nombre, dom, st) {
  const n = nombre.toLowerCase(), d = dom.toLowerCase(), s = st.toLowerCase();
  if (/\bauto/.test(n) || /ruderalis/.test(d)) return 'automatica';
  if (/regular/.test(s) && !/fem/.test(s))     return 'regular';
  return 'feminizada';
}
function parseStrains(html, slug) {
  const $ = cheerio.load(html); const out = [];
  $('a[href*="/strain-info/"]').each((i, el) => {
    const href = ($(el).attr('href') || '').toLowerCase();
    if (!href.endsWith('/' + slug)) return;
    const nombre = $(el).text().trim(); if (!nombre) return;
    const cells = $(el).closest('tr').find('td').map((j, td) => $(td).text().trim()).get();
    const flo = (cells.find(c => /^\d{1,3}$/.test(c)) || '').match(/\d+/);
    const dom = cells.find(c => /indica|sativa|ruderalis/i.test(c)) || '';
    const st  = cells.find(c => /feminized|regular|fem\./i.test(c)) || '';
    out.push({ nombre, floracion_dias: flo ? parseInt(flo[0]) : null, tipo: deriveTipo(nombre, dom, st), genetica: dom || null });
  });
  const seen = new Set();
  return out.filter(v => { const k = norm(v.nombre); if (seen.has(k)) return false; seen.add(k); return true; });
}

async function run() {
  const { data, error } = await sb.from('breeders')
    .select('id,breeder_name,seedfinder_slug')
    .not('seedfinder_slug', 'is', null)
    .is('seedfinder_synced', null)
    .order('id')
    .limit(BATCH);

  if (error) { console.error('Error leyendo breeders:', error.message,
    '\n¿Creaste la columna?  ALTER TABLE breeders ADD COLUMN IF NOT EXISTS seedfinder_synced timestamptz;'); return; }
  if (!data.length) { console.log('No quedan breeders pendientes de sincronizar con Seedfinder.'); return; }
  console.log(`Procesando ${data.length} breeders…\n`);

  let upd = 0, ins = 0;
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
      if (!parsed.length) { console.log(`· ${b.breeder_name}: 0 variedades (slug "${slug}"?)`); 
        await sb.from('breeders').update({ seedfinder_synced: new Date().toISOString() }).eq('id', b.id);
        await sleep(DELAY_MS); continue; }

      // existentes del breeder
      const { data: ex } = await sb.from('variedades')
        .select('id,nombre,floracion_dias,tipo,genetica').eq('breeder_id', b.id);
      const byName = new Map((ex || []).map(v => [norm(v.nombre), v]));

      const toInsert = [];
      let localUpd = 0;
      for (const p of parsed) {
        const cur = byName.get(norm(p.nombre));
        if (cur) {
          const patch = {};
          if (p.floracion_dias && !cur.floracion_dias) patch.floracion_dias = p.floracion_dias;
          if (p.tipo && !cur.tipo)                      patch.tipo = p.tipo;
          if (p.genetica && !cur.genetica)              patch.genetica = p.genetica;
          if (Object.keys(patch).length) { await sb.from('variedades').update(patch).eq('id', cur.id); localUpd++; }
        } else {
          toInsert.push({ breeder_id: b.id, nombre: p.nombre, floracion_dias: p.floracion_dias, tipo: p.tipo, genetica: p.genetica });
        }
      }
      if (toInsert.length) await sb.from('variedades').insert(toInsert);

      const total = (ex ? ex.length : 0) + toInsert.length;
      await sb.from('breeders').update({ cantidad_variedades: total, seedfinder_synced: new Date().toISOString() }).eq('id', b.id);
      upd += localUpd; ins += toInsert.length;
      console.log(`✓ ${b.breeder_name}: ${localUpd} enriquecidas, +${toInsert.length} nuevas (${total} total)`);
    } catch (e) {
      console.log(`✗ ${b.breeder_name}: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`\nHecho. ${upd} variedades enriquecidas, ${ins} añadidas. Reejecuta para el siguiente lote.`);
}

run();
