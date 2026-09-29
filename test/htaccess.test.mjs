// Prueba REAL de las reglas de .htaccess con Apache + mod_rewrite (no una simulacion).
// Levanta un Apache temporal (HTTP 18080 / HTTPS 18443 con certificado autofirmado), copia el .htaccess del repo
// y comprueba redirecciones: 301, ruta y query conservadas, un solo salto a https://www, sin bucles.
// Se salta si no hay apache2/openssl. Ejecutar: node --test test/*.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import https from 'node:https';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const APACHE = ['/usr/sbin/apache2', '/usr/sbin/httpd'].find(existsSync);
const MODS = '/usr/lib/apache2/modules';
const HTTP_PORT = 18080, HTTPS_PORT = 18443;
const SKIP = !APACHE || !existsSync(MODS) || spawnSync('openssl', ['version']).status !== 0 ? 'sin apache2/openssl en este entorno' : false;
let T;

before(() => {
  if (SKIP) return;
  T = mkdtempSync(join(tmpdir(), 'htaccess-'));
  const doc = join(T, 'docroot');
  mkdirSync(join(doc, '.well-known', 'pki-validation'), { recursive: true });
  for (const [f, c] of Object.entries({
    'index.html': 'HOME', 'growshops.html': 'GROWSHOPS', 'robots.txt': 'User-agent: *\nAllow: /\n', 'sitemap.xml': '<urlset/>',
    'trafico.html': 'TRAFICO', '.well-known/pki-validation/abc.txt': 'DCV-OK',
  })) writeFileSync(join(doc, f), c);
  mkdirSync(join(doc, 'tiendas-cbd', 'espana', 'madrid', 'x'), { recursive: true });
  writeFileSync(join(doc, 'tiendas-cbd', 'espana', 'madrid', 'x', 'index.html'), 'FICHA');
  copyFileSync(join(REPO, '.htaccess'), join(doc, '.htaccess'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(T, 'k.pem'), '-out', join(T, 'c.pem'), '-days', '2', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  // Modulos ya compilados en el binario (p. ej. unixd) no se pueden cargar de nuevo.
  const builtin = spawnSync(APACHE, ['-l'], { encoding: 'utf8' }).stdout;
  const m = (n) => (builtin.includes(`mod_${n}.c`) ? '' : `LoadModule ${n}_module ${MODS}/mod_${n}.so`);
  writeFileSync(join(T, 'mime.types'), 'text/html html htm\ntext/plain txt\napplication/xml xml\n');
  writeFileSync(join(T, 'httpd.conf'), `
ServerRoot "${T}"
ServerName localhost
PidFile "${T}/pid"
TypesConfig "${T}/mime.types"
ErrorLog "${T}/error.log"
LogLevel warn
User www-data
Group www-data
Listen ${HTTP_PORT}
Listen ${HTTPS_PORT}
${['mpm_event', 'authz_core', 'mime', 'dir', 'rewrite', 'headers', 'ssl', 'socache_shmcb', 'unixd', 'alias', 'log_config'].map(m).join('\n')}
DocumentRoot "${doc}"
<Directory "${doc}">
  AllowOverride All
  Require all granted
  DirectoryIndex index.html
</Directory>
SSLRandomSeed startup builtin
SSLSessionCache none
<VirtualHost *:${HTTP_PORT}>
</VirtualHost>
<VirtualHost *:${HTTPS_PORT}>
  SSLEngine on
  SSLCertificateFile "${T}/c.pem"
  SSLCertificateKeyFile "${T}/k.pem"
</VirtualHost>
`);
  execFileSync('chmod', ['-R', 'a+rX', T]); // Apache corre como www-data
  const r = spawnSync(APACHE, ['-f', join(T, 'httpd.conf'), '-k', 'start'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`apache no arranca: ${r.stderr} ${existsSync(join(T, 'error.log')) ? readFileSync(join(T, 'error.log'), 'utf8') : ''}`);
});

after(() => {
  if (SKIP || !T) return;
  spawnSync(APACHE, ['-f', join(T, 'httpd.conf'), '-k', 'stop']);
});

// Una peticion sin seguir redirecciones. `host` = cabecera Host; `scheme` = http|https.
function req(scheme, host, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const lib = scheme === 'https' ? https : http;
    const r = lib.request({ host: '127.0.0.1', port: scheme === 'https' ? HTTPS_PORT : HTTP_PORT, path, method, headers: { Host: host }, rejectUnauthorized: false, servername: host.split(':')[0] }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location || null, cookie: [].concat(res.headers['set-cookie'] || []).join('; '), body }));
    });
    r.on('error', reject);
    r.end();
  });
}

// Sigue redirecciones (mapeando cualquier host a nuestro Apache). Devuelve la cadena y falla si hay bucle o >5 saltos.
async function follow(url) {
  const chain = [];
  let u = new URL(url);
  for (let i = 0; i < 6; i++) {
    const res = await req(u.protocol.slice(0, -1), u.host, u.pathname + u.search);
    chain.push({ url: u.href, status: res.status, location: res.location, body: res.body });
    if (res.status < 300 || res.status >= 400) return chain;
    const next = new URL(res.location, u);
    assert.ok(!chain.some((c) => c.url === next.href), `bucle de redirecciones: ${next.href}`);
    u = next;
  }
  assert.fail(`demasiados saltos: ${chain.map((c) => c.url).join(' -> ')}`);
}

const opts = { skip: SKIP };

