# 🚨 CRITICAL FIX - Run This Before Demo

## Issue
Database functions have multiple overloads causing intermittent failures (queries return 0 results).

## Fix (5 minutes)

### Step 1: Open Supabase SQL Editor
1. Go to https://app.supabase.com
2. Select your project: `mbwwjgtdpprbewrytvew`
3. Click "SQL Editor" in left sidebar
4. Click "New query"

### Step 2: Run This SQL (Copy & Paste)

```sql
-- ============================================================================
-- CRITICAL FIX: Clean up function overloads and create jsonb versions
-- This fixes the "0 results" issue
-- ============================================================================

-- Step 1: Drop ALL existing overloads
DROP FUNCTION IF EXISTS match_chunks(vector(384), int, text);
DROP FUNCTION IF EXISTS match_chunks(float[], int, text);
DROP FUNCTION IF EXISTS match_chunks(text, int, text);
DROP FUNCTION IF EXISTS match_chunks(jsonb, int, text);

DROP FUNCTION IF EXISTS match_chunks_in_doc(vector(384), uuid, int);
DROP FUNCTION IF EXISTS match_chunks_in_doc(float[], uuid, int);
DROP FUNCTION IF EXISTS match_chunks_in_doc(text, uuid, int);
DROP FUNCTION IF EXISTS match_chunks_in_doc(jsonb, uuid, int);

-- Step 2: Create clean jsonb-based functions
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding jsonb,
  match_count     int default 5,
  filter_doc_type text default null
)
RETURNS TABLE (
  id          uuid,
  content     text,
  doc_type    text,
  metadata    jsonb,
  filename    text,
  similarity  float
)
LANGUAGE plpgsql
AS $$
DECLARE
  qe vector(384);
  arr float[];
BEGIN
  -- Convert jsonb array to float[] then to vector(384)
  SELECT array_agg(value::float)
  INTO arr
  FROM jsonb_array_elements_text(query_embedding);
  
  -- Validate array length
  IF array_length(arr, 1) != 384 THEN
    RAISE EXCEPTION 'Invalid embedding dimensions: expected 384, got %', array_length(arr, 1);
  END IF;
  
  qe := arr::vector(384);
  
  RETURN QUERY
  SELECT
    c.id, c.content, c.doc_type, c.metadata, d.filename,
    (1 - (c.embedding <=> qe))::float as similarity
  FROM chunks c
  JOIN documents d ON d.id = c.document_id
  WHERE (filter_doc_type IS NULL OR c.doc_type = filter_doc_type)
  ORDER BY c.embedding <=> qe
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION match_chunks_in_doc(
  query_embedding jsonb,
  doc_id          uuid,
  match_count     int default 8
)
RETURNS TABLE (
  id          uuid,
  content     text,
  doc_type    text,
  metadata    jsonb,
  chunk_index int,
  similarity  float
)
LANGUAGE plpgsql
AS $$
DECLARE
  qe vector(384);
  arr float[];
BEGIN
  -- Convert jsonb array to float[] then to vector(384)
  SELECT array_agg(value::float)
  INTO arr
  FROM jsonb_array_elements_text(query_embedding);
  
  -- Validate array length
  IF array_length(arr, 1) != 384 THEN
    RAISE EXCEPTION 'Invalid embedding dimensions: expected 384, got %', array_length(arr, 1);
  END IF;
  
  qe := arr::vector(384);
  
  RETURN QUERY
  SELECT
    c.id, c.content, c.doc_type, c.metadata, c.chunk_index,
    (1 - (c.embedding <=> qe))::float as similarity
  FROM chunks c
  WHERE c.document_id = doc_id
  ORDER BY c.embedding <=> qe
  LIMIT match_count;
END;
$$;

-- Step 3: Grant permissions
GRANT EXECUTE ON FUNCTION match_chunks(jsonb, int, text) TO service_role;
GRANT EXECUTE ON FUNCTION match_chunks(jsonb, int, text) TO anon;
GRANT EXECUTE ON FUNCTION match_chunks(jsonb, int, text) TO authenticated;

GRANT EXECUTE ON FUNCTION match_chunks_in_doc(jsonb, uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION match_chunks_in_doc(jsonb, uuid, int) TO anon;
GRANT EXECUTE ON FUNCTION match_chunks_in_doc(jsonb, uuid, int) TO authenticated;

-- Step 4: Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Step 5: Verify functions exist
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname IN ('match_chunks', 'match_chunks_in_doc')
ORDER BY p.proname;
```

### Step 3: Verify Success
You should see output showing:
- `match_chunks(query_embedding jsonb, match_count integer DEFAULT 5, filter_doc_type text DEFAULT NULL::text)`
- `match_chunks_in_doc(query_embedding jsonb, doc_id uuid, match_count integer DEFAULT 8)`

### Step 4: Restart Your Application
```bash
# Stop the dev server (Ctrl+C)
# Then restart:
npm run dev
```

### Step 5: Test
1. Open http://localhost:3000
2. Ask: "What are Hubs in Data Vault?"
3. You should get results with sources

## Verification

Run the pre-demo test script:
```bash
node scripts/pre-demo-test.mjs
```

All tests should pass.

## If Still Having Issues

1. Check Supabase Logs:
   - Go to Supabase Dashboard → Logs → Postgres Logs
   - Look for errors related to match_chunks

2. Check browser console for errors

3. Check server logs for embedding dimension errors

## Success Indicators

✅ Queries return 8 chunks consistently  
✅ Similarity scores are 0.7-0.8 for good matches  
✅ No "0 results" errors  
✅ Document viewer works  

---

**Time Required**: 5 minutes  
**Risk Level**: Low (safe to run, creates clean functions)  
**When to Run**: Before Monday demo, after any database changes
