// Genera seo_description_text para fichas de variedades con suficientes datos
// propios (evita contenido duplicado/thin). Un párrafo de 50-70 palabras con
// DeepSeek, SOLO a partir de los datos de la ficha — nunca inventa cifras,
// premios ni genética. Publica en lotes de 500 con verificación automática
// (cifras + similitud) y todo es reversible por lote.
//
// Ejecutar desde el Mac (ver worker/scripts/ingest-legal-aprobado.mjs para el
// mismo patrón: el entorno cloud no tiene salida a DeepSeek/Supabase):
//   cd worker
//   SUPABASE_SERVICE_KEY=... DEEPSEEK_API_KEY=... node scripts/gen-seo-text.mjs --dry-run --limit=10
//   SUPABASE_SERVICE_KEY=... DEEPSEEK_API_KEY=... node scripts/gen-seo-text.mjs
//
// Flags:
//   --limit=N          tope de fichas a procesar en esta corrida (por defecto 500, el tamaño de un lote)
//   --dry-run          no llama a DeepSeek ni escribe nada; muestra qué candidatas elegiría y el prompt de la primera
//   --min-senales=N    señales mínimas para ser candidata (por defecto 6)
//
// Idempotente: solo procesa filas con seo_text_status IS NULL (no reintenta
// 'ok' ni 'rechazado' — para eso está rollback-seo-batch.mjs, que las
// resetea a NULL para regenerarlas).
//
// Salvaguarda diaria: no deja que las fichas indexable=true NUEVAS de HOY
// (sumando lo que ya haya escrito seo_indexable_backup hoy con este script)
// superen MAX_NUEVAS_INDEXABLES_DIA, para no disparar un cambio masivo de
// golpe en Search Console. Si el lote lo superaría, se recorta.

import { randomUUID } from 'node:crypto';
import { countSenales } from './seo-signals.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gfyrsrdnvgnhtsuexjkb.supabase.co';
const { SUPABASE_SERVICE_KEY: SB_KEY, DEEPSEEK_API_KEY } = process.env;

const args = process.argv.slice(2);
const hasFlag = (n) => args.includes(`--${n}`);
const flagVal = (n) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const DRY_RUN = hasFlag('dry-run');
const LIMIT = flagVal('limit') ? parseInt(flagVal('limit'), 10) : 500;
const MIN_SENALES = flagVal('min-senales') ? parseInt(flagVal('min-senales'), 10) : 6;
const BATCH_SIZE = 500;
const MAX_NUEVAS_INDEXABLES_DIA = 1000;
const SIM_MAX = 0.5;
const WORDS_MIN = 50, WORDS_MAX = 70;

if (!SB_KEY) { console.error('Falta SUPABASE_SERVICE_KEY'); process.exit(1); }
if (!DRY_RUN && !DEEPSEEK_API_KEY) { console.error('Falta DEEPSEEK_API_KEY (o usa --dry-run)'); process.exit(1); }

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Supabase ${method} ${path}: ${res.status} ${txt.slice(0, 400)}`);
  return txt ? JSON.parse(txt) : null;
}

const CAMPOS ='id,breeder_id,nombre,tipo,tipo_semilla,thc_pct,thc_max,cbd_pct,cbd_max,terpenos,aromas,efecto,efectos,sabor,sabores,floracion_dias,produccion,altura,genetica,descripcion,es_landrace,origen_geografico,anio_lanzamiento,indexable,slug';

async function fetchCandidatas() {
  // Trae todo lo pendiente (seo_text_status IS NULL) y filtra/ordena por señales en JS:
  // PostgREST no calcula "señales" server-side sin una vista/RPC nueva, y el volumen
  // (miles de filas, pocos KB cada una) es manejable en memoria.
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const page = await sb(
      `variedades?select=${CAMPOS}&seo_text_status=is.null&order=id.asc&limit=${pageSize}&offset=${from}`,
    );
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  const conSenales = rows.map((v) => ({ v, senales: countSenales(v) })).filter((x) => x.senales >= MIN_SENALES);
  conSenales.sort((a, b) => b.senales - a.senales);
  return conSenales;
}

async function breederName(breederId) {
  if (!breederId) return null;
  const [b] = await sb(`breeders?select=breeder_name&id=eq.${breederId}&limit=1`);
  return b?.breeder_name || null;
}

// ── Prompt DeepSeek ─────────────────────────────────────────────────────────
// Varía la instrucción de apertura entre llamadas para no producir textos que
// empiecen todos igual (ayuda también a bajar la similitud Jaccard entre fichas).
const ABERTURAS = [
  'Empieza la primera frase nombrando el tipo de planta o su origen genético, NO el nombre de la variedad.',
  'Empieza la primera frase con un dato de cultivo (floración, producción o altura) si lo hay, NO el nombre de la variedad.',
  'Empieza la primera frase con el nombre de la variedad seguido directamente de su rasgo más distintivo.',
  'Empieza la primera frase con una pregunta breve dirigida al cultivador, y responde el resto del párrafo con los datos.',
  'Empieza la primera frase mencionando el criador (breeder) si se conoce, y qué representa esta genética en su catálogo.',
];

function buildPrompt(v, breeder, aberturaIdx) {
  const ficha = {
    nombre: v.nombre,
    breeder: breeder || undefined,
    tipo_semilla: v.tipo || v.tipo_semilla || undefined,
    genetica: v.genetica || undefined,
    es_landrace: v.es_landrace || undefined,
    origen_geografico: v.origen_geografico || undefined,
    thc_pct: v.thc_max ?? v.thc_pct ?? undefined,
    cbd_pct: v.cbd_max ?? v.cbd_pct ?? undefined,
    floracion_dias: v.floracion_dias || undefined,
    altura: v.altura || undefined,
    produccion: v.produccion || undefined,
    terpenos: v.terpenos || undefined,
    aromas: v.aromas?.length ? v.aromas : undefined,
    sabor: v.sabor || (v.sabores?.length ? v.sabores : undefined),
    efecto: v.efecto || (v.efectos?.length ? v.efectos : undefined),
    anio_lanzamiento: v.anio_lanzamiento || undefined,
    notas_existentes: v.descripcion ? v.descripcion.slice(0, 500) : undefined,
  };
  Object.keys(ficha).forEach((k) => ficha[k] === undefined && delete ficha[k]);

  const system = `Eres un redactor técnico de cannabis para Cannabicultor, un medio español especializado en cultivo. Escribes en español de España, con tono experto y directo, sin superlativos vacíos ni emojis. Usas EXCLUSIVAMENTE los datos que te dan en el JSON de la ficha: si un dato no aparece, no lo mencionas, no lo inventas y no lo estimas. Prohibido inventar cifras (THC, CBD, floración, año, premios) o genética que no esté en la ficha.`;
  const user = `Ficha de la variedad (JSON):
