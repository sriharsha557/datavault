#!/usr/bin/env node
import { config } from 'dotenv';
config({ path: '.env.local' });

const HF_API_URL = 'https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction';

// Get embedding for "What are Hubs in Data Vault?"
async function getHFEmbedding(text) {
  const res = await fetch(HF_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.HF_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
  });
  
  if (!res.ok) {
    throw new Error(`HF API error: ${res.status}`);
  }
  
  const data = await res.json();
  return Array.isArray(data[0]) ? data[0] : data;
}

console.log('🔍 Getting embedding for: "What are Hubs in Data Vault?"\n');

const embedding = await getHFEmbedding('What are Hubs in Data Vault?');

console.log('✅ Got embedding:', embedding.length, 'dimensions');
console.log('First 5 values:', embedding.slice(0, 5));
console.log('\n' + '='.repeat(80) + '\n');

// Generate the SQL query
const embeddingJson = JSON.stringify(embedding);

console.log('📋 EXACT SQL QUERY TO RUN IN SUPABASE:\n');
console.log('-- Copy and paste this entire query into Supabase SQL Editor\n');

const sqlQuery = `
-- Test query for "What are Hubs in Data Vault?"
SELECT 
  c.id,
  c.content,
  c.doc_type,
  c.metadata,
  d.filename,
  (1 - (c.embedding <=> (
    SELECT array_agg(value::float)::vector(384)
    FROM jsonb_array_elements_text('${embeddingJson}'::jsonb)
  ))) as similarity
FROM chunks c
JOIN documents d ON d.id = c.document_id
WHERE TRUE  -- no doc_type filter
ORDER BY c.embedding <=> (
  SELECT array_agg(value::float)::vector(384)
  FROM jsonb_array_elements_text('${embeddingJson}'::jsonb)
)
LIMIT 8;
`;

console.log(sqlQuery);
console.log('\n' + '='.repeat(80) + '\n');

// Also show the function call version
console.log('📋 OR USE THE FUNCTION (simpler):\n');

const functionCall = `
-- Using match_chunks function
SELECT * FROM match_chunks(
  '${embeddingJson}'::jsonb,
  8,
  NULL
);
`;

console.log(functionCall);
console.log('\n' + '='.repeat(80));
console.log('✅ Copy either query above and run it in Supabase SQL Editor');
