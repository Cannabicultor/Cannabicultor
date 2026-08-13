-- Fotos de cultivo: una fila por archivo, ligada al usuario y (si existe) a la entrada del diario.
-- El bucket Storage `plantas` es privado. Aquí solo guardamos la ruta; el Worker firma la URL al leer.
-- RLS deny-all: anon/authenticated no leen ni escriben. Worker usa service_role.

create table if not exists public.diario_fotos (
  id bigserial primary key,
  usuario_email text not null,
  entrada_id bigint references public.diario_entradas(id) on delete set null,
  storage_path text not null,
  origen text,
  created_at timestamptz default now(),
  unique (storage_path)
);

create index if not exists diario_fotos_email_idx
  on public.diario_fotos (usuario_email, created_at desc);

create index if not exists diario_fotos_entrada_idx
  on public.diario_fotos (entrada_id);

alter table public.diario_fotos enable row level security;

-- Relacionar fotos ya subidas (carpeta = email) con el usuario y una entrada de ese día.
insert into public.diario_entradas (usuario_email, fecha, foto_url, notas, created_at)
select
  split_part(o.name, '/', 1) as usuario_email,
  (o.created_at at time zone 'utc')::date as fecha,
  o.name as foto_url,
  'Foto del cultivo' as notas,
  o.created_at
from storage.objects o
where o.bucket_id = 'plantas'
  and split_part(o.name, '/', 1) like '%@%'
  and not exists (
    select 1 from public.diario_entradas d
    where d.usuario_email = split_part(o.name, '/', 1)
      and d.foto_url = o.name
  );

insert into public.diario_fotos (usuario_email, entrada_id, storage_path, origen, created_at)
select
  d.usuario_email,
  d.id,
  d.foto_url,
  'backfill',
  d.created_at
from public.diario_entradas d
where d.foto_url is not null
  and d.foto_url not like 'http%'
  and not exists (
    select 1 from public.diario_fotos f where f.storage_path = d.foto_url
  );
