-- Directorio de growshops de España + reseñas (tipo growshop).
-- Lectura pública (activo=true). Altas y reseñas solo vía Worker (service_role).

create table if not exists public.growshops (
  id bigserial primary key,
  slug text not null unique,
  nombre text not null,
  direccion text,
  cp text,
  ciudad text,
  provincia text,
  ccaa text,
  lat double precision,
  lon double precision,
  telefono text,
  email text,
  web text,
  instagram text,
  logo_url text,
  horario text,
  descripcion text,
  fuente text not null default 'manual',
  osm_id text unique,
  cadena text,
  verificado boolean not null default false,
  activo boolean not null default true,
  enviado_por text,
  notas_envio text,
  media_resenas numeric(3,1),
  num_resenas int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists growshops_activo_ccaa_idx
  on public.growshops (activo, ccaa, ciudad);
create index if not exists growshops_resenas_idx
  on public.growshops (num_resenas desc, media_resenas desc)
  where activo;
create index if not exists growshops_nombre_idx
  on public.growshops (lower(nombre));

alter table public.growshops enable row level security;

drop policy if exists growshops_public_read on public.growshops;
create policy growshops_public_read on public.growshops
  for select using (activo = true);

grant select on public.growshops to anon, authenticated;

-- Reseñas: ampliar el check a growshop
alter table public.resenas drop constraint if exists resenas_tipo_check;
alter table public.resenas
  add constraint resenas_tipo_check
  check (tipo in ('variedad', 'breeder', 'growshop'));

create or replace function public.refresh_growshop_resenas()
returns trigger
language plpgsql
as $$
declare
  tid bigint;
begin
  tid := coalesce(NEW.target_id, OLD.target_id);
  if coalesce(NEW.tipo, OLD.tipo) <> 'growshop' then
    return coalesce(NEW, OLD);
  end if;
  update public.growshops g
  set
    num_resenas = s.n,
    media_resenas = case when s.n > 0 then round(s.avg::numeric, 1) else null end,
    updated_at = now()
  from (
    select count(*)::int as n, avg(puntuacion) as avg
    from public.resenas
    where tipo = 'growshop' and target_id = tid
  ) s
  where g.id = tid;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists resenas_growshop_refresh on public.resenas;
create trigger resenas_growshop_refresh
after insert or update or delete on public.resenas
for each row execute function public.refresh_growshop_resenas();

notify pgrst, 'reload schema';
