-- Migration: Add hybrid search and query logging
-- Run this after the initial schema.sql

-- 1. Add full-text search column to chunks table
alter table chunks add column if not exists content_tsvector tsvector;

-- 2. Create GIN index for fast keyword search
create index if not exists chunks_content_tsvector_idx on chunks using gin(content_tsvector);

-- 3. Create trigger to automatically update tsvector column
create or replace function chunks_content_tsvector_update() returns trigger as $
begin
  new.content_tsvector := to_tsvector('english', coalesce(new.content, ''));
  return new;
end;
$ language plpgsql;

-- Drop existing trigger if it exists to allow re-running migrations
drop trigger if exists chunks_content_tsvector_trigger on chunks;

create trigger chunks_content_tsvector_trigger
  before insert or update on chunks
  for each row
  execute function chunks_content_tsvector_update();

-- 4. Backfill existing chunks with tsvector data
update chunks set content_tsvector = to_tsvector('english', content) where content_tsvector is null;

-- 5. Create query_logs table for analytics
create table if not exists query_logs (
  id                  uuid primary key default gen_random_uuid(),
  query_text          text not null,
  retrieved_chunk_ids uuid[] default '{}',
  response_time_ms    int,
  doc_type_filter     text,
  chunks_returned     int default 0,
  created_at          timestamptz default now()
);

-- 6. Index for query analytics
create index if not exists query_logs_created_at_idx on query_logs (created_at desc);
create index if not exists query_logs_doc_type_filter_idx on query_logs (doc_type_filter);

-- 7. RLS for query_logs
alter table query_logs enable row level security;
create policy "service_role_all" on query_logs for all using (true);

-- 8. Hybrid search function (combines vector + keyword search) -- 384-dim
create or replace function hybrid_search_chunks(
  query_embedding vector(384),
  query_text      text,
  match_count     int default 12,
  filter_doc_type text default null
)
returns table (
  id           uuid,
  content      text,
  doc_type     text,
  metadata     jsonb,
  filename     text,
  similarity   float,
  keyword_rank float
)
language plpgsql
as $
begin
  return query
  with vector_results as (
    select
      c.id, c.content, c.doc_type, c.metadata, d.filename,
      1 - (c.embedding <=> query_embedding) as similarity,
      0.0 as keyword_rank
    from chunks c
    join documents d on d.id = c.document_id
    where (filter_doc_type is null or c.doc_type = filter_doc_type)
    order by c.embedding <=> query_embedding
    limit match_count
  ),
  keyword_results as (
    select
      c.id, c.content, c.doc_type, c.metadata, d.filename,
      0.0 as similarity,
      ts_rank(c.content_tsvector, plainto_tsquery('english', query_text)) as keyword_rank
    from chunks c
    join documents d on d.id = c.document_id
    where
      (filter_doc_type is null or c.doc_type = filter_doc_type)
      and c.content_tsvector @@ plainto_tsquery('english', query_text)
    order by keyword_rank desc
    limit match_count / 2
  ),
  combined as (
    select * from vector_results
    union
    select * from keyword_results
  )
  select
    c.id, c.content, c.doc_type, c.metadata, c.filename,
    max(c.similarity) as similarity,
    max(c.keyword_rank) as keyword_rank
  from combined c
  group by c.id, c.content, c.doc_type, c.metadata, c.filename
  order by (max(c.similarity) * 0.7 + max(c.keyword_rank) * 0.3) desc
  limit match_count;
end;
$;

-- 9. Update IVFFlat index configuration for better performance
drop index if exists chunks_embedding_idx;
create index chunks_embedding_idx on chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- 10. Add index for document status filtering
create index if not exists documents_status_idx on documents (status);

-- Vacuum analyze to update statistics
vacuum analyze chunks;
vacuum analyze documents;
vacuum analyze query_logs;

-- Migration: Add content and updated_at columns to documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at);

