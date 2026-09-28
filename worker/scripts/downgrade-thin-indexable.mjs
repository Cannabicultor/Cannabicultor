// Fichas indexable=true con <6 señales (thin content que gen-seo-text.mjs nunca
// toca, porque solo procesa candidatas con >=6 señales): las pasa a
// indexable=false (noindex,follow), respaldando antes el valor anterior en
// seo_indexable_backup. No toca seo_description_text/seo_text_status — estas
// fichas nunca tuvieron texto generado.
//
// Reversible como cualquier otro lote: node scripts/rollback-seo-batch.mjs <batch_id>
//
// Después de correr esto:
//   1. node prerender/build.mjs --variedades --breeders   (regenera páginas + sitemap-strains.xml)
//   2. desplegar el resultado por cPanel, como siempre
//
// Uso (desde el Mac):
//   cd worker
//   SUPABASE_SERVICE_KEY=... node scripts/downgrade-thin-indexable.mjs --dry-run
//   SUPABASE_SERVICE_KEY=... node scripts/downgrade-thin-indexable.mjs
//
// Flags:
//   --dry-run       no escribe nada; solo cuenta y lista una muestra
//   --limit=N       tope de fichas a procesar (por defecto: todas las candidatas)
//   --min-senales=N umbral de señales (por defecto 6, igual que gen-seo-text.mjs)

import { randomUUID } from 'node:crypto';
import { countSenales } from './seo-signals.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gfyrsrdnvgnhtsuexjkb.supabase.co';
const { SUPABASE_SERVICE_KEY: SB_KEY } = process.env;

const args = process.argv.slice(2);
const hasFlag = (n) => args.includes(`--${n}`);
const flagVal = (n) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const DRY_RUN = hasFlag('dry-run');
const LIMIT = flagVal('limit') ? parseInt(flagVal('limit'), 10) : Infinity;
const MIN_SENALES = flagVal('min-senales') ? parseInt(flagVal('min-senales'), 10) : 6;

if (!SB_KEY) { console.error('Falta SUPABASE_SERVICE_KEY'); process.exit(1); }

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Supabase ${method} ${path}: ${res.status} ${txt.slice(0, 400)}`);
  return txt ? JSON.parse(txt) : null;
}

const CAMPOS = 'id,nombre,slug,tipo,tipo_semilla,thc_pct,thc_max,terpenos,aromas,efecto,efectos,floracion_dias,genetica,descripcion,indexable';

async function fetchIndexablesTrue() {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const page = await sb(`variedades?select=${CAMPOS}&indexable=is.true&order=id.asc&limit=${pageSize}&offset=${from}`);
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function main() {
  const batchId = `thin-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
  console.log(`▸ downgrade-thin-indexable · lote ${batchId}${DRY_RUN ? ' (DRY RUN)' : ''}`);

  const indexablesHoy = await fetchIndexablesTrue();
  const finas = indexablesHoy.filter((v) => countSenales(v) < MIN_SENALES).slice(0, LIMIT);
  console.log(`  indexable=true en total: ${indexablesHoy.length}`);
  console.log(`  con <${MIN_SENALES} señales (a pasar a noindex,follow): ${finas.length}`);

  if (DRY_RUN) {
    for (const v of finas.slice(0, 10)) console.log(`  · #${v.id} ${v.nombre} (${countSenales(v)} señales) → /variedades/${v.slug || v.id}/`);
    if (finas.length > 10) console.log(`  … y ${finas.length - 10} más`);
    return;
  }

  let hechas = 0;
  for (const v of finas) {
    await sb('seo_indexable_backup', {
      method: 'POST', prefer: 'return=minimal',
      body: [{ variedad_id: v.id, seo_text_batch: batchId, indexable_anterior: true }],
    });
    await sb(`variedades?id=eq.${v.id}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: { indexable: false },
    });
    hechas++;
  }

  console.log(`\n▸ Lote ${batchId} terminado`);
  console.log(`  fichas pasadas a noindex,follow: ${hechas}`);
  console.log(`\n  Para deshacer: node scripts/rollback-seo-batch.mjs ${batchId}`);
  console.log(`  Para publicar el cambio: node prerender/build.mjs --variedades --breeders (y desplegar por cPanel)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
