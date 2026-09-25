-- Multi-país (fase 1): columna pais + filtro por país en directorio_buscar.
-- NO aplicado todavía. Ejecutar en Supabase (SQL editor) ANTES de desplegar el worker
-- que envía p_pais (el worker viejo sigue funcionando: p_pais tiene default 'ES').

begin;

alter table public.growshops    add column if not exists pais text not null default 'ES';
alter table public.asociaciones add column if not exists pais text not null default 'ES';
alter table public.cbd_shops    add column if not exists pais text not null default 'ES';

alter table public.growshops    drop constraint if exists growshops_pais_iso2;
alter table public.growshops    add  constraint growshops_pais_iso2    check (pais ~ '^[A-Z]{2}$');
alter table public.asociaciones drop constraint if exists asociaciones_pais_iso2;
alter table public.asociaciones add  constraint asociaciones_pais_iso2 check (pais ~ '^[A-Z]{2}$');
alter table public.cbd_shops    drop constraint if exists cbd_shops_pais_iso2;
alter table public.cbd_shops    add  constraint cbd_shops_pais_iso2    check (pais ~ '^[A-Z]{2}$');

create index if not exists growshops_pais_idx    on public.growshops (pais);
create index if not exists asociaciones_pais_idx on public.asociaciones (pais);
create index if not exists cbd_shops_pais_idx    on public.cbd_shops (pais);

-- Firma nueva (+ p_pais). Se borra la vieja para evitar overloads ambiguos en PostgREST.
drop function if exists public.directorio_buscar(text, text, text, integer);

create or replace function public.directorio_buscar(
  p_texto text,
  p_candidato text default null,
  p_tipo text default 'ambos',
  p_limit integer default 8,
  p_pais text default 'ES'
)
returns table(tipo text, nombre text, ciudad text, provincia text, direccion text, telefono text, web text, instagram text, match_len integer)
language sql
stable
as $function$
  with q as (select ' '||regexp_replace(norm_txt(p_texto), '[^a-z0-9 ]', ' ', 'g')||' ' as t,
                    nullif(trim(norm_txt(p_candidato)), '') as c,
                    coalesce(nullif(upper(trim(p_pais)), ''), 'ES') as pais),
  base as (
    select 'growshop'::text tipo, g.nombre, g.ciudad, g.provincia, g.direccion, g.telefono, g.web, g.instagram
      from growshops g, q where g.activo and g.pais = q.pais and p_tipo in ('growshop','ambos','todos')
    union all
    select 'asociacion', a.nombre, a.ciudad, a.provincia, a.direccion, a.telefono, a.web, a.instagram
      from asociaciones a, q where a.activo and a.pais = q.pais and p_tipo in ('asociacion','ambos','todos')
    union all
    -- CBD solo si se pide explícitamente ('cbd' o 'todos'): 'ambos' (chat) no cambia.
    select 'cbd', c.nombre, c.ciudad, c.provincia, c.direccion, c.telefono, c.web, c.instagram
      from cbd_shops c, q where c.activo and c.pais = q.pais and p_tipo in ('cbd','todos')
  ),
  scored as (
    select b.*, greatest(
      case when length(norm_txt(b.ciudad)) >= 4 and q.t like '% '||norm_txt(b.ciudad)||' %' then length(b.ciudad)+100 else 0 end,
      case when length(norm_txt(b.provincia)) >= 4 and q.t like '% '||norm_txt(b.provincia)||' %' then length(b.provincia)+50 else 0 end,
      case when q.c is not null and length(q.c) >= 4 and norm_txt(b.ciudad) like '%'||q.c||'%' then length(q.c)+20 else 0 end
    ) as match_len
    from base b, q
  ),
  best as (select max(match_len) m from scored where match_len > 0)
  select s.tipo, s.nombre, s.ciudad, s.provincia, s.direccion, s.telefono, s.web, s.instagram, s.match_len
  from scored s, best
  where s.match_len > 0 and s.match_len >= best.m - 60
  order by s.match_len desc, (s.web is not null) desc, s.nombre
  limit p_limit;
$function$;

grant execute on function public.directorio_buscar(text, text, text, integer, text) to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';
