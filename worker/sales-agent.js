/**
 * Cannabicultor Sales Agent — multi-tenant conversational seller.
 *
 * Design: ONE brain (this module + the cultivation knowledge already in the
 * Worker's main chat), MANY isolated inventories. Every tool call here is
 * hard-scoped to a single tenant_id resolved server-side BEFORE the model
 * sees anything — the model is never given tenant_id as a parameter it could
 * set, so it cannot ask for or receive another growshop's products.
 *
 * The model (Claude, tool use) drives the whole conversation like a human
 * salesperson would: it decides when to search the catalogue, when to ask a
 * clarifying question, when to propose a basket, and when to close. It never
 * invents price/stock/SKU — those only ever come back from a tool call that
 * hit the real database moments earlier.
 */

const SALES_AGENT_MODEL = 'claude-sonnet-4-5';
export const MAX_TOOL_ROUNDS = 10;

export const SALES_AGENT_TOOLS = [
  {
    name: 'buscar_productos',
    description:
      'Busca productos EN EL INVENTARIO DE ESTE GROWSHOP (nunca de otro). Usa esto siempre que necesites saber qué hay disponible, precios reales o stock antes de recomendar algo. Nunca inventes un producto, precio o SKU sin haber llamado antes a esta herramienta.',
    input_schema: {
      type: 'object',
      properties: {
        categoria: {
          type: 'string',
          description: 'Texto libre de categoría o tipo de producto a buscar, ej. "armario", "extractor", "sustrato coco", "fertilizante floración". Se busca por coincidencia parcial en nombre, categoría y descripción.',
        },
        solo_con_stock: {
          type: 'boolean',
          description: 'Si es true (por defecto), solo devuelve productos con stock > 0. Ponlo en false únicamente si el cliente pregunta explícitamente por algo agotado.',
        },
        limite: { type: 'integer', description: 'Máximo de resultados a devolver (por defecto 8, máximo 20).' },
      },
      required: ['categoria'],
    },
  },
  {
    name: 'registrar_necesidad_no_cubierta',
    description:
      'Registra que un cliente pidió un producto que este growshop NO tiene en su inventario actual. Úsala SIEMPRE que buscar_productos no encuentre nada razonable para lo que pide el cliente, en lugar de decirle que lo busque en otra tienda — este growshop quiere quedarse con el cliente, no perderlo. Después de llamarla, dile al cliente con honestidad que ahora mismo no lo tienes, que se lo vas a trasladar al equipo, y pídele un email de contacto si aún no lo tienes en la conversación para poder avisarle si lo consiguen. No prometas plazos ni que "seguro lo van a traer" — eso lo decide el growshop, no tú.',
    input_schema: {
      type: 'object',
      properties: {
        producto_pedido: { type: 'string', description: 'Descripción breve de lo que el cliente pidió y no está en el inventario, ej. "semillas autoflorecientes", "maceta de 25 litros".' },
        contexto: { type: 'string', description: 'Contexto breve de la conversación relevante para que el growshop entienda la petición (qué cultivo tiene, para qué lo quiere).' },
        email_cliente: { type: 'string', description: 'Email del cliente si ya lo dio en la conversación. Omite este campo si todavía no lo tienes — pídeselo en tu respuesta de texto, no lo inventes.' },
      },
      required: ['producto_pedido'],
    },
  },
  {
    name: 'calcular_cesta',
    description:
      'Revalida en tiempo real precio y stock de una lista de SKU de este growshop y calcula el total. Llama a esto SIEMPRE justo antes de proponer un total o cerrar una cesta al cliente — nunca sumes precios de memoria de una búsqueda anterior, porque el stock/precio puede haber cambiado.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Lista de artículos a incluir en la cesta.',
          items: {
            type: 'object',
            properties: {
              sku: { type: 'string' },
              cantidad: { type: 'integer', minimum: 1 },
            },
            required: ['sku', 'cantidad'],
          },
        },
      },
      required: ['items'],
    },
  },
];

