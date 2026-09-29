// Fase 0 SEO multipais: build.mjs --cbd solo genera España y marca noindex lo no curado.
// Ejecutar: node --test prerender/test/
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD = join(HERE, '..', 'build.mjs');
let OUT, LOG;

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const robotsOf = (file) => (readFileSync(file, 'utf8').match(/<meta name="robots" content="([^"]*)"/) || [])[1];

before(() => {
  OUT = mkdtempSync(join(tmpdir(), 'seo-build-'));
  LOG = join(OUT, 'requests.log');
  writeFileSync(LOG, '');
  execFileSync('node', ['--import', join(HERE, 'mock-supabase.mjs'), BUILD, '--cbd'], {
    env: { ...process.env, PRERENDER_OUT: OUT, MOCK_LOG: LOG }, stdio: 'pipe',
  });
});

const fichas = () => walk(join(OUT, 'tiendas-cbd', 'espana')).filter((f) => f.endsWith('index.html') && f.split('/').length - join(OUT, 'tiendas-cbd', 'espana').split('/').length === 3);

test('la consulta de cbd_shops filtra por pais=eq.ES (y activo)', () => {
  const reqs = readFileSync(LOG, 'utf8').split('\n').filter((l) => l.includes('/rest/v1/cbd_shops'));
  assert.ok(reqs.length >= 1);
  for (const r of reqs) { assert.match(r, /pais=eq\.ES/); assert.match(r, /activo=is\.true/); }
});

test('se generan las 268 fichas de ES y ninguna de AR', () => {
  const all = fichas();
  assert.equal(all.length, 268);
  const html = all.map((f) => readFileSync(f, 'utf8')).join('\n');
  assert.ok(!/Tienda AR \d+/.test(html));
  const todo = walk(join(OUT, 'tiendas-cbd')).map((f) => readFileSync(f, 'utf8')).join('\n');
  assert.ok(!/Tienda AR \d+/.test(todo), 'ninguna pagina (hub/ciudad/ficha) menciona fichas de AR');
});

test('no hay ciudades de AR ni se mezclan con Córdoba de ES', () => {
  const ciudades = readdirSync(join(OUT, 'tiendas-cbd', 'espana'));
  for (const c of ['rosario', 'ciudad-de-buenos-aires', 'buenos-aires', 'ezpeleta', 'quilmes-oeste', 'mar-del-plata']) assert.ok(!ciudades.includes(c), `no debe existir ${c}`);
  assert.ok(!ciudades.includes('espana'), 'fichas sin ciudad de AR no deben caer en /espana/espana/');
  const cordoba = readdirSync(join(OUT, 'tiendas-cbd', 'espana', 'cordoba')).filter((n) => n !== 'index.html');
  assert.equal(cordoba.length, 27); // 268 ES repartidas en 10 ciudades: Córdoba = idx 4 mod 10 -> 27 fichas, sin la de AR
  assert.match(readFileSync(join(OUT, 'tiendas-cbd', 'espana', 'cordoba', 'index.html'), 'utf8'), /Córdoba \(27\)/);
});

test('borrador o indexable=false => noindex,follow; solo la curada e indexable va index', () => {
  const porRobots = { 'noindex,follow': 0, 'index,follow,max-image-preview:large': 0 };
  for (const f of fichas()) {
    const r = robotsOf(f);
    assert.ok(r in porRobots, `robots inesperado ${r} en ${f}`);
    porRobots[r]++;
  }
  assert.equal(porRobots['index,follow,max-image-preview:large'], 1); // id 1: indexable=true + publicado
  assert.equal(porRobots['noindex,follow'], 267); // incluye id 2 (indexable pero borrador) e id 3 (publicado pero indexable=false)
  assert.equal(robotsOf(join(OUT, 'tiendas-cbd', 'espana', 'madrid', 'tienda-es-1', 'index.html')), 'index,follow,max-image-preview:large');
  assert.equal(robotsOf(join(OUT, 'tiendas-cbd', 'espana', 'barcelona', 'tienda-es-2', 'index.html')), 'noindex,follow');
  assert.equal(robotsOf(join(OUT, 'tiendas-cbd', 'espana', 'valencia', 'tienda-es-3', 'index.html')), 'noindex,follow');
});

test('sitemap-cbd: solo la ficha indexable (mas hub y ciudades de ES), nada de AR', () => {
  const xml = readFileSync(join(OUT, 'sitemap-cbd.xml'), 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  const fichasEnSitemap = locs.filter((l) => l.split('/').length === 8); // https://www/tiendas-cbd/espana/<ciudad>/<slug>/
  assert.deepEqual(fichasEnSitemap, ['https://www.cannabicultor.com/tiendas-cbd/espana/madrid/tienda-es-1/']);
  assert.equal(locs.length, 1 + 10 + 1); // hub + 10 ciudades ES + 1 ficha
  assert.ok(!locs.some((l) => /rosario|buenos-aires|ezpeleta|mar-del-plata|quilmes/.test(l)));
});

test('las paginas de ciudad y el hub siguen como antes (index)', () => {
  assert.equal(robotsOf(join(OUT, 'tiendas-cbd', 'index.html')), 'index,follow,max-image-preview:large');
  assert.equal(robotsOf(join(OUT, 'tiendas-cbd', 'espana', 'madrid', 'index.html')), 'index,follow,max-image-preview:large');
});
