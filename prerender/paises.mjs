/**
 * Cannabicultor · Directorio por país bajo www.cannabicultor.com/<pais>/
 * ---------------------------------------------------------------------
 * Sustituye a los subdominios ar./cl./co./mx. (que servían el mismo HTML que www y se
 * resolvían por JS). Genera HTML crudo con título, meta, textos y JSON-LD propios del país:
 *
 *   /ar/                                   portada del país
 *   /ar/growshops/   /ar/asociaciones/   /ar/tiendas-cbd/          portada por tipo
 *   /ar/<tipo>/<provincia>/                listado por provincia
 *   /ar/<tipo>/<provincia>/<ficha>/        ficha
 *
 * Regla de calidad (solo fichas): index únicamente si la descripción es única y >120
 * caracteres, el contacto está verificado y la geolocalización es exacta. El resto sale
 * con noindex,follow y NO entra en el sitemap. Un país sin fichas genera solo su portada
 * con noindex,follow (queda listo para cuando haya datos).
 *
 * Lo invoca prerender/build.mjs con --paises (todos) o --pais=ar.
 */
import { join } from 'node:path';

export const PAISES = {
  ar: {
    code: 'AR', nombre: 'Argentina', locale: 'es-AR', og: 'es_AR', region: 'provincia', regiones: 'provincias',
    provDisplay: { CABA: 'Ciudad Autónoma de Buenos Aires (CABA)' },
    faq: [
      { q: '¿Qué es el REPROCANN?',
        a: 'El REPROCANN es el Registro del Programa de Cannabis de Argentina, creado a partir de la Ley 27.350 y el Decreto 883/2020. Las personas inscriptas pueden cultivar cannabis con fines medicinales, terapéuticos o paliativos. Los requisitos y trámites se consultan en el sitio oficial del Ministerio de Salud de la Nación.' },
    ],
  },
  cl: {
    code: 'CL', nombre: 'Chile', locale: 'es-CL', og: 'es_CL', region: 'región', regiones: 'regiones', provDisplay: {},
    faq: [
      { q: '¿Qué normativa rige el cannabis en Chile?',
        a: 'En Chile el marco general es la Ley 20.000, y el uso medicinal tiene su propia regulación sanitaria a través del Ministerio de Salud. Consulta siempre la normativa vigente antes de cultivar, comprar o asociarte.' },
    ],
  },
  co: {
    code: 'CO', nombre: 'Colombia', locale: 'es-CO', og: 'es_CO', region: 'departamento', regiones: 'departamentos', provDisplay: {},
    faq: [
      { q: '¿Qué normativa rige el cannabis en Colombia?',
        a: 'En Colombia la Ley 1787 de 2016 regula el acceso seguro e informado al uso médico y científico del cannabis. Consulta siempre la normativa vigente y los requisitos de licenciamiento antes de cultivar o comercializar.' },
    ],
  },
  mx: {
    code: 'MX', nombre: 'México', locale: 'es-MX', og: 'es_MX', region: 'estado', regiones: 'estados', provDisplay: {},
    faq: [
      { q: '¿Cuál es la situación legal del cannabis en México?',
        a: 'En México la Suprema Corte de Justicia de la Nación ha resuelto que la prohibición absoluta del consumo personal es inconstitucional, pero la regulación del mercado sigue en desarrollo. Consulta siempre la normativa vigente antes de cultivar, comprar o asociarte.' },
    ],
  },
};

