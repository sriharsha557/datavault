// Embedding generation using HuggingFace API
// Model: sentence-transformers/all-MiniLM-L6-v2 (384-dim)
// Used for both ingestion (local script) and query-time (Vercel serverless)

import { EmbeddingError } from './errors';

const HF_API_URL = 'https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction';
const BATCH_SIZE = 10;
const MAX_RETRIES = 3;
export const EMBEDDING_DIM = 384;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function makeHFRequest(inputs: string | string[]): Promise<number[] | number[][]> {
  const token = process.env.HF_TOKEN;
  if (!token) throw new EmbeddingError('Missing HF_TOKEN environment variable');

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

export async function getEmbedding(text: string): Promise<number[]> {
  const MAX_DIMENSION_RETRIES = 5;
  
  for (let attempt = 1; attempt <= MAX_DIMENSION_RETRIES; attempt++) {
    const data = await makeHFRequest(text);
    const embedding = Array.isArray(data[0]) ? (data as number[][])[0] : (data as number[]);
    
    // Validate embedding dimensions
    if (embedding && embedding.length === EMBEDDING_DIM) {
      if (attempt > 1) {
        console.log(`[embeddings] ✅ Got correct dimensions on attempt ${attempt}`);
      }
      return embedding;
    }
    
    // Dimension mismatch - log and retry
    console.error(`[embeddings] ❌ Attempt ${attempt}/${MAX_DIMENSION_RETRIES}: got ${embedding?.length} dims, expected ${EMBEDDING_DIM}`);
    console.error(`[embeddings] Input text length: ${text.length} chars, first 100: ${text.slice(0, 100)}`);
    
    if (attempt < MAX_DIMENSION_RETRIES) {
      const backoff = attempt * 1000; // 1s, 2s, 3s, 4s
      console.log(`[embeddings] Retrying in ${backoff}ms...`);
      await sleep(backoff);
    } else {
      // Final attempt failed
      throw new EmbeddingError(`HF API returned wrong dimensions after ${MAX_DIMENSION_RETRIES} attempts: got ${embedding?.length}, expected ${EMBEDDING_DIM}`);
    }
  }
  
  throw new EmbeddingError('Failed to get valid embedding dimensions');
}

export async function getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
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

export function validateEmbedding(embedding: number[]): boolean {
  return Array.isArray(embedding) && embedding.length === EMBEDDING_DIM;
}

// Dev startup self-test — confirms HF token + model are working on server start
if (process.env.NODE_ENV === 'development') {
  getEmbedding('startup test')
    .then((v) => console.log(`✅ HF embeddings OK — got ${v.length}-dim vector`))
    .catch((e) => console.error(`❌ HF embeddings FAILED: ${e.message}`));
}
