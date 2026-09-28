// Tests offline de las funciones puras de gen-seo-text.mjs (sin red, salvo
// verificarAdornos, a la que se le stubea fetch — nunca llama a DeepSeek de verdad).
// Uso: node worker/scripts/test-gen-seo-text.mjs
import {
  buildFicha, cifrasVerificadas, decimalesConComa, tieneErroresOrtografia,
  verificarAdornos, esqueletoFrase, esqueletosFrases, crearContadoresFrases,
  algunaFraseSobrerrepetida, registrarEsqueletosFrases, frecuenciaEsqueleto,
  numerosDeTexto, numerosDeFicha, datosCannabinoidesDudosos,
} from './gen-seo-text.mjs';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.log('FAIL:', name); } }

const sinDuplicadas = new Set();

// ── Caso real reportado por Ernie (lote 1): 00 Cheese ──────────────────────
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

// ── Ortografía (lote 2) ─────────────────────────────────────────────────────
check('00 Skunk sin tildes: detecta "genetica"/"floracion"/"dias" sin acentuar', tieneErroresOrtografia('La genetica de 00 Skunk presenta una floracion de 56 dias.'));
check('00 Skunk CON tildes: no dispara falso positivo', !tieneErroresOrtografia('La genética de 00 Skunk presenta una floración de 56 días.'));
check('detecta "produccion"/"terpenico"/"herbaceo"/"seleccion" sin tilde', tieneErroresOrtografia('Su perfil terpenico es herbaceo, fruto de una seleccion cuidada de la produccion.'));
check('decimalesConComa: "18.5" -> "18,5"', decimalesConComa('THC de 18.5% y CBD de 0.5%') === 'THC de 18,5% y CBD de 0,5%');
check('decimalesConComa: no toca puntos finales de frase', decimalesConComa('Tiene 63 días de floración. Es una variedad rápida.') === 'Tiene 63 días de floración. Es una variedad rápida.');

// ── Adornos (lote 2): "queso curado" — verificarAdornos con fetch stubeado ──
const originalFetch = global.fetch;
function stubFetch(content) {
  global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }), text: async () => '' });
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
  stubFetch('```json\n["compacta"]\n```');
  const r = await verificarAdornos({}, 'Es una planta compacta.');
  check('extrae el array aunque venga en fence markdown', r.adornos.length === 1 && r.adornos[0] === 'compacta' && !r.parseFallo);
}
{
  stubFetch('no puedo responder a esto');
  const r = await verificarAdornos({}, 'Texto cualquiera.');
  check('respuesta no parseable -> fail-open (sin adornos) y marca parseFallo', r.adornos.length === 0 && r.parseFallo === true);
}
global.fetch = originalFetch;

// ════════════════════════════════════════════════════════════════════════
// LOTE 3 — caso 1: cifras dudosas (Blue Dream 19/20, no debe mencionar CBD)
// ════════════════════════════════════════════════════════════════════════
{
  const blueDream = { id: 42, nombre: 'Blue Dream', genetica: 'Blueberry x Haze', thc_max: 19, cbd_max: 20, floracion_dias: 63 };
  check('Blue Dream 19/20: se detecta como dudoso (thc>=10 y cbd>=10)', Boolean(datosCannabinoidesDudosos(blueDream)));

  const ficha = buildFicha(blueDream, null, sinDuplicadas);
  check('Blue Dream 19/20: thc_pct NO entra en la ficha que ve el modelo', !('thc_pct' in ficha));
  check('Blue Dream 19/20: cbd_pct NO entra en la ficha que ve el modelo', !('cbd_pct' in ficha));
  check('Blue Dream 19/20: el resto de datos sí entra (genetica, floracion_dias)', ficha.genetica === 'Blueberry x Haze' && ficha.floracion_dias === 63);

  // el texto no debe poder mencionar "19" ni "20" (ni como THC ni como CBD): ya no están en la ficha
  check('un texto que mencione "19%" (ex-THC) ahora se rechaza: ya no está en la ficha', !cifrasVerificadas('Esta Blue Dream tiene un THC de hasta el 19%.', ficha));
  check('un texto que mencione CBD del 20% se rechaza igual', !cifrasVerificadas('Con un CBD de hasta el 20%, destaca por su equilibrio.', ficha));
  // un texto que NO mencione thc/cbd (solo el resto de datos) se acepta con normalidad
  check('un texto sin cifras de cannabinoides (solo floración) se acepta', cifrasVerificadas('Blue Dream tiene una floración de 63 días.', ficha));

  // Casos que NO deben marcarse como dudosos
  const acdc = { nombre: 'ACDC', thc_max: 1, cbd_max: 18 }; // cbd>thc pero el nombre SÍ sugiere CBD
  check('ACDC (cbd>thc pero nombre reconocido como CBD): NO se marca', !datosCannabinoidesDudosos(acdc));
  const normal = { nombre: 'White Widow', thc_max: 20, cbd_max: 1 }; // thc alto, cbd bajo: normal
  check('White Widow (THC 20 / CBD 1): NO se marca', !datosCannabinoidesDudosos(normal));
  const soloThc = { nombre: 'OG Kush', thc_max: 22 }; // sin cbd, nada que comparar
  check('sin CBD registrado: NO se marca (nada que intercambiar)', !datosCannabinoidesDudosos(soloThc));
}