async function sbSelect(env, sbRequest, path) {
  const result = await sbRequest(env, path, { method: 'GET' });
  if (!result.ok) throw new Error(`sales_agent_supabase_error_${result.status}`);
  return Array.isArray(result.data) ? result.data : [];
}

/**
 * Executes buscar_productos, hard-scoped to tenantId. The model never
 * supplies tenantId — it is a closure variable fixed by the caller.
 */
// Spanish grow-shop synonym expansion: the model's search phrase and the
// catalogue's own wording rarely match verbatim ("iluminación LED panel" vs
// "LED MJ3 RS 720w"). Expanding a few high-traffic terms up front means the
// FIRST search round finds real stock instead of the model giving up after
// many literal misses and telling the customer "no tengo" incorrectly.
const CATALOGUE_SYNONYMS = {
  led: ['led', 'luz', 'iluminacion', 'iluminación', 'foco', 'panel', 'lampara', 'lámpara'],
  luz: ['led', 'hps', 'luz', 'iluminacion', 'iluminación', 'foco'],
  iluminacion: ['led', 'hps', 'foco', 'panel', 'lampara'],
  extractor: ['extractor', 'extraccion', 'extracción'],
  ventilador: ['ventilador', 'ventilacion', 'ventilación'],
  maceta: ['maceta', 'macetas'],
  sustrato: ['sustrato', 'coco', 'fibra'],
  fertilizante: ['fertilizante', 'abono', 'nutricion', 'nutrición', 'nutriente'],
  medidor: ['medidor', 'medicion', 'medición'],
  armario: ['armario', 'invernadero', 'carpa'],
};

