/**
 * growers-alliance-ai — fuente de verdad del Worker de chat (Cannabicultor)
 *
 * Snapshot prod 2026-08-10 + fallback multi-proveedor (DeepSeek → Anthropic → OpenAI;
 * con foto: Anthropic → OpenAI, DeepSeek se omite).
 * RAG (kb_chunks / match_chunks / Voyage) sin cambios.
 *
 * Secrets: ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, JWT_SECRET, …
 * Entrypoint de wrangler.toml (main = "worker-produccion.js"). Deploy: npx wrangler deploy.
 */

/**
 * Cannabicultor IA — Cloudflare Worker
 */

const ALLOWED_ORIGINS = [
  'https://cannabicultor.com',
  'https://www.cannabicultor.com',
  'http://localhost:8787',
  'http://127.0.0.1:8787',
];

const SUPABASE_URL = 'https://gfyrsrdnvgnhtsuexjkb.supabase.co';
const JWT_TTL_SEC = 8 * 60 * 60;
const RESET_TTL_MS = 60 * 60 * 1000;
const ONBOARDING_TTL_SEC = 2 * 60 * 60;

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function base64UrlEncode(bytes) {
  let str = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function b64ToBytes(b64) {
  const clean = String(b64 || '').replace(/^data:[^,]+,/, '');
  const raw = atob(clean);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function importJwtKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signJwt(payload, secret) {
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importJwtKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${base64UrlEncode(new Uint8Array(sig))}`;
}

async function verifyJwt(token, secret) {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  const key = await importJwtKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC', key,
    base64UrlDecode(sigB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  );
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;
  return payload;
}

function makeTokenClaims(email, plan) {
  const now = Math.floor(Date.now() / 1000);
  return { email, plan: plan || 'libre', iat: now, exp: now + JWT_TTL_SEC };
}

function makeOnboardingClaims(sid) {
  const now = Math.floor(Date.now() / 1000);
  return { scope: 'onboarding', sid, iat: now, exp: now + ONBOARDING_TTL_SEC };
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password) {
  const salt = crypto.randomUUID();
  const hash = await sha256Hex(salt + password);
  return `${salt}:${hash}`;
}

async function verifyPassword(password, stored) {
  if (!stored || !password) return false;
  const [salt, expected] = String(stored).split(':');
  if (!salt || !expected) return false;
  const hash = await sha256Hex(salt + password);
  return hash === expected;
}

async function sbRequest(env, path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { ok: res.ok, status: res.status, data };
}

async function getUserByEmail(env, email) {
  const q = `Usuarios?email=eq.${encodeURIComponent(email)}&select=*&limit=1`;
  const res = await sbRequest(env, q, { method: 'GET' });
  if (!res.ok || !Array.isArray(res.data) || !res.data.length) return null;
  return res.data[0];
}

async function createUser(env, row) {
  return sbRequest(env, 'Usuarios', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
}

async function updateUser(env, id, patch) {
  return sbRequest(env, `Usuarios?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
}

// =========================================================================
// FOTOS
// =========================================================================
const _SOI = 0xFFD8, _SOS = 0xFFDA, _EOI = 0xFFD9;

function esJpeg(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
}

function limpiarMetadatosJpeg(bytes) {
  const buf = bytes.buffer ? bytes.buffer : bytes;
  const view = new DataView(buf, bytes.byteOffset || 0, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== _SOI) return bytes;
  const conservar = [[0, 2]];
  let offset = 2;
  while (offset < view.byteLength) {
    if (view.getUint8(offset) !== 0xFF) { offset++; continue; }
    const marker = view.getUint16(offset);
    if (marker === _SOS) { conservar.push([offset, view.byteLength]); break; }
    if (marker === _EOI) { conservar.push([offset, offset + 2]); break; }
    const len = view.getUint16(offset + 2);
    const segEnd = offset + 2 + len;
    const esMetadato = (marker >= 0xFFE1 && marker <= 0xFFEF) || marker === 0xFFFE;
    if (!esMetadato) conservar.push([offset, segEnd]);
    offset = segEnd;
  }
  const total = conservar.reduce((n, [a, b]) => n + (b - a), 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const [a, b] of conservar) { out.set(bytes.subarray(a, b), p); p += (b - a); }
  return out;
}

async function subirFotoStorage(env, bytes, ruta) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/plantas/${ruta}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!res.ok) throw new Error(`Storage ${res.status}: ${await res.text()}`);
  return ruta;
}

async function registrarConsulta(env, datos) {
  return sbRequest(env, 'ia_consultas', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      email: datos.email || null,
      session_id: datos.sessionId || null,
      tipo: datos.tipo,
      imagen_url: datos.imagenRuta || null,
      pregunta: datos.pregunta || null,
      respuesta: datos.respuesta || null,
      canal: datos.canal || 'web',
      categoria: datos.categoria || 'diagnostico',
      nivel_usuario: datos.nivel || null,
    }),
  });
}

async function handleOnboardingAnswer(body, env) {
  const sessionId = String(body.session_id || '').trim();
  const paso = String(body.paso || '').trim();
  const clave = String(body.clave || '').trim();
  const valor = body.valor != null ? String(body.valor) : null;
  if (!sessionId || !paso || !clave) return { status: 400, data: { error: 'Faltan datos' } };
  const res = await sbRequest(env, 'onboarding_respuestas', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ session_id: sessionId, paso, clave, valor }),
  });
  if (!res.ok) return { status: 500, data: { error: 'No se pudo guardar' } };
  return { status: 200, data: { ok: true } };
}

async function backfillSesion(env, sessionId, email) {
  if (!sessionId || !email) return;
  await sbRequest(env, `ia_consultas?session_id=eq.${encodeURIComponent(sessionId)}&email=is.null`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ email }),
  });
  await sbRequest(env, `onboarding_respuestas?session_id=eq.${encodeURIComponent(sessionId)}&email=is.null`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ email }),
  });
}

async function volcarPerfilCultivo(env, userId, sessionId, perfilDirecto) {
  const perfil = {};
  if (perfilDirecto && typeof perfilDirecto === 'object') {
    for (const [k, v] of Object.entries(perfilDirecto)) {
      if (v != null && v !== '') perfil[k] = v;
    }
  }
  if (sessionId) {
    const q = `onboarding_respuestas?session_id=eq.${encodeURIComponent(sessionId)}&select=clave,valor`;
    const res = await sbRequest(env, q, { method: 'GET' });
    if (res.ok && Array.isArray(res.data)) {
      for (const fila of res.data) {
        if (fila.clave && fila.valor != null && perfil[fila.clave] == null) {
          perfil[fila.clave] = fila.valor;
        }
      }
    }
  }
  if (Object.keys(perfil).length === 0) return;
  perfil.origen = 'onboarding';
  perfil.actualizado = new Date().toISOString();
  await updateUser(env, userId, { perfil_cultivo: perfil });
}

function extraerFotoYPregunta(messages) {
  let imagen = null, pregunta = null;
  for (const m of (messages || [])) {
    if (m.role !== 'user') continue;
    if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part.type === 'text' && part.text) pregunta = part.text;
        if (part.type === 'image') {
          const src = part.source || part;
          if (src.data) imagen = { data: src.data, media_type: src.media_type || 'image/jpeg' };
        }
      }
    } else if (typeof m.content === 'string') {
      pregunta = m.content;
    }
  }
  return { imagen, pregunta };
}

