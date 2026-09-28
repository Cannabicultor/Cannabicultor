// Tests offline de las funciones puras de gen-seo-text.mjs (sin red, salvo
// verificarAdornos, a la que se le stubea fetch — nunca llama a DeepSeek de verdad).
// Uso: node worker/scripts/test-gen-seo-text.mjs
import {
  buildFicha, cifrasVerificadas, decimalesConComa, tieneErroresOrtografia,
  verificarAdornos, esqueleto, nuevoContadorEsqueletos, frecuenciaEsqueleto,
  registrarEsqueleto, numerosDeTexto, numerosDeFicha,
} from './gen-seo-text.mjs';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.log('FAIL:', name); } }

const sinDuplicadas = new Set();

// ── Caso real reportado por Ernie: 00 Cheese ────────────────────────────────
// Antes del fix, numerosDeFicha() solo miraba thc/cbd/floracion/año, así que
// "400", "500" (produccion) y "00" (nombre/breeder) se marcaban como
// inventadas y el texto se rechazaba siempre.
const cheeseFicha = buildFicha(
  { nombre: '00 Cheese', genetica: 'Skunk #1 x Cheese', produccion: '400-500 g/m²', tipo: 'feminizada', floracion_dias: 56, thc_max: 19 },
  '00 Seeds Bank',
  sinDuplicadas,
);

check('00 Cheese: "400-500 g/m²" en produccion se acepta', cifrasVerificadas('La 00 Cheese de 00 Seeds Bank alcanza una producción de 400-500 g/m² con un THC de hasta el 19%.', cheeseFicha));
check('00 Cheese: el "00" del nombre y del breeder no dispara rechazo', cifrasVerificadas('00 Cheese es una variedad feminizada de 00 Seeds Bank con una floración de 56 días.', cheeseFicha));
check('00 Cheese: "Skunk #1" en genetica no dispara rechazo', cifrasVerificadas('Procede del cruce entre Skunk #1 y Cheese, desarrollada por 00 Seeds Bank.', cheeseFicha));
check('THC inventado (35% cuando la ficha dice 19%) se sigue rechazando', !cifrasVerificadas('Esta variedad alcanza un THC de hasta el 35%.', cheeseFicha));
check('año inventado se sigue rechazando (no está en ningún campo de texto)', !cifrasVerificadas('Lanzada en 1998 por 00 Seeds Bank.', cheeseFicha));

// ── numerosDeTexto / numerosDeFicha básicos ─────────────────────────────────
check('numerosDeTexto extrae enteros y decimales, coma->punto', JSON.stringify(numerosDeTexto('THC 18,5% y 20 semanas')) === JSON.stringify(['18.5', '20']));
check('numerosDeFicha deriva semanas de floracion_dias', numerosDeFicha(buildFicha({ floracion_dias: 63 }, null, sinDuplicadas)).has('9'));

// ════════════════════════════════════════════════════════════════════════
// 1) ORTOGRAFÍA — caso "00 Skunk sin tildes"
// ════════════════════════════════════════════════════════════════════════
check('00 Skunk sin tildes: detecta "genetica"/"floracion"/"dias" sin acentuar', tieneErroresOrtografia('La genetica de 00 Skunk presenta una floracion de 56 dias.'));
check('00 Skunk CON tildes: no dispara falso positivo', !tieneErroresOrtografia('La genética de 00 Skunk presenta una floración de 56 días.'));
check('detecta "produccion"/"terpenico"/"herbaceo"/"seleccion" sin tilde', tieneErroresOrtografia('Su perfil terpenico es herbaceo, fruto de una seleccion cuidada de la produccion.'));
check('decimalesConComa: "18.5" -> "18,5"', decimalesConComa('THC de 18.5% y CBD de 0.5%') === 'THC de 18,5% y CBD de 0,5%');
check('decimalesConComa: no toca puntos finales de frase', decimalesConComa('Tiene 63 días de floración. Es una variedad rápida.') === 'Tiene 63 días de floración. Es una variedad rápida.');

// ════════════════════════════════════════════════════════════════════════
// 2) ADORNOS — caso "queso curado" (verificarAdornos, con fetch stubeado)
// ════════════════════════════════════════════════════════════════════════
const originalFetch = global.fetch;
function stubFetch(content) {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => '',
  });
}

{
  stubFetch('["queso curado"]');
  const fichaQueso = buildFicha({ nombre: 'Cheese', genetica: 'Skunk #1 x Cheese', sabor: 'Queso' }, null, sinDuplicadas);
  const r = await verificarAdornos(fichaQueso, 'Esta variedad tiene un marcado sabor a queso curado.');
  check('"queso curado" no respaldado (la ficha solo dice "Queso"): se detecta', r.adornos.length === 1 && r.adornos[0] === 'queso curado' && !r.parseFallo);
}
{
  stubFetch('[]');
  const r = await verificarAdornos({ sabor: 'Queso' }, 'Esta variedad tiene sabor a queso.');
  check('sin adornos -> array vacío', r.adornos.length === 0 && !r.parseFallo);
}
{
  // robustez: el modelo a veces envuelve el JSON en fences markdown
  stubFetch('```json\n["compacta"]\n```');
  const r = await verificarAdornos({}, 'Es una planta compacta.');
  check('extrae el array aunque venga en fence markdown', r.adornos.length === 1 && r.adornos[0] === 'compacta' && !r.parseFallo);
}
{
  // fail-open: respuesta no parseable no debe tumbar el lote entero (la lección del bug de numerosDeFicha)
  stubFetch('no puedo responder a esto');
  const r = await verificarAdornos({}, 'Texto cualquiera.');
  check('respuesta no parseable -> fail-open (sin adornos) y marca parseFallo', r.adornos.length === 0 && r.parseFallo === true);
}
global.fetch = originalFetch;

// ════════════════════════════════════════════════════════════════════════
// 3) ESQUELETO REPETIDO
// ════════════════════════════════════════════════════════════════════════
{
  const a = esqueleto('Con 63 días de floración y una producción generosa en interior.');
  const b = esqueleto('Con 56 días de floración y una producción discreta en exterior.');
  check('mismo patrón inicial con números distintos -> mismo esqueleto', a === b);

  const c = esqueleto('00 Cheese es una variedad feminizada de origen británico muy popular.');
  check('apertura distinta -> esqueleto distinto', a !== c);

  const contador = nuevoContadorEsqueletos();
  check('contador vacío: frecuencia 0 (nunca bloquea el primer texto)', frecuenciaEsqueleto(contador, a) === 0);

  // 5 de 6 primeros textos del lote con el mismo esqueleto -> supera el 15%
  for (let i = 0; i < 5; i++) registrarEsqueleto(contador, a);
  registrarEsqueleto(contador, c);
  check('5/6 repetidos (83%) supera el umbral del 15%', frecuenciaEsqueleto(contador, a) > 0.15);
  check('el esqueleto distinto (1/6, 17%) también se evalúa correctamente', frecuenciaEsqueleto(contador, c) === 1 / 6);

  const contador2 = nuevoContadorEsqueletos();
  registrarEsqueleto(contador2, a);
  for (let i = 0; i < 10; i++) registrarEsqueleto(contador2, c);
  check('1/11 (~9%) NO supera el umbral del 15%', frecuenciaEsqueleto(contador2, a) <= 0.15);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
