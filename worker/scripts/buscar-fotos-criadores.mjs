// Buscador de fotos candidatas en las WEBS DE LOS CRIADORES (con su permiso general). NO publica nada:
// con --guardar inserta filas 'pendiente' en variedad_fotos para que las apruebes en el panel.
// Nunca hotlinkea: al aprobar, el Worker descarga la imagen, la optimiza y la sirve desde el bucket propio
// con crédito al criador y enlace a su ficha.
//
// Cómo localiza las fotos (APIs públicas de catálogo, no raspa HTML):
//   · WooCommerce: /wp-json/wc/store/v1/products   (paginado)
//   · Shopify:     /products.json                  (paginado)
// Descarga el catálogo del criador UNA vez y casa los productos con sus variedades sin foto por nombre
// (se quita "feminized/regular/auto/seeds…" del nombre del producto; solo coincidencia exacta o muy alta).
// Cortesía: User-Agent identificado, 1 petición cada 1,5 s por dominio, y respeta robots.txt (grupo *).
//
// Uso (desde el Mac):  cd worker && set -a && . ../.env && set +a
//   node scripts/buscar-fotos-criadores.mjs --breeder="Exotic Genetix"      # prueba de un criador, no escribe
//   node scripts/buscar-fotos-criadores.mjs --top=20                        # los 20 criadores con más fichas sin foto
//   node scripts/buscar-fotos-criadores.mjs --top=20 --guardar              # inserta en variedad_fotos
// Flags: --min-score=0.85 · --max-paginas=40 (tope de páginas de catálogo por criador)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gfyrsrdnvgnhtsuexjkb.supabase.co';
const { SUPABASE_SERVICE_KEY: K } = process.env;
if (!K) { console.error('Falta SUPABASE_SERVICE_KEY'); process.exit(1); }
const args = process.argv.slice(2);
const val = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const BREEDER = val('breeder', null);
const TOP = parseInt(val('top', '0'), 10);
const MIN_SCORE = parseFloat(val('min-score', '0.85'));
const MAX_PAG = parseInt(val('max-paginas', '40'), 10);
const GUARDAR = args.includes('--guardar');
const UA = 'cannabicultor-photo-finder/0.1 (+https://www.cannabicultor.com; cannabicultor@icloud.com)';
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };
const NOTA = 'Autorización general de criadores declarada por Cannabicultor; pendiente de constancia escrita';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&amp;|&#038;/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
const RUIDO_PRODUCTO = /\b(feminized|feminised|femenizada|femenizadas|regular|regulars|autoflowering|autoflower|autofloreciente|auto|seeds|seed|semillas|semilla|fem|reg|pack|packs|photoperiod|clone|clones|cut|merch|hoodie|shirt|t shirt|tee|poster|sticker|grinder|lighter|hat|cap)\b/g;
const nombreBase = (s) => norm(String(s).replace(/\([^)]*\)/g, ' ').split(/ [-–|] /)[0]).replace(RUIDO_PRODUCTO, ' ').replace(/\s+/g, ' ').trim();

const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
const ultima = new Map();
async function get(url, init = {}) {
  const host = new URL(url).host;
  const dt = Date.now() - (ultima.get(host) || 0);
  if (dt < 1500) await espera(1500 - dt);
  ultima.set(host, Date.now());
  return fetch(url, { ...init, headers: { 'User-Agent': UA, Accept: 'application/json', ...(init.headers || {}) }, signal: AbortSignal.timeout(30000), redirect: 'follow' });
}

// robots.txt mínimo: ¿está permitido `ruta` para el grupo "*"?
async function permitido(origin, ruta) {
  try {
    const r = await get(`${origin}/robots.txt`, { headers: { Accept: 'text/plain' } });
    if (!r.ok) return true;
    let enGrupo = false, prohibidas = [];
    for (const l of (await r.text()).split('\n')) {
      const m = l.trim().match(/^(user-agent|disallow)\s*:\s*(.*)$/i); if (!m) continue;
      if (m[1].toLowerCase() === 'user-agent') enGrupo = m[2].trim() === '*';
      else if (enGrupo && m[2].trim()) prohibidas.push(m[2].trim());
    }
    return !prohibidas.some((p) => ruta.startsWith(p));
  } catch { return true; }
}

