// Tests offline de las funciones puras de gen-seo-text.mjs (sin red, salvo
// verificarAdornos, a la que se le stubea fetch — nunca llama a DeepSeek de verdad).
// Uso: node worker/scripts/test-gen-seo-text.mjs
import {
  buildFicha, cifrasVerificadas, decimalesConComa, tieneErroresOrtografia,
  verificarAdornos, esqueletoFrase, esqueletosFrases, crearContadoresFrases,
  algunaFraseSobrerrepetida, registrarEsqueletosFrases, frecuenciaEsqueleto,
  numerosDeTexto, numerosDeFicha, datosCannabinoidesDudosos,
  valorSaborEfectoValido, geneticaValida, terpenosEnEspanol, sinPorcentajes, saborEnEspanol, efectoEnEspanol, nivelEnEspanol,
} from './gen-seo-text.mjs';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.log('FAIL:', name); } }

const sinDuplicadas = new Set();

// ── Filtro de sabor/efecto: basura de scraping vs listas válidas ───────────
for (const ok of ['Citrus, Pine, Lemon', 'Lime, Citrus, Tree fruit, Lemon, Orange', 'relaxed, happy', 'energetic', 'Queso', 'cítrico', 'limón', 'Chem Gas, Earthy, Skunk']) {
  check(`sabor/efecto válido: "${ok}"`, valorSaborEfectoValido(ok));
}
for (const mal of ['and no wonder', 'times magazine', 'and flavor', 'Very intense', 'of Kush? Either way this cross has it all!', 'Buds / Leaves The ratio of buds to leaves is very good',
  'Natural, oldschool mexican sativa, citrusy woodsyEffect: Happy, laughing', 'Chem Gas, Earthy, SkunkSexual Stability: Minimal', 'with heavy full-body effects that will impress any veteran consumer',
  'Times Cannabis Cup 2010 Sativa 3rd Place', '', null, 42]) {
  check(`sabor/efecto descartado: "${mal}"`, !valorSaborEfectoValido(mal));
}
const fichaFiltrada = buildFicha({ nombre: 'X', sabor: 'and no wonder', sabores: ['Citrus', 'times magazine', 'Pine'], efecto: 'times magazine' }, null, new Set());
check('buildFicha: sabor basura cae a sabores[] filtrado', fichaFiltrada.sabor === 'cítrico, pino');
check('buildFicha: efecto basura sin alternativa se omite', !('efecto' in fichaFiltrada));

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
  const fichaB = buildFicha({ nombre: 'Lemon Skunk', terpenos: 'limoneno, pineno y humuleno', sabor: 'limón', efecto: 'eufórico' }, 'Dutch Passion', sinDuplicadas);

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

// ── Terpenos en español y calificativos prohibidos ─────────────────────────
check('terpenos: traduce nombres y conserva porcentajes', terpenosEnEspanol('myrcene (49.0%), Pinene (36.7%), caryophyllene oxide (1%), linalool (7.9%)') === 'mirceno (49.0%), pineno (36.7%), óxido de cariofileno (1%), linalool (7.9%)');
check('buildFicha: terpenos en español', buildFicha({ nombre: 'X', terpenos: 'limonene (10%), humulene (5%)' }, null, new Set()).terpenos === 'limoneno, humuleno');
check('estilo: terpeno en inglés se detecta', tieneErroresOrtografia('Destaca por su limonene.', {}));
check('estilo: "potente" inventado se detecta', tieneErroresOrtografia('¿Buscas una feminizada de cruce potente?', { nombre: 'Chocolope' }));
check('estilo: "potente" literal en la ficha se tolera', !tieneErroresOrtografia('Cruce potente.', { descripcion: 'cruce potente' }));
check('estilo: texto limpio pasa', !tieneErroresOrtografia('Variedad feminizada con 63 días de floración y mirceno.', {}));

check('sinPorcentajes quita (xx.x%)', sinPorcentajes('mirceno (49.0%), pineno (0,07%), linalool') === 'mirceno, pineno, linalool');
check('sabor EN→ES con descarte de desconocidos', saborEnEspanol('Earthy, Pine, seeds co, zzz') === 'terroso, pino');
check('sabor ya en español pasa', saborEnEspanol('dulce, cítrico') === 'dulce, cítrico');
check('sabor sin ningún token conocido → undefined', saborEnEspanol('seeds co, final yield') === undefined);
check('efecto EN→ES', efectoEnEspanol('energetic, creative, giggly') === 'energético, creativo, risueño');
check('efecto descarta basura y couch-lock', efectoEnEspanol('thc content, couch-lock') === undefined);
check('altura tall → alta', nivelEnEspanol('Tall') === 'alta');
check('producción high → alta; media se mantiene', nivelEnEspanol('high') === 'alta' && nivelEnEspanol('media') === 'media');
check('rango con cifras se conserva', nivelEnEspanol('450-500 g/m²') === '450-500 g/m²');
check('palabra suelta desconocida se descarta', nivelEnEspanol('enorme') === undefined);
check('buildFicha: altura/producción/efecto en español', (() => { const f = buildFicha({ nombre: 'X', altura: 'Tall', produccion: 'High', efecto: 'energetic, creative' }, null, new Set()); return f.altura === 'alta' && f.produccion === 'alta' && f.efecto === 'energético, creativo'; })());

