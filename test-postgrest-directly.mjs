#!/usr/bin/env node
import { config } from 'dotenv';
config({ path: '.env.local' });

// Test PostgREST directly with different formats
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const testEmbedding = Array(384).fill(0).map((_, i) => Math.sin(i * 0.1));

console.log('Testing different formats with PostgREST...\n');

// Test 1: Send as array
console.log('Test 1: Sending as JSON array');
try {
  const res1 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_chunks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      query_embedding: testEmbedding,
      match_count: 8,
      filter_doc_type: null
    })
  });
  
  const data1 = await res1.json();
  console.log('Result:', Array.isArray(data1) ? `${data1.length} chunks` : 'Error:', data1);
} catch (e) {
  console.log('Error:', e.message);
}

console.log('\n---\n');

// Test 2: Send as string
console.log('Test 2: Sending as vector string "[...]"');
try {
  const embeddingStr = `[${testEmbedding.join(',')}]`;
  const res2 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_chunks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      query_embedding: embeddingStr,
      match_count: 8,
      filter_doc_type: null
    })
  });
  
  const data2 = await res2.json();
  console.log('Result:', Array.isArray(data2) ? `${data2.length} chunks` : 'Error:', data2);
} catch (e) {
  console.log('Error:', e.message);
}

console.log('\n---\n');

// Test 3: Check what Supabase JS client actually sends
console.log('Test 3: Using Supabase JS client');
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

try {
  const { data, error } = await supabase.rpc('match_chunks', {
    query_embedding: testEmbedding,
    match_count: 8,
    filter_doc_type: null
  });
  
  console.log('Result:', data?.length ?? 0, 'chunks');
  if (error) console.log('Error:', error);
} catch (e) {
  console.log('Error:', e.message);
}