async function catalogoWoo(origin) {
  const out = [];
  for (let p = 1; p <= MAX_PAG; p++) {
    const r = await get(`${origin}/wp-json/wc/store/v1/products?per_page=100&page=${p}`);
    if (!r.ok) { if (p === 1) return null; break; }
    const j = await r.json().catch(() => null);   // HTML/desafío anti-bot en vez de JSON: sin API
    if (!Array.isArray(j)) return p === 1 ? null : out;
    for (const x of j) out.push({ nombre: x.name, url: x.permalink, imagen: x.images?.[0]?.src || null });
    if (j.length < 100) break;
  }
  return out;
}
async function catalogoShopify(origin) {
  const out = [];
  for (let p = 1; p <= MAX_PAG; p++) {
    const r = await get(`${origin}/products.json?limit=250&page=${p}`);
    if (!r.ok) { if (p === 1) return null; break; }
    const j = await r.json().catch(() => null);
    if (!j || !j.products) return p === 1 ? null : out;
    for (const x of j.products) out.push({ nombre: x.title, url: `${origin}/products/${x.handle}`, imagen: x.images?.[0]?.src || null });
    if (j.products.length < 250) break;
  }
  return out;
}

function casar(variedad, catalogo) {
  const objetivo = nombreBase(variedad.nombre);
  if (!objetivo) return null;
  let mejor = null;
  for (const p of catalogo) {
    if (!p.imagen) continue;
    const base = nombreBase(p.nombre);
    let score = 0;
    if (base === objetivo) score = 0.95;
    else if (norm(p.nombre) === norm(variedad.nombre)) score = 0.95;
    if (score && (!mejor || score > mejor.score)) mejor = { ...p, score };
  }
  return mejor;
}

async function sbAll(path) {
  const out = [];
  for (let o = 0; ; o += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}&limit=1000&offset=${o}`, { headers: H });
    const j = await r.json(); if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 300));
    out.push(...j); if (j.length < 1000) break;
  }
  return out;
}

// — Criadores a procesar —
let criadores;
const breeders = await sbAll('breeders?select=id,breeder_name,website&order=id.asc');
const sinFoto = await sbAll('variedades?select=id,nombre,breeder_id&image_url=is.null&nombre=not.is.null&order=id.asc');
const porBreeder = new Map();
for (const v of sinFoto) (porBreeder.get(v.breeder_id) || porBreeder.set(v.breeder_id, []).get(v.breeder_id)).push(v);
const scrapeable = (b) => b.website && /^https?:\/\//.test(b.website) && !/instagram\.com|facebook\.com|linktr\.ee|youtube\.com|tiktok\.com/i.test(b.website);
if (BREEDER) criadores = breeders.filter((b) => norm(b.breeder_name).includes(norm(BREEDER)) && scrapeable(b));
else criadores = breeders.filter(scrapeable).map((b) => ({ ...b, n: (porBreeder.get(b.id) || []).length })).sort((a, b) => b.n - a.n).slice(0, TOP || 5);

console.log(`▸ ${criadores.length} criadores${GUARDAR ? '' : ' · SOLO PRUEBA, no se guarda nada'} (score mínimo ${MIN_SCORE})`);
const candidatas = [];
for (const b of criadores) {
  const pendientes = porBreeder.get(b.id) || [];
  if (!pendientes.length) continue;
  const origin = new URL(b.website).origin;
  let cat = null, plataforma = null;
  try {
    if (await permitido(origin, '/wp-json/')) { cat = await catalogoWoo(origin); if (cat) plataforma = 'WooCommerce'; }
    if (!cat && await permitido(origin, '/products.json')) { cat = await catalogoShopify(origin); if (cat) plataforma = 'Shopify'; }
  } catch (e) { console.log(`  ✗ ${b.breeder_name}: ${e.message}`); continue; }
  if (!cat) { console.log(`  – ${b.breeder_name} (${origin}): sin API de catálogo accesible (o robots.txt lo impide)`); continue; }
  let n = 0;
  for (const v of pendientes) {
    const m = casar(v, cat);
    if (!m || m.score < MIN_SCORE) continue;
    n++;
    candidatas.push({
      variedad_id: v.id, origen: 'candidata', estado: 'pendiente', source_url: m.imagen, landing_url: m.url,
      source_domain: new URL(origin).hostname, licencia: 'permiso-criador', autor: b.breeder_name, nota_permiso: NOTA, score: m.score,
    });
    if (n <= 3) console.log(`     #${v.id} ${v.nombre} ← "${m.nombre}"  ${m.url}`);
  }
  console.log(`  ✓ ${b.breeder_name} (${plataforma}, ${cat.length} productos): ${n}/${pendientes.length} variedades sin foto con candidata`);
}
console.log(`\nResumen: ${candidatas.length} candidatas`);
if (GUARDAR && candidatas.length) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/variedad_fotos?on_conflict=variedad_id,source_url`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(candidatas),
  });
  if (!r.ok) { console.error('✗ No se pudo guardar:', r.status, (await r.text()).slice(0, 300)); process.exit(1); }
  console.log(`✓ ${candidatas.length} candidatas guardadas como 'pendiente' en variedad_fotos`);
}
