// Test HuggingFace API embedding dimensions
// Run: node scripts/test-hf-embeddings.mjs

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const HF_API_URL = 'https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction';
const EXPECTED_DIM = 384;

async function testEmbedding(text, label) {
  console.log(`\n=== Testing: ${label} ===`);
  console.log(`Input text: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`);
  console.log(`Input length: ${text.length} chars`);
  
  try {
    const res = await fetch(HF_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: text,
        options: { wait_for_model: true }
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`❌ API error ${res.status}: ${errorText}`);
      return null;
    }

    const data = await res.json();
    const embedding = Array.isArray(data[0]) ? data[0] : data;
    
    console.log(`Response type: ${typeof data}, isArray: ${Array.isArray(data)}`);
    console.log(`Embedding dimensions: ${embedding.length}`);
    console.log(`First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
    console.log(`Last 5 values: [${embedding.slice(-5).map(v => v.toFixed(4)).join(', ')}]`);
    
    if (embedding.length === EXPECTED_DIM) {
      console.log(`✅ PASS - Got expected ${EXPECTED_DIM} dimensions`);
    } else {
      console.log(`❌ FAIL - Got ${embedding.length} dimensions, expected ${EXPECTED_DIM}`);
      console.log(`Missing ${EXPECTED_DIM - embedding.length} dimensions`);
    }
    
    return embedding;
  } catch (err) {
    console.error(`❌ Exception: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('HuggingFace Embedding Dimension Test');
  console.log('=====================================');
  console.log(`Model: sentence-transformers/all-MiniLM-L6-v2`);
  console.log(`Expected dimensions: ${EXPECTED_DIM}`);
  console.log(`HF_TOKEN present: ${!!process.env.HF_TOKEN}`);

  // Test 1: Short text
  await testEmbedding('What are Hubs in Data Vault?', 'Short query');
  
  // Test 2: Medium text
  await testEmbedding(
    'A Hub is a core business entity in Data Vault 2.0 modeling. It represents a unique business concept and contains the business key, load date, and record source.',
    'Medium text'
  );
  
  // Test 3: Long text
  await testEmbedding(
    'Data Vault 2.0 is a data modeling methodology designed for enterprise data warehouses. It consists of three main components: Hubs (core business entities), Links (relationships between entities), and Satellites (descriptive attributes). The methodology emphasizes scalability, flexibility, and auditability. Hubs contain business keys that uniquely identify entities, Links capture many-to-many relationships, and Satellites store historical context and descriptive data with temporal tracking.',
    'Long text'
  );
  
  // Test 4: Multiple requests in sequence (check for consistency)
  console.log('\n=== Testing consistency (5 sequential requests) ===');
  const testText = 'What are Hubs in Data Vault?';
  const dimensions = [];
  
  for (let i = 1; i <= 5; i++) {
    const res = await fetch(HF_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: testText,
        options: { wait_for_model: true }
      }),
    });
    
    if (res.ok) {
      const data = await res.json();
      const embedding = Array.isArray(data[0]) ? data[0] : data;
      dimensions.push(embedding.length);
      console.log(`Request ${i}: ${embedding.length} dimensions ${embedding.length === EXPECTED_DIM ? '✅' : '❌'}`);
    } else {
      console.log(`Request ${i}: Failed with status ${res.status}`);
    }
    
    // Small delay between requests
    await new Promise(r => setTimeout(r, 500));
  }
  
  const allCorrect = dimensions.every(d => d === EXPECTED_DIM);
  const allSame = dimensions.every(d => d === dimensions[0]);
  
  console.log(`\nConsistency check:`);
  console.log(`All ${EXPECTED_DIM} dimensions: ${allCorrect ? '✅' : '❌'}`);
  console.log(`All same dimension: ${allSame ? '✅' : '❌'}`);
  console.log(`Dimensions seen: [${dimensions.join(', ')}]`);
}

main().catch(console.error);
