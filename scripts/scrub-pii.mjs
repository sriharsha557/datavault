#!/usr/bin/env node
/**
 * Scrub PII from existing Supabase chunks.
 * Finds chunks containing emails/phones, scrubs the content,
 * regenerates the embedding, and updates both fields in-place.
 *
 * Usage:
 *   node scripts/scrub-pii.mjs [--dry-run]
 *
 * --dry-run  Print affected rows without making any changes.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');

// ── Clients ───────────────────────────────────────────────────────────────────
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('❌ Missing SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── PII scrubbing ─────────────────────────────────────────────────────────────
function scrubPII(text) {
  return text
    .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[email]')
    .replace(/(\+?\d[\d\s\-().]{7,}\d)/g, '[phone]');
}

function hasPII(text) {
  return /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(text) ||
         /(\+?\d[\d\s\-().]{7,}\d)/.test(text);
}

// ── Embeddings ────────────────────────────────────────────────────────────────
const HF_API_URL = 'https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction';
const HF_BATCH   = 10;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function makeHFRequest(inputs) {
  const token = process.env.HF_TOKEN;
  if (!token) { console.error('❌ Missing HF_TOKEN in .env.local'); process.exit(1); }

  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(HF_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs, options: { wait_for_model: true } }),
        signal: controller.signal,
      });
      clearTimeout(tid);
      if (res.status === 503 || res.status === 429) {
        await sleep(attempt * 3000); continue;
      }
      if (!res.ok) throw new Error(`HF API ${res.status}: ${await res.text()}`);
      return await res.json();
    } catch (err) {
      clearTimeout(tid);
      if (attempt === 3) throw err;
      await sleep(attempt * 2000);
    }
  }
}

async function generateEmbeddings(texts) {
  const results = [];
  for (let i = 0; i < texts.length; i += HF_BATCH) {
    const batch = texts.slice(i, i + HF_BATCH);
    const batchNum = Math.floor(i / HF_BATCH) + 1;
    const total    = Math.ceil(texts.length / HF_BATCH);
    process.stdout.write(`  Embedding batch ${batchNum}/${total}...\r`);
    const data = await makeHFRequest(batch);
    results.push(...data);
    if (i + HF_BATCH < texts.length) await sleep(500);
  }
  console.log('');
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (DRY_RUN) console.log('🔍 DRY RUN — no changes will be made\n');

  const supabase = getSupabase();

  // Fetch all chunks (paginate in batches of 1000)
  console.log('📥 Fetching chunks from Supabase...');
  let allChunks = [];
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('chunks')
      .select('id, content')
      .range(from, from + PAGE - 1);

    if (error) { console.error('❌ Fetch error:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    allChunks = allChunks.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  console.log(`   Total chunks: ${allChunks.length}`);

  // Filter to only chunks with PII
  const piiChunks = allChunks.filter((c) => hasPII(c.content));
  console.log(`   Chunks with PII: ${piiChunks.length}\n`);

  if (piiChunks.length === 0) {
    console.log('✅ No PII found. Nothing to do.');
    return;
  }

  // Show preview
  console.log('📋 Affected chunks (first 5):');
  piiChunks.slice(0, 5).forEach((c) => {
    const emailMatch = c.content.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    console.log(`   ID: ${c.id} | Email: ${emailMatch?.[0] ?? '(phone)'}`);
  });
  if (piiChunks.length > 5) console.log(`   ... and ${piiChunks.length - 5} more`);
  console.log('');

  if (DRY_RUN) {
    console.log('🔍 Dry run complete. Run without --dry-run to apply changes.');
    return;
  }

  // Scrub content
  const scrubbedTexts = piiChunks.map((c) => scrubPII(c.content));

  // Regenerate embeddings
  console.log('🧠 Regenerating embeddings...');
  const embeddings = await generateEmbeddings(scrubbedTexts);

  // Update in Supabase
  console.log('💾 Updating chunks in Supabase...');
  let updated = 0;
  for (let i = 0; i < piiChunks.length; i++) {
    const { error } = await supabase
      .from('chunks')
      .update({ content: scrubbedTexts[i], embedding: embeddings[i] })
      .eq('id', piiChunks[i].id);

    if (error) {
      console.error(`   ❌ Failed to update ${piiChunks[i].id}: ${error.message}`);
    } else {
      updated++;
    }
    process.stdout.write(`   Progress: ${updated}/${piiChunks.length}\r`);
  }

  console.log(`\n✅ Done! Updated ${updated}/${piiChunks.length} chunks.`);
}

main().catch((err) => { console.error('❌ Fatal:', err.message); process.exit(1); });
