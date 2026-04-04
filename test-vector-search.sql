-- Test if vector search is working at all

-- Step 1: Check total chunks
SELECT COUNT(*) as total_chunks FROM chunks;

-- Step 2: Check if embeddings exist and are valid
SELECT 
  COUNT(*) as chunks_with_embeddings,
  COUNT(CASE WHEN embedding IS NULL THEN 1 END) as null_embeddings,
  MIN(array_length(embedding::float[], 1)) as min_dims,
  MAX(array_length(embedding::float[], 1)) as max_dims
FROM chunks;

-- Step 3: Test a simple vector search with a dummy embedding
-- This should return SOMETHING if the index is working
WITH test_embedding AS (
  SELECT array_agg(0.1::float)::vector(384) as emb
  FROM generate_series(1, 384)
)
SELECT 
  COUNT(*) as results_found,
  MIN(1 - (c.embedding <=> te.emb)) as min_similarity,
  MAX(1 - (c.embedding <=> te.emb)) as max_similarity,
  AVG(1 - (c.embedding <=> te.emb)) as avg_similarity
FROM chunks c, test_embedding te
LIMIT 1000;

-- Step 4: Test the actual match_chunks function with a dummy embedding
SELECT COUNT(*) as function_result_count
FROM match_chunks(
  jsonb_build_array(0.1, 0.1, 0.1, 0.1, 0.1),  -- Just 5 values for quick test
  8,
  NULL
);
