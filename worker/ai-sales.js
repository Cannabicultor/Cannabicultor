/**
 * Cannabicultor AI Sales v0.1
 *
 * Deliberately small and deterministic. This module contains no network or
 * model calls: the Worker supplies fresh inventory and RAG evidence.
 */

export const AI_SALES_VERSION = 'v0.1.0';

export const AI_SALES_CONTRACT = {
  required_scope: {
    tent_width_cm: 120,
    tent_depth_cm: 120,
    plant_count: 4,
    substrate: 'coco',
    budget_eur_max: 900,
  },
  blocking_fields: ['height_cm', 'seeds_in_budget'],
};

// Every capability is traceable to the named SKU's catalogue name/description
// checked on 2026-08-29. This is intentionally not a general product model.
export const AI_SALES_PROFILE = {
  id: 'indoor-120x120-coco-4pl-v1',
  version: 1,
  catalogue_source: {
    table: 'demo_growshop_productos',
    verified_at: '2026-08-29',
    verification_fields: ['sku', 'nombre', 'descripcion_texto', 'precio_con_iva', 'stock'],
  },
  budget_exclusions: [
    'seeds',
    'electrical_installation',
    'advanced_climate_control',
    'non_essential_accessories',
  ],
  components: [
    {
      id: 'tent', label: 'Armario', required: true,
      candidates: [{ sku: 'ASJDS120R4.00', quantity: 1, capability: { width_cm: 120, depth_cm: 120, height_cm: 198 }, source: 'catalogue_name_and_description' }],
    },
    {
      id: 'lighting', label: 'Iluminación', required: true,
      candidates: [{ sku: 'ILED.066', quantity: 1, capability: { power_w: 720, intended_area_cm: [120, 120] }, source: 'catalogue_name_and_description' }],
    },
    {
      id: 'extraction', label: 'Extracción', required: true,
      candidates: [{ sku: 'XXT.110-150', quantity: 1, capability: { airflow_m3h: 272 }, source: 'catalogue_description' }],
    },
    {
      id: 'interior_ventilation', label: 'Ventilación interior', required: true,
      candidates: [{ sku: 'XXT.200', quantity: 1, capability: { airflow_cfm: 161 }, source: 'catalogue_description' }],
    },
    {
      id: 'pots', label: 'Macetas', required: true,
      candidates: [{ sku: 'AMAC.84-19L', quantity: 4, capability: { litres_each: 19, plant_count: 4 }, source: 'catalogue_name_and_description' }],
    },
    {
      id: 'coco', label: 'Coco', required: true,
      candidates: [{ sku: 'SATA.041-100', quantity: 1, capability: { substrate: 'coco', litres: 100 }, source: 'catalogue_name_and_description' }],
    },
    {
      id: 'nutrition', label: 'Nutrición para coco', required: true, bundle: true,
      candidates: [{
        items: [{ sku: 'FATA.018-5A', quantity: 1 }, { sku: 'FATA.018-5B', quantity: 1 }],
        capability: { substrate: 'coco', two_part: true }, source: 'catalogue_description',
      }],
    },
    {
      id: 'measurement', label: 'Medición básica', required: true, bundle: true,
      candidates: [{
        items: [{ sku: 'MSG.003PH', quantity: 1 }, { sku: 'MSG.002EC', quantity: 1 }],
        capability: { measures: ['ph', 'ec'] }, source: 'catalogue_name_and_description',
      }],
    },
  ],
};