async function guardarDiagnostico(env, { identity, messages, reply }) {
  try {
    const { imagen, pregunta } = extraerFotoYPregunta(messages);
    let imagenRuta = null;
    const tipo = imagen ? 'foto' : 'texto';
    if (imagen) {
      const bytes = b64ToBytes(imagen.data);
      if (imagen.media_type === 'image/jpeg' && esJpeg(bytes)) {
        const limpia = limpiarMetadatosJpeg(bytes);
        const carpeta = identity.email || identity.sid || 'anon';
        const ruta = `${carpeta}/${crypto.randomUUID()}.jpg`;
        imagenRuta = await subirFotoStorage(env, limpia, ruta);
      }
    }
    await registrarConsulta(env, {
      email: identity.email || null,
      sessionId: identity.sid || null,
      tipo, imagenRuta, pregunta, respuesta: reply, canal: 'web',
    });
    // Foto en chat → crea/actualiza entrada del diario (solo usuarios autenticados)
    if (imagenRuta && identity.email) {
      try {
        await upsertDiarioFoto(env, identity.email, imagenRuta, pregunta, reply);
      } catch (_) { /* no bloquear el diagnóstico */ }
    }
  } catch (_) {}
}

// =========================================================================
// RAG
// =========================================================================
async function generarEmbeddingConsulta(texto, env) {
  if (!env.VOYAGE_API_KEY || !texto) return null;
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.VOYAGE_API_KEY}` },
    body: JSON.stringify({ model: 'voyage-multilingual-2', input: [texto], input_type: 'query' }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.data?.[0]?.embedding || null;
}

async function buscarChunksRelevantes(embedding, env) {
  if (!embedding) return [];
  const res = await sbRequest(env, 'rpc/match_chunks', {
    method: 'POST',
    body: JSON.stringify({ query_embedding: embedding, match_count: 6, min_similarity: 0.3 }),
  });
  if (!res.ok || !Array.isArray(res.data)) return [];
  return res.data;
}

// =========================================================================
// BREVO
// =========================================================================
async function brevoFetch(env, path, body, method = 'POST') {
  const res = await fetch(`https://api.brevo.com/v3${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'api-key': env.BREVO_API_KEY },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  if (text) { try { data = JSON.parse(text); } catch { data = { raw: text }; } }
  return { ok: res.ok, status: res.status, data };
}

async function brevoAddContact(env, email, attributes = {}) {
  const payload = { email, attributes, updateEnabled: true };
  if (env.BREVO_LIST_ID) payload.listIds = [Number(env.BREVO_LIST_ID)];
  return brevoFetch(env, '/contacts', payload);
}

async function brevoUpdatePlan(env, email, plan) {
  const encoded = encodeURIComponent(email);
  return brevoFetch(env, `/contacts/${encoded}`, { attributes: { PLAN: plan } }, 'PUT');
}

async function brevoSendTemplate(env, email, templateId, params = {}) {
  return brevoFetch(env, '/smtp/email', { to: [{ email }], templateId: Number(templateId), params });
}

async function brevoSendResetEmail(env, email, token) {
  const site = env.SITE_URL || 'https://cannabicultor.com';
  const link = `${site}/reset-password.html?token=${encodeURIComponent(token)}`;
  if (env.BREVO_RESET_TEMPLATE_ID) {
    return brevoSendTemplate(env, email, env.BREVO_RESET_TEMPLATE_ID, { reset_link: link, link });
  }
  return brevoFetch(env, '/smtp/email', {
    sender: { email: 'noreply@cannabicultor.com', name: 'Cannabicultor IA' },
    to: [{ email }],
    subject: 'Recuperar contraseña — Cannabicultor IA',
    htmlContent: `<p>Hola,</p><p>Recupera tu contraseña aquí (válido 1 hora):</p><p><a href="${link}">${link}</a></p>`,
  });
}

// =========================================================================
// CHAT
// =========================================================================
const SCOPE_PROMPT = `Eres el asistente de IA de Cannabicultor, especializado exclusivamente en cultivo de cannabis: variedades/genética, cultivo (luz, sustrato, riego, VPD, nutrientes, fertilizantes, plagas, floración, cosecha), diseño de espacios de cultivo, y temas directamente relacionados con la comunidad cultivadora en España.

Si el usuario pregunta algo que NO tiene relación con cultivo de cannabis o el uso de esta plataforma (por ejemplo: reparar un coche, recetas de cocina no relacionadas, tareas de programación ajenas, preguntas generales de cultura, etc.), NO respondas la pregunta. En su lugar, responde brevemente (1-2 frases) indicando que solo puedes ayudar con temas de cultivo de cannabis, y sugiere reformular la pregunta dentro de ese ámbito. No uses el contexto RAG en ese caso, no expliques el motivo con detalle, sé breve.`;

const SCOPE_REJECT_REPLY =
  'Solo puedo ayudarte con cultivo de cannabis y el uso de Cannabicultor. Reformula tu pregunta en ese ámbito (luz, riego, nutrientes, genética, plagas, sala de cultivo, etc.) y te ayudo.';

const VISION_PROMPT = `
ANÁLISIS DE FOTOS:
- Si el usuario envía una imagen, examínala: hojas, manchas, plagas, mohos, deficiencias, estrés.
- Describe primero lo que VES (1-2 frases), luego diagnóstico y pasos siguientes.
- Si la foto no es clara, pide otra mejor. No inventes detalles invisibles.`;

function buildSystemPrompt(perfil, chunks) {
  // Scope primero (antes del RAG); el LLM lo ve aunque la heurística no sea concluyente.
  let base = `${SCOPE_PROMPT}

Eres Cannabicultor IA de Growers Alliance. Tono: autoridad con calidez. Tuteo respetuoso.
Primera frase responde DIRECTAMENTE. Máx 8-12 líneas. Abre UNA puerta al final.
NUNCA inventes estudios ni legislación.${VISION_PROMPT}`;

  if (chunks && chunks.length > 0) {
    const contexto = chunks.map((c, i) => {
      const fuente = c.libro_propuesto || 'Base de conocimiento';
      return `[${i + 1}] ${fuente}:\n${c.content}`;
    }).join('\n\n');
    base += `\n\nCONOCIMIENTO TECNICO RELEVANTE (basa tu respuesta en esto):\n${contexto}\n\nINSTRUCCIONES:\n- Usa el conocimiento anterior cuando sea relevante.\n- Si la pregunta está fuera del ámbito de cultivo (ver scope arriba), IGNORA este contexto y rechaza en 1-2 frases.\n- Si algun fragmento esta en ingles, sintetizalo en espanol. NUNCA muestres texto en ingles al usuario.\n- Puedes citar la fuente entre parentesis si aporta credibilidad.\n- Si el conocimiento no cubre la pregunta, responde con criterio de cultivador experto.`;
  } else {
    base += `\n\nNOTA INTERNA: No se encontraron documentos especificos en la base de conocimiento para esta consulta. Responde con tu criterio de cultivador experto con 30 anos de experiencia. Se honesto si algo excede tu conocimiento tecnico. No inventes fuentes ni estudios.`;
  }

  if (!perfil) return base + '\n\nUsuario en Plan Libre. Sin datos de cultivo registrados.';
  const t = typeof perfil === 'string' ? perfil : JSON.stringify(perfil, null, 2);
  return base + '\n\nPERFIL:\n' + t;
}

/** Texto del último mensaje de usuario (solo partes text). */
function extractLastUserText(messages) {
  const ultimo = [...(messages || [])].reverse().find((m) => m.role === 'user');
  if (!ultimo) return '';
  if (Array.isArray(ultimo.content)) {
    return ultimo.content
      .filter((p) => p && p.type === 'text')
      .map((p) => p.text || '')
      .join(' ')
      .trim();
  }
  return String(ultimo.content || '').trim();
}

/**
 * Guarda barata off-topic (keywords/heurística). Sin llamadas de red.
 * - true  → claramente fuera de ámbito: rechazar sin LLM/RAG
 * - false → on-topic, saludo, foto, o dudoso: dejar pasar al LLM (+ scope en system)
 *
 * Conservadora: solo bloquea si hay señales fuertes off-topic y NINGUNA on-topic.
 */
