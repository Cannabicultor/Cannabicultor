// Documentos legales aprobados por país (legal/aprobado/<pais>.md).
// Lo usan ingest-legal-aprobado.mjs (carga al RAG) y test-legal-prompt.mjs (stub de Supabase),
// así el test ve exactamente los mismos chunks que se cargan en kb_chunks.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const LEGAL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'legal', 'aprobado');
export const CHUNK_MAX = 1400;
export const sha256 = (t) => createHash('sha256').update(t, 'utf8').digest('hex');

// Párrafos (bloques separados por línea en blanco) agrupados hasta CHUNK_MAX, SIN solape:
// concatenar los chunks en orden reconstruye el documento completo.
export function chunkLegal(texto) {
  const parrafos = texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let buf = '';
  for (const p of parrafos) {
    const cand = buf ? `${buf}\n\n${p}` : p;
    if (cand.length <= CHUNK_MAX || !buf) buf = cand;
    else { chunks.push(buf); buf = p; }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

const MESES = { ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06', jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12' };

export function leerDocLegal(file) {
  const texto = readFileSync(join(LEGAL_DIR, file), 'utf8').trim();
  const pais = (texto.match(/^\*\*País:\*\*\s*([A-Z]{2})\s*$/m) || [])[1];
  const titulo = (texto.match(/^#\s+(.+)$/m) || [])[1];
  const f = texto.match(/^\*\*Estado:\*\*\s*Aprobado por revisión jurídica — (\d{1,2}) ([a-z]{3}) (\d{4})\s*$/m);
  if (!pais || !titulo || !f || !MESES[f[2]]) throw new Error(`${file}: falta País, título o línea "Aprobado por revisión jurídica — <fecha>"`);
  if (/borrador|verificar/i.test(texto)) throw new Error(`${file}: contiene "borrador" o "verificar"; no se carga`);
  const fecha_revision = `${f[3]}-${MESES[f[2]]}-${f[1].padStart(2, '0')}`;
  return { file, pais, titulo, fecha_revision, fecha_texto: `${f[1]} ${f[2]} ${f[3]}`, texto, chunks: chunkLegal(texto) };
}

export function leerDocsLegales() {
  return readdirSync(LEGAL_DIR).filter((f) => /^[a-z]{2}\.md$/.test(f)).sort().map(leerDocLegal);
}
