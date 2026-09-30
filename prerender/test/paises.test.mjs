// Directorio por pais (/ar/ ...): ejecutar con `node --test prerender/test/`.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD = join(HERE, '..', 'build.mjs');
let OUT, LOG;
const read = (...p) => readFileSync(join(OUT, ...p), 'utf8');
const robots = (...p) => (read(...p).match(/<meta name="robots" content="([^"]*)"/) || [])[1];

before(() => {
  OUT = mkdtempSync(join(tmpdir(), 'seo-paises-'));
  LOG = join(OUT, 'requests.log');
  writeFileSync(LOG, '');
  execFileSync('node', ['--import', join(HERE, 'mock-supabase.mjs'), BUILD, '--paises'], {
    env: { ...process.env, PRERENDER_OUT: OUT, MOCK_LOG: LOG }, stdio: 'pipe',
  });
});

test('las consultas filtran por pais del directorio', () => {
  const reqs = readFileSync(LOG, 'utf8').split('\n').filter((l) => /\/rest\/v1\/(growshops|asociaciones|cbd_shops)/.test(l));
  assert.ok(reqs.length >= 12); // 3 tablas x 4 paises
  for (const r of reqs) assert.match(r, /pais=eq\.(AR|CL|CO|MX)/);
});

test('solo entra al sitemap la ficha que cumple descripcion unica >120 + verificada + geo exacta', () => {
  const sm = read('sitemap-ar.xml');
  assert.match(sm, /\/ar\/growshops\/santa-fe\/cumple-todo\//);
  for (const n of ['sin-verificar', 'geo-aproximada', 'descripcion-corta', 'duplicada-a', 'duplicada-b', 'flag-indexable-false']) {
    assert.ok(!sm.includes(`/${n}/`), `${n} no debe estar en sitemap`);
  }
  assert.equal(robots('ar', 'growshops', 'santa-fe', 'cumple-todo', 'index.html'), 'index,follow,max-image-preview:large');
  for (const n of ['sin-verificar', 'geo-aproximada', 'descripcion-corta', 'duplicada-a', 'flag-indexable-false']) {
    assert.equal(robots('ar', 'growshops', 'santa-fe', n, 'index.html'), 'noindex,follow', n);
  }
});

test('la ficha de ES no sale bajo /ar/', () => {
  assert.ok(!existsSync(join(OUT, 'ar', 'growshops', 'madrid')));
  assert.ok(!/De Espana/.test(read('ar', 'growshops', 'index.html')));
});

test('portada /ar/: canonical autorreferencial, hreflang y JSON-LD en el HTML crudo', () => {
  const h = read('ar', 'index.html');
  assert.match(h, /<html lang="es-AR"/);
  assert.match(h, /<link rel="canonical" href="https:\/\/www\.cannabicultor\.com\/ar\/">/);
  assert.match(h, /hreflang="es-AR" href="https:\/\/www\.cannabicultor\.com\/ar\/"/);
  assert.match(h, /hreflang="x-default" href="https:\/\/www\.cannabicultor\.com\/"/);
  const ld = JSON.parse(h.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.ok(ld['@graph'].some((x) => x['@type'] === 'FAQPage'));
  assert.match(h, /href="\/ar\/growshops\/"/); // menu apunta a /ar/, no al subdominio
  assert.ok(!/(ar|cl|co|mx)\.cannabicultor\.com/.test(h));
  assert.ok(!/corrimos|correr/i.test(h));
});

test('pais sin datos: portada noindex y fuera del sitemap e indice', () => {
  assert.equal(robots('cl', 'index.html'), 'noindex,follow');
  assert.ok(!existsSync(join(OUT, 'sitemap-cl.xml')));
  const idx = read('sitemap.xml');
  assert.match(idx, /sitemap-ar\.xml/);
  assert.ok(!/sitemap-cl\.xml/.test(idx));
});

test('listado por provincia: indexable solo con >=3 fichas', () => {
  assert.equal(robots('ar', 'growshops', 'santa-fe', 'index.html'), 'index,follow,max-image-preview:large');
  assert.equal(robots('ar', 'growshops', 'sin-provincia', 'index.html'), 'noindex,follow');
});
