// Fotos de variedades con aprobación previa (tabla variedad_fotos, ver sql/variedad_fotos.sql).
//   POST /fotos/subir  (usuario con sesión)  → guarda la foto en el bucket PRIVADO `variedades-pendientes`
//                                              y crea una fila 'pendiente'. Nada se publica sin aprobación.
//
// La APROBACIÓN no está aquí: se hace en el dashboard (Worker directory-agent, /review → "Fotos de variedades"),
// que copia la imagen al bucket público con su crédito y rellena la ficha.
//
// Las dependencias del Worker (sbRequest, authEmailFromRequest) se inyectan para no duplicar código.

const SUPABASE_URL = 'https://gfyrsrdnvgnhtsuexjkb.supabase.co';
const BUCKET_PENDIENTES = 'variedades-pendientes';
const MAX_SUBIDA = 3_000_000;      // bytes de una foto subida por un usuario (el cliente la reduce antes)
const MAX_PENDIENTES_USUARIO = 10;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

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