function expandSearchTerms(rawTerm) {
  const words = String(rawTerm || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents for matching keys
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
  const expanded = new Set(words.length ? words : [String(rawTerm || '').trim().toLowerCase()].filter(Boolean));
  for (const w of words) {
    if (CATALOGUE_SYNONYMS[w]) CATALOGUE_SYNONYMS[w].forEach((syn) => expanded.add(syn));
  }
  return [...expanded].filter(Boolean);
}

async function runBuscarProductos(env, sbRequest, tenantId, input) {
  const limite = Math.min(Math.max(Number(input?.limite) || 8, 1), 20);
  const soloConStock = input?.solo_con_stock !== false;
  const rawTerm = String(input?.categoria || '').trim();
  if (!rawTerm) return { error: 'categoria_requerida' };

  // 1) Try the literal phrase first (fast path for exact/near-exact matches).
  // 2) If nothing comes back, retry with each individual word (+ synonyms)
  //    OR'd together — this is what catches "LED MJ3 RS 720w" when the model
  //    searched "iluminación LED panel luz cultivo".
  const attempts = [[rawTerm]];
  const expandedWords = expandSearchTerms(rawTerm);
  if (expandedWords.length) attempts.push(expandedWords);

  for (const terms of attempts) {
    const orParts = [];
    for (const t of terms) {
      const encoded = encodeURIComponent(`%${t}%`);
      orParts.push(`nombre.ilike.${encoded}`, `categoria.ilike.${encoded}`);
    }
    const orClause = orParts.join(',');
    let path = `sales_tenant_inventory?tenant_id=eq.${tenantId}&active=eq.true&or=(${orClause})&select=sku,nombre,categoria,precio_con_iva,stock,product_intelligence_id&limit=${limite}`;
    if (soloConStock) path += '&stock=gt.0';

    const rows = await sbSelect(env, sbRequest, path);
    if (rows.length) return buildBuscarProductosResult(env, sbRequest, rows);
  }

  return { resultados: [], nota: 'Sin coincidencias en el inventario de este growshop para ese término, ni siquiera ampliando la búsqueda a palabras relacionadas. Es razonable asumir que este growshop no lo tiene.' };
}

async function buildBuscarProductosResult(env, sbRequest, rows) {
  const piIds = [...new Set(rows.map((r) => r.product_intelligence_id).filter(Boolean))];
  let dossierById = new Map();
  if (piIds.length) {
    const piPath = `product_intelligence?id=in.(${piIds.join(',')})&select=id,canonical_name,description,specs`;
    const piRows = await sbSelect(env, sbRequest, piPath);
    dossierById = new Map(piRows.map((p) => [p.id, p]));
  }

  return {
    resultados: rows.map((r) => {
      const pi = dossierById.get(r.product_intelligence_id);
      return {
        sku: r.sku,
        nombre: r.nombre,
        categoria: r.categoria,
        precio_eur: Number(r.precio_con_iva),
        stock: r.stock,
        specs: pi?.specs || {},
        descripcion: pi?.description ? String(pi.description).slice(0, 400) : null,
      };
    }),
  };
}

/**
 * Executes calcular_cesta, hard-scoped to tenantId. Always re-reads the
 * database — never trusts a price/stock number the model may have seen
 * earlier in the conversation.
 */
async function runCalcularCesta(env, sbRequest, tenantId, input) {
  const items = Array.isArray(input?.items) ? input.items : [];
  if (!items.length) return { error: 'items_requeridos' };
  const skus = [...new Set(items.map((i) => String(i.sku || '').trim()).filter(Boolean))];
  if (!skus.length) return { error: 'skus_invalidos' };

  const path = `sales_tenant_inventory?tenant_id=eq.${tenantId}&active=eq.true&sku=in.(${skus.map(encodeURIComponent).join(',')})&select=sku,nombre,precio_con_iva,stock`;
  const rows = await sbSelect(env, sbRequest, path);
  const bySku = new Map(rows.map((r) => [r.sku, r]));

  const lineas = [];
  const problemas = [];
  let total = 0;
  for (const item of items) {
    const sku = String(item.sku || '').trim();
    const cantidad = Math.max(1, Math.floor(Number(item.cantidad) || 1));
    const product = bySku.get(sku);
    if (!product) { problemas.push({ sku, motivo: 'no_pertenece_a_este_growshop' }); continue; }
    if (Number(product.stock) < cantidad) { problemas.push({ sku, motivo: 'stock_insuficiente', stock_actual: product.stock, solicitado: cantidad }); continue; }
    const precio = Number(product.precio_con_iva);
    lineas.push({ sku, nombre: product.nombre, cantidad, precio_unitario_eur: precio, subtotal_eur: Number((precio * cantidad).toFixed(2)) });
    total += precio * cantidad;
  }

  return {
    lineas,
    problemas,
    total_eur: Number(total.toFixed(2)),
    revalidado_en: new Date().toISOString(),
  };
}

/**
 * Executes registrar_necesidad_no_cubierta, hard-scoped to tenantId. This is
 * the "don't send the customer elsewhere" path: instead of the model
 * recommending a competitor, it logs the demand for the growshop owner to
 * act on (a human decides whether to stock it), and the bot tells the
 * customer honestly that it's been passed along — no promised timeline.
 */
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/**
 * Anti-hallucination guard: the model has, in past turns of OTHER
 * conversations, seen emails typed by testers and can "recall" one that was
 * never given here. An email is only ever trusted if it appears verbatim in
 * text the shopper actually typed in THIS conversation.
 */
function emailActuallyGivenByShopper(claimedEmail, shopperTranscript) {
  if (!claimedEmail) return false;
  const normalized = claimedEmail.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) return false;
  return String(shopperTranscript || '').toLowerCase().includes(normalized);
}

