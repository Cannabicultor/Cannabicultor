// Deteccion de pais de assets/config.js (host, ruta, ?pais=, cookie del 301, sesion) y cabecera X-CC-Pais al worker.
// Ejecuta el archivo real en un contexto vm con un navegador simulado. Ejecutar: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CODE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'config.js'), 'utf8');
const WORKER = 'https://growers-alliance-ai.nohumanclicks.workers.dev';

function load({ host = 'www.cannabicultor.com', path = '/', search = '', hash = '', cookie = '', session = {}, storageThrows = false, fetchImpl } = {}) {
  const jar = new Map();
  for (const kv of cookie.split(';').map((s) => s.trim()).filter(Boolean)) { const [k, ...v] = kv.split('='); jar.set(k, v.join('=')); }
  const store = new Map(Object.entries(session));
  const replaced = [];
  const fetchCalls = [];
  const ctx = vm.createContext({
    URL, URLSearchParams, Headers, Object, String, RegExp, decodeURIComponent, Promise, console,
    location: { hostname: host, pathname: path, search, hash, href: `https://${host}${path}${search}${hash}` },
    history: { state: null, replaceState: (_s, _t, url) => replaced.push(url) },
    sessionStorage: storageThrows ? new Proxy({}, { get() { throw new Error('storage bloqueado'); } }) : {
      getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)),
    },
    document: {
      get cookie() { return [...jar].map(([k, v]) => `${k}=${v}`).join('; '); },
      set cookie(c) { const [nv, ...attrs] = c.split(';'); const [k, ...v] = nv.split('='); if (attrs.some((a) => /max-age=0/i.test(a))) jar.delete(k.trim()); else jar.set(k.trim(), v.join('=')); },
    },
  });
  ctx.window = ctx;
  if (fetchImpl !== undefined) ctx.fetch = fetchImpl && ((...a) => { fetchCalls.push(a); return fetchImpl(...a); });
  vm.runInContext(CODE, ctx);
  return { cfg: ctx.CC_CONFIG, ctx, store, replaced, jar, fetchCalls };
}

test('por defecto: España, sin tocar nada', () => {
  const r = load();
  assert.equal(r.cfg.PAIS, 'ES');
  assert.equal(r.cfg.PAIS_FUENTE, 'defecto');
  assert.equal(r.cfg.WORKER_URL, WORKER);
  assert.equal(r.store.has('cc_pais'), false); // el defecto no se guarda
  assert.deepEqual(r.replaced, []);
});

test('host ar./cl./co./mx. sigue funcionando', () => {
  for (const c of ['ar', 'cl', 'co', 'mx']) {
    const r = load({ host: `${c}.cannabicultor.com` });
    assert.equal(r.cfg.PAIS, c.toUpperCase());
    assert.equal(r.cfg.PAIS_FUENTE, 'host');
    assert.equal(r.store.get('cc_pais'), c.toUpperCase());
  }
  assert.equal(load({ host: 'es.cannabicultor.com' }).cfg.PAIS, 'ES');
  assert.equal(load({ host: 'demo.cannabicultor.com' }).cfg.PAIS, 'ES'); // dos letras validas o nada
  assert.equal(load({ host: 'pe.cannabicultor.com' }).cfg.PAIS, 'ES'); // pais no soportado
});

test('ruta /ar/, /cl/, /co/, /mx/', () => {
  for (const [p, exp] of [['/ar/', 'AR'], ['/cl/growshops.html', 'CL'], ['/co', 'CO'], ['/MX/x/y', 'MX']]) {
    const r = load({ path: p });
    assert.equal(r.cfg.PAIS, exp, p);
    assert.equal(r.cfg.PAIS_FUENTE, 'ruta');
  }
  for (const p of ['/arte/', '/argentina/', '/cbd/', '/a/', '/growshops/ar/x/']) assert.equal(load({ path: p }).cfg.PAIS, 'ES', p);
});

test('?pais=AR (mayusculas, minusculas), se guarda y se quita de la URL conservando el resto', () => {
  const r = load({ path: '/growshops.html', search: '?pais=ar&ciudad=Rosario', hash: '#id=5' });
  assert.equal(r.cfg.PAIS, 'AR');
  assert.equal(r.cfg.PAIS_FUENTE, 'param');
  assert.equal(r.store.get('cc_pais'), 'AR');
  assert.deepEqual(r.replaced, ['/growshops.html?ciudad=Rosario#id=5']);
  assert.deepEqual(load({ search: '?pais=CL' }).replaced, ['/']);
  assert.equal(load({ search: '?pais=CL' }).cfg.PAIS, 'CL');
});

test('?pais= invalido se ignora (y no se toca la URL)', () => {
  for (const s of ['?pais=', '?pais=ZZ', '?pais=constructor', '?pais=__proto__', '?pais=ES%20AR']) {
    const r = load({ search: s });
    assert.equal(r.cfg.PAIS, 'ES', s);
    assert.deepEqual(r.replaced, [], s);
  }
});

test('?pais=ES explicito pisa lo guardado (vuelta a España)', () => {
  const r = load({ search: '?pais=ES', session: { cc_pais: 'AR' } });
  assert.equal(r.cfg.PAIS, 'ES');
  assert.equal(r.store.get('cc_pais'), 'ES');
});

