// Carga legal/aprobado/<pais>.md al RAG (kb_documents + kb_chunks con embeddings Voyage).
// Ejecutar desde el Mac (api.voyageai.com no es accesible desde el entorno cloud):
//   cd worker && SUPABASE_SERVICE_KEY=... VOYAGE_API_KEY=... node scripts/ingest-legal-aprobado.mjs
//   DRY_RUN=1 ... → verifica modelo y muestra los chunks sin escribir nada.
// Requiere la migración sql/legal_aprobado_pais.sql (columnas pais / fecha_revision, legal_doc_pais).
// 1) Verifica que voyage-multilingual-2 reproduce los embeddings ya guardados (coseno ≥ 0.99).
// 2) Upsert del documento por catalog_num (único real; 9100NN fijo por país), borra sus chunks y los reinserta.
//    drive_file_id solo tiene un índice único parcial, que PostgREST no admite en on_conflict.
import { leerDocsLegales, sha256 } from './legal-docs.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gfyrsrdnvgnhtsuexjkb.supabase.co';
const { SUPABASE_SERVICE_KEY: SB_KEY, VOYAGE_API_KEY, DRY_RUN } = process.env;
const MODEL = 'voyage-multilingual-2';
const DIMS = 1024;
const MIN_COS = 0.99;
const CATALOG_BASE = 910000; // AR 910001, CL 910002, MX 910003, CO 910004
const CATALOG_NUM = { AR: 1, CL: 2, MX: 3, CO: 4 };

if (!SB_KEY || !VOYAGE_API_KEY) { console.error('Faltan SUPABASE_SERVICE_KEY y/o VOYAGE_API_KEY'); process.exit(1); }

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Supabase ${method} ${path}: ${res.status} ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : null;
}

async function embed(textos, inputType) {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VOYAGE_API_KEY}` },
    body: JSON.stringify({ model: MODEL, input: textos, ...(inputType ? { input_type: inputType } : {}) }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

const cos = (a, b) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / Math.sqrt(na * nb);
};

// 1) Verificación del modelo contra embeddings ya guardados (conocimiento universal, en español).
async function verificarModelo() {
  const muestra = await sb('kb_chunks?select=id,content,embedding&embedding=not.is.null&idioma_contenido=eq.es&order=id.asc&limit=4');
  if (!muestra?.length) throw new Error('No hay chunks con embedding para comparar');
  const guardados = muestra.map((r) => (typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding));
  if (guardados.some((e) => e.length !== DIMS)) throw new Error(`Los embeddings guardados no son de ${DIMS} dims`);
  for (const inputType of ['document', null]) {
    const nuevos = await embed(muestra.map((r) => r.content), inputType);
    const sims = nuevos.map((e, i) => cos(e, guardados[i]));
    console.log(`  input_type=${inputType ?? '(ninguno)'} · coseno vs guardados: ${sims.map((s) => s.toFixed(4)).join(', ')}`);
    if (nuevos[0].length === DIMS && sims.every((s) => s >= MIN_COS)) return inputType;
  }
  throw new Error(`${MODEL} no reproduce los embeddings guardados (coseno < ${MIN_COS}). No se inserta nada.`);
}

async function cargarDoc(doc, inputType) {
  const catalog_num = CATALOG_BASE + CATALOG_NUM[doc.pais];
  if (!CATALOG_NUM[doc.pais]) throw new Error(`${doc.file}: país ${doc.pais} sin catalog_num asignado`);
  const embeddings = await embed(doc.chunks, inputType);
  if (embeddings.some((e) => e.length !== DIMS)) throw new Error('Dimensión inesperada');
  if (DRY_RUN) {
    console.log(`  [DRY_RUN] ${doc.pais}: ${doc.chunks.length} chunks (${doc.chunks.map((c) => c.length).join(', ')} car.) · revisión ${doc.fecha_revision}`);
    return;
  }
  // Seguridad: si catalog_num ya lo usa otro documento que no es el legal de este país, no se toca.
  const previo = await sb(`kb_documents?catalog_num=eq.${catalog_num}&select=id,tipo_documento,pais`);
  if (previo.length && (previo[0].tipo_documento !== 'legal_aprobado' || previo[0].pais !== doc.pais)) {
    throw new Error(`${doc.pais}: catalog_num ${catalog_num} ya lo usa kb_documents #${previo[0].id} (${previo[0].tipo_documento}); no se sobrescribe`);
  }
  const [row] = await sb('kb_documents?on_conflict=catalog_num', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: [{
      catalog_num, archivo: `legal/aprobado/${doc.file}`, drive_file_id: `legal:${doc.pais.toLowerCase()}`,
      idioma_contenido: 'es', politica_idioma: 'priorizar_es', factor_idioma_retrieval: 1.0,
      incluir_en_kb: 'si_prioridad', peso_prioridad_retrieval: 10,
      libro_propuesto: doc.titulo, tema_cluster: 'Legal', tipo_documento: 'legal_aprobado',
      nivel_evidencia: 'revision_juridica', tags: ['legal', doc.pais],
      pais: doc.pais, fecha_revision: doc.fecha_revision,
      estado_ingesta: 'chunked', calidad_extraccion: 'buena',
      text_char_count: doc.texto.length, chunk_count: doc.chunks.length, content_sha256: sha256(doc.texto),
      catalog_snapshot: { titulo: doc.titulo, origen: 'legal_aprobado', fuente: `legal/aprobado/${doc.file}`, fecha_revision: doc.fecha_revision },
    }],
  });
  await sb(`kb_chunks?document_id=eq.${row.id}`, { method: 'DELETE' });
  await sb('kb_chunks', {
    method: 'POST', prefer: 'return=minimal',
    body: doc.chunks.map((content, i) => ({
      document_id: row.id, chunk_index: i, content, content_sha256: sha256(content),
      char_count: content.length, token_estimate: Math.max(1, Math.floor(content.length / 4)),
      idioma_contenido: 'es', politica_idioma: 'priorizar_es', factor_idioma_retrieval: 1.0, peso_prioridad_retrieval: 10,
      libro_propuesto: doc.titulo, tema_cluster: 'Legal', tags: ['legal', doc.pais],
      metadata: { pais: doc.pais, fecha_revision: doc.fecha_revision, tipo: 'legal_aprobado', embedding_model: MODEL },
      embedding: JSON.stringify(embeddings[i]),
    })),
  });
  await sb(`kb_documents?id=eq.${row.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { estado_ingesta: 'embedded', ingested_at: new Date().toISOString() } });
  const check = await sb('rpc/legal_doc_pais', { method: 'POST', body: { p_pais: doc.pais } });
  if (check.length !== doc.chunks.length) throw new Error(`${doc.pais}: legal_doc_pais devuelve ${check.length} chunks, esperados ${doc.chunks.length}`);
  console.log(`  ✅ ${doc.pais}: kb_documents #${row.id} · ${doc.chunks.length} chunks con embedding · revisión ${doc.fecha_revision}`);
}

const docs = leerDocsLegales();
console.log(`Documentos: ${docs.map((d) => `${d.pais} (${d.chunks.length} chunks)`).join(', ')}`);
console.log('1) Verificando modelo de embeddings…');
const inputType = await verificarModelo();
console.log(`   OK: ${MODEL}, ${DIMS} dims, input_type=${inputType ?? '(ninguno)'}`);
console.log(`2) ${DRY_RUN ? 'Simulando carga' : 'Cargando'}…`);
for (const d of docs) await cargarDoc(d, inputType);
console.log(DRY_RUN ? 'DRY_RUN: no se ha escrito nada.' : 'Hecho.');
