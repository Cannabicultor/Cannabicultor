#!/usr/bin/env node
/**
 * pipeline/harvest.js
 *
 * Harvester / Procesador local (on-demand).
 *
 * Toma los nuevos descubrimientos de `discovered_sources` y los convierte
 * en datos reales en las tablas `breeders` y `variedades`.
 *
 * Ejecución local desde tu Mac, cuando quieras.
 *
 * Uso:
 *   node pipeline/harvest.js --help
 *   node pipeline/harvest.js                    # procesa nuevos (hasta 30)
 *   node pipeline/harvest.js --limit=50 --dry-run
 *   node pipeline/harvest.js --source="sitemap:seedfinder.eu" --type=breeder_home
 *
 * Filosofía:
 * - Reutiliza la lógica de extracción ya probada.
 * - No sobrescribe datos buenos.
 * - Actualiza el estado en discovered_sources.
 * - Totalmente local y controlado por ti.
 */

import { createPipelineClient, sleep, log } from './lib/supabase-client.js';
import { extractBreederData, guessBreederName, extractVarietyData } from './lib/extract.js';

const sb = createPipelineClient();

const DEFAULT_LIMIT = 30;
const DELAY_MS = Number(process.env.DELAY_MS || 1200);

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    limit: DEFAULT_LIMIT,
    dryRun: false,
    source: null,
    type: null,
    help: false,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') opts.help = true;
    if (arg === '--dry-run') opts.dryRun = true;
    if (arg.startsWith('--limit=')) opts.limit = parseInt(arg.split('=')[1], 10) || DEFAULT_LIMIT;
    if (arg.startsWith('--source=')) opts.source = arg.split('=')[1];
    if (arg.startsWith('--type=')) opts.type = arg.split('=')[1];
  }

  // Soporte adicional vía variable de entorno (para que run-pipeline.sh lo pase de forma fiable)
  if (process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true') {
    opts.dryRun = true;
  }

  return opts;
}

async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'CannabicultorHarvester/0.1 (+local, polite)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    throw new Error(`Error fetching ${url}: ${e.message}`);
  }
}

async function processBreederCandidate(record, html, baseUrl, dryRun) {
  const extracted = extractBreederData(html, baseUrl);
  const name = record.candidate_name || guessBreederName(html, baseUrl) || 'Breeder desconocido';

  // Buscar si ya existe por website o nombre aproximado (deduplicación inteligente)
  let existing = null;
  try {
    if (baseUrl) {
      const { data } = await sb
        .from('breeders')
        .select('id,breeder_name,website,logo_url,descripcion')
        .or(`website.eq.${baseUrl},website.ilike.%${new URL(baseUrl).hostname}%`)
        .limit(1);
      existing = data?.[0];
    }
  } catch {}

  if (!existing && name) {
    const { data } = await sb
      .from('breeders')
      .select('id,breeder_name')
      .ilike('breeder_name', `%${name.slice(0, 30)}%`)
      .limit(1);
    existing = data?.[0];
  }

  const patch = {
    breeder_name: existing?.breeder_name || name,
    website: baseUrl,
    ...extracted,
  };

  if (existing) {
    if (existing.logo_url && patch.logo_url) delete patch.logo_url;
    if (existing.descripcion && patch.descripcion) delete patch.descripcion;
  }

  const toInsert = {
    ...patch,
    seedfinder_synced: null,
  };

  if (dryRun) {
    log(`  [DRY] ${existing ? 'Actualizaría' : 'Crearía'} breeder: ${toInsert.breeder_name} (${baseUrl})`);
    return { action: existing ? 'update' : 'insert', name: toInsert.breeder_name, breederId: existing?.id };
  }

  let resultId;
  if (existing) {
    await sb.from('breeders').update(toInsert).eq('id', existing.id);
    resultId = existing.id;
    log(`  ✓ Actualizado breeder #${resultId}: ${toInsert.breeder_name}`);
  } else {
    const { data, error } = await sb.from('breeders').insert(toInsert).select('id').single();
    if (error) throw error;
    resultId = data.id;
    log(`  ✓ Creado nuevo breeder #${resultId}: ${toInsert.breeder_name}`);
  }

  return { action: existing ? 'update' : 'insert', id: resultId, name: toInsert.breeder_name, breederId: resultId };
}

async function processVarietyCandidate(record, html, baseUrl, breederId, dryRun) {
  const vData = extractVarietyData(html, baseUrl, breederId);
  if (!vData.nombre || vData.nombre.length < 3) return { action: 'skipped', reason: 'no valid name' };

  if (dryRun) {
    log(`  [DRY] Insertaría variedad: ${vData.nombre} (breeder_id=${breederId})`);
    return { action: 'insert', name: vData.nombre };
  }

  // Upsert por nombre + breeder_id para evitar duplicados
  const { error } = await sb.from('variedades').upsert({
    ...vData,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'nombre,breeder_id' });

  if (error) throw error;

  log(`  ✓ Variedad procesada: ${vData.nombre}`);
  return { action: 'insert', name: vData.nombre };
}

