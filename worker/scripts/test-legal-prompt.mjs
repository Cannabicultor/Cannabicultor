// Prueba local del LEGAL_PROMPT sin desplegar: ejecuta handleChat() del worker real.
// Uso: DEEPSEEK_API_KEY=... [ANTHROPIC_API_KEY=...] node scripts/test-legal-prompt.mjs
// Supabase, RAG, Jev y rerank quedan desactivados (sin keys / fetch stub) para aislar el prompt.
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'legal-prompt-'));
for (const f of ['sales-agent.js', 'ig-channel.js', 'catalog-curation.js']) copyFileSync(join(src, f), join(tmp, f));
writeFileSync(join(tmp, 'worker.mjs'),
  readFileSync(join(src, 'worker-produccion.js'), 'utf8') + '\nexport { handleChat };\n');

const realFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => {
  const u = String(url);
  if (/supabase\.co/.test(u)) return Promise.resolve(new Response('[]', { status: 200 }));
  return realFetch(url, opts);
};

const { handleChat } = await import(pathToFileURL(join(tmp, 'worker.mjs')).href);
const env = {
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};

const casos = [
  '¿Puedo cultivar en casa?',
  'Vivo en Buenos Aires, ¿puedo cultivar?',
  'Estoy en Madrid, ¿cuántas plantas puedo tener?',
  '¿Es legal el cannabis en Argentina?',
];
for (const texto of casos) {
  const r = await handleChat({ messages: [{ role: 'user', content: texto }] }, env);
  const reply = r.data?.reply || '';
  const numeros = reply.match(/\d+|\b(una?|dos|tres|cuatro|cinco|seis|diez|pocas)\s+(plantas?|gramos?|euros?)\b/gi);
  console.log(`\n=== ${texto}\n[${r.data?.provider || r.status}]${numeros ? `  ⚠ NÚMEROS: ${numeros.join(', ')}` : ''}\n${reply || JSON.stringify(r.data)}`);
}
