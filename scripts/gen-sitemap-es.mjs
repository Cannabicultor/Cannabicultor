#!/usr/bin/env node
// Genera sitemap-es.xml: growshops y asociaciones de ESPAÑA (/growshops/<ciudad>/<slug>/,
// /asociaciones/<ciudad>/<slug>/ y los listados por ciudad).
//
// Esas páginas las sirve el hosting como archivos estáticos (no las genera build.mjs), así
// que una fila con indexable=true en Supabase puede no tener todavía su página. Para no
// meter URLs que den 404 en el sitemap, cada URL se comprueba contra producción: solo
// entra si responde 200 con <meta robots> "index" y canonical igual a la propia URL.
//
// Solo usa la clave pública (RLS). Ejecutar desde el Mac, en la raíz del repo:
//   node scripts/gen-sitemap-es.mjs            # escribe sitemap-es.xml
//   node scripts/gen-sitemap-es.mjs --dry      # solo informa
// Después: node prerender/build.mjs --paises   (el índice sitemap.xml lo incluye) y desplegar.

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gfyrsrdnvgnhtsuexjkb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_FdRmfirvOTAIfZFOcj2ZZg_Vic__TDw';
const SITE = 'https://www.cannabicultor.com';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.PRERENDER_OUT || ROOT;
const DRY = process.argv.includes('--dry');
const TODAY = new Date().toISOString().slice(0, 10);
const TIPOS = ['growshops', 'asociaciones'];

async function filas(tabla) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}?select=slug,slug_ciudad,updated_at&pais=eq.ES&indexable=eq.true&activo=eq.true&limit=5000`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`${tabla}: ${res.status} ${await res.text()}`);
  return res.json();
}

// Una URL es válida si responde 200, robots empieza por "index" y el canonical es ella misma.
async function esIndexable(url) {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    if (res.status !== 200) return false;
    const html = await res.text();
    const robots = (html.match(/<meta name="robots" content="([^"]*)"/) || [])[1] || '';
    const canon = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
    return /^index\b/.test(robots) && canon === url;
  } catch { return false; }
}

async function enParalelo(items, fn, n = 12) {
  const res = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; res[k] = await fn(items[k]); }
  }));
  return res;
}

const candidatas = []; // { loc, lastmod, tipo, ciudad? }
const ciudades = new Map();
for (const tipo of TIPOS) {
  for (const r of await filas(tipo)) {
    if (!r.slug || !r.slug_ciudad) continue;
    candidatas.push({ tipo, loc: `${SITE}/${tipo}/${r.slug_ciudad}/${r.slug}/`, lastmod: (r.updated_at || TODAY).slice(0, 10), priority: '0.6' });
    ciudades.set(`${tipo}/${r.slug_ciudad}`, { tipo, loc: `${SITE}/${tipo}/${r.slug_ciudad}/`, lastmod: TODAY, priority: '0.7' });
  }
}
const todas = [...ciudades.values(), ...candidatas];
console.log(`Candidatas (indexable=true en BD): ${candidatas.length} fichas + ${ciudades.size} listados de ciudad`);
const ok = await enParalelo(todas, (e) => esIndexable(e.loc));
const validas = todas.filter((_, i) => ok[i]);
const descartadas = todas.length - validas.length;
const por = (t) => validas.filter((e) => e.tipo === t && e.priority === '0.6').length;
console.log(`Válidas (200 + index + canonical propio): ${validas.length} · descartadas: ${descartadas}`);
console.log(`  growshops: ${por('growshops')} fichas · asociaciones: ${por('asociaciones')} fichas · listados de ciudad: ${validas.filter((e) => e.priority === '0.7').length}`);

if (DRY) process.exit(0);
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${validas.map((e) => `  <url><loc>${e.loc}</loc><lastmod>${e.lastmod}</lastmod><changefreq>monthly</changefreq><priority>${e.priority}</priority></url>`).join('\n')}
</urlset>
`;
await writeFile(join(OUT, 'sitemap-es.xml'), xml);
console.log(`✓ ${join(OUT, 'sitemap-es.xml')} (${validas.length} URLs)`);