export const TIPOS = {
  growshops: {
    tabla: 'growshops', h: 'Growshops', singular: 'growshop', plural: 'growshops', schema: 'Store', resena: 'growshop',
    que: 'tiendas especializadas en cultivo: sustratos, iluminación, fertilizantes, semillas y accesorios',
    select: 'id,slug,nombre,direccion,cp,ciudad,provincia,lat,lon,telefono,web,instagram,horario,descripcion,descripcion_tldr,logo_url,media_resenas,num_resenas,verificado,geo_aproximado,indexable,updated_at',
  },
  asociaciones: {
    tabla: 'asociaciones', h: 'Clubes y asociaciones', singular: 'club o asociación', plural: 'clubes y asociaciones', schema: 'Organization', resena: 'asociacion',
    que: 'clubes, asociaciones y colectivos cannábicos',
    select: 'id,slug,nombre,direccion,ciudad,provincia,lat,lon,telefono,web,instagram,horario,descripcion,descripcion_tldr,logo_url,media_resenas,num_resenas,verificado,geo_aproximado,indexable,updated_at',
  },
  'tiendas-cbd': {
    tabla: 'cbd_shops', h: 'Tiendas de CBD', singular: 'tienda de CBD', plural: 'tiendas de CBD', schema: 'Store', resena: 'cbd_shop',
    que: 'tiendas de CBD: flores, aceites, cosmética e infusiones',
    select: 'id,slug,nombre,direccion,cp,ciudad,provincia,lat,lon,telefono,web,instagram,horario,descripcion,descripcion_tldr,logo_url,media_resenas,num_resenas,verificado,geo_aproximado,indexable,updated_at',
  },
};

const MIN_PROV_INDEX = 3; // un listado por provincia solo se indexa con >=3 fichas
const CAP = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ── Calidad de ficha ───────────────────────────────────────────────────────────
export const descripcionDe = (s) => String(s.descripcion_tldr || s.descripcion || '').trim();
const normDesc = (t) => t.toLowerCase().replace(/\s+/g, ' ');

/** Index solo si: descripción única >120, contacto verificado y geolocalización exacta. */
export function fichaIndexable(s, conteoDesc) {
  const d = descripcionDe(s);
  const tieneContacto = !!(s.telefono || s.web || s.instagram || s.direccion);
  return s.indexable !== false
    && d.length > 120 && (conteoDesc.get(normDesc(d)) || 0) === 1
    && s.verificado === true && tieneContacto
    && s.lat != null && s.lon != null && s.geo_aproximado === false;
}

/** Fichas con geolocalización exacta (mapa y geo en JSON-LD solo entonces). */
const geoExacta = (s) => s.lat != null && s.lon != null && s.geo_aproximado === false;

// ── Generación ───────────────────────────────────────────────────────────────────
/**
 * ctx: { shell, esc, slugify, trimText, fetchAll, write, cleanDir, SITE, OUT, TODAY,
 *        CBD_CSS, LEAFLET, leafletScript, SHELL_NAV }
 * Devuelve { sitemaps: [{ name, xmlEntries }] } con las entradas por país que deben ir a sitemap-<pais>.xml.
 */
export async function buildPaises(ctx, slugs) {
  const { fetchAll, write, cleanDir, SITE, OUT, slugify } = ctx;
  const out = [];
  for (const slug of slugs) {
    const pais = PAISES[slug];
    if (!pais) throw new Error(`País desconocido: ${slug}`);
    const datos = {};
    for (const [tk, t] of Object.entries(TIPOS)) {
      const rows = await fetchAll(t.tabla, { select: t.select, filter: `&activo=is.true&pais=eq.${pais.code}`, order: 'id.asc' });
      datos[tk] = organizar(ctx, pais, tk, rows);
    }
    const total = Object.values(datos).reduce((n, d) => n + d.rows.length, 0);
    await cleanDir(slug);
    const entries = [];
    await write(join(OUT, slug, 'index.html'), hubPais(ctx, slug, pais, datos, total).html);
    if (total > 0) entries.push({ loc: `${SITE}/${slug}/`, priority: '0.8', changefreq: 'weekly' });

    let nFichas = 0, nIdx = 0;
    if (total > 0) {
      for (const [tk, t] of Object.entries(TIPOS)) {
        const d = datos[tk];
        if (!d.rows.length) continue;
        await write(join(OUT, slug, tk, 'index.html'), tipoPage(ctx, slug, pais, tk, t, d).html);
        entries.push({ loc: `${SITE}/${slug}/${tk}/`, priority: '0.7', changefreq: 'weekly' });
        for (const g of d.grupos.values()) {
          const idxProv = !!g.prov && g.shops.length >= MIN_PROV_INDEX;
          await write(join(OUT, slug, tk, g.provSlug, 'index.html'), provPage(ctx, slug, pais, tk, t, d, g, idxProv).html);
          if (idxProv) entries.push({ loc: `${SITE}/${slug}/${tk}/${g.provSlug}/`, priority: '0.6', changefreq: 'weekly' });
          for (const s of g.shops) {
            const page = fichaPage(ctx, slug, pais, tk, t, g, s);
            await write(join(OUT, slug, tk, g.provSlug, s._slug, 'index.html'), page.html);
            nFichas++;
            if (page.indexable) { nIdx++; entries.push({ loc: page.canonical, priority: '0.5', changefreq: 'monthly', lastmod: (s.updated_at || ctx.TODAY).slice(0, 10) }); }
          }
        }
      }
    }
    console.log(`  ✓ /${slug}/: ${total} fichas (${nFichas} páginas de ficha, ${nIdx} indexables) · ${entries.length} URLs en sitemap-${slug}.xml`);
    out.push({ slug, entries });
  }
  return out;
}

