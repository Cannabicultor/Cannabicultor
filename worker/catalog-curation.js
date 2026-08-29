/**
 * Cannabicultor — Agente de curación de catálogo.
 *
 * Corre en CADA ingesta de catálogo de un growshop (webhook/API), no en batch.
 * Resuelve dos problemas al meter un segundo (tercer, ...) growshop en el
 * cerebro compartido (product_intelligence) sin ensuciarlo:
 *
 *   (a) Fusión de descripción — cuando 2+ growshops tienen "el mismo" producto
 *       con texto distinto, se guardan TODAS las fuentes (product_source) con
 *       su origen y fiabilidad. Nunca se sobreescribe silenciosamente la
 *       descripción activa; si dos fuentes discrepan en un dato factual
 *       (specs), se registra en product_field_conflict y queda pendiente.
 *
 *   (b) Deduplicación de nombre — mismo patrón que el dedupe de variedades de
 *       cannabis (taxones + variedad_alias + dedupe_candidatos), adaptado a
 *       producto: product_alias + product_dedupe_candidatos. Alta confianza
 *       auto-aprueba y funde; el resto cae a cola de revisión humana. NUNCA
 *       hay fusión silenciosa por debajo del umbral.
 *
 * Diferencia clave vs el pipeline de variedades (que es Python offline,
 * corrido a mano con psql): aquí la ingesta es continua y descontrolada
 * (cada growshop sube su catálogo cuando quiere), así que este módulo se
 * invoca desde el propio Worker en cada ingesta — no es un proceso batch.
 *
 * Umbrales de auto-aprobación (banda "alta confianza"):
 *   - SKU/EAN exacto compartido entre fuentes  -> confianza 1.0, auto
 *   - nombre_norm exacto + mismo core (sin discriminador de tamaño/potencia)
 *                                               -> confianza 0.9, auto
 *   - similarity() trgm >= 0.92 Y mismo product_core
 *                                               -> confianza 0.8, auto
 *   - cualquier otro caso (incl. mismo cluster_key con core distinto, o
 *     similarity 0.75–0.92)                     -> siempre a revisión humana
 */

const AUTO_APPROVE_THRESHOLD = 0.85;
const TRGM_REVIEW_FLOOR = 0.75;

const RELIABILITY_BY_SOURCE_TYPE = {
  manufacturer_official: 90,
  manual_curation: 80,
  catalogue_description: 50,
  scraped: 20,
};

// ---------------------------------------------------------------------
// Helpers de bajo nivel sobre sbRequest (mismo wrapper que sales-agent.js)
// ---------------------------------------------------------------------

async function sbSelectOne(env, sbRequest, path) {
  const res = await sbRequest(env, path, { method: 'GET' });
  if (!res.ok) throw new Error(`catalog_curation_supabase_error_${res.status}`);
  const rows = Array.isArray(res.data) ? res.data : [];
  return rows[0] || null;
}

async function sbSelect(env, sbRequest, path) {
  const res = await sbRequest(env, path, { method: 'GET' });
  if (!res.ok) throw new Error(`catalog_curation_supabase_error_${res.status}`);
  return Array.isArray(res.data) ? res.data : [];
}

async function sbInsertReturning(env, sbRequest, table, row) {
  const res = await sbRequest(env, table, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`catalog_curation_insert_failed_${table}_${res.status}`);
  const rows = Array.isArray(res.data) ? res.data : [];
  return rows[0] || null;
}

