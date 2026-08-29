import {
  MAX_TOOL_ROUNDS,
  SALES_AGENT_TOOLS,
  buildSalesAgentSystemPrompt,
  executeSalesAgentTool,
} from './sales-agent.js';

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

// Origenes de desarrollo local (cualquier puerto) para probar el widget /asesor.
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const isLocal = LOCAL_ORIGIN_RE.test(origin);
  const allowed = (ALLOWED_ORIGINS.includes(origin) || isLocal) ? origin : ALLOWED_ORIGINS[0];
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
  const cr = res.headers.get('content-range');
  let count = null;
  if (cr) {
    const m = String(cr).match(/\/(\d+)$/);
    if (m) count = parseInt(m[1], 10);
  }
  return { ok: res.ok, status: res.status, data, count };
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
// SALES AGENT — multi-tenant conversational seller (Claude tool use)
// =========================================================================

async function resolveSalesTenant(env, tenantSlug) {
  const slug = String(tenantSlug || '').trim();
  if (!slug) return null;
  const path = `sales_tenants?slug=eq.${encodeURIComponent(slug)}&status=neq.churned&select=id,slug,display_name,status&limit=1`;
  const result = await sbRequest(env, path, { method: 'GET' });
  if (!result.ok || !Array.isArray(result.data) || !result.data.length) return null;
  return result.data[0];
}

async function recordSalesAgentTurn(env, { tenantId, conversationId, userMessage, assistantMessage, toolCalls, model }) {
  try {
    await sbRequest(env, 'sales_agent_turns', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        tenant_id: tenantId,
        conversation_id: conversationId,
        user_message: userMessage,
        assistant_message: assistantMessage || null,
        tool_calls: toolCalls || [],
        model: model || null,
      }),
    });
  } catch (error) {
    console.log(JSON.stringify({ event: 'sales_agent_audit_failed', detail: String(error?.message || error).slice(0, 160) }));
  }
}

/**
 * Claude tool-use loop. The model is given SALES_AGENT_TOOLS and can call
 * them repeatedly (bounded by MAX_TOOL_ROUNDS) before producing its final
 * text reply. Every tool execution is scoped to tenantId, fixed by the
 * caller — the model never sees or controls that value.
 */
async function runSalesAgentConversation(env, tenantId, conversationId, system, initialMessages) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('missing_ANTHROPIC_API_KEY');
  let messages = initialMessages;
  const toolCallLog = [];
  // Ground truth for anti-hallucination checks (e.g. an email the model
  // claims the customer gave): only text the customer actually typed in
  // THIS conversation counts, never something the model recalls or invents.
  const shopperTranscript = initialMessages.filter((m) => m.role === 'user').map((m) => String(m.content || '')).join('\n');

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        system,
        messages,
        tools: SALES_AGENT_TOOLS,
      }),
    }, 20000);

    const raw = await response.text();
    if (!response.ok) throw new Error(`http_${response.status}: ${raw.slice(0, 300)}`);
    const data = JSON.parse(raw);

    const toolUseBlocks = (data.content || []).filter((b) => b.type === 'tool_use');
    if (!toolUseBlocks.length || data.stop_reason !== 'tool_use') {
      const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      return { reply: text || 'No he podido generar una respuesta.', toolCalls: toolCallLog, model: data.model };
    }

    // Execute every requested tool call (hard-scoped to tenantId) and feed
    // the results back so the model can continue reasoning or reply.
    messages = [...messages, { role: 'assistant', content: data.content }];
    const toolResults = [];
    for (const block of toolUseBlocks) {
      let result;
      try {
        result = await executeSalesAgentTool(env, sbRequest, tenantId, block.name, block.input, conversationId, shopperTranscript);
      } catch (error) {
        result = { error: String(error?.message || error).slice(0, 200) };
      }
      toolCallLog.push({ tool: block.name, input: block.input, result });
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages = [...messages, { role: 'user', content: toolResults }];
  }

  return { reply: 'He consultado varias veces el catálogo pero no he podido cerrar una respuesta clara. ¿Puedes reformular lo que necesitas?', toolCalls: toolCallLog, model: null };
}

async function handleSalesAgentChat(body, env) {
  const tenantSlug = body?.tenant_slug;
  const tenant = await resolveSalesTenant(env, tenantSlug);
  if (!tenant) return { status: 404, data: { error: 'unknown_tenant' } };

  const messages = Array.isArray(body?.messages) ? body.messages : null;
  if (!messages || !messages.length || messages.length > 30 || !messages.every((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length <= 2000)) {
    return { status: 400, data: { error: 'invalid_messages' } };
  }
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser || !lastUser.content.trim()) return { status: 400, data: { error: 'missing_user_message' } };

  const conversationId = typeof body?.conversation_id === 'string' && body.conversation_id ? body.conversation_id : crypto.randomUUID();
  const system = buildSalesAgentSystemPrompt(tenant);
  const anthropicMessages = messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));

  try {
    const { reply, toolCalls, model } = await runSalesAgentConversation(env, tenant.id, conversationId, system, anthropicMessages);
    await recordSalesAgentTurn(env, {
      tenantId: tenant.id,
      conversationId,
      userMessage: lastUser.content,
      assistantMessage: reply,
      toolCalls,
      model,
    });
    return {
      status: 200,
      data: {
        conversation_id: conversationId,
        tenant: { slug: tenant.slug, display_name: tenant.display_name },
        assistant_message: reply,
        tool_calls: toolCalls,
      },
    };
  } catch (error) {
    console.log(JSON.stringify({ event: 'sales_agent_chat_failed', tenant: tenant.slug, detail: String(error?.message || error).slice(0, 200), stack: String(error?.stack || '').slice(0, 500) }));
    return { status: 502, data: { error: 'sales_agent_dependency_unavailable' } };
  }
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
const SCOPE_PROMPT = `Eres el asistente de IA de Cannabicultor, especializado exclusivamente en cultivo de cannabis: variedades/genética, cultivo (luz, sustrato, riego, VPD, nutrientes, fertilizantes, plagas, floración, cosecha), diseño de espacios de cultivo, el DIRECTORIO de growshops/tiendas de cultivo y clubes/asociaciones cannábicas de España, y temas directamente relacionados con la comunidad cultivadora en España.

El directorio de growshops y de clubes/asociaciones es parte del ámbito de esta plataforma: si el usuario pregunta por un growshop, tienda de cultivo o club/asociación cerca de él, en su ciudad, o pide recomendaciones de dónde comprar/asociarse, SÍ debes ayudarle usando la información del directorio que se te proporcione en el contexto (si la hay). Si no tienes datos del directorio para su ciudad, dilo con honestidad y sugiere que puede añadir la ficha desde la plataforma si conoce un sitio no listado.

Si el usuario pregunta algo que NO tiene relación con cultivo de cannabis, el directorio de growshops/clubes, o el uso de esta plataforma (por ejemplo: reparar un coche, recetas de cocina no relacionadas, tareas de programación ajenas, preguntas generales de cultura, etc.), NO respondas la pregunta. En su lugar, responde brevemente (1-2 frases) indicando que solo puedes ayudar con temas de cultivo de cannabis y el directorio de Cannabicultor, y sugiere reformular la pregunta dentro de ese ámbito. No uses el contexto RAG en ese caso, no expliques el motivo con detalle, sé breve.`;

const SCOPE_REJECT_REPLY =
  'Solo puedo ayudarte con cultivo de cannabis y el uso de Cannabicultor. Reformula tu pregunta en ese ámbito (luz, riego, nutrientes, genética, plagas, sala de cultivo, etc.) y te ayudo.';

const VISION_PROMPT = `
ANÁLISIS DE FOTOS:
- Si el usuario envía una imagen, examínala: hojas, manchas, plagas, mohos, deficiencias, estrés.
- Describe primero lo que VES (1-2 frases), luego diagnóstico y pasos siguientes.
- Si la foto no es clara, pide otra mejor. No inventes detalles invisibles.`;

