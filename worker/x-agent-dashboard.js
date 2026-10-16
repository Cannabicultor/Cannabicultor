import { getXAccessToken } from './x-channel.js';
const X_POST_URL = 'https://api.x.com/2/tweets';

function eq(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function authed(request, env) { return eq(request.headers.get('X-X-Agent-Password'), env.X_AGENT_DASHBOARD_PASSWORD); }

function page() {
  return new Response(`<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agente X · Cannabicultor</title>
<style>body{margin:0;background:#f4f7f3;color:#142018;font:15px system-ui}.w{max-width:900px;margin:auto;padding:32px 18px}h1{margin:0 0 6px}.card{background:#fff;border:1px solid #dbe5dd;border-radius:16px;padding:18px;margin:16px 0}input,textarea,button{font:inherit;box-sizing:border-box}input,textarea{width:100%;padding:11px;border:1px solid #b8c9bb;border-radius:9px}textarea{min-height:100px}button{padding:10px 14px;border:0;border-radius:9px;background:#176437;color:#fff;font-weight:700;cursor:pointer}#app{display:none}.draft{white-space:pre-wrap;line-height:1.5}.muted{color:#657269;font-size:13px}.error{color:#b42318;margin-top:10px}</style>
<main class="w"><section id="login" class="card"><h1>Agente X</h1><p>Panel privado para revisar contenido antes de publicar.</p><input id="password" type="password" placeholder="Contraseña del panel" autocomplete="current-password"><p><button id="enter">Entrar</button></p><div id="error" class="error"></div></section><section id="app"><h1>Agente X · Cannabicultor</h1><p class="muted">La IA prepara; tú apruebas. Nada se publica al generar un borrador.</p><div class="card"><b>Nuevo post</b><p><textarea id="brief" placeholder="Ej.: Explica cómo un growshop puede atender mejor preguntas de cultivo con IA."></textarea></p><button id="generate">Generar borrador</button></div><div id="list"></div></section></main>
<script>
let passwordValue = ''; const cacheVersion = 'x-agent-v2'; const $ = id => document.getElementById(id);
function escapeHtml(value) { return String(value).replace(/[&<>]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[char])); }
async function request(path, options = {}) { options.headers = {...(options.headers || {}),'X-X-Agent-Password':passwordValue,'Content-Type':'application/json'}; const separator = path.includes('?') ? '&' : '?'; const response = await fetch(path + separator + cacheVersion, options); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.'); return data; }
async function load() { const data = await request('/x-agent/api/drafts'); $('list').innerHTML = data.drafts.map(draft => { const actions = draft.status === 'draft' ? '<button data-approve="' + draft.id + '">Aprobar</button>' : draft.status === 'approved' ? '<button data-publish="' + draft.id + '">Publicar en X</button>' : ''; return '<div class="card"><div class="muted">' + escapeHtml(draft.status) + ' · ' + new Date(draft.created_at).toLocaleString() + '</div><p class="draft">' + escapeHtml(draft.text) + '</p>' + actions + '</div>'; }).join('') || '<p class="muted">No hay borradores.</p>'; document.querySelectorAll('[data-approve]').forEach(button => button.addEventListener('click', async () => { await request('/x-agent/api/approve',{method:'POST',body:JSON.stringify({id:button.dataset.approve})}); load(); })); document.querySelectorAll('[data-publish]').forEach(button => button.addEventListener('click', async () => { if (confirm('¿Publicar este texto en @CannabicultorX?')) { try { await request('/x-agent/api/publish',{method:'POST',body:JSON.stringify({id:button.dataset.publish})}); load(); } catch (error) { alert(error.message); } } })); }
$('enter').addEventListener('click', async () => { passwordValue = $('password').value; $('error').textContent = ''; try { await load(); $('login').style.display = 'none'; $('app').style.display = 'block'; } catch (error) { $('error').textContent = error.message; } });
$('password').addEventListener('keydown', event => { if (event.key === 'Enter') $('enter').click(); });
$('generate').addEventListener('click', async () => { try { await request('/x-agent/api/drafts',{method:'POST',body:JSON.stringify({brief:$('brief').value})}); $('brief').value = ''; load(); } catch (error) { alert(error.message); } });
</script>`, { headers: { 'Content-Type':'text/html;charset=utf-8', 'Cache-Control':'no-store' } });
}

export async function xAgent(request, env, supabaseRequest, generateWithRag, isAdmin = false) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/x-agent') return page();
  if (!isAdmin && !authed(request, env)) return new Response(JSON.stringify({ error:'Acceso denegado' }), { status:401 });
  if (request.method === 'GET') { const result = await supabaseRequest(env,'x_agent_drafts?select=id,text,status,created_at&status=neq.rejected&order=created_at.desc&limit=30',{method:'GET'}); return Response.json({drafts:result.data || []}); }
  const body = await request.json().catch(() => ({}));
  if (url.pathname.endsWith('/drafts')) {
    const brief = String(body.brief || '').slice(0, 1200);
    if (!brief) return Response.json({ error: 'Escribe un tema.' }, { status: 400 });
    const generated = await generateWithRag(brief);
    const text = String(generated?.data?.reply || '').trim();
    if (generated?.status !== 200 || !text) return Response.json({ error: 'No se pudo generar usando la base de conocimiento.' }, { status: 502 });
    const result = await supabaseRequest(env, 'x_agent_drafts', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ text: text.slice(0, 280), status: 'draft' }) });
    if (result.error || !result.data?.[0]) return Response.json({ error: 'No se pudo guardar el borrador.' }, { status: 502 });
    return Response.json({ draft: result.data[0] });
  }
  const id = String(body.id || ''); if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({error:'Borrador inválido.'},{status:400});
  if (url.pathname.endsWith('/approve')) { await supabaseRequest(env,`x_agent_drafts?id=eq.${id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'approved'})}); return Response.json({ok:true}); }
  if (url.pathname.endsWith('/publish')) { const result = await supabaseRequest(env,`x_agent_drafts?id=eq.${id}&select=id,text,status&limit=1`,{method:'GET'}); const draft = result.data?.[0]; if (!draft || draft.status !== 'approved') return Response.json({error:'Aprueba el borrador primero.'},{status:400}); const xToken = await getXAccessToken(env, supabaseRequest); if (!xToken) return Response.json({ error:'X no conectado o token caducado: reconecta en /x/connect.' },{status:502}); const xResponse = await fetch(X_POST_URL,{method:'POST',headers:{Authorization:'Bearer ' + xToken,'Content-Type':'application/json'},body:JSON.stringify({text:draft.text})}); if (!xResponse.ok) { const detail = String((await xResponse.text()) || '').replace(/[<>]/g,'').slice(0,220); console.log(JSON.stringify({event:'x_agent_publish_failed',status:xResponse.status,detail})); return Response.json({error:`X rechazó la publicación (${xResponse.status})${detail ? `: ${detail}` : ''}`},{status:502}); } const post = (await xResponse.json())?.data; await supabaseRequest(env,`x_agent_drafts?id=eq.${id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'published',x_post_id:post?.id || null,published_at:new Date().toISOString()})}); return Response.json({ok:true,post_id:post?.id}); }
  return Response.json({error:'Ruta no encontrada'},{status:404});
}
