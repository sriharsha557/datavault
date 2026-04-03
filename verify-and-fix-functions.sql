-- Verify and fix match_chunks functions
-- This script will:
-- 1. Show current function definitions
-- 2. Drop ALL overloads
-- 3. Create clean jsonb-based functions
-- 4. Grant permissions
-- 5. Reload schema cache

-- Step 1: Check current function definitions
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname IN ('match_chunks', 'match_chunks_in_doc')
ORDER BY p.proname, p.oid;

-- Step 2: Drop ALL existing overloads (this ensures no conflicts)
DROP FUNCTION IF EXISTS match_chunks(vector(384), int, text);
DROP FUNCTION IF EXISTS match_chunks(float[], int, text);
DROP FUNCTION IF EXISTS match_chunks(text, int, text);
DROP FUNCTION IF EXISTS match_chunks(jsonb, int, text);

DROP FUNCTION IF EXISTS match_chunks_in_doc(vector(384), uuid, int);
DROP FUNCTION IF EXISTS match_chunks_in_doc(float[], uuid, int);
DROP FUNCTION IF EXISTS match_chunks_in_doc(text, uuid, int);
DROP FUNCTION IF EXISTS match_chunks_in_doc(jsonb, uuid, int);

-- Step 3: Create clean jsonb-based functions
-- These accept jsonb from PostgREST, convert to float[], then to vector(384)

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

-- Step 4: Grant permissions to all roles
GRANT EXECUTE ON FUNCTION match_chunks(jsonb, int, text) TO service_role;
GRANT EXECUTE ON FUNCTION match_chunks(jsonb, int, text) TO anon;
GRANT EXECUTE ON FUNCTION match_chunks(jsonb, int, text) TO authenticated;

GRANT EXECUTE ON FUNCTION match_chunks_in_doc(jsonb, uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION match_chunks_in_doc(jsonb, uuid, int) TO anon;
GRANT EXECUTE ON FUNCTION match_chunks_in_doc(jsonb, uuid, int) TO authenticated;

-- Step 5: Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Step 6: Verify new functions exist
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname IN ('match_chunks', 'match_chunks_in_doc')
ORDER BY p.proname;

-- Step 7: Test the function with a sample embedding
DO $$
DECLARE
  test_embedding jsonb;
  result_count int;
BEGIN
  -- Create a test embedding (384 dimensions of zeros)
  test_embedding := (SELECT jsonb_agg(0.0) FROM generate_series(1, 384));
  
  -- Test match_chunks
  SELECT COUNT(*) INTO result_count
  FROM match_chunks(test_embedding, 5, NULL);
  
  RAISE NOTICE 'Test match_chunks: returned % rows', result_count;
END $$;
