#!/usr/bin/env node
/**
 * preparar-ingesta.mjs — Ingesta de candidatos APROBADOS hacia el RAG.
 *
 * Lee kb_candidates con estado='aprobado' y usado_en_rag=false, descarga el
 * contenido REAL (solo ahora, tras tu aprobación), y:
 *   - HTML -> extrae texto, chunkea (mismos parámetros que el pipeline Python),
 *             inserta en kb_documents + kb_chunks SIN embeddings, marca
 *             usado_en_rag=true / estado='ingerido'.
 *   - PDF  -> lo descarga a research/kb/pdfs/ y te imprime el comando del
 *             pipeline Python (no reinventa la extracción de PDF).
 *
 * ⚠ Los chunks se insertan SIN embeddings. Para que match_chunks los devuelva
 *    hay que correr el paso de embeddings Voyage que ya usas.
 *
 * Claves: se cargan solas desde ~/cannabicultor/.env (DATABASE_URL).
 *
 * Uso:
 *   node pipeline/research/preparar-ingesta.mjs
 *   LIMIT=5 node ...      # como máximo 5
 *   DRY_RUN=1 node ...    # no descarga ni inserta; lista lo que haría
 */

import { load as cheerioLoad } from 'cheerio';
import { chunkText, sha256 } from './lib-chunk.mjs';
import { cargarEnv, q, cerrar } from './lib-db.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

cargarEnv();
const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT   = process.env.LIMIT ? Number(process.env.LIMIT) : 20;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PDF_DIR = process.env.KB_PDF_DIR || path.join(REPO_ROOT, 'research', 'kb', 'pdfs');

const slug = s => (s || 'doc').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'doc';

async function descargar(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'CannabicultorKB/1.0' } });
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const buf = Buffer.from(await res.arrayBuffer());
  return { ok: res.ok, status: res.status, ct, buf };
}

function extraerTextoHtml(html) {
  const $ = cheerioLoad(html);
  $('script, style, nav, header, footer, aside, noscript, form').remove();
  const root = $('article').length ? $('article') : ($('main').length ? $('main') : $('body'));
  const titulo = ($('h1').first().text() || $('title').text() || '').trim();
  const bloques = [];
  root.find('h1,h2,h3,h4,p,li,blockquote,pre').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t.length > 2) bloques.push(t);
  });
  return { titulo, texto: bloques.join('\n\n') };
}

async function nextCatalogNum() {
  const rows = await q('select coalesce(max(catalog_num),0) m from kb_documents');
  return Math.max(900000, (rows[0]?.m || 0) + 1); // 900000+ = fuentes web
}

