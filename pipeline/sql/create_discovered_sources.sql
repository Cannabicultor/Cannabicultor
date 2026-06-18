-- ============================================================
-- Tabla para Discovery general (toda la red, no solo Seedfinder)
-- Usada por el Motor de Descubrimiento del pipeline local.
--
-- INSTRUCCIONES:
-- 1. Copia TODO este archivo (desde la línea 1 hasta el final).
-- 2. Pégalo en el SQL Editor de Supabase.
-- 3. Supabase te dará warnings sobre RLS y operaciones destructivas.
--    → Activa "Enable Row Level Security".
--    → Luego ejecuta.
-- ============================================================

create table if not exists discovered_sources (
  id bigserial primary key,
  url text not null unique,
  source text not null,                    -- 'sitemap:seedfinder.eu', 'search:dork', 'crawl:breeder', 'manual', 'reddit', etc.
  discovered_at timestamptz default now(),
  last_checked timestamptz,
  type text,                               -- 'breeder_home', 'strain_listing', 'strain_detail', 'news', 'lab_report', 'forum', 'other'
  candidate_name text,                     -- Nombre del breeder o variedad inferido
  status text default 'new',               -- new | queued | extracted | enriched | ignored | failed
  metadata jsonb default '{}'::jsonb,      -- cualquier info extra (sitemap lastmod, search rank, etc.)
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Índices útiles
create index if not exists idx_discovered_sources_status on discovered_sources(status);
create index if not exists idx_discovered_sources_source on discovered_sources(source);
create index if not exists idx_discovered_sources_type on discovered_sources(type);
create index if not exists idx_discovered_sources_last_checked on discovered_sources(last_checked);

-- Trigger para updated_at (útil para mantener actualizado el campo)
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_discovered_sources_updated on discovered_sources;
create trigger trg_discovered_sources_updated
before update on discovered_sources
for each row execute function set_updated_at();

-- ============================================================
-- SEGURIDAD: Row Level Security (RLS)
-- ============================================================

-- Activa RLS en la tabla (importante para que Supabase no te dé warnings)
alter table discovered_sources enable row level security;

-- Política: Solo el service_role (el que usan tus scripts locales con SUPABASE_SERVICE_KEY)
-- puede leer, insertar, actualizar y borrar.
-- Esto es lo más seguro para una tabla de pipeline interna.
create policy "Service role full access on discovered_sources"
  on discovered_sources
  for all
  to service_role
  using (true)
  with check (true);

-- (Opcional) Si en el futuro quieres que el admin-breeders.html (anon key)
-- pueda leer esta tabla para mostrar estadísticas de descubrimiento,
-- descomenta las siguientes líneas:
--
-- create policy "Anyone can read discovered_sources"
--   on discovered_sources
--   for select
--   to anon, authenticated
--   using (true);

-- Comentarios para documentación
comment on table discovered_sources is 'Fuentes descubiertas en toda la web para el pipeline de Cannabicultor (local on-demand, toda la red).';
comment on column discovered_sources.source is 'Origen del descubrimiento: sitemap, search:seed, serpapi:google, crawl, manual...';
comment on column discovered_sources.status is 'new = recién descubierto | processed = ya convertido en breeder/variedad | reviewed | failed';

-- Ejemplo de consulta útil después de correr discovery/harvest:
-- SELECT source, status, count(*) FROM discovered_sources GROUP BY source, status ORDER BY count(*) DESC;
-- SELECT * FROM discovered_sources WHERE status = 'new' ORDER BY discovered_at DESC LIMIT 30;
