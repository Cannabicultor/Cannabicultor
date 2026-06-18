/**
 * Cannabicultor IA — Cloudflare Worker (paste-ready for Dashboard → Edit code)
 *
 * Secrets (Settings → Variables → Secrets):
 *   ANTHROPIC_API_KEY
 *   JWT_SECRET
 *   SUPABASE_SERVICE_KEY
 *   BREVO_API_KEY
 *
 * Optional secrets / vars:
 *   BREVO_LIST_ID          — lista de contactos Brevo
 *   BREVO_RESET_TEMPLATE_ID — plantilla email recuperar contraseña
 *   SITE_URL               — default https://cannabicultor.com
 */

const ALLOWED_ORIGINS = [
  'https://cannabicultor.com',
  'https://www.cannabicultor.com',
  'http://localhost:8787',
  'http://127.0.0.1:8787',
];

const SUPABASE_URL = 'https://gfyrsrdnvgnhtsuexjkb.supabase.co';
// Public anon key (already in the website). Used only if SUPABASE_SERVICE_KEY secret is missing.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmeXJzcmRudmduaHRzdWV4amtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjIxNjUsImV4cCI6MjA5NDI5ODE2NX0.53peUmp28jF_b5tJFsHmP4STmGedRYUBV1WPItmdv50';
const JWT_TTL_SEC = 8 * 60 * 60;
const RESET_TTL_MS = 60 * 60 * 1000;

function supabaseKey(env) {
  return env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;
}

// ─── CORS / JSON ─────────────────────────────────────────────────────────────

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

// ─── JWT (HS256) ─────────────────────────────────────────────────────────────

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
    'HMAC',
    key,
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

// ─── Password (sha256(salt + password)) ──────────────────────────────────────

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

// ─── Supabase REST ───────────────────────────────────────────────────────────

async function sbRequest(env, path, options = {}) {
  const key = supabaseKey(env);
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok && typeof data === 'object' && data?.message === 'Invalid API key') {
    return { ok: false, status: 503, data: { message: 'Invalid API key' } };
  }
  return { ok: res.ok, status: res.status, data };
}

function supabaseConfigError() {
  return {
    status: 503,
    data: {
      error: 'El servidor no puede conectar con la base de datos. Revisa SUPABASE_SERVICE_KEY en Cloudflare.',
    },
  };
}

