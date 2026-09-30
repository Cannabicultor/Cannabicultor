// =========================================================================
// WIDGET GROWSHOP — integración en una línea
//   <script src="https://growers-alliance-ai.nohumanclicks.workers.dev/widget.js?k=CLAVE" async></script>
// La tienda no toca nada más: la configuración (color, nombre, saludo,
// enlaces a producto) vive en sales_tenants.widget_config y se cambia desde
// admin-growshops.html sin que la tienda vuelva a pegar código.
// Cuota: conversaciones_mes gratis/mes + conversaciones_extra (packs, no
// caducan) + margen de cortesía del 10% para que el asesor no se corte de golpe.
// =========================================================================
const WIDGET_KEY_RE = /^[a-f0-9]{16}$/;
const WIDGET_MAX_MSG_CONV = 10; // "una conversación = un cliente atendido (hasta 10 mensajes)"
const WIDGET_CORTESIA = 0.1;

function widgetCors(request, tenant) {
  const origin = request.headers.get('Origin') || '';
  let permitido = '*';
  if (tenant && Array.isArray(tenant.dominios) && tenant.dominios.length && origin) {
    let host = '';
    try { host = new URL(origin).hostname.replace(/^www\./, ''); } catch {}
    const ok = tenant.dominios.some((d) => {
      const dd = String(d).toLowerCase().replace(/^www\./, '');
      return host === dd || host.endsWith('.' + dd);
    }) || LOCAL_ORIGIN_RE.test(origin);
    permitido = ok ? origin : 'null';
  }
  return {
    'Access-Control-Allow-Origin': permitido,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

async function resolveTenantByWidgetKey(env, key) {
  const k = String(key || '').trim().toLowerCase();
  if (!WIDGET_KEY_RE.test(k)) return null;
  const r = await sbRequest(env, `sales_tenants?widget_key=eq.${k}&status=neq.churned&select=id,slug,display_name,status,widget_config,dominios,conversaciones_mes,conversaciones_extra&limit=1`, { method: 'GET' });
  if (!r.ok || !Array.isArray(r.data) || !r.data.length) return null;
  return r.data[0];
}

function widgetPublicConfig(tenant) {
  const c = tenant.widget_config || {};
  return {
    nombre: c.nombre || `Asesor de ${tenant.display_name}`,
    subtitulo: c.subtitulo || 'Experto en cultivo · responde al momento',
    color: /^#[0-9a-f]{3,8}$/i.test(c.color || '') ? c.color : '#1f7a4d',
    logo: c.logo || '',
    saludo: c.saludo || '¡Hola! Soy el asesor de cultivo de la tienda. Cuéntame qué cultivas o qué necesitas y te recomiendo productos concretos de nuestro catálogo.',
    placeholder: c.placeholder || 'Ej: luz para armario de 80×80…',
    sugerencias: Array.isArray(c.sugerencias) && c.sugerencias.length ? c.sugerencias.slice(0, 4) : ['¿Qué luz para un armario de 80×80?', 'Necesito extracción para 100×100×200', '¿Qué abono para empezar en coco?'],
    imgBase: c.imgBase || '',
    productHref: c.productHref || '',
    posicion: c.posicion === 'izquierda' ? 'izquierda' : 'derecha',
    boton: c.boton || '¿Te ayudo a elegir?',
  };
}

async function handleWidgetConfig(url, env, request) {
  const tenant = await resolveTenantByWidgetKey(env, url.searchParams.get('k'));
  const cors = widgetCors(request, tenant);
  if (!tenant) return json({ error: 'widget_desconocido' }, 404, cors);
  return new Response(JSON.stringify(widgetPublicConfig(tenant)), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
  });
}

async function handleWidgetChat(body, env, request) {
  const tenant = await resolveTenantByWidgetKey(env, body?.k);
  const cors = widgetCors(request, tenant);
  if (!tenant) return json({ error: 'widget_desconocido' }, 404, cors);
  if (cors['Access-Control-Allow-Origin'] === 'null') return json({ error: 'dominio_no_autorizado' }, 403, cors);

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const nUser = messages.filter((m) => m && m.role === 'user').length;
  let conversationId = typeof body?.conversation_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.conversation_id) ? body.conversation_id : null;
  let msgs = messages;

  // Pasadas 10 preguntas, cuenta como un cliente nuevo (conversación nueva con el contexto reciente).
  if (conversationId && nUser > WIDGET_MAX_MSG_CONV) {
    conversationId = null;
    msgs = messages.slice(-6);
    while (msgs.length && msgs[0].role !== 'user') msgs = msgs.slice(1);
  }

  if (!conversationId) {
    const usoR = await sbRequest(env, 'rpc/sales_conversaciones_mes', { method: 'POST', body: JSON.stringify({ p_tenant: tenant.id }) });
    const usadas = Number(usoR.data) || 0;
    const gratis = Number(tenant.conversaciones_mes) || 0;
    const extra = Number(tenant.conversaciones_extra) || 0;
    if (usadas >= gratis) {
      if (extra > 0) {
        await sbRequest(env, `sales_tenants?id=eq.${tenant.id}&conversaciones_extra=gt.0`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ conversaciones_extra: extra - 1 }),
        });
      } else if (usadas >= Math.ceil(gratis * (1 + WIDGET_CORTESIA))) {
        console.log(JSON.stringify({ event: 'widget_cuota_agotada', tenant: tenant.slug, usadas }));
        return json({
          cuota_agotada: true,
          assistant_message: 'Ahora mismo el asesor está atendiendo a muchos clientes. Escríbenos por los datos de contacto de la tienda y te respondemos en persona.',
          tool_calls: [],
        }, 200, cors);
      }
      if (usadas === gratis || usadas === Math.ceil(gratis * 0.9)) {
        console.log(JSON.stringify({ event: 'widget_cuota_aviso', tenant: tenant.slug, usadas, gratis, extra }));
      }
    }
  }

  const r = await handleSalesAgentChat({ tenant_slug: tenant.slug, messages: msgs, conversation_id: conversationId }, env);
  return json(r.data, r.status, cors);
}

