-- FINAL FIX: Accept vector(384) directly instead of jsonb
-- PostgREST handles JSON array → vector conversion automatically
-- This eliminates the manual jsonb parsing that was failing

DROP FUNCTION IF EXISTS match_chunks(jsonb, int, text);

CREATE FUNCTION match_chunks(
  query_embedding vector(384),
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION match_chunks(vector, int, text) TO service_role;
GRANT EXECUTE ON FUNCTION match_chunks(vector, int, text) TO anon;
GRANT EXECUTE ON FUNCTION match_chunks(vector, int, text) TO authenticated;

-- Also fix match_chunks_in_doc
DROP FUNCTION IF EXISTS match_chunks_in_doc(jsonb, uuid, int);

CREATE FUNCTION match_chunks_in_doc(
  query_embedding vector(384),
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

GRANT EXECUTE ON FUNCTION match_chunks_in_doc(vector, uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION match_chunks_in_doc(vector, uuid, int) TO anon;
GRANT EXECUTE ON FUNCTION match_chunks_in_doc(vector, uuid, int) TO authenticated;

-- Force PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