-- -------------------------------------------------------------------------
-- NOTE: A previous migration attempted to switch to 768-dim embeddings.
-- That migration was REVERTED. The app uses all-MiniLM-L6-v2 (384-dim).
-- The embedding column stays vector(384). Do NOT alter it to 768.
-- -------------------------------------------------------------------------

-- Migration: match_chunks accepts float[] (native Postgres array) from JS number[] array.
-- supabase.rpc() serializes JS arrays as JSON, PostgREST converts to float[].
-- Safe to re-run.
create or replace function match_chunks(
  query_embedding float[],
  match_count     int default 5,
  filter_doc_type text default null
)
returns table (
  id          uuid,
  content     text,
  doc_type    text,
  metadata    jsonb,
  filename    text,
  similarity  float
)
language plpgsql
as $$
declare
  qe vector(384);
begin
  qe := query_embedding::vector(384);
  return query
  select
    c.id, c.content, c.doc_type, c.metadata, d.filename,
    1 - (c.embedding <=> qe) as similarity
  from chunks c
  join documents d on d.id = c.document_id
  where (filter_doc_type is null or c.doc_type = filter_doc_type)
  order by c.embedding <=> qe
  limit match_count;
end;
$$;

-- Migration: Scoped vector search for document viewer -- accepts float[] from JS array.
create or replace function match_chunks_in_doc(
  query_embedding float[],
  doc_id          uuid,
  match_count     int default 8
)
returns table (
  id          uuid,
  content     text,
  doc_type    text,
  metadata    jsonb,
  chunk_index int,
  similarity  float
)
language plpgsql
as $$
declare
  qe vector(384);
begin
  qe := query_embedding::vector(384);
  return query
  select
    c.id, c.content, c.doc_type, c.metadata, c.chunk_index,
    1 - (c.embedding <=> qe) as similarity
  from chunks c
  where c.document_id = doc_id
  order by c.embedding <=> qe
  limit match_count;
end;
$$;
-- Migration: match_chunks accepts text embedding in vector format '[0.1,0.2,...]'
-- JS sends: `[${embedding.join(',')}]` as string
-- Postgres casts: text::vector(384) with explicit NULL guard
-- Safe to re-run.
create or replace function match_chunks(
  query_embedding text,
  match_count     int default 5,
  filter_doc_type text default null
)
returns table (
  id          uuid,
  content     text,
  doc_type    text,
  metadata    jsonb,
  filename    text,
  similarity  float
)
language plpgsql
as $$
declare
  qe vector(384);
begin
  qe := query_embedding::vector(384);
  
  if qe is null then
    raise exception 'Invalid embedding format: cast returned NULL';
  end if;
  
  return query
  select
    c.id, c.content, c.doc_type, c.metadata, d.filename,
    1 - (c.embedding <=> qe) as similarity
  from chunks c
  join documents d on d.id = c.document_id
  where (filter_doc_type is null or c.doc_type = filter_doc_type)
  order by c.embedding <=> qe
  limit match_count;
exception when others then
  raise notice 'ERROR in match_chunks: % %', SQLERRM, SQLSTATE;
  return;
end;
$$;

-- Migration: Scoped vector search for document viewer -- accepts text in vector format.
create or replace function match_chunks_in_doc(
  query_embedding text,
  doc_id          uuid,
  match_count     int default 8
)
returns table (
  id          uuid,
  content     text,
  doc_type    text,
  metadata    jsonb,
  chunk_index int,
  similarity  float
)
language plpgsql
as $$
declare
  qe vector(384);
begin
  qe := query_embedding::vector(384);
  
  if qe is null then
    raise exception 'Invalid embedding format: cast returned NULL';
  end if;
  
  return query
  select
    c.id, c.content, c.doc_type, c.metadata, c.chunk_index,
    1 - (c.embedding <=> qe) as similarity
  from chunks c
  where c.document_id = doc_id
  order by c.embedding <=> qe
  limit match_count;
exception when others then
  raise notice 'ERROR in match_chunks_in_doc: % %', SQLERRM, SQLSTATE;
  return;
end;
$$;
