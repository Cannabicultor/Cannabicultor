// Canonicaliza por taxón: cuando varias fichas indexable=true comparten
// taxon_id Y dedupe_status confirma que son la misma genética ('canonico' /
// 'alias' — nunca fichas sin ese veredicto), se deja indexable=true solo en
// la de más señales; el resto pasa a indexable=false + canonical_variedad_id
// apuntando a esa, para servirse noindex,follow con <link rel="canonical">
// a la ficha elegida. Nunca junta fichas de distinto breeder con genética
// distinta: solo agrupa por taxon_id, que ya es el veredicto de "misma
// genética" de la pipeline de dedupe.
//
// Reversible igual que gen-seo-text.mjs: cada cambio de `indexable` se
// respalda primero en seo_indexable_backup con su propio batch id
// ("canon-YYYY-MM-DD-xxxxxxxx"), deshacer con rollback-seo-batch.mjs.
//
// Uso (desde el Mac):
//   cd worker
//   SUPABASE_SERVICE_KEY=... node scripts/apply-canonical.mjs --dry-run
//   SUPABASE_SERVICE_KEY=... node scripts/apply-canonical.mjs

import { randomUUID } from 'node:crypto';
import { countSenales } from './seo-signals.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gfyrsrdnvgnhtsuexjkb.supabase.co';
const { SUPABASE_SERVICE_KEY: SB_KEY } = process.env;
const DRY_RUN = process.argv.includes('--dry-run');

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

const CAMPOS = 'id,taxon_id,dedupe_status,breeder_id,tipo,tipo_semilla,thc_pct,thc_max,cbd_pct,cbd_max,terpenos,aromas,efecto,efectos,floracion_dias,genetica,descripcion,indexable,canonical_variedad_id,slug';

async function fetchIndexablesConTaxon() {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const page = await sb(
      `variedades?select=${CAMPOS}&indexable=is.true&taxon_id=not.is.null&dedupe_status=in.(canonico,alias)&order=id.asc&limit=${pageSize}&offset=${from}`,
    );
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function agruparPorTaxon(rows) {
  const grupos = new Map();
  for (const v of rows) {
    if (!grupos.has(v.taxon_id)) grupos.set(v.taxon_id, []);
    grupos.get(v.taxon_id).push(v);
  }
  // solo interesan los grupos con más de una ficha indexable: ahí hay duplicado real
  return [...grupos.values()].filter((g) => g.length > 1);
}

function elegirCanonica(grupo) {
  // la de más señales gana; empate -> la marcada 'canonico' explícitamente; empate -> menor id (más antigua)
  return [...grupo].sort((a, b) => {
    const s = countSenales(b) - countSenales(a);
    if (s !== 0) return s;
    const c = (b.dedupe_status === 'canonico' ? 1 : 0) - (a.dedupe_status === 'canonico' ? 1 : 0);
    if (c !== 0) return c;
    return a.id - b.id;
  })[0];
}

async function main() {
  const batchId = `canon-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
  console.log(`▸ apply-canonical · lote ${batchId}${DRY_RUN ? ' (DRY RUN)' : ''}`);

  const rows = await fetchIndexablesConTaxon();
  const grupos = agruparPorTaxon(rows);
  console.log(`  fichas indexable con taxón confirmado: ${rows.length} · grupos con duplicado: ${grupos.length}`);

  let canonicas = 0, degradadas = 0;
  for (const grupo of grupos) {
    const canonica = elegirCanonica(grupo);
    canonicas++;
    for (const v of grupo) {
      if (v.id === canonica.id) continue; // esta se queda indexable, sin canonical_variedad_id
      // ya estaba correctamente marcada como alias de esta misma canónica: nada que hacer (idempotente)
      if (v.indexable === false && v.canonical_variedad_id === canonica.id) continue;

      console.log(`  · #${v.id} → noindex,follow · canonical a #${canonica.id} (taxón ${v.taxon_id})`);
      if (!DRY_RUN) {
        await sb('seo_indexable_backup', {
          method: 'POST', prefer: 'return=minimal',
          body: [{ variedad_id: v.id, seo_text_batch: batchId, indexable_anterior: v.indexable }],
        });
        await sb(`variedades?id=eq.${v.id}`, {
          method: 'PATCH', prefer: 'return=minimal',
          body: { indexable: false, canonical_variedad_id: canonica.id },
        });
      }
      degradadas++;
    }
  }

  console.log(`\n▸ Lote ${batchId} terminado`);
  console.log(`  grupos con duplicado resueltos: ${grupos.length}`);
  console.log(`  fichas canónicas (se quedan indexable): ${canonicas}`);
  console.log(`  fichas pasadas a noindex,follow con canonical: ${degradadas}`);
  if (degradadas && !DRY_RUN) console.log(`\n  Para deshacer este lote: node scripts/rollback-seo-batch.mjs ${batchId}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
