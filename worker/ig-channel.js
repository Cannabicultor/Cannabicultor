// =========================================================================
// CANAL INSTAGRAM (DM) — el asesor responde mensajes directos de Instagram
// =========================================================================
// Flujo: Instagram (cuenta profesional del club/tienda) → webhook de Meta →
// POST /ig/webhook (este Worker) → se busca el tenant por la cuenta que recibe
// el mensaje (sales_tenant_channels) → mismo motor del asesor
// (handleSalesAgentChat) con el historial de ese remitente → respuesta por la
// API de mensajería de Instagram (graph.instagram.com/.../me/messages).
//
// Secrets necesarios (wrangler secret put):
//   IG_VERIFY_TOKEN  — texto libre que se pone igual en el panel de Meta (verificación del webhook)
//   IG_APP_SECRET    — "Instagram app secret" del panel de Meta (firma X-Hub-Signature-256)
// El token de acceso de cada cuenta NO va en secrets: vive en
// sales_tenant_channels.access_token (tabla con RLS, solo service_role).

const IG_GRAPH = 'https://graph.instagram.com/v24.0';
const IG_MAX_CHARS = 1000; // límite de texto por mensaje de Instagram

async function hmacSha256Hex(secret, raw) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// UUID estable por (tenant, remitente): así cada persona tiene "su" conversación
// y el historial se recupera de sales_agent_turns sin tabla extra.
async function stableConversationId(tenantId, senderId) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ig:${tenantId}:${senderId}`)));
  h[6] = (h[6] & 0x0f) | 0x50; // versión 5-like
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

// Instagram no pinta markdown: quitamos negritas/títulos y partimos en trozos de ≤1000.
function toInstagramChunks(text) {
  const clean = String(text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
  const out = [];
  let rest = clean;
  while (rest.length > IG_MAX_CHARS) {
    let cut = rest.lastIndexOf('\n', IG_MAX_CHARS);
    if (cut < IG_MAX_CHARS * 0.5) cut = rest.lastIndexOf('. ', IG_MAX_CHARS);
    if (cut < IG_MAX_CHARS * 0.5) cut = IG_MAX_CHARS;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

async function sendInstagramText(accessToken, recipientId, text) {
  for (const chunk of toInstagramChunks(text)) {
    const r = await fetch(`${IG_GRAPH}/me/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text: chunk } }),
    });
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300);
      throw new Error(`ig_send_failed_${r.status}: ${detail}`);
    }
  }
}

async function processInstagramEvent(env, deps, accountId, ev) {
  const { sbRequest, handleSalesAgentChat } = deps;
  const text = ev?.message?.text;
  if (!text || ev.message.is_echo || ev.message.is_deleted) return;
  const senderId = String(ev?.sender?.id || '');
  if (!senderId || senderId === accountId) return;

  const ch = await sbRequest(env, `sales_tenant_channels?channel=eq.instagram&external_account_id=eq.${encodeURIComponent(accountId)}&active=eq.true&select=tenant_id,access_token,sales_tenants(slug,status)&limit=1`, { method: 'GET' });
  const row = ch.ok && Array.isArray(ch.data) ? ch.data[0] : null;
  if (!row || !row.access_token || !row.sales_tenants || row.sales_tenants.status === 'churned') {
    console.log(JSON.stringify({ event: 'ig_unknown_account', accountId }));
    return;
  }

  const conversationId = await stableConversationId(row.tenant_id, senderId);
  const hist = await sbRequest(env, `sales_agent_turns?conversation_id=eq.${conversationId}&select=user_message,assistant_message&order=created_at.desc&limit=8`, { method: 'GET' });
  const messages = [];
  for (const t of (hist.ok && Array.isArray(hist.data) ? hist.data : []).reverse()) {
    if (t.user_message) messages.push({ role: 'user', content: String(t.user_message).slice(0, 2000) });
    if (t.assistant_message) messages.push({ role: 'assistant', content: String(t.assistant_message).slice(0, 2000) });
  }
  messages.push({ role: 'user', content: String(text).slice(0, 2000) });

  const r = await handleSalesAgentChat({ tenant_slug: row.sales_tenants.slug, messages, conversation_id: conversationId, channel: 'instagram' }, env);
  const reply = r?.data?.assistant_message
    || 'Ahora mismo no puedo responder. Inténtalo de nuevo en un rato, por favor.';
  await sendInstagramText(row.access_token, senderId, reply);
}

/**
 * GET  /ig/webhook  → verificación de Meta (hub.challenge)
 * POST /ig/webhook  → mensajes entrantes. Responde 200 al instante y procesa
 *                     en segundo plano (Meta reintenta si tardamos).
 */
export async function handleInstagramWebhook(request, env, ctx, deps) {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe'
      && env.IG_VERIFY_TOKEN
      && url.searchParams.get('hub.verify_token') === env.IG_VERIFY_TOKEN;
    return ok
      ? new Response(url.searchParams.get('hub.challenge') || '', { status: 200 })
      : new Response('forbidden', { status: 403 });
  }
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const raw = await request.text();
  if (!env.IG_APP_SECRET) return new Response('not configured', { status: 503 });
  const sig = (request.headers.get('X-Hub-Signature-256') || '').replace(/^sha256=/, '');
  const expected = await hmacSha256Hex(env.IG_APP_SECRET, raw);
  if (!sig || !timingSafeEqual(sig, expected)) return new Response('bad signature', { status: 401 });

  let body = {};
  try { body = JSON.parse(raw); } catch { return new Response('ok', { status: 200 }); }
  if (body.object !== 'instagram') return new Response('ok', { status: 200 });

  const jobs = [];
  for (const entry of body.entry || []) {
    const accountId = String(entry.id || '');
    for (const ev of entry.messaging || []) {
      jobs.push(processInstagramEvent(env, deps, String(ev?.recipient?.id || accountId), ev).catch((e) => {
        console.log(JSON.stringify({ event: 'ig_process_failed', detail: String(e?.message || e).slice(0, 300) }));
      }));
    }
  }
  ctx.waitUntil(Promise.all(jobs));
  return new Response('ok', { status: 200 });
}
