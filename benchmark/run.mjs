#!/usr/bin/env node
// Benchmark de conocimiento cannábico: Cannabicultor (RAG + prompt) vs modelos "desnudos".
//
//   BENCHMARK_API_KEY=... node benchmark/run.mjs            # responde + evalúa todo
//   node benchmark/run.mjs --solo cannabicultor,gpt         # solo algunos concursantes
//   node benchmark/run.mjs --limit 5                        # primeras N preguntas (prueba)
//   node benchmark/run.mjs --rejuzgar                       # vuelve a pasar el juez sin repreguntar
//   node benchmark/run.mjs --banco rag                      # banco de conocimiento propio (preguntas-rag.json)
//
// Es reanudable: guarda cada respuesta/nota en benchmark/resultados/raw.json y no repite lo que ya tiene.
// Al terminar genera benchmark/resultados/informe.html (node benchmark/report.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argVal = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
// --banco rag → preguntas-rag.json y resultados-rag/ (por defecto: preguntas.json y resultados/)
const BANCO = argVal('--banco') || process.env.BENCH_BANCO || '';
process.env.BENCH_BANCO = BANCO;
const SUFIJO = BANCO ? `-${BANCO}` : '';
const OUT_DIR = path.join(DIR, `resultados${SUFIJO}`);
const RAW = path.join(OUT_DIR, 'raw.json');
const BASE = process.env.BENCH_URL || 'https://growers-alliance-ai.nohumanclicks.workers.dev';
const KEY = process.env.BENCHMARK_API_KEY;
if (!KEY) { console.error('Falta BENCHMARK_API_KEY'); process.exit(1); }

const LIMIT = Number(argVal('--limit')) || Infinity;
const SOLO = argVal('--solo')?.split(',');
const REJUZGAR = args.includes('--rejuzgar');
const CONCURRENCIA = Number(argVal('--concurrencia')) || 4;

const config = JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8'));
const { preguntas } = JSON.parse(fs.readFileSync(path.join(DIR, `preguntas${SUFIJO}.json`), 'utf8'));
const concursantes = config.concursantes.filter((c) => (SOLO ? SOLO.includes(c.id) : !c.desactivado));
const lista = preguntas.slice(0, LIMIT);

fs.mkdirSync(OUT_DIR, { recursive: true });
const raw = fs.existsSync(RAW) ? JSON.parse(fs.readFileSync(RAW, 'utf8')) : { respuestas: {}, notas: {} };
const guardar = () => fs.writeFileSync(RAW, JSON.stringify(raw, null, 1));

async function post(ruta, body, intentos = 3) {
  for (let i = 1; ; i++) {
    const t0 = Date.now();
    try {
      const r = await fetch(`${BASE}${ruta}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
      return { ...data, ms: data.ms ?? Date.now() - t0 };
    } catch (e) {
      if (i >= intentos) throw e;
      await new Promise((res) => setTimeout(res, 2000 * i));
    }
  }
}

function textoPregunta(p) {
  return p.tipo === 'mc'
    ? `${p.pregunta}\n\nEmpieza tu respuesta con la letra de la opción correcta (A, B, C o D) y después justifica brevemente.`
    : p.pregunta;
}

async function preguntar(c, p) {
  const messages = [{ role: 'user', content: textoPregunta(p) }];
  if (c.tipo === 'cannabicultor') return post('/benchmark', { messages });
  return post('/benchmark/model', {
    provider: c.provider, model: c.model, messages,
    system: config.system_modelos_base, max_tokens: config.max_tokens ?? 1200,
  });
}

function letraElegida(texto) {
  const t = String(texto || '').replace(/[*_#>`]/g, '').trim();
  const m = t.match(/^\s*(?:respuesta(?: correcta)?\s*[:\-]?\s*)?(?:opci[oó]n\s*)?\(?([ABCD])\)?(?=[\s).:,-]|$)/i)
    || t.match(/(?:respuesta(?: correcta)? es|opci[oó]n correcta es|la correcta es)\s*(?:la\s*)?(?:opci[oó]n\s*)?\(?([ABCD])\)?\b/i);
  return m ? m[1].toUpperCase() : null;
}

