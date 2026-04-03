#!/usr/bin/env node
/**
 * Batch ingestion script for multiple PDFs
 * Usage: node scripts/ingest-batch.mjs
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

const BASE_PATH = 'C:/Users/PC/Downloads/DV';

const files = [
  'Building a scalable data warehouse with data vault 2.0-155-300.pdf',
  'Building a scalable data warehouse with data vault 2.0-301-450.pdf',
  'Building a scalable data warehouse with data vault 2.0-451-600.pdf',
  'Building a scalable data warehouse with data vault 2.0-601-754.pdf',
];

console.log('📚 Batch Ingestion: Data Vault 2.0 Book (4 parts)\n');
console.log('This will take 20-40 minutes depending on content and API speed.\n');

let successCount = 0;
let failCount = 0;

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const fullPath = `${BASE_PATH}/${file}`;
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📄 Processing ${i + 1}/${files.length}: ${file}`);
  console.log(`${'='.repeat(70)}\n`);
  
  if (!existsSync(fullPath)) {
    console.error(`❌ File not found: ${fullPath}`);
    failCount++;
    continue;
  }
  
  try {
    execSync(`node scripts/ingest.mjs "${fullPath}" methodology`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    successCount++;
    console.log(`\n✅ Completed ${i + 1}/${files.length}`);
  } catch (err) {
    console.error(`\n❌ Failed to process ${file}`);
    failCount++;
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log('📊 Batch Ingestion Summary');
console.log(`${'='.repeat(70)}`);
console.log(`✅ Successful: ${successCount}/${files.length}`);
console.log(`❌ Failed: ${failCount}/${files.length}`);
console.log(`\nTotal time: Check timestamps above`);
console.log(`\nYou can now query the ingested content!`);