async function harvestOne(record, dryRun) {
  const url = record.url;
  log(`Procesando: ${url} (type=${record.type || 'unknown'}, source=${record.source})`);

  if (!url || !url.startsWith('http')) {
    log(`  → Saltando (no es URL real): ${url}`);
    if (!dryRun) {
      await updateStatus(record.id, 'reviewed', { notes: 'non-http seed/term' });
    }
    return { success: true, action: 'skipped', reason: 'not_real_url' };
  }

  try {
    const html = await fetchHtml(url);
    let result;

    if (record.type === 'breeder_home' || /breeder|seedbank|banco|seed bank/i.test(url) || record.candidate_name) {
      result = await processBreederCandidate(record, html, url, dryRun);
      // Trigger para enriquecimiento rico posterior (terpenos, efectos, etc.)
      // Marcamos para que los scripts existentes de enrich-varieties puedan correr después
      if (!dryRun && result.breederId) {
        // Opcional: aquí podríamos llamar a un script de enriquecimiento rico si quisiéramos
        // Por ahora solo logueamos para que el usuario sepa que puede correr los scripts legacy
        log(`  → Breeder listo. Puedes enriquecer variedades ricas luego con: BATCH=20 node enrich-varieties-detailed.mjs (o el run-varieties.sh)`);
      }
    } else if (record.type === 'strain_detail' || /strain|variedad|genetic/i.test(url)) {
      // Intentamos encontrar el breeder_id más cercano si existe
      let breederId = null;
      if (record.metadata && record.metadata.breeder_url) {
        const { data } = await sb.from('breeders').select('id').eq('website', record.metadata.breeder_url).limit(1);
        breederId = data?.[0]?.id;
      }
      result = await processVarietyCandidate(record, html, url, breederId, dryRun);
    } else {
      log(`  → Tipo ${record.type || 'other'} — marcado como revisado (sin acción específica por ahora)`);
      result = { action: 'skipped', reason: 'not_breeder_or_strain_yet' };
    }

    return { success: true, ...result };

  } catch (e) {
    log(`  ✗ Error: ${e.message}`);
    return { success: false, error: e.message };
  }
}

async function updateStatus(id, status, extra = {}) {
  await sb.from('discovered_sources').update({
    status,
    last_checked: new Date().toISOString(),
    ...extra,
  }).eq('id', id);
}

async function main() {
  const opts = parseArgs();

  if (opts.help) {
    console.log(`
Uso:
  node pipeline/harvest.js
  node pipeline/harvest.js --limit=50 --dry-run
  node pipeline/harvest.js --source="sitemap:seedfinder.eu" --type=breeder_home

Opciones:
  --limit=N          Máximo registros a procesar (default 30)
  --dry-run          No escribe en la base, solo simula
  --source=xxx       Filtra por fuente (ej: sitemap:seedfinder.eu)
  --type=xxx         Filtra por tipo (ej: breeder_home)
    `);
    process.exit(0);
  }

  log('=== Cannabicultor Harvester (local on-demand) ===');
  log(`Límite: ${opts.limit} | Dry-run: ${opts.dryRun} | Filtros: source=${opts.source || 'todos'} type=${opts.type || 'todos'}`);

  let query = sb
    .from('discovered_sources')
    .select('*')
    .eq('status', 'new')
    .order('discovered_at', { ascending: true })
    .limit(opts.limit);

  if (opts.source) query = query.eq('source', opts.source);
  if (opts.type) query = query.eq('type', opts.type);

  const { data: records, error } = await query;
  if (error) throw error;

  if (!records || records.length === 0) {
    log('No hay registros nuevos para procesar.');
    return;
  }

  log(`Encontrados ${records.length} registros pendientes.`);

  let processed = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const rec of records) {
    const result = await harvestOne(rec, opts.dryRun);

    if (!opts.dryRun) {
      if (result.success) {
        if (result.action === 'insert') created++;
        else if (result.action === 'update') updated++;
        else if (result.action === 'skipped') skipped++;

        const newStatus = result.action === 'skipped' ? 'reviewed' : 'processed';
        await updateStatus(rec.id, newStatus, {
          notes: result.name ? `Procesado como: ${result.name}` : null,
        });
      } else {
        failed++;
        await updateStatus(rec.id, 'failed', { notes: result.error });
      }
    } else {
      if (result.action === 'insert') created++;
      else if (result.action === 'update') updated++;
      else skipped++;
    }

    processed++;
    await sleep(DELAY_MS);
  }

  log('\n=== Resumen ===');
  log(`Procesados: ${processed}`);
  log(`Creados:    ${created}`);
  log(`Actualizados: ${updated}`);
  log(`Saltados:   ${skipped}`);
  log(`Fallidos:   ${failed}`);
  if (opts.dryRun) {
    log('(Modo dry-run: no se escribió nada en la base de datos)');
  }
  log('Listo. Puedes volver a ejecutar cuando quieras.');
}

main().catch(err => {
  console.error('Error fatal en harvester:', err);
  process.exit(1);
});
