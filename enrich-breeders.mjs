#!/usr/bin/env node
/**
 * enrich-breeders.mjs — Enriquecimiento automático de LOGOS + metadatos (SIN IA).
 *
 * Mejoras respecto a la versión anterior:
 * - También intenta extraer logo directamente de la página del breeder en Seedfinder
 *   (muchos logos viven en https://seedfinder.eu/storage/pics/00breeder/...)
 * - Más selectores de imagen (og, twitter, favicon, logo explícito, brandfetch fallback).
 * - Procesa breeders con website aunque ya tengan algunos campos (puedes forzar con FORCE=1).
 * - Guarda también strain_img_url cuando lo encuentra (foto representativa).
 * - Respeta "no sobrescribir datos buenos".
 *
 * Ejecutar:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node enrich-breeders.mjs
 *   BATCH=100 FORCE=1 node enrich-breeders.mjs     # para forzar más
 */

import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const BATCH  = Number(process.env.BATCH || 50);
const DELAY_MS = Number(process.env.DELAY_MS || 1500);
const FORCE = process.env.FORCE === '1';   // fuerza procesar aunque tenga algunos datos

if (!SB_URL || !SB_KEY) { console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
const sb = createClient(SB_URL, SB_KEY);

const sleep = ms => new Promise(r => setTimeout(r, ms));

function pick(html, re) { const m = html.match(re); return m ? m[1].trim() : null; }

function absolutize(u, base) {
  if (!u) return null;
  try { return new URL(u, base).href; } catch { return null; }
}

function extractFromHtml(html, baseUrl) {
  // Logos / imágenes principales (múltiples intentos)
  let logo =
    pick(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    pick(html, /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
    pick(html, /<link[^>]+rel=["'](?:icon|apple-touch-icon|apple-touch-icon-precomposed)["'][^>]+href=["']([^"']+)["']/i) ||
    pick(html, /<img[^>]+(?:class|id)=["'][^"']*(?:logo|brand|header)[^"']*["'][^>]+src=["']([^"']+)["']/i) ||
    pick(html, /<img[^>]+src=["']([^"']*(?:logo|brand)[^"']*\.(?:png|jpg|jpeg|svg|webp))["']/i);

  // Fallbacks comunes
  if (!logo) {
    const brandfetch = pick(html, /brandfetch\.io\/[^"']+logo[^"']*/i);
    if (brandfetch) logo = 'https://' + brandfetch;
  }

  const desc =
    pick(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{30,400})["']/i) ||
    pick(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{30,400})["']/i);

  const ig = pick(html, /instagram\.com\/([A-Za-z0-9_.]+)/i);
  const yt = pick(html, /(youtube\.com\/(?:@|channel\/|c\/)[A-Za-z0-9_\-./]+)/i);
  const fb = pick(html, /facebook\.com\/([A-Za-z0-9_.\-]+)/i);

  // Imagen de cepa / bud representativa (si aparece)
  const strainImg =
    pick(html, /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i) ||
    pick(html, /<img[^>]+src=["']([^"']*(?:strain|bud|flower|product)[^"']*\.(?:png|jpg|jpeg|webp))["']/i);

  const redes = [yt && 'YouTube: ' + yt, fb && 'Facebook: ' + fb].filter(Boolean).join(' · ') || null;

  const logoAbs = logo ? absolutize(logo, baseUrl) : null;
  const logoOk = logoAbs && !/cdninstagram\.com\/rsrc\.php|via\.placeholder|favicon|32x32|16x16/i.test(logoAbs);

  return {
    logo_url: logoOk ? logoAbs : null,
    descripcion: desc ? desc.replace(/\s+/g, ' ').slice(0, 280) : null,
    instagram: ig && !['p', 'reel', 'explore'].includes(ig) ? ig : null,
    redes_sociales: redes,
    strain_img_url: strainImg ? absolutize(strainImg, baseUrl) : null,
  };
}

// Intenta sacar logo de la página del breeder en Seedfinder (muy efectivo)
async function trySeedfinderLogo(slug) {
  if (!slug) return null;
  const candidates = [
    `https://seedfinder.eu/storage/pics/00breeder/${slug}.jpg`,
    `https://seedfinder.eu/storage/pics/00breeder/${slug}.png`,
    `https://seedfinder.eu/storage/pics/00breeder/${slug.replace(/-/g,'')}.jpg`,
  ];
  for (const url of candidates) {
    try {
      const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(6000) });
      if (head.ok && (head.headers.get('content-type') || '').startsWith('image')) {
        return url;
      }
    } catch {}
  }
  return null;
}

async function run() {
  let query = sb.from('breeders')
    .select('id,breeder_name,website,seedfinder_slug,logo_url,instagram,descripcion,strain_img_url')
    .not('website', 'is', null)
    .order('cantidad_variedades', { ascending: false, nullsFirst: false })
    .limit(BATCH);

  if (!FORCE) {
    query = query.or('logo_url.is.null,instagram.is.null,descripcion.is.null,strain_img_url.is.null');
  }

  const { data, error } = await query;

  if (error) { console.error(error.message); return; }
  if (!data?.length) { console.log('No quedan breeders pendientes.'); return; }

  console.log(`Procesando ${data.length} breeders (FORCE=${FORCE})…`);

  let ok = 0;
  for (const b of data) {
    const patch = {};

    try {
      // 1) Web oficial del breeder (mejor fuente de verdad)
      if (b.website) {
        const res = await fetch(b.website, {
          headers: { 'User-Agent': 'CannabicultorBot/1.0 (+https://cannabicultor.com)' },
          redirect: 'follow',
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
          const html = await res.text();
          const got = extractFromHtml(html, b.website);

          for (const k of ['logo_url', 'instagram', 'descripcion', 'redes_sociales', 'strain_img_url']) {
            if (got[k] && !b[k]) patch[k] = got[k];
          }
        }
      }

      // 2) Fallback / refuerzo con imágenes que ya aloja Seedfinder (muy útil para logos)
      if (!patch.logo_url && b.seedfinder_slug) {
        const sfLogo = await trySeedfinderLogo(b.seedfinder_slug);
        if (sfLogo && !b.logo_url) patch.logo_url = sfLogo;
      }

      if (Object.keys(patch).length) {
        await sb.from('breeders').update(patch).eq('id', b.id);
        ok++;
        console.log(`✓ ${b.breeder_name}:`, Object.keys(patch).join(', '));
      } else {
        console.log(`· ${b.breeder_name}: sin novedades`);
      }
    } catch (e) {
      console.log(`✗ ${b.breeder_name}: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`\nHecho. ${ok}/${data.length} breeders actualizados.`);
}

run();