function organizar(ctx, pais, tk, rows) {
  const { slugify } = ctx;
  const conteoDesc = new Map();
  for (const s of rows) { const d = descripcionDe(s); if (d) conteoDesc.set(normDesc(d), (conteoDesc.get(normDesc(d)) || 0) + 1); }
  const grupos = new Map();
  const usados = new Set();
  for (const s of rows) {
    const prov = (s.provincia || '').trim();
    const provSlug = prov ? slugify(prov) : slugify(`sin ${pais.region}`); // sin tildes en la URL ('sin-region')
    if (!grupos.has(provSlug)) grupos.set(provSlug, { provSlug, prov, nombre: prov ? (pais.provDisplay[prov] || prov) : `Sin ${pais.region} indicada`, shops: [] });
    const g = grupos.get(provSlug);
    let base = slugify(s.nombre) || `${tk}-${s.id}`;
    if (usados.has(`${provSlug}/${base}`)) base = `${base}-${s.id}`;
    usados.add(`${provSlug}/${base}`);
    s._slug = base;
    s._idx = fichaIndexable(s, conteoDesc);
    g.shops.push(s);
  }
  // orden estable: provincias con más fichas primero, luego alfabético
  const ordenados = new Map([...grupos.entries()].sort((a, b) => b[1].shops.length - a[1].shops.length || a[1].nombre.localeCompare(b[1].nombre, 'es')));
  return { rows, grupos: ordenados };
}

// ── Piezas comunes ─────────────────────────────────────────────────────────────
function navPais(ctx, slug) {
  let nav = ctx.SHELL_NAV
    .replace('href="/growshops.html"', `href="/${slug}/growshops/"`)
    .replace('href="/asociaciones.html"', `href="/${slug}/asociaciones/"`)
    .replace('href="/tiendas-cbd.html"', `href="/${slug}/tiendas-cbd/"`);
  // "Empresas" son productos B2B solo para España
  nav = nav.replace(/<div class="cc-grp">Empresas<\/div>[\s\S]*?(?=<div class="cc-grp">)/, '');
  return nav;
}

function pageShell(ctx, slug, pais, { title, desc, canonical, jsonld, bodyHtml, indexable, image, hreflangs }) {
  return ctx.shell({
    title, desc, canonical, image, jsonld, bodyHtml,
    robots: indexable ? 'index,follow,max-image-preview:large' : 'noindex,follow',
    lang: pais.locale, ogLocale: pais.og, nav: navPais(ctx, slug),
    hreflangs: hreflangs || [{ lang: pais.locale, href: canonical }],
  });
}

function breadcrumbLd(ctx, items) {
  return { '@type': 'BreadcrumbList', itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) };
}