for (const p of ['ar', 'cl', 'co', 'mx']) {
  test(`${p}.: 301 a https://www con ruta y query intactas y cookie cc_pais=${p} (un solo salto desde https y desde http)`, opts, async () => {
    for (const scheme of ['https', 'http']) {
      const r = await req(scheme, `${p}.cannabicultor.com`, '/growshops.html?ciudad=Rosario&q=%C3%A9');
      assert.equal(r.status, 301, scheme);
      assert.equal(r.location, 'https://www.cannabicultor.com/growshops.html?ciudad=Rosario&q=%C3%A9', scheme);
      assert.match(r.cookie, new RegExp(`cc_pais=${p}\\b`), scheme);
      assert.match(r.cookie, /domain=\.cannabicultor\.com/i);
      assert.match(r.cookie, /path=\//i);
    }
    const home = await req('https', `${p}.cannabicultor.com`, '/');
    assert.equal(home.status, 301);
    assert.equal(home.location, 'https://www.cannabicultor.com/');
  });
}

test('ruta profunda, espacios y acentos codificados se conservan tal cual', opts, async () => {
  const r = await req('https', 'ar.cannabicultor.com', '/tiendas-cbd/espana/madrid/x/?a=1&b=2');
  assert.equal(r.status, 301);
  assert.equal(r.location, 'https://www.cannabicultor.com/tiendas-cbd/espana/madrid/x/?a=1&b=2');
  const enc = await req('https', 'mx.cannabicultor.com', '/a%20b/c%C3%B1?x=%20y&pais=CL');
  assert.equal(enc.status, 301);
  assert.match(enc.location, /^https:\/\/www\.cannabicultor\.com\/a(%20| )b\/c(%C3%B1|%c3%b1)\?x=%20y&pais=CL$/); // query sin doble escape
});

test('una regla comun: host en mayusculas y con puerto tambien redirigen', opts, async () => {
  const up = await req('https', 'AR.CANNABICULTOR.COM', '/x');
  assert.equal(up.status, 301);
  assert.equal(up.location, 'https://www.cannabicultor.com/x');
  assert.match(up.cookie, /cc_pais=(ar|AR)\b/);
  const port = await req('https', 'cl.cannabicultor.com:8443', '/x');
  assert.equal(port.status, 301);
});

test('robots.txt y sitemaps de los subdominios redirigen a www (no se sirven propios)', opts, async () => {
  for (const f of ['/robots.txt', '/sitemap.xml']) {
    const r = await req('https', 'ar.cannabicultor.com', f);
    assert.equal(r.status, 301, f);
    assert.equal(r.location, `https://www.cannabicultor.com${f}`);
    assert.ok(!r.body.includes('Allow'), 'el subdominio no debe servir el robots.txt');
  }
});

test('sin bucles: la cadena termina en www con 200 y contenido correcto', opts, async () => {
  for (const url of ['https://ar.cannabicultor.com/growshops.html?x=1', 'http://cl.cannabicultor.com/', 'https://mx.cannabicultor.com/tiendas-cbd/espana/madrid/x/', 'http://co.cannabicultor.com/robots.txt']) {
    const chain = await follow(url);
    const last = chain.at(-1);
    assert.equal(last.status, 200, url);
    assert.ok(new URL(last.url).host === 'www.cannabicultor.com', last.url);
    assert.ok(chain.length <= 2, `${url}: ${chain.length} saltos`);
  }
});

test('/.well-known/ no redirige (validacion del certificado de cada subdominio)', opts, async () => {
  const r = await req('https', 'ar.cannabicultor.com', '/.well-known/pki-validation/abc.txt');
  assert.equal(r.status, 200);
  assert.equal(r.body, 'DCV-OK');
});

test('www: sin cambios (https 200; http -> https; apex -> www)', opts, async () => {
  assert.equal((await req('https', 'www.cannabicultor.com', '/')).status, 200);
  const h = await req('http', 'www.cannabicultor.com', '/growshops.html?a=1');
  assert.equal(h.status, 301);
  assert.equal(h.location, 'https://www.cannabicultor.com/growshops.html?a=1');
  const apex = await req('https', 'cannabicultor.com', '/growshops.html?a=1');
  assert.equal(apex.status, 301);
  assert.equal(apex.location, 'https://www.cannabicultor.com/growshops.html?a=1');
  const r = await req('https', 'www.cannabicultor.com', '/robots.txt');
  assert.equal(r.status, 200); // el robots.txt de www sigue sirviendose
});

test('hosts que no son ar/cl/co/mx no se tocan (ni falsos positivos)', opts, async () => {
  for (const h of ['es.cannabicultor.com', 'demo.cannabicultor.com', 'ar.cannabicultor.com.evil.com', 'xar.cannabicultor.com', 'genetica.cannabicultor.com']) {
    const r = await req('https', h, '/');
    assert.notEqual(r.location && /pais=/.test(r.location), true, h);
    assert.equal(r.status, 200, h);
  }
});

test('reglas existentes intactas (redirect relativo /analytics.html -> /trafico.html)', opts, async () => {
  const r = await req('https', 'www.cannabicultor.com', '/analytics.html');
  assert.equal(r.status, 301);
  assert.match(r.location, /\/trafico\.html$/);
});

test('el .htaccess de prueba es el del repo', opts, () => {
  assert.equal(readFileSync(join(T, 'docroot', '.htaccess'), 'utf8'), readFileSync(join(REPO, '.htaccess'), 'utf8'));
});
