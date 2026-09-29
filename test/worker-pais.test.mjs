// El worker conserva el pais tras el 301 de ar./cl./co./mx. -> www: lee la cabecera X-CC-Pais (que envia assets/config.js).
// Carga el worker real (copiado a un temporal) y llama a sus funciones. Ejecutar: node --test test/*.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'worker');
let W;

before(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'worker-pais-'));
  for (const f of ['sales-agent.js', 'ig-channel.js', 'catalog-curation.js']) copyFileSync(join(SRC, f), join(tmp, f));
  writeFileSync(join(tmp, 'worker.mjs'), readFileSync(join(SRC, 'worker-produccion.js'), 'utf8') + '\nexport { paisSubdominio, resolvePais, corsHeaders, resolverPaisLegal };\n');
  W = await import(pathToFileURL(join(tmp, 'worker.mjs')).href);
});

const rq = (headers = {}) => new Request('https://worker.test/chat', { method: 'POST', headers });

test('sin Origin de pais ni cabecera: España (comportamiento actual)', () => {
  assert.equal(W.resolvePais(rq({ Origin: 'https://www.cannabicultor.com' })), 'ES');
  assert.equal(W.resolvePais(rq()), 'ES');
  assert.equal(W.paisSubdominio(rq({ Origin: 'https://www.cannabicultor.com' })), null);
});

test('el Origin de un subdominio de pais sigue mandando', () => {
  assert.equal(W.resolvePais(rq({ Origin: 'https://ar.cannabicultor.com' })), 'AR');
  assert.equal(W.resolvePais(rq({ Origin: 'https://mx.cannabicultor.com', 'X-CC-Pais': 'CL' })), 'MX');
});

test('tras el 301 (Origin www): la cabecera X-CC-Pais da el pais', () => {
  for (const [h, exp] of [['AR', 'AR'], ['cl', 'CL'], [' co ', 'CO'], ['MX', 'MX'], ['ES', 'ES']]) {
    assert.equal(W.resolvePais(rq({ Origin: 'https://www.cannabicultor.com', 'X-CC-Pais': h })), exp, h);
  }
});

test('cabecera invalida o rara se ignora (ES)', () => {
  for (const h of ['ZZ', '', 'constructor', '__proto__', 'AR,CL', 'España', '<script>']) {
    assert.equal(W.resolvePais(rq({ Origin: 'https://www.cannabicultor.com', 'X-CC-Pais': h })), 'ES', JSON.stringify(h));
  }
  assert.doesNotThrow(() => W.resolvePais(null));
  assert.equal(W.resolvePais(null), 'ES');
});

test('CORS: X-CC-Pais permitida en el preflight (Origin www y de pais)', () => {
  for (const o of ['https://www.cannabicultor.com', 'https://ar.cannabicultor.com']) {
    const h = W.corsHeaders(rq({ Origin: o }));
    assert.match(h['Access-Control-Allow-Headers'], /X-CC-Pais/);
    assert.match(h['Access-Control-Allow-Headers'], /Content-Type/);
    assert.match(h['Access-Control-Allow-Headers'], /Authorization/);
    assert.equal(h['Access-Control-Allow-Origin'], o);
  }
});

test('lo legal usa el pais de la cabecera igual que el del subdominio', () => {
  const msgs = [{ role: 'user', content: '¿Cuántas plantas puedo tener?' }];
  assert.deepEqual(W.resolverPaisLegal(msgs, rq({ Origin: 'https://www.cannabicultor.com', 'X-CC-Pais': 'CO' })), { pais: 'CO', via: 'subdominio' });
  assert.deepEqual(W.resolverPaisLegal(msgs, rq({ Origin: 'https://co.cannabicultor.com' })), { pais: 'CO', via: 'subdominio' });
  assert.deepEqual(W.resolverPaisLegal(msgs, rq({ Origin: 'https://www.cannabicultor.com' })), { pais: null, via: 'desconocido' }); // España sin cambios
});
