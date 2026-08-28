#!/usr/bin/env node
/**
 * investigar.mjs — Agente de investigación semanal del RAG (Cannabicultor).
 *
 * Corre la lista de queries (queries.mjs) usando la web_search tool de Claude,
 * filtra spam/comercial, deduplica contra kb_candidates (url) y kb_documents
 * (título difuso), y guarda lo nuevo en kb_candidates con estado='pendiente'.
 *
 * NO descarga el contenido real de ninguna fuente: solo guarda metadatos para
 * tu revisión. La descarga ocurre en preparar-ingesta.mjs, tras tu aprobación.
 *
 * Claves: se cargan solas desde ~/cannabicultor/.env (DATABASE_URL + ANTHROPIC_API_KEY).
 *
 * Uso:
 *   node pipeline/research/investigar.mjs
 *   DRY_RUN=1 LIMIT=3 node pipeline/research/investigar.mjs   # prueba sin escribir
 */

import { QUERIES, EXCLUIR_DOMINIOS, DOMINIOS_AUTORIDAD } from './queries.mjs';
import { cargarEnv, q, cerrar } from './lib-db.mjs';

cargarEnv();

const ANT_KEY   = process.env.ANTHROPIC_API_KEY;
const MODEL     = process.env.MODEL || 'claude-sonnet-4-6';
const DRY_RUN   = process.env.DRY_RUN === '1';
const LIMIT     = process.env.LIMIT ? Number(process.env.LIMIT) : QUERIES.length;
const POR_QUERY = Number(process.env.POR_QUERY || 4);
const DELAY_MS  = Number(process.env.DELAY_MS || 1200);

if (!ANT_KEY) { console.error('Falta ANTHROPIC_API_KEY (revisa ~/cannabicultor/.env)'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

function normalizarUrl(u) {
  try {
    const url = new URL(u);
    let s = (url.host + url.pathname).toLowerCase();
    return s.replace(/^www\./, '').replace(/\/+$/, '');
  } catch { return (u || '').toLowerCase().trim(); }
}
function hostDe(u) { try { return new URL(u).host.toLowerCase(); } catch { return ''; } }
function esExcluido(u) { const h = hostDe(u); return EXCLUIR_DOMINIOS.some(d => h.includes(d)); }
function bonusAutoridad(u) { const h = hostDe(u); return DOMINIOS_AUTORIDAD.some(d => h.includes(d)) ? 1 : 0; }

async function buscarQuery({ q: consulta, categoria }) {
  const prompt =
`Eres un bibliotecario científico especializado en cannabis. Busca en la web fuentes de ALTA AUTORIDAD para esta consulta y devuélveme las mejores.

Consulta: "${consulta}"
Categoría: ${categoria}

Prioriza (en este orden): papers académicos y revisiones (PubMed/PMC, Frontiers, MDPI, Journal of Cannabis Research, Nature, ScienceDirect), informes de organismos, libros y guías técnicas educativas con autoría identificable.
DESCARTA: tiendas, contenido puramente publicitario, foros sin moderación, páginas sin autor.

Tras buscar, responde ÚNICAMENTE con un array JSON (sin texto alrededor, sin markdown) de hasta ${POR_QUERY} objetos con EXACTAMENTE estas claves:
[{
  "url": "https://...",
  "titulo": "título real del documento",
  "autores": "autor(es) o organización, o null",
  "anio": 2023,
  "tipo": "Paper|Libro|Guia|Blog tecnico|Informe|Revision",
  "fuente": "revista/organización/sitio",
  "resumen": "2-3 líneas en español sobre de qué trata y por qué es útil para cultivo de cannabis",
  "calidad": 4
}]
Si no encuentras nada de calidad suficiente, responde [].`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANT_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) { console.error(`  ⚠ API ${res.status}: ${(await res.text()).slice(0, 200)}`); return []; }
  const data = await res.json();
  const texto = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  const m = texto.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try { const arr = JSON.parse(m[0]); return Array.isArray(arr) ? arr : []; } catch { return []; }
}

async function main() {
  console.log(`\n🔎 Investigación semanal — ${new Date().toISOString().slice(0,10)}`);
  console.log(`   Queries: ${LIMIT}/${QUERIES.length}${DRY_RUN ? '  [DRY_RUN]' : ''}\n`);

  const urlsVistas = new Set();
  let titulosKb = [];
  if (!DRY_RUN) {
    for (const r of await q('select url_normalizada from kb_candidates where url_normalizada is not null'))
      urlsVistas.add(r.url_normalizada);
    for (const d of await q("select archivo, coalesce(libro_propuesto,'') lp from kb_documents"))
      titulosKb.push(`${d.archivo} ${d.lp}`.toLowerCase());
  }

  const nuevos = [];
  let dupUrl = 0, dupKb = 0, excluidos = 0, bajaCalidad = 0;

  for (const item of QUERIES.slice(0, LIMIT)) {
    console.log(`• ${item.q}`);
    let resultados = [];
    try { resultados = await buscarQuery(item); }
    catch (e) { console.error(`  ⚠ ${e.message}`); }

    for (const r of resultados) {
      if (!r.url) continue;
      if (esExcluido(r.url)) { excluidos++; continue; }
      const norm = normalizarUrl(r.url);
      if (urlsVistas.has(norm)) { dupUrl++; continue; }
      const calidad = Math.min(5, (Number(r.calidad) || 3) + bonusAutoridad(r.url));
      if (calidad < 3) { bajaCalidad++; continue; }
      const tituloLc = (r.titulo || '').toLowerCase();
      if (tituloLc.length > 12 && titulosKb.some(t => t.includes(tituloLc))) { dupKb++; continue; }

      urlsVistas.add(norm);
      nuevos.push({
        url: r.url, url_normalizada: norm, titulo: r.titulo || null,
        autores: r.autores || null, anio: Number.isInteger(r.anio) ? r.anio : null,
        tipo: r.tipo || null, fuente: r.fuente || null, resumen: r.resumen || null,
        query_origen: item.q, categoria: item.categoria, calidad,
        metadata: JSON.stringify({ modelo: MODEL }),
      });
      console.log(`    ✓ [${calidad}] ${r.titulo || r.url}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n── Resumen ──`);
  console.log(`  Nuevos candidatos:     ${nuevos.length}`);
  console.log(`  Duplicados (url):      ${dupUrl}`);
  console.log(`  Duplicados (kb_docs):  ${dupKb}`);
  console.log(`  Excluidos (comercial): ${excluidos}`);
  console.log(`  Baja calidad (<3):     ${bajaCalidad}`);

  if (DRY_RUN) {
    console.log('\n[DRY_RUN] No se insertó nada. Muestra:');
    console.log(JSON.stringify(nuevos.slice(0, 5).map(({metadata, ...r}) => r), null, 2));
    return;
  }
  if (!nuevos.length) { console.log('\nNada nuevo que guardar.'); return; }

  let insertados = 0;
  for (const c of nuevos) {
    const rows = await q(
      `insert into kb_candidates
         (url, url_normalizada, titulo, autores, anio, tipo, fuente, resumen,
          query_origen, categoria, calidad, estado, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pendiente',$12::jsonb)
       on conflict (url) do nothing
       returning id`,
      [c.url, c.url_normalizada, c.titulo, c.autores, c.anio, c.tipo, c.fuente,
       c.resumen, c.query_origen, c.categoria, c.calidad, c.metadata]
    );
    if (rows.length) insertados++;
  }
  console.log(`\n✅ ${insertados} guardados en kb_candidates (estado=pendiente). Revísalos y aprueba.`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(cerrar);
