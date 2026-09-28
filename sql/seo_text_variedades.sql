-- ============================================================
-- SEO: texto sintetizado por IA para fichas de variedades
-- (evita contenido duplicado/thin — ver informe de señales).
--
-- - seo_description_text/model/at/status: el texto generado, qué modelo
--   lo generó, cuándo, y si pasó verificación ('ok' / 'rechazado').
-- - seo_text_batch: id del lote que escribió la fila (para rollback).
-- - canonical_variedad_id: si esta ficha es un alias de otra con la
--   misma genética (mismo taxon_id), apunta a la ficha canónica y esta
--   fila se sirve noindex,follow.
-- - seo_indexable_backup: valor de `indexable` justo antes de que un
--   lote lo cambiara, para poder deshacerlo (rollback-seo-batch.mjs).
--
-- Seguro ejecutarlo varias veces (usa IF NOT EXISTS).
-- ============================================================

ALTER TABLE variedades
  ADD COLUMN IF NOT EXISTS seo_description_text text,
  ADD COLUMN IF NOT EXISTS seo_text_model text,
  ADD COLUMN IF NOT EXISTS seo_text_at timestamptz,
  ADD COLUMN IF NOT EXISTS seo_text_status text,
  ADD COLUMN IF NOT EXISTS seo_text_batch text,
  ADD COLUMN IF NOT EXISTS canonical_variedad_id bigint REFERENCES variedades(id);

ALTER TABLE variedades
  DROP CONSTRAINT IF EXISTS variedades_seo_text_status_check;
ALTER TABLE variedades
  ADD CONSTRAINT variedades_seo_text_status_check
  CHECK (seo_text_status IS NULL OR seo_text_status IN ('ok', 'rechazado'));

CREATE INDEX IF NOT EXISTS idx_variedades_seo_text_status
  ON variedades (seo_text_status);
CREATE INDEX IF NOT EXISTS idx_variedades_seo_text_batch
  ON variedades (seo_text_batch);
CREATE INDEX IF NOT EXISTS idx_variedades_canonical
  ON variedades (canonical_variedad_id) WHERE canonical_variedad_id IS NOT NULL;

COMMENT ON COLUMN variedades.seo_description_text IS
  'Párrafo de 50-70 palabras generado por IA a partir de los datos de la ficha (nunca inventa cifras). Se imprime bajo el H1 en el HTML estático.';
COMMENT ON COLUMN variedades.seo_text_status IS
  'ok = pasó verificación (cifras + similitud) y se publicó. rechazado = no se publicó (queda seo_description_text de la última generación para depurar, pero no se usa ni se indexa). NULL = pendiente de generar.';
COMMENT ON COLUMN variedades.seo_text_batch IS
  'Id del lote (worker/scripts/gen-seo-text.mjs o apply-canonical.mjs) que escribió/cambió esta fila. Usado por rollback-seo-batch.mjs.';
COMMENT ON COLUMN variedades.canonical_variedad_id IS
  'Si no es NULL, esta ficha es un duplicado (mismo taxon_id, dedupe_status confirma misma genética) de la ficha canónica indicada: se sirve noindex,follow con <link rel="canonical"> a la ficha destino.';

-- Backup de `indexable` antes de que un lote lo cambie (rollback-seo-batch.mjs
-- restaura desde aquí y borra las filas de ese lote una vez restauradas).
CREATE TABLE IF NOT EXISTS seo_indexable_backup (
  id bigint generated always as identity primary key,
  variedad_id bigint NOT NULL REFERENCES variedades(id),
  seo_text_batch text NOT NULL,
  indexable_anterior boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_seo_indexable_backup_batch
  ON seo_indexable_backup (seo_text_batch);
CREATE INDEX IF NOT EXISTS idx_seo_indexable_backup_variedad
  ON seo_indexable_backup (variedad_id);

COMMENT ON TABLE seo_indexable_backup IS
  'Una fila por variedad tocada por un lote de gen-seo-text.mjs o apply-canonical.mjs, con el valor de indexable justo antes del cambio. rollback-seo-batch.mjs <batch_id> lo usa para deshacer el lote.';

-- Verificación
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'variedades'
  AND column_name IN ('seo_description_text', 'seo_text_model', 'seo_text_at', 'seo_text_status', 'seo_text_batch', 'canonical_variedad_id')
ORDER BY ordinal_position;
