// Tests offline de worker/fotos-variedades.js con un Supabase y un storage simulados (sin red).
// Uso: node worker/scripts/test-fotos-variedades.mjs
import { detectarMime, decodificarDataUrl, handleFotoSubir } from '../fotos-variedades.js';

let pass = 0, fail = 0;
const check = (n, c) => { if (c) pass++; else { fail++; console.log('FAIL:', n); } };

// PNG 1x1 real y JPEG mínimo (cabecera FFD8FF + relleno >12 bytes)
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const pngUrl = `data:image/png;base64,${PNG_B64}`;
const jpegUrl = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]).toString('base64')}`;

check('detectarMime: PNG', detectarMime(decodificarDataUrl(pngUrl)) === 'image/png');
check('detectarMime: JPEG', detectarMime(decodificarDataUrl(jpegUrl)) === 'image/jpeg');
check('decodificar: rechaza data URL que no es imagen', decodificarDataUrl('data:text/html;base64,PGgxPg==') === null);
check('decodificar: rechaza basura', decodificarDataUrl('hola') === null);
check('detectarMime: un HTML disfrazado de png se rechaza', detectarMime(decodificarDataUrl(`data:image/png;base64,${Buffer.from('<html><script>alert(1)</script></html>').toString('base64')}`)) === null);

// ── Supabase/Storage simulado ───────────────────────────────────────────────
const db = { variedades: [{ id: 1, nombre: 'Blue Dream', breeder_id: 7, image_url: null }, { id: 2, nombre: 'Con Foto', breeder_id: 7, image_url: 'https://x/y.jpg' }], breeders: [{ id: 7, breeder_name: 'Exotic Genetix', website: 'https://exoticgenetix.com' }], variedad_fotos: [] };
const storage = new Map();
let seq = 0;
const llamadas = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url); const method = init.method || 'GET'; llamadas.push(`${method} ${url}`);
  const resp = (b, s = 200) => new Response(typeof b === 'string' || b instanceof Uint8Array ? b : JSON.stringify(b), { status: s });
  const sObj = url.match(/\/storage\/v1\/object\/(?:sign\/)?([^/]+)\/(.+)$/);
  if (url.includes('/storage/v1/object/sign/')) return resp({ signedURL: `/object/sign/${sObj[1]}/${sObj[2]}?token=t` });
  if (sObj && method === 'POST') { storage.set(`${sObj[1]}/${decodeURIComponent(sObj[2])}`, init.body); return resp({ Key: 'ok' }); }
  if (sObj && method === 'DELETE') return resp({});
  if (url.includes('/storage/v1/object/') && method === 'DELETE') { for (const p of JSON.parse(init.body).prefixes) storage.delete(`variedades-pendientes/${p}`); return resp({}); }
  if (sObj && method === 'GET') { const b = storage.get(`${sObj[1]}/${decodeURIComponent(sObj[2])}`); return b ? resp(b) : resp('no', 404); }
  if (url.startsWith('https://exoticgenetix.com/')) return resp(Uint8Array.from(Buffer.from(PNG_B64, 'base64')));
  return resp('?', 404);
};

// sbRequest simulado sobre `db` (soporta lo que usa el módulo)
async function sbRequest(env, path, opt = {}) {
  const [tabla, qs = ''] = path.split('?'); const q = new URLSearchParams(qs); const method = opt.method || 'GET';
  const rows = db[tabla]; const filtros = [...q.entries()].filter(([k]) => !['select', 'order', 'limit', 'offset'].includes(k));
  const casa = (r) => filtros.every(([k, v]) => {
    const [op, val] = [v.slice(0, v.indexOf('.')), v.slice(v.indexOf('.') + 1)];
    if (op === 'eq') return String(r[k]) === val; if (op === 'neq') return String(r[k]) !== val; if (op === 'is') return val === 'null' ? r[k] == null : r[k] != null;
    if (op === 'in') return val.replace(/[()]/g, '').split(',').includes(String(r[k])); return true;
  });
  if (method === 'GET') { const sel = rows.filter(casa); return { ok: true, status: 200, data: JSON.parse(JSON.stringify(sel)), count: sel.length }; }
  if (method === 'POST') {
    const b = JSON.parse(opt.body);
    if (tabla === 'variedad_fotos' && rows.some((r) => r.variedad_id === b.variedad_id && r.usuario_email && r.usuario_email === b.usuario_email && r.estado === 'pendiente')) return { ok: false, status: 409, data: { code: '23505' }, count: null };
    rows.push({ id: ++seq, created_at: 'now', ...b }); return { ok: true, status: 201, data: null, count: null };
  }
  if (method === 'PATCH') { const b = JSON.parse(opt.body); rows.filter(casa).forEach((r) => Object.assign(r, b)); return { ok: true, status: 204, data: null, count: null }; }
  return { ok: false, status: 400, data: null, count: null };
}
const env = { SUPABASE_SERVICE_KEY: 'k' };
const usuario = async (email) => ({ email });
const authEmailFromRequest = async (_r, _e, email) => (email ? { email } : { error: { status: 401, data: { error: 'No autenticado' } } });
const deps = (admin) => ({ sbRequest, authEmailFromRequest, esAdminReq: async () => admin });

// — Subida de usuario —
let r = await handleFotoSubir({ email: 'a@a.com', variedad_id: 1, imagen: pngUrl, derechos: true }, env, {}, deps(false));
check('subida válida → 200 y fila pendiente', r.status === 200 && db.variedad_fotos.length === 1 && db.variedad_fotos[0].estado === 'pendiente' && db.variedad_fotos[0].origen === 'usuario');
check('subida: el archivo va al bucket PRIVADO', [...storage.keys()].some((k) => k.startsWith('variedades-pendientes/1/')));
check('subida: NADA en el bucket público', ![...storage.keys()].some((k) => k.startsWith('variedades/')));
r = await handleFotoSubir({ email: 'a@a.com', variedad_id: 1, imagen: pngUrl, derechos: true }, env, {}, deps(false));
check('segunda subida del mismo usuario/ficha → 409', r.status === 409);
r = await handleFotoSubir({ email: 'b@b.com', variedad_id: 1, imagen: pngUrl, derechos: false }, env, {}, deps(false));
check('sin confirmar derechos → 400', r.status === 400);
r = await handleFotoSubir({ email: 'b@b.com', variedad_id: 2, imagen: pngUrl, derechos: true }, env, {}, deps(false));
check('variedad que ya tiene foto → 409', r.status === 409);
r = await handleFotoSubir({ email: 'b@b.com', variedad_id: 1, imagen: `data:image/png;base64,${Buffer.from('<html>').toString('base64')}`, derechos: true }, env, {}, deps(false));
check('archivo que no es imagen → 400', r.status === 400);
r = await handleFotoSubir({ variedad_id: 1, imagen: pngUrl, derechos: true }, env, {}, deps(false));
check('sin sesión → 401', r.status === 401);
r = await handleFotoSubir({ email: 'b@b.com', variedad_id: 999, imagen: pngUrl, derechos: true }, env, {}, deps(false));
check('variedad inexistente → 404', r.status === 404);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
