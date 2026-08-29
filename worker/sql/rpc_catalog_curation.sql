-- =====================================================================
-- RPC de matching para el agente de curación de catálogo
-- Invocadas desde el Worker (catalog-curation.js) vía PostgREST /rpc/<fn>
-- Mismo espíritu que el pase exacto_norm + trgm de 04_dedupe_candidatos.sql
-- (cannabis-pedigree), pero como funciones por-ítem: la ingesta es continua,
-- no un recálculo masivo. Aplicadas en Supabase (gfyrsrdnvgnhtsuexjkb) via
-- migraciones: curacion_catalogo_funciones_normalizacion,
-- rpc_catalog_curation_matching, restringir_rpc_catalog_curation_a_service_role.
-- Este archivo es la copia de referencia versionada en el repo.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.norm_product_name(txt text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT nullif(
    regexp_replace(
      btrim(
        regexp_replace(
          translate(
            lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(txt, ''))),
            '.,''"’-_#', ''
          ),
          '\s+', ' ', 'g'
        )
      ),
    '\s+', ' ', 'g'),
  '')
$$;

CREATE OR REPLACE FUNCTION public.product_core(nn text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(coalesce(nn,''),
      '\m([0-9]+([.,][0-9]+)?\s?(ml|l|litros?|litro|kg|kgs|gr|gramos?|g|w|watts?|mm|cm|m2|m²|x[0-9]+)|[0-9]+x[0-9]+(x[0-9]+)?)\M',
      ' ', 'gi'),
    '\s+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.is_generic_shortname_producto(nn text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT nn IN ('kit', 'set', 'pack', 'combo', 'accesorio', 'repuesto')
      OR length(nn) <= 3
$$;

CREATE OR REPLACE FUNCTION public.match_product_by_norm_name(p_name text)
RETURNS TABLE(product_id uuid, canonical_name text)
LANGUAGE sql STABLE AS $$
  SELECT pi.id, pi.canonical_name
  FROM public.product_intelligence pi
  WHERE public.norm_product_name(pi.canonical_name) = public.norm_product_name(p_name)
  ORDER BY pi.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.match_product_by_trgm(p_name text, p_threshold numeric DEFAULT 0.75)
RETURNS TABLE(product_id uuid, canonical_name text, similitud numeric, mismo_core boolean)
LANGUAGE sql STABLE AS $$
  SELECT
    pi.id,
    pi.canonical_name,
    similarity(public.norm_product_name(pi.canonical_name), public.norm_product_name(p_name))::numeric AS similitud,
    (public.product_core(public.norm_product_name(pi.canonical_name)) = public.product_core(public.norm_product_name(p_name))) AS mismo_core
  FROM public.product_intelligence pi
  WHERE similarity(public.norm_product_name(pi.canonical_name), public.norm_product_name(p_name)) >= p_threshold
    AND NOT public.is_generic_shortname_producto(public.norm_product_name(pi.canonical_name))
  ORDER BY similitud DESC
  LIMIT 5;
$$;

CREATE INDEX IF NOT EXISTS product_intelligence_canonical_name_trgm_idx
  ON public.product_intelligence USING gin (canonical_name gin_trgm_ops);

REVOKE EXECUTE ON FUNCTION public.match_product_by_norm_name(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_product_by_trgm(text, numeric) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_product_by_norm_name(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_product_by_trgm(text, numeric) TO service_role;
