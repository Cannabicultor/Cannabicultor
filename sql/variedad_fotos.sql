-- Fotos de variedades con aprobación previa: subidas de usuarios y candidatas de un buscador.
-- NADA se publica sin pasar a estado 'aprobada'. Al aprobar, el Worker copia la imagen optimizada al bucket
-- público `variedades` y rellena variedades.image_url (y foto_credito). Las pendientes viven en un bucket PRIVADO.
--
-- Mismo patrón que resenas.sql / diario_fotos.sql: RLS deny-all, acceso solo desde el Worker (service_role).
-- OJO (ver notas de seguridad Supabase): REVOKE ... FROM PUBLIC no basta; se nombran anon y authenticated.
--
-- NO APLICADA TODAVÍA: revisar y ejecutar en el SQL Editor de Supabase.

create table if not exists public.variedad_fotos (
  id bigserial primary key,
  variedad_id bigint not null references public.variedades(id) on delete cascade,
  origen text not null check (origen in ('usuario', 'candidata')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),

  -- Dónde está el archivo
  storage_path text,            -- ruta en el bucket privado `variedades-pendientes` (subidas de usuario)
  public_path text,             -- ruta en el bucket público `variedades` una vez aprobada
  source_url text,              -- candidatas: URL de la imagen original (NO se hotlinkea; solo para descargarla al aprobar)
  landing_url text,             -- candidatas: página donde está la imagen (para revisar el contexto y la licencia)
  source_domain text,

  -- Derechos y crédito (obligatorios para aprobar)
  licencia text,                -- 'cc0', 'by', 'by-sa', 'permiso-criador', 'propia-usuario', 'desconocida'
  licencia_url text,
  autor text,
  derechos_confirmados boolean not null default false,  -- el usuario marca "tengo derechos sobre esta foto"
  nota_permiso text,            -- p. ej. "autorizado por <criador> el <fecha>"

  -- Quién y cuándo
  usuario_email text,           -- solo origen='usuario'
  score numeric,                -- candidatas: confianza de que la foto es de ESA variedad (0-1)
  sha256 text,                  -- para no repetir la misma imagen
  width int,
  height int,

  -- Moderación
  motivo_rechazo text,
  revisado_por text,
  revisado_at timestamptz,
  created_at timestamptz not null default now(),

  constraint variedad_fotos_origen_check check (
    (origen = 'usuario' and usuario_email is not null and storage_path is not null)
    or (origen = 'candidata' and source_url is not null)
  ),
  constraint variedad_fotos_aprobada_check check (
    estado <> 'aprobada' or (public_path is not null and licencia is not null and licencia <> 'desconocida')
  )
);

create index if not exists variedad_fotos_estado_idx on public.variedad_fotos (estado, created_at desc);
create index if not exists variedad_fotos_variedad_idx on public.variedad_fotos (variedad_id);
create unique index if not exists variedad_fotos_unica_por_imagen on public.variedad_fotos (variedad_id, sha256);  -- NULL no choca con NULL
create unique index if not exists variedad_fotos_unica_candidata on public.variedad_fotos (variedad_id, source_url);  -- sin 'where': PostgREST on_conflict no infiere índices parciales
-- Un usuario no puede acumular montones de pendientes de la misma ficha:
create unique index if not exists variedad_fotos_una_pendiente_por_usuario
  on public.variedad_fotos (variedad_id, usuario_email) where estado = 'pendiente' and origen = 'usuario';

alter table public.variedad_fotos enable row level security;
revoke all on table public.variedad_fotos from public, anon, authenticated;
revoke all on sequence public.variedad_fotos_id_seq from public, anon, authenticated;

-- Crédito visible de la foto publicada (se muestra bajo la imagen: "Foto: autor · licencia").
alter table public.variedades add column if not exists foto_credito text;

-- Buckets: pendientes PRIVADO; aprobadas PÚBLICO (solo lectura; nadie escribe salvo el Worker con service_role).
insert into storage.buckets (id, name, public)
values ('variedades-pendientes', 'variedades-pendientes', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('variedades', 'variedades', true)
on conflict (id) do nothing;