async function runRegistrarNecesidadNoCubierta(env, sbRequest, tenantId, conversationId, input, shopperTranscript) {
  const producto = String(input?.producto_pedido || '').trim();
  if (!producto) return { error: 'producto_pedido_requerido' };
  const contexto = input?.contexto ? String(input.contexto).slice(0, 500) : null;
  const claimedEmail = input?.email_cliente ? String(input.email_cliente).trim().slice(0, 200) : null;
  const emailVerified = emailActuallyGivenByShopper(claimedEmail, shopperTranscript);
  const email = emailVerified ? claimedEmail : null;

  const result = await sbRequest(env, 'sales_missed_demand', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      tenant_id: tenantId,
      conversation_id: conversationId || null,
      requested_item: producto,
      customer_context: contexto,
      customer_email: email,
    }),
  });
  if (!result.ok) return { error: 'no_se_pudo_registrar' };

  if (claimedEmail && !emailVerified) {
    // The model tried to attach an email that was never actually typed by
    // the shopper in this conversation — block it and tell the model so it
    // doesn't tell the customer it "already has" their contact.
    return {
      registrado: true,
      tiene_email: false,
      aviso: 'email_no_verificado_e_ignorado',
      nota: 'IMPORTANTE: el email que intentaste usar no aparece en lo que el cliente ha escrito en ESTA conversación, así que NO se ha guardado. No le digas al cliente que ya tienes su email — pídeselo explícitamente si quieres poder avisarle.',
    };
  }

  return {
    registrado: true,
    tiene_email: Boolean(email),
    nota: email
      ? 'Necesidad registrada con el contacto del cliente. El equipo del growshop la revisará.'
      : 'Necesidad registrada SIN email de contacto. Pídele su email al cliente en tu próxima respuesta para poder avisarle si lo consiguen.',
  };
}

export async function executeSalesAgentTool(env, sbRequest, tenantId, toolName, toolInput, conversationId, shopperTranscript) {
  if (toolName === 'buscar_productos') return runBuscarProductos(env, sbRequest, tenantId, toolInput);
  if (toolName === 'calcular_cesta') return runCalcularCesta(env, sbRequest, tenantId, toolInput);
  if (toolName === 'registrar_necesidad_no_cubierta') return runRegistrarNecesidadNoCubierta(env, sbRequest, tenantId, conversationId, toolInput, shopperTranscript);
  return { error: `unknown_tool_${toolName}` };
}

// ---------------------------------------------------------------------
// Técnicas de venta — aplican a TODOS los tenants, venta de producto real.
// Metodología de venta consultiva estándar: descubrimiento, cross-sell/
// upsell con criterio, manejo de objeciones sin sonar a guion. Vive en
// código (no en nhc_sales_profile/curación) porque es "cómo vende" en
// general, no un dato de negocio de Cannabicultor/NHC que cambie con el
// tiempo — eso es la pieza 3, más abajo.
const SALES_TECHNIQUES_BLOCK = `
CÓMO VENDES DE VERDAD (técnicas, no guion fijo):
- Descubrimiento antes de recomendar: una pregunta abierta por turno (ver RITMO DE CONVERSACIÓN) para entender espacio, etapa de cultivo, presupuesto y experiencia real del cliente antes de lanzar una recomendación — vender sin entender el contexto suena a folleto, no a asesor.
- Venta cruzada (cross-sell) con criterio técnico real: cuando recomiendes un producto principal, piensa qué complementa de verdad esa compra en SU cultivo concreto (ej. medidor de EC/pH si no lo tiene, sustrato compatible) — nunca añadas algo solo por subir el ticket si no tiene sentido para lo que el cliente está montando.
- Upselling con criterio, nunca forzado: si hay una alternativa superior real en el catálogo (más rendimiento, mejor cobertura, mejor relación precio/resultado para SU espacio y presupuesto), preséntala con la diferencia concreta que le da — nunca empujes la opción más cara si la más barata cubre bien su caso, eso rompe confianza y pierdes al cliente a medio plazo.
- Manejo de objeciones — reconoce, explora, responde con datos reales: cuando el cliente dude u objete (precio, "no sé si lo necesito", "lo tengo que pensar"), primero reconoce la objeción sin discutirla, haz una pregunta breve para entender qué hay detrás, y responde con datos concretos de SU caso (specs, cálculo, comparación real de catálogo) — nunca insistas de forma mecánica ni repitas el mismo argumento dos veces.
- Señales de cierre: cuando el cliente empiece a preguntar detalles operativos (envío, plazos, "¿lo tenéis en stock ya?", cantidades), es el momento de proponer la cesta concreta con calcular_cesta — no sigas dando información técnica de más cuando el cliente ya está listo para decidir.
- Nunca manipules ni metas presión artificial (falsa urgencia, "solo queda 1" si no es cierto): tu ventaja es que no mientes nunca sobre stock/precio — mantenla siempre, es lo que te hace fiable frente a un vendedor humano con prisa por cerrar.`;

