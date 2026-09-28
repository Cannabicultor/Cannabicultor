// Genera seo_description_text para fichas de variedades con suficientes datos
// propios (evita contenido duplicado/thin). Un párrafo de 50-70 palabras con
// DeepSeek, SOLO a partir de los datos de la ficha — nunca inventa cifras,
// premios ni genética. Publica en lotes de 500 con verificación automática
// (cifras + similitud + ortografía + adornos no soportados) y todo es
// reversible por lote.
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
//
// Si `descripcion` de la ficha es idéntica a la de otra(s) ficha(s) (plantilla/
// boilerplate scrapeado), NO se pasa como notas_existentes al prompt: solo se
// usa cuando es un texto único de esa variedad.
//
// Verificaciones sobre el texto generado (aparte de las cifras):
//   - Ortografía: tildes obligatorias en un puñado de palabras que DeepSeek
//     tiende a escribir sin ellas. Los decimales se normalizan a coma en
//     post-proceso (no depende del modelo).
//   - Adornos: una segunda llamada a DeepSeek (temperature 0, barata) lista
//     afirmaciones del texto que no están literalmente en la ficha.
//   - Esqueleto repetido: si las primeras 6 palabras (con los números
//     enmascarados) ya son la apertura de >15% de los textos de este lote o
//     de este breeder, se regenera con otra apertura (no se rechaza por
//     esto).
// Cualquiera de similitud / ortografía / adornos / esqueleto dispara COMO
// MUCHO una regeneración (con otra apertura); si persiste algo que no sea el
// esqueleto, se rechaza. Las cifras inventadas rechazan directamente, sin
// regenerar (ese fallo no lo arregla probar otra apertura).

import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { countSenales } from './seo-signals.mjs';

// Se ejecuta como script (node gen-seo-text.mjs ...) vs se importa (tests): las
// comprobaciones de secrets y el arranque de main() solo aplican al primer caso.
const ES_ENTRYPOINT = process.argv[1] === fileURLToPath(import.meta.url);

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
const ESQUELETO_MAX = 0.15;
const WORDS_MIN = 50, WORDS_MAX = 70;

if (ES_ENTRYPOINT && !SB_KEY) { console.error('Falta SUPABASE_SERVICE_KEY'); process.exit(1); }
if (ES_ENTRYPOINT && !DRY_RUN && !DEEPSEEK_API_KEY) { console.error('Falta DEEPSEEK_API_KEY (o usa --dry-run)'); process.exit(1); }

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

const CAMPOS = 'id,breeder_id,nombre,tipo,tipo_semilla,thc_pct,thc_max,cbd_pct,cbd_max,terpenos,aromas,efecto,efectos,sabor,sabores,floracion_dias,produccion,altura,genetica,descripcion,es_landrace,origen_geografico,anio_lanzamiento,indexable,slug';

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

// `descripcion` repetida en más de una ficha (mismo texto): son plantillas/boilerplate
// scrapeado, no un dato fiable de ESTA variedad, así que no se pasa como notas_existentes
// al prompt (evita que DeepSeek "aprenda" el mismo texto genérico en muchas fichas).
async function cargarDescripcionesDuplicadas() {
  const counts = new Map();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const page = await sb(`variedades?select=descripcion&descripcion=not.is.null&order=id.asc&limit=${pageSize}&offset=${from}`);
    for (const { descripcion } of page) {
      const d = descripcion.trim();
      if (!d) continue;
      counts.set(d, (counts.get(d) || 0) + 1);
    }
    if (page.length < pageSize) break;
  }
  const dup = new Set();
  for (const [d, n] of counts) if (n > 1) dup.add(d);
  return dup;
}

