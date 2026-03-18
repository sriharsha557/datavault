// Unified embedding generation for both ingestion and query
// Supports both local (@xenova/transformers) and HuggingFace API
// Use local for consistency, HF API as fallback

import { EmbeddingError } from './errors';

const HF_API_URL = 'https://router.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2';
const BATCH_SIZE = 10;
const MAX_RETRIES = 3;
const EMBEDDING_DIM = 384;

// Environment flag to choose embedding method
const USE_LOCAL_EMBEDDINGS = process.env.USE_LOCAL_EMBEDDINGS === 'true';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── HuggingFace API Implementation ────────────────────────────────────────────
async function makeHFRequest(inputs: string | string[]): Promise<number[] | number[][]> {
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error('Missing HF_TOKEN environment variable');

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(HF_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs, options: { wait_for_model: true } }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status === 503 || res.status === 429) {
        // Model loading or rate limit - wait and retry
        const wait = attempt * 3000;
        console.log(`HF API ${res.status}, retrying in ${wait}ms (attempt ${attempt}/${MAX_RETRIES})`);
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new EmbeddingError(`HF API error ${res.status}: ${text}`);
      }

      return await res.json();
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') throw new EmbeddingError('HF API request timed out after 30s');
      if (attempt === MAX_RETRIES) throw err;
      await sleep(attempt * 2000);
    }
  }

  throw new EmbeddingError('HF API failed after all retries');
}

async function getEmbeddingHF(text: string): Promise<number[]> {
  const data = await makeHFRequest(text);
  return Array.isArray(data[0]) ? (data as number[][])[0] : (data as number[]);
}

async function getEmbeddingsBatchHF(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    console.log(`Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(texts.length / BATCH_SIZE)} (${batch.length} chunks)`);
    const data = await makeHFRequest(batch) as number[][];
    results.push(...data);

    if (i + BATCH_SIZE < texts.length) await sleep(500);
  }

  return results;
}

// ── Local Embeddings Implementation (for Node.js/ingestion) ──────────────────
let localPipeline: any = null;

async function loadLocalModel() {
  if (localPipeline) return localPipeline;
  
  try {
    // Dynamic import for @xenova/transformers (only available in Node.js)
    const { pipeline, env } = await import('@xenova/transformers');
    env.allowLocalModels = false;
    env.useBrowserCache = false;
    
    console.log('⏳ Loading local embedding model (Xenova/all-MiniLM-L6-v2)...');
    localPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('✅ Local model loaded');
    return localPipeline;
  } catch (err) {
    console.warn('⚠️  Local embeddings not available, falling back to HF API');
    return null;
  }
}

async function getEmbeddingLocal(text: string): Promise<number[]> {
  const pipe = await loadLocalModel();
  if (!pipe) return getEmbeddingHF(text);
  
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

async function getEmbeddingsBatchLocal(texts: string[]): Promise<number[][]> {
  const pipe = await loadLocalModel();
  if (!pipe) return getEmbeddingsBatchHF(texts);
  
  const results: number[][] = [];
  const batchSize = 16; // Larger batch for local processing
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    process.stdout.write(`  Embedding ${Math.min(i + batchSize, texts.length)}/${texts.length}...\r`);
    
    for (const text of batch) {
      const output = await pipe(text, { pooling: 'mean', normalize: true });
      results.push(Array.from(output.data));
    }
  }
  console.log('');
  
  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Generate embedding for a single text
 * Uses HuggingFace API by default, local model only if explicitly configured
 */
export async function getEmbedding(text: string): Promise<number[]> {
  // Always use HF API unless explicitly configured for local
  if (USE_LOCAL_EMBEDDINGS) {
    return getEmbeddingLocal(text);
  }
  return getEmbeddingHF(text);
}

/**
 * Generate embeddings for multiple texts in batches
 * Uses HuggingFace API by default, local model only if explicitly configured
 */
export async function getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  // Always use HF API unless explicitly configured for local
  if (USE_LOCAL_EMBEDDINGS) {
    return getEmbeddingsBatchLocal(texts);
  }
  return getEmbeddingsBatchHF(texts);
}

/**
 * Validate embedding dimensionality
 */
export function validateEmbedding(embedding: number[]): boolean {
  return Array.isArray(embedding) && embedding.length === EMBEDDING_DIM;
}

export { EMBEDDING_DIM };