async function ingestarHtml(cand, texto, titulo) {
  const chunks = chunkText(texto);
  if (!chunks.length) return { ok: false, motivo: 'sin texto util' };

  const catalog_num = await nextCatalogNum();
  const idioma = cand.metadata?.idioma || 'es';
  const drive_file_id = `web:${sha256(cand.url).slice(0, 24)}`;
  const archivo = `${slug(titulo || cand.titulo)}.html`;
  const libro = `Web · ${cand.categoria || 'General'}`;
  const tags = cand.categoria ? [cand.categoria.toLowerCase()] : [];

  const docRows = await q(
    `insert into kb_documents
       (catalog_num, archivo, drive_file_id, link_drive, idioma_contenido, incluir_en_kb,
        peso_prioridad_retrieval, libro_propuesto, tema_cluster, tipo_documento, nivel_evidencia,
        tags, estado_ingesta, calidad_extraccion, text_char_count, chunk_count, content_sha256,
        catalog_snapshot, ingested_at)
     values ($1,$2,$3,$4,$5,'sí',2,$6,$7,$8,$9,$10,'chunked','buena',$11,$12,$13,$14::jsonb, now())
     on conflict (drive_file_id) do update set
        chunk_count = excluded.chunk_count, text_char_count = excluded.text_char_count,
        content_sha256 = excluded.content_sha256, estado_ingesta = 'chunked', ingested_at = now()
     returning id`,
    [catalog_num, archivo, drive_file_id, cand.url, idioma, libro, cand.categoria || null,
     cand.tipo || 'Web', cand.calidad ? `calidad_${cand.calidad}` : null, tags,
     texto.length, chunks.length, sha256(texto),
     JSON.stringify({ origen: 'kb_candidates', url: cand.url, titulo: cand.titulo,
                      autores: cand.autores, anio: cand.anio, fuente: cand.fuente })]
  );
  const docId = docRows[0].id;

  await q('delete from kb_chunks where document_id=$1', [docId]);
  for (const c of chunks) {
    await q(
      `insert into kb_chunks
         (document_id, chunk_index, content, content_sha256, char_count, token_estimate,
          page_start, page_end, idioma_contenido, peso_prioridad_retrieval,
          libro_propuesto, tema_cluster, tags, metadata)
       values ($1,$2,$3,$4,$5,$6,1,1,$7,2,$8,$9,$10,$11::jsonb)`,
      [docId, c.chunk_index, c.content, c.content_sha256, c.char_count, c.token_estimate,
       idioma, libro, cand.categoria || null, tags, JSON.stringify({ url: cand.url })]
    );
  }

  await q(
    `update kb_candidates set estado='ingerido', usado_en_rag=true, kb_document_id=$1, revisado_en=now()
     where id=$2`, [docId, cand.id]);

  return { ok: true, chunks: chunks.length, doc_id: docId };
}

async function main() {
  const cands = await q(
    `select * from kb_candidates
     where estado='aprobado' and usado_en_rag=false
     order by calidad desc nulls last limit $1`, [LIMIT]);
  if (!cands.length) { console.log('No hay candidatos aprobados pendientes de ingesta.'); return; }

  console.log(`\n📥 ${cands.length} candidato(s) aprobado(s)${DRY_RUN ? '  [DRY_RUN]' : ''}\n`);
  const pdfsParaPython = [];

  for (const c of cands) {
    console.log(`• ${c.titulo || c.url}`);
    if (DRY_RUN) { console.log(`    (dry-run) ${c.url}`); continue; }

    let dl;
    try { dl = await descargar(c.url); }
    catch (e) { console.log(`    ⚠ descarga falló: ${e.message}`); continue; }
    if (!dl.ok) { console.log(`    ⚠ HTTP ${dl.status}`); continue; }

    const esPdf = dl.ct.includes('pdf') || c.url.toLowerCase().endsWith('.pdf');
    if (esPdf) {
      await mkdir(PDF_DIR, { recursive: true });
      const fname = `${slug(c.titulo || c.url)}.pdf`;
      await writeFile(path.join(PDF_DIR, fname), dl.buf);
      pdfsParaPython.push(fname);
      console.log(`    📄 PDF -> research/kb/pdfs/${fname} (ingesta vía pipeline Python)`);
      continue;
    }

    const { titulo, texto } = extraerTextoHtml(dl.buf.toString('utf8'));
    if (texto.length < 400) { console.log(`    ⚠ poco texto (${texto.length} chars), déjalo para revisión manual`); continue; }
    const r = await ingestarHtml(c, texto, titulo);
    if (r.ok) console.log(`    ✅ ${r.chunks} chunks -> kb_documents #${r.doc_id} (SIN embedding aún)`);
    else console.log(`    ⚠ ${r.motivo}`);
  }

  if (pdfsParaPython.length) {
    console.log(`\n── PDFs para el pipeline Python (extracción + chunk) ──`);
    console.log(`  Alta manual en el catálogo y luego ./pipeline/run-kb-ingest.sh --mode=extract (y --mode=chunk):`);
    pdfsParaPython.forEach(f => console.log(`   · ${f}`));
  }
  console.log(`\n⚠ Recuerda: los chunks HTML se insertaron SIN embeddings.`);
  console.log(`   Corre tu paso de embeddings Voyage para que match_chunks los devuelva.`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(cerrar);
