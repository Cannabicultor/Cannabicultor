#!/usr/bin/env node
/**
 * pipeline/discovery/discover.js
 *
 * Motor de Descubrimiento GENERAL (toda la red).
 * Enfocado en ejecución local on-demand desde tu Mac.
 *
 * No depende de estar "vivo" ni de VPS. Tú decides cuándo ejecutarlo.
 *
 * Uso recomendado:
 *   node pipeline/discovery/discover.js --help
 *   node pipeline/discovery/discover.js --mode sitemaps
 *   node pipeline/discovery/discover.js --mode seeds --terms "new cannabis strain" "banco de semillas california" --limit 30
 *
 * Características:
 * - Descubre desde sitemaps de múltiples fuentes (no solo Seedfinder)
 * - Soporta "seeds" de búsqueda (términos que luego puedes enriquecer manualmente o con API)
 * - Crawl básico de links desde páginas conocidas de breeders
 * - Persiste en tabla `discovered_sources` (evita duplicados)
 * - Clasificación simple de tipo de URL
 * - Totalmente local y controlado por ti
 *
 * Futuro fácil de extender:
 * - Añadir soporte SerpApi / Google Custom Search para dorks reales
 * - Crawler más profundo con Playwright cuando quieras
 * - Detección de nuevas variedades en foros/Reddit
 */

import { createPipelineClient, sleep, log } from '../lib/supabase-client.js';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sb = createPipelineClient();

const DEFAULT_SITEMAPS = [
  // Añade sitemaps de otros bancos o directorios aquí si los encuentras.
  // Ej: 'https://www.ejemplo-banco.com/sitemap.xml',
];

const SERPAPI_KEY = process.env.SERPAPI_KEY || null;

const DEFAULT_SEED_TERMS = [
  'new cannabis strain release 2025 OR 2026',
  'banco de semillas' + ' ' + 'genética nueva',
  'seed bank' + ' ' + 'terpenes profile' + ' ' + 'breeder',
];

function classifyUrl(url) {
  const u = url.toLowerCase();
  if (/\/breeder\/|\/banco\/|seedbank|seed-bank/.test(u)) return 'breeder_home';
  if (/strain|variedad|genetic|semilla/.test(u) && !/blog|news/.test(u)) return 'strain_detail';
  if (/sitemap|catalog|lista|strains/.test(u)) return 'strain_listing';
  if (/news|blog|article|lanzamiento/.test(u)) return 'news';
  if (/\.pdf$/.test(u)) return 'lab_report';
  return 'other';
}

function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = '';
    // Quita tracking params comunes
    const paramsToDelete = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'fbclid'];
    paramsToDelete.forEach(p => u.searchParams.delete(p));
    return u.toString();
  } catch {
    return null;
  }
}

async function upsertSource(source) {
  const url = normalizeUrl(source.url);
  if (!url) return false;

  const payload = {
    url,
    source: source.source,
    type: source.type || classifyUrl(url),
    candidate_name: source.candidate_name || null,
    metadata: source.metadata || {},
    last_checked: new Date().toISOString(),
    status: 'new',   // Reset to 'new' on re-discovery so harvest can re-process for fresh data
  };

  const { error } = await sb
    .from('discovered_sources')
    .upsert(payload, { onConflict: 'url' });  // removed ignoreDuplicates so we can reset status

  if (error) {
    log('Error upsert source', url, error.message);
    return false;
  }
  return true;
}