/**
 * Extrae una referencia breve (autor/medio + anio) de un chunk del RAG, parseando
 * el propio texto (formato "Title: ...\nURL: ...\n<revista/medio>, <anio>. <Autores>").
 * Devuelve null si no encuentra un patron de anio de 4 digitos cerca de "Title:"/URL,
 * para no inventar referencia donde no hay una real (libros/manuales internos).
 */
function extractReferenciaBreve(chunkContent) {
  if (!chunkContent || !/^Title:/m.test(chunkContent)) return null;
  const head = chunkContent.slice(0, 500);
  const anioMatch = head.match(/\b(19|20)\d{2}\b/);
  if (!anioMatch) return null;
  const anio = anioMatch[0];
  // Intenta capturar "Revista, Volumen... AUTORES" o linea de autores tipica antes del anio
  const lineaConAnio = head.split('\n').find((l) => l.includes(anio)) || '';
  // Autores: nombres propios separados por comas, suele ir al final de la linea del anio
  const autoresMatch = lineaConAnio.match(/([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:[\s,.-]+[A-ZÁÉÍÓÚÑ][a-záéíóúñ.]*)+)\s*$/);
  const autores = autoresMatch ? autoresMatch[1].trim().split(/\s*,\s*/)[0] : null;
  return autores ? `${autores}, ${anio}` : `estudio de ${anio}`;
}

