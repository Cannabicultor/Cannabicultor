// Directorio de Chile (/cl/...) con datos simulados: ejecutar con `node --test prerender/test/`.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD = join(HERE, '..', 'build.mjs');
let OUT;
const read = (...p) => readFileSync(join(OUT, ...p), 'utf8');
const robots = (...p) => (read(...p).match(/<meta name="robots" content="([^"]*)"/) || [])[1];

before(() => {
  OUT = mkdtempSync(join(tmpdir(), 'seo-cl-'));
  execFileSync('node', ['--import', join(HERE, 'mock-supabase.mjs'), BUILD, '--pais=cl'], {
    env: { ...process.env, PRERENDER_OUT: OUT, MOCK_CL: '1' }, stdio: 'pipe',
  });
});

test('Chile con datos: portada, tipos y regiones generados, solo con fichas de CL', () => {
  for (const f of ['cl/index.html', 'cl/growshops/index.html', 'cl/asociaciones/index.html']) assert.ok(existsSync(join(OUT, f)), f);
  assert.ok(!existsSync(join(OUT, 'cl', 'tiendas-cbd', 'index.html'))); // sin fichas CBD de CL
  const tipo = read('cl', 'growshops', 'index.html');
  assert.match(tipo, /Región Metropolitana/);
  const h = read('cl', 'growshops', 'region-metropolitana', 'index.html');
  assert.match(h, /Chile Cumple Todo/);
  assert.ok(!/Tienda AR|De Espana|Cumple todo</.test(tipo + h)); // nada de ES ni AR
});

test('regiones: slug sin tilde ni apostrofo y ficha dentro de su region', () => {
  for (const d of ['region-metropolitana', 'region-de-valparaiso', 'region-de-o-higgins', 'region-de-la-araucania']) {
    assert.ok(existsSync(join(OUT, 'cl', 'growshops', d, 'index.html')), d);
  }
  assert.ok(existsSync(join(OUT, 'cl', 'growshops', 'region-metropolitana', 'chile-cumple-todo', 'index.html')));
});

test('regla de calidad: solo la ficha completa entra al sitemap; el resto noindex', () => {
  const sm = read('sitemap-cl.xml');
  assert.match(sm, /\/cl\/growshops\/region-metropolitana\/chile-cumple-todo\//);
  for (const n of ['chile-sin-verificar', 'chile-geo-aprox', 'chile-sin-region', 'fundacion-chile-demo']) assert.ok(!sm.includes(`/${n}/`), n);
  assert.equal(robots('cl', 'growshops', 'region-metropolitana', 'chile-cumple-todo', 'index.html'), 'index,follow,max-image-preview:large');
  assert.equal(robots('cl', 'growshops', 'region-metropolitana', 'chile-sin-verificar', 'index.html'), 'noindex,follow');
  // listado de region con 1 ficha (O'Higgins) no se indexa; la RM tiene 3 pero solo cuenta a partir de >=3
  assert.equal(robots('cl', 'growshops', 'region-de-o-higgins', 'index.html'), 'noindex,follow');
});

test('textos de Chile: es-CL, region, JSON-LD y sin subdominios ni "correr"', () => {
  const h = read('cl', 'growshops', 'region-metropolitana', 'chile-cumple-todo', 'index.html');
  assert.match(h, /lang="es-CL"|es_CL/);
  assert.match(h, /<link rel="canonical" href="https:\/\/www\.cannabicultor\.com\/cl\/growshops\/region-metropolitana\/chile-cumple-todo\/"/);
  assert.match(h, /application\/ld\+json/);
  assert.ok(!/(ar|cl|co|mx)\.cannabicultor\.com/.test(h));
  assert.ok(!/corrimos|correr/i.test(h));
  assert.match(read('cl', 'index.html'), /Ley 20\.000/);
});

test('la ficha sin region va a /sin-region/ (URL sin tilde) y no rompe el build', () => {
  assert.ok(existsSync(join(OUT, 'cl', 'growshops', 'sin-region', 'index.html')));
  assert.ok(!existsSync(join(OUT, 'cl', 'growshops', 'sin-regi\u00f3n')));
  assert.match(read('cl', 'growshops', 'sin-region', 'index.html'), /Chile Sin Region/);
  assert.ok(!/sin-regi\u00f3n/.test(read('cl', 'growshops', 'index.html')));
});