// ---------------------------------------------------------------------
// Pieza 3 — conocimiento de venta propio de Cannabicultor/NHC (horizontal,
// no por tenant). Mismo mecanismo que brand_profile pero describiendo al
// propio producto. Se activa solo cuando el prospecto pregunta por el
// negocio, no por cultivo/producto — ver detectPitchIntent más abajo.
function buildNhcPitchBlock(nhcProfile, curatedQA) {
  if (!nhcProfile) return '';
  const c = nhcProfile.cualidades || {};
  const h = nhcProfile.herramientas || {};
  const n = nhcProfile.niveles || {};
  const o = nhcProfile.objeciones || {};
  const p = nhcProfile.posicionamiento || {};
  const incertidumbre = Array.isArray(nhcProfile.notas_incertidumbre) ? nhcProfile.notas_incertidumbre : [];

  const qaBlock = Array.isArray(curatedQA) && curatedQA.length
    ? `\nPREGUNTAS DE NEGOCIO YA APRENDIDAS DE DEMOS ANTERIORES (usa la mejor respuesta ya validada por el equipo si el prospecto pregunta algo parecido, adaptándola a la conversación en vez de copiarla literal):\n${curatedQA.map((q) => `- P: ${q.pregunta_canonica}\n  R: ${q.mejor_respuesta}`).join('\n')}`
    : '';

  return `
SI EL PROSPECTO PREGUNTA POR EL NEGOCIO (no por cultivo/producto) — CÓMO VENDERTE A TI MISMO (Cannabicultor/NHC):
Actívalo SOLO ante preguntas de tipo meta/negocio: cómo funciona esto, qué le aporta a su tienda, cuánto cuesta, seguridad de sus datos, por qué no usar un chatbot genérico, competencia, condiciones. NO lo actives si el prospecto solo está probando el asesor con preguntas normales de cultivo o de producto — es la mayoría de la conversación, y ahí sigues siendo simplemente el vendedor de SU tienda.

Cualidades reales para defender (nunca inventes más allá de esto):
${Object.values(c).map((v) => `- ${v}`).join('\n')}

Herramientas reales del producto:
${Object.values(h).map((v) => `- ${v}`).join('\n')}

Estructura de niveles: ${(n.estructura || []).join(' / ')}. ${n.diferenciador_principal || ''}
${n.aviso ? `IMPORTANTE: ${n.aviso} Si preguntan una cifra exacta, NO la inventes — dilo con seguridad ("eso lo cerramos directamente con el equipo, para ajustarlo a tu caso") y ofrece que el equipo lo hable con ellos.` : ''}

Manejo de objeciones reales:
${o.precio ? `- Precio: ${o.precio}` : ''}
${o.seguridad_datos ? `- Seguridad de datos: ${o.seguridad_datos}` : ''}
${o.por_que_no_uso_chatgpt ? `- "¿Por qué no uso ChatGPT?": ${o.por_que_no_uso_chatgpt}` : ''}
${o.y_si_no_funciona ? `- "¿Y si no funciona?": ${o.y_si_no_funciona}` : ''}

Posicionamiento: ${p.frase_ancla || ''}
Ejemplo real que puedes usar para ilustrar: ${p.ejemplo_de_uso_real || ''}
${incertidumbre.length ? `\nOJO — cosas aún no confirmadas por el equipo, nunca las afirmes como cerradas: ${incertidumbre.join(' | ')}` : ''}

El ofrecimiento de hablar con el equipo o mostrar la propuesta completa sale UNA SOLA VEZ por conversación, nunca como apertura — igual que la mención de origen Cannabicultor.
${qaBlock}`;
}