const ALLOWED_ROOT_KEYS = new Set(['requirements']);
const ALLOWED_REQUIREMENT_KEYS = new Set([
  'tent_width_cm', 'tent_depth_cm', 'plant_count', 'substrate', 'budget_eur', 'height_cm', 'seeds_in_budget',
]);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberInRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export function validateAiSalesRequest(payload) {
  const errors = [];
  if (!isObject(payload)) return { ok: false, errors: [{ field: 'body', code: 'invalid_object' }] };
  for (const key of Object.keys(payload)) if (!ALLOWED_ROOT_KEYS.has(key)) errors.push({ field: key, code: 'unknown_field' });
  const input = payload.requirements;
  if (!isObject(input)) errors.push({ field: 'requirements', code: 'required_object' });
  if (errors.length) return { ok: false, errors };
  for (const key of Object.keys(input)) if (!ALLOWED_REQUIREMENT_KEYS.has(key)) errors.push({ field: `requirements.${key}`, code: 'unknown_field' });

  const fixed = AI_SALES_CONTRACT.required_scope;
  for (const [field, expected] of Object.entries(fixed)) {
    if (input[field] !== undefined && input[field] !== expected) errors.push({ field: `requirements.${field}`, code: 'out_of_scope', expected });
  }
  if (input.budget_eur !== undefined && !numberInRange(input.budget_eur, 1, fixed.budget_eur_max)) errors.push({ field: 'requirements.budget_eur', code: 'invalid_budget' });
  if (input.height_cm !== undefined && !numberInRange(input.height_cm, 150, 260)) errors.push({ field: 'requirements.height_cm', code: 'invalid_height' });
  if (input.seeds_in_budget !== undefined && typeof input.seeds_in_budget !== 'boolean') errors.push({ field: 'requirements.seeds_in_budget', code: 'invalid_boolean' });
  if (errors.length) return { ok: false, errors };

  const requirements = {
    tent_width_cm: fixed.tent_width_cm,
    tent_depth_cm: fixed.tent_depth_cm,
    plant_count: fixed.plant_count,
    substrate: fixed.substrate,
    budget_eur: input.budget_eur ?? fixed.budget_eur_max,
    height_cm: input.height_cm,
    seeds_in_budget: input.seeds_in_budget,
  };
  const questions = [];
  if (requirements.height_cm === undefined) questions.push({ field: 'height_cm', question: '¿Qué altura útil tienes disponible para el armario y la extracción (en cm)?' });
  if (requirements.seeds_in_budget === undefined) questions.push({ field: 'seeds_in_budget', question: '¿Los 900 € incluyen semillas? Las semillas están excluidas de esta configuración.' });
  if (requirements.seeds_in_budget === true) questions.push({ field: 'seeds_in_budget', question: 'Esta v0.1 excluye semillas. Confirma que los 900 € son solo para el equipo y consumibles definidos.' });
  return { ok: true, requirements, questions };
}

/** Validates untrusted LLM updates before they become client conversation state. */
export function mergeAiSalesConversationRequirements(current, update) {
  if (current !== undefined && !isObject(current)) return { ok: false, errors: [{ field: 'requirements', code: 'invalid_object' }] };
  if (!isObject(update)) return { ok: false, errors: [{ field: 'extracted_requirements', code: 'invalid_object' }] };
  const errors = [];
  for (const key of Object.keys(update)) {
    if (!ALLOWED_REQUIREMENT_KEYS.has(key)) errors.push({ field: `extracted_requirements.${key}`, code: 'unknown_field' });
  }
  if (errors.length) return { ok: false, errors };
  const combined = { ...(current || {}) };
  for (const [key, value] of Object.entries(update)) {
    if (value !== null) combined[key] = value;
  }
  return validateAiSalesRequest({ requirements: combined });
}

export function requestedSkus(profile = AI_SALES_PROFILE) {
  return [...new Set(profile.components.flatMap((component) => component.candidates.flatMap((candidate) => candidate.items ? candidate.items.map((item) => item.sku) : [candidate.sku])))];
}

function candidateItems(candidate) {
  return candidate.items || [{ sku: candidate.sku, quantity: candidate.quantity }];
}

function enoughStock(product, quantity) {
  return product && Number(product.stock) >= quantity && Number(product.stock) > 0 && Number.isFinite(Number(product.precio_con_iva));
}

function pickCandidate(component, productsBySku, requiredExtractionM3h, requirements) {
  const discarded = [];
  for (const candidate of component.candidates) {
    if (component.id === 'tent' && candidate.capability.height_cm > requirements.height_cm) {
      discarded.push({ component: component.id, candidate: candidate.sku, reason: 'insufficient_available_height', required_cm: candidate.capability.height_cm, available_cm: requirements.height_cm });
      continue;
    }
    if (component.id === 'extraction' && candidate.capability.airflow_m3h < requiredExtractionM3h) {
      discarded.push({ component: component.id, candidate: candidate.sku, reason: 'insufficient_airflow', required_m3h: requiredExtractionM3h, offered_m3h: candidate.capability.airflow_m3h });
      continue;
    }
    const items = candidateItems(candidate);
    const unavailable = items.find((item) => !enoughStock(productsBySku.get(item.sku), item.quantity));
    if (unavailable) {
      discarded.push({ component: component.id, candidate: unavailable.sku, reason: 'unavailable_or_insufficient_stock' });
      continue;
    }
    return { candidate, items, discarded };
  }
  return { candidate: null, items: [], discarded };
}