function isClearlyOffTopicCultivo(text, withVision) {
  // Foto de planta → siempre dejar al modelo de visión
  if (withVision) return false;

  const raw = String(text || '').trim();
  if (raw.length < 4) return false;

  const t = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Saludos / meta de la plataforma → on-topic
  if (/^(hola|hey|buenas|buenos dias|buenas tardes|buenas noches|gracias|ok|vale|si|no)\b/.test(t) && t.length < 40) {
    return false;
  }
  if (/\b(cannabicultor|growers?\s*alliance|mi (cuenta|plan|cultivo|perfil)|onboarding|test de (acceso|cultivador))\b/.test(t)) {
    return false;
  }

  const onTopic = [
    'cannabis', 'marihuana', 'marijuana', 'weed', 'cogollo', 'cogollos', 'planta', 'plantas',
    'cultivo', 'cultivar', 'cultivador', 'indoor', 'outdoor', 'invernadero', 'armario',
    'sativa', 'indica', 'hibrida', 'hibrido', 'ruderalis', 'autoflor', 'fotoperiodo', 'fotoperiodica',
    'genetica', 'variedad', 'variedades', 'semilla', 'semillas', 'esqueje', 'esquejes', 'clon',
    'floracion', 'vegetativo', 'cosecha', 'secado', 'curado', 'trichoma', 'tricoma', 'resina',
    'luz', 'led', 'hps', 'lumens', 'ppfd', 'dli', 'sustrato', 'coco', 'tierra', 'hydro', 'hidro',
    'riego', 'regando', 'regar', 'ph', 'ec', 'ppm', 'vpd', 'humedad', 'temperatura',
    'nutriente', 'nutrientes', 'fertilizante', 'abono', 'npk', 'calmag', 'nitrogeno', 'fosforo', 'potasio',
    'plaga', 'plagas', 'hongo', 'oidio', 'mildiu', 'trips', 'arana', 'mosca blanca', 'thrips',
    'maceta', 'macetas', 'sala de cultivo', 'tienda de cultivo', 'grow shop', 'extraccion', 'filtro de carbon',
    'poda', 'lst', 'scrog', 'sog', 'topping', 'fim', 'deficiencia', 'exceso', 'quemadura',
    'thc', 'cbd', 'terpeno', 'landrace', 'breeder', 'banco de semillas', 'germinacion', 'plantula',
  ];

  const offTopic = [
    // movilidad / hogar ajeno
    'coche', 'auto ', 'automovil', 'motor', 'aceite de motor', 'neumatico', 'itv', 'matricula',
    'lavadora', 'nevera', 'aire acondicionado del coche',
    // cocina genérica (no edibles cannabis)
    'receta de cocina', 'como cocinar', 'pastel de chocolate', 'paella', 'macarrones',
    // programación / IT ajeno
    'javascript', 'typescript', 'python', 'react native', 'kubernetes', 'docker compose',
    'sql server', 'excel formula', 'powerpoint', 'escribir codigo', 'programar una app',
    'github actions', 'machine learning tutorial',
    // cultura / general
    'quien gano el partido', 'resultado del futbol', 'elecciones presidenciales',
    'capital de francia', 'traduce este texto al', 'hazme los deberes',
    'reparar el ordenador', 'windows no arranca', 'iphone no carga',
    'cita romantica', 'horoscopo', 'loteria',
  ];

  // Match por palabra (evita que "ec" dispare en "receta", "led" en "problema", etc.)
  function hasTerm(haystack, term) {
    const k = term.trim().toLowerCase();
    if (!k) return false;
    if (k.includes(' ')) return haystack.includes(k);
    // palabra completa: límites no alfanuméricos
    const re = new RegExp(`(?:^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9]|$)`);
    return re.test(haystack);
  }

  let onHits = 0;
  for (const k of onTopic) {
    if (hasTerm(t, k)) onHits++;
  }
  if (onHits > 0) return false;

  let offHits = 0;
  for (const k of offTopic) {
    if (hasTerm(t, k)) offHits++;
  }

  // Patrones de “cómo se repara/hace X” claramente ajenos sin vocabulario de cultivo
  const offPatterns = [
    /\b(reparar|arreglar)\s+(el\s+)?(coche|moto|pc|ordenador|lavadora|nevera|movil|iphone)\b/,
    /\b(receta|cocinar|hornear)\b.*\b(pollo|pasta|arroz|tarta|bizcocho)\b/,
    /\b(codigo|programa|script)\b.*\b(python|java|javascript|html|css)\b/,
    /\bquien (es|fue|gano|invento)\b/,
    /\bcuanto (es|vale)\s+\d+\s*[\+\-\*\/]\s*\d+/,
  ];
  const patternHit = offPatterns.some((re) => re.test(t));

  // Solo bloqueo si hay evidencia clara off-topic y cero on-topic
  if (offHits >= 1 || patternHit) return true;
  return false;
}

function normalizeMessages(messages) {
  return (messages || []).map((msg) => {
    const role = msg.role === 'assistant' ? 'assistant' : 'user';
    if (role === 'assistant') return { role, content: String(msg.content || '') };
    if (Array.isArray(msg.content)) {
      const blocks = msg.content.map((part) => {
        if (part.type === 'text') return { type: 'text', text: part.text || '' };
        if (part.type === 'image') {
          const src = part.source || part;
          return { type: 'image', source: { type: 'base64', media_type: src.media_type || 'image/jpeg', data: src.data } };
        }
        return null;
      }).filter(Boolean);
      if (blocks.length === 1 && blocks[0].type === 'text') return { role: 'user', content: blocks[0].text };
      return { role: 'user', content: blocks };
    }
    return { role: 'user', content: String(msg.content || '') };
  });
}

function hasVision(messages) {
  return messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image'));
}

/** Timeout por proveedor (ms). Si se agota, se prueba el siguiente. */
const LLM_PROVIDER_TIMEOUT_MS = 10000;

/** Mensaje cuando los tres proveedores fallan (controlado, no genérico de parseo). */
const LLM_ALL_FAILED_USER_MSG =
  'La IA no está disponible temporalmente. Estamos trabajando en ello; inténtalo de nuevo en unos minutos.';

/**
 * fetch con AbortController. Abort = timeout o cancelación → lanza Error.
 */
