/**
 * Conexión de la cuenta editorial de Cannabicultor con X.
 *
 * Este módulo solo gestiona OAuth: no publica, no sigue cuentas y no envía
 * respuestas. Los tokens se cifran antes de persistirse en Supabase.
 */

const X_AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize';
const X_TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const X_ME_URL = 'https://api.x.com/2/users/me?user.fields=description,public_metrics';
const X_CALLBACK_URL = 'https://growers-alliance-ai.nohumanclicks.workers.dev/x/oauth/callback';
const X_CONNECTION_KEY = 'cannabicultor_main';
const ADMIN_EMAIL = 'enriquedorta@gmail.com';

function base64Url(bytes) {
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64(bytes) {
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw);
}

function base64ToBytes(value) {
  const raw = atob(String(value || ''));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function randomVerifier() {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function pkceChallenge(verifier) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(hash));
}

function tokenEncryptionKey(env) {
  const key = base64ToBytes(env.X_TOKEN_ENCRYPTION_KEY);
  if (key.byteLength !== 32) throw new Error('x_token_encryption_key_invalid');
  return crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptTokenBundle(env, bundle) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await tokenEncryptionKey(env),
    new TextEncoder().encode(JSON.stringify(bundle)),
  );
  const result = new Uint8Array(iv.byteLength + cipher.byteLength);
  result.set(iv);
  result.set(new Uint8Array(cipher), iv.byteLength);
  return base64(result);
}

async function requireAdmin(request, env, verifyJwt) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const claims = await verifyJwt(token, env.JWT_SECRET);
  return claims?.email === ADMIN_EMAIL;
}

