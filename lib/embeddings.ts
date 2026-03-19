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
  const data = await makeHFRequest(text);
  return Array.isArray(data[0]) ? (data as number[][])[0] : (data as number[]);
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
