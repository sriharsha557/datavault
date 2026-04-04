-- Check ALL current versions of match_chunks and match_chunks_in_doc
-- This will show you exactly how many overloaded versions exist

SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_identity_arguments(p.oid) as identity_args,
  p.oid as function_oid
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname IN ('match_chunks', 'match_chunks_in_doc')
ORDER BY p.proname, p.oid;
