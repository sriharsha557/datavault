#!/usr/bin/env node
/**
 * Ingest pre-chunked JSON/JSONL files directly into Supabase.
 * Skips text extraction and chunking — embeds the `content` field and stores as-is.
 *
 * Supports:
 *   - Single JSON file (array of chunks)
 *   - JSONL file (one chunk per line)
 *   - {"chunks": [...]} wrapper structure
 *
 * Expected chunk shape:
 *   { chunk_id, content, section?, content_type?, page_range?, keywords?, ... }
 *
 * Usage:
 *   node scripts/ingest-json.mjs <file.json|file.jsonl> [doc-type]
 *
 * Examples:
 *   node scripts/ingest-json.mjs "C:/Users/PC/Downloads/JSON/rag_chunks_merged.jsonl"
 *   node scripts/ingest-json.mjs ./chunks.json methodology
 *
 * Doc types: hub | link | satellite | pit_bridge | methodology | general
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { extname, basename } from 'path';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });

const DB_BATCH   = 100;
const HF_BATCH   = 10;
const HF_API_URL = 'https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction';
const MAX_RETRIES = 3;

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
  if (l.includes('hub'))                           return 'hub';
  if (l.includes('link'))                          return 'link';
  if (l.includes('sat'))                           return 'satellite';
  if (l.includes('pit') || l.includes('bridge'))   return 'pit_bridge';
  if (l.includes('method') || l.includes('guide')) return 'methodology';
  return 'general';
}

// ── PII scrubbing ─────────────────────────────────────────────────────────────
function scrubPII(text) {
  return text
    .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[email]')
    .replace(/(\+?\d[\d\s\-().]{7,}\d)/g, '[phone]');
}

// ── Content quality filter ────────────────────────────────────────────────────
/**
 * Returns true if the chunk is worth indexing.
 * Drops: TOC pages, heading-only chunks, very short fragments.
 * Keeps: anything with real prose content, even if short.
 */
function isUsefulChunk(text) {
  if (!text || text.length < 80) return false;  // relaxed from 150

  // Drop table-of-contents blocks
  if (/table of contents/i.test(text)) return false;

  // Drop chunks that are MOSTLY a numbered list of headings (TOC pattern)
  // Only drop if >70% of lines look like TOC entries (was 50%)
  const tocLinePattern = /^\s*\d+(\.\d+)*\s+[A-Z]/gm;
  const tocLines = (text.match(tocLinePattern) || []).length;
  const totalLines = text.split('\n').filter(Boolean).length;
  if (totalLines > 4 && tocLines / totalLines > 0.7) return false;

  // Drop chunks that are pure heading with no body (< 2 words per line on average)
  const words = text.split(/\s+/).filter(Boolean).length;
  const lines = text.split('\n').filter(Boolean).length;
  if (lines > 0 && words / lines < 2.5 && text.length < 300) return false;

  return true;
}

// ── JSON/JSONL parsing ────────────────────────────────────────────────────────
function parseFile(filePath) {
  const ext  = extname(filePath).toLowerCase();
  const text = readFileSync(filePath, 'utf-8');

  if (ext === '.jsonl') {
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }

  // Regular JSON
  const data = JSON.parse(text);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.chunks)) return data.chunks;
  throw new Error('JSON must be an array or { chunks: [...] }');
}

// ── Embeddings ────────────────────────────────────────────────────────────────
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
      if (res.status === 503 || res.status === 429) { await sleep(attempt * 3000); continue; }
      if (!res.ok) throw new Error(`HF API ${res.status}: ${await res.text()}`);
      return await res.json();
    } catch (err) {
      clearTimeout(tid);
      if (attempt === MAX_RETRIES) throw err;
      await sleep(attempt * 2000);
    }
  }
}

async function generateEmbeddings(texts) {
  const results = [];
  for (let i = 0; i < texts.length; i += HF_BATCH) {
    const batch    = texts.slice(i, i + HF_BATCH);
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
    console.log('Usage: node scripts/ingest-json.mjs <file.json|file.jsonl> [doc-type]');
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

  // Parse chunks
  console.log('📖 Parsing JSON...');
  const rawChunks = parseFile(filePath);
  console.log(`   Found ${rawChunks.length} chunks`);

  // Validate — every chunk must have a content field
  const invalid = rawChunks.filter((c) => !c.content || typeof c.content !== 'string');
  if (invalid.length > 0) {
    console.error(`❌ ${invalid.length} chunks are missing a "content" field. First bad chunk:`);
    console.error(JSON.stringify(invalid[0], null, 2));
    process.exit(1);
  }

  // Filter low-quality chunks (TOC, headings, fragments)
  const usefulChunks = rawChunks.filter((c) => isUsefulChunk(c.content));
  const dropped = rawChunks.length - usefulChunks.length;
  if (dropped > 0) {
    console.log(`   ⚠️  Dropped ${dropped} low-quality chunks (TOC, headings, fragments)`);
  }
  console.log(`   ✅ ${usefulChunks.length} chunks will be indexed`);

  // Scrub PII from content
  const contents = usefulChunks.map((c) => scrubPII(c.content.trim()));

  // Generate embeddings
  console.log('🧠 Generating embeddings (HF all-MiniLM-L6-v2)...');
  const embeddings = await generateEmbeddings(contents);

  // Store in Supabase
  console.log('💾 Storing in Supabase...');
  const supabase = getSupabase();

  // Create document record
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({ filename, doc_type: docType, file_size: fileSize, status: 'processing' })
    .select()
    .single();

  if (docErr || !doc) { console.error('❌ Failed to create document record:', docErr?.message); process.exit(1); }
  console.log(`   Document ID: ${doc.id}`);

  // Build rows — preserve all extra metadata from the JSON chunk
  const rows = usefulChunks.map((chunk, i) => ({
    document_id: doc.id,
    content:     contents[i],
    embedding:   embeddings[i],
    chunk_index: i,
    doc_type:    docType,
    metadata: {
      chunk_id:     chunk.chunk_id   ?? null,
      section:      chunk.section    ?? null,
      content_type: chunk.content_type ?? null,
      page_range:   chunk.page_range ?? null,
      keywords:     chunk.keywords   ?? [],
    },
  }));

  // Insert in batches
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

  await supabase.from('documents').update({ status: 'ready', chunk_count: rows.length }).eq('id', doc.id);
  console.log(`\n✅ Done! ${rows.length} chunks indexed for "${filename}"\n`);
}

main().catch((err) => { console.error('❌ Error:', err.message); process.exit(1); });
