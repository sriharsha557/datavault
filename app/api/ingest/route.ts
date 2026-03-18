import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { extractText, detectDocumentType } from '@/lib/extractor';
import { splitIntoChunks } from '@/lib/chunker';
import { getEmbeddingsBatch } from '@/lib/embeddings';
import { validateFile } from '@/lib/validation';
import { ValidationError, ExtractionError, EmbeddingError, DatabaseError, sanitizeError, logError } from '@/lib/errors';
import type { IngestResponse } from '@/types';

// Vercel free tier: max 60s execution, 4.5MB payload
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse<IngestResponse>> {
  let documentId: string | null = null;
  const supabase = createServerClient();

  try {
    // Parse multipart/form-data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const docTypeOverride = formData.get('doc_type') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type (.pdf, .docx, .txt, .md) and size (max 10MB)
    // Reject executable file extensions
    try {
      validateFile(file);
    } catch (error) {
      if (error instanceof ValidationError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 400 }
        );
      }
      throw error;
    }

    const docType = (docTypeOverride || detectDocumentType(file.name)) as string;

    // Begin transaction: Create document record (status = processing)
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .insert({
        filename: file.name,
        doc_type: docType,
        file_size: file.size,
        status: 'processing',
      })
      .select()
      .single();

    if (docError || !doc) {
      logError(docError, { operation: 'create_document', filename: file.name });
      throw new DatabaseError('Failed to create document record', docError?.message);
    }

    documentId = doc.id;

    // Extract text using appropriate extractor
    let extractionResult;
    try {
      extractionResult = await extractText(file);
    } catch (error) {
      logError(error, { operation: 'extract_text', filename: file.name, documentId });
      // Rollback: mark document as error
      await supabase.from('documents').update({ status: 'error' }).eq('id', documentId);
      
      if (error instanceof ExtractionError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 422 }
        );
      }
      throw error;
    }

    if (!extractionResult.text.trim()) {
      await supabase.from('documents').update({ status: 'error' }).eq('id', documentId);
      return NextResponse.json(
        { success: false, error: 'Could not extract text from file - document appears to be empty' },
        { status: 422 }
      );
    }

    // Chunk document with overlap
    const chunks = splitIntoChunks(
      extractionResult.text,
      {
        document_id: doc.id,
        filename: file.name,
        doc_type: docType,
      },
      {
        pageNumbers: extractionResult.metadata.pageNumbers,
      }
    );

    if (chunks.length === 0) {
      await supabase.from('documents').update({ status: 'error' }).eq('id', documentId);
      return NextResponse.json(
        { success: false, error: 'No usable chunks extracted - document may be too short or improperly formatted' },
        { status: 422 }
      );
    }

    // Generate embeddings in batches
    let embeddings;
    try {
      embeddings = await getEmbeddingsBatch(chunks.map((c) => c.content));
    } catch (error) {
      logError(error, { operation: 'generate_embeddings', filename: file.name, documentId, chunkCount: chunks.length });
      // Rollback: mark document as error
      await supabase.from('documents').update({ status: 'error' }).eq('id', documentId);
      
      if (error instanceof EmbeddingError) {
        return NextResponse.json(
          { success: false, error: 'Failed to generate embeddings - please try again later' },
          { status: 500 }
        );
      }
      
      return NextResponse.json(
        { success: false, error: 'Embedding service temporarily unavailable - please try again later' },
        { status: 503 }
      );
    }

    // Insert document and chunks in database transaction
    const rows = chunks.map((chunk, i) => ({
      document_id: doc.id,
      content: chunk.content,
      embedding: embeddings[i],
      chunk_index: chunk.chunk_index,
      doc_type: docType,
      metadata: chunk.metadata,
    }));

    // Insert in batches of 100 to stay within Supabase row size limits
    const BATCH_SIZE = 100;
    try {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const { error: insertError } = await supabase.from('chunks').insert(batch);
        
        if (insertError) {
          logError(insertError, { 
            operation: 'insert_chunks', 
            filename: file.name, 
            documentId, 
            batchIndex: i / BATCH_SIZE,
            batchSize: batch.length 
          });
          throw new DatabaseError('Failed to insert chunks', insertError.message);
        }
      }
    } catch (error) {
      // Handle errors with rollback
      logError(error, { operation: 'insert_chunks_transaction', filename: file.name, documentId });
      
      // Rollback: delete document (cascades to chunks)
      await supabase.from('documents').delete().eq('id', documentId);
      
      if (error instanceof DatabaseError) {
        return NextResponse.json(
          { success: false, error: 'Failed to store document chunks - transaction rolled back' },
          { status: 500 }
        );
      }
      throw error;
    }

    // Mark document as ready
    const { error: updateError } = await supabase
      .from('documents')
      .update({ status: 'ready', chunk_count: chunks.length })
      .eq('id', doc.id);

    if (updateError) {
      logError(updateError, { operation: 'update_document_status', filename: file.name, documentId });
      // Document and chunks are inserted, but status update failed
      // This is not critical - document can still be used
    }

    return NextResponse.json({
      success: true,
      document_id: doc.id,
      chunk_count: chunks.length,
    });

  } catch (err) {
    // Handle errors with rollback and descriptive messages
    logError(err, { operation: 'ingest_document', documentId });
    
    // Attempt rollback if we have a document ID
    if (documentId) {
      try {
        await supabase.from('documents').delete().eq('id', documentId);
      } catch (rollbackError) {
        logError(rollbackError, { operation: 'rollback_document', documentId });
      }
    }

    const sanitized = sanitizeError(err);
    return NextResponse.json(
      { success: false, error: sanitized.message },
      { status: 500 }
    );
  }
}
