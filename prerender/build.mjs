#!/usr/bin/env node
/**
 * Cannabicultor · Pre-render estático de variedades y breeders
 * ------------------------------------------------------------
 * Genera HTML estático e indexable desde Supabase (PostgREST, lectura anónima).
 * No usa el texto boilerplate en inglés de SeedFinder: compone descripciones
 * en español a partir de los campos estructurados.
 *
 * Uso:
 *   node prerender/build.mjs --breeders                # todos los breeders (Fase 1.A)
 *   node prerender/build.mjs --pilot=100               # piloto de N variedades
 *   node prerender/build.mjs --variedades              # todas las variedades con datos suficientes
 *   node prerender/build.mjs --breeders --pilot=100    # combinado + sitemaps
 *
 * Flags extra:
 *   --sitemaps        regenera sitemap-*.xml e índice (implícito si se genera algo)
 *   --dry             no escribe archivos, solo informa conteos
 *
 * Variables de entorno (opcionales, con defaults seguros para client-side):
 *   SUPABASE_URL, SUPABASE_KEY  (publishable / anon — nunca service_role aquí)
 *
 * ── TODOs pendientes (acordados, NO implementar sin encargo explícito) ──────
 * TODO [Fase 2 · imágenes]: hoy las fotos son hotlinks externos (S3 de Leafly).
 *   Preparar batch aparte que descargue y optimice a /assets/variedades/{slug}.webp
 *   y sustituir aquí `image_url` por la ruta local. Evita roturas por hotlink
 *   protection y problemas de derechos en páginas indexables.
 * TODO [Tarea 5 · CTA]: cuando exista /cultivo-con-ia, apuntar allí los CTA de
 *   "diario de cultivo con IA" que ahora van a "/" (ver describe() y footer).
 * TODO [estratégico · datos]: `efectos`, `sabores`, `aromas` y `premios` están
 *   vacíos en las 44k variedades, lo que limita la riqueza de las descripciones.
 *   Plan a medio plazo: enriquecerlos desde la comunidad y el diario IA. Cuando
 *   existan, añadir arquetipos de descripción por efecto/perfil aromático/premios.
 */

import { writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Config ────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gfyrsrdnvgnhtsuexjkb.supabase.co';
// Publishable key: segura en cliente (RLS activo). Ya se usa en el buscador.
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_FdRmfirvOTAIfZFOcj2ZZg_Vic__TDw';
const SITE = 'https://www.cannabicultor.com';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TODAY = new Date().toISOString().slice(0, 10);

const args = process.argv.slice(2);
const hasFlag = (n) => args.includes(`--${n}`);
const flagVal = (n) => {
  const a = args.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split('=')[1] : null;
};
const DRY = hasFlag('dry');
const DO_BREEDERS = hasFlag('breeders');
const PILOT = flagVal('pilot') ? parseInt(flagVal('pilot'), 10) : null;
const DO_ALL_VARS = hasFlag('variedades');

// ── PostgREST helper (paginado) ─────────────────────────────────────────────
async function fetchAll(table, { select, filter = '', order = '' } = {}) {
  const out = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}${filter}${order}`;
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Range: `${from}-${to}`, Prefer: 'count=exact' },
    });
    if (!res.ok) throw new Error(`PostgREST ${table} ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

// ── Utilidades de texto ─────────────────────────────────────────────────────
function slugify(str) {
  return String(str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos
    .replace(/ñ/gi, 'n')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}
const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Cruce genético «limpio» (A x B) vs prosa/etiquetas scrapeadas en inglés.
const PROSE_WORDS = /\b(the|and|will|resulting|cross|strain|information|produce|hybrid|between|independent|standardized)\b/i;
// Etiquetas de campo que el scraper pegó a los nombres (p.ej. "White WidowTHC").
const NOISE_LABEL = /(thc|cbd|type|genotype|phenotype|genetics|flowering|harvest|yield|height|indoor|outdoor|month|effect|aroma|flavou?r|parents|genotipo|iption|descript)/i;
function parseCross(genetica) {
  if (!genetica) return null;
  const g = genetica.trim();
  if (g.length < 4 || g.length > 60) return null;
  if (!/\sx\s/i.test(g)) return null;
  // prosa / fragmentos de descripción
  if (/\b(result|between|crossed|mother of|father of|is the)\b/i.test(g)) return null;
  if (/^[a-z]/.test(g)) return null; // empieza en minúscula → fragmento de prosa
  const parts = g.split(/\s+x\s+/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return null;
  for (const p of parts) {
    if (p.length < 2 || p.length > 28) return null;
    if (/[a-z][A-Z]/.test(p)) return null;          // camelCase pegado (etiqueta scrapeada)
    if (/\//.test(p)) return null;                  // "Indica/Sativa" pegado; "/" no existe en nombres reales
    if (/[A-Za-z](Indica|Sativa|Hybrid|Ruderalis)\b/.test(p)) return null; // etiqueta pegada sin espacio
    if (NOISE_LABEL.test(p)) return null;           // contiene etiqueta de campo
    const words = p.split(/\s+/);
    if (words.length > 4) return null;
    // cada palabra debe empezar por mayúscula, dígito o # (nombre de cepa)
    if (!words.every((w) => /^[A-Z0-9#][\wÀ-ÿ'’.\-#/]*$/.test(w))) return null;
  }
  const known = parts.filter((p) => !/unknown/i.test(p));
  if (known.length < 1) return null;                 // ambos parentales desconocidos → sin valor
  return parts;
}
function phenotype(genetica) {
  const g = (genetica || '').toLowerCase();
  const ind = /indica|índica|kush|afghan|hindu/.test(g);
  const sat = /sativa|haze|thai|landrace|african|colombian/.test(g);
  if (ind && !sat) return 'indica';
  if (sat && !ind) return 'sativa';
  if (ind && sat) return 'hibrida';
  return null;
}
const numOr = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
// Detecta texto en inglés (boilerplate scrapeado) para no publicarlo como si fuera español.
const EN_MARKERS = /\b(the|and|for|with|your|our|this|by|online|buy|find|seeds|bank|quality|unique|stable|grow|is|are|from|of|best|about|information|independent)\b/gi;
function isSpanish(text) {
  const m = String(text).match(EN_MARKERS);
  return !m || m.length < 2;
}

// ── Composición de descripción en español (con arquetipos) ──────────────────
function countDataPoints(v) {
  let n = 0;
  if (parseCross(v.genetica)) n++;
  if (numOr(v.thc_max) ?? numOr(v.thc_pct)) n++;
  if (numOr(v.cbd_max) ?? numOr(v.cbd_pct)) n++;
  if (v.floracion_dias) n++;
  if (v.tipo) n++;
  if (v.es_landrace && v.origen_geografico) n++;
  if (v.altura) n++;
  if (v.produccion) n++;
  return n;
}

function describe(v, breeder) {
  const nombre = v.nombre;
  const bn = breeder?.breeder_name && !/unknown|legendary/i.test(breeder.breeder_name)
    ? breeder.breeder_name : null;
  const cross = parseCross(v.genetica);
  const pheno = phenotype(v.genetica);
  const thc = numOr(v.thc_max) ?? numOr(v.thc_pct);
  const cbd = numOr(v.cbd_max) ?? numOr(v.cbd_pct);
  const dias = v.floracion_dias ? Number(v.floracion_dias) : null;
  const semanas = dias ? Math.round(dias / 7) : null;
  const isAuto = v.tipo === 'automatica';
  const isFem = v.tipo === 'feminizada';
  const isLand = v.es_landrace && v.origen_geografico;

  const S = []; // frases

  // — Apertura por arquetipo (prioridad) —
  if (isLand) {
    S.push(`${nombre} es una variedad landrace originaria de ${v.origen_geografico}, una genética con raíces geográficas bien definidas que conserva las características de su población original${bn ? ` y que ${bn} mantiene en su catálogo` : ''}.`);
  } else if (isAuto) {
    S.push(`${nombre}${bn ? ` de ${bn}` : ''} es una variedad autofloreciente, una opción cómoda para quienes empiezan en el cultivo porque no depende del fotoperiodo para iniciar la floración.`);
  } else if (thc && thc >= 20) {
    S.push(`${nombre}${bn ? ` de ${bn}` : ''} destaca por su alta potencia, con niveles de THC que alcanzan el ${thc}%, situándola entre las variedades más contundentes de su categoría.`);
  } else if (semanas && semanas < 8) {
    S.push(`${nombre}${bn ? ` de ${bn}` : ''} es una variedad de floración rápida, lista en torno a ${semanas} semanas, ideal para cultivadores que buscan cosechas ágiles.`);
  } else if (pheno === 'indica') {
    S.push(`${nombre}${bn ? ` de ${bn}` : ''} es una genética de predominancia índica; este tipo de variedades suele asociarse a efectos relajantes y a un consumo más orientado a la noche y al descanso.`);
  } else if (pheno === 'sativa') {
    S.push(`${nombre}${bn ? ` de ${bn}` : ''} es una genética de predominancia sativa; este perfil se relaciona habitualmente con efectos más energéticos y estimulantes, apropiados para el día.`);
  } else {
    S.push(`${nombre}${bn ? ` es una variedad desarrollada por ${bn}` : ' es una variedad de cannabis'} documentada en la base de datos de Cannabicultor.`);
  }

  // — Linaje —
  if (cross) {
    const uniq = [...new Set(cross.map((p) => p.toLowerCase()))];
    if (uniq.length === 1) {
      S.push(`Es una línea estabilizada a partir de ${cross[0]}, seleccionada para fijar sus rasgos.`);
    } else {
      S.push(`Procede del cruce entre ${cross.slice(0, -1).join(', ')} y ${cross[cross.length - 1]}, un linaje que define buena parte de su carácter.`);
    }
  }

  // — Datos de cultivo —
  const cultivo = [];
  if (dias) cultivo.push(`un periodo de floración de aproximadamente ${dias} días (${semanas} semanas)`);
  if (v.altura) cultivo.push(`un porte ${String(v.altura).toLowerCase()}`);
  if (v.produccion) cultivo.push(`una producción ${String(v.produccion).toLowerCase()}`);
  if (cultivo.length) {
    S.push(`En cultivo presenta ${cultivo.join(', ')}.`);
  }

  // — Cannabinoides —
  const canna = [];
  if (thc) canna.push(`un THC de hasta el ${thc}%`);
  if (cbd && cbd > 0) canna.push(`un CBD de hasta el ${cbd}%`);
  if (canna.length && !(thc && thc >= 20 && canna.length === 1)) {
    S.push(`Su perfil de cannabinoides ronda ${canna.join(' y ')}.`);
  }

  // — Tipo de semilla (si no se dijo ya) —
  if (isFem) S.push('Se comercializa en formato de semilla feminizada.');
  else if (v.tipo === 'regular') S.push('Se ofrece en formato de semilla regular.');

  // — CTA / enlace interno —
  S.push(`Puedes comparar ${nombre} con otras genéticas en el <a href="/buscador-cannabicultor.html">buscador de variedades</a> o registrar tu cultivo en el <a href="/cultivo-con-ia/">asistente de IA para tu cultivo</a> de Cannabicultor.`);

  return S.join(' ');
}

// Meta description corta (≤160) desde datos, sin HTML.
function metaDesc(v, breeder) {
  const bn = breeder?.breeder_name && !/unknown|legendary/i.test(breeder.breeder_name) ? breeder.breeder_name : null;
  const bits = [];
  if (v.tipo && v.tipo !== 'regular') bits.push(v.tipo);
  const cross = parseCross(v.genetica);
  if (cross) bits.push(`genética ${cross.join(' x ')}`);
  else if (v.es_landrace && v.origen_geografico) bits.push(`landrace de ${v.origen_geografico}`);
  const thc = numOr(v.thc_max) ?? numOr(v.thc_pct);
  if (thc) bits.push(`THC ${thc}%`);
  if (v.floracion_dias) bits.push(`floración ${v.floracion_dias} días`);
  const head = `${v.nombre}${bn ? ` de ${bn}` : ''}`;
  const tail = bits.slice(0, 3).join(', ');
  let d = `${head}${tail ? `: ${tail}` : ''}. Ficha completa, características y cultivo en Cannabicultor.`;
  return d.length > 160 ? d.slice(0, 157).replace(/,?\s+\S*$/, '') + '…' : d;
}

// ── Plantilla HTML compartida ────────────────────────────────────────────────
const CSS = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--forest:#1a5c32;--forest-light:#2a7a44;--forest-pale:#e6f0ea;--bg:#f5f7f4;--white:#fff;--text:#1a1f1c;--text2:#3d453f;--text3:#6b7370;--border:#e2e7e1}
html{scroll-behavior:smooth}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;color:var(--text);background:var(--bg);line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:var(--forest);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:820px;margin:0 auto;padding:24px 20px 80px}
header.top{border-bottom:1px solid var(--border);background:var(--white)}
.top-in{max-width:820px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;gap:12px}
.top-in a.brand{font-weight:600;color:var(--forest);font-size:16px}
nav.crumbs{font-size:13px;color:var(--text3);margin:20px 0 8px}
nav.crumbs a{color:var(--text3)}
h1{font-size:clamp(28px,5vw,40px);font-weight:600;letter-spacing:-0.03em;line-height:1.1;margin:6px 0 4px}
h1 .by{display:block;font-size:16px;font-weight:400;color:var(--text3);margin-top:8px;letter-spacing:0}
.hero{display:flex;gap:28px;flex-wrap:wrap;align-items:flex-start;margin:24px 0 8px}
.hero img{width:220px;height:220px;object-fit:cover;border-radius:16px;border:1px solid var(--border);background:var(--white)}
.facts{width:100%;border-collapse:collapse;margin:24px 0;background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.facts th,.facts td{text-align:left;padding:11px 16px;border-bottom:1px solid var(--border);font-size:14px}
.facts th{width:38%;color:var(--text3);font-weight:500}
.facts tr:last-child th,.facts tr:last-child td{border-bottom:0}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}
.chip{font-size:12px;background:var(--forest-pale);color:var(--forest);padding:5px 13px;border-radius:20px;font-weight:500}
.body{font-size:16px;color:var(--text2);margin:24px 0}
.body p{margin:0 0 14px}
h2{font-size:22px;font-weight:600;letter-spacing:-0.02em;margin:36px 0 14px}
.varlist{list-style:none;columns:2;gap:24px}
.varlist li{margin:0 0 7px;break-inside:avoid;font-size:14px}
.cta{display:inline-block;background:var(--forest);color:#fff;padding:12px 22px;border-radius:10px;font-weight:500;margin-top:12px}
.cta:hover{background:var(--forest-light);text-decoration:none}
footer.ft{border-top:1px solid var(--border);color:var(--text3);font-size:13px;max-width:820px;margin:40px auto 0;padding:24px 20px}
footer.ft a{color:var(--text3)}
.rev-box{margin-top:36px;padding-top:20px;border-top:1px solid var(--border)}
.rev-box h3{font-size:18px;margin:0 0 12px}
.rev-avg,.rev-meta{font-size:14px;color:var(--text3);margin-bottom:10px}
.rev-stars{letter-spacing:1px;color:var(--forest)}
.rev-star{background:none;border:0;padding:0 1px;font-size:18px;color:var(--forest)}
.rev-stars-in .rev-star{cursor:pointer}
.rev-item{padding:12px 0;border-bottom:1px solid var(--border);font-size:15px}
.rev-empty,.rev-login{color:var(--text3);font-size:14px}
.rev-form{display:flex;flex-direction:column;gap:8px;margin-top:14px}
.rev-form textarea{width:100%;border:1px solid var(--border);border-radius:10px;padding:10px;font:inherit}
.rev-send{background:var(--forest);color:#fff;border:0;border-radius:10px;padding:12px;font-weight:600;cursor:pointer}
.rev-msg{color:#b94b42;font-size:13px}
@media(max-width:560px){.varlist{columns:1}.hero img{width:100%;height:auto;aspect-ratio:1}}`;

const GA_SNIPPET = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XS18E0J277"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-XS18E0J277');
</script>
`;

function shell({ title, desc, canonical, image, jsonld, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
${GA_SNIPPET}
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="es" href="${canonical}">
<link rel="alternate" hreflang="x-default" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="es_ES">
<meta property="og:site_name" content="Cannabicultor">
${image ? `<meta property="og:image" content="${esc(image)}">
<meta property="og:image:alt" content="${esc(title)}">` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
${image ? `<meta name="twitter:image" content="${esc(image)}">
<meta name="twitter:image:alt" content="${esc(title)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head>
<body>
<header class="top"><div class="top-in"><a class="brand" href="/">Cannabicultor</a></div></header>
<main class="wrap">
${bodyHtml}
</main>
<footer class="ft">
<p>Cannabicultor · Guía IA de cultivo de cannabis en español. Solo para mayores de 18 años. El cultivo de cannabis está regulado; consulta la legislación vigente en tu país. Fines educativos.</p>
<p><a href="/">Inicio</a> · <a href="/buscador-cannabicultor.html">Buscador</a> · <a href="/atlas_landrace.html">Atlas landrace</a></p>
</footer>
<script src="/assets/resenas.js"></script>
<script src="/assets/ac-urgent-banner.js" defer></script>
</body>
</html>`;
}

// ── Página de variedad ───────────────────────────────────────────────────────
function varietyPage(v, breeder, breederSlug) {
  const bn = breeder?.breeder_name && !/unknown|legendary/i.test(breeder.breeder_name) ? breeder.breeder_name : null;
  const canonical = `${SITE}/variedades/${v._slug}/`;
  const img = v.image_url || v.img_url || null;
  const cross = parseCross(v.genetica);
  const thc = numOr(v.thc_max) ?? numOr(v.thc_pct);
  const cbd = numOr(v.cbd_max) ?? numOr(v.cbd_pct);
  const title = `${v.nombre}${bn ? ` de ${bn}` : ''}: THC, floración y genética | Cannabicultor`;
  const desc = metaDesc(v, breeder);

  const rows = [];
  if (v.tipo) rows.push(['Tipo de semilla', cap(v.tipo)]);
  const ph = phenotype(v.genetica);
  if (ph) rows.push(['Predominancia', cap(ph === 'hibrida' ? 'híbrida' : ph)]);
  if (cross) {
    const uniq = [...new Set(cross.map((p) => p.toLowerCase()))];
    rows.push(['Genética', uniq.length === 1 ? `${cross[0]} (autocruce)` : cross.join(' × ')]);
  }
  if (v.es_landrace && v.origen_geografico) rows.push(['Origen', esc(v.origen_geografico)]);
  if (thc) rows.push(['THC', `hasta ${thc}%`]);
  if (cbd && cbd > 0) rows.push(['CBD', `hasta ${cbd}%`]);
  if (v.floracion_dias) rows.push(['Floración', `${v.floracion_dias} días (~${Math.round(v.floracion_dias / 7)} semanas)`]);
  if (v.altura) rows.push(['Altura', esc(v.altura)]);
  if (v.produccion) rows.push(['Producción', esc(v.produccion)]);
  if (v.anio_lanzamiento) rows.push(['Año', v.anio_lanzamiento]);

  const chips = [];
  if (v.es_landrace) chips.push('Landrace');
  if (v.tipo === 'automatica') chips.push('Autofloreciente');
  if (thc && thc >= 20) chips.push('Alta potencia');
  if (v.floracion_dias && v.floracion_dias < 56) chips.push('Floración rápida');

  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Variedades', item: `${SITE}/buscador-cannabicultor.html` },
          { '@type': 'ListItem', position: 3, name: v.nombre, item: canonical },
        ],
      },
      {
        '@type': 'WebPage',
        name: title,
        description: desc,
        url: canonical,
        inLanguage: 'es',
        ...(img ? { primaryImageOfPage: img } : {}),
        ...(bn ? { about: { '@type': 'Brand', name: bn } } : {}),
      },
    ],
  };

  const body = `
<nav class="crumbs"><a href="/">Inicio</a> › <a href="/buscador-cannabicultor.html">Variedades</a> › ${esc(v.nombre)}</nav>
<h1>${esc(v.nombre)}${bn ? `<span class="by">de <a href="/breeders/${breederSlug}/">${esc(bn)}</a></span>` : ''}</h1>
${chips.length ? `<div class="chips">${chips.map((c) => `<span class="chip">${c}</span>`).join('')}</div>` : ''}
<div class="hero">
${img ? `<img src="${esc(img)}" alt="Foto de la variedad ${esc(v.nombre)}" loading="lazy" width="220" height="220">` : ''}
<table class="facts">${rows.map(([k, val]) => `<tr><th>${k}</th><td>${val}</td></tr>`).join('')}</table>
</div>
<div class="body"><p>${describe(v, breeder)}</p></div>
${bn ? `<a class="cta" href="/breeders/${breederSlug}/">Ver más variedades de ${esc(bn)}</a>` : `<a class="cta" href="/buscador-cannabicultor.html">Explorar el buscador de variedades</a>`}
<div data-resenas data-tipo="variedad" data-id="${v.id}"></div>
`;
  return shell({ title, desc, canonical, image: img, jsonld, bodyHtml: body });
}

// ── Página de breeder ────────────────────────────────────────────────────────
function breederPage(b, myVarieties) {
  const canonical = `${SITE}/breeders/${b._slug}/`;
  const nombre = b.breeder_name;
  const img = b.logo_url || null;
  const descText = (b.descripcion && b.descripcion.length > 60 && isSpanish(b.descripcion))
    ? b.descripcion
    : composeBreederDesc(b);
  const title = `${nombre}: variedades y genéticas | Cannabicultor`;
  const metaBits = [];
  if (b.pais_origen) metaBits.push(b.pais_origen);
  if (b.año_fundacion) metaBits.push(`desde ${b.año_fundacion}`);
  if (b.cantidad_variedades) metaBits.push(`${b.cantidad_variedades} variedades`);
  const desc = `${nombre}${metaBits.length ? ` (${metaBits.join(', ')})` : ''}. Catálogo de genéticas, historia y variedades en Cannabicultor.`.slice(0, 160);

  const rows = [];
  if (b.pais_origen) rows.push(['País', esc(b.pais_origen)]);
  if (b.año_fundacion) rows.push(['Fundación', b.año_fundacion]);
  if (b.tipo_semillas) rows.push(['Tipo de semillas', esc(b.tipo_semillas)]);
  if (b.cantidad_variedades) rows.push(['Variedades', b.cantidad_variedades]);
  if (b.premios && b.premios.length > 3) rows.push(['Premios', esc(b.premios)]);

  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Breeders', item: `${SITE}/buscador-cannabicultor.html` },
          { '@type': 'ListItem', position: 3, name: nombre, item: canonical },
        ],
      },
      {
        '@type': 'Brand',
        name: nombre,
        url: canonical,
        ...(img ? { logo: img } : {}),
        ...(b.website ? { sameAs: [b.website] } : {}),
        description: desc,
      },
    ],
  };

  const listed = myVarieties.filter((v) => v._slug);
  const varsHtml = listed.length
    ? `<h2>Variedades de ${esc(nombre)} en Cannabicultor</h2>
<ul class="varlist">${listed.map((v) => `<li><a href="/variedades/${v._slug}/">${esc(v.nombre)}</a></li>`).join('')}</ul>`
    : `<h2>Variedades</h2><p class="body">Estamos publicando las fichas de las variedades de ${esc(nombre)}. Mientras tanto, puedes explorarlas en el <a href="/buscador-cannabicultor.html">buscador genético</a>.</p>`;

  const body = `
<nav class="crumbs"><a href="/">Inicio</a> › <a href="/buscador-cannabicultor.html">Breeders</a> › ${esc(nombre)}</nav>
<h1>${esc(nombre)}</h1>
<div class="hero">
${img ? `<img src="${esc(img)}" alt="Logo de ${esc(nombre)}" loading="lazy" width="220" height="220">` : ''}
${rows.length ? `<table class="facts">${rows.map(([k, val]) => `<tr><th>${k}</th><td>${val}</td></tr>`).join('')}</table>` : ''}
</div>
<div class="body"><p>${esc(descText)}</p></div>
${b.website ? `<p class="body"><a href="${esc(b.website)}" rel="nofollow noopener" target="_blank">Sitio web oficial ↗</a></p>` : ''}
${varsHtml}
<a class="cta" href="/buscador-cannabicultor.html">Explorar todas las variedades</a>
<div data-resenas data-tipo="breeder" data-id="${b.id}"></div>
`;
  return shell({ title, desc, canonical, image: img, jsonld, bodyHtml: body });
}

function composeBreederDesc(b) {
  const S = [];
  const parts = [];
  if (b.pais_origen) parts.push(`banco de semillas de ${b.pais_origen}`);
  else parts.push('banco de semillas');
  if (b.año_fundacion) parts.push(`activo desde ${b.año_fundacion}`);
  S.push(`${b.breeder_name} es un ${parts.join(', ')}.`);
  if (b.cantidad_variedades) S.push(`En su catálogo figuran alrededor de ${b.cantidad_variedades} variedades documentadas en Cannabicultor.`);
  if (b.tipo_semillas) S.push(`Trabaja principalmente con semillas de tipo ${String(b.tipo_semillas).toLowerCase()}.`);
  if (b.variedades_famosas && b.variedades_famosas.length > 2) S.push(`Entre sus genéticas más conocidas se encuentran ${b.variedades_famosas}.`);
  S.push(`Consulta sus variedades y compara genéticas en el buscador de Cannabicultor.`);
  return S.join(' ');
}

// ── Sitemaps ─────────────────────────────────────────────────────────────────
function sitemapUrls(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url><loc>${e.loc}</loc><lastmod>${e.lastmod || TODAY}</lastmod><changefreq>${e.changefreq || 'monthly'}</changefreq><priority>${e.priority}</priority></url>`).join('\n')}
</urlset>
`;
}
function sitemapIndex(names) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${names.map((n) => `  <sitemap><loc>${SITE}/${n}</loc><lastmod>${TODAY}</lastmod></sitemap>`).join('\n')}
</sitemapindex>
`;
}

const STATIC_URLS = [
  { loc: `${SITE}/`, priority: '1.0', changefreq: 'weekly', lastmod: TODAY },
  { loc: `${SITE}/cultivo-con-ia/`, priority: '0.9', changefreq: 'monthly', lastmod: TODAY },
  { loc: `${SITE}/biblioteca/`, priority: '0.9', changefreq: 'monthly', lastmod: TODAY },
  { loc: `${SITE}/biblioteca/charlie-garcia-cannabiogen/`, priority: '0.8', changefreq: 'yearly', lastmod: '2026-08-14' },
  { loc: `${SITE}/biblioteca/sam-the-skunkman-legado/`, priority: '0.8', changefreq: 'yearly', lastmod: '2026-08-14' },
  { loc: `${SITE}/informes/cannabis-del-barrio-al-turista/`, priority: '0.9', changefreq: 'yearly', lastmod: '2026-07-23' },
  { loc: `${SITE}/informes/cannabis-del-barrio-al-turista/informe.pdf`, priority: '0.6', changefreq: 'yearly', lastmod: '2026-07-23' },
  { loc: `${SITE}/buscador-cannabicultor.html`, priority: '0.9', changefreq: 'monthly' },
  { loc: `${SITE}/growshops.html`, priority: '0.8', changefreq: 'weekly' },
  { loc: `${SITE}/asociaciones.html`, priority: '0.8', changefreq: 'weekly' },
  { loc: `${SITE}/disenador_sala_cultivo.html`, priority: '0.9', changefreq: 'monthly' },
  { loc: `${SITE}/atlas_landrace.html`, priority: '0.9', changefreq: 'monthly' },
  { loc: `${SITE}/aviso-legal.html`, priority: '0.3', changefreq: 'yearly', lastmod: '2026-06-18' },
  { loc: `${SITE}/cookies.html`, priority: '0.3', changefreq: 'yearly', lastmod: '2026-06-18' },
  { loc: `${SITE}/privacidad.html`, priority: '0.3', changefreq: 'yearly', lastmod: '2026-06-18' },
  { loc: `${SITE}/terminos.html`, priority: '0.3', changefreq: 'yearly', lastmod: '2026-06-18' },
  { loc: `${SITE}/contratacion.html`, priority: '0.3', changefreq: 'yearly', lastmod: '2026-06-18' },
  { loc: `${SITE}/contacto.html`, priority: '0.5', changefreq: 'yearly', lastmod: '2026-07-23' },
];

// ── Slug assignment con dedupe ───────────────────────────────────────────────
function assignBreederSlugs(breeders) {
  const seen = new Map();
  for (const b of breeders) {
    let s = slugify(b.breeder_name) || `breeder-${b.id}`;
    if (seen.has(s)) s = `${s}-${b.id}`;
    seen.set(s, true);
    b._slug = s;
  }
}
function assignVarietySlugs(vars, breederById) {
  const seen = new Map();
  for (const v of vars) {
    const b = breederById.get(v.breeder_id);
    const base = slugify(v.nombre) || `variedad-${v.id}`;
    const bslug = b ? slugify(b.breeder_name) : '';
    let s = bslug ? `${base}-${bslug}` : base;
    if (seen.has(s)) s = `${s}-${v.id}`;
    seen.set(s, true);
    v._slug = s;
  }
}

async function write(path, content) {
  if (DRY) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`▸ Cannabicultor pre-render · ${TODAY}${DRY ? ' (DRY RUN)' : ''}`);

  const breeders = await fetchAll('breeders', {
    select: 'id,breeder_name,website,cantidad_variedades,pais_origen,año_fundacion,tipo_semillas,descripcion,variedades_famosas,premios,logo_url,updated_at',
    order: '&order=breeder_name.asc',
  });
  assignBreederSlugs(breeders);
  const breederById = new Map(breeders.map((b) => [b.id, b]));
  console.log(`  breeders cargados: ${breeders.length}`);

  // — Selección de variedades —
  let pilotVars = [];
  if (DO_ALL_VARS) {
    // SEO: solo fichas con foto y datos suficientes (evita thin content).
    const allVars = await fetchAll('variedades', {
      select: 'id,breeder_id,nombre,tipo,thc_pct,thc_max,cbd_pct,cbd_max,floracion_dias,genetica,altura,produccion,descripcion,image_url,img_url,es_landrace,origen_geografico,anio_lanzamiento,updated_at',
      filter: '&image_url=not.is.null',
    });
    const withPhoto = allVars.filter((v) => v.nombre && v.image_url);
    const scored = withPhoto.filter((v) => countDataPoints(v) >= 2);
    pilotVars = scored.length ? scored : withPhoto;
    assignVarietySlugs(pilotVars, breederById);
    console.log(`  variedades a publicar: ${pilotVars.length} (con foto; ${withPhoto.length - pilotVars.length} descartadas por datos insuficientes)`);
  } else if (PILOT) {
    const cands = await fetchAll('variedades', {
      select: 'id,breeder_id,nombre,tipo,thc_pct,thc_max,cbd_pct,cbd_max,floracion_dias,genetica,altura,produccion,descripcion,image_url,img_url,es_landrace,origen_geografico,anio_lanzamiento,updated_at',
      filter: '&image_url=not.is.null',
    });
    const scored = cands
      .map((v) => ({ v, dp: countDataPoints(v), rep: breederById.get(v.breeder_id)?.cantidad_variedades || 0 }))
      .filter((x) => x.dp >= 3)
      .sort((a, b) => b.dp - a.dp || b.rep - a.rep);
    // diversidad: máx 3 por breeder
    const perBreeder = new Map();
    for (const x of scored) {
      const c = perBreeder.get(x.v.breeder_id) || 0;
      if (c >= 3) continue;
      perBreeder.set(x.v.breeder_id, c + 1);
      pilotVars.push(x.v);
      if (pilotVars.length >= PILOT) break;
    }
    assignVarietySlugs(pilotVars, breederById);
    console.log(`  variedades piloto seleccionadas: ${pilotVars.length} (de ${cands.length} con imagen)`);
  }

  // agrupa variedades por breeder (para listar en su página)
  const varsByBreeder = new Map();
  for (const v of pilotVars) {
    if (!varsByBreeder.has(v.breeder_id)) varsByBreeder.set(v.breeder_id, []);
    varsByBreeder.get(v.breeder_id).push(v);
  }

  let nB = 0, nV = 0;
  if (DO_BREEDERS) {
    for (const b of breeders) {
      await write(join(ROOT, 'breeders', b._slug, 'index.html'), breederPage(b, varsByBreeder.get(b.id) || []));
      nB++;
    }
    console.log(`  ✓ breeders escritos: ${nB}`);
  }
  if (pilotVars.length) {
    for (const v of pilotVars) {
      const b = breederById.get(v.breeder_id);
      await write(join(ROOT, 'variedades', v._slug, 'index.html'), varietyPage(v, b, b?._slug));
      nV++;
    }
    console.log(`  ✓ variedades escritas: ${nV}`);
  }

  // — Sitemaps —
  if (!DRY && (DO_BREEDERS || pilotVars.length)) {
    await write(join(ROOT, 'sitemap-static.xml'), sitemapUrls(STATIC_URLS));
    const names = ['sitemap-static.xml'];
    if (DO_BREEDERS) {
      await write(join(ROOT, 'sitemap-breeders.xml'),
        sitemapUrls(breeders.map((b) => ({ loc: `${SITE}/breeders/${b._slug}/`, priority: '0.7', changefreq: 'monthly', lastmod: (b.updated_at || TODAY).slice(0, 10) }))));
      names.push('sitemap-breeders.xml');
    }
    if (pilotVars.length) {
      await write(join(ROOT, 'sitemap-strains.xml'),
        sitemapUrls(pilotVars.map((v) => ({ loc: `${SITE}/variedades/${v._slug}/`, priority: '0.6', changefreq: 'monthly', lastmod: (v.updated_at || TODAY).slice(0, 10) }))));
      names.push('sitemap-strains.xml');
    }
    await write(join(ROOT, 'sitemap.xml'), sitemapIndex(names));
    console.log(`  ✓ sitemaps: ${names.join(', ')} + índice sitemap.xml`);
  }

  console.log('▸ Hecho.');
}

main().catch((e) => { console.error(e); process.exit(1); });
