// Fotos de variedades con aprobación previa (tabla variedad_fotos, ver sql/variedad_fotos.sql).
//   POST /fotos/subir  (usuario con sesión)  → guarda la foto en el bucket PRIVADO `variedades-pendientes`
//                                              y crea una fila 'pendiente'. Nada se publica sin aprobación.
//   POST /admin/fotos  (solo admin)          → acciones: listar | aprobar | rechazar
//
// Al APROBAR: se descarga la imagen (del bucket privado o de source_url si es candidata), se valida (tipo
// real por cabecera, tamaño), se copia al bucket PÚBLICO `variedades` con la convención <criador>/<variedad>-<id>.<ext>,
// y se rellenan variedades.image_url (solo si no tenía foto) y variedades.foto_credito. Nunca se hotlinkea.
//
// Las dependencias del Worker (sbRequest, authEmailFromRequest, esAdminReq) se inyectan para no duplicar código.

const SUPABASE_URL = 'https://gfyrsrdnvgnhtsuexjkb.supabase.co';
const BUCKET_PENDIENTES = 'variedades-pendientes';
const BUCKET_PUBLICO = 'variedades';
const MAX_SUBIDA = 3_000_000;      // bytes de una foto subida por un usuario (el cliente la reduce antes)
const MAX_DESCARGA = 8_000_000;    // bytes al descargar una candidata (el bucket público admite 8 MB)
const MAX_PENDIENTES_USUARIO = 10;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/gi, 'n').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');
const svcHeaders = (env, extra = {}) => ({ apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, ...extra });

