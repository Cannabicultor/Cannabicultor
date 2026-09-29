// "Ver ficha completa": no se enlaza a fichas que dan 404 (paises != ES). Prueba el codigo real de las paginas.
// Ejecutar: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fn = (html, name) => {
  const m = new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n`).exec(html);
  assert.ok(m, `no encuentro ${name}()`);
  return m[0];
};

for (const [page, base] of [['growshops.html', '/growshops/'], ['asociaciones.html', '/asociaciones/']]) {
  const html = readFileSync(join(ROOT, page), 'utf8');
  const make = (ES) => {
    const ctx = vm.createContext({ ES, esc: (s) => String(s).replace(/"/g, '&quot;') });
    vm.runInContext(fn(html, 'slugFallback') + fn(html, 'fichaUrl'), ctx);
    return ctx.fichaUrl;
  };

  test(`${page}: en España enlaza a la ficha`, () => {
    const a = make(true)({ slug: 'frankensweed-madrid', slug_ciudad: 'madrid', ciudad: 'Madrid' });
    assert.match(a, /href="\/[a-z]+\/madrid\/frankensweed-madrid\/">Ver ficha completa/);
    assert.ok(a.includes(base + 'madrid/frankensweed-madrid/'));
    assert.ok(make(true)({ slug: 'x', pais: 'ES', ciudad: 'Málaga' }).includes(base + 'malaga/x/'));
    assert.ok(make(true)({ slug: 'x' }).includes(base + 'espana/x/')); // la lista no trae `pais`: sigue como antes
  });

  test(`${page}: fuera de España no hay enlace (dan 404)`, () => {
    assert.equal(make(false)({ slug: 'ar-vivero-agronomia-ciudad-de-buenos-aires', slug_ciudad: 'ciudad-de-buenos-aires' }), '');
    assert.equal(make(true)({ slug: 'ar-x', pais: 'AR', slug_ciudad: 'cordoba' }), ''); // ficha AR aunque la pagina sea ES
    assert.equal(make(true)({ slug: 'cl-x', pais: 'CL' }), '');
  });

  test(`${page}: sin slug no hay enlace`, () => {
    assert.equal(make(true)({ slug: '', ciudad: 'Madrid' }), '');
    assert.equal(make(true)({}), '');
  });
}

test('tiendas-cbd.html no tiene enlace "Ver ficha completa"', () => {
  assert.ok(!readFileSync(join(ROOT, 'tiendas-cbd.html'), 'utf8').includes('Ver ficha completa'));
});

test('shell.js carga el menu de pais segun CC_CONFIG.PAIS (y el host como respaldo)', () => {
  const code = readFileSync(join(ROOT, 'assets', 'shell.js'), 'utf8');
  const run = ({ pais, host }) => {
    const added = [];
    const doc = { querySelector: () => null, createElement: () => ({}), head: { appendChild: (s) => added.push(s.src) }, addEventListener() {}, readyState: 'loading', getElementById: () => null, querySelectorAll: () => [], body: {} };
    const ctx = vm.createContext({ location: { hostname: host }, document: doc, window: {}, console });
    ctx.window = ctx; ctx.window.CC_CONFIG = pais ? { PAIS: pais } : undefined;
    try { vm.runInContext(code, ctx); } catch { /* el resto del shell necesita un DOM real: aqui solo importa el primer bloque */ }
    return added;
  };
  assert.deepEqual(run({ pais: 'AR', host: 'www.cannabicultor.com' }), ['/assets/menu-pais.js']); // tras el 301
  assert.deepEqual(run({ pais: 'ES', host: 'www.cannabicultor.com' }), []);
  assert.deepEqual(run({ pais: 'ES', host: 'ar.cannabicultor.com' }), []); // ?pais=ES manda sobre el host
  assert.deepEqual(run({ pais: null, host: 'ar.cannabicultor.com' }), ['/assets/menu-pais.js']); // sin config: host
  assert.deepEqual(run({ pais: null, host: 'www.cannabicultor.com' }), []);
});
