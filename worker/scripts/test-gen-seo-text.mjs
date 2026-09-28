// Tests offline (sin red, sin secrets) de las funciones puras de gen-seo-text.mjs.
// Uso: node worker/scripts/test-gen-seo-text.mjs
import { numerosDeTexto, numerosDeFicha, cifrasVerificadas } from './gen-seo-text.mjs';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.log('FAIL:', name); } }

const sinDuplicadas = new Set();

// ── Caso real reportado por Ernie: 00 Cheese ────────────────────────────────
// Antes del fix, numerosDeFicha() solo miraba thc/cbd/floracion/año, así que
// "400", "500" (produccion) y "00" (nombre/breeder) se marcaban como
// inventadas y el texto se rechazaba siempre.
const cheese = {
  nombre: '00 Cheese',
  genetica: 'Skunk #1 x Cheese',
  produccion: '400-500 g/m²',
  tipo: 'feminizada',
  floracion_dias: 56,
  thc_max: 19,
};
const breederCheese = '00 Seeds Bank';

check(
  '00 Cheese: "400-500 g/m²" en produccion se acepta',
  cifrasVerificadas('La 00 Cheese de 00 Seeds Bank alcanza una producción de 400-500 g/m² con un THC de hasta el 19%.', cheese, breederCheese, sinDuplicadas),
);
check(
  '00 Cheese: el "00" del nombre y del breeder no dispara rechazo',
  cifrasVerificadas('00 Cheese es una variedad feminizada de 00 Seeds Bank con una floración de 56 días.', cheese, breederCheese, sinDuplicadas),
);
check(
  '00 Cheese: "Skunk #1" en genetica no dispara rechazo',
  cifrasVerificadas('Procede del cruce entre Skunk #1 y Cheese, desarrollada por 00 Seeds Bank.', cheese, breederCheese, sinDuplicadas),
);

// ── Sigue rechazando cifras genuinamente inventadas ─────────────────────────
check(
  'THC inventado (35% cuando la ficha dice 19%) se sigue rechazando',
  !cifrasVerificadas('Esta variedad alcanza un THC de hasta el 35%.', cheese, breederCheese, sinDuplicadas),
);
check(
  'año inventado se sigue rechazando (no está en ningún campo de texto)',
  !cifrasVerificadas('Lanzada en 1998 por 00 Seeds Bank.', cheese, breederCheese, sinDuplicadas),
);

// ── notas_existentes: solo cuenta si es única (coherente con buildPrompt) ──
const conDescRepetida = { ...cheese, descripcion: 'Texto genérico compartido en 300 fichas distintas.' };
const dupConEseTexto = new Set(['Texto genérico compartido en 300 fichas distintas.']);
check(
  'cifra que SOLO aparece en descripcion repetida (no pasada al prompt) se rechaza',
  !cifrasVerificadas('Compartido en 300 fichas según nuestros datos.', conDescRepetida, breederCheese, dupConEseTexto),
);
const conDescUnica = { ...cheese, descripcion: 'Cultivada con éxito en macetas de 40 litros.' };
check(
  'cifra que aparece en descripcion ÚNICA (sí pasada al prompt) se acepta',
  cifrasVerificadas('Se recomienda cultivarla en macetas de 40 litros.', conDescUnica, breederCheese, sinDuplicadas),
);

// ── altura, terpenos, sabor/efecto (arrays) también cuentan ────────────────
const conArrays = { ...cheese, altura: '100-150 cm', terpenos: 'mirceno 1.2%', efectos: ['relajante', 'top 10 en su categoría'] };
check('altura "100-150 cm" se acepta', cifrasVerificadas('Alcanza una altura de 100-150 cm en interior.', conArrays, breederCheese, sinDuplicadas));
check('terpenos "1.2%" se acepta', cifrasVerificadas('Su perfil de mirceno llega al 1.2%.', conArrays, breederCheese, sinDuplicadas));
check('efectos (array) "top 10" se acepta', cifrasVerificadas('Está considerada top 10 en su categoría.', conArrays, breederCheese, sinDuplicadas));

// ── numerosDeTexto: extracción básica y coma decimal ────────────────────────
check('numerosDeTexto extrae enteros y decimales, coma->punto', JSON.stringify(numerosDeTexto('THC 18,5% y 20 semanas')) === JSON.stringify(['18.5', '20']));

// ── numerosDeFicha: semanas derivadas de floracion_dias siguen presentes ───
check('numerosDeFicha deriva semanas de floracion_dias', numerosDeFicha({ floracion_dias: 63 }, null, sinDuplicadas).has('9'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