async function fetchWithTimeout(url, options, timeoutMs = LLM_PROVIDER_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err && (err.name === 'AbortError' || err.message?.includes('abort'))) {
      throw new Error(`timeout_${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convierte mensajes estilo Anthropic (normalizeMessages) → formato OpenAI/DeepSeek.
 * @param {boolean} includeImages - si false, las imágenes se sustituyen por nota de texto
 *   (DeepSeek no soporta visión de forma fiable).
 */
function messagesToOpenAIFormat(messages, includeImages = true) {
  return (messages || []).map((msg) => {
    const role = msg.role === 'assistant' ? 'assistant' : 'user';
    if (role === 'assistant') {
      return { role, content: typeof msg.content === 'string' ? msg.content : String(msg.content || '') };
    }
    if (!Array.isArray(msg.content)) {
      return { role: 'user', content: String(msg.content || '') };
    }
    const parts = [];
    for (const part of msg.content) {
      if (part.type === 'text') {
        parts.push({ type: 'text', text: part.text || '' });
      } else if (part.type === 'image' && part.source) {
        if (includeImages) {
          const mt = part.source.media_type || 'image/jpeg';
          const data = part.source.data || '';
          parts.push({
            type: 'image_url',
            image_url: { url: `data:${mt};base64,${data}` },
          });
        } else {
          parts.push({
            type: 'text',
            text: '[El usuario adjuntó una foto de planta. No puedo verla en este modo de respaldo; responde a la pregunta de texto y pide otra foto si hace falta.]',
          });
        }
      }
    }
    if (parts.length === 0) return { role: 'user', content: '' };
    if (parts.length === 1 && parts[0].type === 'text') {
      return { role: 'user', content: parts[0].text };
    }
    return { role: 'user', content: parts };
  });
}

/** Extrae texto de respuesta Anthropic: content[].text */
function extractAnthropicText(data) {
  if (!data || !Array.isArray(data.content)) return null;
  const texts = data.content
    .filter((b) => b && (b.type === 'text' || typeof b.text === 'string'))
    .map((b) => (b.text || '').trim())
    .filter(Boolean);
  const joined = texts.join('\n').trim();
  return joined || null;
}

/** Extrae texto de respuesta OpenAI: choices[0].message.content */
function extractOpenAIText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (content == null) return null;
  if (typeof content === 'string') {
    const t = content.trim();
    return t || null;
  }
  // Algunos modelos devuelven content como array de partes
  if (Array.isArray(content)) {
    const t = content
      .map((p) => (typeof p === 'string' ? p : p?.text || ''))
      .join('')
      .trim();
    return t || null;
  }
  return null;
}

/** DeepSeek usa el mismo esquema Chat Completions que OpenAI. */
function extractDeepSeekText(data) {
  return extractOpenAIText(data);
}

function logProvider(provider, ok, detail) {
  console.log(JSON.stringify({
    event: 'chat_llm_provider',
    provider,
    ok: !!ok,
    detail: detail ? String(detail).slice(0, 400) : undefined,
    ts: new Date().toISOString(),
  }));
}

/**
 * Anthropic (fallback 1; principal si hay foto). Mismo system + mensajes (visión si aplica).
 */
async function callAnthropic(system, messages, withVision, env) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('missing_ANTHROPIC_API_KEY');

  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: withVision ? 900 : 600,
      system,
      messages,
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`http_${response.status}: ${raw.slice(0, 300)}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('invalid_json_response');
  }

  const text = extractAnthropicText(data);
  if (!text) throw new Error('empty_or_unparseable_content');
  return text;
}

/**
 * OpenAI Chat Completions (fallback 2). Misma system prompt (RAG incluido).
 */
async function callOpenAI(system, anthropicMessages, withVision, env) {
  if (!env.OPENAI_API_KEY) throw new Error('missing_OPENAI_API_KEY');

  const openaiMessages = [
    { role: 'system', content: system },
    ...messagesToOpenAIFormat(anthropicMessages, /* includeImages */ true),
  ];

  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: withVision ? 'gpt-4o' : 'gpt-4o-mini',
      max_tokens: withVision ? 900 : 600,
      messages: openaiMessages,
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`http_${response.status}: ${raw.slice(0, 300)}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('invalid_json_response');
  }

  const text = extractOpenAIText(data);
  if (!text) throw new Error('empty_or_unparseable_content');
  return text;
}

/**
 * DeepSeek (principal en texto). API compatible OpenAI; base_url distinto.
 * Sin imágenes en el payload (includeImages=false). Con foto, generateChatReply lo omite.
 */
async function callDeepSeek(system, anthropicMessages, env) {
  if (!env.DEEPSEEK_API_KEY) throw new Error('missing_DEEPSEEK_API_KEY');

  const openaiMessages = [
    { role: 'system', content: system },
    ...messagesToOpenAIFormat(anthropicMessages, /* includeImages */ false),
  ];

  const response = await fetchWithTimeout('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: 600,
      messages: openaiMessages,
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`http_${response.status}: ${raw.slice(0, 300)}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('invalid_json_response');
  }

  const text = extractDeepSeekText(data);
  if (!text) throw new Error('empty_or_unparseable_content');
  return text;
}

/**
 * Orquesta DeepSeek (principal) → Anthropic → OpenAI.
 *
 * Excepción visión: si hay foto, DeepSeek no soporta imágenes de forma fiable →
 * se salta y se usa Anthropic (visión) → OpenAI (visión).
 * Texto-only: DeepSeek primero (nota de imagen no aplica).
 *
 * Mismo system (chunks RAG) en todos. Un fallo no impide el siguiente.
 * @returns {{ reply: string, provider: string }}
 */
async function generateChatReply(system, anthropicMessages, withVision, env) {
  const failures = [];

  // 1) DeepSeek — principal en texto; se omite si hay foto (sin visión fiable)
  if (withVision) {
    logProvider('deepseek', false, 'skipped_vision_use_anthropic');
    failures.push({ provider: 'deepseek', error: 'skipped_vision' });
  } else {
    try {
      const reply = await callDeepSeek(system, anthropicMessages, env);
      logProvider('deepseek', true);
      return { reply, provider: 'deepseek' };
    } catch (err) {
      const detail = err?.message || String(err);
      logProvider('deepseek', false, detail);
      failures.push({ provider: 'deepseek', error: detail });
    }
  }

  // 2) Anthropic — fallback 1 (y principal cuando hay foto / visión)
  try {
    const reply = await callAnthropic(system, anthropicMessages, withVision, env);
    logProvider('anthropic', true);
    return { reply, provider: 'anthropic' };
  } catch (err) {
    const detail = err?.message || String(err);
    logProvider('anthropic', false, detail);
    failures.push({ provider: 'anthropic', error: detail });
  }

  // 3) OpenAI — fallback 2 (también con visión si aplica)
  try {
    const reply = await callOpenAI(system, anthropicMessages, withVision, env);
    logProvider('openai', true);
    return { reply, provider: 'openai' };
  } catch (err) {
    const detail = err?.message || String(err);
    logProvider('openai', false, detail);
    failures.push({ provider: 'openai', error: detail });
  }

  logProvider('all', false, failures.map((f) => `${f.provider}:${f.error}`).join(' | '));
  const err = new Error('all_providers_failed');
  err.failures = failures;
  throw err;
}

async function handleChat(body, env) {
  const { messages, perfil } = body || {};
  if (!messages || !Array.isArray(messages) || !messages.length) {
    return { status: 400, data: { error: 'Faltan mensajes' } };
  }
  const anthropicMessages = normalizeMessages(messages);
  const withVision = hasVision(anthropicMessages);
  const textoConsulta = extractLastUserText(messages);

  // Guarda barata de scope: off-topic claro → respuesta fija sin RAG ni LLM
  if (isClearlyOffTopicCultivo(textoConsulta, withVision)) {
    logProvider('scope_heuristic', true, 'off_topic_rejected');
    return {
      status: 200,
      data: { reply: SCOPE_REJECT_REPLY, provider: 'scope_heuristic' },
    };
  }

  // RAG — sin cambios: Voyage embedding + match_chunks
  let chunks = [];
  try {
    if (textoConsulta.trim().length > 3) {
      const embedding = await generarEmbeddingConsulta(textoConsulta, env);
      chunks = await buscarChunksRelevantes(embedding, env);
    }
  } catch (_) {}

  // System incluye SCOPE_PROMPT al inicio; casos dudosos los resuelve el LLM
  const system = buildSystemPrompt(perfil, chunks);

  try {
    const { reply, provider } = await generateChatReply(system, anthropicMessages, withVision, env);
    // provider en el JSON es opcional para el frontend; útil en logs/cola de diagnóstico
    return { status: 200, data: { reply, provider } };
  } catch (err) {
    if (err?.message === 'all_providers_failed') {
      return {
        status: 503,
        data: {
          error: LLM_ALL_FAILED_USER_MSG,
          code: 'llm_all_providers_failed',
          providers_tried: (err.failures || []).map((f) => f.provider),
        },
      };
    }
    logProvider('unexpected', false, err?.message || String(err));
    return {
      status: 503,
      data: {
        error: LLM_ALL_FAILED_USER_MSG,
        code: 'llm_unexpected_error',
      },
    };
  }
}