function callbackPage(title, detail, ok = false) {
  const color = ok ? '#1a5c32' : '#9f2f2f';
  return new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#f5f7f4;font-family:system-ui;color:#182019"><main style="max-width:440px;padding:32px;text-align:center"><div style="font-size:36px">${ok ? '✓' : '!'}</div><h1 style="color:${color}">${title}</h1><p style="line-height:1.6">${detail}</p><p style="color:#617067;font-size:14px">Puedes cerrar esta ventana y volver a Cannabicultor.</p></main></body></html>`, {
    status: ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * Página mínima alojada en el propio Worker. Evita pedir al administrador
 * que copie un JWT o credenciales en una URL: la contraseña solo se usa para
 * obtener la sesión existente y se descarta en el navegador inmediatamente.
 */
export function xConnectPage() {
  return new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conectar X · Cannabicultor</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f7f4;font-family:system-ui;color:#182019"><main style="width:min(420px,calc(100vw - 40px));background:#fff;border:1px solid #dbe4dd;border-radius:20px;padding:28px;box-shadow:0 16px 50px #18201915"><p style="margin:0 0 8px;color:#1a5c32;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.08em">Cannabicultor IA</p><h1 style="margin:0 0 12px;font-size:28px">Conectar una cuenta de X</h1><p style="line-height:1.55;color:#5d6c62">Inicia sesión como administrador. Después X te pedirá autorizar <strong>una sola vez</strong> la cuenta que quieres conectar.</p><form id="form"><label style="display:block;font-size:13px;font-weight:700;margin:18px 0 6px">Email</label><input id="email" type="email" autocomplete="username" required style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #b8c8bd;border-radius:10px;font:inherit"><label style="display:block;font-size:13px;font-weight:700;margin:16px 0 6px">Contraseña</label><input id="password" type="password" autocomplete="current-password" required style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #b8c8bd;border-radius:10px;font:inherit"><button style="width:100%;margin-top:20px;padding:13px;border:0;border-radius:10px;background:#1a5c32;color:#fff;font:700 15px system-ui;cursor:pointer">Continuar con X</button></form><p id="status" role="status" style="min-height:22px;margin:14px 0 0;color:#9f2f2f;font-size:14px"></p><p style="margin:12px 0 0;color:#738077;font-size:12px;line-height:1.5">No se publica nada durante esta conexión.</p></main><script>const f=document.querySelector('#form'),s=document.querySelector('#status');f.addEventListener('submit',async e=>{e.preventDefault();s.textContent='Conectando…';const b={email:document.querySelector('#email').value,password:document.querySelector('#password').value};try{const a=await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});const j=await a.json();if(!a.ok||!j.token)throw Error(j.error||'No se pudo iniciar sesión.');const r=await fetch('/x/oauth/start',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+j.token},body:'{}'});const d=await r.json();if(!r.ok||!d.authorization_url)throw Error(d.error||'No se pudo iniciar la conexión.');location.assign(d.authorization_url);}catch(err){s.textContent=err.message||'Ha ocurrido un error.';}finally{document.querySelector('#password').value='';}});</script></body></html>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Comprobación de solo lectura para la autorización directa generada en X. */
export async function manualXConnectionStatus(env) {
  if (!env.X_USER_ACCESS_TOKEN) return { status: 503, data: { connected: false, error: 'token_no_configurado' } };
  try {
    const response = await fetch(X_ME_URL, { headers: { Authorization: `Bearer ${env.X_USER_ACCESS_TOKEN}` } });
    if (!response.ok) return { status: 502, data: { connected: false, error: `x_api_${response.status}` } };
    const user = (await response.json())?.data;
    if (!user?.id || !user?.username) return { status: 502, data: { connected: false, error: 'respuesta_x_invalida' } };
    return { status: 200, data: { connected: true, username: user.username, name: user.name || null } };
  } catch (_) {
    return { status: 502, data: { connected: false, error: 'x_no_disponible' } };
  }
}

/** POST /x/oauth/start — requiere una sesión administradora. */
export async function startXAuthorization(request, env, deps) {
  if (!await requireAdmin(request, env, deps.verifyJwt)) {
    return { status: 401, data: { error: 'No autorizado' } };
  }
  if (!env.X_CLIENT_ID || !env.X_CLIENT_SECRET || !env.X_TOKEN_ENCRYPTION_KEY) {
    return { status: 503, data: { error: 'Conexión X incompleta: faltan secretos del servidor.' } };
  }

  const state = crypto.randomUUID();
  const verifier = randomVerifier();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const pending = await deps.sbRequest(env, 'x_oauth_pending', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ state, code_verifier: verifier, expires_at: expiresAt }),
  });
  if (!pending.ok) {
    console.log(JSON.stringify({ event: 'x_oauth_pending_create_failed', status: pending.status }));
    return { status: 503, data: { error: 'No se pudo iniciar la conexión con X.' } };
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.X_CLIENT_ID,
    redirect_uri: X_CALLBACK_URL,
    scope: 'tweet.read tweet.write users.read offline.access',
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
  });
  return { status: 200, data: { authorization_url: `${X_AUTHORIZE_URL}?${params}` } };
}

