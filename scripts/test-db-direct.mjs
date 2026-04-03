#!/usr/bin/env node
/**
 * Test database directly to verify chunks and embeddings exist
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

async function main() {
  console.log('\n🔍 Testing Database Directly\n');
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  );
  
  // Test 1: Count chunks
  console.log('1. Checking chunks...');
  const { count: chunkCount } = await supabase
    .from('chunks')
    .select('*', { count: 'exact', head: true });
  console.log(`   Found ${chunkCount?.toLocaleString()} chunks`);
  
  // Test 2: Get a sample chunk with embedding
  console.log('\n2. Getting sample chunk...');
  const { data: sampleChunk } = await supabase
    .from('chunks')
    .select('id, content, embedding')
    .limit(1)
    .single();
  
  if (sampleChunk) {
    console.log(`   Chunk ID: ${sampleChunk.id}`);
    console.log(`   Content length: ${sampleChunk.content?.length} chars`);
    console.log(`   Embedding: ${sampleChunk.embedding ? 'present' : 'MISSING'}`);
    
    if (sampleChunk.embedding) {
      // Check if it's a string or array
      const embType = typeof sampleChunk.embedding;
      console.log(`   Embedding type: ${embType}`);
      
      if (typeof sampleChunk.embedding === 'string') {
        // Parse the vector string format: [0.1,0.2,...]
        const match = sampleChunk.embedding.match(/\[([\d\.,\-e]+)\]/);
        if (match) {
          const values = match[1].split(',');
          console.log(`   Embedding dimensions: ${values.length}`);
          console.log(`   First 3 values: [${values.slice(0, 3).join(', ')}]`);
        }
      } else if (Array.isArray(sampleChunk.embedding)) {
        console.log(`   Embedding dimensions: ${sampleChunk.embedding.length}`);
        console.log(`   First 3 values: [${sampleChunk.embedding.slice(0, 3).join(', ')}]`);
      }
    }
  }
  
  // Test 3: Test match_chunks with a zero embedding
  console.log('\n3. Testing match_chunks function...');
  const testEmbedding = Array(384).fill(0);
  
  console.log(`   Sending embedding: type=${typeof testEmbedding}, isArray=${Array.isArray(testEmbedding)}, length=${testEmbedding.length}`);
  
  const { data: matchData, error: matchError } = await supabase.rpc('match_chunks', {
    query_embedding: testEmbedding,
    match_count: 5,
    filter_doc_type: null,
  });
  
  if (matchError) {
    console.error(`   ❌ Error: ${matchError.message}`);
    console.error(`   Details:`, matchError);
  } else {
    console.log(`   ✅ Function returned ${matchData?.length ?? 0} results`);
    if (matchData && matchData.length > 0) {
      console.log(`   Top result similarity: ${matchData[0].similarity?.toFixed(4)}`);
    }
  }
  
  // Test 4: Try with a real embedding from the database
  if (sampleChunk?.embedding) {
    console.log('\n4. Testing with real embedding from database...');
    
    // Convert the embedding to array format
    let realEmbedding;
    if (typeof sampleChunk.embedding === 'string') {
      const match = sampleChunk.embedding.match(/\[([\d\.,\-e]+)\]/);
      if (match) {
        realEmbedding = match[1].split(',').map(Number);
      }
    } else if (Array.isArray(sampleChunk.embedding)) {
      realEmbedding = sampleChunk.embedding;
    }
    
    if (realEmbedding) {
      console.log(`   Using embedding with ${realEmbedding.length} dimensions`);
      
      const { data: realMatchData, error: realMatchError } = await supabase.rpc('match_chunks', {
        query_embedding: realEmbedding,
        match_count: 5,
        filter_doc_type: null,
      });
      
      if (realMatchError) {
        console.error(`   ❌ Error: ${realMatchError.message}`);
        console.error(`   Details:`, realMatchError);
      } else {
        console.log(`   ✅ Function returned ${realMatchData?.length ?? 0} results`);
        if (realMatchData && realMatchData.length > 0) {
          console.log(`   Top 3 similarities: ${realMatchData.slice(0, 3).map(r => r.similarity?.toFixed(4)).join(', ')}`);
        }
      }
    }
  }
  
  console.log('\n✅ Database test complete\n');
}

main().catch(console.error);
