#!/usr/bin/env node
/**
 * Migra el HTML de cada demo B2B (preview-b2b/*.html) desde el repo público
 * de GitHub a la tabla privada sales_tenant_demo_page en Supabase.
 *
 * Por qué: cualquiera puede navegar github.com/Cannabicultor/Cannabicultor
 * (repo público) y ver el nombre de TODOS los clientes con demo solo
 * mirando los archivos en preview-b2b/. Moviendo el HTML a Supabase (tras
 * la service key) y sirviéndolo por token opaco (/demo/{token}), un
 * cliente no puede enterarse de que existen otros.
 *
 * Uso:
 *   SUPABASE_SERVICE_KEY=xxx node scripts/migrate-demo-pages-to-supabase.mjs
 *
 * Requiere: correr desde la raíz del repo (usa rutas relativas a preview-b2b/).
 * Mapeo archivo -> tenant_slug se declara abajo a mano (a propósito, para
 * no adivinar): añadir una línea por cada demo nuevo antes de correrlo.
 */

const SUPABASE_URL = 'https://gfyrsrdnvgnhtsuexjkb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SERVICE_KEY) {
  console.error('Falta SUPABASE_SERVICE_KEY en el entorno.');
  process.exit(1);
}

// archivo en preview-b2b/  ->  slug en sales_tenants
const FILE_TO_SLUG = {
  'asesor-gb.html': 'demo-growbarato',
  // añadir aquí cada demo nueva, ej:
  // 'asesor-alchimia.html': 'demo-alchimia',
};

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const repoRoot = path.resolve(new URL('.', import.meta.url).pathname, '..');
  const previewDir = path.join(repoRoot, 'preview-b2b');

  for (const [file, slug] of Object.entries(FILE_TO_SLUG)) {
    const filePath = path.join(previewDir, file);
    const html = await fs.readFile(filePath, 'utf-8');

    const tenants = await sb(`sales_tenants?slug=eq.${encodeURIComponent(slug)}&select=id,demo_token`);
    if (!tenants.length) {
      console.error(`✗ ${file}: no existe tenant con slug "${slug}", saltando`);
      continue;
    }
    const { id: tenantId, demo_token } = tenants[0];

    await sb('sales_tenant_demo_page', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates',
      body: JSON.stringify({ tenant_id: tenantId, html_content: html, updated_at: new Date().toISOString() }),
    });

    console.log(`✓ ${file} -> tenant ${slug} (${(html.length / 1024).toFixed(0)} KB) — nuevo link: /demo/${demo_token}`);
  }

  console.log('\nListo. Siguiente paso manual: git rm preview-b2b/*.html de los archivos migrados y commitear,');
  console.log('para que dejen de ser visibles en el repo público. No lo hace este script (por seguridad, a mano).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
