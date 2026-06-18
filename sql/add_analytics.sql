-- Analytics: page views + public stats RPC
-- Run this in Supabase → SQL Editor

create table if not exists public.page_views (
  id bigint generated always as identity primary key,
  page_path text not null,
  page_title text,
  referrer text,
  session_id text not null,
  user_agent text,
  screen_width int,
  language text,
  created_at timestamptz not null default now()
);

create index if not exists page_views_created_at_idx on public.page_views (created_at desc);
create index if not exists page_views_page_path_idx on public.page_views (page_path);
create index if not exists page_views_session_id_idx on public.page_views (session_id);

alter table public.page_views enable row level security;

drop policy if exists "anon can insert page views" on public.page_views;
create policy "anon can insert page views"
  on public.page_views for insert to anon
  with check (true);

drop policy if exists "authenticated can insert page views" on public.page_views;
create policy "authenticated can insert page views"
  on public.page_views for insert to authenticated
  with check (true);

create or replace function public.get_visit_stats()
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    'total_views', coalesce(count(*)::int, 0),
    'unique_visitors', coalesce(count(distinct session_id)::int, 0),
    'today_views', coalesce(
      count(*) filter (where created_at >= (now() at time zone 'utc')::date)::int,
      0
    )
  )
  from page_views;
$$;

create or replace function public.get_analytics_dashboard()
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    'summary', (
      select json_build_object(
        'total_views', count(*)::int,
        'unique_visitors', count(distinct session_id)::int,
        'today_views', count(*) filter (where created_at >= (now() at time zone 'utc')::date)::int,
        'week_views', count(*) filter (where created_at >= now() - interval '7 days')::int,
        'month_views', count(*) filter (where created_at >= now() - interval '30 days')::int
      )
      from page_views
    ),
    'by_page', (
      select coalesce(json_agg(row_to_json(t) order by t.views desc), '[]'::json)
      from (
        select
          page_path,
          count(*)::int as views,
          count(distinct session_id)::int as unique_visitors
        from page_views
        group by page_path
        order by views desc
        limit 25
      ) t
    ),
    'daily', (
      select coalesce(json_agg(row_to_json(t) order by t.day asc), '[]'::json)
      from (
        select
          (created_at at time zone 'utc')::date as day,
          count(*)::int as views,
          count(distinct session_id)::int as unique_visitors
        from page_views
        where created_at >= now() - interval '30 days'
        group by 1
        order by 1 asc
      ) t
    ),
    'referrers', (
      select coalesce(json_agg(row_to_json(t) order by t.views desc), '[]'::json)
      from (
        select
          case when referrer is null or referrer = '' then '(directo)' else referrer end as referrer,
          count(*)::int as views
        from page_views
        group by 1
        order by views desc
        limit 15
      ) t
    )
  );
$$;

grant execute on function public.get_visit_stats() to anon, authenticated;
grant execute on function public.get_analytics_dashboard() to anon, authenticated;