// ════════════════════════════════════════════════════════════════════════
// LOTE 3 — caso 2: esqueleto repetido, detectado en la FRASE 2
// ════════════════════════════════════════════════════════════════════════
{
  const fichaA = buildFicha({ nombre: 'Amnesia Haze', terpenos: 'mirceno, limoneno y cariofileno', sabor: 'cítrico', efecto: 'energético' }, 'Dutch Passion', sinDuplicadas);
  const fichaB = buildFicha({ nombre: 'Lemon Skunk', terpenos: 'limoneno, pineno y humuleno', sabor: 'a limón', efecto: 'eufórico' }, 'Dutch Passion', sinDuplicadas);

  const textoA = 'Amnesia Haze es una sativa muy conocida en Europa. Su perfil terpénico combina mirceno, limoneno y cariofileno, con sabor a cítrico y efecto energético. Es ideal para cultivo en exterior.';
  const textoB = 'Lemon Skunk destaca por su vigor en cultivo. Su perfil terpénico combina limoneno, pineno y humuleno, con sabor a limón y efecto eufórico. Se recomienda para cultivadores con experiencia.';

  const sksA = esqueletosFrases(textoA, fichaA);
  const sksB = esqueletosFrases(textoB, fichaB);

  // la frase 1 (índice 0) es distinta en cada ficha ("Amnesia Haze es una sativa..." vs "Lemon Skunk destaca por...")
  check('frase 1: esqueletos distintos (aperturas distintas)', sksA[0] !== sksB[0]);
  // la frase 2 (índice 1) es la plantilla repetida: una vez enmascarados los terpenos/sabor/efecto propios de cada ficha, debe coincidir
  check('frase 2: mismo esqueleto tras enmascarar terpenos/sabor/efecto ("Su perfil terpénico combina lista, con sabor a lista y efecto lista")', sksA[1] === sksB[1]);
  check('frase 2 enmascarada no conserva los nombres de los terpenos', !sksA[1].includes('mirceno') && !sksA[1].includes('limoneno'));

  // con muy pocos textos registrados, un solo match ya es un % alto (esperado:
  // el umbral es relativo al lote, no un conteo absoluto). Con una base más
  // realista (6 esqueletos ya vistos, todos distintos entre sí y del de B),
  // que B coincida con ninguno de ellos no dispara nada.
  const contadoresLote = crearContadoresFrases();
  const otrosTextos = [
    'Zkittlez sorprende por su color. Es compacta en interior. Requiere poda temprana.',
    'Gorilla Glue impresiona por su resina. Es densa y pegajosa. Necesita buen agarre.',
    'Gelato conquista por su dulzor. Es equilibrada entre indica y sativa. Crece con vigor.',
    'Wedding Cake atrae por su aroma. Es una genética muy solicitada. Florece con fuerza.',
    'Runtz llama la atención por su color. Es una variedad muy fotogénica. Da buena resina.',
    'Gushers destaca por su sabor. Es una cruza reciente y popular. Produce cogollos densos.',
  ].map((t) => esqueletosFrases(t, null));
  for (const sk of otrosTextos) registrarEsqueletosFrases(contadoresLote, sk);
  check('ningún texto de B coincide con esos 6 esqueletos distintos: no dispara', !algunaFraseSobrerrepetida(contadoresLote, sksB, 0.15));

  // 5 de 6 textos del lote comparten la frase 2 (repiten la plantilla) -> supera el 15%
  const contadoresLote2 = crearContadoresFrases();
  for (let i = 0; i < 5; i++) registrarEsqueletosFrases(contadoresLote2, sksA);
  const textoDistinto = 'Zkittlez sorprende por su color. Es una variedad muy compacta en interior. Requiere poda temprana.';
  const sksDistinto = esqueletosFrases(textoDistinto, buildFicha({ nombre: 'Zkittlez' }, null, sinDuplicadas));
  registrarEsqueletosFrases(contadoresLote2, sksDistinto);
  check('5/6 con la misma frase 2 (83%): se detecta como sobrerrepetida', algunaFraseSobrerrepetida(contadoresLote2, sksB, 0.15));
  check('frecuenciaEsqueleto en la posición 2 (índice 1) es la que dispara', frecuenciaEsqueleto(contadoresLote2[1], sksB[1]) > 0.15);
  // pero la frase 1, al ser distinta cada vez, no se dispara por esto
  check('la frase 1 de ese mismo lote NO está sobrerrepetida (todas las aperturas son distintas)', frecuenciaEsqueleto(contadoresLote2[0], sksB[0]) === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
