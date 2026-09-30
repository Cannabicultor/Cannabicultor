// Precarga para las pruebas (node --import): sustituye https.get para que build.mjs lea de una
// "base de datos" en memoria (268 cbd_shops de ES + 19 de AR) aplicando los filtros de PostgREST
// que llegan en la URL (activo=is.true, pais=eq.XX). Sin red. Registra las peticiones en MOCK_LOG.
import https from 'node:https';
import { appendFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

const ES_CITIES = ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Córdoba', 'Zaragoza', 'Bilbao', 'Málaga', 'Granada', 'Alicante'];
const AR_CITIES = [
  [null, null], [null, 'Buenos Aires'], [null, null],
  ['Rosario', 'Santa Fe'], ['Córdoba', 'Córdoba'], ['Ciudad de Buenos Aires', 'CABA'], ['Ciudad de Buenos Aires', 'CABA'],
  ['Ciudad de Buenos Aires', 'CABA'], ['Ciudad de Buenos Aires', 'CABA'], ['Ciudad de Buenos Aires', 'CABA'],
  ['Ciudad de Buenos Aires', 'CABA'], ['Ciudad de Buenos Aires', 'CABA'], ['Ciudad de Buenos Aires', 'CABA'],
  ['Ezpeleta', 'Buenos Aires'], ['Quilmes Oeste', 'Buenos Aires'], ['Mar del Plata', 'Buenos Aires'],
  ['Ciudad de Buenos Aires', 'CABA'], ['Ciudad de Buenos Aires', 'CABA'], ['Rosario', 'Santa Fe'],
];

function row(id, pais, nombre, ciudad, provincia, extra = {}) {
  return {
    id, slug: `${pais === 'AR' ? 'ar-' : ''}tienda-${id}`, nombre, direccion: 'Calle 1', cp: null, ciudad, provincia, ccaa: null,
    lat: -34.6, lon: -58.4, telefono: '+34600000000', web: 'https://ejemplo.test', instagram: null, horario: null,
    descripcion: null, descripcion_tldr: null, logo_url: null, media_resenas: null, num_resenas: 0,
    editorial_status: 'borrador', indexable: false, pais, activo: true, updated_at: '2026-09-29T00:00:00Z', ...extra,
  };
}

export const CBD_SHOPS = [
  // 268 de España, todas borrador e indexable=false (como en produccion) salvo 3 casos de control.
  ...Array.from({ length: 268 }, (_, i) => {
    const id = i + 1;
    const c = ES_CITIES[i % ES_CITIES.length];
    const extra =
      id === 1 ? { indexable: true, editorial_status: 'publicado' } // curada e indexable  -> index + sitemap
      : id === 2 ? { indexable: true, editorial_status: 'borrador' } // indexable pero borrador -> noindex
      : id === 3 ? { indexable: false, editorial_status: 'publicado' } // publicada pero indexable=false -> noindex
      : {};
    return row(id, 'ES', `Tienda ES ${id}`, c, c, extra);
  }),
  // 19 de Argentina (una con indexable=true y publicada, para probar que ni asi entra por el filtro de pais).
  ...AR_CITIES.map(([c, p], i) => row(1000 + i, 'AR', `Tienda AR ${i + 1}`, c, p, i === 3 ? { indexable: true, editorial_status: 'publicado' } : {})),
];

// Directorio por pais (paises.mjs): growshops y asociaciones de AR para probar la regla de calidad.
const DESC_OK = 'Growshop familiar con más de diez años de trayectoria en la ciudad, especializado en cultivo indoor, sustratos, iluminación LED y asesoramiento personalizado para quienes empiezan.';
const gs = (id, nombre, extra = {}) => ({
  id, slug: `ar-gs-${id}`, nombre, direccion: 'Av. Siempreviva 742', cp: null, ciudad: 'Rosario', provincia: 'Santa Fe', lat: -32.95, lon: -60.64,
  telefono: '+54 341 000 0000', web: 'https://ejemplo.test', instagram: null, horario: null, descripcion: null, descripcion_tldr: null, logo_url: null,
  media_resenas: null, num_resenas: 0, verificado: false, geo_aproximado: false, indexable: true, pais: 'AR', activo: true, updated_at: '2026-09-29T00:00:00Z', ...extra,
});
export const GROWSHOPS = [
  gs(1, 'Cumple todo', { descripcion: DESC_OK, verificado: true }), // unica>120 + verificada + geo exacta -> index
  gs(2, 'Sin verificar', { descripcion: DESC_OK + ' (b)' }),
  gs(3, 'Geo aproximada', { descripcion: DESC_OK + ' (c)', verificado: true, geo_aproximado: true }),
  gs(4, 'Descripcion corta', { descripcion: 'Tienda de cultivo.', verificado: true }),
  gs(5, 'Duplicada A', { descripcion: DESC_OK + ' (d)', verificado: true }),
  gs(6, 'Duplicada B', { descripcion: DESC_OK + ' (d)', verificado: true }),
  gs(7, 'Sin provincia', { provincia: null, ciudad: null }),
  gs(8, 'Otra de Santa Fe'),
  gs(9, 'Flag indexable false', { descripcion: DESC_OK + ' (e)', verificado: true, indexable: false }),
  { ...gs(10, 'De Espana'), pais: 'ES', provincia: 'Madrid' },
];
const TABLES = { cbd_shops: CBD_SHOPS, growshops: GROWSHOPS, asociaciones: [] };

function respond(url, headers) {
  const u = new URL(url);
  const m = u.pathname.match(/^\/rest\/v1\/(\w+)$/);
  if (!m) return { status: 404, body: '' }; // genealogia u otros hosts: sin red
  let rows = [...(TABLES[m[1]] || [])];
  for (const [k, v] of u.searchParams) {
    if (v === 'is.true') rows = rows.filter((r) => r[k] === true);
    else if (v.startsWith('eq.')) rows = rows.filter((r) => String(r[k]) === v.slice(3));
  }
  const [from, to] = String(headers?.Range || '0-999').split('-').map(Number);
  return { status: 200, body: JSON.stringify(rows.slice(from, to + 1)) };
}

https.get = (url, opts, cb) => {
  const req = new EventEmitter();
  req.setTimeout = () => req;
  req.destroy = () => {};
  req.end = () => setImmediate(() => {
    if (process.env.MOCK_LOG) appendFileSync(process.env.MOCK_LOG, `${url}\n`);
    const { status, body } = respond(String(url), opts?.headers);
    const res = new Readable({ read() { this.push(body); this.push(null); } });
    res.statusCode = status;
    cb(res);
  });
  return req;
};