/** GET /x/oauth/callback — X redirige aquí tras autorizar la cuenta. */
export async function finishXAuthorization(url, env, deps) {
  const denied = url.searchParams.get('error');
  if (denied) return callbackPage('No se conectó la cuenta', 'La autorización fue cancelada o rechazada. Puedes intentarlo de nuevo desde el panel.');
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  if (!code || !/^[0-9a-f-]{36}$/i.test(state)) return callbackPage('Enlace no válido', 'Falta información de autorización. Inicia la conexión otra vez desde Cannabicultor.');

  const found = await deps.sbRequest(env, `x_oauth_pending?state=eq.${encodeURIComponent(state)}&select=state,code_verifier,expires_at&limit=1`, { method: 'GET' });
  const pending = found.ok && Array.isArray(found.data) ? found.data[0] : null;
  if (!pending || new Date(pending.expires_at).getTime() < Date.now()) {
    return callbackPage('Enlace caducado', 'La autorización tarda demasiado tiempo. Iníciala de nuevo desde Cannabicultor.');
  }

  // Un estado es de un solo uso incluso si X devuelve un error después.
  await deps.sbRequest(env, `x_oauth_pending?state=eq.${encodeURIComponent(state)}`, { method: 'DELETE' });
  try {
    const basic = btoa(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`);
    const tokenResponse = await fetch(X_TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: X_CALLBACK_URL,
        code_verifier: pending.code_verifier,
      }),
    });
    if (!tokenResponse.ok) {
      console.log(JSON.stringify({ event: 'x_oauth_token_exchange_failed', status: tokenResponse.status }));
      return callbackPage('No se conectó la cuenta', 'X no pudo completar la autorización. Iníciala de nuevo desde Cannabicultor.');
    }
    const tokens = await tokenResponse.json();
    if (!tokens?.access_token) return callbackPage('No se conectó la cuenta', 'X no devolvió una autorización válida. Inténtalo otra vez.');

    const meResponse = await fetch(X_ME_URL, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (!meResponse.ok) return callbackPage('No se conectó la cuenta', 'No se pudo confirmar la cuenta autorizada en X. Inténtalo otra vez.');
    const me = (await meResponse.json())?.data;
    if (!me?.id || !me?.username) return callbackPage('No se conectó la cuenta', 'X no devolvió el perfil de la cuenta autorizada.');

    const now = new Date();
    const expiresAt = Number(tokens.expires_in) > 0 ? new Date(now.getTime() + Number(tokens.expires_in) * 1000).toISOString() : null;
    const saved = await deps.sbRequest(env, 'x_oauth_connections?on_conflict=connection_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        connection_key: X_CONNECTION_KEY,
        x_user_id: String(me.id),
        username: String(me.username),
        display_name: me.name ? String(me.name) : null,
        token_ciphertext: await encryptTokenBundle(env, tokens),
        token_expires_at: expiresAt,
        scopes: Array.isArray(tokens.scope) ? tokens.scope : String(tokens.scope || '').split(/\s+/).filter(Boolean),
        connected_at: now.toISOString(),
        updated_at: now.toISOString(),
      }),
    });
    if (!saved.ok) {
      console.log(JSON.stringify({ event: 'x_oauth_connection_save_failed', status: saved.status }));
      return callbackPage('Autorización pendiente', 'X autorizó la cuenta, pero Cannabicultor no pudo guardar la conexión. No se ha publicado nada.');
    }
    return callbackPage('Cuenta conectada', `@${me.username} ya está conectada a Cannabicultor. Aún no se ha publicado nada.`, true);
  } catch (error) {
    console.log(JSON.stringify({ event: 'x_oauth_callback_failed', detail: String(error?.message || error).slice(0, 160) }));
    return callbackPage('No se conectó la cuenta', 'Ha ocurrido un error temporal. Inicia la conexión otra vez.');
  }
}

async function decryptTokenBundle(env, ciphertext) {
  const raw = base64ToBytes(ciphertext);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await tokenEncryptionKey(env), raw.slice(12));
  return JSON.parse(new TextDecoder().decode(plain));
}

// Devuelve un access token válido: usa la conexión OAuth guardada y la renueva con el refresh token si caduca.
export async function getXAccessToken(env, sbRequest) {
  const q = `x_oauth_connections?connection_key=eq.${X_CONNECTION_KEY}&select=token_ciphertext,token_expires_at&limit=1`;
  const found = await sbRequest(env, q, { method: 'GET' });
  const row = found.ok && Array.isArray(found.data) ? found.data[0] : null;
  if (!row) return env.X_USER_ACCESS_TOKEN || null;
  const bundle = await decryptTokenBundle(env, row.token_ciphertext);
  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (bundle.access_token && expiresAt - Date.now() > 120000) return bundle.access_token;
  if (!bundle.refresh_token) return bundle.access_token || null;
  const basic = btoa(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`);
  const res = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: bundle.refresh_token, client_id: env.X_CLIENT_ID }),
  });
  if (!res.ok) { console.log(JSON.stringify({ event: 'x_token_refresh_failed', status: res.status })); return null; }
  const fresh = await res.json();
  if (!fresh.access_token) return null;
  const merged = { ...bundle, ...fresh, refresh_token: fresh.refresh_token || bundle.refresh_token };
  const now = new Date();
  await sbRequest(env, `x_oauth_connections?connection_key=eq.${X_CONNECTION_KEY}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      token_ciphertext: await encryptTokenBundle(env, merged),
      token_expires_at: Number(fresh.expires_in) > 0 ? new Date(now.getTime() + Number(fresh.expires_in) * 1000).toISOString() : null,
      updated_at: now.toISOString(),
    }),
  });
  return fresh.access_token;
}
