create table if not exists public.x_agent_drafts (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(text) <= 280),
  status text not null default 'draft' check (status in ('draft','approved','published','rejected')),
  x_post_id text,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
alter table public.x_agent_drafts enable row level security;
