#!/usr/bin/env node
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Test embedding - same one each time for consistency
const testEmbedding = Array(384).fill(0).map((_, i) => Math.sin(i * 0.1));

console.log('🔍 Testing match_chunks function directly...\n');
console.log('Test embedding length:', testEmbedding.length);
console.log('First 3 values:', testEmbedding.slice(0, 3));
console.log('\n' + '='.repeat(80) + '\n');

// Run the same query 10 times
for (let i = 1; i <= 10; i++) {
  const startTime = Date.now();
  
  const { data, error } = await supabase.rpc('match_chunks', {
    query_embedding: testEmbedding,
    match_count: 8,
    filter_doc_type: null,
  });
  
  const duration = Date.now() - startTime;
  
  if (error) {
    console.log(`❌ Test ${i}: ERROR - ${error.message}`);
    console.log('   Error details:', JSON.stringify(error, null, 2));
  } else {
    const chunkCount = data?.length ?? 0;
    const sims = data?.slice(0, 3).map(c => c.similarity?.toFixed(3)) ?? [];
    
    if (chunkCount === 0) {
      console.log(`❌ Test ${i}: 0 chunks (${duration}ms) - FAILURE`);
    } else {
      console.log(`✅ Test ${i}: ${chunkCount} chunks (${duration}ms) - sims: [${sims.join(', ')}]`);
    }
  }
  
  // Small delay between requests
  await new Promise(r => setTimeout(r, 100));
}

console.log('\n' + '='.repeat(80) + '\n');

// Now test with a real query embedding from HuggingFace
console.log('🧠 Testing with real HuggingFace embedding...\n');

const HF_API_URL = 'https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction';

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

const realEmbedding = await getHFEmbedding('What are Satellites in Data Vault?');
console.log('Real embedding length:', realEmbedding.length);
console.log('First 3 values:', realEmbedding.slice(0, 3));
console.log('\n');

// Test with real embedding 5 times
for (let i = 1; i <= 5; i++) {
  const startTime = Date.now();
  
  const { data, error } = await supabase.rpc('match_chunks', {
    query_embedding: realEmbedding,
    match_count: 8,
    filter_doc_type: null,
  });
  
  const duration = Date.now() - startTime;
  
  if (error) {
    console.log(`❌ Real Test ${i}: ERROR - ${error.message}`);
  } else {
    const chunkCount = data?.length ?? 0;
    const sims = data?.slice(0, 3).map(c => c.similarity?.toFixed(3)) ?? [];
    
    if (chunkCount === 0) {
      console.log(`❌ Real Test ${i}: 0 chunks (${duration}ms) - FAILURE`);
    } else {
      console.log(`✅ Real Test ${i}: ${chunkCount} chunks (${duration}ms) - sims: [${sims.join(', ')}]`);
    }
  }
  
  await new Promise(r => setTimeout(r, 100));
}

console.log('\n' + '='.repeat(80));
console.log('✅ Diagnostic complete');
