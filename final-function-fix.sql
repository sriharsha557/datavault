-- FINAL FIX: Drop ALL overloaded versions and create single clean jsonb version
-- This resolves the intermittent 0 results issue caused by function overload caching

-- Step 1: Drop ALL existing versions of match_chunks (all parameter types)
DROP FUNCTION IF EXISTS match_chunks(float[], int, text);
DROP FUNCTION IF EXISTS match_chunks(text, int, text);
DROP FUNCTION IF EXISTS match_chunks(jsonb, int, text);
DROP FUNCTION IF EXISTS match_chunks(vector, int, text);

-- Step 2: Drop ALL existing versions of match_chunks_in_doc
DROP FUNCTION IF EXISTS match_chunks_in_doc(float[], uuid, int);
DROP FUNCTION IF EXISTS match_chunks_in_doc(text, uuid, int);
DROP FUNCTION IF EXISTS match_chunks_in_doc(jsonb, uuid, int);
DROP FUNCTION IF EXISTS match_chunks_in_doc(vector, uuid, int);

-- Step 3: Create ONLY the jsonb version (what PostgREST sends from JS arrays)
CREATE FUNCTION match_chunks(
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
  arr_length int;
BEGIN
  -- Convert jsonb array to float[]
  SELECT array_agg(value::float)
  INTO arr
  FROM jsonb_array_elements_text(query_embedding);
  
  -- Validate array length
  arr_length := array_length(arr, 1);
  
  IF arr_length IS NULL THEN
    RAISE EXCEPTION 'Failed to convert jsonb to array - array is NULL';
  END IF;
  
  IF arr_length != 384 THEN
    RAISE EXCEPTION 'Invalid embedding dimensions: expected 384, got %', arr_length;
  END IF;
  
  -- Convert to vector
  qe := arr::vector(384);
  
  -- Execute query
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

-- Step 4: Create ONLY the jsonb version for document-scoped search
CREATE FUNCTION match_chunks_in_doc(
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
  arr_length int;
BEGIN
  -- Convert jsonb array to float[]
  SELECT array_agg(value::float)
  INTO arr
  FROM jsonb_array_elements_text(query_embedding);
  
  -- Validate array length
  arr_length := array_length(arr, 1);
  
  IF arr_length IS NULL THEN
    RAISE EXCEPTION 'Failed to convert jsonb to array - array is NULL';
  END IF;
  
  IF arr_length != 384 THEN
    RAISE EXCEPTION 'Invalid embedding dimensions: expected 384, got %', arr_length;
  END IF;
  
  -- Convert to vector
  qe := arr::vector(384);
  
  -- Execute query
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

-- Step 5: Grant permissions
GRANT EXECUTE ON FUNCTION match_chunks(jsonb, int, text) TO service_role;
GRANT EXECUTE ON FUNCTION match_chunks(jsonb, int, text) TO anon;
GRANT EXECUTE ON FUNCTION match_chunks(jsonb, int, text) TO authenticated;

GRANT EXECUTE ON FUNCTION match_chunks_in_doc(jsonb, uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION match_chunks_in_doc(jsonb, uuid, int) TO anon;
GRANT EXECUTE ON FUNCTION match_chunks_in_doc(jsonb, uuid, int) TO authenticated;

-- Step 6: Force PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- Step 7: Verify - this should show ONLY 2 functions (one for each name)
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname IN ('match_chunks', 'match_chunks_in_doc')
ORDER BY p.proname, p.oid;
