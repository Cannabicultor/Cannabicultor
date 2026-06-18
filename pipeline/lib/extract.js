// pipeline/lib/extract.js
// Funciones de extracción reutilizables para el pipeline local.
// Adaptadas de la lógica probada en enrich-breeders.mjs y enrich-varieties-detailed.mjs
// para que funcionen en sitios arbitrarios de la red.

export function pick(html, re) {
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

export function absolutize(u, base) {
  if (!u) return null;
  try {
    return new URL(u, base).href;
  } catch {
    return null;
  }
}

/**
 * Extrae metadatos básicos de una página de breeder (o sitio similar).
 */
export function extractBreederData(html, baseUrl) {
  let logo =
    pick(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    pick(html, /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
    pick(html, /<link[^>]+rel=["'](?:icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/i) ||
    pick(html, /<img[^>]+(?:class|id)=["'][^"']*(?:logo|brand|header)[^"']*["'][^>]+src=["']([^"']+)["']/i) ||
    pick(html, /<img[^>]+src=["']([^"']*(?:logo|brand)[^"']*\.(?:png|jpg|jpeg|svg|webp))["']/i);

  if (!logo) {
    const brandfetch = pick(html, /brandfetch\.io\/[^"']+logo[^"']*/i);
    if (brandfetch) logo = 'https://' + brandfetch;
  }

  const descripcion =
    pick(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{30,400})["']/i) ||
    pick(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{30,400})["']/i);

  const ig = pick(html, /instagram\.com\/([A-Za-z0-9_.]+)/i);
  const yt = pick(html, /(youtube\.com\/(?:@|channel\/|c\/)[A-Za-z0-9_\-./]+)/i);
  const fb = pick(html, /facebook\.com\/([A-Za-z0-9_.\-]+)/i);

  const strainImg =
    pick(html, /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i) ||
    pick(html, /<img[^>]+src=["']([^"']*(?:strain|bud|flower|product)[^"']*\.(?:png|jpg|jpeg|webp))["']/i);

  const redes = [yt && 'YouTube: ' + yt, fb && 'Facebook: ' + fb].filter(Boolean).join(' · ') || null;

  const paisMatch = html.match(/(?:based in|from|ubicado en|país|country|España|USA|Canada|Netherlands)[:\s]+([A-Za-zÀ-ÿ\s]{2,30})/i);
  const yearMatch = html.match(/(?:since|fundad[oa]|established|cread[oa] en|desde el)[:\s]+(\d{4})/i);

  return {
    logo_url: logo ? absolutize(logo, baseUrl) : null,
    descripcion: descripcion ? descripcion.replace(/\s+/g, ' ').slice(0, 280) : null,
    instagram: ig && !['p', 'reel', 'explore'].includes(ig) ? ig : null,
    redes_sociales: redes,
    strain_img_url: strainImg ? absolutize(strainImg, baseUrl) : null,
    pais_origen: paisMatch ? paisMatch[1].trim() : null,
    año_fundacion: yearMatch ? parseInt(yearMatch[1], 10) : null,
  };
}

export function guessBreederName(html, baseUrl) {
  let name =
    pick(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    pick(html, /<title>([^<]+)<\/title>/i);

  if (name) {
    name = name.replace(/\s*[-|•]\s*.*/, '').trim();
    if (name.length > 2 && name.length < 80) return name;
  }

  try {
    const host = new URL(baseUrl).hostname.replace(/^www\./, '');
    const parts = host.split('.');
    if (parts.length > 1) {
      const candidate = parts[0].replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      if (candidate.length > 2) return candidate;
    }
  } catch {}

  return null;
}

/**
 * Extracción básica de datos de una variedad desde una página de detalle.
 * Enfocado en datos comunes (nombre, días, tipo, genética, etc.).
 */
export function extractVarietyData(html, baseUrl, breederId = null) {
  const nombre =
    pick(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    pick(html, /<h1[^>]*>([^<]+)<\/h1>/i) ||
    pick(html, /<title>([^<]+)<\/title>/i);

  const flor = pick(html, /(\d{2,3})\s*(?:días|days|day)/i);
  const floracion_dias = flor ? parseInt(flor, 10) : null;

  // Tipo simple
  let tipo = 'feminizada';
  const lower = html.toLowerCase();
  if (/auto|autoflower|ruderalis/.test(lower)) tipo = 'automatica';
  else if (/regular/.test(lower) && !/fem/.test(lower)) tipo = 'regular';
  if (/cbd|alto en cbd/.test(lower)) tipo = 'CBD';

  const genetica =
    pick(html, /genetic[as]*[:\s]+([^<\n]{5,60})/i) ||
    pick(html, /linaje|lineage[:\s]+([^<\n]{5,60})/i);

  // THC/CBD simple
  const thc = pick(html, /thc[:\s]+(\d{1,2})/i);
  const cbd = pick(html, /cbd[:\s]+(\d{1,2})/i);

  const efectos = [];
  const aromaMatch = lower.match(/efecto[s]*[:\s]+([^<\n.]{10,80})/);
  if (aromaMatch) efectos.push(...aromaMatch[1].split(/,| y | and /).map(s => s.trim()).filter(Boolean).slice(0,3));

  return {
    nombre: nombre ? nombre.replace(/\s*[-|•].*/, '').trim() : 'Variedad sin nombre',
    floracion_dias,
    tipo,
    genetica: genetica ? genetica.trim() : null,
    thc_pct: thc ? parseFloat(thc) : null,
    cbd_pct: cbd ? parseFloat(cbd) : null,
    efectos: efectos.length ? efectos : null,
    breeder_id: breederId,
    data_source: 'web_crawl',
  };
}
