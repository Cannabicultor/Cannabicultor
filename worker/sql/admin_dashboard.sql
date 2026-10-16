-- Dashboard admin unificado: un solo JSON con todas las métricas. Solo service_role.
create or replace function public.admin_dashboard()
returns jsonb
language sql
security definer
set search_path = public
as $$
select jsonb_build_object(
  'generado', now(),
  'ia_dia', (select coalesce(jsonb_agg(jsonb_build_object('dia', d::date, 'n', coalesce(c.n,0)) order by d), '[]'::jsonb)
    from generate_series(current_date - 29, current_date, '1 day') d
    left join (select created_at::date dia, count(*) n from ia_consultas where coalesce(es_sistema,false)=false and created_at > current_date - 30 group by 1) c on c.dia = d::date),
  'registros_dia', (select coalesce(jsonb_agg(jsonb_build_object('dia', d::date, 'n', coalesce(c.n,0)) order by d), '[]'::jsonb)
    from generate_series(current_date - 29, current_date, '1 day') d
    left join (select fecha_registro::date dia, count(*) n from "Usuarios" where fecha_registro > current_date - 30 group by 1) c on c.dia = d::date),
  'trafico_dia', (select coalesce(jsonb_agg(jsonb_build_object('dia', d::date, 'vistas', coalesce(c.v,0), 'sesiones', coalesce(c.s,0)) order by d), '[]'::jsonb)
    from generate_series(current_date - 13, current_date, '1 day') d
    left join (select created_at::date dia, count(*) v, count(distinct session_id) s from page_views where coalesce(interno,false)=false and created_at > current_date - 14 group by 1) c on c.dia = d::date),
  'x_dia', (select coalesce(jsonb_agg(jsonb_build_object('dia', d::date, 'n', coalesce(c.n,0)) order by d), '[]'::jsonb)
    from generate_series(current_date - 29, current_date, '1 day') d
    left join (select published_at::date dia, count(*) n from x_agent_drafts where status='published' and published_at > current_date - 30 group by 1) c on c.dia = d::date),
  'hoy', jsonb_build_object(
    'datos_por_aprobar', (select count(*) from field_proposals where status not in ('publicado','rechazado')),
    'negocios_nuevos', (select count(*) from directory_candidates where status='pending_review'),
    'fotos_variedades', (select count(*) from variedad_fotos where estado not in ('aprobada','rechazada')),
    'publicadas_7d', (select count(*) from field_proposals where status='publicado' and reviewed_at > now() - interval '7 days'),
    'descubiertas_7d', (select count(*) from directory_candidates where discovered_at > now() - interval '7 days'),
    'emails_7d', (select count(*) from emails_campana where enviado_at > now() - interval '7 days'),
    'emails_total', (select count(*) from emails_campana),
    'emails_ultima', (select jsonb_build_object('campana', campana, 'enviado_at', max(enviado_at)) from emails_campana group by campana order by max(enviado_at) desc limit 1),
    'x_borradores', (select count(*) from x_agent_drafts where status='draft'),
    'x_aprobados', (select count(*) from x_agent_drafts where status='approved')),
  'venta', jsonb_build_object(
    'por_aprobar', (select count(*) from ventas_aprobaciones where estado='pendiente'),
    'por_aprobar_lista', (select coalesce(jsonb_agg(jsonb_build_object('titulo', titulo, 'tipo', tipo, 'created_at', created_at)), '[]'::jsonb) from (select titulo, tipo, created_at from ventas_aprobaciones where estado='pendiente' order by created_at desc limit 5) a),
    'leads', (select count(*) from ventas_leads),
    'leads_por_estado', (select coalesce(jsonb_object_agg(estado, n), '{}'::jsonb) from (select estado, count(*) n from ventas_leads group by 1) e),
    'contactos', (select count(*) from ventas_leads where contacto_intentado_at is not null or ultimo_contacto_at is not null),
    'conversaciones_activas', (select count(distinct conversation_id) from sales_agent_turns where created_at > now() - interval '7 days')),
  'negocio', jsonb_build_object(
    'usuarios_total', (select count(*) from "Usuarios"),
    'usuarios_7d', (select count(*) from "Usuarios" where fecha_registro > now() - interval '7 days'),
    'por_plan', (select coalesce(jsonb_object_agg(plan, n), '{}'::jsonb) from (select coalesce(plan,'sin plan') plan, count(*) n from "Usuarios" group by 1) p),
    'compras_creditos_30d', (select count(*) from creditos_movimientos where motivo='compra' and created_at > now() - interval '30 days'),
    'registro_chat_ok_7d', (select count(*) from eventos where evento='registro_chat_ok' and created_at > now() - interval '7 days'),
    'registro_chat_mostrado_7d', (select count(*) from eventos where evento='registro_chat_mostrado' and created_at > now() - interval '7 days')),
  'pulso_ia', jsonb_build_object(
    'hoy', (select count(*) from ia_consultas where coalesce(es_sistema,false)=false and created_at >= current_date),
    'semana', (select count(*) from ia_consultas where coalesce(es_sistema,false)=false and created_at > now() - interval '7 days'),
    'feedback_pos', (select count(*) from ia_consultas where feedback > 0 and created_at > now() - interval '30 days'),
    'feedback_neg', (select count(*) from ia_consultas where feedback < 0 and created_at > now() - interval '30 days'),
    'huecos_abiertos', (select count(*) from kb_huecos where estado not in ('resuelto','descartado','cerrado')),
    'rag_score_medio_7d', (select round(avg(rag_top_score)::numeric, 2) from ia_consultas where created_at > now() - interval '7 days' and rag_top_score is not null),
    'top_categorias', (select coalesce(jsonb_agg(jsonb_build_object('categoria', categoria, 'n', n)), '[]'::jsonb) from (select coalesce(categoria,'otras') categoria, count(*) n from ia_consultas where created_at > now() - interval '30 days' group by 1 order by 2 desc limit 5) t)),
  'ultimas_consultas', (select coalesce(jsonb_agg(jsonb_build_object('pregunta', left(pregunta, 160), 'canal', canal, 'categoria', categoria, 'created_at', created_at)), '[]'::jsonb) from (select pregunta, canal, categoria, created_at from ia_consultas where coalesce(es_sistema,false)=false order by created_at desc limit 12) u),
  'directorios', (public.dashboard_stats() -> 'directorios')
);
$$;
revoke all on function public.admin_dashboard() from public, anon, authenticated;
grant execute on function public.admin_dashboard() to service_role;