// =========================================================================
// AUTH
// =========================================================================
function consentOk(consent) { return consent && consent.age && consent.terms; }

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || '';
}

async function handleRegister(body, env, request) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const consent = body.consent || {};
  const sessionId = body.session_id || null;

  if (!email || !email.includes('@')) return { status: 400, data: { error: 'Email inválido' } };
  if (!consentOk(consent)) return { status: 400, data: { error: 'Debes confirmar tu edad y aceptar los términos.' } };

  const existing = await getUserByEmail(env, email);
  if (existing) {
    const valid = await verifyPassword(password, existing.password_hash);
    if (!valid) return { status: 409, data: { error: 'Ese email ya está registrado.', needs_login: true } };
    const token = await signJwt(makeTokenClaims(email, existing.plan), env.JWT_SECRET);
    await updateUser(env, existing.id, { last_login: new Date().toISOString() });
    await backfillSesion(env, sessionId, email);
    try { await brevoAddContact(env, email, { PLAN: existing.plan }); } catch (_) {}
    return { status: 200, data: { ok: true, token, plan: existing.plan || 'libre' } };
  }

  const password_hash = await hashPassword(password);
  const consentimiento = {
    age: true, terms: true, marketing: !!consent.marketing,
    terms_version: 'v1', ts: new Date().toISOString(), ip: clientIp(request),
  };
  const planNuevo = body.plan === 'libre' ? 'libre' : 'semilla';
  const created = await createUser(env, {
    email, password_hash, plan: planNuevo, nombre: '',
    consentimiento, fecha_registro: new Date().toISOString(),
    last_login: new Date().toISOString(),
  });
  if (!created.ok) {
    const msg = created.data?.message || created.data?.error || 'No se pudo crear la cuenta';
    return { status: created.status === 409 ? 409 : 500, data: { error: msg } };
  }

  await backfillSesion(env, sessionId, email);
  try { await brevoAddContact(env, email, { PLAN: planNuevo }); } catch (_) {}
  const nuevoId = Array.isArray(created.data) && created.data[0] ? created.data[0].id : null;
  if (nuevoId) {
    try { await volcarPerfilCultivo(env, nuevoId, sessionId, body.perfil); } catch (_) {}
  }
  const token = await signJwt(makeTokenClaims(email, planNuevo), env.JWT_SECRET);
  return { status: 200, data: { ok: true, token, plan: planNuevo } };
}

async function handleGuardarCultivo(body, env, request) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const claims = await verifyJwt(token, env.JWT_SECRET);
  if (!claims || !claims.email) return { status: 401, data: { error: 'No autorizado' } };
  const email = claims.email;
  const p = body || {};
  const fila = {
    espacio: p.espacio || null, tipo_luz: p.tipoLuz || p.tipo_luz || null,
    sustrato: p.sustrato || null, fase: p.fase || null,
    semana: p.semana != null && p.semana !== '' ? parseInt(p.semana) : null,
    ph: p.ph != null && p.ph !== '' ? parseFloat(p.ph) : null,
    ec: p.ec != null && p.ec !== '' ? parseFloat(p.ec) : null,
    temp: p.temp != null && p.temp !== '' ? parseInt(p.temp) : null,
    humedad: (p.humedad ?? p.hum) != null && (p.humedad ?? p.hum) !== '' ? parseInt(p.humedad ?? p.hum) : null,
    genetica: p.genetica || null, nombre: p.nombre || null, email,
  };
  const res = await sbRequest(env, 'cultivos_stats', {
    method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(fila),
  });
  if (!res.ok) return { status: 500, data: { error: 'No se pudo guardar el cultivo' } };
  return { status: 200, data: { ok: true } };
}

async function handleSavePerfil(body, env) {
  const token = String(body.token || '');
  const claims = await verifyJwt(token, env.JWT_SECRET);
  if (!claims || !claims.email) return { status: 401, data: { error: 'No autorizado' } };
  const user = await getUserByEmail(env, claims.email);
  if (!user) return { status: 404, data: { error: 'Usuario no encontrado' } };
  const actual = (user.perfil_cultivo && typeof user.perfil_cultivo === 'object') ? user.perfil_cultivo : {};
  const nuevo = (body.perfil_cultivo && typeof body.perfil_cultivo === 'object') ? body.perfil_cultivo : {};
  const fusionado = { ...actual, ...nuevo, actualizado: new Date().toISOString() };
  await updateUser(env, user.id, { perfil_cultivo: fusionado });
  return { status: 200, data: { ok: true } };
}

/**
 * POST /perfil/sala — merge del sub-objeto `sala` dentro de perfil_cultivo (jsonb).
 * Equivalente a:
 *   UPDATE public."Usuarios"
 *   SET perfil_cultivo = COALESCE(perfil_cultivo, '{}'::jsonb)
 *                     || jsonb_build_object('sala', $1::jsonb)
 *   WHERE email = $2;
 * No pisa el resto de claves (ec, ph, hum, temp, fase, …). Sin tablas/columnas nuevas.
 */
async function handleGuardarSala(body, env, request) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const claims = await verifyJwt(token, env.JWT_SECRET);
  if (!claims || !claims.email) return { status: 401, data: { error: 'No autorizado' } };

  const emailBody = String(body.email || '').trim().toLowerCase();
  const emailClaims = String(claims.email).trim().toLowerCase();
  const email = emailBody || emailClaims;
  if (!email || !email.includes('@')) return { status: 400, data: { error: 'Email requerido' } };
  if (email !== emailClaims) return { status: 403, data: { error: 'Email no coincide con la sesión' } };

  const sala = body.sala;
  if (!sala || typeof sala !== 'object' || Array.isArray(sala)) {
    return { status: 400, data: { error: 'Objeto sala requerido' } };
  }

  const user = await getUserByEmail(env, email);
  if (!user) return { status: 404, data: { error: 'Usuario no encontrado' } };

  const actual = (user.perfil_cultivo && typeof user.perfil_cultivo === 'object' && !Array.isArray(user.perfil_cultivo))
    ? user.perfil_cultivo
    : {};
  // Solo actualiza la clave `sala`; el resto de perfil_cultivo se conserva
  const fusionado = { ...actual, sala };

  const res = await updateUser(env, user.id, { perfil_cultivo: fusionado });
  if (!res.ok) {
    const msg = res.data?.message || res.data?.error || 'No se pudo guardar la sala';
    return { status: 500, data: { error: msg } };
  }
  return { status: 200, data: { ok: true, sala } };
}

// ─── DIARIO DE CULTIVO ────────────────────────────────────────────────────────

const DIARIO_COLS = new Set([
  'fecha', 'dia_ciclo', 'etapa', 'ph', 'ec', 'temp', 'hum', 'vpd',
  'riego_litros', 'riego_ph', 'riego_ec', 'runoff_ph', 'runoff_ec',
  'fertilizantes', 'plagas', 'hongos', 'tratamiento', 'poda', 'trasplante',
  'foto_url', 'notas',
]);

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function calcDiaCicloFromPerfil(perfil) {
  if (!perfil || typeof perfil !== 'object') return null;
  const fi = (perfil.cultivo && perfil.cultivo.fechaInicio) || perfil.fechaInicio || null;
  if (!fi) return null;
  const start = new Date(fi);
  if (Number.isNaN(start.getTime())) return null;
  const dias = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, dias);
}

