// lib-chunk.mjs — Réplica en JS del chunker de pipeline/kb/lib/chunker.py.
// Mantener sincronizado: mismos parámetros => chunks web consistentes con el catálogo.
import { createHash } from 'node:crypto';

export const CHUNK_SIZE = 1400;
export const OVERLAP = 200;
export const MIN_CHUNK_CHARS = 120;

export const sha256 = t => createHash('sha256').update(t, 'utf8').digest('hex');
const tokenEstimate = t => Math.max(1, Math.floor(t.length / 4));

function splitParagraphs(text) {
  return text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
}

function mergeUnits(units, chunkSize) {
  const merged = [];
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    const t = buf.join('\n\n').trim();
    if (t) merged.push(t);
    buf = [];
  };
  for (const text of units) {
    const candidate = buf.length ? [...buf, text].join('\n\n').trim() : text;
    if (candidate.length <= chunkSize) {
      buf.push(text);
    } else {
      if (buf.length) flush();
      if (text.length <= chunkSize) {
        buf = [text];
      } else {
        const sentences = text.split(/(?<=[.!?])\s+/);
        let sub = [];
        for (const sent of sentences) {
          const sc = [...sub, sent].join(' ').trim();
          if (sc.length <= chunkSize) sub.push(sent);
          else { if (sub.length) merged.push(sub.join(' ')); sub = [sent]; }
        }
        if (sub.length) merged.push(sub.join(' '));
      }
    }
  }
  flush();
  return merged;
}

// Devuelve [{ chunk_index, content, char_count, token_estimate, content_sha256 }]
export function chunkText(fullText) {
  const units = splitParagraphs(fullText);
  if (!units.length) return [];
  const blocks = mergeUnits(units, CHUNK_SIZE);
  if (!blocks.length) return [];

  const chunks = [];
  let prevTail = '';
  for (let i = 0; i < blocks.length; i++) {
    let content = blocks[i];
    if (prevTail && i > 0) content = `${prevTail}\n\n${blocks[i]}`.trim();
    if (content.length < MIN_CHUNK_CHARS && i < blocks.length - 1) {
      prevTail = content.length > OVERLAP ? content.slice(-OVERLAP).trim() : content;
      continue;
    }
    chunks.push({
      chunk_index: chunks.length,
      content,
      char_count: content.length,
      token_estimate: tokenEstimate(content),
      content_sha256: sha256(content),
    });
    prevTail = content.length > OVERLAP ? content.slice(-OVERLAP).trim() : '';
  }
  if (!chunks.length && blocks.length) {
    const t = blocks[0];
    chunks.push({ chunk_index: 0, content: t, char_count: t.length,
      token_estimate: tokenEstimate(t), content_sha256: sha256(t) });
  }
  return chunks;
}