function buildSystemPrompt(perfil, chunks, directorioContexto) {
  // Scope primero (antes del RAG); el LLM lo ve aunque la heurística no sea concluyente.
  let base = `${SCOPE_PROMPT}

Eres Cannabicultor IA de Growers Alliance. Tono: autoridad con calidez. Tuteo respetuoso.
Primera frase responde DIRECTAMENTE. Máx 8-12 líneas. Abre UNA puerta al final.
NUNCA inventes estudios ni legislación.${VISION_PROMPT}`;

  if (directorioContexto) {
    base += `\n\nDIRECTORIO CANNABICULTOR (usa esto para responder, es la fuente real y actual — NUNCA inventes un growshop, club o dato de contacto que no esté aquí):\n${directorioContexto}`;
  }

  if (chunks && chunks.length > 0) {
    const contexto = chunks.map((c, i) => {
      const fuente = c.libro_propuesto || 'Base de conocimiento';
      const referencia = extractReferenciaBreve(c.content);
      const etiqueta = referencia
        ? `[${i + 1}] ${fuente} | REFERENCIA EXACTA PARA CITAR ESTE FRAGMENTO: ${referencia}`
        : `[${i + 1}] ${fuente} | SIN AUTOR/ANIO IDENTIFICABLE — NO CITAR AUTOR PARA ESTE FRAGMENTO`;
      return `${etiqueta}:\n${c.content}`;
    }).join('\n\n');
    base += `\n\nCONOCIMIENTO TECNICO RELEVANTE (basa tu respuesta en esto):\n${contexto}\n\nINSTRUCCIONES:\n- Usa el conocimiento anterior cuando sea relevante.\n- Si la pregunta está fuera del ámbito de cultivo (ver scope arriba), IGNORA este contexto y rechaza en 1-2 frases.\n- Si algun fragmento esta en ingles, sintetizalo en espanol. NUNCA muestres texto en ingles al usuario.\n- CITAS: si un fragmento incluye Title/autor/revista/URL (estudio cientifico real, ej. "Web · Cultivo"), y tu respuesta usa un dato o hallazgo concreto de ese fragmento (cifra, porcentaje, resultado de estudio, mecanismo especifico), cita la fuente de forma breve al final de esa frase o del bloque: "(segun [revista/medio], [anio])" o "(estudio de [autor principal], [anio])". No hace falta URL completa ni formato APA, solo la referencia breve.
- REGLA ESTRICTA DE TRAZABILIDAD: solo puedes citar una fuente si el dato/cifra/hallazgo que acabas de mencionar en ESA MISMA frase aparece literalmente en ESE fragmento concreto. Prohibido citar una fuente por asociacion tematica, por "sonar mas autorizado", o porque el autor/estudio anda cerca en el contexto pero habla de otra cosa. Si citas, la cifra citada y el fragmento citado deben coincidir exactamente.
- COPIA EXACTA DEL AUTOR: cada fragmento trae su propia linea "REFERENCIA EXACTA PARA CITAR ESTE FRAGMENTO: ..." o "SIN AUTOR/ANIO IDENTIFICABLE". Usa SOLO esa referencia pre-calculada del MISMO fragmento que sustenta el dato que estas citando -- nunca la de otro fragmento, aunque el autor te "suene" del contexto. Si el fragmento dice "SIN AUTOR/ANIO IDENTIFICABLE", di "segun un estudio en mi base de conocimiento" SIN inventar nombre.
- UN SOLO DATO, UNA SOLA FUENTE: no añadas una segunda cifra o estudio "de refuerzo" para reforzar tu respuesta si ese segundo dato no aparece en los fragmentos recuperados para ESTA pregunta. Mejor una respuesta con un dato bien citado que dos datos, uno de ellos inventado.
- MENCION vs DATO: distingue entre que un fragmento CONTENGA un resultado/cifra, y que un fragmento solo MENCIONE que existe otro estudio relacionado (ej. "companion study", "ver tambien", nombrar un PMC/DOI sin dar el resultado). Si el fragmento solo menciona la EXISTENCIA de un estudio sin su resultado numerico, NO inventes esa cifra. Di algo como "se que hay un estudio sobre esto en mi base pero no tengo su resultado exacto" y da tu criterio de cultivador aparte, sin mezclarlo como si fuera el dato del estudio. Tampoco combines dos hallazgos de fragmentos distintos como si uno fuera causa del otro a menos que el propio texto lo diga explicitamente (ej. no asumas que "deficiencia de Mg a las 7 semanas" fue CAUSADA por "exceso de P/K" si el fragmento solo describe la deficiencia de Mg de forma aislada).
- REGLA DE ORO ANTI-INVENTO DE CIFRAS: "segun un estudio en mi base de conocimiento" (o cualquier variante: "segun estudios", "la literatura indica", "los datos muestran") esta PROHIBIDO usarla como muletilla generica para sonar autorizado. Solo puedes escribir esa frase (con o sin nombre de autor) inmediatamente antes o despues de una cifra que hayas copiado literalmente de un fragmento del CONOCIMIENTO TECNICO RELEVANTE de arriba. Antes de escribir cualquier numero/porcentaje/cifra acompañado de esa frase, verifica mentalmente: "¿puedo señalar el fragmento [N] exacto donde esta esta cifra?" Si la respuesta es no, ELIMINA la frase de autoridad y ELIMINA la cifra inventada -- responde solo con tu criterio de cultivador experto, sin numeros falsos y sin aparentar que vienen de un estudio. Una respuesta mas corta y honesta es siempre mejor que una mas "completa" con datos fabricados.
- Si no encuentras en los fragmentos el dato exacto que te piden (ej. semanas exactas, porcentaje exacto), NO inventes un rango aproximado ni una cifra "razonable". Di explicitamente que no tienes ese dato preciso en tu base de conocimiento y da tu mejor criterio de cultivador experto SIN disfrazarlo de cita ni de cifra exacta.
- Ante la duda entre citar con precision o no citar, elige NO citar. Una respuesta sin cita es mejor que una cita que no sustenta lo dicho.
- NO cites cuando el fragmento es de la base de conocimiento interna sin autor/estudio identificable (ej. "L1 Base principiantes", "L2 Cultivo indoor") ni en preguntas basicas de manual (regar, trasplantar, pH basico) donde no aporta valor citar.
- Nunca inventes autor, revista o anio si el fragmento no los trae explicitamente.\n- Si el conocimiento no cubre la pregunta, responde con criterio de cultivador experto.`;
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
    'growshop', 'growshops', 'club', 'clubes', 'asociacion', 'asociaciones', 'cannabico', 'cannabica',
    'directorio', 'cerca de mi', 'donde comprar', 'donde hay',
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

/**
 * Detecta intención de "buscar growshop/club/asociación cerca de mí o en <ciudad>".
 * Heurística barata, sin red. Devuelve { tipo, ciudad } o null si no aplica.
 * tipo: 'growshop' | 'asociacion' | 'ambos'
 * ciudad: string si se detectó una ciudad en el texto, null si no (habrá que preguntarla).
 */
function detectDirectorySearchIntent(text) {
  const raw = String(text || '').trim();
  if (raw.length < 4) return null;
  const t = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const mentionsGrowshop = /\b(growshop|grow shop|tienda de cultivo|tiendas de cultivo)\b/.test(t);
  const mentionsClub = /\b(club|clubes|asociacion|asociaciones|club cannabico|asociacion cannabica)\b/.test(t);
  if (!mentionsGrowshop && !mentionsClub) return null;

  const asksLocation = /\b(cerca de mi|cerca mio|cerca|donde hay|donde esta|donde encuentro|donde puedo|en mi ciudad|recomiendame|recomienda|conoces alguno|conoces alguna)\b/.test(t);
  // "growshop en Madrid" / "club en Barcelona": "en <algo>" cuenta como señal de ubicación
  // aunque no haya verbo de búsqueda explícito.
  const hasEnLugar = /\ben\s+[a-z]/.test(t);
  if (!asksLocation && !hasEnLugar) return null;

  let tipo = 'ambos';
  if (mentionsGrowshop && !mentionsClub) tipo = 'growshop';
  if (mentionsClub && !mentionsGrowshop) tipo = 'asociacion';

  // Intento simple de extraer ciudad: "en <ciudad>" al final o tras "de"
  let ciudad = null;
  const m = raw.match(/\ben\s+([A-ZÁÉÍÓÚÑa-záéíóúñ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]{2,30})\s*[?.!]?$/);
  if (m) {
    const candidate = m[1].trim();
    // Evitar falsos positivos tipo "en mi ciudad" / "en españa"
    if (!/^(mi ciudad|espana|mi zona|mi barrio)$/i.test(candidate)) {
      ciudad = candidate;
    }
  }

  return { tipo, ciudad };
}

/** Consulta growshops y/o asociaciones activos por ciudad (ilike). Máx 5 cada uno. */
async function buscarDirectorioPorCiudad(env, tipo, ciudad) {
  const qc = `*${encodeURIComponent(ciudad)}*`;
  const out = { growshops: [], asociaciones: [] };
  if (tipo === 'growshop' || tipo === 'ambos') {
    const r = await sbRequest(env, `growshops?select=nombre,ciudad,direccion,telefono,web,instagram&ciudad=ilike.${qc}&activo=eq.true&limit=5`, { method: 'GET' });
    if (r.ok && Array.isArray(r.data)) out.growshops = r.data;
  }
  if (tipo === 'asociacion' || tipo === 'ambos') {
    const r = await sbRequest(env, `asociaciones?select=nombre,ciudad,direccion,telefono,web,instagram&ciudad=ilike.${qc}&activo=eq.true&limit=5`, { method: 'GET' });
    if (r.ok && Array.isArray(r.data)) out.asociaciones = r.data;
  }
  return out;
}

function formatDirectorioContexto(resultados) {
  const lineas = [];
  for (const g of resultados.growshops || []) {
    lineas.push(`- [Growshop] ${g.nombre} · ${g.ciudad}${g.direccion ? ' · ' + g.direccion : ''}${g.telefono ? ' · tel: ' + g.telefono : ''}${g.web ? ' · ' + g.web : ''}`);
  }
  for (const a of resultados.asociaciones || []) {
    lineas.push(`- [Club/Asociación] ${a.nombre} · ${a.ciudad}${a.direccion ? ' · ' + a.direccion : ''}${a.telefono ? ' · tel: ' + a.telefono : ''}${a.web ? ' · ' + a.web : ''}`);
  }
  return lineas.join('\n');
}

const DIRECTORY_ASK_CITY_REPLY =
  '¡Claro! ¿En qué ciudad o zona buscas? Así te digo qué hay en el directorio de Cannabicultor.';

/**
 * Si el turno anterior del asistente fue DIRECTORY_ASK_CITY_REPLY, el usuario está
 * respondiendo solo con una ciudad (ej. "Alcalá de Henares"), sin repetir "growshop"
 * ni "cerca de mí". detectDirectorySearchIntent() por sí sola no lo detecta porque
 * mira solo el último mensaje. Esta función mira el historial: si el assistant
 * acaba de pedir la ciudad, toma el texto del usuario tal cual como ciudad, y
 * recupera el "tipo" (growshop/asociacion/ambos) del mensaje de usuario anterior
 * a esa pregunta (el que sí mencionaba "growshop" o "club").
 */
function detectDirectorySearchIntentConHistorial(messages, textoConsulta) {
  const directo = detectDirectorySearchIntent(textoConsulta);
  if (directo) return directo;

  const lista = Array.isArray(messages) ? messages : [];
  if (lista.length < 2) return null;
  const anterior = lista[lista.length - 2];
  const anteriorTexto = anterior && typeof anterior.content === 'string' ? anterior.content : '';
  const fueAskCity = anterior && anterior.role === 'assistant' && anteriorTexto.includes('Así te digo qué hay en el directorio de Cannabicultor');
  if (!fueAskCity) return null;

  // La respuesta del usuario a "¿en qué ciudad?" es la ciudad en sí, sin más parsing.
  const ciudad = String(textoConsulta || '').trim().replace(/[?.!]+$/, '');
  if (!ciudad || ciudad.length < 2 || ciudad.length > 60) return null;

  // Recuperar el tipo (growshop/asociacion/ambos) del mensaje de usuario que originó la pregunta
  let tipo = 'ambos';
  for (let i = lista.length - 3; i >= 0; i--) {
    if (lista[i].role !== 'user') continue;
    const txt = typeof lista[i].content === 'string' ? lista[i].content : '';
    const previo = detectDirectorySearchIntent(txt);
    if (previo) { tipo = previo.tipo; break; }
  }

  return { tipo, ciudad };
}

async function handleChat(body, env) {
  const { messages, perfil } = body || {};
  if (!messages || !Array.isArray(messages) || !messages.length) {
    return { status: 400, data: { error: 'Faltan mensajes' } };
  }
  const anthropicMessages = normalizeMessages(messages);
  const withVision = hasVision(anthropicMessages);
  const textoConsulta = extractLastUserText(messages);

  // Directorio de growshops/clubes: intención explícita → consulta directa a Supabase,
  // sin pasar por RAG/LLM si falta la ciudad (ahorra una llamada y es más rápido para el usuario).
  const dirIntent = detectDirectorySearchIntentConHistorial(messages, textoConsulta);
  if (dirIntent && !dirIntent.ciudad) {
    return {
      status: 200,
      data: { reply: DIRECTORY_ASK_CITY_REPLY, provider: 'directory_heuristic' },
    };
  }
  let directorioContexto = null;
  if (dirIntent && dirIntent.ciudad) {
    try {
      const resultados = await buscarDirectorioPorCiudad(env, dirIntent.tipo, dirIntent.ciudad);
      const total = (resultados.growshops?.length || 0) + (resultados.asociaciones?.length || 0);
      directorioContexto = total > 0
        ? `Resultados del directorio de Cannabicultor para "${dirIntent.ciudad}":\n${formatDirectorioContexto(resultados)}`
        : `No hay fichas activas en el directorio de Cannabicultor para "${dirIntent.ciudad}". Dilo con honestidad, no inventes nombres de growshops o clubes.`;
    } catch (_) {
      directorioContexto = null;
    }
  }

  // Guarda barata de scope: off-topic claro → respuesta fija sin RAG ni LLM
  // (si ya detectamos intención de directorio, no aplica: es on-topic por definición)
  if (!dirIntent && isClearlyOffTopicCultivo(textoConsulta, withVision)) {
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
  const system = buildSystemPrompt(perfil, chunks, directorioContexto);

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

async function hasBenchmarkAccess(request, env) {
  const provided = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.BENCHMARK_API_KEY) return false;
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(env.BENCHMARK_API_KEY)),
  ]);
  return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
}

