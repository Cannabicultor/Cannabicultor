#!/usr/bin/env node
const SUPABASE_URL = 'https://gfyrsrdnvgnhtsuexjkb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SERVICE_KEY) { console.error('Falta SUPABASE_SERVICE_KEY'); process.exit(1); }

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
  const slug = 'demo-growbarato';
  const tenants = await sb(`sales_tenants?slug=eq.${encodeURIComponent(slug)}&select=id`);
  if (!tenants.length) throw new Error('tenant no encontrado');
  const tenantId = tenants[0].id;

  const pages = await sb(`sales_tenant_demo_page?tenant_id=eq.${tenantId}&select=html_content`);
  if (!pages.length) throw new Error('demo page no encontrada');
  const html = pages[0].html_content;

  const count = (html.match(/enriquedorta\.workers\.dev/g) || []).length;
  if (!count) { console.log('No aparece la URL vieja, nada que hacer.'); return; }

  const fixed = html.replaceAll('enriquedorta.workers.dev', 'nohumanclicks.workers.dev');

  await sb(`sales_tenant_demo_page?tenant_id=eq.${tenantId}`, {
    method: 'PATCH',
    body: JSON.stringify({ html_content: fixed, updated_at: new Date().toISOString() }),
  });

  console.log(`✓ Reemplazadas ${count} ocurrencias, guardado en Supabase.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
