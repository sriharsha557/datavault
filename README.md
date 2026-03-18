# Quick Query — Production RAG on Vercel + Supabase

Data Vault 2.0 knowledge base with persistent vector search, streaming LLM responses, and document-type-aware retrieval.

## Architecture

```
Browser (Next.js 14)
  ├── /api/ingest      → extract text → chunk → embed → Supabase (pgvector)
  ├── /api/query       → embed query → pgvector search → Groq LLaMA 3.1 (streamed SSE)
  └── /api/documents   → list / delete documents
```

## Stack

| Layer | Service | Free tier |
|---|---|---|
| Frontend + API | Vercel (Next.js 14) | 100GB bandwidth/mo |
| Vector DB | Supabase (pgvector) | 500MB storage |
| LLM | Groq (LLaMA 3.1 8B) | 30 req/min |
| Embeddings | HuggingFace Inference API | Rate-limited |

## Setup

### 1. Supabase

1. Create a project at https://app.supabase.com
2. Open the SQL editor and run `supabase/schema.sql`
3. Copy your project URL and service role key

### 2. Environment variables

```bash
cp .env.local.example .env.local
# Fill in all four values
```

### 3. Local development

```bash
npm install
npm run dev
# Open http://localhost:3000
```

### 4. Deploy to Vercel

```bash
npm i -g vercel
vercel                    # follow prompts, connect to GitHub repo
vercel env add GROQ_API_KEY
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_KEY
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add HF_TOKEN
vercel --prod
```

## Document ingestion

Documents are uploaded once via the sidebar. Supported formats: PDF, DOCX, TXT, MD.

**Doc type auto-detection from filename:**
- `*hub*` → Hub
- `*link*` → Link  
- `*sat*` / `*satellite*` → Satellite
- `*pit*` / `*bridge*` → PIT/Bridge
- `*method*` / `*guide*` → Methodology
- everything else → General

You can override the detected type before uploading.

## Chunking strategy

- Chunk size: 800 characters (smaller = more precise retrieval)
- Overlap: 120 characters (~15%)
- Separators respect markdown headers (`## `, `### `) before falling back to paragraph/sentence breaks
- Chunks under 40 characters are discarded

## Performance tuning

For large document sets (>500 docs), increase the IVFFlat `lists` parameter in `schema.sql`:

```sql
-- lists = sqrt(num_vectors) is a good rule of thumb
drop index if exists chunks_embedding_idx;
create index on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 200);
```

## Vercel free tier limits

- **Execution timeout**: 60s per function (configured in API routes)
- **Payload size**: 4.5MB body limit — PDF files over this size need chunked upload
- **Bandwidth**: 100GB/month (very generous for a RAG app)
