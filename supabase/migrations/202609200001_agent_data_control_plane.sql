-- Cannabicultor agent data control plane. Apply manually in Supabase SQL Editor.
-- This migration is idempotent and does not modify catalog data.

create extension if not exists pgcrypto;

create table if not exists public.field_locks (
  id uuid primary key default gen_random_uuid(),
  entity_table text not null check (entity_table in ('variedades', 'breeders', 'growshops', 'asociaciones')),
  entity_id bigint not null,
  field_name text not null,
  is_locked boolean not null default false,
  locked_by_source text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_table, entity_id, field_name)
);

create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('sync_sheet_supabase', 'enrichment_deepseek', 'alert_scan')),
  entity_table text check (entity_table is null or entity_table in ('variedades', 'breeders', 'growshops', 'asociaciones')),
  entity_id bigint,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'claimed', 'succeeded', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  claimed_at timestamptz,
  claimed_by text,
  run_after timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_alerts (
  id uuid primary key default gen_random_uuid(),
  severity text not null default 'warning' check (severity in ('info', 'warning', 'error', 'critical')),
  alert_type text not null,
  entity_table text,
  entity_id bigint,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  sent_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_jobs_claim_idx on public.agent_jobs (status, run_after, created_at)
  where status = 'queued';
create index if not exists agent_jobs_failed_idx on public.agent_jobs (attempts, updated_at)
  where status = 'failed';
create index if not exists field_locks_entity_idx on public.field_locks (entity_table, entity_id);
create index if not exists agent_alerts_open_idx on public.agent_alerts (created_at desc)
  where sent_at is null and resolved_at is null;

create or replace function public.set_agent_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists field_locks_set_updated_at on public.field_locks;
create trigger field_locks_set_updated_at before update on public.field_locks
for each row execute function public.set_agent_updated_at();
drop trigger if exists agent_jobs_set_updated_at on public.agent_jobs;
create trigger agent_jobs_set_updated_at before update on public.agent_jobs
for each row execute function public.set_agent_updated_at();
drop trigger if exists agent_alerts_set_updated_at on public.agent_alerts;
create trigger agent_alerts_set_updated_at before update on public.agent_alerts
for each row execute function public.set_agent_updated_at();

alter table public.field_locks enable row level security;
alter table public.agent_jobs enable row level security;
alter table public.agent_alerts enable row level security;

drop policy if exists agent_control_service_role on public.field_locks;
create policy agent_control_service_role on public.field_locks for all to service_role using (true) with check (true);
drop policy if exists agent_jobs_service_role on public.agent_jobs;
create policy agent_jobs_service_role on public.agent_jobs for all to service_role using (true) with check (true);
drop policy if exists agent_alerts_service_role on public.agent_alerts;
create policy agent_alerts_service_role on public.agent_alerts for all to service_role using (true) with check (true);

-- Atomically claims a small queue batch. Do not replace this with SELECT then UPDATE in n8n.
create or replace function public.claim_agent_jobs(p_worker text, p_job_type text, p_limit integer default 10)
returns setof public.agent_jobs
language sql security definer set search_path = public as $$
  with candidates as (
    select id from public.agent_jobs
    where status = 'queued'
      and job_type = p_job_type
      and run_after <= now()
      and attempts < max_attempts
    order by run_after, created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update public.agent_jobs j
  set status = 'claimed', claimed_at = now(), claimed_by = p_worker, attempts = j.attempts + 1
  from candidates c
  where j.id = c.id
  returning j.*;
$$;

revoke all on function public.claim_agent_jobs(text, text, integer) from public;
grant execute on function public.claim_agent_jobs(text, text, integer) to service_role;

-- Security boundary for DeepSeek. It locks the canonical row first, then checks locks and
-- canonical values in the same transaction before writing. p_evidence is an object keyed by field,
-- whose values must include a non-empty url. It only ever fills NULL/blank text fields.
create or replace function public.apply_deepseek_enrichment(
  p_entity_table text,
  p_entity_id bigint,
  p_changes jsonb,
  p_evidence jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_field_name text;
  v_field_value text;
  v_current_value text;
  allowed_fields text[];
  conflict_fields text[] := '{}';
  applied_fields text[] := '{}';
  evidence_item jsonb;
  found_row boolean;
  v_rows integer;
begin
  if p_entity_table not in ('variedades', 'breeders', 'growshops', 'asociaciones')
     or jsonb_typeof(p_changes) <> 'object' or jsonb_typeof(p_evidence) <> 'object' then
    raise exception 'invalid enrichment input';
  end if;
  allowed_fields := case p_entity_table
    when 'variedades' then array['descripcion_tldr','tipo_semilla','linaje_padre','linaje_madre','maduracion_exterior','source_url']
    else array['descripcion_tldr','source_url']
  end;

  -- Serializes competing enrichments and manual writes that lock the entity through this RPC.
  execute format('select true from public.%I where id = $1 for update', p_entity_table)
    into found_row using p_entity_id;
  if not coalesce(found_row, false) then
    raise exception 'entity not found: %.%', p_entity_table, p_entity_id;
  end if;

  for v_field_name, v_field_value in select key, value from jsonb_each_text(p_changes)
  loop
    if not v_field_name = any(allowed_fields) or nullif(btrim(v_field_value), '') is null then
      conflict_fields := array_append(conflict_fields, v_field_name);
      continue;
    end if;
    evidence_item := p_evidence -> v_field_name;
    if evidence_item is null or nullif(btrim(evidence_item ->> 'url'), '') is null then
      conflict_fields := array_append(conflict_fields, v_field_name);
      continue;
    end if;
    execute format('select %I::text from public.%I where id = $1', v_field_name, p_entity_table)
      into v_current_value using p_entity_id;
    if exists (select 1 from public.field_locks fl where fl.entity_table = p_entity_table and fl.entity_id = p_entity_id
                 and fl.field_name = v_field_name and fl.is_locked)
       or nullif(btrim(v_current_value), '') is not null then
      conflict_fields := array_append(conflict_fields, v_field_name);
      continue;
    end if;
    execute format('update public.%I set %I = $1 where id = $2 and nullif(btrim(%I::text), '''') is null',
                   p_entity_table, v_field_name, v_field_name)
      using btrim(v_field_value), p_entity_id;
    get diagnostics v_rows = row_count;
    if v_rows = 1 then
      insert into public.field_locks(entity_table, entity_id, field_name, is_locked, locked_by_source, evidence)
      values (p_entity_table, p_entity_id, v_field_name, false, 'agent_deepseek', jsonb_build_object('source', evidence_item))
      on conflict (entity_table, entity_id, field_name) do update
        set is_locked = false, locked_by_source = 'agent_deepseek', evidence = excluded.evidence;
      applied_fields := array_append(applied_fields, v_field_name);
    else
      conflict_fields := array_append(conflict_fields, v_field_name);
    end if;
  end loop;

  if cardinality(conflict_fields) > 0 then
    execute format('update public.%I set editorial_status = ''pendiente_revision'' where id = $1', p_entity_table) using p_entity_id;
    insert into public.agent_alerts(severity, alert_type, entity_table, entity_id, message, details, dedupe_key)
    values ('warning', 'deepseek_enrichment_conflict', p_entity_table, p_entity_id,
            'Enriquecimiento detenido: conflicto, campo bloqueado o evidencia insuficiente.',
            jsonb_build_object('fields', conflict_fields),
            'deepseek-conflict:' || p_entity_table || ':' || p_entity_id || ':' || md5(array_to_string(conflict_fields, ',')))
    on conflict (dedupe_key) do update set details = excluded.details, resolved_at = null;
  end if;
  return jsonb_build_object('applied_fields', applied_fields, 'conflict_fields', conflict_fields,
                            'status', case when cardinality(conflict_fields) > 0 then 'pendiente_revision' else 'ok' end);
end;
$$;
revoke all on function public.apply_deepseek_enrichment(text, bigint, jsonb, jsonb) from public;
grant execute on function public.apply_deepseek_enrichment(text, bigint, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
