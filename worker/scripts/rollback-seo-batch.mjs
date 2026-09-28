// Deshace un lote de gen-seo-text.mjs, apply-canonical.mjs o
// downgrade-thin-indexable.mjs: restaura el `indexable` anterior desde
// seo_indexable_backup. Para lotes de texto (prefijo "seo-") también limpia
// seo_text_status/seo_text_batch para que gen-seo-text.mjs las recoja de
// nuevo; los demás lotes no tocan el texto en absoluto.
//
// Uso (desde el Mac, mismo patrón que gen-seo-text.mjs):
//   cd worker
//   SUPABASE_SERVICE_KEY=... node scripts/rollback-seo-batch.mjs seo-2026-09-28-a1b2c3d4
//   SUPABASE_SERVICE_KEY=... node scripts/rollback-seo-batch.mjs seo-2026-09-28-a1b2c3d4 --dry-run

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gfyrsrdnvgnhtsuexjkb.supabase.co';
const { SUPABASE_SERVICE_KEY: SB_KEY } = process.env;

const args = process.argv.slice(2);
const batchId = args.find((a) => !a.startsWith('--'));
const DRY_RUN = args.includes('--dry-run');

if (!SB_KEY) { console.error('Falta SUPABASE_SERVICE_KEY'); process.exit(1); }
if (!batchId) { console.error('Uso: node rollback-seo-batch.mjs <batch_id> [--dry-run]'); process.exit(1); }

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

async function main() {
  const backups = await sb(`seo_indexable_backup?select=id,variedad_id,indexable_anterior&seo_text_batch=eq.${encodeURIComponent(batchId)}&order=id.asc&limit=10000`);
  if (!backups.length) {
    console.log(`No hay filas de seo_indexable_backup para el lote "${batchId}". ¿Id correcto?`);
    return;
  }
  // "seo-…" = lote de gen-seo-text.mjs (texto + indexable). Cualquier otro prefijo
  // ("canon-…" de apply-canonical.mjs, "thin-…" de downgrade-thin-indexable.mjs, …)
  // solo tocó indexable (y canonical_variedad_id en el caso de canon-), nunca el texto.
  const esLoteDeTexto = batchId.startsWith('seo-');
  const tipoLote = esLoteDeTexto ? 'generación de texto' : batchId.startsWith('canon-') ? 'canonicalización' : batchId.startsWith('thin-') ? 'thin content' : 'indexable';
  console.log(`▸ Lote ${batchId} (${tipoLote}): ${backups.length} fichas a restaurar${DRY_RUN ? ' (DRY RUN)' : ''}`);

  if (DRY_RUN) {
    for (const b of backups.slice(0, 10)) console.log(`  variedad #${b.variedad_id}: indexable volvería a ${b.indexable_anterior}`);
    if (backups.length > 10) console.log(`  … y ${backups.length - 10} más`);
    return;
  }

  let restauradas = 0;
  for (const b of backups) {
    const body = esLoteDeTexto
      ? {
          indexable: b.indexable_anterior,
          seo_text_status: null,
          seo_text_batch: null,
          // seo_description_text se deja tal cual para depurar qué se generó;
          // seo_text_status=null hace que gen-seo-text.mjs la recoja de nuevo.
        }
      : {
          indexable: b.indexable_anterior,
          canonical_variedad_id: null,
          // no toca seo_text_status/seo_description_text: apply-canonical.mjs nunca los cambió.
        };
    await sb(`variedades?id=eq.${b.variedad_id}`, { method: 'PATCH', prefer: 'return=minimal', body });
    restauradas++;
  }
  await sb(`seo_indexable_backup?seo_text_batch=eq.${encodeURIComponent(batchId)}`, { method: 'DELETE' });
  console.log(`✓ ${restauradas} fichas restauradas.${esLoteDeTexto ? ' Se regenerarán en la próxima corrida de gen-seo-text.mjs.' : ''}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