const PROMPT_JUEZ = (p, respuesta) => `Eres un evaluador experto en cultivo de cannabis, botánica, química de cannabinoides y legislación española. Evalúas de forma estricta y objetiva la respuesta de un asistente de IA (no sabes qué modelo es).

PREGUNTA:
${p.pregunta}

${p.tipo === 'mc' ? `RESPUESTA CORRECTA: opción ${p.respuesta}` : `PUNTOS CLAVE DE REFERENCIA (una respuesta excelente los cubre; no hace falta el mismo orden ni las mismas palabras):
- ${p.puntos_clave.join('\n- ')}`}
${p.fuente ? `\nFUENTE VERIFICADA DE LA REFERENCIA: ${p.fuente}\nLos datos de referencia salen de esa fuente real. Si el asistente cita esa fuente o da esas cifras, NO es invención. Una respuesta genérica que no aporta los datos concretos de la referencia debe tener cobertura baja; cifras que contradigan la referencia bajan la exactitud.\n` : ''}${p.tipo === 'trampa' ? '\nATENCIÓN: es una pregunta TRAMPA (premisa falsa o entidad inventada). Lo esencial es que NO invente datos y corrija/reconozca la premisa. Si inventa datos concretos, exactitud ≤ 2 y alucinacion = true.' : ''}

RESPUESTA DEL ASISTENTE:
"""
${respuesta}
"""

Puntúa de 0 a 10:
- exactitud: ¿es correcto lo que afirma? Penaliza fuerte los errores técnicos o datos inventados.
- cobertura: ¿cubre los puntos clave de referencia?
- utilidad: ¿es accionable y clara para un cultivador (pasos concretos, cifras correctas, seguridad)?
- alucinacion: true si afirma datos concretos falsos o inventados.
${p.tipo === 'mc' ? '- opcion: letra (A-D) que el asistente elige como respuesta final, o null si no elige ninguna.' : ''}

Devuelve SOLO JSON: {"exactitud":n,"cobertura":n,"utilidad":n,"alucinacion":bool${p.tipo === 'mc' ? ',"opcion":"A"|null' : ''},"comentario":"una frase"}`;

async function juzgar(juez, p, respuesta) {
  const r = await post('/benchmark/model', {
    provider: juez.provider, model: juez.model, max_tokens: 400, temperature: 0,
    messages: [{ role: 'user', content: PROMPT_JUEZ(p, respuesta) }],
  });
  const json = String(r.reply).match(/\{[\s\S]*\}/);
  if (!json) throw new Error(`Juez sin JSON: ${String(r.reply).slice(0, 200)}`);
  return JSON.parse(json[0]);
}

function notaFinal(p, veredictos, respuesta) {
  const vs = veredictos.filter(Boolean);
  const media = (k) => vs.reduce((s, v) => s + Number(v[k] || 0), 0) / (vs.length || 1);
  const alucinacion = vs.filter((v) => v.alucinacion).length > vs.length / 2;
  if (p.tipo === 'mc') {
    const regex = letraElegida(respuesta);
    const votos = vs.map((v) => v.opcion).filter(Boolean);
    const opcion = regex || votos[0] || null;
    return { nota: opcion === p.respuesta ? 10 : 0, opcion, acierto: opcion === p.respuesta, exactitud: media('exactitud'), cobertura: media('cobertura'), utilidad: media('utilidad'), alucinacion };
  }
  // Abiertas y trampas: exactitud pesa más que cobertura o estilo.
  const nota = 0.5 * media('exactitud') + 0.3 * media('cobertura') + 0.2 * media('utilidad');
  return { nota: Math.round(nota * 10) / 10, exactitud: media('exactitud'), cobertura: media('cobertura'), utilidad: media('utilidad'), alucinacion };
}

async function pool(tareas, n) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < tareas.length) await tareas[i++](); }));
}

// 1) Respuestas
const tareasResp = [];
for (const p of lista) for (const c of concursantes) {
  const k = `${c.id}|${p.id}`;
  if (raw.respuestas[k]?.reply) continue;
  tareasResp.push(async () => {
    try {
      const r = await preguntar(c, p);
      raw.respuestas[k] = { reply: r.reply || '', ms: r.ms, provider: r.provider || c.provider, model: r.model || c.model };
      delete raw.notas[k];
      process.stdout.write('.');
    } catch (e) {
      raw.respuestas[k] = { error: String(e.message || e) };
      process.stdout.write('x');
    }
    guardar();
  });
}
console.log(`Preguntando: ${tareasResp.length} llamadas (${concursantes.map((c) => c.id).join(', ')})`);
await pool(tareasResp, CONCURRENCIA);

// 2) Evaluación
const tareasJuez = [];
for (const p of lista) for (const c of concursantes) {
  const k = `${c.id}|${p.id}`;
  const resp = raw.respuestas[k];
  if (!resp?.reply || (raw.notas[k] && !REJUZGAR)) continue;
  tareasJuez.push(async () => {
    try {
      const veredictos = await Promise.all(config.jueces.map((j) => juzgar(j, p, resp.reply).catch((e) => ({ error: String(e.message) }))));
      const validos = veredictos.filter((v) => !v.error);
      if (!validos.length) throw new Error(veredictos.map((v) => v.error).join(' | '));
      raw.notas[k] = { ...notaFinal(p, validos, resp.reply), veredictos };
      process.stdout.write('✓');
    } catch (e) {
      process.stdout.write('!');
      console.error(`\n[${k}] ${e.message}`);
    }
    guardar();
  });
}
console.log(`\nEvaluando: ${tareasJuez.length} respuestas con ${config.jueces.length} jueces`);
await pool(tareasJuez, CONCURRENCIA);

console.log('\nGenerando informe…');
await import('./report.mjs');