function faqBlock(ctx, faq) {
  const { esc } = ctx;
  return `<div class="faq"><h2>Preguntas frecuentes</h2>${faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}</div>`;
}
const faqLd = (faq) => ({ '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });

const fmt = (n) => n.toLocaleString('es-ES');

// ── Portada del país ───────────────────────────────────────────────────────────────
function hubPais(ctx, slug, pais, datos, total) {
  const { esc, SITE, CBD_CSS, trimText } = ctx;
  const canonical = `${SITE}/${slug}/`;
  const n = (k) => datos[k].rows.length;
  const indexable = total > 0;
  const title = `Directorio cannabis en ${pais.nombre}: clubes, growshops y CBD`;
  const desc = total > 0
    ? trimText(`${fmt(n('growshops'))} growshops, ${fmt(n('asociaciones'))} clubes y asociaciones y ${fmt(n('tiendas-cbd'))} tiendas de CBD en ${pais.nombre}, por ${pais.region}. Dirección y contacto cuando están disponibles.`, 160)
    : `Directorio de cannabis en ${pais.nombre}: clubes, growshops y tiendas de CBD. Estamos reuniendo los primeros datos del país.`;
  const faq = [
    ...pais.faq,
    { q: `¿Cómo se organiza el directorio de ${pais.nombre}?`,
      a: `Las fichas se agrupan por ${pais.region} y por tipo: growshops, clubes y asociaciones, y tiendas de CBD. Los datos proceden de fuentes públicas y de aportes de la comunidad; las fichas que todavía no hemos verificado se indican como tales.` },
    { q: '¿Cómo añado o reclamo mi ficha?',
      a: 'Escríbenos a hola@cannabicultor.com con los datos del local o, si ya aparece, usa el enlace «Reclamar propiedad» de su ficha para verificarla y mantenerla al día.' },
  ];
  const tipos = Object.entries(TIPOS).filter(([k]) => n(k) > 0);
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(ctx, [['Inicio', `${SITE}/`], [pais.nombre, canonical]]),
      { '@type': 'CollectionPage', name: title, url: canonical, inLanguage: pais.locale, about: `Cannabis en ${pais.nombre}`,
        ...(tipos.length ? { mainEntity: { '@type': 'ItemList', itemListElement: tipos.map(([k, t], i) => ({ '@type': 'ListItem', position: i + 1, name: `${t.h} en ${pais.nombre}`, url: `${SITE}/${slug}/${k}/` })) } } : {}) },
      faqLd(faq),
    ],
  };
  const cards = tipos.map(([k, t]) => {
    const top = [...datos[k].grupos.values()].filter((g) => g.prov).slice(0, 3).map((g) => g.nombre).join(', ');
    return `<a class="dir-card" href="/${slug}/${k}/"><b>${esc(t.h)}</b><span>${fmt(n(k))} ${esc(n(k) === 1 ? t.singular : t.plural)}${top ? ` · ${esc(top)}` : ''}</span></a>`;
  }).join('\n');
  const body = `<style>${CBD_CSS}</style>
<nav class="crumbs"><a href="/">Inicio</a> › ${esc(pais.nombre)}</nav>
<h1>Directorio cannabis en ${esc(pais.nombre)}<span class="by">Clubes, growshops y tiendas de CBD por ${esc(pais.region)}</span></h1>
${total > 0 ? `<p class="body">Reunimos <strong>${fmt(total)} fichas</strong> de cannabis en ${esc(pais.nombre)}: ${fmt(n('growshops'))} growshops (${esc(TIPOS.growshops.que)}), ${fmt(n('asociaciones'))} clubes y asociaciones, y ${fmt(n('tiendas-cbd'))} tiendas de CBD. Elige un tipo para ver el listado por ${esc(pais.region)}.</p>
<div class="dir-grid">${cards}</div>`
  : `<p class="body">Todavía no tenemos fichas de ${esc(pais.nombre)}. Estamos reuniendo los primeros datos. Si conoces un growshop, club o tienda de CBD, escríbenos a <a href="mailto:hola@cannabicultor.com">hola@cannabicultor.com</a>.</p>`}
${faqBlock(ctx, faq)}`;
  return { html: pageShell(ctx, slug, pais, { title, desc, canonical, jsonld, bodyHtml: body, indexable,
    // Par recíproco con la home solo si la portada se indexa (un país vacío va noindex, sin hreflang cruzado).
    hreflangs: indexable ? [{ lang: pais.locale, href: canonical }, { lang: 'es', href: `${SITE}/` }, { lang: 'x-default', href: `${SITE}/` }] : undefined }) };
}