async function getUserByEmail(env, email) {
  const q = `Usuarios?email=eq.${encodeURIComponent(email)}&select=*&limit=1`;
  const res = await sbRequest(env, q, { method: 'GET' });
  if (res.status === 503) return { __dbError: true };
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

// ─── Brevo ───────────────────────────────────────────────────────────────────

async function brevoFetch(env, path, body, method = 'POST') {
  const res = await fetch(`https://api.brevo.com/v3${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'api-key': env.BREVO_API_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  return { ok: res.ok, status: res.status, data };
}

async function brevoAddContact(env, email, attributes = {}) {
  const payload = {
    email,
    attributes,
    updateEnabled: true,
  };
  if (env.BREVO_LIST_ID) payload.listIds = [Number(env.BREVO_LIST_ID)];
  return brevoFetch(env, '/contacts', payload);
}

async function brevoUpdatePlan(env, email, plan) {
  const encoded = encodeURIComponent(email);
  return brevoFetch(env, `/contacts/${encoded}`, { attributes: { PLAN: plan } }, 'PUT');
}

async function brevoSendTemplate(env, email, templateId, params = {}) {
  return brevoFetch(env, '/smtp/email', {
    to: [{ email }],
    templateId: Number(templateId),
    params,
  });
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

// ─── Chat + visión ───────────────────────────────────────────────────────────

const VISION_PROMPT = `
ANÁLISIS DE FOTOS:
- Si el usuario envía una imagen, examínala: hojas, manchas, plagas, mohos, deficiencias, estrés.
- Describe primero lo que VES (1-2 frases), luego diagnóstico y pasos siguientes.
- Si la foto no es clara, pide otra mejor. No inventes detalles invisibles.`;

function buildSystemPrompt(perfil) {
  let base = `Eres Cannabicultor IA de Growers Alliance. Tono: autoridad con calidez. Tuteo respetuoso.
Primera frase responde DIRECTAMENTE. Máx 8-12 líneas. Abre UNA puerta al final.
NUNCA inventes estudios ni legislación.${VISION_PROMPT}`;
  if (!perfil) return base + '\n\nUsuario en Plan Libre. Sin datos de cultivo registrados.';
  const t = typeof perfil === 'string' ? perfil : JSON.stringify(perfil, null, 2);
  return base + '\n\nPERFIL:\n' + t;
}

function normalizeMessages(messages) {
  return (messages || []).map((msg) => {
    const role = msg.role === 'assistant' ? 'assistant' : 'user';
    if (role === 'assistant') {
      return { role, content: String(msg.content || '') };
    }
    if (Array.isArray(msg.content)) {
      const blocks = msg.content.map((part) => {
        if (part.type === 'text') return { type: 'text', text: part.text || '' };
        if (part.type === 'image') {
          const src = part.source || part;
          return {
            type: 'image',
            source: { type: 'base64', media_type: src.media_type || 'image/jpeg', data: src.data },
          };
        }
        return null;
      }).filter(Boolean);
      if (blocks.length === 1 && blocks[0].type === 'text') {
        return { role: 'user', content: blocks[0].text };
      }
      return { role: 'user', content: blocks };
    }
    return { role: 'user', content: String(msg.content || '') };
  });
}

function hasVision(messages) {
  return messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image'));
}

async function handleChat(body, env) {
  const { messages, perfil } = body || {};
  if (!messages || !Array.isArray(messages) || !messages.length) {
    return { status: 400, data: { error: 'Faltan mensajes' } };
  }

  const anthropicMessages = normalizeMessages(messages);
  const withVision = hasVision(anthropicMessages);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: withVision ? 900 : 600,
      system: buildSystemPrompt(perfil),
      messages: anthropicMessages,
    }),
  });

  if (!response.ok) {
    return { status: 500, data: { error: 'API Error', details: await response.text() } };
  }

  const data = await response.json();
  const reply = data.content?.[0]?.text || 'Error al procesar la respuesta.';
  return { status: 200, data: { reply } };
}

// ─── Auth handlers ───────────────────────────────────────────────────────────

function consentOk(consent) {
  return consent && consent.age && consent.terms;
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || '';
}

async function handleRegister(body, env, request) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const consent = body.consent || {};

  if (!email || !email.includes('@')) {
    return { status: 400, data: { error: 'Email inválido' } };
  }
  if (!consentOk(consent)) {
    return { status: 400, data: { error: 'Debes confirmar tu edad y aceptar los términos.' } };
  }

  const existing = await getUserByEmail(env, email);
  if (existing?.__dbError) return supabaseConfigError();

  if (existing) {
    const valid = await verifyPassword(password, existing.password_hash);
    if (!valid) {
      return { status: 409, data: { error: 'Ese email ya está registrado.' } };
    }
    const token = await signJwt(makeTokenClaims(email, existing.plan), env.JWT_SECRET);
    await updateUser(env, existing.id, { last_login: new Date().toISOString() });
    return {
      status: 200,
      data: { ok: true, token, plan: existing.plan || 'libre' },
    };
  }

  const password_hash = await hashPassword(password);
  const consentimiento = {
    age: true,
    terms: true,
    marketing: !!consent.marketing,
    terms_version: 'v1',
    ts: new Date().toISOString(),
    ip: clientIp(request),
  };

  const created = await createUser(env, {
    email,
    password_hash,
    plan: 'libre',
    nombre: '',
    consentimiento,
    fecha_registro: new Date().toISOString(),
    last_login: new Date().toISOString(),
  });

  if (!created.ok) {
    if (created.status === 503) return supabaseConfigError();
    const msg = created.data?.message || created.data?.error || 'No se pudo crear la cuenta';
    return { status: created.status === 409 ? 409 : 500, data: { error: msg } };
  }

  const token = await signJwt(makeTokenClaims(email, 'libre'), env.JWT_SECRET);
  return { status: 200, data: { ok: true, token, plan: 'libre' } };
}

async function handleLogin(body, env) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!email || !password) {
    return { status: 400, data: { error: 'Email y contraseña requeridos' } };
  }

  const user = await getUserByEmail(env, email);
  if (user?.__dbError) return supabaseConfigError();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { status: 401, data: { error: 'Email o contraseña incorrectos' } };
  }

  await updateUser(env, user.id, { last_login: new Date().toISOString() });
  const token = await signJwt(makeTokenClaims(email, user.plan), env.JWT_SECRET);

  return {
    status: 200,
    data: {
      ok: true,
      token,
      email: user.email,
      nombre: user.nombre || '',
      plan: user.plan || 'libre',
      perfil_cultivo: user.perfil_cultivo ?? null,
    },
  };
}

async function handleForgotPassword(body, env) {
  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { status: 200, data: { ok: true } };
  }

  const user = await getUserByEmail(env, email);
  if (user) {
    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + RESET_TTL_MS).toISOString();
    await updateUser(env, user.id, {
      reset_token: token,
      reset_token_expires: expires,
    });
    try {
      await brevoSendResetEmail(env, email, token);
    } catch (_) { /* no revelar si falló el email */ }
  }

  return { status: 200, data: { ok: true } };
}

async function handleResetPassword(body, env) {
  const token = String(body.token || '');
  const newPassword = String(body.newPassword || body.password || '');

  if (!token || !newPassword) {
    return { status: 400, data: { error: 'Enlace inválido o ya utilizado' } };
  }

  const q = `Usuarios?reset_token=eq.${encodeURIComponent(token)}&select=*&limit=1`;
  const res = await sbRequest(env, q, { method: 'GET' });
  const user = Array.isArray(res.data) && res.data[0] ? res.data[0] : null;

  if (!user || !user.reset_token_expires) {
    return { status: 400, data: { error: 'Enlace inválido o ya utilizado' } };
  }
  if (new Date(user.reset_token_expires).getTime() < Date.now()) {
    return { status: 400, data: { error: 'Enlace inválido o ya utilizado' } };
  }

  const password_hash = await hashPassword(newPassword);
  await updateUser(env, user.id, {
    password_hash,
    reset_token: null,
    reset_token_expires: null,
  });

  return { status: 200, data: { ok: true } };
}

// ─── Brevo routes ────────────────────────────────────────────────────────────

async function handleBrevoContact(body, env) {
  const email = String(body.email || '').trim().toLowerCase();
  const attributes = body.attributes || {};
  if (!email) return { status: 400, data: { error: 'Falta email' } };

  const res = await brevoAddContact(env, email, attributes);
  if (!res.ok) {
    return { status: res.status, data: { error: res.data?.message || 'Error Brevo' } };
  }
  return { status: 200, data: { ok: true, data: res.data } };
}

async function handleBrevoEmail(body, env) {
  const email = String(body.email || '').trim().toLowerCase();
  const templateId = body.templateId;
  if (!email || !templateId) {
    return { status: 400, data: { error: 'Faltan email o templateId' } };
  }
  const res = await brevoSendTemplate(env, email, templateId, body.params || {});
  if (!res.ok) {
    return { status: res.status, data: { error: res.data?.message || 'Error Brevo' } };
  }
  return { status: 200, data: { ok: true, data: res.data } };
}

async function handleBrevoUpdatePlan(body, env) {
  const email = String(body.email || '').trim().toLowerCase();
  const plan = String(body.plan || '').trim().toLowerCase();
  if (!email || !plan) {
    return { status: 400, data: { error: 'Faltan email o plan' } };
  }
  const res = await brevoUpdatePlan(env, email, plan);
  if (!res.ok) {
    return { status: 200, data: { ok: false } };
  }
  return { status: 200, data: { ok: true } };
}

// ─── Router ──────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    try {
      const body = await request.json().catch(() => ({}));

      if (path === '/' || path === '/chat') {
        const auth = request.headers.get('Authorization') || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        const user = await verifyJwt(token, env.JWT_SECRET);
        if (!user) return json({ error: 'No autorizado' }, 401, cors);

        const result = await handleChat(body, env);
        return json(result.data, result.status, cors);
      }

      if (path === '/auth/register') {
        const result = await handleRegister(body, env, request);
        return json(result.data, result.status, cors);
      }

      if (path === '/auth/login') {
        const result = await handleLogin(body, env);
        return json(result.data, result.status, cors);
      }

      if (path === '/auth/forgot-password') {
        const result = await handleForgotPassword(body, env);
        return json(result.data, result.status, cors);
      }

      if (path === '/auth/reset-password') {
        const result = await handleResetPassword(body, env);
        return json(result.data, result.status, cors);
      }

      if (path === '/brevo-contact') {
        const result = await handleBrevoContact(body, env);
        return json(result.data, result.status, cors);
      }

      if (path === '/brevo-email') {
        const result = await handleBrevoEmail(body, env);
        return json(result.data, result.status, cors);
      }

      if (path === '/brevo-update-plan') {
        const result = await handleBrevoUpdatePlan(body, env);
        return json(result.data, result.status, cors);
      }

      return json({ error: 'Ruta no encontrada' }, 404, cors);
    } catch (err) {
      return json({ error: err.message || 'Error interno' }, 500, cors);
    }
  },
};