async function handleBenchmarkGrok(body, env) {
  const prompt = extractLastUserText(body?.messages || []);
  if (!prompt) return { status: 400, data: { error: 'Faltan mensajes' } };
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.XAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'grok-4-1-fast-reasoning', temperature: 0, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!response.ok) return { status: response.status, data: { error: 'Grok no disponible' } };
  const value = await response.json();
  return { status: 200, data: { reply: value.choices?.[0]?.message?.content || '' } };
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

const FUNDADOR_TOPE = 500;
const STRIPE_SEMILLA = 'https://buy.stripe.com/3cI00c9Ex8WH22PenB6AM04';

function planTieneAccesoSemilla(plan) {
  const p = String(plan || '').toLowerCase();
  return p === 'fundador' || p === 'semilla' || p === 'cultivador'
    || p === 'semilla_fundador' || p === 'master' || p === 'genetista';
}

async function countUsuariosPlan(env, plan) {
  const res = await sbRequest(env, `Usuarios?plan=eq.${encodeURIComponent(plan)}&select=id`, {
    method: 'GET',
    headers: { Prefer: 'count=exact', Range: '0-0' },
  });
  return typeof res.count === 'number' ? res.count : 0;
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
  const nFundador = await countUsuariosPlan(env, 'fundador');
  if (nFundador >= FUNDADOR_TOPE) {
    const stripe = email
      ? `${STRIPE_SEMILLA}?prefilled_email=${encodeURIComponent(email)}`
      : STRIPE_SEMILLA;
    return {
      status: 409,
      data: {
        fundador_agotado: true,
        error: 'Las plazas Fundador se han agotado. Pasa a Semilla (5€/mes) para las mismas funciones.',
        stripe_semilla: stripe,
      },
    };
  }
  const planNuevo = 'fundador';
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
  const userCultivo = await getUserByEmail(env, email);
  if (!userCultivo) return { status: 404, data: { error: 'Usuario no encontrado' } };
  if (!planTieneAccesoSemilla(userCultivo.plan)) {
    return { status: 403, data: { error: 'El análisis de cultivo está disponible desde Fundador.' } };
  }
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
  if (!planTieneAccesoSemilla(user.plan)) {
    return { status: 403, data: { error: 'El análisis de cultivo está disponible desde Fundador.' } };
  }
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
  if (!planTieneAccesoSemilla(user.plan)) {
    return { status: 403, data: { error: 'El análisis de cultivo está disponible desde Fundador.' } };
  }

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
  'notas',
]);
const FOTO_SIGN_TTL_SEC = 6 * 60 * 60;

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