${JSON.stringify(ficha, null, 2)}

Escribe UN SOLO párrafo de ${WORDS_MIN} a ${WORDS_MAX} palabras para la página de esta variedad, en español de España, tono experto. ${ABERTURAS[aberturaIdx % ABERTURAS.length]} Usa solo los datos del JSON de arriba; no menciones ningún dato que no esté ahí. No uses comillas ni markdown. Devuelve solo el párrafo, sin explicaciones ni prefijos.`;
  return { system, user };
}

async function callDeepSeek(system, user) {
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.7,
      max_tokens: 300,
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('DeepSeek: respuesta vacía');
  return text.replace(/^["“]|["”]$/g, '').trim();
}

// ── Verificación: cifras del texto deben existir en la ficha ───────────────
function numerosDeFicha(v) {
  const ns = new Set();
  for (const val of [v.thc_pct, v.thc_max, v.cbd_pct, v.cbd_max, v.floracion_dias, v.anio_lanzamiento]) {
    if (val != null && val !== '') {
      const n = Number(val);
      if (!Number.isNaN(n)) { ns.add(String(n)); ns.add(String(Math.round(n))); }
    }
  }
  if (v.floracion_dias) ns.add(String(Math.round(v.floracion_dias / 7))); // semanas, derivado de un dato real
  return ns;
}
function numerosDeTexto(texto) {
  return [...texto.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => m[0].replace(',', '.'));
}
function cifrasVerificadas(texto, v) {
  const enFicha = numerosDeFicha(v);
  const enTexto = numerosDeTexto(texto);
  return enTexto.every((n) => enFicha.has(n) || enFicha.has(String(Math.round(Number(n)))));
}

// ── Similitud: shingles de 3 palabras (Jaccard) ─────────────────────────────
function normWords(texto) {
  return String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}
function shingles3(texto) {
  const w = normWords(texto);
  const s = new Set();
  for (let i = 0; i <= w.length - 3; i++) s.add(w.slice(i, i + 3).join(' '));
  return s;
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
function maxSimilitud(texto, comparar) {
  const sh = shingles3(texto);
  let max = 0;
  for (const otro of comparar) max = Math.max(max, jaccard(sh, shingles3(otro)));
  return max;
}

async function textosParaComparar(breederId) {
  const [delBreeder, muestraGlobal] = await Promise.all([
    breederId
      ? sb(`variedades?select=seo_description_text&breeder_id=eq.${breederId}&seo_text_status=eq.ok&seo_description_text=not.is.null&limit=200`)
      : Promise.resolve([]),
    sb(`variedades?select=seo_description_text&seo_text_status=eq.ok&seo_description_text=not.is.null&order=id.desc&limit=200`),
  ]);
  return [...delBreeder, ...muestraGlobal].map((r) => r.seo_description_text).filter(Boolean);
}

// ── Salvaguarda: cuántas indexable=true nuevas se han escrito ya hoy ───────
async function nuevasIndexablesHoy() {
  const hoyISO = new Date().toISOString().slice(0, 10) + 'T00:00:00Z';
  const rows = await sb(
    `seo_indexable_backup?select=id&indexable_anterior=eq.false&created_at=gte.${hoyISO}&limit=5000`,
  );
  return rows.length;
}

async function backupYActivarIndexable(variedadId, indexableAnterior, batchId) {
  await sb('seo_indexable_backup', {
    method: 'POST', prefer: 'return=minimal',
    body: [{ variedad_id: variedadId, seo_text_batch: batchId, indexable_anterior: indexableAnterior }],
  });
}

async function main() {
  const batchId = `seo-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
  console.log(`▸ gen-seo-text · lote ${batchId}${DRY_RUN ? ' (DRY RUN)' : ''}`);

  const candidatas = await fetchCandidatas();
  console.log(`  candidatas con >=${MIN_SENALES} señales y sin procesar: ${candidatas.length}`);
  const tope = Math.min(LIMIT, BATCH_SIZE, candidatas.length);
  const lote = candidatas.slice(0, tope);
  console.log(`  procesando este lote: ${lote.length}`);

  if (DRY_RUN) {
    for (const { v, senales } of lote.slice(0, 3)) {
      const bn = await breederName(v.breeder_id);
      const { system, user } = buildPrompt(v, bn, v.id);
      console.log(`\n--- #${v.id} ${v.nombre} (${senales} señales) ---\n${system}\n\n${user}`);
    }
    console.log(`\nDRY RUN: no se ha llamado a DeepSeek ni escrito nada. (${lote.length} candidatas en el lote)`);
    return;
  }

  let yaIndexablesHoy = await nuevasIndexablesHoy();
  let generadas = 0, rechazadas = 0, saltadasPorTope = 0;
  const similitudes = [];
  const muestra = [];

  for (const { v, senales } of lote) {
    try {
      if (v.indexable !== true && yaIndexablesHoy >= MAX_NUEVAS_INDEXABLES_DIA) {
        saltadasPorTope++;
        continue; // deja seo_text_status=null: se recoge en la siguiente corrida/día
      }
      const bn = await breederName(v.breeder_id);
      const comparar = await textosParaComparar(v.breeder_id);

      let { system, user } = buildPrompt(v, bn, v.id);
      let texto = await callDeepSeek(system, user);
      let sim = maxSimilitud(texto, comparar);
      let cifrasOk = cifrasVerificadas(texto, v);

      if (cifrasOk && sim > SIM_MAX) {
        // una regeneración con abertura distinta antes de rechazar por similitud
        ({ system, user } = buildPrompt(v, bn, v.id + 1));
        texto = await callDeepSeek(system, user);
        sim = maxSimilitud(texto, comparar);
        cifrasOk = cifrasVerificadas(texto, v);
      }

      const nPalabras = normWords(texto).length;
      const aprobado = cifrasOk && sim <= SIM_MAX && nPalabras >= WORDS_MIN - 10 && nPalabras <= WORDS_MAX + 15;
      similitudes.push(sim);

      const status = aprobado ? 'ok' : 'rechazado';
      const nuevoIndexable = aprobado && senales >= MIN_SENALES;

      if (v.indexable !== nuevoIndexable) {
        await backupYActivarIndexable(v.id, v.indexable ?? false, batchId);
        if (nuevoIndexable && v.indexable !== true) yaIndexablesHoy++;
      }

      await sb(`variedades?id=eq.${v.id}`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: {
          seo_description_text: texto,
          seo_text_model: 'deepseek-chat',
          seo_text_at: new Date().toISOString(),
          seo_text_status: status,
          seo_text_batch: batchId,
          indexable: nuevoIndexable,
        },
      });

      if (aprobado) {
        generadas++;
        // reservoir sampling: mantiene 10 elementos elegidos uniformemente al azar de todo lo generado
        if (muestra.length < 10) muestra.push({ v, texto });
        else if (Math.random() < 10 / generadas) muestra[Math.floor(Math.random() * 10)] = { v, texto };
      } else {
        rechazadas++;
      }
    } catch (e) {
      console.error(`  ✗ #${v.id} ${v.nombre}: ${e.message}`);
      rechazadas++;
    }
  }

  const simMedia = similitudes.length ? (similitudes.reduce((a, b) => a + b, 0) / similitudes.length) : 0;
  console.log(`\n▸ Lote ${batchId} terminado`);
  console.log(`  generadas (ok): ${generadas}`);
  console.log(`  rechazadas: ${rechazadas}`);
  console.log(`  saltadas por tope diario (${MAX_NUEVAS_INDEXABLES_DIA} indexables nuevas/día): ${saltadasPorTope}`);
  console.log(`  similitud media (Jaccard shingles-3): ${simMedia.toFixed(3)}`);
  console.log(`\n  Muestra aleatoria (${muestra.length}):`);
  for (const { v, texto } of muestra) {
    console.log(`  · https://www.cannabicultor.com/variedades/${v.slug || v.id}/`);
    console.log(`    "${texto}"`);
  }
  console.log(`\n  Para deshacer este lote: node scripts/rollback-seo-batch.mjs ${batchId}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
