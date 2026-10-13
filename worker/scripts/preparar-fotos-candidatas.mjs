// Prepara las fotos CANDIDATAS descargándolas desde tu Mac y dejándolas en el bucket PRIVADO `variedades-pendientes`.
// Por qué: algunos criadores (p. ej. Karma Genetics) responden con una página de protección cuando la descarga la
// hace el Worker de Cloudflare ("El archivo no es una imagen válida"), pero sirven la imagen normal a tu Mac.
// Con la copia ya en el bucket privado (variedad_fotos.storage_path), el dashboard aprueba SIN descargar nada del origen.
// No publica nada: la foto sigue 'pendiente' hasta que la apruebas en el dashboard.
//
// Uso (desde el Mac):  cd worker && set -a && . ../.env && set +a
//   node scripts/preparar-fotos-candidatas.mjs                       # SIMULACIÓN: prueba la descarga de todas las pendientes sin copia
//   node scripts/preparar-fotos-candidatas.mjs --aplicar             # sube las copias y rellena storage_path
//   node scripts/preparar-fotos-candidatas.mjs --aplicar --solo=karmagenetics.com   # solo las de un dominio
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gfyrsrdnvgnhtsuexjkb.supabase.co';
const { SUPABASE_SERVICE_KEY: K } = process.env;
if (!K) { console.error('Falta SUPABASE_SERVICE_KEY'); process.exit(1); }
const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const SOLO = (args.find((a) => a.startsWith('--solo=')) || '').slice(7);
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };
const MAX = 8_000_000;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function mime(u) {
  if (u.length > 12 && u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) return 'image/jpeg';
  if (u.length > 12 && u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47) return 'image/png';
  if (u.length > 12 && String.fromCharCode(...u.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...u.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}
async function sha256(b) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join(''); }

const filas = [];
for (let o = 0; ; o += 1000) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/variedad_fotos?estado=eq.pendiente&origen=eq.candidata&storage_path=is.null&select=id,variedad_id,source_url&order=id.asc&limit=1000&offset=${o}`, { headers: H });
  const j = await r.json(); if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 300));
  filas.push(...j); if (j.length < 1000) break;
}
const lista = SOLO ? filas.filter((f) => f.source_url.includes(SOLO)) : filas;
console.log(`▸ ${lista.length} candidatas pendientes sin copia${SOLO ? ` (dominio ${SOLO})` : ''}${APLICAR ? '' : ' · SIMULACIÓN, no se sube nada'}`);

const res = { ok: 0, fallos: 0 }; const motivos = {}; let i = 0;
async function una(f) {
  try {
    const r = await fetch(f.source_url, { headers: { 'User-Agent': 'cannabicultor-photo-finder/0.1 (+https://www.cannabicultor.com)' }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`descarga HTTP ${r.status}`);
    const b = new Uint8Array(await r.arrayBuffer());
    const m = mime(b); if (!m) throw new Error('no es jpg/png/webp válido');
    if (b.length > MAX) throw new Error('más de 8 MB');
    if (APLICAR) {
      const hash = await sha256(b); const ruta = `c${f.variedad_id}/${hash}.${EXT[m]}`;
      const up = await fetch(`${SUPABASE_URL}/storage/v1/object/variedades-pendientes/${ruta}`, { method: 'POST', headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': m, 'x-upsert': 'true' }, body: b });
      if (!up.ok) throw new Error(`storage ${up.status} ${(await up.text()).slice(0, 80)}`);
      const pa = await fetch(`${SUPABASE_URL}/rest/v1/variedad_fotos?id=eq.${f.id}&estado=eq.pendiente`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ storage_path: ruta, sha256: hash }) });
      if (!pa.ok) throw new Error(`guardar fila ${pa.status} ${(await pa.text()).slice(0, 80)}`);
    }
    res.ok++;
  } catch (e) { res.fallos++; motivos[e.message] = (motivos[e.message] || 0) + 1; }
}
async function w() { while (i < lista.length) await una(lista[i++]); }
await Promise.all(Array.from({ length: 4 }, w));
console.log(`${APLICAR ? '✓ preparadas' : 'descargables'}: ${res.ok} · con fallo: ${res.fallos}`);
for (const [m, n] of Object.entries(motivos)) console.log(`   ${n} × ${m}`);
if (!APLICAR) console.log('Nada subido. Añade --aplicar para preparar las copias.');
