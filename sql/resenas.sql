-- Reseñas de variedad / breeder. RLS deny-all: solo el Worker (service_role).
-- Una reseña por usuario y ficha.

create table if not exists public.resenas (
  id bigserial primary key,
  tipo text not null check (tipo in ('variedad', 'breeder')),
  target_id bigint not null,
  usuario_email text not null,
  nombre_publico text,
  puntuacion int not null check (puntuacion between 1 and 5),
  texto text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists resenas_one_per_user
  on public.resenas (tipo, target_id, usuario_email);

create index if not exists resenas_target_idx
  on public.resenas (tipo, target_id, created_at desc);

alter table public.resenas enable row level security;

-- Los 2.056 breeders sin flag no están desactivados: nunca se marcaron.
update public.breeders
set activo = true
where activo is null;
