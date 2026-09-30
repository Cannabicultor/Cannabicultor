-- Additive editorial metadata, validated against the live schema on 2026-09-20.
-- Run only after 202609200001_agent_data_control_plane.sql. No existing data is changed.

alter table public.variedades
  add column if not exists editorial_status text not null default 'borrador',
  add column if not exists descripcion_tldr text,
  add column if not exists tipo_semilla text,
  add column if not exists linaje_padre text,
  add column if not exists linaje_madre text,
  add column if not exists maduracion_exterior text,
  add column if not exists source_url text;

alter table public.breeders
  add column if not exists editorial_status text not null default 'borrador',
  add column if not exists descripcion_tldr text,
  add column if not exists source_url text;

alter table public.growshops
  add column if not exists editorial_status text not null default 'borrador',
  add column if not exists descripcion_tldr text,
  add column if not exists source_url text;

alter table public.asociaciones
  add column if not exists editorial_status text not null default 'borrador',
  add column if not exists descripcion_tldr text,
  add column if not exists source_url text;

do $$
declare t text;
begin
  foreach t in array array['variedades','breeders','growshops','asociaciones'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_editorial_status_check');
    execute format($fmt$alter table public.%I add constraint %I check
      (editorial_status in ('borrador','publicado','pendiente_revision','archivado','inactivo'))$fmt$,
      t, t || '_editorial_status_check');
    execute format('create index if not exists %I on public.%I (editorial_status, updated_at desc)', t || '_editorial_status_idx', t);
  end loop;
end $$;

comment on column public.variedades.tipo_semilla is 'Tipo editorial normalizado; no sustituye datos canónicos existentes.';
comment on column public.variedades.source_url is 'Fuente principal trazable para el contenido editorial.';
notify pgrst, 'reload schema';