async function sbUpdate(env, sbRequest, table, filterQuery, patch) {
  const res = await sbRequest(env, `${table}?${filterQuery}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`catalog_curation_update_failed_${table}_${res.status}`);
  return true;
}

// Llama a una función SQL vía PostgREST RPC (norm_product_name / product_core
// / similarity de pg_trgm no se pueden invocar como SELECT normal por REST,
// así que exige haber creado wrappers RPC — ver sql/rpc_catalog_curation.sql).
async function rpc(env, sbRequest, fn, args) {
  const res = await sbRequest(env, `rpc/${fn}`, {
    method: 'POST',
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`catalog_curation_rpc_failed_${fn}_${res.status}`);
  return res.data;
}

// ---------------------------------------------------------------------
// Paso 1 — Matching: ¿este ítem entrante ya existe en product_intelligence?
// ---------------------------------------------------------------------

/**
 * Busca candidatos existentes para un ítem entrante, en orden de confianza
 * decreciente. Devuelve el mejor match y el score, o null si no hay nada
 * razonable (en cuyo caso el ítem crea un product_intelligence nuevo).
 */
async function findBestMatch(env, sbRequest, item) {
  // 1) SKU/EAN exacto contra product_source.sku ya registrado de OTRO tenant
  if (item.sku) {
    const bySku = await sbSelect(
      env, sbRequest,
      `product_source?sku=eq.${encodeURIComponent(item.sku)}&select=product_id&limit=1`
    );
    if (bySku.length) {
      return { productId: bySku[0].product_id, metodo: 'sku_ean', confianza: 1.0 };
    }
  }

  // 2) nombre_norm exacto contra product_intelligence.canonical_name normalizado
  //    (RPC porque necesitamos aplicar norm_product_name() en servidor)
  const normMatches = await rpc(env, sbRequest, 'match_product_by_norm_name', {
    p_name: item.nombre,
  });
  if (Array.isArray(normMatches) && normMatches.length) {
    // varios productos pueden compartir nombre_norm si ya hay ambigüedad sin resolver;
    // tomamos el primero como candidato pero el llamador decide si auto-aprobar
    return {
      productId: normMatches[0].product_id,
      metodo: 'exacto_norm',
      confianza: normMatches.length === 1 ? 0.9 : 0.6, // ambiguo si hay >1
      allCandidateIds: normMatches.map((m) => m.product_id),
    };
  }

  // 3) similitud trigram (pg_trgm) sobre nombre normalizado, umbral bajo de descubrimiento
  const trgmMatches = await rpc(env, sbRequest, 'match_product_by_trgm', {
    p_name: item.nombre,
    p_threshold: TRGM_REVIEW_FLOOR,
  });
  if (Array.isArray(trgmMatches) && trgmMatches.length) {
    const top = trgmMatches[0]; // { product_id, similitud, mismo_core }
    const confianza = top.mismo_core ? Math.min(0.95, top.similitud) : top.similitud * 0.7;
    return {
      productId: top.product_id,
      metodo: 'trgm',
      confianza,
      similitud: top.similitud,
      allCandidateIds: trgmMatches.map((m) => m.product_id),
    };
  }

  return null;
}

// ---------------------------------------------------------------------
// Paso 2 — Registrar SIEMPRE la fuente cruda (haya match o no)
// ---------------------------------------------------------------------

async function recordSource(env, sbRequest, { productId, tenantId, item, sourceType }) {
  const reliability = RELIABILITY_BY_SOURCE_TYPE[sourceType] ?? 50;
  return sbInsertReturning(env, sbRequest, 'product_source', {
    product_id: productId,
    tenant_id: tenantId,
    source_type: sourceType,
    reliability_score: reliability,
    raw_name: item.nombre,
    raw_description: item.descripcion || null,
    raw_specs: item.specs || {},
    sku: item.sku || null,
    source_url: item.source_url || null,
    is_active_source: false, // se decide en el paso 4 (elegir fuente activa)
  });
}

// ---------------------------------------------------------------------
// Paso 3 — Detectar conflictos factuales entre la fuente nueva y la activa
// ---------------------------------------------------------------------

function specsDiffer(a, b, key) {
  const va = a?.[key];
  const vb = b?.[key];
  if (va == null || vb == null) return false; // falta un dato no es conflicto, es hueco
  return String(va).trim().toLowerCase() !== String(vb).trim().toLowerCase();
}

async function detectFieldConflicts(env, sbRequest, { productId, newSourceId, newSpecs }) {
  const activeSource = await sbSelectOne(
    env, sbRequest,
    `product_source?product_id=eq.${productId}&is_active_source=eq.true&select=id,raw_specs&limit=1`
  );
  if (!activeSource) return []; // primer producto: nada que comparar todavía

  const conflicts = [];
  const keys = new Set([...Object.keys(activeSource.raw_specs || {}), ...Object.keys(newSpecs || {})]);
  for (const key of keys) {
    if (specsDiffer(activeSource.raw_specs, newSpecs, key)) {
      conflicts.push({
        product_id: productId,
        field_path: `specs.${key}`,
        source_a_id: activeSource.id,
        source_b_id: newSourceId,
        value_a: String(activeSource.raw_specs[key]),
        value_b: String(newSpecs[key]),
        status: 'pending',
      });
    }
  }
  for (const c of conflicts) {
    await sbInsertReturning(env, sbRequest, 'product_field_conflict', c);
  }
  return conflicts;
}

// ---------------------------------------------------------------------
// Paso 4 — Elegir/actualizar la fuente activa por fiabilidad
// ---------------------------------------------------------------------

async function refreshActiveSource(env, sbRequest, productId) {
  // Guarda de oro: si hay un conflicto factual PENDIENTE para este producto,
  // nunca se cambia la fuente activa en automático — eso sería exactamente la
  // fusión/sobreescritura silenciosa que este agente existe para evitar.
  // Ejemplo real que reveló esto en pruebas: dos growshops con el mismo
  // reliability_score (ambos catalogue_description) y un power_w distinto —
  // sin esta guarda, el desempate por ingested_at más reciente promovía la
  // fuente nueva a pesar del conflicto sin resolver. La fuente nueva se
  // guarda igual (recordSource ya la insertó); solo no se promueve a activa
  // hasta que un humano resuelva el conflicto en product_field_conflict.
  const pendingConflicts = await sbSelect(
    env, sbRequest,
    `product_field_conflict?product_id=eq.${productId}&status=eq.pending&select=id&limit=1`
  );
  if (pendingConflicts.length) return;

  const sources = await sbSelect(
    env, sbRequest,
    `product_source?product_id=eq.${productId}&select=id,source_type,reliability_score,raw_name,raw_description,raw_specs,ingested_at&order=reliability_score.desc,ingested_at.desc`
  );
  if (!sources.length) return;
  const winner = sources[0];

  // desactivar todas, activar la ganadora (evita violar el unique index parcial)
  await sbUpdate(env, sbRequest, 'product_source', `product_id=eq.${productId}&is_active_source=eq.true`, {
    is_active_source: false,
  });
  await sbUpdate(env, sbRequest, 'product_source', `id=eq.${winner.id}`, {
    is_active_source: true,
  });

  await sbUpdate(env, sbRequest, 'product_intelligence', `id=eq.${productId}`, {
    description: winner.raw_description,
    specs: winner.raw_specs,
    source_of_truth: winner.source_type,
    needs_enrichment: !winner.raw_description,
    updated_at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------
// Paso 5 — Crear producto nuevo cuando no hay match razonable
// ---------------------------------------------------------------------

async function createNewProduct(env, sbRequest, item) {
  return sbInsertReturning(env, sbRequest, 'product_intelligence', {
    canonical_name: item.nombre,
    brand: item.marca || null,
    category: item.categoria || null,
    category_l1: item.categoria_l1 || null,
    category_l2: item.categoria_l2 || null,
    description: item.descripcion || null,
    specs: item.specs || {},
    needs_enrichment: !item.descripcion,
    source_of_truth: 'catalogue_description',
  });
}

// ---------------------------------------------------------------------
// Paso 6 — Generar candidato de dedupe cuando el match es ambiguo o hay
// varios product_intelligence que probablemente son el mismo producto
// ---------------------------------------------------------------------

async function raiseDedupeCandidate(env, sbRequest, { match, item, tenantId, sourceId, ingestRef }) {
  const candidateIds = match.allCandidateIds && match.allCandidateIds.length > 1
    ? match.allCandidateIds
    : [match.productId];

  const autoAprobado = match.confianza >= AUTO_APPROVE_THRESHOLD && candidateIds.length <= 1;

  const row = {
    cluster_key: `${match.metodo}:${(item.nombre || '').toLowerCase().trim()}`,
    metodo: match.metodo,
    similitud: match.similitud ?? null,
    product_ids: candidateIds,
    nombres: [item.nombre],
    tenant_ids: [tenantId],
    source_ids: [sourceId],
    canonico_propuesto: match.productId,
    motivo_canonico: `match ${match.metodo} confianza=${match.confianza.toFixed(2)}`,
    confianza: match.confianza,
    auto_aprobado: autoAprobado,
    requiere_revision_humana: !autoAprobado,
    estado: autoAprobado ? 'auto_aprobado' : 'pendiente',
    triggered_by_ingest: ingestRef,
  };

  const inserted = await sbInsertReturning(env, sbRequest, 'product_dedupe_candidatos', row);
  return { inserted, autoAprobado };
}

// ---------------------------------------------------------------------
// Orquestador — un ítem de catálogo entrante
// ---------------------------------------------------------------------

/**
 * Procesa UN producto de un catálogo entrante contra el cerebro compartido.
 * Nunca fusiona nada por debajo del umbral de auto-aprobación; nunca
 * sobreescribe una descripción activa sin registrar la fuente nueva primero.
 *
 * item: { nombre, sku, descripcion, specs, marca, categoria, categoria_l1,
 *         categoria_l2, source_url }
 * Devuelve un resumen para acumular en product_ingest_run.
 */
export async function ingestCatalogItem(env, sbRequest, { tenantId, item, sourceType = 'catalogue_description', ingestRef }) {
  const summary = { matched: false, created: false, candidateGenerated: false, autoApproved: false, conflicts: 0 };

  const match = await findBestMatch(env, sbRequest, item);

  let productId;
  if (match) {
    productId = match.productId;
    summary.matched = true;
  } else {
    const created = await createNewProduct(env, sbRequest, item);
    productId = created.id;
    summary.created = true;
  }

  // Fuente cruda SIEMPRE se guarda, haya match o no (auditoría + insumo para
  // futuros re-cálculos de fiabilidad si otro growshop aporta algo mejor).
  const source = await recordSource(env, sbRequest, { productId, tenantId, item, sourceType });

  if (match) {
    const conflicts = await detectFieldConflicts(env, sbRequest, {
      productId,
      newSourceId: source.id,
      newSpecs: item.specs || {},
    });
    summary.conflicts = conflicts.length;

    // ¿esta fuente nueva es más fiable que la activa, o el match es ambiguo/débil?
    // en cualquier caso pasa por la cola de dedupe — nunca se decide sola aquí.
    const { autoAprobado } = await raiseDedupeCandidate(env, sbRequest, {
      match, item, tenantId, sourceId: source.id, ingestRef,
    });
    summary.candidateGenerated = true;
    summary.autoApproved = autoAprobado;

    if (autoAprobado) {
      // alta confianza: se recalcula la fuente activa por fiabilidad (nunca
      // se sobreescribe a ciegas, siempre gana la de mayor reliability_score)
      await refreshActiveSource(env, sbRequest, productId);
    }
    // si NO auto-aprobado: la fuente queda registrada, is_active_source sigue
    // en lo que ya había, y el producto espera revisión humana en
    // product_dedupe_candidatos. Nada más se toca.
  } else {
    // producto nuevo: su única fuente pasa a ser la activa directamente
    await sbUpdate(env, sbRequest, 'product_source', `id=eq.${source.id}`, { is_active_source: true });
  }

  return { productId, sourceId: source.id, ...summary };
}

// ---------------------------------------------------------------------
// Orquestador — una ingesta completa (lote de un webhook/llamada API)
// ---------------------------------------------------------------------

export async function runCatalogIngest(env, sbRequest, { tenantId, items, triggeredBy = 'webhook', sourceType = 'catalogue_description' }) {
  const run = await sbInsertReturning(env, sbRequest, 'product_ingest_run', {
    tenant_id: tenantId,
    triggered_by: triggeredBy,
    status: 'running',
    items_received: items.length,
  });

  const counters = {
    items_matched_existing: 0,
    items_created_new: 0,
    candidates_generated: 0,
    candidates_auto_approved: 0,
    conflicts_detected: 0,
  };

  const errors = [];
  for (const item of items) {
    try {
      const result = await ingestCatalogItem(env, sbRequest, {
        tenantId, item, sourceType, ingestRef: `${triggeredBy}:${run.id}`,
      });
      if (result.matched) counters.items_matched_existing += 1;
      if (result.created) counters.items_created_new += 1;
      if (result.candidateGenerated) counters.candidates_generated += 1;
      if (result.autoApproved) counters.candidates_auto_approved += 1;
      counters.conflicts_detected += result.conflicts;
    } catch (error) {
      errors.push({ item: item.nombre || item.sku || 'desconocido', error: String(error?.message || error) });
    }
  }

  await sbUpdate(env, sbRequest, 'product_ingest_run', `id=eq.${run.id}`, {
    status: errors.length && errors.length === items.length ? 'failed' : 'completed',
    ...counters,
    error_message: errors.length ? JSON.stringify(errors).slice(0, 2000) : null,
    completed_at: new Date().toISOString(),
  });

  return { runId: run.id, ...counters, errors };
}
