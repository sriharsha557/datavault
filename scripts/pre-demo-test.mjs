#!/usr/bin/env node
/**
 * Pre-Demo Test Script
 * Validates all critical functionality before Monday demo
 * 
 * Usage: node scripts/pre-demo-test.mjs
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const TESTS = {
  passed: 0,
  failed: 0,
  warnings: 0,
};

function pass(message) {
  console.log(`✅ ${message}`);
  TESTS.passed++;
}

function fail(message) {
  console.log(`❌ ${message}`);
  TESTS.failed++;
}

function warn(message) {
  console.log(`⚠️  ${message}`);
  TESTS.warnings++;
}

function section(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}\n`);
}

// Test 1: Environment Variables
async function testEnvironment() {
  section('1. Environment Variables');
  
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'GROQ_API_KEY',
    'HF_TOKEN',
    'ADMIN_PANEL_PASSWORD',
  ];
  
  for (const key of required) {
    if (process.env[key]) {
      pass(`${key} is set`);
    } else {
      fail(`${key} is MISSING`);
    }
  }
  
  // Validate formats
  if (process.env.SUPABASE_URL) {
    if (process.env.SUPABASE_URL.startsWith('https://') && 
        process.env.SUPABASE_URL.includes('.supabase.co')) {
      pass('SUPABASE_URL format is valid');
    } else {
      fail('SUPABASE_URL format is invalid');
    }
  }
  
  if (process.env.HF_TOKEN) {
    if (process.env.HF_TOKEN.startsWith('hf_')) {
      pass('HF_TOKEN format is valid');
    } else {
      warn('HF_TOKEN format may be invalid (should start with hf_)');
    }
  }
}

// Test 2: Database Connection
async function testDatabase() {
  section('2. Database Connection');
  
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { persistSession: false } }
    );
    
    // Test connection
    const { data, error } = await supabase.from('documents').select('count').limit(1);
    
    if (error) {
      fail(`Database connection failed: ${error.message}`);
    } else {
      pass('Database connection successful');
    }
    
    // Check chunks count
    const { count: chunkCount } = await supabase
      .from('chunks')
      .select('*', { count: 'exact', head: true });
    
    if (chunkCount > 0) {
      pass(`Found ${chunkCount.toLocaleString()} chunks in database`);
    } else {
      warn('No chunks found in database - have you ingested documents?');
    }
    
    // Check documents count
    const { count: docCount } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true });
    
    if (docCount > 0) {
      pass(`Found ${docCount} documents in database`);
    } else {
      warn('No documents found in database');
    }
    
  } catch (err) {
    fail(`Database test failed: ${err.message}`);
  }
}

// Test 3: Database Functions
async function testDatabaseFunctions() {
  section('3. Database Functions');
  
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { persistSession: false } }
    );
    
    // Create a test embedding (384 dimensions of zeros)
    const testEmbedding = Array(384).fill(0);
    
    // Test match_chunks function
    const { data, error } = await supabase.rpc('match_chunks', {
      query_embedding: testEmbedding,
      match_count: 5,
      filter_doc_type: null,
    });
    
    if (error) {
      fail(`match_chunks function failed: ${error.message}`);
      warn('Run verify-and-fix-functions.sql to fix database functions');
    } else {
      pass('match_chunks function works');
      if (data && data.length > 0) {
        pass(`match_chunks returned ${data.length} results`);
      } else {
        warn('match_chunks returned 0 results (may be normal with zero embedding)');
      }
    }
    
  } catch (err) {
    fail(`Database function test failed: ${err.message}`);
  }
}

// Test 4: HuggingFace API
async function testHuggingFace() {
  section('4. HuggingFace API');
  
  const HF_API_URL = 'https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction';
  
  try {
    const res = await fetch(HF_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: 'test query',
        options: { wait_for_model: true }
      }),
    });
    
    if (!res.ok) {
      fail(`HuggingFace API failed: ${res.status} ${await res.text()}`);
      return;
    }
    
    const data = await res.json();
    const embedding = Array.isArray(data[0]) ? data[0] : data;
    
    if (embedding.length === 384) {
      pass(`HuggingFace API works (returned ${embedding.length} dimensions)`);
    } else {
      fail(`HuggingFace API returned wrong dimensions: ${embedding.length} (expected 384)`);
    }
    
  } catch (err) {
    fail(`HuggingFace API test failed: ${err.message}`);
  }
}

// Test 5: Groq API
async function testGroq() {
  section('5. Groq API');
  
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'Say "test successful"' }],
        max_tokens: 10,
      }),
    });
    
    if (!res.ok) {
      fail(`Groq API failed: ${res.status} ${await res.text()}`);
      return;
    }
    
    const data = await res.json();
    if (data.choices && data.choices.length > 0) {
      pass('Groq API works');
    } else {
      fail('Groq API returned unexpected response');
    }
    
  } catch (err) {
    fail(`Groq API test failed: ${err.message}`);
  }
}

// Test 6: Query Endpoint (if server is running)
async function testQueryEndpoint() {
  section('6. Query Endpoint (Optional - requires running server)');
  
  try {
    const res = await fetch('http://localhost:3000/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'What are Hubs in Data Vault?',
        strict_mode: true,
      }),
    });
    
    if (res.ok) {
      pass('Query endpoint is accessible');
    } else {
      warn(`Query endpoint returned ${res.status} (server may not be running)`);
    }
    
  } catch (err) {
    warn('Query endpoint test skipped (server not running)');
  }
}

// Main
async function main() {
  console.log('\n🚀 Pre-Demo Test Suite\n');
  console.log('Testing all critical functionality before Monday demo...\n');
  
  await testEnvironment();
  await testDatabase();
  await testDatabaseFunctions();
  await testHuggingFace();
  await testGroq();
  await testQueryEndpoint();
  
  // Summary
  section('Test Summary');
  console.log(`✅ Passed:   ${TESTS.passed}`);
  console.log(`❌ Failed:   ${TESTS.failed}`);
  console.log(`⚠️  Warnings: ${TESTS.warnings}`);
  
  if (TESTS.failed > 0) {
    console.log('\n❌ CRITICAL: Some tests failed. Fix these before the demo!');
    console.log('See PRODUCTION_READINESS_REPORT.md for details.\n');
    process.exit(1);
  } else if (TESTS.warnings > 0) {
    console.log('\n⚠️  Some warnings found. Review before demo.');
    console.log('See PRODUCTION_READINESS_REPORT.md for details.\n');
  } else {
    console.log('\n✅ All tests passed! System is ready for demo.\n');
  }
}

main().catch((err) => {
  console.error('\n❌ Test suite failed:', err.message);
  process.exit(1);
});