test('prioridad: param > ruta > host > cookie > sesion > ES', () => {
  assert.equal(load({ host: 'ar.cannabicultor.com', path: '/cl/', search: '?pais=MX' }).cfg.PAIS, 'MX');
  assert.equal(load({ host: 'ar.cannabicultor.com', path: '/cl/' }).cfg.PAIS, 'CL');
  assert.equal(load({ host: 'ar.cannabicultor.com', cookie: 'cc_pais=co' }).cfg.PAIS, 'AR');
  assert.equal(load({ cookie: 'cc_pais=co', session: { cc_pais: 'AR' } }).cfg.PAIS, 'CO');
  assert.equal(load({ session: { cc_pais: 'AR' } }).cfg.PAIS, 'AR');
});

test('tras el 301: la cookie cc_pais da el pais, se guarda en la sesion y se borra', () => {
  const r = load({ host: 'www.cannabicultor.com', path: '/growshops.html', cookie: 'cc_pais=ar; otra=1' });
  assert.equal(r.cfg.PAIS, 'AR');
  assert.equal(r.cfg.PAIS_FUENTE, 'cookie');
  assert.equal(r.store.get('cc_pais'), 'AR');
  assert.equal(r.jar.has('cc_pais'), false, 'la cookie del redirect se borra');
  assert.equal(r.jar.get('otra'), '1', 'las demas cookies no se tocan');
  // siguiente pagina de la misma pestana: ya sin cookie, el pais sale de la sesion
  const next = load({ path: '/asociaciones.html', session: Object.fromEntries(r.store) });
  assert.equal(next.cfg.PAIS, 'AR');
  assert.equal(next.cfg.PAIS_FUENTE, 'sesion');
  // visita futura sin cookie ni sesion: España
  assert.equal(load().cfg.PAIS, 'ES');
});

test('cookie invalida se ignora', () => {
  for (const c of ['cc_pais=zz', 'cc_pais=', 'cc_pais=%E0%A4%A']) assert.equal(load({ cookie: c }).cfg.PAIS, 'ES', c);
});

test('sessionStorage bloqueado no rompe nada', () => {
  assert.equal(load({ storageThrows: true }).cfg.PAIS, 'ES');
  assert.equal(load({ host: 'ar.cannabicultor.com', storageThrows: true }).cfg.PAIS, 'AR');
  assert.equal(load({ search: '?pais=CL', storageThrows: true }).cfg.PAIS, 'CL');
});

test('CC_CONFIG esta congelado', () => {
  const r = load({ host: 'ar.cannabicultor.com' });
  assert.throws(() => { 'use strict'; r.cfg.PAIS = 'ES'; }, TypeError);
  assert.equal(Object.isFrozen(r.cfg), true);
});

// ---------- cabecera X-CC-Pais hacia el worker ----------
const ok = () => Promise.resolve({ ok: true });

test('España: fetch no se modifica', () => {
  const r = load({ fetchImpl: ok });
  assert.equal(r.ctx.fetch === r.ctx.window.fetch, true);
  r.ctx.fetch(`${WORKER}/chat`, { method: 'POST' });
  assert.equal(r.fetchCalls.length, 1);
  assert.equal(r.fetchCalls[0][1].headers, undefined);
});

test('pais != ES: las peticiones al worker llevan X-CC-Pais y conservan el resto de opciones', async () => {
  const r = load({ host: 'ar.cannabicultor.com', fetchImpl: ok });
  await r.ctx.window.fetch(`${WORKER}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const [url, init] = r.fetchCalls[0];
  assert.equal(url, `${WORKER}/chat`);
  assert.equal(init.method, 'POST');
  assert.equal(init.body, '{}');
  assert.equal(init.headers.get('X-CC-Pais'), 'AR');
  assert.equal(init.headers.get('Content-Type'), 'application/json');
});

test('otras URLs (supabase, propias) no llevan la cabecera', async () => {
  const r = load({ host: 'ar.cannabicultor.com', fetchImpl: ok });
  await r.ctx.window.fetch('https://gfyrsrdnvgnhtsuexjkb.supabase.co/rest/v1/growshops', { headers: { apikey: 'k' } });
  await r.ctx.window.fetch('/assets/x.json');
  assert.equal(r.fetchCalls[0][1].headers.get?.('X-CC-Pais') ?? null, null);
  assert.equal(r.fetchCalls[1][1], undefined);
});

test('worker antiguo (CORS rechaza la cabecera => TypeError): se reintenta sin cabecera y se deja de enviar', async () => {
  let n = 0;
  const cors = (url, init) => {
    n++;
    if (init && init.headers && new Headers(init.headers).has('X-CC-Pais')) { const e = new Error('Failed to fetch'); e.name = 'TypeError'; return Promise.reject(e); }
    return Promise.resolve({ ok: true, viaRetry: true });
  };
  const r = load({ path: '/ar/', fetchImpl: cors });
  const res = await r.ctx.window.fetch(`${WORKER}/chat`, { method: 'POST', body: '{}' });
  assert.equal(res.viaRetry, true);
  assert.equal(n, 2); // intento con cabecera + reintento
  await r.ctx.window.fetch(`${WORKER}/feedback`, { method: 'POST' });
  assert.equal(n, 3); // ya no se manda la cabecera: una sola llamada
});

test('errores que no son TypeError se propagan (sin reintento)', async () => {
  const boom = () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' }));
  const r = load({ host: 'cl.cannabicultor.com', fetchImpl: boom });
  await assert.rejects(() => r.ctx.window.fetch(`${WORKER}/chat`, {}), { name: 'AbortError' });
  assert.equal(r.fetchCalls.length, 1);
});
