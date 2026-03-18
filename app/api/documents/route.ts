import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { DatabaseError, sanitizeError, logError } from '@/lib/errors';
import type { Document } from '@/types';

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      logError(error, { operation: 'list_documents' });
      throw new DatabaseError('Failed to fetch documents', error.message);
    }

    return NextResponse.json(data as Document[]);
  } catch (err) {
    logError(err, { operation: 'list_documents' });
    const sanitized = sanitizeError(err);
    return NextResponse.json(
      { error: sanitized.message, code: sanitized.code },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    
    if (!id) {
      return NextResponse.json(
        { error: 'Document ID required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    
    // Delete document (chunks will cascade delete due to foreign key)
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id);

    if (error) {
      logError(error, { operation: 'delete_document', documentId: id });
      throw new DatabaseError('Failed to delete document', error.message);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError(err, { operation: 'delete_document' });
    const sanitized = sanitizeError(err);
    return NextResponse.json(
      { error: sanitized.message, code: sanitized.code },
      { status: 500 }
    );
  }
}
