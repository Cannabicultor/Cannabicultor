// Señales de completitud de una ficha de variedad (1 punto cada una).
// Usado por gen-seo-text.mjs (candidatas a generar texto) y apply-canonical.mjs
// (para elegir la ficha canónica de un taxón: la de más señales).
export function countSenales(v) {
  let n = 0;
  if ((v.genetica || '').length > 3) n++;
  if (v.floracion_dias != null) n++;
  if (v.thc_pct != null || v.thc_max != null) n++;
  if ((v.terpenos && String(v.terpenos).length > 0) || (Array.isArray(v.aromas) && v.aromas.length > 0)) n++;
  if ((v.efecto || '').length > 0 || (Array.isArray(v.efectos) && v.efectos.length > 0)) n++;
  if ((v.descripcion || '').length > 80) n++;
  if ((v.tipo || '').length > 0 || (v.tipo_semilla || '').length > 0) n++;
  return n;
}