// ── Portada por tipo ──────────────────────────────────────────────────────────────
function tipoPage(ctx, slug, pais, tk, t, d) {
  const { esc, SITE, CBD_CSS, trimText } = ctx;
  const canonical = `${SITE}/${slug}/${tk}/`;
  const total = d.rows.length;
  const provs = [...d.grupos.values()].filter((g) => g.prov);
  const title = `${t.h} en ${pais.nombre} (${fmt(total)}) | Directorio por ${pais.region}`;
  const desc = trimText(`Directorio de ${t.plural} en ${pais.nombre}: ${fmt(total)} fichas en ${provs.length} ${provs.length === 1 ? pais.region : pais.regiones}. Dirección, teléfono y mapa cuando están disponibles.`, 160);
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(ctx, [['Inicio', `${SITE}/`], [pais.nombre, `${SITE}/${slug}/`], [t.h, canonical]]),
      { '@type': 'CollectionPage', name: title, url: canonical, inLanguage: pais.locale,
        mainEntity: { '@type': 'ItemList', itemListElement: [...d.grupos.values()].map((g, i) => ({ '@type': 'ListItem', position: i + 1, name: `${t.h} en ${g.nombre}`, url: `${SITE}/${slug}/${tk}/${g.provSlug}/` })) } },
    ],
  };
  const lista = [...d.grupos.values()].map((g) => `<li><a href="/${slug}/${tk}/${g.provSlug}/">${esc(g.nombre)}</a> <span style="color:var(--text3)">(${g.shops.length})</span></li>`).join('');
  const body = `<style>${CBD_CSS}</style>
<nav class="crumbs"><a href="/">Inicio</a> › <a href="/${slug}/">${esc(pais.nombre)}</a> › ${esc(t.h)}</nav>
<h1>${esc(t.h)} en ${esc(pais.nombre)}</h1>
<p class="body">Directorio de <strong>${fmt(total)} ${esc(total === 1 ? t.singular : t.plural)}</strong> en ${esc(pais.nombre)}, repartidos en ${provs.length} ${esc(provs.length === 1 ? pais.region : pais.regiones)}${provs[0] ? `; ${esc(provs[0].nombre)} es ${pais.region === 'provincia' ? 'la' : 'el/la'} ${esc(pais.region)} con más fichas (${provs[0].shops.length})` : ''}. Incluye dirección, teléfono, web y mapa cuando los conocemos.</p>
<ul class="city-list">${lista}</ul>
<p class="body"><a class="btn ghost" href="/${slug}/">← Directorio cannabis en ${esc(pais.nombre)}</a></p>`;
  return { html: pageShell(ctx, slug, pais, { title, desc, canonical, jsonld, bodyHtml: body, indexable: true }) };
}