for (const ok of ['Durban x RS11', 'Gelato #45 x Gelato #45', '24k Gold x LSP', '[G13 x Black Widow] x Firecracker', 'Old Time Moonshine x Cinderella 99', '818 SFV OG x Hashplant', 'AK47 x Unknown Ruderalis', 'Blueberry Cookies x Georgia Pie', 'Skunk #1 x Cheese', 'Chocolate Thai x Cannalope']) {
  check(`genética válida: "${ok}"`, geneticaValida(ok));
}
for (const mal of ['ockout. The Citrus Knockout #5 was Juggernaut x Lemon Skunk', 'Basic infosACDC x ACDC 78  is an unknown fromGreen Bodhiand', 'Gelato 33 x Sorbet Flowering time', '600 gr x m2 Outdoor Production',
  'Original Bubble Gum x Ruderalis Indoor yield 350 gr / m2 Outdoor pro', 'Ruderalis x AmnesiaDo you find mistakes or wrong informati', 'Las Vegas Lemon Skunk x Unknown Skunk Las Vegas Lemon Skunk Unknown Sk',
  'e Seeds Bank DescriptionEs un cruce de Amnesia x Hash Plant Haze', 'Boss Banner - Bruce Banner x Sour Strawberry loving this Boss Banner taste', 'a very long phrase without any cross at all here', 'Sunset Sherbet x Thin Mint Cookies Sunset Sherbet', 'Outlaw Gorilla Grape x Cinderella 99Filial Generation', 'Dirty Bitch x Pineapple Madness #16Genotype', 'Amnesia XXL Auto x Auto CBD Complete life cycle', 'Tropical Smoothie x Bacio Gelato Indica Growth Height', 'Crescendo RBX1 x Fatso Made by crossing Ethos Crescendo RBX1', 'Afghan Mutant Pheno x Frost Berry Blast Indica / Sativa', '', null]) {
  check(`genética descartada: "${mal}"`, !geneticaValida(mal));
}
check('buildFicha: notas boilerplate de SeedFinder no se pasan', !('notas_existentes' in buildFicha({ nombre: 'X', descripcion: 'Independent, standardized information about Foo cannabis-strain X! Find phenotypes' }, 'Foo', new Set())));
check('buildFicha: notas propias sí se pasan', 'notas_existentes' in buildFicha({ nombre: 'X', descripcion: 'Una descripción propia y única de esta variedad.' }, 'Foo', new Set()));
check('buildFicha: genética rota se omite', !('genetica' in buildFicha({ nombre: 'X', genetica: 'Gelato 33 x Sorbet Flowering time' }, null, new Set())));

check('relleno: "orientada a cultivadores que buscan" se detecta', tieneErroresOrtografia('Es una incorporación al catálogo de la casa, orientada a cultivadores que buscan un ciclo definido.', {}));
check('relleno: "El cultivador dispone así" se detecta', tieneErroresOrtografia('El cultivador dispone así de una genética con esos componentes.', {}));
check('relleno: texto con solo datos pasa', !tieneErroresOrtografia('Florece en 63 días y alcanza un 18% de THC. Terpenos: mirceno y pineno.', {}));

const fCho = { nombre: 'Chocolope', breeder: 'DNA Genetics Seeds', tipo_semilla: 'feminizada', genetica: 'Chocolate Thai x Cannalope', thc_pct: 23, floracion_dias: 63, terpenos: 'limoneno, mirceno' };
check('frase vacía: "Esta combinación genética define una variedad…" se detecta', tieneErroresOrtografia('Chocolope florece en 63 días con 23% de THC. Esta combinación define una variedad con esos parámetros.', fCho));
check('cifra repetida en dos frases se detecta', tieneErroresOrtografia('Chocolope florece en 63 días. El ciclo de floración se completa en 63 días.', fCho));
check('frases con datos distintos pasan', !tieneErroresOrtografia('Chocolope, de DNA Genetics Seeds, florece en 63 días. Alcanza un 23% de THC y contiene limoneno y mirceno.', fCho));
check('"Cierra con" se detecta', tieneErroresOrtografia('Cierra con mirceno y limoneno.', fCho));
check('primera frase tipo pregunta no se penaliza', !tieneErroresOrtografia('¿Buscas algo distinto? Chocolope florece en 63 días.', fCho));

check('buildFicha: aromas en español', buildFicha({ nombre: 'X', aromas: ['Blueberry', 'Earthy', 'zzz'] }, null, new Set()).aromas === 'arándano, terroso');

check('relleno: causa-efecto terpenos→sabor se detecta', tieneErroresOrtografia('Gracias a terpenos como mirceno, su sabor se define por uva, lo que se traduce en un efecto relajado.', {}));
check('relleno: "características organolépticas" se detecta', tieneErroresOrtografia('Los terpenos definen sus características organolépticas.', {}));
check('relleno: "Los terpenos presentes son…" (dato literal) pasa', !tieneErroresOrtografia('Los terpenos presentes son mirceno, pineno y linalool.', {}));

for (const mal of ['Es una semilla feminizada, lo que implica que todas serán hembras.', 'Feminizada, lo que simplifica el cultivo al no requerir eliminación de machos.', 'Autofloreciente, con un ciclo independiente del fotoperiodo.', 'Recomendada para climas húmedos.', '¿Buscas una regular con genética americana?']) {
  check(`conocimiento externo se detecta: "${mal.slice(0, 40)}…"`, tieneErroresOrtografia(mal, {}));
}
check('dato literal sigue pasando: "Su floración se completa en 63 días."', !tieneErroresOrtografia('Su floración se completa en 63 días.', {}));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
