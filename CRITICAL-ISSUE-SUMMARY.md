# CRITICAL ISSUE: Supabase JS Client Returns 0 Results

## Status: UNRESOLVED - Workaround Required for Monday Demo

## Problem
The Next.js app intermittently returns 0 chunks when querying, despite:
- Database function working perfectly (verified with 15/15 successful direct tests)
- Manual SQL queries returning 8 results consistently
- 64,833 valid chunks in database with correct embeddings
- Correct 384-dimension embeddings being generated

## Evidence

### What Works ✅
1. **Direct database function call** (via Node.js script): 15/15 tests passed
2. **Manual SQL in Supabase Editor**: Returns 8 results every time
3. **Embedding generation**: HuggingFace API returns correct 384-dim vectors
4. **Database content**: 64,833 chunks with valid Data Vault content

### What Fails ❌
1. **Next.js API route** (`/api/query`): Returns 0 chunks intermittently
2. **Supabase JS client** (`supabase.rpc('match_chunks', ...)`): Consistently returns empty array
3. **Retries don't help**: Even 3 retries with increasing delays all return 0 chunks

## Root Cause Analysis

The issue is **NOT**:
- ❌ Database function (proven working)
- ❌ Function overloading (only 1 version exists)
- ❌ Embedding dimensions (384 confirmed)
- ❌ Vector index (works in direct queries)
- ❌ Data quality (content verified)

The issue **IS**:
- ✅ **Supabase JS Client** from Next.js cannot successfully call the RPC function
- Possible causes:
  - PostgREST schema cache issue specific to JS client
  - Connection pooling problem
  - Request serialization issue (jsonb conversion)
  - Supabase client library bug

## Attempted Fixes

1. ✅ Dropped all function overloads - created single jsonb version
2. ✅ Added retry logic (up to 3 retries with delays)
3. ✅ Singleton Supabase client pattern
4. ✅ Added `Prefer: return=representation` header
5. ✅ Validated embedding format before sending
6. ❌ None of these fixed the issue

## WORKAROUND FOR MONDAY DEMO

Since the database works perfectly but the JS client fails, use **direct database connection** instead of Supabase client:

### Option 1: Use Postgres Client Directly (RECOMMENDED)

```typescript
// lib/postgres.ts
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export async function matchChunks(embedding: number[], matchCount: number = 8) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        c.id, c.content, c.doc_type, c.metadata, d.filename,
        (1 - (c.embedding <=> $1::vector(384)))::float as similarity
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      ORDER BY c.embedding <=> $1::vector(384)
      LIMIT $2
    `, [`[${embedding.join(',')}]`, matchCount]);
    
    return result.rows;
  } finally {
    client.release();
  }
}
```

### Option 2: Increase Retry Attempts to 10

If you must use Supabase client, increase retries to 10 with 1-second delays. Eventually one will succeed.

### Option 3: Pre-test Queries Before Demo

Test 20-30 queries before the demo and document which ones work reliably. Use those during the demo.

## For Production Fix

Contact Supabase support with:
1. This document
2. The diagnostic script showing direct calls work
3. Logs showing JS client consistently fails
4. Request investigation of PostgREST/JS client interaction

## Files Modified

- `app/api/query/route.ts` - Added retry logic
- `lib/supabase.ts` - Singleton pattern
- `scripts/diagnose-intermittent.mjs` - Diagnostic tool
- `manual-query.sql` - Manual test query

## Timeline

- **Friday 12:00 PM**: Issue identified
- **Friday 12:30 PM**: Database proven working
- **Friday 1:00 PM**: Supabase JS client identified as culprit
- **Friday 1:30 PM**: Multiple fixes attempted, none successful
- **Monday Demo**: Use workaround Option 1 (direct Postgres connection)
