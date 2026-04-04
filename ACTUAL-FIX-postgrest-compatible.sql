-- ACTUAL FIX: PostgREST-compatible function
-- PostgREST sends arrays as JSON strings, not proper JSONB arrays
-- We need to handle the string format: "[0.1,0.2,...]"

DROP FUNCTION IF EXISTS match_chunks(jsonb, int, text);
DROP FUNCTION IF EXISTS match_chunks(vector, int, text);
DROP FUNCTION IF EXISTS match_chunks(text, int, text);

CREATE FUNCTION match_chunks(
  query_embedding text,  -- PostgREST sends as text string
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
BEGIN
  -- Direct cast from text to vector
  -- PostgREST sends: "[0.1,0.2,0.3,...]"
  -- This format is directly castable to vector
  qe := query_embedding::vector(384);
  
  RETURN QUERY
  SELECT
    c.id, 
    c.content, 
    c.doc_type, 
    c.metadata, 
    d.filename,
    (1 - (c.embedding <=> qe))::float as similarity
  FROM chunks c
  JOIN documents d ON d.id = c.document_id
  WHERE (filter_doc_type IS NULL OR c.doc_type = filter_doc_type)
  ORDER BY c.embedding <=> qe
  LIMIT match_count;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Error in match_chunks: % %', SQLERRM, SQLSTATE;
  RAISE NOTICE 'Received embedding: %', left(query_embedding, 200);
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION match_chunks(text, int, text) TO service_role;
GRANT EXECUTE ON FUNCTION match_chunks(text, int, text) TO anon;
GRANT EXECUTE ON FUNCTION match_chunks(text, int, text) TO authenticated;

-- Also fix match_chunks_in_doc
DROP FUNCTION IF EXISTS match_chunks_in_doc(jsonb, uuid, int);
DROP FUNCTION IF EXISTS match_chunks_in_doc(vector, uuid, int);
DROP FUNCTION IF EXISTS match_chunks_in_doc(text, uuid, int);

CREATE FUNCTION match_chunks_in_doc(
  query_embedding text,
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
BEGIN
  qe := query_embedding::vector(384);
  
  RETURN QUERY
  SELECT
    c.id,
    c.content,
    c.doc_type,
    c.metadata,
    c.chunk_index,
    (1 - (c.embedding <=> qe))::float as similarity
  FROM chunks c
  WHERE c.document_id = doc_id
  ORDER BY c.embedding <=> qe
  LIMIT match_count;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Error in match_chunks_in_doc: % %', SQLERRM, SQLSTATE;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION match_chunks_in_doc(text, uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION match_chunks_in_doc(text, uuid, int) TO anon;
GRANT EXECUTE ON FUNCTION match_chunks_in_doc(text, uuid, int) TO authenticated;

-- Force PostgREST to reload
NOTIFY pgrst, 'reload schema';
