// Quita el estado 'ok' a los textos SEO ya generados que contengan afirmaciones
// explicativas externas a la ficha (RELLENO de gen-seo-text.mjs: "lo que implica…",
// "no requiere eliminar machos", "fotoperiodo", "recomendada para…", "genética americana"…).
// Pone seo_text_status/seo_text_batch a NULL para que gen-seo-text.mjs los regenere con el
// prompt y los filtros actuales. No toca `indexable` ni borra el texto (queda para depurar).
//
// Uso (desde el Mac):  cd worker && set -a && . ../.env && set +a
//   node scripts/reset-seo-frases.mjs            # SIMULACIÓN: lista y cuenta, no escribe
//   node scripts/reset-seo-frases.mjs --apply    # escribe
// Guarda los ids afectados en reset-seo-frases-<fecha>.json (para poder revisarlos).
import { writeFileSync } from 'node:fs';
import { RELLENO } from './gen-seo-text.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gfyrsrdnvgnhtsuexjkb.supabase.co';
const { SUPABASE_SERVICE_KEY: K } = process.env;
if (!K) { console.error('Falta SUPABASE_SERVICE_KEY'); process.exit(1); }
const APPLY = process.argv.includes('--apply');
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };

const rows = [];
for (let o = 0; ; o += 1000) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/variedades?select=id,nombre,seo_text_batch,seo_description_text&seo_text_status=eq.ok&order=id.asc&limit=1000&offset=${o}`, { headers: H });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 300));
  rows.push(...j);
  if (j.length < 1000) break;
}
const afectadas = rows.filter((r) => RELLENO.test(r.seo_description_text || ''));
console.log(`Textos 'ok': ${rows.length} · con frases externas: ${afectadas.length}${APPLY ? '' : ' (SIMULACIÓN)'}`);
for (const r of afectadas.slice(0, 5)) {
  const m = r.seo_description_text.match(RELLENO); const i = r.seo_description_text.indexOf(m[0]);
  console.log(`  · #${r.id} ${r.nombre}: …${r.seo_description_text.slice(Math.max(0, i - 30), i + 60)}…`);
}
const fichero = `reset-seo-frases-${new Date().toISOString().slice(0, 10)}.json`;
if (!APPLY) { console.log('Nada escrito. Añade --apply para limpiar.'); process.exit(0); }
writeFileSync(fichero, JSON.stringify(afectadas.map((r) => ({ id: r.id, nombre: r.nombre, lote: r.seo_text_batch }))));
let n = 0;
for (const r of afectadas) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/variedades?id=eq.${r.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ seo_text_status: null, seo_text_batch: null }) });
  if (!res.ok) throw new Error(`PATCH ${r.id}: ${res.status} ${await res.text()}`);
  n++;
}
console.log(`✓ ${n} textos devueltos a la cola de generación. Ids guardados en ${fichero}`);
