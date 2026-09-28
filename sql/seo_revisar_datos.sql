-- ============================================================
-- SEO: fichas con THC/CBD sospechosos (posible intercambio en el
-- origen de datos), a revisar a mano.
--
-- Regla (gen-seo-text.mjs, datosCannabinoidesDudosos()):
--   (thc>=10 y cbd>=10) o
--   (cbd>thc y el nombre NO sugiere variedad de CBD: cbd, charlotte,
--    harlequin, acdc, cannatonic, remedy, ringo)
-- En esos casos no se pasa thc ni cbd al prompt (ni entran en el
-- conjunto de cifras permitidas de la verificación); el texto se
-- genera solo con el resto de datos, y la ficha se anota aquí.
--
-- Ya aplicada en Supabase. Seguro ejecutarlo varias veces (usa IF NOT EXISTS).
-- ============================================================

CREATE TABLE IF NOT EXISTS seo_revisar_datos (
  id bigint generated always as identity primary key,
  variedad_id bigint NOT NULL REFERENCES variedades(id),
  motivo text NOT NULL,
  thc_pct numeric,
  cbd_pct numeric,
  seo_text_batch text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revisado boolean NOT NULL DEFAULT false
);

ALTER TABLE seo_revisar_datos
  DROP CONSTRAINT IF EXISTS seo_revisar_datos_variedad_id_key;
ALTER TABLE seo_revisar_datos
  ADD CONSTRAINT seo_revisar_datos_variedad_id_key UNIQUE (variedad_id);

CREATE INDEX IF NOT EXISTS idx_seo_revisar_datos_pendientes
  ON seo_revisar_datos (created_at) WHERE revisado = false;

COMMENT ON TABLE seo_revisar_datos IS
  'Fichas con THC/CBD sospechosos (posible intercambio en el origen de datos): (thc>=10 y cbd>=10) o (cbd>thc y el nombre no sugiere variedad CBD). gen-seo-text.mjs no les pasa thc/cbd al prompt y las anota aquí para revisión manual. Upsert por variedad_id, así que una nueva corrida no duplica filas.';

-- Consulta de revisión sugerida:
-- select r.*, v.nombre, v.thc_pct, v.thc_max, v.cbd_pct, v.cbd_max
-- from seo_revisar_datos r join variedades v on v.id = r.variedad_id
-- where r.revisado = false order by r.created_at asc;