// ---- Importación de catálogo: feed de Google Shopping (XML/RSS/Atom) o CSV ----
function feedTag(block, names) {
  for (const n of names) {
    const re = new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i');
    const m = block.match(re);
    if (m) return m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
  }
  return '';
}
function feedDecode(s) {
  return String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}
function feedPrecio(s) {
  const m = String(s || '').replace(/\s/g, '').match(/(\d+(?:[.,]\d{1,2})?)/);
  return m ? Number(m[1].replace(',', '.')) : null;
}
function parseCsvLine(line, sep) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
const CSV_ALIAS = {
  sku: ['id', 'sku', 'referencia', 'reference', 'ref', 'codigo', 'código', 'g:id'],
  nombre: ['title', 'nombre', 'name', 'producto', 'product', 'titulo', 'título', 'g:title'],
  precio: ['sale_price', 'price', 'precio', 'pvp', 'precio_con_iva', 'regular price', 'g:price'],
  stock: ['stock', 'quantity', 'cantidad', 'inventory', 'existencias'],
  disponible: ['availability', 'disponibilidad', 'in stock?', 'g:availability'],
  categoria: ['product_type', 'categoria', 'categoría', 'category', 'categories', 'google_product_category', 'g:product_type'],
  marca: ['brand', 'marca', 'fabricante', 'manufacturer', 'g:brand'],
  imagen: ['image_link', 'imagen', 'image', 'images', 'image src', 'g:image_link'],
  url: ['link', 'url', 'enlace', 'permalink', 'g:link'],
  descripcion: ['description', 'descripcion', 'descripción', 'short description', 'g:description'],
};
function csvIndex(headers) {
  const h = headers.map((x) => x.toLowerCase().replace(/^﻿/, '').trim());
  const idx = {};
  for (const [k, al] of Object.entries(CSV_ALIAS)) idx[k] = h.findIndex((x) => al.includes(x));
  return idx;
}
function parseCatalogo(texto) {
  const t = String(texto || '').trim();
  const items = [];
  if (t.startsWith('<')) {
    const bloques = t.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
    for (const b of bloques) {
      const disp = feedTag(b, ['g:availability', 'availability']).toLowerCase();
      items.push({
        sku: feedDecode(feedTag(b, ['g:id', 'id'])),
        nombre: feedDecode(feedTag(b, ['g:title', 'title'])),
        precio: feedPrecio(feedTag(b, ['g:sale_price', 'g:price', 'price'])),
        stock: disp ? (/out|agotado|sin stock/.test(disp) ? 0 : 10) : null,
        categoria: feedDecode(feedTag(b, ['g:product_type', 'product_type', 'g:google_product_category'])).split('>').pop().trim(),
        marca: feedDecode(feedTag(b, ['g:brand', 'brand'])),
        imagen: feedDecode(feedTag(b, ['g:image_link', 'image_link'])),
        url: feedDecode(feedTag(b, ['g:link', 'link'])) || ((b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || ''),
        descripcion: feedDecode(feedTag(b, ['g:description', 'description'])).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600),
      });
    }
  } else {
    const lineas = t.split(/\r?\n/).filter((l) => l.trim());
    if (lineas.length < 2) return [];
    const primera = lineas[0];
    const sep = [';', '\t', ','].sort((a, b) => primera.split(b).length - primera.split(a).length)[0];
    const idx = csvIndex(parseCsvLine(primera, sep));
    const g = (cols, k) => (idx[k] >= 0 ? cols[idx[k]] || '' : '');
    for (const l of lineas.slice(1)) {
      const c = parseCsvLine(l, sep);
      const stockTxt = g(c, 'stock');
      const disp = g(c, 'disponible').toLowerCase();
      items.push({
        sku: g(c, 'sku'),
        nombre: g(c, 'nombre'),
        precio: feedPrecio(g(c, 'precio')),
        stock: stockTxt !== '' && !isNaN(parseInt(stockTxt, 10)) ? parseInt(stockTxt, 10) : (disp ? (/out|agotado|no|0/.test(disp) ? 0 : 10) : null),
        categoria: g(c, 'categoria').split(/[>,|]/).pop().trim(),
        marca: g(c, 'marca'),
        imagen: g(c, 'imagen').split(/[,|]/)[0].trim(),
        url: g(c, 'url'),
        descripcion: g(c, 'descripcion').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600),
      });
    }
  }
  return items.filter((it) => it.nombre).map((it, i) => ({ ...it, sku: (it.sku || it.url || `fila-${i + 1}`).slice(0, 120) }));
}

