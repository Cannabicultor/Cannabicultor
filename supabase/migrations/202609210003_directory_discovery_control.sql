-- Control plane for sourced directory discovery. Apply manually after the two prior migrations.
-- This migration does not insert or modify any growshop.

alter table public.growshops
  add column if not exists instagram text,
  add column if not exists facebook text,
  add column if not exists google_maps_url text,
  add column if not exists verification_sources jsonb not null default '[]'::jsonb;

alter table public.agent_jobs
  drop constraint if exists agent_jobs_job_type_check;
alter table public.agent_jobs
  add constraint agent_jobs_job_type_check check (job_type in (
    'sync_sheet_supabase',
    'enrichment_deepseek',
    'alert_scan',
    'directory_discovery',
    'directory_duplicate_check'
  ));

create table if not exists public.directory_candidates (
  id uuid primary key default gen_random_uuid(),
  entity_table text not null check (entity_table in ('growshops', 'asociaciones', 'breeders', 'variedades')),
  candidate jsonb not null,
  evidence jsonb not null default '{}'::jsonb,
  identity_keys jsonb not null default '{}'::jsonb,
  status text not null default 'pending_review' check (status in ('pending_review', 'duplicate', 'approved', 'rejected')),
  duplicate_entity_id bigint,
  duplicate_reason text,
  discovered_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists directory_candidates_status_idx
  on public.directory_candidates (entity_table, status, discovered_at desc);

drop trigger if exists directory_candidates_set_updated_at on public.directory_candidates;
create trigger directory_candidates_set_updated_at before update on public.directory_candidates
for each row execute function public.set_agent_updated_at();

alter table public.directory_candidates enable row level security;
drop policy if exists directory_candidates_service_role on public.directory_candidates;
create policy directory_candidates_service_role on public.directory_candidates
for all to service_role using (true) with check (true);

-- A duplicate is only decided from identity fields, never from generic data such as city,
-- description or category. Matching is exact after basic normalization.
create or replace function public.register_directory_candidate(
  p_entity_table text,
  p_candidate jsonb,
  p_evidence jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text := nullif(lower(regexp_replace(coalesce(p_candidate ->> 'nombre', ''), '[^a-z0-9]+', '', 'g')), '');
  v_phone text := nullif(regexp_replace(coalesce(p_candidate ->> 'telefono', ''), '[^0-9]+', '', 'g'), '');
  v_email text := nullif(lower(btrim(coalesce(p_candidate ->> 'email', ''))), '');
  v_web text := nullif(lower(regexp_replace(coalesce(p_candidate ->> 'web', ''), '^https?://(www\\.)?', '', 'i')), '');
  v_instagram text := nullif(lower(regexp_replace(coalesce(p_candidate ->> 'instagram', ''), '^@', '')), '');
  v_existing_id bigint;
  v_reason text;
  v_candidate_id uuid;
begin
  if p_entity_table <> 'growshops' or jsonb_typeof(p_candidate) <> 'object' or jsonb_typeof(p_evidence) <> 'object' then
    raise exception 'invalid directory candidate';
  end if;
  if v_name is null then
    raise exception 'candidate requires nombre';
  end if;

  select g.id,
    case
      when v_phone is not null and regexp_replace(coalesce(g.telefono, ''), '[^0-9]+', '', 'g') = v_phone then 'telefono'
      when v_email is not null and lower(coalesce(g.email, '')) = v_email then 'email'
      when v_web is not null and lower(regexp_replace(coalesce(g.web, ''), '^https?://(www\\.)?', '', 'i')) = v_web then 'web'
      when v_instagram is not null and lower(regexp_replace(coalesce(g.instagram, ''), '^@', '')) = v_instagram then 'instagram'
      when lower(regexp_replace(coalesce(g.nombre, ''), '[^a-z0-9]+', '', 'g')) = v_name then 'nombre'
    end
  into v_existing_id, v_reason
  from public.growshops g
  where (v_phone is not null and regexp_replace(coalesce(g.telefono, ''), '[^0-9]+', '', 'g') = v_phone)
     or (v_email is not null and lower(coalesce(g.email, '')) = v_email)
     or (v_web is not null and lower(regexp_replace(coalesce(g.web, ''), '^https?://(www\\.)?', '', 'i')) = v_web)
     or (v_instagram is not null and lower(regexp_replace(coalesce(g.instagram, ''), '^@', '')) = v_instagram)
     or lower(regexp_replace(coalesce(g.nombre, ''), '[^a-z0-9]+', '', 'g')) = v_name
  order by g.id asc
  limit 1;

  insert into public.directory_candidates(entity_table, candidate, evidence, identity_keys, status, duplicate_entity_id, duplicate_reason)
  values (
    p_entity_table,
    p_candidate,
    p_evidence,
    jsonb_strip_nulls(jsonb_build_object('nombre', v_name, 'telefono', v_phone, 'email', v_email, 'web', v_web, 'instagram', v_instagram)),
    case when v_existing_id is null then 'pending_review' else 'duplicate' end,
    v_existing_id,
    v_reason
  ) returning id into v_candidate_id;

  if v_existing_id is not null then
    insert into public.agent_alerts(severity, alert_type, entity_table, entity_id, message, details, dedupe_key)
    values (
      'warning', 'directory_duplicate', 'growshops', v_existing_id,
      'Posible growshop duplicado; no se ha publicado.',
      jsonb_build_object('candidate_id', v_candidate_id, 'matched_field', v_reason),
      'directory-duplicate:growshops:' || v_existing_id || ':' || v_reason || ':' || md5(v_name || coalesce(v_phone, '') || coalesce(v_email, '') || coalesce(v_web, '') || coalesce(v_instagram, ''))
    ) on conflict (dedupe_key) do update set details = excluded.details, resolved_at = null;
  end if;

  return jsonb_build_object('candidate_id', v_candidate_id, 'status', case when v_existing_id is null then 'pending_review' else 'duplicate' end, 'duplicate_entity_id', v_existing_id, 'duplicate_reason', v_reason);
end;
$$;

revoke all on function public.register_directory_candidate(text, jsonb, jsonb) from public;
grant execute on function public.register_directory_candidate(text, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
