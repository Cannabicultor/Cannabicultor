-- Cannabicultor AI Sales v0.1: audit-only execution log.
-- Apply in Supabase before deploying /ai-sales/recommend.
create table if not exists ai_sales_runs (
  id uuid primary key,
  created_at timestamptz not null default now(),
  version text not null,
  status text not null check (status in ('invalid', 'needs_clarification', 'blocked', 'ready', 'audit_failed')),
  requirements jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  calculations jsonb not null default '{}'::jsonb,
  candidates_considered jsonb not null default '[]'::jsonb,
  discarded jsonb not null default '[]'::jsonb,
  selected_items jsonb not null default '[]'::jsonb,
  total_eur numeric(10,2),
  response jsonb not null default '{}'::jsonb
);

alter table ai_sales_runs enable row level security;
drop policy if exists "Service role writes ai sales runs" on ai_sales_runs;
create policy "Service role writes ai sales runs" on ai_sales_runs
  for all to service_role using (true) with check (true);