function fotoUrlPublica(ruta) {
  if (!ruta) return null;
  if (/^https?:\/\//i.test(ruta)) return ruta;
  return `${SUPABASE_URL}/storage/v1/object/public/plantas/${ruta}`;
}

async function authEmailFromRequest(request, env, bodyEmail) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const claims = await verifyJwt(token, env.JWT_SECRET);
  if (!claims || !claims.email) return { error: { status: 401, data: { error: 'No autorizado' } } };
  const emailClaims = String(claims.email).trim().toLowerCase();
  const emailBody = String(bodyEmail || '').trim().toLowerCase();
  const email = emailBody || emailClaims;
  if (!email || !email.includes('@')) return { error: { status: 400, data: { error: 'Email requerido' } } };
  if (email !== emailClaims) return { error: { status: 403, data: { error: 'Email no coincide con la sesión' } } };
  return { email, claims };
}

/**
 * POST /diario/entrada — inserta fila en diario_entradas.
 * dia_ciclo se calcula server-side desde perfil_cultivo.cultivo.fechaInicio.
 */
async function handleDiarioEntrada(body, env, request) {
  const auth = await authEmailFromRequest(request, env, body.email);
  if (auth.error) return auth.error;
  const { email } = auth;

  const user = await getUserByEmail(env, email);
  if (!user) return { status: 404, data: { error: 'Usuario no encontrado' } };

  const perfil = (user.perfil_cultivo && typeof user.perfil_cultivo === 'object') ? user.perfil_cultivo : {};
  const src = body.entrada && typeof body.entrada === 'object' ? body.entrada : body;

  const fila = { usuario_email: email };
  for (const k of DIARIO_COLS) {
    if (src[k] === undefined) continue;
    if (k === 'fertilizantes') {
      fila[k] = src[k] == null ? null : (typeof src[k] === 'string' ? src[k] : src[k]);
      continue;
    }
    if (k === 'trasplante') {
      fila[k] = !!src[k];
      continue;
    }
    if (['ph', 'ec', 'temp', 'hum', 'vpd', 'riego_litros', 'riego_ph', 'riego_ec', 'runoff_ph', 'runoff_ec', 'dia_ciclo'].includes(k)) {
      fila[k] = numOrNull(src[k]);
      continue;
    }
    if (k === 'fecha') {
      fila[k] = src[k] || new Date().toISOString().slice(0, 10);
      continue;
    }
    fila[k] = src[k] == null || src[k] === '' ? null : String(src[k]);
  }

  // dia_ciclo siempre server-side si hay fechaInicio
  const diaCiclo = calcDiaCicloFromPerfil(perfil);
  if (diaCiclo != null) fila.dia_ciclo = diaCiclo;

  // etapa por defecto desde perfil
  if (fila.etapa == null) {
    const etapa = (perfil.cultivo && perfil.cultivo.fase) || perfil.fase || null;
    if (etapa) fila.etapa = String(etapa);
  }

  // Compat: riego textual (Hoy/Ayer) → notas
  if (src.riego && !fila.notas) {
    fila.notas = `Último riego: ${src.riego}`;
  } else if (src.riego && fila.notas) {
    fila.notas = `${fila.notas} · Último riego: ${src.riego}`;
  }

  // VPD auto si hay temp+hum y no viene
  if (fila.vpd == null && fila.temp != null && fila.hum != null) {
    const t = Number(fila.temp), h = Number(fila.hum);
    if (Number.isFinite(t) && Number.isFinite(h)) {
      const svp = 0.6108 * Math.exp(17.27 * t / (t + 237.3));
      fila.vpd = Number((((100 - h) / 100) * svp).toFixed(3));
    }
  }

  if (!fila.fecha) fila.fecha = new Date().toISOString().slice(0, 10);

  // Foto adjunta desde el formulario (base64 JPEG) → Storage plantas/
  const fotoB64 = body.foto_base64 || src.foto_base64 || null;
  if (fotoB64 && typeof fotoB64 === 'string' && !fila.foto_url) {
    try {
      const raw = fotoB64.includes(',') ? fotoB64.split(',')[1] : fotoB64;
      let bytes = b64ToBytes(raw);
      if (esJpeg(bytes)) bytes = limpiarMetadatosJpeg(bytes);
      const ruta = `${email}/${crypto.randomUUID()}.jpg`;
      await subirFotoStorage(env, bytes, ruta);
      fila.foto_url = fotoUrlPublica(ruta);
    } catch (err) {
      return { status: 500, data: { error: 'No se pudo subir la foto: ' + (err.message || 'error') } };
    }
  }

  const res = await sbRequest(env, 'diario_entradas', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(fila),
  });
  if (!res.ok) {
    const msg = res.data?.message || res.data?.error || 'No se pudo guardar la entrada';
    return { status: 500, data: { error: msg } };
  }
  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  return { status: 200, data: { ok: true, entrada: row } };
}

/**
 * GET /diario/entradas?email=&limit=N
 * GET /diario/entradas?email=&fecha=YYYY-MM-DD  → filtro exacto por día
 * Últimas N filas por fecha desc (default 30, max 200).
 */