// ── Listado por provincia ─────────────────────────────────────────────────────────
function provPage(ctx, slug, pais, tk, t, d, g, indexable) {
  const { esc, SITE, CBD_CSS, trimText } = ctx;
  const canonical = `${SITE}/${slug}/${tk}/${g.provSlug}/`;
  const n = g.shops.length;
  const title = `${t.h} en ${g.prov || g.nombre} (${n}) | ${pais.nombre}`;
  const ciudades = [...new Set(g.shops.map((s) => s.ciudad).filter(Boolean))];
  const desc = trimText(`${n} ${n === 1 ? t.singular : t.plural} en ${g.nombre}, ${pais.nombre}${ciudades.length ? `: ${ciudades.slice(0, 4).join(', ')}` : ''}. Dirección, teléfono y cómo llegar cuando están disponibles.`, 160);
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(ctx, [['Inicio', `${SITE}/`], [pais.nombre, `${SITE}/${slug}/`], [t.h, `${SITE}/${slug}/${tk}/`], [g.nombre, canonical]]),
      { '@type': 'CollectionPage', name: title, url: canonical, inLanguage: pais.locale,
        mainEntity: { '@type': 'ItemList', itemListElement: g.shops.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.nombre, url: `${SITE}/${slug}/${tk}/${g.provSlug}/${s._slug}/` })) } },
    ],
  };
  const cards = g.shops.map((s) => `<a class="dir-card" href="/${slug}/${tk}/${g.provSlug}/${s._slug}/"><b>${esc(s.nombre)}</b><span>${esc([s.direccion, s.ciudad].filter(Boolean).join(' · ') || g.nombre)}</span></a>`).join('\n');
  const otras = [...d.grupos.values()].filter((x) => x !== g && x.prov).slice(0, 12)
    .map((x) => `<li><a href="/${slug}/${tk}/${x.provSlug}/">${esc(x.nombre)}</a> <span style="color:var(--text3)">(${x.shops.length})</span></li>`).join('');
  const body = `<style>${CBD_CSS}</style>
<nav class="crumbs"><a href="/">Inicio</a> › <a href="/${slug}/">${esc(pais.nombre)}</a> › <a href="/${slug}/${tk}/">${esc(t.h)}</a> › ${esc(g.nombre)}</nav>
<h1>${esc(t.h)} en ${esc(g.nombre)}</h1>
<p class="body">Hemos reunido <strong>${n} ${esc(n === 1 ? t.singular : t.plural)}</strong> en ${esc(g.nombre)}${ciudades.length ? `, con presencia en ${esc(ciudades.slice(0, 6).join(', '))}` : ''}. Cada ficha muestra dirección, teléfono, web y mapa cuando los conocemos.</p>
<div class="dir-grid">${cards}</div>
${otras ? `<h2>Otras ${esc(pais.regiones)}</h2><ul class="city-list">${otras}</ul>` : ''}
<p class="body"><a class="btn ghost" href="/${slug}/${tk}/">← ${esc(t.h)} en ${esc(pais.nombre)}</a></p>`;
  return { html: pageShell(ctx, slug, pais, { title, desc, canonical, jsonld, bodyHtml: body, indexable }) };
}

