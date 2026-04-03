-- Enhanced match_chunks with detailed logging
-- This will help us see exactly what the function is receiving

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
  arr_length int;
BEGIN
  -- Log what we received
  RAISE NOTICE 'Received query_embedding type: %', pg_typeof(query_embedding);
  RAISE NOTICE 'Received query_embedding value (first 100 chars): %', left(query_embedding::text, 100);
  
  -- Convert jsonb array to float[]
  SELECT array_agg(value::float)
  INTO arr
  FROM jsonb_array_elements_text(query_embedding);
  
  -- Check array length
  arr_length := array_length(arr, 1);
  RAISE NOTICE 'Converted to array with length: %', arr_length;
  
  -- Validate array length
  IF arr_length IS NULL THEN
    RAISE EXCEPTION 'Failed to convert jsonb to array - array is NULL';
  END IF;
  
  IF arr_length != 384 THEN
    RAISE EXCEPTION 'Invalid embedding dimensions: expected 384, got %', arr_length;
  END IF;
  
  qe := arr::vector(384);
  RAISE NOTICE 'Successfully converted to vector(384)';
  
  RETURN QUERY
  SELECT
    c.id, c.content, c.doc_type, c.metadata, d.filename,
    (1 - (c.embedding <=> qe))::float as similarity
  FROM chunks c
  JOIN documents d ON d.id = c.document_id
  WHERE (filter_doc_type IS NULL OR c.doc_type = filter_doc_type)
  ORDER BY c.embedding <=> qe
  LIMIT match_count;
  
  RAISE NOTICE 'Query completed, returned % rows', (SELECT COUNT(*) FROM chunks LIMIT match_count);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION match_chunks(jsonb, int, text) TO service_role;
GRANT EXECUTE ON FUNCTION match_chunks(jsonb, int, text) TO anon;
GRANT EXECUTE ON FUNCTION match_chunks(jsonb, int, text) TO authenticated;

-- Reload schema
NOTIFY pgrst, 'reload schema';