async function importarCatalogoTenant(env, tenant, texto) {
  const items = parseCatalogo(texto);
  if (!items.length) return { ok: false, error: 'No he encontrado productos en ese feed/CSV (revisa que tenga columnas de título/nombre).' };
  const inicio = new Date().toISOString();
  const vistos = new Set();
  const filas = [];
  for (const it of items) {
    if (vistos.has(it.sku)) continue;
    vistos.add(it.sku);
    filas.push({
      tenant_id: tenant.id, sku: it.sku, nombre: it.nombre.slice(0, 300),
      categoria: it.categoria || null, precio_con_iva: it.precio, stock: it.stock == null ? 10 : it.stock,
      marca: it.marca || null, imagen_principal: it.imagen || null, url: it.url || null,
      descripcion: it.descripcion || null, active: true, updated_at: new Date().toISOString(),
    });
  }
  let errores = 0;
  for (let i = 0; i < filas.length; i += 500) {
    const r = await sbRequest(env, 'sales_tenant_inventory?on_conflict=tenant_id,sku', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(filas.slice(i, i + 500)),
    });
    if (!r.ok) { errores++; console.log(JSON.stringify({ event: 'widget_import_lote_fallo', tenant: tenant.slug, detail: String(JSON.stringify(r.data)).slice(0, 300) })); }
  }
  if (!errores) {
    // Lo que ya no está en el catálogo deja de recomendarse (no se borra).
    await sbRequest(env, `sales_tenant_inventory?tenant_id=eq.${tenant.id}&updated_at=lt.${encodeURIComponent(inicio)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: false }),
    });
  }
  const estado = errores ? `error en ${errores} lote(s)` : `ok: ${filas.length} productos`;
  await sbRequest(env, `sales_tenants?id=eq.${tenant.id}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ feed_sync_at: new Date().toISOString(), feed_estado: estado }),
  });
  return { ok: !errores, productos: filas.length, estado };
}

async function descargarFeed(feedUrl) {
  const u = new URL(feedUrl);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('URL no válida');
  const res = await fetch(u.toString(), { headers: { 'User-Agent': 'CannabicultorBot/1.0 (+https://cannabicultor.com/empresas.html)' }, cf: { cacheTtl: 0 } });
  if (!res.ok) throw new Error(`El feed respondió ${res.status}`);
  return res.text();
}

async function esAdminReq(request, env) {
  const a = request.headers.get('Authorization') || '';
  const c = await verifyJwt(a.startsWith('Bearer ') ? a.slice(7) : '', env.JWT_SECRET);
  return !!(c && c.email === 'enriquedorta@gmail.com');
}

