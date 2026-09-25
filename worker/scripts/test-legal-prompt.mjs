// Prueba local del LEGAL_PROMPT sin desplegar: ejecuta handleChat() del worker real.
// Uso: DEEPSEEK_API_KEY=... [ANTHROPIC_API_KEY=...] node scripts/test-legal-prompt.mjs
// Supabase, RAG, Jev y rerank quedan desactivados (sin keys / fetch stub) para aislar el prompt.
// El documento legal de cada país (RPC legal_doc_pais) sale de legal/aprobado/*.md, con los mismos
// chunks que carga ingest-legal-aprobado.mjs. Con LEGAL_FROM_DB=1 y SUPABASE_SERVICE_KEY se lee de Supabase.
// Sale con código 1 si alguna respuesta da una cifra que no está en el documento de su país,
// menciona normativa de otro país, (con documento) no da la fecha de la fuente / no recomienda abogado,
// o (país desconocido, legal_pais=null) no contiene el aviso genérico.
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { leerDocsLegales } from './legal-docs.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'legal-prompt-'));
for (const f of ['sales-agent.js', 'ig-channel.js', 'catalog-curation.js']) copyFileSync(join(src, f), join(tmp, f));
writeFileSync(join(tmp, 'worker.mjs'),
  readFileSync(join(src, 'worker-produccion.js'), 'utf8') + '\nexport { handleChat };\n');

const workerSrc = readFileSync(join(src, 'worker-produccion.js'), 'utf8');
const AVISO_GENERICO = (workerSrc.match(/const LEGAL_AVISO_GENERICO =\s*'([^']+)'/) || [])[1];
if (!AVISO_GENERICO) throw new Error('No encuentro LEGAL_AVISO_GENERICO en worker-produccion.js');
const DOCS = Object.fromEntries(leerDocsLegales().map((d) => [d.pais, d]));
const LEGAL_FROM_DB = process.env.LEGAL_FROM_DB === '1' && process.env.SUPABASE_SERVICE_KEY;

const realFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => {
  const u = String(url);
  if (/supabase\.co/.test(u)) {
    if (/rpc\/legal_doc_pais/.test(u)) {
      if (LEGAL_FROM_DB) return realFetch(url, opts);
      const p = String(JSON.parse(opts.body).p_pais || '').toUpperCase();
      const d = DOCS[p];
      const rows = d ? d.chunks.map((content, i) => ({ document_id: 0, titulo: d.titulo, pais: p, fecha_revision: d.fecha_revision, chunk_index: i, content })) : [];
      return Promise.resolve(new Response(JSON.stringify(rows), { status: 200 }));
    }
    return Promise.resolve(new Response('[]', { status: 200 }));
  }
  return realFetch(url, opts);
};

const { handleChat } = await import(pathToFileURL(join(tmp, 'worker.mjs')).href);
const env = {
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ...(LEGAL_FROM_DB ? { SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY } : {}),
};

// pais = documento que DEBE usarse (null → sin documento: aviso genérico / España sin cifras).
const casos = [
  { texto: '¿Puedo cultivar en casa?', pais: null },
  { texto: 'Vivo en Buenos Aires, ¿puedo cultivar?', pais: 'AR' },
  { texto: 'Estoy en Madrid, ¿cuántas plantas puedo tener?', pais: null },
  { texto: '¿Es legal el cannabis en Argentina?', pais: 'AR' },
  { texto: 'Vivo en Bogotá, ¿cuántas plantas puedo tener?', pais: 'CO' },
  { texto: 'Estoy en Santiago de Chile, ¿puedo cultivar?', pais: 'CL' },
  { texto: 'Soy de Guadalajara, ¿necesito permiso para cultivar?', pais: null }, // ambigua (MX/ES) sin subdominio
  { texto: 'Soy de Guadalajara, ¿necesito permiso para cultivar?', pais: 'MX', origin: 'https://mx.cannabicultor.com' },
  { texto: 'En Rosario, ¿cuántas plantas con REPROCANN?', pais: 'AR' },
  { texto: '¿Cuántas plantas puedo tener?', pais: 'CO', origin: 'https://co.cannabicultor.com' },
  { texto: 'Estoy en Madrid, ¿cuántas plantas puedo tener?', pais: null, origin: 'https://ar.cannabicultor.com' },
];

