-- Documentos legales aprobados por país en el RAG.
-- kb_documents.pais: null = conocimiento universal; 'AR','CL',... = solo para ese país.
-- tipo_documento = 'legal_aprobado' + fecha_revision marcan los documentos legales aprobados por revisión jurídica.

alter table public.kb_documents add column if not exists pais text;
alter table public.kb_documents add column if not exists fecha_revision date;

alter table public.kb_documents drop constraint if exists kb_documents_pais_iso2;
alter table public.kb_documents add  constraint kb_documents_pais_iso2 check (pais is null or pais ~ '^[A-Z]{2}$');

-- Un documento legal aprobado siempre lleva país y fecha de revisión.
alter table public.kb_documents drop constraint if exists kb_documents_legal_aprobado_ck;
alter table public.kb_documents add  constraint kb_documents_legal_aprobado_ck
  check (tipo_documento is distinct from 'legal_aprobado' or (pais is not null and fecha_revision is not null));

create index if not exists kb_documents_pais_idx on public.kb_documents (pais) where pais is not null;

comment on column public.kb_documents.pais is 'ISO-2 del país al que aplica el documento; null = conocimiento universal.';
comment on column public.kb_documents.fecha_revision is 'Fecha de la revisión jurídica (documentos legal_aprobado).';

-- Búsqueda vectorial general: solo conocimiento universal (pais is null).
-- Así un documento de un país nunca aparece en respuestas de otro país.
create or replace function public.match_chunks(query_embedding vector, match_count integer default 6, min_similarity double precision default 0.3)
returns table(id bigint, document_id bigint, content text, idioma_contenido text, tema_cluster text, libro_propuesto text, tags text[], respuesta_requiere_traduccion boolean, factor_idioma_retrieval numeric, peso_prioridad_retrieval integer, similarity double precision)
language sql
stable
set search_path to 'public'
as $function$
  SELECT
    c.id,
    c.document_id,
    c.content,
    c.idioma_contenido,
    c.tema_cluster,
    c.libro_propuesto,
    c.tags,
    c.respuesta_requiere_traduccion,
    c.factor_idioma_retrieval,
    c.peso_prioridad_retrieval,
    -- Similitud coseno * factor de idioma * peso de prioridad normalizado
    -- Así los chunks en español y de documentos prioritarios suben en ranking
    (1 - (c.embedding <=> query_embedding))
      * COALESCE(c.factor_idioma_retrieval, 1.0)
      * (COALESCE(c.peso_prioridad_retrieval, 5) / 10.0) AS similarity
  FROM kb_chunks c
  WHERE
    c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> query_embedding)) > min_similarity
    AND NOT EXISTS (SELECT 1 FROM kb_documents d WHERE d.id = c.document_id AND d.pais IS NOT NULL)
  ORDER BY similarity DESC
  LIMIT match_count;
$function$;

-- Documento legal aprobado de UN país (todos sus chunks en orden). Vacío si no hay.
create or replace function public.legal_doc_pais(p_pais text)
returns table(document_id bigint, titulo text, pais text, fecha_revision date, chunk_index integer, content text)
language sql
stable
set search_path to 'public'
as $function$
  select d.id, kb_titulo_doc(d), d.pais, d.fecha_revision, c.chunk_index, c.content
  from kb_documents d
  join kb_chunks c on c.document_id = d.id
  where d.id = (
    select x.id from kb_documents x
    where x.tipo_documento = 'legal_aprobado'
      and x.pais = upper(trim(p_pais))
      and x.incluir_en_kb in ('si', 'sí', 'si_prioridad')
    order by x.fecha_revision desc, x.id desc
    limit 1
  )
  order by c.chunk_index;
$function$;

revoke all on function public.legal_doc_pais(text) from public, anon, authenticated;
grant execute on function public.legal_doc_pais(text) to service_role;

notify pgrst, 'reload schema';