async function handleListDiario(url, env, request) {
  const emailQ = url.searchParams.get('email') || '';
  const auth = await authEmailFromRequest(request, env, emailQ);
  if (auth.error) return auth.error;
  const { email } = auth;

  const fecha = (url.searchParams.get('fecha') || '').trim();
  const fechaOk = /^\d{4}-\d{2}-\d{2}$/.test(fecha);

  let limit = parseInt(url.searchParams.get('limit') || (fechaOk ? '50' : '30'), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 30;
  if (limit > 200) limit = 200;

  let q = `diario_entradas?usuario_email=eq.${encodeURIComponent(email)}&select=*&order=fecha.desc,created_at.desc&limit=${limit}`;
  if (fechaOk) {
    q = `diario_entradas?usuario_email=eq.${encodeURIComponent(email)}&fecha=eq.${encodeURIComponent(fecha)}&select=*&order=created_at.desc&limit=${limit}`;
  }

  const res = await sbRequest(env, q, { method: 'GET' });
  if (!res.ok) {
    const msg = res.data?.message || res.data?.error || 'No se pudieron leer las entradas';
    return { status: 500, data: { error: msg } };
  }
  const entradas = Array.isArray(res.data) ? res.data : [];
  // Fechas con al menos una entrada (para resaltar en el calendario del cliente)
  const fechas = [...new Set(entradas.map((e) => e.fecha).filter(Boolean))];
  return { status: 200, data: { ok: true, entradas, fechas, fecha: fechaOk ? fecha : null } };
}

/** Foto del chat → inserta o actualiza la entrada de hoy con foto_url. */
async function upsertDiarioFoto(env, email, imagenRuta, pregunta, reply) {
  const hoy = new Date().toISOString().slice(0, 10);
  const fotoUrl = fotoUrlPublica(imagenRuta);
  const user = await getUserByEmail(env, email);
  const perfil = (user && user.perfil_cultivo && typeof user.perfil_cultivo === 'object') ? user.perfil_cultivo : {};
  const diaCiclo = calcDiaCicloFromPerfil(perfil);
  const etapa = (perfil.cultivo && perfil.cultivo.fase) || perfil.fase || null;
  const notaFoto = [pregunta, reply ? `IA: ${String(reply).slice(0, 280)}` : null].filter(Boolean).join('\n');

  const q = `diario_entradas?usuario_email=eq.${encodeURIComponent(email)}&fecha=eq.${hoy}&select=id,foto_url,notas&order=created_at.desc&limit=1`;
  const existing = await sbRequest(env, q, { method: 'GET' });
  if (existing.ok && Array.isArray(existing.data) && existing.data.length) {
    const row = existing.data[0];
    const notas = [row.notas, notaFoto].filter(Boolean).join('\n---\n');
    await sbRequest(env, `diario_entradas?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ foto_url: fotoUrl || row.foto_url, notas: notas || null }),
    });
    return;
  }
  await sbRequest(env, 'diario_entradas', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      usuario_email: email,
      fecha: hoy,
      dia_ciclo: diaCiclo,
      etapa: etapa ? String(etapa) : null,
      foto_url: fotoUrl,
      notas: notaFoto || null,
    }),
  });
}

async function handleLogin(body, env) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) return { status: 400, data: { error: 'Email y contraseña requeridos' } };
  const user = await getUserByEmail(env, email);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { status: 401, data: { error: 'Email o contraseña incorrectos' } };
  }
  await updateUser(env, user.id, { last_login: new Date().toISOString() });
  await backfillSesion(env, body.session_id || null, email);
  if (body.session_id) {
    const base = (user.perfil_cultivo && typeof user.perfil_cultivo === 'object') ? user.perfil_cultivo : {};
    const ob = await sbRequest(env, `onboarding_respuestas?session_id=eq.${encodeURIComponent(body.session_id)}&select=clave,valor`, { method: 'GET' });
    if (ob.ok && Array.isArray(ob.data)) {
      let cambio = false;
      for (const f of ob.data) {
        if (f.clave && f.valor != null && base[f.clave] == null) { base[f.clave] = f.valor; cambio = true; }
      }
      if (cambio) { base.actualizado = new Date().toISOString(); await updateUser(env, user.id, { perfil_cultivo: base }); }
    }
  }
  const token = await signJwt(makeTokenClaims(email, user.plan), env.JWT_SECRET);
  return {
    status: 200,
    data: { ok: true, token, email: user.email, nombre: user.nombre || '', plan: user.plan || 'libre', perfil_cultivo: user.perfil_cultivo ?? null },
  };
}

async function handleForgotPassword(body, env) {
  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return { status: 200, data: { ok: true } };
  const user = await getUserByEmail(env, email);
  if (user) {
    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + RESET_TTL_MS).toISOString();
    await updateUser(env, user.id, { reset_token: token, reset_token_expires: expires });
    try { await brevoSendResetEmail(env, email, token); } catch (_) {}
  }
  return { status: 200, data: { ok: true } };
}

async function handleResetPassword(body, env) {
  const token = String(body.token || '');
  const newPassword = String(body.newPassword || body.password || '');
  if (!token || !newPassword) return { status: 400, data: { error: 'Enlace inválido o ya utilizado' } };
  const q = `Usuarios?reset_token=eq.${encodeURIComponent(token)}&select=*&limit=1`;
  const res = await sbRequest(env, q, { method: 'GET' });
  const user = Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
  if (!user || !user.reset_token_expires) return { status: 400, data: { error: 'Enlace inválido o ya utilizado' } };
  if (new Date(user.reset_token_expires).getTime() < Date.now()) return { status: 400, data: { error: 'Enlace inválido o ya utilizado' } };
  const password_hash = await hashPassword(newPassword);
  await updateUser(env, user.id, { password_hash, reset_token: null, reset_token_expires: null });
  return { status: 200, data: { ok: true } };
}

async function handleBrevoContact(body, env) {
  const email = String(body.email || '').trim().toLowerCase();
  const attributes = body.attributes || {};
  if (!email) return { status: 400, data: { error: 'Falta email' } };
  const res = await brevoAddContact(env, email, attributes);
  if (!res.ok) return { status: res.status, data: { error: res.data?.message || 'Error Brevo' } };
  return { status: 200, data: { ok: true, data: res.data } };
}

async function handleBrevoEmail(body, env) {
  const email = String(body.email || '').trim().toLowerCase();
  const templateId = body.templateId;
  if (!email || !templateId) return { status: 400, data: { error: 'Faltan email o templateId' } };
  const res = await brevoSendTemplate(env, email, templateId, body.params || {});
  if (!res.ok) return { status: res.status, data: { error: res.data?.message || 'Error Brevo' } };
  return { status: 200, data: { ok: true, data: res.data } };
}

async function handleBrevoUpdatePlan(body, env) {
  const email = String(body.email || '').trim().toLowerCase();
  const plan = String(body.plan || '').trim().toLowerCase();
  if (!email || !plan) return { status: 400, data: { error: 'Faltan email o plan' } };
  const res = await brevoUpdatePlan(env, email, plan);
  if (!res.ok) return { status: 200, data: { ok: false } };
  return { status: 200, data: { ok: true } };
}

// =========================================================================
// ADMIN KB
// =========================================================================
function chunkTextAdmin(text, chunkSize=1400, overlap=200, minChars=120) {
  const paragraphs = text.split(/\n{2,}/).map(p=>p.trim()).filter(p=>p.length>0);
  const chunks = []; let current = ''; let prevTail = '';
  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length <= chunkSize) { current = candidate; }
    else {
      if (current.length >= minChars) { chunks.push(prevTail ? `${prevTail}\n\n${current}`.trim() : current); prevTail = current.slice(-overlap); }
      current = para.length <= chunkSize ? para : para.slice(0, chunkSize);
    }
  }
  if (current.length >= minChars) chunks.push(prevTail ? `${prevTail}\n\n${current}`.trim() : current);
  return chunks;
}

async function handleAdminAddLibro(request, env, ctx) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const claims = await verifyJwt(token, env.JWT_SECRET);
  if (!claims || claims.email !== 'enriquedorta@gmail.com') return { status: 401, data: { error: 'No autorizado' } };

  const body = await request.json().catch(() => ({}));
  const { titulo, idioma, cluster, tags, pdf_base64, drive_url } = body;
  if (!titulo) return { status: 400, data: { error: 'Falta el título' } };

  let pdfBase64 = pdf_base64;
  if (!pdfBase64 && drive_url) {
    const match = drive_url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) return { status: 400, data: { error: 'URL de Drive no válida' } };
    try {
      const r = await fetch(`https://drive.google.com/uc?export=download&id=${match[1]}`);
      if (!r.ok) return { status: 400, data: { error: 'No se pudo descargar el PDF de Drive' } };
      const bytes = await r.arrayBuffer();
      pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
    } catch(e) { return { status: 400, data: { error: 'Error descargando Drive: ' + e.message } }; }
  }
  if (!pdfBase64) return { status: 400, data: { error: 'Sube un PDF o proporciona un enlace de Drive' } };

  const docsRes = await sbRequest(env, 'kb_documents?select=catalog_num&order=catalog_num.desc&limit=1', { method: 'GET' });
  const nextNum = (docsRes.ok && docsRes.data?.[0]?.catalog_num) ? docsRes.data[0].catalog_num + 1 : 48;

  const docIns = await sbRequest(env, 'kb_documents', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      catalog_num: nextNum, archivo: titulo+'.pdf', drive_file_id: null,
      idioma_contenido: idioma||'es', politica_idioma: idioma==='en'?'usar_en_con_traduccion':'priorizar_es',
      factor_idioma_retrieval: idioma==='en'?1.0:1.2, incluir_en_kb:'si', peso_prioridad_retrieval:5,
      libro_propuesto: titulo, tema_cluster: cluster||'L1 Cultivo General',
      tipo_documento:'libro', tags: tags||[], estado_ingesta:'pendiente',
    }),
  });
  if (!docIns.ok) return { status: 500, data: { error: 'Error creando registro' } };
  const docId = docIns.data[0].id;

  ctx.waitUntil(processLibroBackground(docId, pdfBase64, { titulo, idioma, cluster, tags, nextNum }, env));
  return { status: 200, data: { ok: true, job_id: docId, status: 'pendiente' } };
}

