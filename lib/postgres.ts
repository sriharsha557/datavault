// Direct Postgres connection - bypasses Supabase JS client issues
import { Pool } from 'pg';

let pool: Pool | null = null;

function getPool() {
  if (pool) return pool;
  
  const connectionString = `postgresql://postgres:${encodeURIComponent('Datavault@20')}@db.mbwwjgtdpprbewrytvew.supabase.co:5432/postgres`;
  
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  
  return pool;
}

export interface MatchedChunk {
  id: string;
  content: string;
  doc_type: string;
  metadata: any;
  filename: string;
  similarity: number;
}

export async function matchChunks(
  embedding: number[],
  matchCount: number = 8,
  filterDocType: string | null = null
): Promise<MatchedChunk[]> {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    // Convert embedding array to vector format
    const embeddingStr = `[${embedding.join(',')}]`;
    
    let query = `
      SELECT 
        c.id::text, 
        c.content, 
        c.doc_type, 
        c.metadata, 
        d.filename,
        (1 - (c.embedding <=> $1::vector(384)))::float as similarity
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE ($2::text IS NULL OR c.doc_type = $2)
      ORDER BY c.embedding <=> $1::vector(384)
      LIMIT $3
    `;
    
    const result = await client.query(query, [embeddingStr, filterDocType, matchCount]);
    
    return result.rows as MatchedChunk[];
  } finally {
    client.release();
  }
}

export async function matchChunksInDoc(
  embedding: number[],
  docId: string,
  matchCount: number = 8
): Promise<MatchedChunk[]> {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const embeddingStr = `[${embedding.join(',')}]`;
    
    const query = `
      SELECT 
        c.id::text,
        c.content,
        c.doc_type,
        c.metadata,
        c.chunk_index,
        (1 - (c.embedding <=> $1::vector(384)))::float as similarity
      FROM chunks c
      WHERE c.document_id = $2::uuid
      ORDER BY c.embedding <=> $1::vector(384)
      LIMIT $3
    `;
    
    const result = await client.query(query, [embeddingStr, docId, matchCount]);
    
    return result.rows as any[];
  } finally {
    client.release();
  }
}
