import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getEmbedding } from '@/lib/embeddings';

/**
 * GET /api/documents/chunks?filename=<name>&query=<text>&limit=<n>
 *
 * When `query` is provided: returns top-k semantically relevant chunks for
 * that document (vector search scoped to the document).
 *
 * When no `query`: returns all chunks ordered by chunk_index (full browse).
 */
export async function GET(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get('filename');
  const query    = req.nextUrl.searchParams.get('query') ?? '';
  const limit    = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '8', 10), 20);

  if (!filename) {
    return NextResponse.json({ error: 'filename required' }, { status: 400 });
  }

  const supabase = createServerClient();

  // Resolve document id
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select('id')
    .eq('filename', filename)
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  let rawChunks: Array<{
    id: string;
    content: string;
    doc_type: string;
    metadata: Record<string, unknown>;
    chunk_index: number;
    similarity?: number;
  }> = [];

  if (query.trim()) {
    // Semantic search scoped to this document
    let embedding: number[];
    try {
      embedding = await getEmbedding(query);
    } catch (embErr: any) {
      console.error('[doc-chunks] Embedding generation failed:', embErr.message);
      // Fallback to returning chunks by index order
      const { data: fallback } = await supabase
        .from('chunks')
        .select('id, content, doc_type, metadata, chunk_index')
        .eq('document_id', doc.id)
        .order('chunk_index', { ascending: true })
        .limit(limit);
      rawChunks = (fallback ?? []) as typeof rawChunks;
      
      return NextResponse.json(
        rawChunks.map((c) => ({
          id: c.id,
          content: cleanContent(c.content),
          doc_type: c.doc_type,
          chunk_index: c.chunk_index,
          similarity: null,
          section: c.metadata?.section ?? null,
          page_range: c.metadata?.page_range ?? null,
          content_type: c.metadata?.content_type ?? null,
          keywords: c.metadata?.keywords ?? [],
        }))
      );
    }

    const { data, error } = await supabase.rpc('match_chunks_in_doc', {
      query_embedding: embedding,
      doc_id: doc.id,
      match_count: limit,
    });

    if (error) {
      // Fallback: fetch all and sort client-side isn't feasible without embeddings,
      // so just return top chunks by index
      const { data: fallback } = await supabase
        .from('chunks')
        .select('id, content, doc_type, metadata, chunk_index')
        .eq('document_id', doc.id)
        .order('chunk_index', { ascending: true })
        .limit(limit);
      rawChunks = (fallback ?? []) as typeof rawChunks;
    } else {
      rawChunks = (data ?? []) as typeof rawChunks;
    }
  } else {
    // No query — return all chunks in order (full document browse)
    const { data } = await supabase
      .from('chunks')
      .select('id, content, doc_type, metadata, chunk_index')
      .eq('document_id', doc.id)
      .order('chunk_index', { ascending: true });
    rawChunks = (data ?? []) as typeof rawChunks;
  }

  return NextResponse.json(
    rawChunks.map((c) => ({
      id: c.id,
      content: cleanContent(c.content),
      doc_type: c.doc_type,
      chunk_index: c.chunk_index,
      similarity: c.similarity ?? null,
      section: c.metadata?.section ?? null,
      page_range: c.metadata?.page_range ?? null,
      content_type: c.metadata?.content_type ?? null,
      keywords: c.metadata?.keywords ?? [],
    }))
  );
}

/**
 * Strip internal RAG noise from chunk text before showing to users.
 * Removes: "### Chunk N" headers, table-of-contents blocks, leading whitespace.
 */
function cleanContent(text: string): string {
  return text
    .replace(/^###\s*Chunk\s*\d+\s*/gim, '')
    .replace(/^Table of Contents[\s\S]*?(?=\n[A-Z]|\n##|$)/im, '')
    .replace(/^\s*[-–—]{3,}\s*$/gm, '')   // horizontal rules
    .replace(/\n{3,}/g, '\n\n')            // collapse excess blank lines
    .trim();
}
