-- ============================================================
-- VERSIÓN LIMPIA Y COMPLETA - Migración de datos ricos
-- para la tabla `variedades` (Cannabicultor IA)
--
-- Incluye:
--   - Terpenos (JSONB)
--   - Perfiles de cannabinoides (THC/CBD)
--   - Aromas, sabores y efectos (arrays de texto)
--   - Imagen de la cepa
--   - Columnas de control de enriquecimiento (reanudable)
--
-- CORREGIDO: Error de GIN en columnas text[]
--   Se añade CREATE EXTENSION btree_gin antes de los índices.
--
-- Ejecuta este archivo completo en el SQL Editor de Supabase.
-- Es seguro ejecutarlo varias veces (usa IF NOT EXISTS).
-- ============================================================

-- 1. Extensión necesaria para índices GIN sobre arrays (text[]) y tipos compuestos
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- 2. Columnas principales de datos ricos
-- Terpenos (recomendado JSONB flexible)
ALTER TABLE variedades
  ADD COLUMN IF NOT EXISTS terpenos jsonb;

-- Perfil de cannabinoides
ALTER TABLE variedades
  ADD COLUMN IF NOT EXISTS thc_min numeric,
  ADD COLUMN IF NOT EXISTS thc_max numeric,
  ADD COLUMN IF NOT EXISTS cbd_min numeric,
  ADD COLUMN IF NOT EXISTS cbd_max numeric,
  ADD COLUMN IF NOT EXISTS cannabinoid_profile jsonb;

-- Aromas, sabores y efectos (usar arrays para filtros fáciles: @>, &&, etc.)
ALTER TABLE variedades
  ADD COLUMN IF NOT EXISTS aromas text[],
  ADD COLUMN IF NOT EXISTS sabores text[],
  ADD COLUMN IF NOT EXISTS efectos text[];

-- Imagen representativa de la cepa (bud/flower)
ALTER TABLE variedades
  ADD COLUMN IF NOT EXISTS image_url text;

-- 3. Columnas de control de enriquecimiento (imprescindibles para reanudar procesos)
ALTER TABLE variedades
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS enrichment_sources text[],
  ADD COLUMN IF NOT EXISTS data_source text,
  ADD COLUMN IF NOT EXISTS confidence numeric;

-- (Opcional) También en breeders para tracking visual
ALTER TABLE breeders
  ADD COLUMN IF NOT EXISTS visual_enriched_at timestamptz;

-- 4. Índices GIN (ahora seguros gracias a btree_gin)
-- Para terpenos (búsquedas dentro del JSONB)
CREATE INDEX IF NOT EXISTS idx_variedades_terpenos_gin 
    ON variedades USING GIN (terpenos);

-- Para aromas, efectos y sabores (filtros de array)
CREATE INDEX IF NOT EXISTS idx_variedades_aromas 
    ON variedades USING GIN (aromas);

CREATE INDEX IF NOT EXISTS idx_variedades_efectos 
    ON variedades USING GIN (efectos);

CREATE INDEX IF NOT EXISTS idx_variedades_sabores 
    ON variedades USING GIN (sabores);

-- Índices adicionales útiles
CREATE INDEX IF NOT EXISTS idx_variedades_enriched 
    ON variedades (enriched_at) 
    WHERE enriched_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_variedades_image 
    ON variedades (image_url) 
    WHERE image_url IS NOT NULL;

-- 5. Comentarios explicativos
COMMENT ON COLUMN variedades.terpenos IS 
    'Perfil de terpenos en JSONB. Ejemplo: {"myrcene": 0.42, "limonene": 0.19, "dominant": ["myrcene"], "total": 1.8, "source": "leafly"}';

COMMENT ON COLUMN variedades.aromas IS 
    'Aromas normalizados como array de texto. Ej: ["citrus","earthy","sweet"]. Permite filtros rápidos con @> y &&.';

COMMENT ON COLUMN variedades.efectos IS 
    'Efectos normalizados como array de texto. Ej: ["relaxed","euphoric"].';

COMMENT ON COLUMN variedades.enriched_at IS 
    'Fecha de último enriquecimiento. Usar IS NULL para encontrar registros pendientes.';

COMMENT ON COLUMN variedades.enrichment_sources IS 
    'Array de fuentes usadas. Ej: ["seedfinder","leafly","breeder-lab"].';

COMMENT ON COLUMN variedades.image_url IS 
    'URL de foto representativa de la cepa (bud/flower). Preferiblemente subida a Supabase Storage.';

-- 6. Verificación final (ejecuta esto después para confirmar)
-- Muestra las nuevas columnas
SELECT 
    column_name, 
    data_type, 
    is_nullable 
FROM information_schema.columns 
WHERE table_name = 'variedades' 
  AND column_name IN (
    'terpenos', 'thc_min', 'thc_max', 'cbd_min', 'cbd_max', 
    'aromas', 'sabores', 'efectos', 'image_url', 
    'enriched_at', 'enrichment_sources'
  )
ORDER BY ordinal_position;

-- Muestra los índices GIN creados
SELECT 
    indexname, 
    tablename, 
    indexdef 
FROM pg_indexes 
WHERE tablename = 'variedades' 
  AND indexdef LIKE '%GIN%'
ORDER BY indexname;

-- Fin del script
-- ============================================================
-- Próximos pasos recomendados:
-- 1. Ejecuta tus scripts de enriquecimiento (enrich-breeders.mjs y enrich-varieties-detailed.mjs)
-- 2. Usa el admin-breeders.html para monitorear qué campos siguen vacíos.
-- 3. Para terpenos cuantitativos de alta calidad, considera una segunda pasada contra Leafly.
-- ============================================================