// ── Ficha que ve el modelo (misma fuente para el prompt y para las cifras permitidas) ──
function buildFicha(v, breeder, descripcionesDuplicadas) {
  const descUnica = v.descripcion && !descripcionesDuplicadas.has(v.descripcion.trim());
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
    // Solo si es de ESTA variedad: si el mismo texto aparece en otras fichas es
    // boilerplate/plantilla, no un dato fiable de "notas_existentes".
    notas_existentes: descUnica ? v.descripcion.slice(0, 500) : undefined,
  };
  Object.keys(ficha).forEach((k) => ficha[k] === undefined && delete ficha[k]);
  return ficha;
}

// ── Prompt DeepSeek ─────────────────────────────────────────────────────────
// Varía la instrucción de apertura entre llamadas para no producir textos que
// empiecen todos igual (ayuda también a bajar la similitud Jaccard y a que no
// se repita el mismo "esqueleto" de primeras palabras dentro del lote).
const ABERTURAS = [
  'Empieza la primera frase nombrando el tipo de planta o su origen genético, NO el nombre de la variedad.',
  'Empieza la primera frase con un dato de cultivo (floración, producción o altura) si lo hay, NO el nombre de la variedad, pero evita la construcción "Con [floración] días de floración y una producción de..."; busca otra forma gramatical de presentarlo.',
  'Empieza la primera frase con el nombre de la variedad seguido directamente de su rasgo más distintivo.',
  'Empieza la primera frase con una pregunta breve dirigida al cultivador, y responde el resto del párrafo con los datos.',
  'Empieza la primera frase mencionando el criador (breeder) si se conoce, y qué representa esta genética en su catálogo.',
  'Empieza la primera frase describiendo el perfil aromático o terpénico si consta en la ficha.',
  'Empieza la primera frase por el tipo de semilla (autofloreciente, feminizada o regular) y lo que implica para el cultivo.',
  'Empieza la primera frase señalando la predominancia genética (índica, sativa o híbrida) si se puede deducir del cruce.',
  'Empieza la primera frase con el linaje o cruce genético, sin nombrar antes la variedad.',
  'Empieza la primera frase con un tono de ficha técnica impersonal (p. ej. "Variedad desarrollada por…", "Genética procedente de…").',
  'Empieza la primera frase con el sabor o el efecto si constan literalmente en la ficha.',
  'Empieza la primera frase con la altura o el porte de la planta si consta en la ficha.',
  'Empieza la primera frase con el año de lanzamiento o el origen geográfico si constan en la ficha.',
];

function buildPrompt(ficha, aberturaIdx) {
  const system = `Eres un redactor técnico de cannabis para Cannabicultor, un medio español especializado en cultivo. Escribes en español de España, con tono experto y directo, sin superlativos vacíos ni emojis. Usas EXCLUSIVAMENTE los datos que te dan en el JSON de la ficha: si un dato no aparece, no lo mencionas, no lo inventas y no lo estimas. Prohibido inventar cifras (THC, CBD, floración, año, premios) o genética que no esté en la ficha. Escribe con ortografía española correcta, incluidas todas las tildes (genética, floración, producción, días, selección, terpénico, herbáceo…), aunque los datos del JSON vengan sin ellas. Los decimales se escriben con coma (19,5%), nunca con punto. No añadas calificativos, sabores, aromas ni efectos que no estén literalmente en la ficha: si dice "Queso", no escribas "queso curado"; no digas "compacta", "vigorosa", "tropical" ni cualidades parecidas salvo que consten tal cual en el JSON.`;
  const user = `Ficha de la variedad (JSON):
${JSON.stringify(ficha, null, 2)}

Escribe UN SOLO párrafo de ${WORDS_MIN} a ${WORDS_MAX} palabras para la página de esta variedad, en español de España, tono experto. ${ABERTURAS[aberturaIdx % ABERTURAS.length]} Usa solo los datos del JSON de arriba; no menciones ningún dato que no esté ahí. No uses comillas ni markdown. Devuelve solo el párrafo, sin explicaciones ni prefijos.`;
  return { system, user };
}