export function buildAiSalesPlan(requirements, inventory, profile = AI_SALES_PROFILE) {
  const productsBySku = new Map((inventory || []).map((product) => [product.sku, product]));
  const areaM2 = (requirements.tent_width_cm / 100) * (requirements.tent_depth_cm / 100);
  const volumeM3 = areaM2 * (requirements.height_cm / 100);
  const requiredExtractionM3h = Math.ceil(volumeM3 * 60); // one complete air exchange per minute
  const calculations = {
    area_m2: Number(areaM2.toFixed(2)),
    volume_m3: Number(volumeM3.toFixed(2)),
    required_extraction_m3h: requiredExtractionM3h,
    extraction_rule: 'volume_m3_x_60',
    plant_count: requirements.plant_count,
  };
  const selected = [];
  const discarded = [];
  const missingComponents = [];

  for (const component of profile.components) {
    const result = pickCandidate(component, productsBySku, requiredExtractionM3h, requirements);
    discarded.push(...result.discarded);
    if (!result.candidate) {
      missingComponents.push(component.id);
      continue;
    }
    for (const item of result.items) {
      const product = productsBySku.get(item.sku);
      selected.push({ sku: product.sku, quantity: item.quantity, component: component.id, bundle: Boolean(component.bundle), price_eur: Number(product.precio_con_iva) });
    }
  }
  const totalEur = Number(selected.reduce((sum, item) => sum + item.price_eur * item.quantity, 0).toFixed(2));
  if (totalEur > requirements.budget_eur) {
    discarded.push({ component: 'configuration', reason: 'budget_exceeded', total_eur: totalEur, budget_eur: requirements.budget_eur });
  }
  const complete = missingComponents.length === 0 && totalEur <= requirements.budget_eur;
  return {
    status: complete ? 'ready_for_revalidation' : 'blocked',
    calculations,
    candidates_considered: profile.components.map((component) => ({ component: component.id, candidates: component.candidates.map((candidate) => candidateItems(candidate).map((item) => item.sku)) })),
    discarded,
    missing_components: missingComponents,
    selected_items: complete ? selected.map(({ sku, quantity, component, bundle }) => ({ sku, quantity, component, bundle })) : [],
    selected_pricing: selected,
    total_eur: totalEur,
  };
}

/**
 * Builds a compact per-SKU dossier (name, category, description, price, component
 * role) for the selected items, so the conversational layer can explain the
 * basket with real product knowledge instead of a fixed template. Read-only:
 * never used to alter selection, price or stock.
 */
export function buildAiSalesProductDossier(selectedItems, inventory) {
  const bySku = new Map((inventory || []).map((product) => [product.sku, product]));
  return (selectedItems || []).map((item) => {
    const product = bySku.get(item.sku) || {};
    return {
      sku: item.sku,
      component: item.component,
      quantity: item.quantity,
      bundle: Boolean(item.bundle),
      nombre: product.nombre || null,
      categoria: product.categoria || null,
      descripcion: product.descripcion_texto ? String(product.descripcion_texto).slice(0, 500) : null,
      precio_eur: product.precio_con_iva != null ? Number(product.precio_con_iva) : null,
    };
  });
}

export function buildAiSalesExplanation(result, evidence) {
  if (result.status !== 'ready') {
    const reasons = result.missing_components?.length
      ? `Faltan candidatos compatibles para: ${result.missing_components.join(', ')}.`
      : 'La configuración excede el presupuesto.';
    return { summary: `No se ha emitido cesta completa. ${reasons}`, component_reasons: [], sources: evidence || [] };
  }
  return {
    summary: `Configuración completa para 120×120, cuatro plantas y coco: ${result.total_eur.toFixed(2)} €; dentro del máximo de ${result.requirements.budget_eur.toFixed(2)} €.`,
    component_reasons: result.selected_items.map((item) => ({ component: item.component, sku: item.sku, reason: item.bundle ? 'Elemento del bundle declarado para este componente.' : 'SKU seleccionado por el perfil curado y validado frente a inventario.' })),
    sources: evidence || [],
  };
}