async function processLibroBackground(docId, pdfBase64, meta, env) {
  const { titulo, idioma, cluster, tags, nextNum } = meta;
  const patch = (estado, extra={}) => sbRequest(env, `kb_documents?id=eq.${docId}`, {
    method:'PATCH', headers:{Prefer:'return=minimal'},
    body: JSON.stringify({estado_ingesta:estado,...extra}),
  });
  try {
    await patch('extrayendo');
    const er = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
      body: JSON.stringify({
        model:'claude-sonnet-4-5', max_tokens:8000,
        messages:[{role:'user',content:[
          {type:'document',source:{type:'base64',media_type:'application/pdf',data:pdfBase64}},
          {type:'text',text:'Extrae todo el texto de este documento. Devuelve SOLO el texto original sin resumir ni comentar. Separa párrafos con líneas en blanco.'}
        ]}]
      })
    });
    if (!er.ok) throw new Error('Error Claude: '+er.status);
    const ed = await er.json();
    const texto = ed.content?.[0]?.text||'';
    if (texto.length<300) throw new Error('PDF sin texto suficiente');

    await patch('chunkeando',{text_char_count:texto.length});
    const chunks = chunkTextAdmin(texto);

    const chunkRows = chunks.map((content,i)=>({
      document_id:docId, chunk_index:i, content,
      char_count:content.length, token_estimate:Math.ceil(content.length/4),
      idioma_contenido:idioma||'es', factor_idioma_retrieval:idioma==='en'?1.0:1.2,
      peso_prioridad_retrieval:5, libro_propuesto:titulo,
      tema_cluster:cluster||'L1 Cultivo General', tags:tags||[],
      respuesta_requiere_traduccion:idioma==='en', metadata:{catalog_num:nextNum},
    }));
    for (let i=0;i<chunkRows.length;i+=100) {
      await sbRequest(env,'kb_chunks',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(chunkRows.slice(i,i+100))});
    }

    // Embeddings se generan via Colab (evita límites de CPU del Worker)
    await patch('indexado',{chunk_count:chunks.length, ingested_at:new Date().toISOString()});

  } catch(e) {
    await patch('fallido',{error_message:String(e.message||e).slice(0,500)});
  }
}

async function handleAdminJobStatus(request, env) {
  const auth = request.headers.get('Authorization')||'';
  const token = auth.startsWith('Bearer ')?auth.slice(7):'';
  const claims = await verifyJwt(token, env.JWT_SECRET);
  if (!claims||claims.email!=='enriquedorta@gmail.com') return {status:401,data:{error:'No autorizado'}};
  const body = await request.json().catch(()=>({}));
  if (!body.job_id) return {status:400,data:{error:'Falta job_id'}};
  const res = await sbRequest(env,
    `kb_documents?id=eq.${body.job_id}&select=id,estado_ingesta,chunk_count,text_char_count,error_message,libro_propuesto`,
    {method:'GET'}
  );
  if (!res.ok||!res.data?.[0]) return {status:404,data:{error:'Job no encontrado'}};
  const d = res.data[0];
  return {status:200,data:{status:d.estado_ingesta,chunks:d.chunk_count,chars:d.text_char_count,titulo:d.libro_propuesto,error:d.error_message}};
}

async function handleAdminListLibros(request, env) {
  const auth = request.headers.get('Authorization')||'';
  const token = auth.startsWith('Bearer ')?auth.slice(7):'';
  const claims = await verifyJwt(token, env.JWT_SECRET);
  if (!claims||claims.email!=='enriquedorta@gmail.com') return {status:401,data:{error:'No autorizado'}};
  const docs = await sbRequest(env,
    'kb_documents?select=catalog_num,libro_propuesto,archivo,idioma_contenido,tema_cluster,chunk_count,tipo_documento,estado_ingesta&order=catalog_num.asc&limit=200',
    {method:'GET'}
  );
  const libros = (docs.data||[]).map(d=>({
    catalog_num:d.catalog_num, libro_propuesto:d.libro_propuesto,
    archivo:d.archivo, idioma:d.idioma_contenido, tema_cluster:d.tema_cluster,
    chunk_count:d.chunk_count, tipo:d.tipo_documento, estado:d.estado_ingesta,
  }));
  return {status:200,data:{
    total:libros.length,
    total_chunks:libros.reduce((s,l)=>s+(l.chunk_count||0),0),
    pct_vectorizados:100,
    libros,
  }};
}

// =========================================================================
// MAIN HANDLER
// =========================================================================
export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    try {
      // GET routes (antes del body JSON)
      if (request.method === 'GET') {
        if (path === '/diario/entradas') {
          const r = await handleListDiario(url, env, request);
          return json(r.data, r.status, cors);
        }
        return new Response('Method not allowed', { status: 405, headers: cors });
      }
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

      // Admin KB — antes del JSON parsing
      if (path === '/admin/add-libro') {
        const r = await handleAdminAddLibro(request, env, ctx);
        return json(r.data, r.status, cors);
      }
      if (path === '/admin/job-status') {
        const r = await handleAdminJobStatus(request, env);
        return json(r.data, r.status, cors);
      }
      if (path === '/admin/list-libros') {
        const r = await handleAdminListLibros(request, env);
        return json(r.data, r.status, cors);
      }

      const body = await request.json().catch(() => ({}));

      if (path === '/onboarding/start') {
        const sid = crypto.randomUUID();
        const token = await signJwt(makeOnboardingClaims(sid), env.JWT_SECRET);
        return json({ ok: true, token, session_id: sid }, 200, cors);
      }

      if (path === '/onboarding/answer') {
        const r = await handleOnboardingAnswer(body, env);
        return json(r.data, r.status, cors);
      }

      if (path === '/' || path === '/chat') {
        const auth = request.headers.get('Authorization') || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        const claims = await verifyJwt(token, env.JWT_SECRET);
        if (!claims) return json({ error: 'No autorizado' }, 401, cors);
        const identity = claims.email
          ? { email: claims.email, sid: body.session_id || null }
          : (claims.scope === 'onboarding' ? { email: null, sid: claims.sid } : null);
        if (!identity) return json({ error: 'No autorizado' }, 401, cors);
        const result = await handleChat(body, env);
        if (result.status === 200 && result.data?.reply) {
          ctx.waitUntil(guardarDiagnostico(env, { identity, messages: body.messages, reply: result.data.reply }));
        }
        return json(result.data, result.status, cors);
      }

      if (path === '/cultivo/guardar') { const r = await handleGuardarCultivo(body, env, request); return json(r.data, r.status, cors); }
      if (path === '/perfil/sala') { const r = await handleGuardarSala(body, env, request); return json(r.data, r.status, cors); }
      if (path === '/diario/entrada') { const r = await handleDiarioEntrada(body, env, request); return json(r.data, r.status, cors); }
      if (path === '/auth/save-perfil') { const r = await handleSavePerfil(body, env); return json(r.data, r.status, cors); }
      if (path === '/auth/register') { const r = await handleRegister(body, env, request); return json(r.data, r.status, cors); }
      if (path === '/auth/login') { const r = await handleLogin(body, env); return json(r.data, r.status, cors); }
      if (path === '/auth/forgot-password') { const r = await handleForgotPassword(body, env); return json(r.data, r.status, cors); }
      if (path === '/auth/reset-password') { const r = await handleResetPassword(body, env); return json(r.data, r.status, cors); }
      if (path === '/brevo-contact') { const r = await handleBrevoContact(body, env); return json(r.data, r.status, cors); }
      if (path === '/brevo-email') { const r = await handleBrevoEmail(body, env); return json(r.data, r.status, cors); }
      if (path === '/brevo-update-plan') { const r = await handleBrevoUpdatePlan(body, env); return json(r.data, r.status, cors); }

      return json({ error: 'Ruta no encontrada' }, 404, cors);
    } catch (err) {
      return json({ error: err.message || 'Error interno' }, 500, cors);
    }
  },
};