function encodeStoragePath(path) {
  return String(path).split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

/** Ruta interna del bucket `plantas`. Nunca devolver una URL pública. */
function normalizeFotoPath(ruta) {
  if (!ruta) return null;
  let s = String(ruta).trim().split('?')[0];
  if (!s) return null;
  const markers = [
    '/storage/v1/object/public/plantas/',
    '/storage/v1/object/sign/plantas/',
    '/storage/v1/object/authenticated/plantas/',
    '/storage/v1/object/plantas/',
  ];
  for (const m of markers) {
    const i = s.indexOf(m);
    if (i !== -1) {
      try { s = decodeURIComponent(s.slice(i + m.length)); } catch { s = s.slice(i + m.length); }
      break;
    }
  }
  s = s.replace(/^\/+/, '');
  if (!s || s.includes('..') || s.length > 500) return null;
  return s;
}

function fotoPathOwnedBy(path, email) {
  if (!path || !email) return false;
  return path.toLowerCase().startsWith(String(email).trim().toLowerCase() + '/');
}

async function signFotoUrls(env, paths) {
  const unique = [...new Set((paths || []).map(normalizeFotoPath).filter(Boolean))];
  const out = new Map();
  if (!unique.length || !env.SUPABASE_SERVICE_KEY) return out;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/plantas`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: FOTO_SIGN_TTL_SEC, paths: unique }),
  });
  if (res.ok) {
    const data = await res.json().catch(() => null);
    const rows = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
    for (const row of rows) {
      const path = normalizeFotoPath(row.path || row.name);
      const signed = row.signedURL || row.signedUrl;
      if (!path || !signed || row.error) continue;
      out.set(path, /^https?:\/\//i.test(signed)
        ? signed
        : `${SUPABASE_URL}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`);
    }
  }
  const missing = unique.filter((p) => !out.has(p));
  await Promise.all(missing.map(async (path) => {
    const signed = await signFotoUrlOne(env, path);
    if (signed) out.set(path, signed);
  }));
  return out;
}

async function signFotoUrlOne(env, path) {
  const clean = normalizeFotoPath(path);
  if (!clean || !env.SUPABASE_SERVICE_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/plantas/${encodeStoragePath(clean)}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: FOTO_SIGN_TTL_SEC }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const signed = data && (data.signedURL || data.signedUrl);
  if (!signed) return null;
  return /^https?:\/\//i.test(signed)
    ? signed
    : `${SUPABASE_URL}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`;
}

async function registrarDiarioFoto(env, { email, entradaId, path, origen }) {
  const storagePath = normalizeFotoPath(path);
  if (!email || !storagePath) return null;
  if (!fotoPathOwnedBy(storagePath, email)) return null;
  const fila = {
    usuario_email: email,
    entrada_id: entradaId || null,
    storage_path: storagePath,
    origen: origen || null,
  };
  const res = await sbRequest(env, 'diario_fotos?on_conflict=storage_path', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify(fila),
  });
  if (!res.ok) return null;
  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  return row || { storage_path: storagePath, entrada_id: entradaId || null };
}

async function decorateEntradasConFotos(env, email, entradas) {
  if (!Array.isArray(entradas) || !entradas.length) return [];
  const ids = entradas.map((e) => e.id).filter((id) => Number.isFinite(Number(id)));
  let byEntrada = {};
  if (ids.length) {
    const q = `diario_fotos?usuario_email=eq.${encodeURIComponent(email)}&entrada_id=in.(${ids.join(',')})&select=id,entrada_id,storage_path,created_at&order=created_at.desc`;
    const res = await sbRequest(env, q, { method: 'GET' });
    if (res.ok && Array.isArray(res.data)) {
      for (const r of res.data) {
        if (!byEntrada[r.entrada_id]) byEntrada[r.entrada_id] = [];
        byEntrada[r.entrada_id].push(r);
      }
    }
  }
  const paths = [];
  for (const e of entradas) {
    const rows = byEntrada[e.id] || [];
    const colPath = normalizeFotoPath(e.foto_url);
    if (colPath && !rows.some((r) => r.storage_path === colPath)) {
      rows.unshift({ id: null, entrada_id: e.id, storage_path: colPath });
      byEntrada[e.id] = rows;
    }
    for (const r of rows) paths.push(r.storage_path);
  }
  const signed = await signFotoUrls(env, paths);
  return entradas.map((e) => {
    const rows = byEntrada[e.id] || [];
    const fotos = [];
    for (const r of rows) {
      const url = signed.get(normalizeFotoPath(r.storage_path));
      if (url) fotos.push({ id: r.id, url });
    }
    return { ...e, foto_url: fotos[0] ? fotos[0].url : null, fotos };
  });
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

  // Foto adjunta desde el formulario (base64 JPEG) → Storage plantas/{email}/uuid.jpg
  // foto_url del cliente se ignora (DIARIO_COLS ya no lo incluye): solo escribe el Worker.
  let fotoPath = null;
  const fotoB64 = body.foto_base64 || src.foto_base64 || null;
  if (fotoB64 && typeof fotoB64 === 'string') {
    try {
      const raw = fotoB64.includes(',') ? fotoB64.split(',')[1] : fotoB64;
      let bytes = b64ToBytes(raw);
      if (esJpeg(bytes)) bytes = limpiarMetadatosJpeg(bytes);
      fotoPath = `${email}/${crypto.randomUUID()}.jpg`;
      await subirFotoStorage(env, bytes, fotoPath);
      fila.foto_url = fotoPath;
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
  if (fotoPath && row && row.id) {
    await registrarDiarioFoto(env, { email, entradaId: row.id, path: fotoPath, origen: 'diario' });
  }
  const decorated = await decorateEntradasConFotos(env, email, [row]);
  return { status: 200, data: { ok: true, entrada: decorated[0] || row } };
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
  const rawEntradas = Array.isArray(res.data) ? res.data : [];
  const entradas = await decorateEntradasConFotos(env, email, rawEntradas);
  // Fechas con al menos una entrada (para resaltar en el calendario del cliente)
  const fechas = [...new Set(entradas.map((e) => e.fecha).filter(Boolean))];
  return { status: 200, data: { ok: true, entradas, fechas, fecha: fechaOk ? fecha : null } };
}

function htmlEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function bytesToBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function fetchFotoBase64(env, path) {
  const clean = normalizeFotoPath(path);
  if (!clean || !env.SUPABASE_SERVICE_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/plantas/${encodeStoragePath(clean)}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > 4_000_000) return null;
  const mime = res.headers.get('content-type') || 'image/jpeg';
  return `data:${mime};base64,${bytesToBase64(buf)}`;
}

function slugExportName(s) {
  return String(s || 'cultivo')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'cultivo';
}

const DIARIO_INFORME_PAGE = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Exportar diario · Cannabicultor</title>
<style>
body{font-family:Inter,system-ui,sans-serif;background:#f5f7f4;color:#151515;margin:0;padding:28px}
.box{max-width:420px;margin:40px auto;background:#fff;border:1px solid #e6e8e4;border-radius:16px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
h1{font-size:22px;margin:0 0 8px}
p{color:#6f746f;font-size:14px;line-height:1.5}
label{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6f746f;margin:14px 0 6px}
input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #ddd;border-radius:10px;font:15px inherit}
button{margin-top:18px;width:100%;border:0;background:#1a5c32;color:#fff;border-radius:999px;padding:13px;font-weight:700;font-size:15px;cursor:pointer}
button:disabled{opacity:.6}
.err{color:#b94b42;font-size:13px;margin-top:10px}
</style></head><body>
<div class="box">
<h1>Exportar diario para un consultor</h1>
<p>Entra con la misma cuenta del dashboard. Se descarga un HTML con apuntes y fotos, listo para enviar o imprimir a PDF.</p>
<form id="f">
<label>Email</label><input name="email" type="email" autocomplete="username" required>
<label>Contraseña</label><input name="password" type="password" autocomplete="current-password" required>
<button type="submit">Descargar informe</button>
<div class="err" id="err"></div>
</form>
</div>
<script>
const API = location.origin;
document.getElementById('f').onsubmit = async (e) => {
  e.preventDefault();
  const err = document.getElementById('err');
  const btn = e.target.querySelector('button');
  err.textContent = '';
  btn.disabled = true; btn.textContent = 'Preparando…';
  try {
    const fd = new FormData(e.target);
    const login = await fetch(API + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') })
    });
    const data = await login.json();
    if (!login.ok || !data.token) throw new Error(data.error || 'No se pudo entrar');
    const q = new URLSearchParams({ email: data.email, limit: '200' });
    const exp = await fetch(API + '/diario/export?' + q, { headers: { Authorization: 'Bearer ' + data.token } });
    if (!exp.ok) {
      const j = await exp.json().catch(() => ({}));
      throw new Error(j.error || 'No se pudo generar el informe');
    }
    const blob = await exp.blob();
    const m = /filename="([^"]+)"/.exec(exp.headers.get('Content-Disposition') || '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = m ? m[1] : 'diario-cultivo.html';
    a.click();
    btn.textContent = 'Descargado';
  } catch (ex) {
    err.textContent = ex.message || 'Error';
    btn.textContent = 'Descargar informe';
    btn.disabled = false;
  }
};
</script>
</body></html>`;

/** GET /diario/export — HTML autocontenido (apuntes + fotos) para enviar a un consultor. */
async function handleExportDiario(url, env, request) {
  const listed = await handleListDiario(url, env, request);
  if (listed.status !== 200) return listed;
  const email = (url.searchParams.get('email') || '').trim().toLowerCase();
  const user = email ? await getUserByEmail(env, email) : null;
  const perfil = (user && user.perfil_cultivo && typeof user.perfil_cultivo === 'object') ? user.perfil_cultivo : {};
  const cultivo = (perfil.cultivo && typeof perfil.cultivo === 'object') ? perfil.cultivo : {};
  const nombre = cultivo.nombre || perfil.nombre || perfil.genetica || cultivo.genetica || 'Cultivo';
  const genetica = cultivo.genetica || perfil.genetica || '';
  const fase = cultivo.fase || perfil.fase || '';
  const setup = cultivo.setup || perfil.setup || '';
  const inicio = cultivo.fechaInicio || perfil.fechaInicio || '';
  const entradas = listed.data.entradas || [];

  const paths = [];
  for (const e of entradas) {
    if (Array.isArray(e.fotos)) e.fotos.forEach((f) => { if (f && f.url) paths.push(f.url); });
    else if (e.foto_url) paths.push(e.foto_url);
  }
  const unique = [...new Set(paths.map(normalizeFotoPath).filter(Boolean))].slice(0, 80);
  const embeds = new Map();
  await Promise.all(unique.map(async (p) => {
    const data = await fetchFotoBase64(env, p);
    if (data) embeds.set(p, data);
  }));

  const cell = (k, v) => (v == null || v === '' ? '' : `<div class="kv"><span>${htmlEsc(k)}</span><b>${htmlEsc(String(v))}</b></div>`);
  const byDate = {};
  for (const e of entradas) {
    const f = e.fecha || 'sin-fecha';
    (byDate[f] ||= []).push(e);
  }
  const fechas = Object.keys(byDate).sort().reverse();
  const diasHtml = fechas.map((fecha) => {
    const items = byDate[fecha].map((e) => {
      const fert = e.fertilizantes == null ? null
        : (typeof e.fertilizantes === 'string' ? e.fertilizantes : JSON.stringify(e.fertilizantes));
      const fotoPaths = (Array.isArray(e.fotos) && e.fotos.length)
        ? e.fotos.map((f) => normalizeFotoPath(f && f.url)).filter(Boolean)
        : (e.foto_url ? [normalizeFotoPath(e.foto_url)] : []);
      const imgs = fotoPaths.map((p) => embeds.get(p)).filter(Boolean)
        .map((src) => `<img src="${src}" alt="Foto del cultivo">`).join('');
      return `<article class="entry">
        <div class="meta">${e.created_at ? htmlEsc(new Date(e.created_at).toLocaleString('es-ES')) : ''}${e.etapa ? ' · ' + htmlEsc(e.etapa) : ''}${e.dia_ciclo != null ? ' · Día ' + e.dia_ciclo : ''}</div>
        <div class="grid">
          ${cell('pH', e.ph)}${cell('EC', e.ec)}${cell('Temp °C', e.temp)}${cell('Hum %', e.hum)}
          ${cell('VPD', e.vpd)}${cell('Riego (L)', e.riego_litros)}
          ${cell('Riego pH', e.riego_ph)}${cell('Riego EC', e.riego_ec)}
          ${cell('Runoff pH', e.runoff_ph)}${cell('Runoff EC', e.runoff_ec)}
          ${cell('Fertilizantes', fert)}${cell('Plagas', e.plagas)}
          ${cell('Hongos', e.hongos)}${cell('Tratamiento', e.tratamiento)}
          ${cell('Poda', e.poda)}${cell('Trasplante', e.trasplante ? 'Sí' : null)}
        </div>
        ${e.notas ? `<p class="notas">${htmlEsc(String(e.notas))}</p>` : ''}
        ${imgs ? `<div class="fotos">${imgs}</div>` : ''}
      </article>`;
    }).join('');
    return `<section><h2>${htmlEsc(fecha)}</h2>${items}</section>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<title>Diario de cultivo · ${htmlEsc(nombre)}</title>
<style>
body{font-family:Inter,system-ui,sans-serif;background:#f5f7f4;color:#151515;margin:0;padding:24px}
.wrap{max-width:760px;margin:0 auto;background:#fff;border:1px solid #e6e8e4;border-radius:16px;padding:28px 28px 40px}
h1{font-size:26px;margin:0 0 6px}
.sub{color:#6f746f;font-size:14px;margin-bottom:18px;line-height:1.5}
.perfil{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin-bottom:22px;padding:14px;background:#e8f0ea;border-radius:12px;font-size:14px}
.perfil span{color:#6f746f;display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
section{margin:22px 0;padding-top:8px;border-top:1px solid #eee}
h2{font-size:16px;margin:0 0 10px;color:#1a5c32}
.entry{margin-bottom:16px;padding:12px;border:1px solid #eee;border-radius:12px}
.meta{font-size:12px;color:#9aa09a;font-weight:600;margin-bottom:8px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.kv span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#9aa09a}
.kv b{font-size:14px}
.notas{font-size:14px;line-height:1.55;color:#333;margin:10px 0 0}
.fotos img{display:block;max-width:100%;border-radius:10px;margin-top:10px}
.foot{margin-top:28px;font-size:11px;color:#9aa09a}
@media print{body{background:#fff;padding:0}.wrap{border:0}}
</style></head><body>
<div class="wrap">
<h1>Diario de cultivo · ${htmlEsc(nombre)}</h1>
<p class="sub">Informe para consultor · ${htmlEsc(new Date().toLocaleDateString('es-ES'))} · ${entradas.length} registro${entradas.length===1?'':'s'}${unique.length>embeds.size?` · ${embeds.size} de ${unique.length} fotos incrustadas`:''}</p>
<div class="perfil">
  <div><span>Planta / genética</span><b>${htmlEsc(genetica || nombre)}</b></div>
  <div><span>Fase</span><b>${htmlEsc(fase || '—')}</b></div>
  <div><span>Inicio</span><b>${htmlEsc(inicio || '—')}</b></div>
  <div><span>Setup</span><b>${htmlEsc(setup || '—')}</b></div>
</div>
${diasHtml || '<p>No hay entradas en el diario.</p>'}
<p class="foot">Generado por Cannabicultor. Fotos incrustadas en el archivo (se pueden enviar por email o imprimir a PDF).</p>
</div></body></html>`;

  return {
    status: 200,
    filename: `diario-${slugExportName(genetica || nombre)}-${new Date().toISOString().slice(0, 10)}.html`,
    html,
  };
}

/** Foto del chat → inserta o actualiza la entrada de hoy y registra diario_fotos. */
async function upsertDiarioFoto(env, email, imagenRuta, pregunta, reply) {
  const hoy = new Date().toISOString().slice(0, 10);
  const fotoPath = normalizeFotoPath(imagenRuta);
  if (!fotoPath || !email) return;
  const user = await getUserByEmail(env, email);
  const perfil = (user && user.perfil_cultivo && typeof user.perfil_cultivo === 'object') ? user.perfil_cultivo : {};
  const diaCiclo = calcDiaCicloFromPerfil(perfil);
  const etapa = (perfil.cultivo && perfil.cultivo.fase) || perfil.fase || null;
  const notaFoto = [pregunta, reply ? `IA: ${String(reply).slice(0, 280)}` : null].filter(Boolean).join('\n');

  const q = `diario_entradas?usuario_email=eq.${encodeURIComponent(email)}&fecha=eq.${hoy}&select=id,foto_url,notas&order=created_at.desc&limit=1`;
  const existing = await sbRequest(env, q, { method: 'GET' });
  let entradaId = null;
  if (existing.ok && Array.isArray(existing.data) && existing.data.length) {
    const row = existing.data[0];
    entradaId = row.id;
    const notas = [row.notas, notaFoto].filter(Boolean).join('\n---\n');
    await sbRequest(env, `diario_entradas?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ foto_url: fotoPath, notas: notas || null }),
    });
  } else {
    const created = await sbRequest(env, 'diario_entradas', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        usuario_email: email,
        fecha: hoy,
        dia_ciclo: diaCiclo,
        etapa: etapa ? String(etapa) : null,
        foto_url: fotoPath,
        notas: notaFoto || null,
      }),
    });
    const row = created.ok && Array.isArray(created.data) ? created.data[0] : created.data;
    entradaId = row && row.id;
  }
  await registrarDiarioFoto(env, { email, entradaId, path: fotoPath, origen: 'chat' });
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
// RESEÑAS (variedad / breeder)
// =========================================================================
function displayNameFromEmail(email) {
  const local = String(email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
  if (!local) return 'Cultivador';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function parseResenaTarget(tipoRaw, idRaw) {
  const tipo = String(tipoRaw || '').trim();
  const targetId = parseInt(idRaw, 10);
  if (tipo !== 'variedad' && tipo !== 'breeder' && tipo !== 'growshop' && tipo !== 'asociacion') {
    return { error: { status: 400, data: { error: 'tipo inválido' } } };
  }
  if (!Number.isFinite(targetId) || targetId < 1) return { error: { status: 400, data: { error: 'id inválido' } } };
  return { tipo, targetId };
}

async function handleListResenas(url, env) {
  const parsed = parseResenaTarget(url.searchParams.get('tipo'), url.searchParams.get('id'));
  if (parsed.error) return parsed.error;
  const { tipo, targetId } = parsed;
  const res = await sbRequest(env,
    `resenas?tipo=eq.${encodeURIComponent(tipo)}&target_id=eq.${targetId}&select=id,nombre_publico,puntuacion,texto,created_at&order=created_at.desc&limit=50`,
    { method: 'GET' }
  );
  if (!res.ok) return { status: 500, data: { error: 'No se pudieron leer las reseñas' } };
  const items = Array.isArray(res.data) ? res.data : [];
  const n = items.length;
  const media = n ? Math.round((items.reduce((s, r) => s + Number(r.puntuacion || 0), 0) / n) * 10) / 10 : null;
  return { status: 200, data: { ok: true, tipo, id: targetId, media, total: n, resenas: items } };
}

async function handleCreateResena(body, env, request) {
  const auth = await authEmailFromRequest(request, env, body.email);
  if (auth.error) return auth.error;
  const parsed = parseResenaTarget(body.tipo, body.id ?? body.target_id);
  if (parsed.error) return parsed.error;
  const { tipo, targetId } = parsed;
  if (tipo === 'growshop') {
    const exists = await sbRequest(env, `growshops?id=eq.${targetId}&select=id,activo`, { method: 'GET' });
    if (!exists.ok || !Array.isArray(exists.data) || !exists.data.length || exists.data[0].activo === false) {
      return { status: 404, data: { error: 'Growshop no encontrado' } };
    }
  }
  if (tipo === 'asociacion') {
    const exists = await sbRequest(env, `asociaciones?id=eq.${targetId}&select=id,activo`, { method: 'GET' });
    if (!exists.ok || !Array.isArray(exists.data) || !exists.data.length || exists.data[0].activo === false) {
      return { status: 404, data: { error: 'Asociación no encontrada' } };
    }
  }
  const puntuacion = parseInt(body.puntuacion, 10);
  if (!Number.isFinite(puntuacion) || puntuacion < 1 || puntuacion > 5) {
    return { status: 400, data: { error: 'La puntuación debe ser de 1 a 5' } };
  }
  const texto = body.texto == null || body.texto === '' ? null : String(body.texto).trim().slice(0, 800);
  const nombre = displayNameFromEmail(auth.email);
  const fila = {
    tipo,
    target_id: targetId,
    usuario_email: auth.email,
    nombre_publico: nombre,
    puntuacion,
    texto,
    updated_at: new Date().toISOString(),
  };
  const res = await sbRequest(env, 'resenas?on_conflict=tipo,target_id,usuario_email', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify(fila),
  });
  if (!res.ok) {
    const msg = res.data?.message || res.data?.error || 'No se pudo guardar la reseña';
    return { status: 500, data: { error: msg } };
  }
  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  return { status: 200, data: { ok: true, resena: row } };
}

function slugifyFicha(nombre, ciudad, fallback = 'ficha') {
  const raw = [nombre, ciudad].filter(Boolean).join(' ');
  const map = { á: 'a', à: 'a', ä: 'a', â: 'a', é: 'e', è: 'e', ë: 'e', ê: 'e', í: 'i', ì: 'i', ï: 'i', î: 'i', ó: 'o', ò: 'o', ö: 'o', ô: 'o', ú: 'u', ù: 'u', ü: 'u', û: 'u', ñ: 'n', ç: 'c' };
  const s = String(raw || fallback).toLowerCase().replace(/[áàäâéèëêíìïîóòöôúùüûñç]/g, (c) => map[c] || c);
  return s.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || fallback;
}

function slugifyGrowshop(nombre, ciudad) {
  return slugifyFicha(nombre, ciudad, 'growshop');
}

function cleanUrl(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s.slice(0, 240);
  if (/^[\w.-]+\.[a-z]{2,}/i.test(s)) return `https://${s}`.slice(0, 240);
  return null;
}

async function handleCreateGrowshop(body, env, request) {
  const auth = await authEmailFromRequest(request, env, body.email);
  if (auth.error) return auth.error;
  const nombre = String(body.nombre || '').trim().slice(0, 160);
  const ciudad = String(body.ciudad || '').trim().slice(0, 80);
  if (nombre.length < 2 || ciudad.length < 2) {
    return { status: 400, data: { error: 'Nombre y ciudad son obligatorios' } };
  }
  const qn = encodeURIComponent(`"${nombre}"`);
  const qc = encodeURIComponent(`"${ciudad}"`);
  const dup = await sbRequest(
    env,
    `growshops?select=id,nombre,ciudad&nombre=ilike.${qn}&ciudad=ilike.${qc}&limit=1`,
    { method: 'GET' }
  );
  if (dup.ok && Array.isArray(dup.data) && dup.data.length) {
    return { status: 409, data: { error: 'Ya hay una ficha con ese nombre en esa ciudad', growshop: dup.data[0] } };
  }
  let slug = slugifyGrowshop(nombre, ciudad);
  const taken = await sbRequest(env, `growshops?select=slug&slug=like.${encodeURIComponent(slug)}*`, { method: 'GET' });
  const slugs = new Set((Array.isArray(taken.data) ? taken.data : []).map((r) => r.slug));
  if (slugs.has(slug)) {
    let n = 2;
    while (slugs.has(`${slug}-${n}`)) n += 1;
    slug = `${slug}-${n}`;
  }
  const fila = {
    slug,
    nombre,
    ciudad,
    provincia: body.provincia ? String(body.provincia).trim().slice(0, 80) : null,
    ccaa: body.ccaa ? String(body.ccaa).trim().slice(0, 80) : null,
    direccion: body.direccion ? String(body.direccion).trim().slice(0, 200) : null,
    telefono: body.telefono ? String(body.telefono).trim().slice(0, 40) : null,
    web: cleanUrl(body.web),
    instagram: body.instagram ? String(body.instagram).trim().slice(0, 80) : null,
    logo_url: cleanUrl(body.logo_url),
    email: body.email_contacto || body.email_tienda ? String(body.email_contacto || body.email_tienda).trim().slice(0, 120) : null,
    notas_envio: body.notas_envio ? String(body.notas_envio).trim().slice(0, 400) : null,
    fuente: 'manual',
    verificado: false,
    activo: true,
    enviado_por: auth.email,
  };
  const res = await sbRequest(env, 'growshops', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(fila),
  });
  if (!res.ok) {
    const msg = res.data?.message || res.data?.error || 'No se pudo guardar el growshop';
    return { status: 500, data: { error: msg } };
  }
  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  return { status: 200, data: { ok: true, growshop: row } };
}

async function handleCreateAsociacion(body, env, request) {
  const auth = await authEmailFromRequest(request, env, body.email);
  if (auth.error) return auth.error;
  const nombre = String(body.nombre || '').trim().slice(0, 160);
  const ciudad = String(body.ciudad || '').trim().slice(0, 80);
  if (nombre.length < 2 || ciudad.length < 2) {
    return { status: 400, data: { error: 'Nombre y ciudad son obligatorios' } };
  }
  const qn = encodeURIComponent(`"${nombre}"`);
  const qc = encodeURIComponent(`"${ciudad}"`);
  const dup = await sbRequest(
    env,
    `asociaciones?select=id,nombre,ciudad&nombre=ilike.${qn}&ciudad=ilike.${qc}&limit=1`,
    { method: 'GET' }
  );
  if (dup.ok && Array.isArray(dup.data) && dup.data.length) {
    return { status: 409, data: { error: 'Ya hay una ficha con ese nombre en esa ciudad', asociacion: dup.data[0] } };
  }
  let slug = slugifyFicha(nombre, ciudad, 'asociacion');
  const taken = await sbRequest(env, `asociaciones?select=slug&slug=like.${encodeURIComponent(slug)}*`, { method: 'GET' });
  const slugs = new Set((Array.isArray(taken.data) ? taken.data : []).map((r) => r.slug));
  if (slugs.has(slug)) {
    let n = 2;
    while (slugs.has(`${slug}-${n}`)) n += 1;
    slug = `${slug}-${n}`;
  }
  const fila = {
    slug,
    nombre,
    ciudad,
    provincia: body.provincia ? String(body.provincia).trim().slice(0, 80) : null,
    ccaa: body.ccaa ? String(body.ccaa).trim().slice(0, 80) : null,
    direccion: body.direccion ? String(body.direccion).trim().slice(0, 200) : null,
    acceso: body.acceso ? String(body.acceso).trim().slice(0, 160) : null,
    telefono: body.telefono ? String(body.telefono).trim().slice(0, 40) : null,
    web: cleanUrl(body.web),
    instagram: body.instagram ? String(body.instagram).trim().slice(0, 80) : null,
    logo_url: cleanUrl(body.logo_url),
    email: body.email_contacto || body.email_asociacion ? String(body.email_contacto || body.email_asociacion).trim().slice(0, 120) : null,
    notas_envio: body.notas_envio ? String(body.notas_envio).trim().slice(0, 400) : null,
    fuente: 'manual',
    verificado: false,
    activo: true,
    enviado_por: auth.email,
  };
  const res = await sbRequest(env, 'asociaciones', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(fila),
  });
  if (!res.ok) {
    const msg = res.data?.message || res.data?.error || 'No se pudo guardar la asociación';
    return { status: 500, data: { error: msg } };
  }
  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  return { status: 200, data: { ok: true, asociacion: row } };
}

// =========================================================================
// ASESOR CANNABICULTOR (widget B2B embebible) — prototipo single-tenant
// Ruta pública /asesor: recomienda productos del catálogo demo. Sin JWT.
// Catálogo de prueba: tabla demo_growshop_productos (NO es tienda real).
// =========================================================================
const ASESOR_TABLA = 'demo_growshop_productos';
const ASESOR_STOPWORDS = new Set(
  ('para con una unos unas del los las que como cual necesito quiero tengo mi mis me te se un el la de en y a o u es por su sus muy mas más algo alguna algun algún cuanto cuánto cuál sobre entre este esta esto estos estas cannabis planta plantas cultivo growshop hola gracias porfa favor recomienda recomiendas mejor bueno buena').split(
    ' '
  )
);

function asesorKeywords(texto) {
  const norm = String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const seen = [];
  (norm.match(/[a-z0-9]+/g) || []).forEach((w) => {
    if (w.length < 3 || ASESOR_STOPWORDS.has(w)) return;
    if (seen.indexOf(w) === -1) seen.push(w);
  });
  return seen.slice(0, 6);
}

async function buscarProductosAsesor(env, texto, categoria) {
  const cols = 'sku,nombre,marca,categoria,descripcion_texto,precio_con_iva,stock,imagen_principal,slug';
  const kws = asesorKeywords(texto);
  const params = ['select=' + cols, 'limit=14'];
  if (kws.length) {
    const ors = [];
    kws.forEach((kw) => {
      const v = '*' + kw + '*';
      ors.push('nombre.ilike.' + v, 'descripcion_texto.ilike.' + v, 'categoria.ilike.' + v);
    });
    params.push('or=(' + ors.join(',') + ')');
  }
  if (categoria) params.push('categoria=ilike.*' + encodeURIComponent(categoria) + '*');
  params.push('order=stock.desc.nullslast');
  const res = await sbRequest(env, ASESOR_TABLA + '?' + params.join('&'), { method: 'GET' });
  const rows = Array.isArray(res.data) ? res.data : [];
  // Si la búsqueda por palabras no devuelve nada, mostramos algo del catálogo.
  if (!rows.length && kws.length) {
    const fb = await sbRequest(env, ASESOR_TABLA + '?select=' + cols + '&limit=6&order=stock.desc.nullslast', {
      method: 'GET',
    });
    return Array.isArray(fb.data) ? fb.data : [];
  }
  return rows;
}

function asesorPublicProduct(p) {
  return {
    sku: p.sku,
    nombre: p.nombre,
    marca: p.marca || null,
    categoria: p.categoria || null,
    precio_con_iva: p.precio_con_iva != null ? Number(p.precio_con_iva) : null,
    imagen_principal: p.imagen_principal || null,
    slug: p.slug || null,
  };
}

const ASESOR_SYSTEM_BASE = `Eres el Asesor de un growshop: un vendedor experto que ayuda a clientes a elegir producto de cultivo (iluminación, extracción, sustratos, macetas, medidores, riego, fertilizantes).

REGLAS ESTRICTAS:
1. SOLO puedes recomendar productos que aparezcan en el CATÁLOGO de abajo. Nunca inventes productos, marcas ni precios.
2. Cita los productos que recomiendes por su NÚMERO entre corchetes, ej: [2]. Puedes recomendar 1–3 como máximo.
3. Si el catálogo no tiene nada adecuado para lo que pide, dilo con honestidad y pide más datos (espacio, fase, presupuesto). No fuerces una venta.
4. Respuesta breve y útil: máximo 8 líneas. Primero responde directo, luego justifica en una frase.
5. Tono cercano, tuteo, sin tecnicismos innecesarios. No inventes datos técnicos que no estén en la descripción del producto.`;

async function handleAsesor(body, env) {
  const messages = body && Array.isArray(body.messages) ? body.messages : null;
  if (!messages || !messages.length) return { status: 400, data: { error: 'Faltan mensajes' } };
  if (!env.ANTHROPIC_API_KEY) return { status: 500, data: { error: 'Asesor no configurado' } };

  let lastUser = '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i] && messages[i].role === 'user') {
      lastUser = typeof messages[i].content === 'string' ? messages[i].content : '';
      break;
    }
  }

  const productos = await buscarProductosAsesor(env, lastUser, body && body.categoria);
  const contexto = productos.length
    ? productos
        .map((p, i) => {
          const precio = p.precio_con_iva != null ? Number(p.precio_con_iva).toFixed(2) + ' €' : 'precio n/d';
          const marca = p.marca ? ' — ' + p.marca : '';
          const desc = String(p.descripcion_texto || '').slice(0, 220);
          return `[${i + 1}] ${p.nombre}${marca} · ${p.categoria || ''} · ${precio} · stock:${p.stock == null ? '?' : p.stock}\n${desc}`;
        })
        .join('\n\n')
    : '(No hay productos que coincidan con la consulta.)';

  const system = ASESOR_SYSTEM_BASE + '\n\nCATÁLOGO DISPONIBLE:\n' + contexto;

  const anthropicMessages = messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: typeof m.content === 'string' ? m.content : String(m.content || ''),
  }));

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 600,
      system,
      messages: anthropicMessages,
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text();
    return { status: 500, data: { error: 'API Error', details: detail } };
  }
  const data = await resp.json();
  const reply = (data.content && data.content[0] && data.content[0].text) || 'No he podido generar respuesta.';

  // Productos citados por [n]; si no cita ninguno, no adjuntamos tarjetas.
  const cited = [];
  const re = /\[(\d+)\]/g;
  let m;
  while ((m = re.exec(reply)) !== null) {
    const idx = parseInt(m[1], 10) - 1;
    if (idx >= 0 && idx < productos.length && cited.indexOf(idx) === -1) cited.push(idx);
  }
  const chosen = cited.slice(0, 3).map((i) => asesorPublicProduct(productos[i]));
  // Limpia las marcas [n] del texto visible.
  const replyLimpio = reply.replace(/\s*\[\d+\]/g, '');

  return { status: 200, data: { reply: replyLimpio, products: chosen } };
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
        if (path === '/diario/export') {
          const r = await handleExportDiario(url, env, request);
          if (r.html) {
            return new Response(r.html, {
              status: 200,
              headers: {
                ...cors,
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Disposition': `attachment; filename="${r.filename || 'diario-cultivo.html'}"`,
              },
            });
          }
          return json(r.data, r.status, cors);
        }
        if (path === '/diario/informe') {
          return new Response(DIARIO_INFORME_PAGE, {
            status: 200,
            headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
        if (path === '/fertilizantes' || path === '/fertilizantes.html') {
          const gh = await fetch('https://raw.githubusercontent.com/Cannabicultor/Cannabicultor/main/fertilizantes.html');
          if (!gh.ok) return new Response('Guía no disponible', { status: 502, headers: cors });
          return new Response(await gh.text(), {
            status: 200,
            headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
          });
        }
        if (path === '/resenas') {
          const r = await handleListResenas(url, env);
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

      // Ruta privada para comparativas reproducibles. No usa una sesión de usuario
      // ni persiste diagnósticos; solo atiende peticiones autorizadas por secreto.
      if (path === '/benchmark') {
        if (!await hasBenchmarkAccess(request, env)) return json({ error: 'No autorizado' }, 401, cors);
        const result = await handleChat(body, env);
        return json(result.data, result.status, cors);
      }
      if (path === '/benchmark/grok') {
        if (!await hasBenchmarkAccess(request, env)) return json({ error: 'No autorizado' }, 401, cors);
        const result = await handleBenchmarkGrok(body, env);
        return json(result.data, result.status, cors);
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

      if (path === '/sales-agent/chat') { const r = await handleSalesAgentChat(body, env); return json(r.data, r.status, cors); }
      if (path === '/asesor') { const r = await handleAsesor(body, env); return json(r.data, r.status, cors); }
      if (path === '/cultivo/guardar') { const r = await handleGuardarCultivo(body, env, request); return json(r.data, r.status, cors); }
      if (path === '/perfil/sala') { const r = await handleGuardarSala(body, env, request); return json(r.data, r.status, cors); }
      if (path === '/diario/entrada') { const r = await handleDiarioEntrada(body, env, request); return json(r.data, r.status, cors); }
      if (path === '/resenas') { const r = await handleCreateResena(body, env, request); return json(r.data, r.status, cors); }
      if (path === '/growshops') { const r = await handleCreateGrowshop(body, env, request); return json(r.data, r.status, cors); }
      if (path === '/asociaciones') { const r = await handleCreateAsociacion(body, env, request); return json(r.data, r.status, cors); }
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
