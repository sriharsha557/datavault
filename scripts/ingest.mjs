#!/usr/bin/env node
/**
 * Standalone ingestion script - runs outside Next.js
 * Uses @xenova/transformers locally for embeddings
 *
 * Usage:
 *   node scripts/ingest.mjs <file-path> [doc-type]
 *
 * Examples:
 *   node scripts/ingest.mjs ./docs/DV-Architecture.pdf
 *   node scripts/ingest.mjs ./docs/hub-guide.pdf hub
 *   node scripts/ingest.mjs ./docs/methodology.md methodology
 */

import { pipeline, env } from '@xenova/transformers';
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

// Configure transformers to cache models locally
env.allowLocalModels = false;
env.useBrowserCache = false;

const require = createRequire(import.meta.url);

// ── Config ────────────────────────────────────────────────────────────────────
const CHUNK_SIZE = 1400;
const CHUNK_OVERLAP = 200;
const MIN_CHUNK_LENGTH = 40;
const BATCH_SIZE = 16;

// ── Supabase ──────────────────────────────────────────────────────────────────
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('❌ Missing SUPABASE_URL / SUPABASE_SERVICE_KEY in .env.local');
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Doc type detection ────────────────────────────────────────────────────────
function detectDocType(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes('hub')) return 'hub';
  if (lower.includes('link')) return 'link';
  if (lower.includes('sat')) return 'satellite';
  if (lower.includes('pit') || lower.includes('bridge')) return 'pit_bridge';
  if (lower.includes('method') || lower.includes('guide')) return 'methodology';
  return 'general';
}

// ── Text extraction ───────────────────────────────────────────────────────────
async function extractText(filePath) {
  const ext = extname(filePath).toLowerCase().slice(1);
  const buffer = readFileSync(filePath);

  if (ext === 'pdf') {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    // Build page number map (approximate)
    const pageNumbers = new Map();
    if (data.numpages > 0) {
      const avgCharsPerPage = Math.ceil(data.text.length / data.numpages);
      for (let p = 1; p <= data.numpages; p++) {
        pageNumbers.set((p - 1) * avgCharsPerPage, p);
      }
    }
    return { text: data.text, pageNumbers };
  }

  if (ext === 'docx') {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
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
  let closest;
  let closestOffset = -1;
  for (const [pageOffset, pageNum] of pageNumbers.entries()) {
    if (pageOffset <= offset && pageOffset > closestOffset) {
      closestOffset = pageOffset;
      closest = pageNum;
    }
  }
  return closest;
}

function splitIntoChunks(text, pageNumbers) {
  const trimmed = text.trim();
  const chunks = [];
  let startOffset = 0;
  let chunkIndex = 0;

  while (startOffset < trimmed.length) {
    let endOffset = Math.min(startOffset + CHUNK_SIZE, trimmed.length);

    if (endOffset < trimmed.length) {
      let bestBreak = endOffset;
      for (const sep of SEPARATORS) {
        const slice = trimmed.substring(startOffset, endOffset);
        const idx = slice.lastIndexOf(sep);
        if (idx !== -1) { bestBreak = startOffset + idx + sep.length; break; }
      }
      endOffset = bestBreak;
    }

    const content = trimmed.substring(startOffset, endOffset).trim();
    if (content.length >= MIN_CHUNK_LENGTH) {
      const pageNumber = getPageNumber(startOffset, pageNumbers);
      chunks.push({ content, chunk_index: chunkIndex++, pageNumber });
    }

    if (endOffset >= trimmed.length) break;
    startOffset = endOffset - CHUNK_OVERLAP;
    if (startOffset <= (chunks[chunks.length - 1]?.startOffset ?? -1)) {
      startOffset = (chunks[chunks.length - 1]?.startOffset ?? 0) + 1;
    }
  }

  return chunks;
}

// ── Embeddings ────────────────────────────────────────────────────────────────
let embeddingPipeline = null;

async function loadModel() {
  if (!embeddingPipeline) {
    console.log('⏳ Loading embedding model (Xenova/all-MiniLM-L6-v2)...');
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('✅ Model loaded');
  }
  return embeddingPipeline;
}

async function generateEmbeddings(texts) {
  const pipe = await loadModel();
  const results = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    process.stdout.write(`  Embedding ${Math.min(i + BATCH_SIZE, texts.length)}/${texts.length}...\r`);
    for (const text of batch) {
      const out = await pipe(text, { pooling: 'mean', normalize: true });
      results.push(Array.from(out.data));
    }
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
  if (!existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  const filename = basename(filePath);
  const docType = args[1] || detectDocType(filename);
  const fileSize = readFileSync(filePath).length;

  console.log(`\n📄 File:     ${filename}`);
  console.log(`🏷️  Doc type: ${docType}`);
  console.log(`📦 Size:     ${(fileSize / 1024).toFixed(1)} KB\n`);

  // 1. Extract text
  console.log('📖 Extracting text...');
  const { text, pageNumbers } = await extractText(filePath);
  console.log(`   Extracted ${text.length.toLocaleString()} characters`);

  // 2. Chunk
  console.log('✂️  Chunking...');
  const chunks = splitIntoChunks(text, pageNumbers);
  console.log(`   Created ${chunks.length} chunks`);

  // 3. Embed
  console.log('🧠 Generating embeddings...');
  const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

  // 4. Store in Supabase
  console.log('💾 Storing in Supabase...');
  const supabase = getSupabase();

  // Insert document record
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({ filename, doc_type: docType, file_size: fileSize, status: 'processing' })
    .select()
    .single();

  if (docErr || !doc) {
    console.error('❌ Failed to create document record:', docErr?.message);
    process.exit(1);
  }

  console.log(`   Document ID: ${doc.id}`);

  // Insert chunks in batches of 100
  const rows = chunks.map((chunk, i) => ({
    document_id: doc.id,
    content: chunk.content,
    embedding: embeddings[i],
    chunk_index: chunk.chunk_index,
    doc_type: docType,
    metadata: chunk.pageNumber ? { page_number: chunk.pageNumber } : {},
  }));

  const DB_BATCH = 100;
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

  // Mark as ready
  await supabase
    .from('documents')
    .update({ status: 'ready', chunk_count: chunks.length })
    .eq('id', doc.id);

  console.log(`\n✅ Done! ${chunks.length} chunks indexed for "${filename}"\n`);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
