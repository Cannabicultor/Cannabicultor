// Buscador de FOTOS CANDIDATAS para variedades sin foto. NO publica nada: solo localiza imágenes con
// licencia abierta y las guarda (con --guardar) como estado 'pendiente' en variedad_fotos, a la espera
// de aprobación humana en el panel. Nunca se hotlinkea: al aprobar, el Worker descarga la imagen,
// la optimiza y la sirve desde el bucket propio con su crédito.
//
// Fuente actual: Openverse (https://openverse.org, API pública sin clave) filtrada a licencias que
// permiten uso comercial (cc0, by, by-sa…). Aviso de rendimiento: solo hay fotos de variedades muy
// conocidas; para el resto lo habitual será 0 candidatas. Las fuentes con más recorrido (webs de
// los criadores, con su permiso, y las subidas de usuarios) van por otras vías.
//
// Uso (desde el Mac):  cd worker && set -a && . ../.env && set +a
//   node scripts/buscar-fotos-candidatas.mjs --limit=20            # prueba: imprime, no escribe
//   node scripts/buscar-fotos-candidatas.mjs --limit=200 --guardar # inserta en variedad_fotos (requiere sql/variedad_fotos.sql aplicada)
// Flags: --min-score=0.7 (confianza mínima) · --solo-publicadas (prioriza fichas con texto SEO aprobado, por defecto)
//        --todas (incluye fichas sin texto aprobado, que no tienen página todavía)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gfyrsrdnvgnhtsuexjkb.supabase.co';
const { SUPABASE_SERVICE_KEY: K } = process.env;
if (!K) { console.error('Falta SUPABASE_SERVICE_KEY'); process.exit(1); }

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const val = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d; };
const LIMIT = parseInt(val('limit', '20'), 10);
const MIN_SCORE = parseFloat(val('min-score', '0.7'));
const GUARDAR = flag('guardar');
const TODAS = flag('todas');
const UA = 'cannabicultor-photo-finder/0.1 (contacto: cannabicultor@icloud.com)';
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const CANNABIS = /\b(cannabis|marijuana|marihuana|weed|strain|bud|buds|kush|hemp|ganja|indica|sativa|haze)\b/;
const GENERICAS = new Set(['cannabis', 'marijuana', 'marihuana', 'weed', 'strain', 'bud', 'buds', 'flower', 'flowers', 'plant', 'plants', 'hemp', 'by', 'the', 'a', 'of', 'on', 'in', 'desk', 'photo', 'close', 'up', 'jpg', 'jpeg', 'png', 'file', 'with', 'and', 'sativa', 'indica', 'hybrid', 'medical']);
// Palabras que delatan que la imagen no es una planta (ruido típico de coincidencias de nombre)
const RUIDO = /\b(rock|mineral|peridotite|pyroxenite|meteorite|aurora|galaxy|nebula|logo|poster|album|band|concert|painting|car|truck|bike)\b/;

async function sinFoto() {
  const filtro = TODAS ? '' : '&seo_text_status=eq.ok';
  const r = await fetch(`${SUPABASE_URL}/rest/v1/variedades?select=id,nombre,breeder_id&image_url=is.null&nombre=not.is.null${filtro}&order=id.asc&limit=${LIMIT}`, { headers: H });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 300));
  return j;
}

function puntuar(nombre, r) {
  const tokens = norm(nombre).split(' ').filter(Boolean);
  const titulo = norm(r.title);
  const etiquetas = norm((r.tags || []).map((t) => t.name).join(' '));
  const todo = `${titulo} ${etiquetas}`;
  if (RUIDO.test(todo)) return 0;
  const enTitulo = tokens.every((t) => titulo.includes(t));
  const enEtiquetas = tokens.every((t) => todo.includes(t));
  if (!enEtiquetas) return 0;
  let score = enTitulo ? 0.6 : 0.4;
  if (CANNABIS.test(titulo)) score += 0.3; else if (CANNABIS.test(etiquetas)) score += 0.2; else return 0; // sin contexto de cannabis: descartada
  if (r.provider === 'wikimedia') score += 0.1;
  // Palabras de más en el título = probablemente OTRA variedad ("Gorilla" vs "Gorilla Kush") u otra cosa:
  // -0,15 por cada palabra no genérica que sobre (máx. -0,5).
  if (enTitulo) {
    const sobran = titulo.split(' ').filter((w) => w && !tokens.includes(w) && !GENERICAS.has(w) && !/^\d+$/.test(w)).length;
    score -= Math.min(0.5, 0.15 * Math.max(0, sobran - 1));
  }
  return Math.max(0, Math.min(1, score));
}

async function openverse(nombre) {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(nombre + ' cannabis')}&license_type=commercial&page_size=10&mature=false`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
  if (res.status === 429) { const e = new Error('Openverse: límite de peticiones (429). Para y reintenta más tarde'); e.limite = true; throw e; }
  if (!res.ok) throw new Error(`Openverse ${res.status}`);
  return (await res.json()).results || [];
}

const variedades = await sinFoto();
console.log(`▸ Buscando fotos para ${variedades.length} variedades sin foto${TODAS ? '' : ' (con texto SEO aprobado)'}${GUARDAR ? '' : ' · SOLO PRUEBA, no se guarda nada'}`);
const candidatas = [];
let conResultado = 0;
for (const v of variedades) {
  let res;
  try { res = await openverse(v.nombre); } catch (e) { console.error('  ✗', e.message); if (e.limite) break; continue; }
  const buenas = res.map((r) => ({ r, score: puntuar(v.nombre, r) })).filter((x) => x.score >= MIN_SCORE).sort((a, b) => b.score - a.score).slice(0, 2);
  if (buenas.length) conResultado++;
  for (const { r, score } of buenas) {
    candidatas.push({
      variedad_id: v.id, origen: 'candidata', estado: 'pendiente',
      source_url: r.url, landing_url: r.foreign_landing_url, source_domain: (() => { try { return new URL(r.foreign_landing_url).hostname; } catch { return null; } })(),
      licencia: r.license, licencia_url: r.license_url, autor: r.creator || null, score,
      width: r.width || null, height: r.height || null,
    });
    console.log(`  ✓ #${v.id} ${v.nombre} ← ${r.license} ${r.provider} · score ${score.toFixed(2)} · ${r.foreign_landing_url}`);
  }
  await new Promise((ok) => setTimeout(ok, 3000)); // cortesía con la API pública
}
console.log(`\nResumen: ${conResultado}/${variedades.length} variedades con alguna candidata · ${candidatas.length} candidatas`);

if (GUARDAR && candidatas.length) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/variedad_fotos?on_conflict=variedad_id,source_url`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(candidatas),
  });
  if (!r.ok) { console.error('✗ No se pudo guardar:', r.status, (await r.text()).slice(0, 300)); process.exit(1); }
  console.log(`✓ ${candidatas.length} candidatas guardadas como 'pendiente' en variedad_fotos`);
}