async function crawlSitemap(sitemapUrl, limitPerSitemap = 200) {
  log(`Crawling sitemap: ${sitemapUrl}`);
  const discovered = [];

  try {
    const res = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'CannabicultorDiscoveryBot/0.2 (+local)' },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });

    const locs = [];
    $('loc').each((i, el) => {
      const loc = $(el).text().trim();
      if (loc) locs.push(loc);
    });

    // Soporte básico para sitemap index
    const isIndex = $('sitemap').length > 0 || /sitemapindex/i.test(xml);

    let toProcess = locs;
    if (isIndex) {
      log(`  Sitemap index detectado con ${locs.length} sub-sitemaps. Procesando primeros...`);
      toProcess = [];
      for (const sub of locs.slice(0, 5)) { // límite prudente
        try {
          const subRes = await fetch(sub, { headers: { 'User-Agent': 'CannabicultorDiscoveryBot/0.2' } });
          if (subRes.ok) {
            const subXml = await subRes.text();
            const $sub = cheerio.load(subXml, { xmlMode: true });
            $sub('loc').each((i, el) => {
              const l = $sub(el).text().trim();
              if (l) toProcess.push(l);
            });
          }
          await sleep(800);
        } catch (e) {
          log('  Error sub-sitemap', sub, e.message);
        }
        if (toProcess.length > limitPerSitemap * 2) break;
      }
    }

    const candidates = toProcess.slice(0, limitPerSitemap);

    for (const url of candidates) {
      const normalized = normalizeUrl(url);
      if (!normalized) continue;

      const type = classifyUrl(normalized);
      const inserted = await upsertSource({
        url: normalized,
        source: `sitemap:${new URL(sitemapUrl).hostname}`,
        type,
        metadata: { sitemap: sitemapUrl },
      });

      if (inserted) {
        discovered.push(normalized);
      }
    }

    log(`  → ${discovered.length} nuevas fuentes de ${candidates.length} procesadas en este sitemap`);
    return discovered;
  } catch (e) {
    log(`  Error crawling ${sitemapUrl}:`, e.message);
    return [];
  }
}

