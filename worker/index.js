/**
 * Cannabicultor IA — Cloudflare Worker
 * Deploy: npx wrangler deploy (from worker/ folder)
 *
 * Requires secrets: ANTHROPIC_API_KEY, JWT_SECRET
 * Optional: BREVO_API_KEY, SUPABASE_* for auth routes you add separately.
 */

import { handleChatRequest } from './chat-handler.js';

const ALLOWED_ORIGINS = [
  'https://cannabicultor.com',
  'https://www.cannabicultor.com',
  'http://localhost:8787',
  'http://127.0.0.1:8787',
];

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

function base64UrlDecode(str) {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function verifyJwt(token, secret) {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

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
      if (path === '/' || path === '/chat') {
        const auth = request.headers.get('Authorization') || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        const user = await verifyJwt(token, env.JWT_SECRET);
        if (!user) {
          return json({ error: 'No autorizado' }, 401, cors);
        }

        const body = await request.json();
        const result = await handleChatRequest(body, env);
        return json(result.data, result.status, cors);
      }

      return json({ error: 'Ruta no encontrada. Auth routes deben estar en este worker o en otro servicio.' }, 404, cors);
    } catch (err) {
      return json({ error: err.message || 'Error interno' }, 500, cors);
    }
  },
};