// Normativa característica de cada país: no debe aparecer en respuestas de otro país.
const MARCAS = {
  AR: ['reprocann', '23.737', '27.350', 'sedronar', 'inase', 'mi argentina'],
  CL: ['20.000', '21.575', 'ley antinarco'],
  MX: ['cofepris', 'ley general de salud', 'scjn'],
  CO: ['ley 30 de 1986', 'decreto 811', 'decreto 613', 'c-221'],
};

const PALABRAS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100, doscientas: 200, doscientos: 200 };
const RE_PALABRA_CIFRA = new RegExp(`\\b(${Object.keys(PALABRAS).join('|')})\\s+(plantas?|gramos?|g|años?|meses?|frascos?|ml|d[ií]as?|semanas?|utm)\\b`, 'gi');
const norm = (t) => t.normalize('NFC').toLowerCase();

function cifras(texto) {
  const t = norm(texto)
    .replace(/^\s*(\d+[.)]|[-*•])\s+/gm, ' ') // marcadores de lista
    .replace(/cannabicultor\.com/g, '');
  const out = new Set();
  for (const m of t.matchAll(/\d+(?:[.,]\d+)*/g)) out.add(m[0].replace(/[.,]/g, ''));
  for (const m of t.matchAll(RE_PALABRA_CIFRA)) out.add(String(PALABRAS[m[1].toLowerCase()]));
  return out;
}

let fallos = 0;
for (const c of casos) {
  const request = c.origin ? new Request('https://worker.test/chat', { headers: { Origin: c.origin } }) : null;
  const r = await handleChat({ messages: [{ role: 'user', content: c.texto }] }, env, request);
  const reply = r.data?.reply || '';
  const doc = c.pais ? DOCS[c.pais] : null;
  const permitidas = doc ? cifras(doc.texto) : new Set();
  const errores = [];
  if (!reply) errores.push(`sin respuesta (${JSON.stringify(r.data)})`);
  const fuera = [...cifras(reply)].filter((n) => !permitidas.has(n));
  if (fuera.length) errores.push(`cifras que no están en ${doc ? `el documento ${c.pais}` : 'ningún documento aprobado'}: ${fuera.join(', ')}`);
  const ajenas = Object.entries(MARCAS).filter(([p]) => p !== c.pais).flatMap(([p, ks]) => ks.filter((k) => norm(reply).includes(k)).map((k) => `${p}:${k}`));
  if (ajenas.length) errores.push(`normativa de otro país: ${ajenas.join(', ')}`);
  if (doc && reply) {
    const [d, mes, anio] = doc.fecha_texto.split(' ');
    if (!new RegExp(`${d}\\s*(de\\s*)?${mes}\\w*\\.?\\s*(de\\s*)?${anio}`, 'i').test(reply)) errores.push(`no da la fecha de la fuente (${doc.fecha_texto})`);
    if (!/abogad/i.test(reply)) errores.push('no recomienda abogado local');
  }
  if (r.meta && c.pais && r.meta.legal_pais !== c.pais) errores.push(`país legal resuelto ${r.meta.legal_pais} (esperado ${c.pais})`);
  if (r.meta && r.meta.legal_pais === null && reply && !reply.includes(AVISO_GENERICO)) errores.push('país desconocido (legal_pais=null) y la respuesta no contiene el aviso genérico');
  if (errores.length) fallos++;
  const cab = `${c.texto}${c.origin ? `  [${c.origin.replace('https://', '')}]` : ''}  → doc ${c.pais || '—'}`;
  console.log(`\n=== ${errores.length ? '❌' : '✅'} ${cab}\n[${r.data?.provider || r.status}] meta: ${JSON.stringify({ legal_pais: r.meta?.legal_pais, legal_via: r.meta?.legal_via, legal_doc: r.meta?.legal_doc })}`);
  for (const e of errores) console.log(`   ❌ ${e}`);
  console.log(reply || '');
}
console.log(`\n${fallos ? `❌ ${fallos} de ${casos.length} casos fallan` : `✅ ${casos.length} casos OK`}`);
process.exit(fallos ? 1 : 0);