// Tipo real por la cabecera del fichero (no se fía del content-type que declare el cliente).
export function detectarMime(u8) {
  if (u8.length > 12 && u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return 'image/jpeg';
  if (u8.length > 12 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return 'image/png';
  if (u8.length > 12 && String.fromCharCode(...u8.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...u8.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

export function decodificarDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) return null;
  const bin = atob(m[1].replace(/\s/g, ''));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

async function sha256Hex(bytes) {
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function storagePut(env, bucket, path, bytes, mime) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encPath(path)}`, {
    method: 'POST', headers: svcHeaders(env, { 'Content-Type': mime, 'x-upsert': 'true', 'cache-control': 'max-age=31536000' }), body: bytes,
  });
  if (!res.ok) throw new Error(`storage put ${bucket}/${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}
async function storageGet(env, bucket, path) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encPath(path)}`, { headers: svcHeaders(env) });
  if (!res.ok) throw new Error(`storage get ${bucket}/${path}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
async function storageDelete(env, bucket, paths) {
  await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, { method: 'DELETE', headers: svcHeaders(env, { 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: paths }) }).catch(() => {});
}
async function urlFirmada(env, bucket, path, segundos = 3600) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${encPath(path)}`, {
    method: 'POST', headers: svcHeaders(env, { 'Content-Type': 'application/json' }), body: JSON.stringify({ expiresIn: segundos }),
  });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  const u = j?.signedURL || j?.signedUrl;
  return u ? `${SUPABASE_URL}/storage/v1${u.startsWith('/') ? '' : '/'}${u}` : null;
}

// Solo https y nunca a hosts internos (la URL viene de nuestro buscador, pero no se confía a ciegas).
function urlDescargable(u) {
  try {
    const x = new URL(u);
    if (x.protocol !== 'https:') return false;
    const h = x.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^[\d.]+$/.test(h) || h.includes(':')) return false;
    return true;
  } catch { return false; }
}
async function descargarCandidata(u) {
  if (!urlDescargable(u)) throw new Error('URL de origen no permitida');
  const res = await fetch(u, { headers: { 'User-Agent': 'cannabicultor-photo-finder/0.1 (+https://www.cannabicultor.com)' }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`descarga ${res.status}`);
  const len = parseInt(res.headers.get('content-length') || '0', 10);
  if (len > MAX_DESCARGA) throw new Error('imagen demasiado grande');
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_DESCARGA) throw new Error('imagen demasiado grande');
  return buf;
}

function creditoFoto(fila, breederNombre) {
  const autor = fila.autor || breederNombre || 'autor desconocido';
  if (fila.licencia === 'permiso-criador') return `Foto: ${autor}, con permiso del criador`;
  if (fila.licencia === 'propia-usuario') return 'Foto enviada por un usuario de Cannabicultor';
  const lic = String(fila.licencia || '').toUpperCase().replace('CC0', 'CC0 1.0');
  return `Foto: ${autor} · ${lic.startsWith('CC') ? lic : `CC ${lic}`}`.slice(0, 200);
}

// ── Usuario: subir foto (queda pendiente) ───────────────────────────────────
export async function handleFotoSubir(body, env, request, deps) {
  const { sbRequest, authEmailFromRequest } = deps;
  const auth = await authEmailFromRequest(request, env, body?.email);
  if (auth.error) return auth.error;
  const variedadId = parseInt(body?.variedad_id, 10);
  if (!Number.isFinite(variedadId) || variedadId <= 0) return { status: 400, data: { error: 'Variedad no válida' } };
  if (body?.derechos !== true) return { status: 400, data: { error: 'Debes confirmar que tienes derechos sobre la foto' } };

  const v = await sbRequest(env, `variedades?id=eq.${variedadId}&select=id,nombre,image_url&limit=1`, { method: 'GET' });
  if (!v.ok || !Array.isArray(v.data) || !v.data.length) return { status: 404, data: { error: 'Variedad no encontrada' } };
  if (v.data[0].image_url) return { status: 409, data: { error: 'Esta variedad ya tiene foto' } };

  const bytes = decodificarDataUrl(body?.imagen);
  if (!bytes) return { status: 400, data: { error: 'Imagen no válida (JPG, PNG o WebP)' } };
  if (bytes.length > MAX_SUBIDA) return { status: 413, data: { error: 'La imagen es demasiado grande (máx. 3 MB)' } };
  const mime = detectarMime(bytes);
  if (!mime) return { status: 400, data: { error: 'El archivo no es una imagen válida' } };

  const pend = await sbRequest(env, `variedad_fotos?usuario_email=eq.${encodeURIComponent(auth.email)}&estado=eq.pendiente&select=id`, { method: 'GET', headers: { Prefer: 'count=exact', Range: '0-0' } });
  if ((pend.count ?? 0) >= MAX_PENDIENTES_USUARIO) return { status: 429, data: { error: 'Tienes demasiadas fotos pendientes de revisión. Espera a que se aprueben.' } };

  const sha = await sha256Hex(bytes);
  const ruta = `${variedadId}/${sha}.${EXT[mime]}`;
  await storagePut(env, BUCKET_PENDIENTES, ruta, bytes, mime);
  const ins = await sbRequest(env, 'variedad_fotos', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ variedad_id: variedadId, origen: 'usuario', estado: 'pendiente', storage_path: ruta, usuario_email: auth.email, licencia: 'propia-usuario', derechos_confirmados: true, sha256: sha, autor: null }),
  });
  if (!ins.ok) {
    if (ins.status === 409) return { status: 409, data: { error: 'Ya tienes una foto pendiente para esta variedad (o esa imagen ya se envió)' } };
    return { status: 500, data: { error: 'No se pudo guardar la foto' } };
  }
  return { status: 200, data: { ok: true, mensaje: 'Gracias. Revisaremos tu foto antes de publicarla.' } };
}

// ── Admin: listar | aprobar | rechazar ──────────────────────────────────────
export async function handleAdminFotos(body, env, request, deps) {
  const { sbRequest, esAdminReq } = deps;
  if (!await esAdminReq(request, env)) return { status: 401, data: { error: 'No autorizado' } };
  const accion = body?.accion;

  if (accion === 'listar') {
    const estado = ['pendiente', 'aprobada', 'rechazada'].includes(body?.estado) ? body.estado : 'pendiente';
    const origen = ['usuario', 'candidata'].includes(body?.origen) ? `&origen=eq.${body.origen}` : '';
    const limite = Math.min(Math.max(parseInt(body?.limite, 10) || 30, 1), 100);
    const offset = Math.max(parseInt(body?.offset, 10) || 0, 0);
    const r = await sbRequest(env, `variedad_fotos?estado=eq.${estado}${origen}&select=*&order=score.desc.nullslast,created_at.asc&limit=${limite}&offset=${offset}`, { method: 'GET', headers: { Prefer: 'count=exact' } });
    const filas = Array.isArray(r.data) ? r.data : [];
    const ids = [...new Set(filas.map((f) => f.variedad_id))];
    const vs = ids.length ? (await sbRequest(env, `variedades?id=in.(${ids.join(',')})&select=id,nombre,breeder_id,image_url`, { method: 'GET' })).data : [];
    const bids = [...new Set((vs || []).map((v) => v.breeder_id).filter(Boolean))];
    const bs = bids.length ? (await sbRequest(env, `breeders?id=in.(${bids.join(',')})&select=id,breeder_name,website`, { method: 'GET' })).data : [];
    const vm = new Map((vs || []).map((v) => [v.id, v]));
    const bm = new Map((bs || []).map((b) => [b.id, b]));
    const items = await Promise.all(filas.map(async (f) => {
      const v = vm.get(f.variedad_id) || {};
      const b = bm.get(v.breeder_id) || {};
      // Vista previa SOLO para el admin: la candidata se ve desde su origen, la subida con URL firmada. Nada de esto es público.
      const vista = f.origen === 'usuario' && f.storage_path ? await urlFirmada(env, BUCKET_PENDIENTES, f.storage_path) : f.source_url;
      return { ...f, variedad_nombre: v.nombre || null, variedad_tiene_foto: !!v.image_url, breeder_nombre: b.breeder_name || null, breeder_web: b.website || null, vista };
    }));
    const cuenta = async (e) => (await sbRequest(env, `variedad_fotos?estado=eq.${e}&select=id`, { method: 'GET', headers: { Prefer: 'count=exact', Range: '0-0' } })).count ?? 0;
    return { status: 200, data: { items, total: r.count ?? items.length, conteo: { pendiente: await cuenta('pendiente'), aprobada: await cuenta('aprobada'), rechazada: await cuenta('rechazada') } } };
  }

  if (accion === 'rechazar') {
    const id = parseInt(body?.id, 10);
    if (!Number.isFinite(id)) return { status: 400, data: { error: 'Falta id' } };
    const f = (await sbRequest(env, `variedad_fotos?id=eq.${id}&select=*&limit=1`, { method: 'GET' })).data?.[0];
    if (!f) return { status: 404, data: { error: 'No encontrada' } };
    if (f.estado !== 'pendiente') return { status: 409, data: { error: `Ya está ${f.estado}` } };
    const motivo = String(body?.motivo || '').trim().slice(0, 300) || null;
    const u = await sbRequest(env, `variedad_fotos?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ estado: 'rechazada', motivo_rechazo: motivo, revisado_por: 'admin', revisado_at: new Date().toISOString() }) });
    if (!u.ok) return { status: 500, data: { error: 'No se pudo rechazar' } };
    if (f.origen === 'usuario' && f.storage_path) await storageDelete(env, BUCKET_PENDIENTES, [f.storage_path]);
    return { status: 200, data: { ok: true } };
  }

  if (accion === 'aprobar') {
    const id = parseInt(body?.id, 10);
    if (!Number.isFinite(id)) return { status: 400, data: { error: 'Falta id' } };
    const f = (await sbRequest(env, `variedad_fotos?id=eq.${id}&select=*&limit=1`, { method: 'GET' })).data?.[0];
    if (!f) return { status: 404, data: { error: 'No encontrada' } };
    if (f.estado !== 'pendiente') return { status: 409, data: { error: `Ya está ${f.estado}` } };
    const licencia = String(body?.licencia || f.licencia || '').trim();
    if (!licencia || licencia === 'desconocida') return { status: 400, data: { error: 'Indica la licencia o el permiso antes de aprobar' } };
    f.licencia = licencia;
    if (body?.autor) f.autor = String(body.autor).trim().slice(0, 120);

    const v = (await sbRequest(env, `variedades?id=eq.${f.variedad_id}&select=id,nombre,breeder_id,image_url&limit=1`, { method: 'GET' })).data?.[0];
    if (!v) return { status: 404, data: { error: 'Variedad no encontrada' } };
    const b = v.breeder_id ? (await sbRequest(env, `breeders?id=eq.${v.breeder_id}&select=breeder_name&limit=1`, { method: 'GET' })).data?.[0] : null;

    let bytes;
    try { bytes = f.origen === 'usuario' ? await storageGet(env, BUCKET_PENDIENTES, f.storage_path) : await descargarCandidata(f.source_url); }
    catch (e) { return { status: 502, data: { error: `No se pudo obtener la imagen: ${e.message}` } }; }
    const mime = detectarMime(bytes);
    if (!mime) return { status: 422, data: { error: 'El archivo no es una imagen válida' } };
    if (bytes.length > MAX_DESCARGA) return { status: 413, data: { error: 'Imagen demasiado grande' } };

    const sha = await sha256Hex(bytes);
    const rutaPublica = `${slug(b?.breeder_name) || 'sin-criador'}/${slug(v.nombre) || 'variedad'}-${v.id}.${EXT[mime]}`;
    try { await storagePut(env, BUCKET_PUBLICO, rutaPublica, bytes, mime); }
    catch (e) { return { status: 502, data: { error: `No se pudo publicar la imagen: ${e.message}` } }; }
    const urlPublica = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_PUBLICO}/${encPath(rutaPublica)}`;
    const credito = creditoFoto(f, b?.breeder_name);

    const u = await sbRequest(env, `variedad_fotos?id=eq.${id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ estado: 'aprobada', public_path: rutaPublica, licencia, autor: f.autor || null, sha256: sha, nota_permiso: body?.nota_permiso || f.nota_permiso || null, revisado_por: 'admin', revisado_at: new Date().toISOString() }),
    });
    if (!u.ok) return { status: 500, data: { error: 'Imagen publicada pero no se pudo marcar como aprobada', detalle: u.data } };

    // Solo se rellena la ficha si NO tenía foto (nunca se pisa una existente).
    let fichaActualizada = false;
    if (!v.image_url) {
      const p = await sbRequest(env, `variedades?id=eq.${v.id}&image_url=is.null`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ image_url: urlPublica, foto_credito: credito }) });
      fichaActualizada = p.ok;
    }
    // Las demás pendientes de esa variedad dejan de hacer falta.
    await sbRequest(env, `variedad_fotos?variedad_id=eq.${v.id}&estado=eq.pendiente&id=neq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ estado: 'rechazada', motivo_rechazo: 'La variedad ya tiene una foto aprobada', revisado_por: 'admin', revisado_at: new Date().toISOString() }) });
    if (f.origen === 'usuario' && f.storage_path) await storageDelete(env, BUCKET_PENDIENTES, [f.storage_path]);
    return { status: 200, data: { ok: true, url: urlPublica, credito, ficha_actualizada: fichaActualizada } };
  }

  return { status: 400, data: { error: 'Acción no válida' } };
}
