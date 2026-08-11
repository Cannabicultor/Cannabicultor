-- Diario de cultivo: entradas diarias por usuario
-- Aplicar en Supabase SQL Editor o: psql "$DATABASE_URL" -f sql/diario_entradas.sql
-- RLS deny-all (sin políticas anon/authenticated): solo service_role vía Worker.

-- Nota: "Usuarios".email no tiene UNIQUE en prod → no se puede FK.
-- El Worker valida JWT + email antes de insertar (mismo patrón service_role).
create table if not exists public.diario_entradas (
  id bigserial primary key,
  usuario_email text not null,
  fecha date not null default current_date,
  dia_ciclo int,
  etapa text,
  ph numeric, ec numeric, temp numeric, hum numeric, vpd numeric,
  riego_litros numeric, riego_ph numeric, riego_ec numeric,
  runoff_ph numeric, runoff_ec numeric,
  fertilizantes jsonb,
  plagas text, hongos text, tratamiento text,
  poda text, trasplante boolean default false,
  foto_url text, notas text,
  created_at timestamptz default now()
);

create index if not exists diario_entradas_email_fecha_idx
  on public.diario_entradas (usuario_email, fecha desc, created_at desc);

alter table public.diario_entradas enable row level security;

-- Sin políticas: anon/authenticated no leen ni escriben. Worker usa service_role.
