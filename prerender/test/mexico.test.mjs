// Directorio de Mexico (/mx/): abierto a indexacion por defecto desde 2026-10-20. `node --test prerender/test/`.
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
  OUT = mkdtempSync(join(tmpdir(), 'seo-mx-'));
  // Sin INDEXAR_PAISES: se prueba el valor por defecto.
  const env = { ...process.env, PRERENDER_OUT: OUT, MOCK_MX: '1' };
  delete env.INDEXAR_PAISES;
  execFileSync('node', ['--import', join(HERE, 'mock-supabase.mjs'), BUILD, '--pais=mx'], { env, stdio: 'pipe' });
});

test('mx con datos: portada, tipo y estado indexables y sitemap-mx.xml en el indice', () => {
  assert.equal(robots('mx', 'index.html'), 'index,follow,max-image-preview:large');
  assert.equal(robots('mx', 'growshops', 'index.html'), 'index,follow,max-image-preview:large');
  assert.equal(robots('mx', 'growshops', 'jalisco', 'index.html'), 'index,follow,max-image-preview:large'); // 4 fichas >= 3
  const sm = read('sitemap-mx.xml');
  assert.match(sm, /<loc>https:\/\/www\.cannabicultor\.com\/mx\/<\/loc>/);
  assert.match(sm, /\/mx\/growshops\/jalisco\//);
  assert.match(read('sitemap.xml'), /sitemap-mx\.xml/);
});

test('mx: la ficha completa (sin verificar) se indexa y la de descripcion corta no', () => {
  assert.match(read('sitemap-mx.xml'), /\/mx\/growshops\/jalisco\/mexico-completo\//);
  assert.ok(!read('sitemap-mx.xml').includes('/mexico-corto/'));
  assert.equal(robots('mx', 'growshops', 'jalisco', 'mexico-completo', 'index.html'), 'index,follow,max-image-preview:large');
  assert.equal(robots('mx', 'growshops', 'jalisco', 'mexico-corto', 'index.html'), 'noindex,follow');
  assert.ok(existsSync(join(OUT, 'mx', 'growshops', 'jalisco', 'mexico-corto', 'index.html')));
});

test('mx: textos es-MX, canonical propio y sin subdominios ni "correr"', () => {
  const h = read('mx', 'index.html');
  assert.match(h, /lang="es-MX"|es_MX/);
  assert.match(h, /<link rel="canonical" href="https:\/\/www\.cannabicultor\.com\/mx\/">/);
  assert.ok(!/(ar|cl|co|mx)\.cannabicultor\.com/.test(h));
  assert.ok(!/corrimos|correr/i.test(h));
});
