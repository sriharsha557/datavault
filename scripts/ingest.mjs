#!/usr/bin/env node
/**
 * Standalone ingestion script — runs locally, pushes to Supabase.
 * Uses Groq embeddings (nomic-embed-text-v1_5, 768-dim) — same model as query API.
 * No HuggingFace token needed. Requires GROQ_API_KEY in .env.local.
 *
 * Usage:
 *   node scripts/ingest.mjs <file-path> [doc-type]
 *
 * Examples:
 *   node scripts/ingest.mjs ./docs/DV-Architecture.pdf
 *   node scripts/ingest.mjs ./docs/hub-guide.pdf hub
 *   node scripts/ingest.mjs ./docs/methodology.md methodology
 *
 * Doc types: hub | link | satellite | pit_bridge | methodology | general
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { extname, basename } from 'path';
import { createRequire } from 'module';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env.local
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });

const require = createRequire(import.meta.url);

// ── Config ────────────────────────────────────────────────────────────────────
const CHUNK_SIZE    = 1400;
const CHUNK_OVERLAP = 200;
const MIN_CHUNK_LEN = 40;
const DB_BATCH      = 100;

// ── Clients ───────────────────────────────────────────────────────────────────
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('❌ Missing SUPABASE_URL / SUPABASE_SERVICE_KEY in .env.local'); process.exit(1); }
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Doc type detection ────────────────────────────────────────────────────────
function detectDocType(filename) {
  const l = filename.toLowerCase();
  if (l.includes('hub'))                          return 'hub';
  if (l.includes('link'))                         return 'link';
  if (l.includes('sat'))                          return 'satellite';
  if (l.includes('pit') || l.includes('bridge'))  return 'pit_bridge';
  if (l.includes('method') || l.includes('guide'))return 'methodology';
  return 'general';
}

// ── Text extraction ───────────────────────────────────────────────────────────
async function extractText(filePath) {
  const ext    = extname(filePath).toLowerCase().slice(1);
  const buffer = readFileSync(filePath);

  if (ext === 'pdf') {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    const pageNumbers = new Map();
    if (data.numpages > 0) {
      const avg = Math.ceil(data.text.length / data.numpages);
      for (let p = 1; p <= data.numpages; p++) pageNumbers.set((p - 1) * avg, p);
    }
    return { text: data.text, pageNumbers };
  }
  if (ext === 'docx') {
    const mammoth = require('mammoth');
    const result  = await mammoth.extractRawText({ buffer });
    return { text: result.value, pageNumbers: new Map() };
  }
  if (ext === 'txt' || ext === 'md') {
    return { text: buffer.toString('utf-8'), pageNumbers: new Map() };
  }
  throw new Error(`Unsupported file type: .${ext}`);
}

// ── Chunking ──────────────────────────────────────────────────────────────────
const SEPARATORS = ['\n## ', '\n### ', '\n#### ', '\n\n', '\n', '. ', ' '];

function getPageNumber(offset, pageNumbers) {
  let closest, closestOffset = -1;
  for (const [po, pn] of pageNumbers.entries()) {
    if (po <= offset && po > closestOffset) { closestOffset = po; closest = pn; }
  }
  return closest;
}

function splitIntoChunks(text, pageNumbers) {
  const trimmed = text.trim();
  const chunks  = [];
  let startOffset = 0, chunkIndex = 0;

  while (startOffset < trimmed.length) {
    let endOffset = Math.min(startOffset + CHUNK_SIZE, trimmed.length);

    if (endOffset < trimmed.length) {
      let bestBreak = -1;
      for (const sep of SEPARATORS) {
        const idx = trimmed.substring(startOffset, endOffset).lastIndexOf(sep);
        if (idx !== -1) { bestBreak = startOffset + idx + sep.length; break; }
      }
      // Only use the break if it actually advances past startOffset
      if (bestBreak > startOffset) endOffset = bestBreak;
    }

    const content = trimmed.substring(startOffset, endOffset).trim();
    if (content.length >= MIN_CHUNK_LEN) {
      chunks.push({ content, chunk_index: chunkIndex++, pageNumber: getPageNumber(startOffset, pageNumbers) });
    }

    if (endOffset >= trimmed.length) break;

    // Always advance by at least 1 character to prevent infinite loop
    const nextStart = endOffset - CHUNK_OVERLAP;
    startOffset = nextStart > startOffset ? nextStart : startOffset + 1;
  }
  return chunks;
}

// ── Embeddings via HuggingFace API ───────────────────────────────────────────
const HF_API_URL = 'https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction';
const HF_BATCH   = 10;
const MAX_RETRIES = 3;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function makeHFRequest(inputs) {
  const token = process.env.HF_TOKEN;
  if (!token) { console.error('❌ Missing HF_TOKEN in .env.local'); process.exit(1); }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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
        const wait = attempt * 3000;
        console.log(`  HF API ${res.status}, retrying in ${wait}ms...`);
        await sleep(wait); continue;
      }
      if (!res.ok) throw new Error(`HF API ${res.status}: ${await res.text()}`);
      return await res.json();
    } catch (err) {
      clearTimeout(tid);
      if (err.name === 'AbortError') throw new Error('HF API timed out');
      if (attempt === MAX_RETRIES) throw err;
      await sleep(attempt * 2000);
    }
  }
  throw new Error('HF API failed after all retries');
}

async function generateEmbeddings(texts) {
  const results = [];
  for (let i = 0; i < texts.length; i += HF_BATCH) {
    const batch = texts.slice(i, i + HF_BATCH);
    const batchNum = Math.floor(i / HF_BATCH) + 1;
    const total    = Math.ceil(texts.length / HF_BATCH);
    process.stdout.write(`  Embedding batch ${batchNum}/${total} (${batch.length} chunks)...\r`);
    const data = await makeHFRequest(batch);
    results.push(...data);
    if (i + HF_BATCH < texts.length) await sleep(500);
  }
  console.log('');
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node scripts/ingest.mjs <file-path> [doc-type]');
    console.log('Doc types: hub | link | satellite | pit_bridge | methodology | general');
    process.exit(0);
  }

  const filePath = args[0];
  if (!existsSync(filePath)) { console.error(`❌ File not found: ${filePath}`); process.exit(1); }

  const filename = basename(filePath);
  const docType  = args[1] || detectDocType(filename);
  const fileSize = readFileSync(filePath).length;

  console.log(`\n📄 File:     ${filename}`);
  console.log(`🏷️  Doc type: ${docType}`);
  console.log(`📦 Size:     ${(fileSize / 1024).toFixed(1)} KB\n`);

  console.log('📖 Extracting text...');
  const { text, pageNumbers } = await extractText(filePath);
  console.log(`   Extracted ${text.length.toLocaleString()} characters`);

  console.log('✂️  Chunking...');
  const chunks = splitIntoChunks(text, pageNumbers);
  console.log(`   Created ${chunks.length} chunks`);

  console.log('🧠 Generating embeddings (HF all-MiniLM-L6-v2)...');
  const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

  console.log('💾 Storing in Supabase...');
  const supabase = getSupabase();

  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({ filename, doc_type: docType, file_size: fileSize, status: 'processing' })
    .select()
    .single();

  if (docErr || !doc) { console.error('❌ Failed to create document record:', docErr?.message); process.exit(1); }
  console.log(`   Document ID: ${doc.id}`);

  const rows = chunks.map((chunk, i) => ({
    document_id: doc.id,
    content:     chunk.content,
    embedding:   embeddings[i],
    chunk_index: chunk.chunk_index,
    doc_type:    docType,
    metadata:    chunk.pageNumber ? { page_number: chunk.pageNumber } : {},
  }));

  for (let i = 0; i < rows.length; i += DB_BATCH) {
    const batch = rows.slice(i, i + DB_BATCH);
    const { error } = await supabase.from('chunks').insert(batch);
    if (error) {
      console.error('❌ Failed to insert chunks:', error.message);
      await supabase.from('documents').delete().eq('id', doc.id);
      process.exit(1);
    }
    process.stdout.write(`   Stored ${Math.min(i + DB_BATCH, rows.length)}/${rows.length} chunks...\r`);
  }

  await supabase.from('documents').update({ status: 'ready', chunk_count: chunks.length }).eq('id', doc.id);
  console.log(`\n✅ Done! ${chunks.length} chunks indexed for "${filename}"\n`);
}

main().catch((err) => { console.error('❌ Error:', err.message); process.exit(1); });