// ── Ficha ───────────────────────────────────────────────────────────────────────────
function fichaPage(ctx, slug, pais, tk, t, g, s) {
  const { esc, SITE, CBD_CSS, LEAFLET, leafletScript, trimText } = ctx;
  const canonical = `${SITE}/${slug}/${tk}/${g.provSlug}/${s._slug}/`;
  const lugar = s.ciudad || g.nombre;
  const indexable = s._idx;
  const addr = [s.direccion, s.cp, s.ciudad, g.prov].filter(Boolean).join(', ');
  const exacta = geoExacta(s);
  const d = descripcionDe(s);
  const title = `${s.nombre} · ${CAP(t.singular)} en ${lugar} | Cannabicultor`;
  const desc = trimText(d || `${s.nombre} es un ${t.singular} en ${lugar}, ${pais.nombre}. Dirección, teléfono y cómo llegar cuando están disponibles.`, 160);
  const ig = s.instagram ? (/^https?:/.test(s.instagram) ? s.instagram : `https://www.instagram.com/${s.instagram.replace(/^@/, '')}`) : null;

  const rows = [];
  if (addr) rows.push(['Dirección', esc(addr)]);
  if (s.telefono) rows.push(['Teléfono', `<a href="tel:${esc(s.telefono)}">${esc(s.telefono)}</a>`]);
  if (s.horario) rows.push(['Horario', esc(s.horario)]);
  if (s.web) rows.push(['Web', `<a href="${esc(s.web)}" rel="nofollow noopener" target="_blank">${esc(s.web)}</a>`]);
  if (ig) rows.push(['Instagram', `<a href="${esc(ig)}" rel="nofollow noopener" target="_blank">${esc(s.instagram)}</a>`]);

  const ent = {
    '@type': t.schema, name: s.nombre, '@id': canonical, url: canonical,
    ...(s.logo_url ? { image: s.logo_url } : {}),
    ...(s.telefono ? { telephone: s.telefono } : {}),
    ...(s.web ? { sameAs: [s.web] } : {}),
    address: {
      '@type': 'PostalAddress',
      ...(s.direccion ? { streetAddress: s.direccion } : {}),
      ...(lugar ? { addressLocality: lugar } : {}),
      ...(s.cp ? { postalCode: s.cp } : {}),
      ...(g.prov ? { addressRegion: g.prov } : {}),
      addressCountry: pais.code,
    },
    ...(exacta ? { geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lon } } : {}),
    ...(s.num_resenas ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: String(s.media_resenas), reviewCount: String(s.num_resenas) } } : {}),
  };
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(ctx, [['Inicio', `${SITE}/`], [pais.nombre, `${SITE}/${slug}/`], [t.h, `${SITE}/${slug}/${tk}/`], [g.nombre, `${SITE}/${slug}/${tk}/${g.provSlug}/`], [s.nombre, canonical]]),
      ent,
    ],
  };
  const dir = exacta ? `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`
    : (addr ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr + ', ' + pais.nombre)}` : '');
  const body = `<style>${CBD_CSS}</style>${exacta ? LEAFLET : ''}
<nav class="crumbs"><a href="/">Inicio</a> › <a href="/${slug}/">${esc(pais.nombre)}</a> › <a href="/${slug}/${tk}/">${esc(t.h)}</a> › <a href="/${slug}/${tk}/${g.provSlug}/">${esc(g.nombre)}</a> › ${esc(s.nombre)}</nav>
<h1>${esc(s.nombre)}<span class="by">${esc(CAP(t.singular))} en ${esc(lugar)}, ${esc(pais.nombre)}</span></h1>
<table class="facts">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>
${d ? `<div class="body"><p>${esc(d)}</p></div>` : ''}
${s.verificado ? '' : `<p class="body" style="font-size:14px;color:var(--text3)">Ficha sin verificar: los datos proceden de fuentes públicas y pueden haber cambiado. Si eres el titular, reclama la ficha para verificarla.</p>`}
<div class="actions">
${s.web ? `<a class="btn primary" href="${esc(s.web)}" rel="nofollow noopener" target="_blank">Visitar web</a>` : ''}
${dir ? `<a class="btn ghost" href="${dir}" target="_blank" rel="noopener">🧭 Cómo llegar</a>` : ''}
${s.telefono ? `<a class="btn ghost" href="tel:${esc(s.telefono)}">📞 Llamar</a>` : ''}
</div>
${exacta ? `<div id="map" class="map"></div>${leafletScript(s.lat, s.lon, s.nombre)}` : ''}
<div class="claim"><strong>¿Eres el titular de esta ficha?</strong> Verifica tus datos, actualízalos y responde reseñas. <a href="/login.html?next=/${slug}/${tk}/${g.provSlug}/${s._slug}/&reclamar=${t.resena}:${s.id}">Reclamar propiedad →</a></div>
<div data-resenas data-tipo="${t.resena}" data-id="${s.id}"></div>
<p class="body"><a href="/${slug}/${tk}/${g.provSlug}/">← Más ${esc(t.plural)} en ${esc(g.nombre)}</a></p>`;
  return { html: pageShell(ctx, slug, pais, { title, desc, canonical, image: s.logo_url || null, jsonld, bodyHtml: body, indexable }), canonical, indexable };
}
