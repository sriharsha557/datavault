-- DEFINITIVE FIX: Match exactly what works in test-postgrest-directly.mjs
-- The test script proves that sending array to vector(384) parameter works
-- This means the database function is correct, but Next.js needs a fresh start

-- Step 1: Drop ALL existing versions
DROP FUNCTION IF EXISTS match_chunks(jsonb, int, text);
DROP FUNCTION IF EXISTS match_chunks(vector, int, text);
DROP FUNCTION IF EXISTS match_chunks(text, int, text);
DROP FUNCTION IF EXISTS match_chunks(vector(384), int, text);

-- Step 2: Create the function that works (proven by test script)
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(384),
  match_count     int DEFAULT 5,
  filter_doc_type text DEFAULT NULL
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
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id, 
    c.content, 
    c.doc_type, 
    c.metadata, 
    d.filename,
    (1 - (c.embedding <=> query_embedding))::float as similarity
  FROM chunks c
  JOIN documents d ON d.id = c.document_id
  WHERE (filter_doc_type IS NULL OR c.doc_type = filter_doc_type)
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Step 3: Grant permissions
GRANT EXECUTE ON FUNCTION match_chunks(vector(384), int, text) TO service_role;
GRANT EXECUTE ON FUNCTION match_chunks(vector(384), int, text) TO anon;
GRANT EXECUTE ON FUNCTION match_chunks(vector(384), int, text) TO authenticated;

-- Step 4: Also fix match_chunks_in_doc
DROP FUNCTION IF EXISTS match_chunks_in_doc(jsonb, uuid, int);
DROP FUNCTION IF EXISTS match_chunks_in_doc(vector, uuid, int);
DROP FUNCTION IF EXISTS match_chunks_in_doc(text, uuid, int);
DROP FUNCTION IF EXISTS match_chunks_in_doc(vector(384), uuid, int);

CREATE OR REPLACE FUNCTION match_chunks_in_doc(
  query_embedding vector(384),
  doc_id          uuid,
  match_count     int DEFAULT 8
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
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.content,
    c.doc_type,
    c.metadata,
    c.chunk_index,
    (1 - (c.embedding <=> query_embedding))::float as similarity
  FROM chunks c
  WHERE c.document_id = doc_id
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION match_chunks_in_doc(vector(384), uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION match_chunks_in_doc(vector(384), uuid, int) TO anon;
GRANT EXECUTE ON FUNCTION match_chunks_in_doc(vector(384), uuid, int) TO authenticated;

-- Step 5: Force PostgREST schema reload
NOTIFY pgrst, 'reload schema';

-- Step 6: Verify the function exists
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname IN ('match_chunks', 'match_chunks_in_doc')
ORDER BY p.proname, p.oid;