async function callDeepSeek(system, user, { temperature = 0.7, maxTokens = 300 } = {}) {
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('DeepSeek: respuesta vacía');
  return text;
}

async function generarTexto(system, user) {
  const text = await callDeepSeek(system, user);
  return text.replace(/^["“]|["”]$/g, '').trim();
}

// ── Post-proceso: decimales con punto -> con coma (español) ────────────────
// Solo cuando hay dígito a ambos lados del punto, así no toca puntos finales
// de frase ("...63 días. Es ideal...") ni abreviaturas.
function decimalesConComa(texto) {
  return texto.replace(/(\d+)\.(\d+)/g, '$1,$2');
}

// ── Verificación: cifras del texto deben existir en la ficha ───────────────
function numerosDeTexto(texto) {
  return [...texto.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => m[0].replace(',', '.'));
}
// Cifras permitidas: cualquier número que aparezca en el JSON de la ficha que
// ve el modelo (exactamente el mismo objeto que buildPrompt serializa), más
// el redondeo de los decimales y las semanas derivadas de floracion_dias (no
// aparecen como cifra literal en la ficha). Antes solo miraba thc/cbd/
// floracion/año a mano: cualquier cifra en produccion ("400-500 g/m²"),
// nombre ("00 Cheese"), breeder ("00 Seeds Bank") o genetica ("Skunk #1") se
// confundía con una cifra inventada y rechazaba el texto casi siempre.
function numerosDeFicha(ficha) {
  const ns = new Set(numerosDeTexto(JSON.stringify(ficha)));
  for (const n of [...ns]) {
    if (n.includes('.')) ns.add(String(Math.round(Number(n))));
  }
  if (ficha.floracion_dias) ns.add(String(Math.round(ficha.floracion_dias / 7))); // semanas
  return ns;
}
function cifrasVerificadas(texto, ficha) {
  const enFicha = numerosDeFicha(ficha);
  const enTexto = numerosDeTexto(texto);
  return enTexto.every((n) => enFicha.has(n) || enFicha.has(String(Math.round(Number(n)))));
}

// ── Verificación: ortografía (tildes que DeepSeek tiende a comerse) ────────
const PALABRAS_SIN_TILDE = /\b(genetica|floracion|produccion|dias|seleccion|terpenico|herbaceo)\b/i;
function tieneErroresOrtografia(texto) {
  return PALABRAS_SIN_TILDE.test(texto);
}