async function discoverFromSeeds(terms, maxPerTerm = 15) {
  log(`Descubrimiento por seeds/términos: ${terms.join(' | ')}`);
  const discovered = [];

  // 1. SerpApi (recomendado para búsquedas reales "toda la red")
  if (SERPAPI_KEY) {
    log('Usando SerpApi para búsquedas reales...');
    for (const term of terms.slice(0, 3)) {  // limitar para no gastar cuota
      try {
        const serpUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(term + ' cannabis OR marijuana OR "seed bank" OR breeder')}&engine=google&num=15&api_key=${SERPAPI_KEY}`;
        const res = await fetch(serpUrl, { signal: AbortSignal.timeout(15000) });
        if (res.ok) {
          const json = await res.json();
          if (json.error) {
            log('  SerpApi devolvió error:', json.error);
            log('  (Verifica que la SERPAPI_KEY en .env sea exactamente la del dashboard, sin espacios ni comillas extra)');
            continue;
          }
          const organic = json.organic_results || [];
          for (const r of organic.slice(0, 8)) {
            const norm = normalizeUrl(r.link);
            if (norm) {
              const ok = await upsertSource({
                url: norm,
                source: 'serpapi:google',
                type: classifyUrl(norm),
                candidate_name: r.title ? r.title.split(/[-|•]/)[0].trim() : null,
                metadata: { term, snippet: r.snippet?.slice(0,120) || null, rank: r.position },
              });
              if (ok) discovered.push(norm);
            }
          }
        } else {
          log('  SerpApi HTTP error:', res.status);
        }
        await sleep(800);
      } catch (e) {
        log('  SerpApi error for term', term, e.message);
      }
    }
  } else {
    log('Sin SERPAPI_KEY — usando modo seeds manual + crawl (añade SERPAPI_KEY en .env para búsquedas reales)');
  }

  // 2. Seeds manuales - solo para tracking, NO insertamos URLs falsas para que harvest no intente fetch
  for (const term of terms) {
    // No insertamos "search:seed:..." como URL procesable.
    // Solo logueamos los términos usados.
    log(`  Seed term registrado (para tracking): ${term}`);
  }

  // 3. Puntos de partida conocidos + crawl ligero
  const knownStartingPoints = [
    'https://seedfinder.eu/en/database/breeder/',
    'https://www.royalqueenseeds.es/',
    'https://dinafemseeds.com/',
    'https://www.sensi-seeds.com/',
    // Añade más
  ];

  for (const start of knownStartingPoints) {
    const normalized = normalizeUrl(start);
    if (normalized) {
      const ok = await upsertSource({
        url: normalized,
        source: 'seed:starting-point',
        type: classifyUrl(normalized),
        metadata: { seed_term: terms[0] || 'general' },
      });
      if (ok) discovered.push(normalized);
    }
  }

  for (const start of knownStartingPoints.slice(0, 4)) {
    try {
      const res = await fetch(start, {
        headers: { 'User-Agent': 'CannabicultorDiscoveryBot/0.2 (+local, polite)' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);
      const links = new Set();

      $('a[href]').each((i, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        try {
          const abs = new URL(href, start).toString();
          if (/seed|strain|breeder|genetic|banco|semilla/i.test(abs)) {
            links.add(abs);
          }
        } catch {}
      });

      for (const link of Array.from(links).slice(0, maxPerTerm)) {
        const norm = normalizeUrl(link);
        if (norm && await upsertSource({
          url: norm,
          source: `crawl:${new URL(start).hostname}`,
          type: classifyUrl(norm),
        })) {
          discovered.push(norm);
        }
      }
      await sleep(1000);
    } catch (e) {}
  }

  log(`  → ${discovered.length} candidatos desde seeds/starting points`);
  return discovered;
}

// Helper to try fetching a sitemap from common locations for a domain
async function trySitemapForDomain(domain) {
  const candidates = [
    `https://${domain}/sitemap.xml`,
    `https://${domain}/sitemap_index.xml`,
    `https://www.${domain}/sitemap.xml`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'CannabicultorDiscoveryBot/0.2 (+local)' },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        return url;
      }
    } catch {}
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const mode = (args.find(a => a.startsWith('--mode=')) || '--mode=sitemaps').split('=')[1];
  const limit = parseInt((args.find(a => a.startsWith('--limit=')) || '--limit=150').split('=')[1], 10);

  let terms = DEFAULT_SEED_TERMS;
  const termsArg = args.find(a => a.startsWith('--terms='));
  if (termsArg) {
    terms = termsArg.split('=')[1].split(',').map(t => t.trim()).filter(Boolean);
  }

  log('=== Cannabicultor Discovery (local on-demand, toda la red) ===');
  log(`Modo: ${mode} | Límite aproximado: ${limit}`);

  let totalNew = 0;

  if (mode === 'sitemaps' || mode === 'all') {
    const sitemaps = [...DEFAULT_SITEMAPS];
    // Puedes pasar sitemaps extra: --sitemaps=https://otro.com/sitemap.xml,https://...
    const custom = args.find(a => a.startsWith('--sitemaps='));
    if (custom) {
      custom.split('=')[1].split(',').forEach(s => sitemaps.push(s.trim()));
    }

    for (const sm of sitemaps) {
      const news = await crawlSitemap(sm, Math.floor(limit / sitemaps.length));
      totalNew += news.length;
      await sleep(1500);
    }
  }

  if (mode === 'seeds' || mode === 'all') {
    const news = await discoverFromSeeds(terms, 12);
    totalNew += news.length;
  }

  if (mode === 'help' || !['sitemaps', 'seeds', 'all'].includes(mode)) {
    console.log(`
Uso:
  node pipeline/discovery/discover.js --mode=sitemaps
  node pipeline/discovery/discover.js --mode=seeds --terms="new strain 2026","banco semillas"
  node pipeline/discovery/discover.js --mode=all --limit=200

Opciones:
  --mode=sitemaps | seeds | all
  --terms="término1,término2"
  --limit=150
  --sitemaps=url1,url2   (solo con mode sitemaps o all)
    `);
    process.exit(0);
  }

  log(`\nDescubrimiento completado. Nuevas/actualizadas fuentes: ~${totalNew}`);
  log('Revisa en Supabase: SELECT * FROM discovered_sources ORDER BY discovered_at DESC LIMIT 30;');
  log('Luego puedes pasar a extracción con los scripts existentes o nuevos extractors en pipeline/extractors/');
}

main().catch(err => {
  console.error('Error fatal en discovery:', err);
  process.exit(1);
});
