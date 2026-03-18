import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { splitIntoChunks } from '@/lib/chunker';
import { getEmbeddingsBatch } from '@/lib/embeddings';
import type { ReindexResponse } from '@/types';

export const maxDuration = 60;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { documentId } = body;

    if (!documentId || !UUID_REGEX.test(documentId)) {
      return NextResponse.json({ error: 'Invalid document ID format' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Fetch document including content
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('id, filename, doc_type, chunk_count, content')
      .eq('id', documentId)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (!doc.content) {
      return NextResponse.json(
        { error: 'Original content not available. Please re-upload the document.' },
        { status: 404 }
      );
    }

    // Re-chunk the content
    const chunks = splitIntoChunks(doc.content, {
      document_id: documentId,
      filename: doc.filename,
    });

    // Generate embeddings in batches of 10
    const BATCH_SIZE = 10;
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const embeddings = await getEmbeddingsBatch(batch.map((c) => c.content));
      allEmbeddings.push(...embeddings);
    }

    // Build new chunk rows
    const newChunks = chunks.map((chunk, i) => ({
      document_id: documentId,
      content: chunk.content,
      embedding: allEmbeddings[i],
      chunk_index: chunk.chunk_index,
      doc_type: doc.doc_type,
      metadata: chunk.metadata,
    }));

    // Atomically replace chunks
    const { error: deleteError } = await supabase
      .from('chunks')
      .delete()
      .eq('document_id', documentId);

    if (deleteError) {
      throw new Error(`Failed to delete old chunks: ${deleteError.message}`);
    }

    const { error: insertError } = await supabase.from('chunks').insert(newChunks);

    if (insertError) {
      throw new Error(`Failed to insert new chunks: ${insertError.message}`);
    }

    const { error: updateError } = await supabase
      .from('documents')
      .update({ chunk_count: newChunks.length, updated_at: new Date().toISOString() })
      .eq('id', documentId);

    if (updateError) {
      throw new Error(`Failed to update document: ${updateError.message}`);
    }

    const response: ReindexResponse = {
      success: true,
      documentId,
      oldChunkCount: doc.chunk_count,
      newChunkCount: newChunks.length,
      message: 'Document re-indexed successfully',
    };

    return NextResponse.json(response);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