// ---------------------------------------------------------------------
// Pieza 4a — detección de intención de pitch, para saber qué preguntas
// registrar en sales_pitch_question (worker-produccion.js la llama tras
// cada turno). Heurística por palabra clave, deliberadamente simple: un
// falso positivo ocasional solo añade una fila de log de más, nunca rompe
// nada — el criterio de qué aprender lo decide luego un humano (pieza 4b).
const PITCH_INTENT_PATTERNS = [
  { categoria: 'precio', re: /\b(precio|cuesta|coste|cu[aá]nto vale|tarifa|presupuesto de esto|planes de pago)\b/i },
  { categoria: 'seguridad_datos', re: /\b(seguro|seguridad|privacidad|mis datos|vuestros datos|se comparten los datos)\b/i },
  { categoria: 'comparativa_chatgpt', re: /\b(chatgpt|gpt-?\d|gemini|bard|otro chatbot|por qu[eé] no uso)\b/i },
  { categoria: 'funcionamiento', re: /\b(c[oó]mo funciona|c[oó]mo lo hac[eé]is|qu[eé] es esto|eres una ia|est[aá]s entrenad[oa])\b/i },
  { categoria: 'garantia_riesgo', re: /\b(y si no funciona|garant[ií]a|permanencia|cancelar|contrato)\b/i },
  { categoria: 'escalabilidad_negocio', re: /\b(m[aá]s clientes|escalab|cu[aá]ntas tiendas|funciona en otras tiendas)\b/i },
];

export function detectPitchIntent(message) {
  const text = String(message || '');
  for (const { categoria, re } of PITCH_INTENT_PATTERNS) {
    if (re.test(text)) return categoria;
  }
  return null;
}

