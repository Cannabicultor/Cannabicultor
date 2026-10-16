-- Conexión OAuth de la cuenta editorial de Cannabicultor con X.
-- Los tokens nunca se guardan en claro: token_ciphertext contiene AES-256-GCM
-- cifrado en el Worker con el secreto X_TOKEN_ENCRYPTION_KEY.

create table if not exists public.x_oauth_pending (
  state uuid primary key,
  code_verifier text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.x_oauth_connections (
  connection_key text primary key,
  x_user_id text not null,
  username text not null,
  display_name text,
  token_ciphertext text not null,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.x_oauth_pending enable row level security;
alter table public.x_oauth_connections enable row level security;

-- No se crean políticas públicas: el Worker usa exclusivamente service_role.
