-- Enable pgvector extension
create extension if not exists vector;

-- Documents table: tracks uploaded files
create table documents (
  id          uuid primary key default gen_random_uuid(),
  filename    text not null,
  doc_type    text,                       -- 'hub', 'link', 'satellite', 'methodology', 'general'
  file_size   int,
  chunk_count int default 0,
  status      text default 'processing', -- 'processing' | 'ready' | 'error'
  created_at  timestamptz default now()
);

-- Chunks table: stores text chunks + embeddings
create table chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  content     text not null,
  embedding   vector(384),               -- all-MiniLM-L6-v2 dimension
  chunk_index int not null,
  doc_type    text,
  metadata    jsonb default '{}',
  created_at  timestamptz default now()
);

-- IVFFlat index for fast approximate nearest-neighbor search
-- Lists=100 is good for up to ~1M chunks; tune if needed
create index on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Index for fast document-type filtering
create index on chunks (doc_type);
create index on chunks (document_id);

-- Similarity search function (called from API)
create or replace function match_chunks(
  query_embedding vector(384),
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
begin
  return query
  select
    c.id,
    c.content,
    c.doc_type,
    c.metadata,
    d.filename,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  join documents d on d.id = c.document_id
  where (filter_doc_type is null or c.doc_type = filter_doc_type)
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Feedback table: stores user ratings for responses
create table feedback (
  id          uuid primary key default gen_random_uuid(),
  message_id  text not null,
  query       text not null,
  response    text not null,
  helpful     boolean not null,
  created_at  timestamptz default now()
);

-- Index for analytics queries
create index on feedback (created_at);
create index on feedback (helpful);

-- RLS: disable for server-side API usage (enable + add policies if adding user auth later)
alter table documents enable row level security;
alter table chunks enable row level security;
alter table feedback enable row level security;

-- Allow service role full access (used by API routes with SUPABASE_SERVICE_KEY)
create policy "service_role_all" on documents for all using (true);
create policy "service_role_all" on chunks for all using (true);
create policy "service_role_all" on feedback for all using (true);