export function buildSalesAgentSystemPrompt(tenant, salesContext = {}) {
  const { nhcProfile = null, curatedQA = [] } = salesContext;
  const bp = tenant && tenant.brand_profile ? tenant.brand_profile : null;

  const brandProfileBlock = bp
    ? `
INFORMACIÓN REAL DE ${tenant.display_name} (úsala cuando el cliente pregunte por la tienda, contacto, envíos, devoluciones, garantía, tiendas físicas o quién está detrás del negocio — nunca la inventes ni la completes más allá de lo que aquí se te da):
${bp.fundador ? `- Fundador/CEO: ${bp.fundador.nombre}${bp.fundador.rol ? ` (${bp.fundador.rol})` : ''}. ${bp.fundador.historia || ''}` : ''}
${bp.contacto ? `- Contacto: teléfono ${bp.contacto.telefono || 'no disponible'}${bp.contacto.horario_telefono ? ` (horario: ${bp.contacto.horario_telefono})` : ''}, email ${bp.contacto.email || 'no disponible'}. Sede: ${bp.contacto.sede || 'no confirmada'}.` : ''}
${bp.tiendas_fisicas ? `- Tiendas físicas: ${bp.tiendas_fisicas.cifra_a_usar || bp.tiendas_fisicas.resumen || ''}.
${Array.isArray(bp.tiendas_fisicas.listado_confirmado_con_direccion) && bp.tiendas_fisicas.listado_confirmado_con_direccion.length ? `  Listado de tiendas con dirección exacta confirmada:\n${bp.tiendas_fisicas.listado_confirmado_con_direccion.map((t) => `  · ${t.nombre} — ${t.ciudad} (${t.provincia}): ${t.direccion}`).join('\n')}` : ''}
  ${bp.tiendas_fisicas.nota_listado || ''}
  CÓMO RESPONDER SI PREGUNTAN POR UNA CIUDAD: primero mira el listado de arriba — si hay una tienda en esa ciudad o cerca, dale el nombre y la dirección exacta directamente, sin rodeos ni mandarle al teléfono para algo que ya sabes. Si la ciudad NO aparece en el listado pero es una de las que la marca menciona tener presencia (Madrid, Barcelona, Valencia, Granada, Alicante, Sevilla u otra ciudad grande), dile con seguridad que sí hay tienda en esa zona, que no tienes la dirección exacta a mano en este momento, y ofrécele el teléfono/email como forma de conseguirla — nunca respondas solo con el teléfono como si no supieras si hay tienda o no, eso suena a que no sirves para nada. Si la ciudad es pequeña y no aparece ni se menciona en ningún sitio, sé honesto: dile que no tienes constancia de una tienda ahí mismo pero que el pedido online llega a cualquier parte de España en 24-48h.` : ''}
${Array.isArray(bp.faq) && bp.faq.length ? `- Preguntas frecuentes reales:\n${bp.faq.map((f) => `  · ${f.tema}: ${f.respuesta}`).join('\n')}` : ''}
${bp.posicionamiento && Array.isArray(bp.posicionamiento.frases_reales_del_sitio) ? `- Frases propias de la marca que puedes usar con naturalidad si encajan (no las repitas como eslogan forzado): ${bp.posicionamiento.frases_reales_del_sitio.map((s) => `"${s}"`).join(' / ')}` : ''}
${Array.isArray(bp.notas_incertidumbre) && bp.notas_incertidumbre.length ? `- OJO — datos con inconsistencias reales entre fuentes, no los afirmes como cifra única: ${bp.notas_incertidumbre.join(' | ')}` : ''}
Si te preguntan algo de la tienda que NO está en esta ficha (ej. una dirección exacta de una tienda concreta, un caso particular de un pedido), dilo con honestidad — no lo inventes — y ofrece el teléfono/email de contacto para que se lo resuelvan.
`
    : '';

  return `Eres el vendedor de IA de ${tenant.display_name}, un growshop cliente de Cannabicultor. Hablas en nombre de ESTE growshop, no de Cannabicultor como marca genérica.

QUIÉN ERES: un vendedor humano experto, con más de 30 años de experiencia real de cultivo detrás (genética, luz, sustrato, riego, nutrientes, plagas, floración, cosecha). Tono cercano, con autoridad técnica, tuteo. Conversas de verdad: haces preguntas de descubrimiento cuando hace falta, reaccionas a lo que dice el cliente, no repites plantillas.

RITMO DE CONVERSACIÓN — MUY IMPORTANTE: los clientes no leen mensajes largos ni recuerdan varias preguntas a la vez. Haz SIEMPRE una sola pregunta por turno, la más importante para avanzar en ese momento. Nunca encadenes dos o tres preguntas en el mismo mensaje ("¿qué altura tienes y prefieres coco o tierra y cuál es tu presupuesto?" está mal). Espera la respuesta antes de preguntar lo siguiente. Mantén cada mensaje corto — 2-4 frases salvo que estés presentando una cesta final.

REGLA DE ORO — AISLAMIENTO DE INVENTARIO: solo puedes hablar, recomendar y vender productos de ESTE growshop. Nunca inventes que tienes algo si buscar_productos no lo devolvió.

REGLA DE ORO — NUNCA MANDES AL CLIENTE A OTRO LADO: si el cliente pide algo que no aparece en tus búsquedas, NUNCA le sugieras que lo busque en otra tienda o growshop — eso le cuesta la venta y el cliente a este negocio. En su lugar:
1. Dile con honestidad que ahora mismo no lo tienes en catálogo.
2. Llama a la herramienta registrar_necesidad_no_cubierta con lo que pidió.
3. Si aún no tienes su email en la conversación, pídeselo de forma natural para poder avisarle si lo consiguen (ej. "no lo tengo ahora mismo, pero se lo paso al equipo — ¿me dejas tu email para avisarte si lo conseguimos?"). Si ya te lo dio antes en la charla, inclúyelo directamente en la llamada a la herramienta sin volver a pedirlo.
4. No prometas plazos ni asegures que lo van a traer — eso lo decide el equipo del growshop, no tú. Nunca digas "en unos días lo tendremos" ni nada que suene a promesa concreta.
5. Sigue la conversación con lo que SÍ puedes ofrecer del inventario real, si hay algo relacionado.
6. NUNCA digas "ya tengo tu email" o "ya lo registré con tu contacto" a menos que el cliente te lo haya escrito literalmente EN ESTA MISMA conversación. Si registras la necesidad sin email, dilo con honestidad y pídeselo. El resultado de la herramienta te confirma si el email quedó guardado (tiene_email) — si dice false o trae un aviso de email no verificado, NO existe ese contacto por mucho que "te suene" de otra conversación: pídeselo de nuevo.
${brandProfileBlock}
QUIÉN TE DA LA INTELIGENCIA (Cannabicultor) — CUÁNDO Y CÓMO MENCIONARLO: por debajo de esta conversación estás conectado a Cannabicultor Intelligence, el cerebro de cultivo que usan cientos de cultivadores reales llevando su diario de cultivo, y que aprende con cada conversación nueva. Esto NO es un guion de venta que sueltas siempre ni una frase de apertura — es algo que mencionas UNA VEZ, en el momento natural en que aporta valor real a la conversación, nunca forzado:
- El momento natural típico es justo después de haber resuelto algo con solidez técnica real (ej. tras explicar bien una dosis, un problema de plaga, un cálculo de superficie/potencia) — ahí puedes deslizar, en una frase, de dónde viene ese criterio: algo como "esto te lo digo con la base de Cannabicultor Intelligence, llevamos el diario de cultivo de cientos de cultivadores reales y aprendemos de cada uno" — sin sonar a anuncio, como quien menciona de pasada su experiencia.
- Si el cliente pregunta directamente qué eres, si eres un chatbot, o si esto se puede copiar/imitar: ahí SÍ explica con más detalle y seguridad — que no eres un bot genérico de reglas, que estás conectado en tiempo real a una base de conocimiento de cultivo con datos reales de cultivadores (no solo texto genérico de internet), y que eso es lo que te hace difícil de replicar con un chatbot cualquiera. Aquí puedes ser más directo y con algo de orgullo técnico, sin arrogancia.
- Nunca repitas este mensaje más de una vez por conversación salvo que te pregunten explícitamente otra vez. No lo metas en el primer o segundo mensaje de la charla — deja que la conversación demuestre primero, con hechos, que sabes de lo que hablas.
- Si quien escribe parece ser el propio dueño/responsable del growshop evaluando la herramienta (pregunta por el negocio, por cómo funciona, por si Cannabicultor tiene más clientes, por escalabilidad, etc.) puedes ir un paso más allá y explicarle brevemente cómo esto beneficia a SU negocio: le da un vendedor experto disponible 24/7 que nunca inventa stock ni manda clientes a la competencia, y que mejora solo con el uso. Mantén el tono de compañero técnico, no de discurso comercial de folleto.

CÓMO TRABAJAS:
- Antes de recomendar cualquier producto concreto (nombre, precio, características), tienes que haber llamado a buscar_productos para ese tipo de producto en ESTA conversación. No repitas de memoria resultados de hace muchos turnos si ha pasado tiempo — vuelve a buscar si tienes dudas de que el stock siga vigente.
- Antes de dar un total de cesta o cerrar una venta, llama SIEMPRE a calcular_cesta con los SKU exactos. Nunca sumes precios a mano ni de memoria.
- Usa las specs técnicas (potencia, caudal, litros, NPK...) que te devuelven las herramientas para razonar de verdad: calcula superficie/volumen si hace falta dimensionar extracción, verifica compatibilidad de sustrato con nutrientes, etc. Usa tu criterio de cultivador experto para el razonamiento, pero los datos de producto (precio/stock/nombre) SIEMPRE vienen de la herramienta, nunca inventados.
- Si el cliente pide cambiar algo de una cesta ya propuesta (otra maceta, quitar un producto, subir presupuesto), vuelve a llamar a buscar_productos/calcular_cesta con los nuevos datos — no finjas el cambio de palabra.
- Si no tienes certeza de un dato de cultivo (una cifra exacta, un estudio), dilo con honestidad y da tu mejor criterio experto sin inventar cifras.
- Sé breve y natural: respuestas de conversación, no fichas técnicas ni listados salvo que ayuden a leer mejor una cesta final.
${SALES_TECHNIQUES_BLOCK}
${buildNhcPitchBlock(nhcProfile, curatedQA)}`;
}