// ── Verificación: adornos/afirmaciones no respaldadas por la ficha ─────────
// Segunda llamada a DeepSeek, barata (temperature 0, pocos tokens): le pedimos
// que liste lo que el texto añade y la ficha no dice. Si no se puede parsear
// la respuesta lo tratamos como "sin adornos" (fail-open) — más vale una
// afirmación de más colarse alguna vez que repetir el bug de numerosDeFicha,
// donde un fallo de verificación rechazaba el 100% de los textos.
async function verificarAdornos(ficha, texto) {
  const system = 'Comparas un texto sobre una variedad de cannabis con los datos de su ficha. Señalas SOLO afirmaciones del texto (calificativos, sabores, aromas, efectos o cualidades) que NO estén literalmente respaldadas por el JSON de la ficha. Responde EXCLUSIVAMENTE con un array JSON de strings, cada uno una afirmación no respaldada (breve, tal como aparece en el texto); si no hay ninguna, responde exactamente [].';
  const user = `Ficha (JSON):
${JSON.stringify(ficha, null, 2)}

Texto a revisar:
${texto}

Devuelve solo el array JSON, sin explicaciones ni markdown.`;
  let raw;
  try {
    raw = await callDeepSeek(system, user, { temperature: 0, maxTokens: 200 });
  } catch (e) {
    console.error(`  ⚠ verificarAdornos: fallo de red/API, se trata como "sin adornos": ${e.message}`);
    return { adornos: [], parseFallo: true };
  }
  const match = raw.match(/\[[\s\S]*\]/);
  try {
    const arr = JSON.parse(match ? match[0] : raw);
    return { adornos: Array.isArray(arr) ? arr.filter(Boolean).map(String) : [], parseFallo: false };
  } catch {
    console.error(`  ⚠ verificarAdornos: respuesta no parseable, se trata como "sin adornos": ${raw.slice(0, 150)}`);
    return { adornos: [], parseFallo: true };
  }
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

// ── Esqueleto: primeras 6 palabras normalizadas, números enmascarados ──────
// Detecta aperturas repetidas tipo "Con 63 días de floración y una..." /
// "Con 56 días de floración y una..." aunque cambien las cifras.
function esqueleto(texto) {
  return normWords(texto)
    .map((w) => (/^\d+$/.test(w) ? '#' : w))
    .slice(0, 6)
    .join(' ');
}
function nuevoContadorEsqueletos() {
  return { mapa: new Map(), total: 0 };
}
function frecuenciaEsqueleto(contador, sk) {
  if (!contador.total) return 0;
  return (contador.mapa.get(sk) || 0) / contador.total;
}
function registrarEsqueleto(contador, sk) {
  contador.mapa.set(sk, (contador.mapa.get(sk) || 0) + 1);
  contador.total++;
}

async function textosParaComparar(breederId) {
  const [delBreederRows, muestraGlobalRows] = await Promise.all([
    breederId
      ? sb(`variedades?select=seo_description_text&breeder_id=eq.${breederId}&seo_text_status=eq.ok&seo_description_text=not.is.null&limit=200`)
      : Promise.resolve([]),
    sb(`variedades?select=seo_description_text&seo_text_status=eq.ok&seo_description_text=not.is.null&order=id.desc&limit=200`),
  ]);
  const delBreederTextos = delBreederRows.map((r) => r.seo_description_text).filter(Boolean);
  const muestraGlobalTextos = muestraGlobalRows.map((r) => r.seo_description_text).filter(Boolean);
  return { comparar: [...delBreederTextos, ...muestraGlobalTextos], delBreederTextos };
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

  const descripcionesDuplicadas = await cargarDescripcionesDuplicadas();
  console.log(`  descripciones repetidas en >1 ficha (no se pasan como notas_existentes): ${descripcionesDuplicadas.size}`);

  if (DRY_RUN) {
    for (const { v, senales } of lote.slice(0, 3)) {
      const bn = await breederName(v.breeder_id);
      const ficha = buildFicha(v, bn, descripcionesDuplicadas);
      const { system, user } = buildPrompt(ficha, v.id);
      console.log(`\n--- #${v.id} ${v.nombre} (${senales} señales) ---\n${system}\n\n${user}`);
    }
    console.log(`\nDRY RUN: no se ha llamado a DeepSeek ni escrito nada. (${lote.length} candidatas en el lote)`);
    return;
  }

  let yaIndexablesHoy = await nuevasIndexablesHoy();
  let generadas = 0, rechazadas = 0, saltadasPorTope = 0, regeneradas = 0, parseFallosAdornos = 0;
  const similitudes = [];
  const muestra = [];
  const esqueletosLote = nuevoContadorEsqueletos();
  const esqueletosPorBreeder = new Map(); // breeder_id -> contador, sembrado desde sus textos ya publicados

  for (const { v, senales } of lote) {
    try {
      if (v.indexable !== true && yaIndexablesHoy >= MAX_NUEVAS_INDEXABLES_DIA) {
        saltadasPorTope++;
        continue; // deja seo_text_status=null: se recoge en la siguiente corrida/día
      }
      const bn = await breederName(v.breeder_id);
      const ficha = buildFicha(v, bn, descripcionesDuplicadas);
      const { comparar, delBreederTextos } = await textosParaComparar(v.breeder_id);

      let contadorBreeder = esqueletosPorBreeder.get(v.breeder_id);
      if (!contadorBreeder) {
        contadorBreeder = nuevoContadorEsqueletos();
        for (const t of delBreederTextos) registrarEsqueleto(contadorBreeder, esqueleto(t));
        esqueletosPorBreeder.set(v.breeder_id, contadorBreeder);
      }

      let { system, user } = buildPrompt(ficha, v.id);
      let texto = decimalesConComa(await generarTexto(system, user));
      let cifrasOk = cifrasVerificadas(texto, ficha);
      let sim = cifrasOk ? maxSimilitud(texto, comparar) : 0;
      let ortoMal = cifrasOk && tieneErroresOrtografia(texto);
      let sk = esqueleto(texto);
      let skRepetido = cifrasOk && (frecuenciaEsqueleto(esqueletosLote, sk) > ESQUELETO_MAX || frecuenciaEsqueleto(contadorBreeder, sk) > ESQUELETO_MAX);
      let adornosRes = { adornos: [], parseFallo: false };
      if (cifrasOk) {
        adornosRes = await verificarAdornos(ficha, texto);
        if (adornosRes.parseFallo) parseFallosAdornos++;
      }

      if (cifrasOk && (sim > SIM_MAX || ortoMal || adornosRes.adornos.length > 0 || skRepetido)) {
        // como mucho una regeneración, con otra apertura
        regeneradas++;
        ({ system, user } = buildPrompt(ficha, v.id + 1));
        texto = decimalesConComa(await generarTexto(system, user));
        cifrasOk = cifrasVerificadas(texto, ficha);
        sim = cifrasOk ? maxSimilitud(texto, comparar) : 0;
        ortoMal = cifrasOk && tieneErroresOrtografia(texto);
        sk = esqueleto(texto);
        adornosRes = { adornos: [], parseFallo: false };
        if (cifrasOk) {
          adornosRes = await verificarAdornos(ficha, texto);
          if (adornosRes.parseFallo) parseFallosAdornos++;
        }
      }

      const nPalabras = normWords(texto).length;
      const aprobado = cifrasOk && sim <= SIM_MAX && !ortoMal && adornosRes.adornos.length === 0
        && nPalabras >= WORDS_MIN - 10 && nPalabras <= WORDS_MAX + 15;
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
        registrarEsqueleto(esqueletosLote, sk);
        registrarEsqueleto(contadorBreeder, sk);
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
  console.log(`  regeneradas (similitud/ortografía/adornos/esqueleto): ${regeneradas}`);
  console.log(`  saltadas por tope diario (${MAX_NUEVAS_INDEXABLES_DIA} indexables nuevas/día): ${saltadasPorTope}`);
  console.log(`  similitud media (Jaccard shingles-3): ${simMedia.toFixed(3)}`);
  if (parseFallosAdornos) console.log(`  ⚠ verificarAdornos no parseable ${parseFallosAdornos} veces (se trató como "sin adornos" — revisar si se repite)`);
  console.log(`\n  Muestra aleatoria (${muestra.length}):`);
  for (const { v, texto } of muestra) {
    console.log(`  · https://www.cannabicultor.com/variedades/${v.slug || v.id}/`);
    console.log(`    "${texto}"`);
  }
  console.log(`\n  Para deshacer este lote: node scripts/rollback-seo-batch.mjs ${batchId}`);
}

if (ES_ENTRYPOINT) main().catch((e) => { console.error(e); process.exit(1); });

// Exportado para worker/scripts/test-gen-seo-text.mjs (funciones puras, sin red,
// salvo verificarAdornos que sí llama a DeepSeek — los tests le stubean fetch).
export {
  buildFicha, buildPrompt, ABERTURAS,
  numerosDeTexto, numerosDeFicha, cifrasVerificadas,
  decimalesConComa, tieneErroresOrtografia, verificarAdornos,
  esqueleto, nuevoContadorEsqueletos, frecuenciaEsqueleto, registrarEsqueleto,
  normWords, maxSimilitud,
};
