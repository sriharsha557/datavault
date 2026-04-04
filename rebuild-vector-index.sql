-- Rebuild vector index to fix intermittent 0 results
-- The IVFFlat index might be corrupted or have stale statistics

-- Step 1: Drop the existing index
DROP INDEX IF EXISTS chunks_embedding_idx;

-- Step 2: Analyze the table to update statistics
ANALYZE chunks;

-- Step 3: Recreate the index with optimal settings
-- For 64,000 chunks, lists=100 is appropriate (sqrt of row count)
CREATE INDEX chunks_embedding_idx ON chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Step 4: Vacuum analyze to ensure statistics are fresh
VACUUM ANALYZE chunks;

-- Step 5: Verify index exists
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'chunks' 
  AND indexname = 'chunks_embedding_idx';

-- Step 6: Check index size and health
SELECT 
  pg_size_pretty(pg_relation_size('chunks_embedding_idx')) as index_size,
  pg_size_pretty(pg_relation_size('chunks')) as table_size;
