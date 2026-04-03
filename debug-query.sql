-- Debug script to test match_chunks function directly
-- Run this in Supabase SQL Editor to diagnose the issue

-- Step 1: Check if chunks exist with embeddings
SELECT 
  COUNT(*) as total_chunks,
  COUNT(embedding) as chunks_with_embeddings,
  array_length(embedding, 1) as embedding_dimensions
FROM chunks
LIMIT 1;

-- Step 2: Test with a real embedding from the database
DO $$
DECLARE
  test_embedding jsonb;
  result_count int;
BEGIN
  -- Get a real embedding from the database and convert to jsonb
  SELECT to_jsonb(array_agg(val))
  INTO test_embedding
  FROM (
    SELECT unnest(embedding::float[]) as val
    FROM chunks
    LIMIT 1
  ) sub;
  
  RAISE NOTICE 'Test embedding type: %', pg_typeof(test_embedding);
  RAISE NOTICE 'Test embedding sample: %', left(test_embedding::text, 100);
  
  -- Test the function
  SELECT COUNT(*)
  INTO result_count
  FROM match_chunks(test_embedding, 5, NULL);
  
  RAISE NOTICE 'Function returned % results', result_count;
END $$;

-- Step 3: Check what the function expects vs what it's getting
SELECT 
  p.proname,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as returns
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'match_chunks';