// Admin: lista, alta/edición e importación de catálogo de tiendas.
async function handleAdminGrowshops(body, env, request) {
  if (!await esAdminReq(request, env)) return { status: 401, data: { error: 'No autorizado' } };
  const accion = body?.accion;
  if (accion === 'listar') {
    const r = await sbRequest(env, 'sales_tenants?select=id,slug,display_name,status,widget_key,widget_config,dominios,conversaciones_mes,conversaciones_extra,feed_url,feed_sync_at,feed_estado,demo_token&order=created_at.desc', { method: 'GET' });
    const tiendas = Array.isArray(r.data) ? r.data : [];
    await Promise.all(tiendas.map(async (t) => {
      const u = await sbRequest(env, 'rpc/sales_conversaciones_mes', { method: 'POST', body: JSON.stringify({ p_tenant: t.id }) });
      t.conversaciones_usadas = Number(u.data) || 0;
      const inv = await sbRequest(env, `sales_tenant_inventory?tenant_id=eq.${t.id}&active=eq.true&select=id`, { method: 'GET', headers: { Prefer: 'count=exact', Range: '0-0' } });
      t.productos = inv.count || 0;
    }));
    return { status: 200, data: { tiendas } };
  }
  if (accion === 'guardar') {
    const t = body.tienda || {};
    const nombre = String(t.display_name || '').trim();
    if (!nombre) return { status: 400, data: { error: 'Falta el nombre de la tienda' } };
    const dominios = String(t.dominios || '').split(/[\s,]+/).map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);
    const datos = {
      display_name: nombre.slice(0, 120),
      widget_config: t.widget_config && typeof t.widget_config === 'object' ? t.widget_config : {},
      dominios,
      feed_url: t.feed_url ? String(t.feed_url).trim() : null,
      conversaciones_mes: Number.isFinite(+t.conversaciones_mes) ? +t.conversaciones_mes : 300,
      conversaciones_extra: Number.isFinite(+t.conversaciones_extra) ? +t.conversaciones_extra : 0,
      updated_at: new Date().toISOString(),
    };
    if (t.id) {
      const r = await sbRequest(env, `sales_tenants?id=eq.${encodeURIComponent(t.id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(datos) });
      return { status: r.ok ? 200 : 500, data: r.ok ? { tienda: r.data?.[0] } : { error: 'No se pudo guardar', detalle: r.data } };
    }
    const slug = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '-' + Math.random().toString(36).slice(2, 6);
    const r = await sbRequest(env, 'sales_tenants', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...datos, slug, status: 'pilot', source_system: datos.feed_url ? 'feed' : 'csv', brand_profile: {} }),
    });
    return { status: r.ok ? 200 : 500, data: r.ok ? { tienda: r.data?.[0] } : { error: 'No se pudo crear', detalle: r.data } };
  }
  if (accion === 'importar') {
    const r = await sbRequest(env, `sales_tenants?id=eq.${encodeURIComponent(body.id || '')}&select=id,slug,feed_url&limit=1`, { method: 'GET' });
    const tenant = Array.isArray(r.data) && r.data[0];
    if (!tenant) return { status: 404, data: { error: 'Tienda no encontrada' } };
    let texto = typeof body.csv === 'string' && body.csv.length ? body.csv : null;
    try {
      if (!texto) {
        if (!tenant.feed_url) return { status: 400, data: { error: 'Esta tienda no tiene feed; sube un CSV.' } };
        texto = await descargarFeed(tenant.feed_url);
      }
    } catch (e) {
      return { status: 502, data: { error: `No pude descargar el feed: ${e.message}` } };
    }
    const res = await importarCatalogoTenant(env, tenant, texto);
    return { status: res.ok ? 200 : 400, data: res };
  }
  return { status: 400, data: { error: 'Acción no válida' } };
}

// Cron diario: re-sincroniza las tiendas con feed.
async function sincronizarFeedsGrowshops(env) {
  const r = await sbRequest(env, 'sales_tenants?feed_url=not.is.null&status=neq.churned&select=id,slug,feed_url', { method: 'GET' });
  for (const t of (Array.isArray(r.data) ? r.data : [])) {
    try {
      const texto = await descargarFeed(t.feed_url);
      const res = await importarCatalogoTenant(env, t, texto);
      console.log(JSON.stringify({ event: 'feed_sync', tenant: t.slug, ...res }));
    } catch (e) {
      await sbRequest(env, `sales_tenants?id=eq.${t.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ feed_sync_at: new Date().toISOString(), feed_estado: `error: ${String(e.message).slice(0, 120)}` }) });
    }
  }
}

