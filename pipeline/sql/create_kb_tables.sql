-- ============================================================
-- Cannabicultor KB — documentos y chunks para RAG
-- Ejecutar en Supabase SQL Editor (después de create_discovered_sources
-- si aún no existe set_updated_at()).
-- ============================================================

-- Opcional para Fase C (embeddings):
-- create extension if not exists vector;

create table if not exists kb_documents (
  id bigserial primary key,
  catalog_num int not null unique,
  archivo text not null,
  drive_file_id text not null unique,
  link_drive text,

  -- Metadata editorial del catálogo
  idioma_contenido text not null default 'es',
  politica_idioma text,
  factor_idioma_retrieval numeric(4,2) not null default 1.0,
  incluir_en_kb text not null,
  peso_prioridad_retrieval int not null default 2,
  libro_propuesto text,
  tema_cluster text,
  tipo_documento text,
  nivel_evidencia text,
  prioridad_expansion text,
  tags text[] not null default '{}',

  -- Extracción
  estado_ingesta text not null default 'pendiente',
  calidad_extraccion text,              -- buena | baja_densidad | ocr | fallida
  local_pdf_path text,
  local_txt_path text,
  text_char_count int default 0,
  page_count int,
  chunk_count int default 0,
  content_sha256 text,
  error_message text,

  -- Trazabilidad
  catalog_snapshot jsonb not null default '{}'::jsonb,
  ingested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists kb_chunks (
  id bigserial primary key,
  document_id bigint not null references kb_documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  content_sha256 text not null,
  char_count int not null default 0,
  token_estimate int not null default 0,

  -- Metadata de retrieval (denormalizada del documento + posición)
  page_start int,
  page_end int,
  idioma_contenido text not null,
  politica_idioma text,
  factor_idioma_retrieval numeric(4,2) not null default 1.0,
  peso_prioridad_retrieval int not null default 2,
  libro_propuesto text,
  tema_cluster text,
  tags text[] not null default '{}',
  respuesta_requiere_traduccion boolean not null default false,

  -- embedding vector(1536) null,  -- descomentar con pgvector en Fase C
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (document_id, chunk_index)
);

create index if not exists idx_kb_documents_estado on kb_documents (estado_ingesta);
create index if not exists idx_kb_documents_idioma on kb_documents (idioma_contenido);
create index if not exists idx_kb_documents_libro on kb_documents (libro_propuesto);
create index if not exists idx_kb_documents_incluir on kb_documents (incluir_en_kb);

create index if not exists idx_kb_chunks_document on kb_chunks (document_id);
create index if not exists idx_kb_chunks_idioma on kb_chunks (idioma_contenido);
create index if not exists idx_kb_chunks_traduccion on kb_chunks (respuesta_requiere_traduccion);
create index if not exists idx_kb_chunks_tags on kb_chunks using gin (tags);
create index if not exists idx_kb_chunks_content_fts on kb_chunks
  using gin (to_tsvector('spanish', coalesce(content, '')));

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_kb_documents_updated on kb_documents;
create trigger trg_kb_documents_updated
before update on kb_documents
for each row execute function set_updated_at();

drop trigger if exists trg_kb_chunks_updated on kb_chunks;
create trigger trg_kb_chunks_updated
before update on kb_chunks
for each row execute function set_updated_at();

alter table kb_documents enable row level security;
alter table kb_chunks enable row level security;

drop policy if exists "Service role full access on kb_documents" on kb_documents;
create policy "Service role full access on kb_documents"
  on kb_documents for all to service_role
  using (true) with check (true);

drop policy if exists "Service role full access on kb_chunks" on kb_chunks;
create policy "Service role full access on kb_chunks"
  on kb_chunks for all to service_role
  using (true) with check (true);

comment on table kb_documents is 'PDFs del catálogo RAG Cannabicultor (1 fila por documento).';
comment on table kb_chunks is 'Fragmentos de texto para retrieval. Metadata denormalizada para filtrado/boost.';
comment on column kb_chunks.respuesta_requiere_traduccion is 'true si el chunk es EN y debe sintetizarse en español al responder.';

-- Consultas útiles:
-- SELECT estado_ingesta, count(*) FROM kb_documents GROUP BY estado_ingesta;
-- SELECT d.archivo, d.chunk_count, d.idioma_contenido FROM kb_documents d ORDER BY d.catalog_num;
-- SELECT count(*) FROM kb_chunks;