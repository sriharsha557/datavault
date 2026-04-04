import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Validate file type (text files only)
    const allowedTypes = ['text/plain', 'text/markdown', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: TXT, MD, PDF' },
        { status: 400 }
      );
    }

    // Read file content
    const content = await file.text();

    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'File is empty' },
        { status: 400 }
      );
    }

    // Store in Supabase
    const supabase = createServerClient();

    const { error } = await supabase
      .from('knowledge_docs')
      .insert({
        name: file.name,
        content,
      });

    if (error) {
      console.error('[modeler/knowledge] Database error:', error);
      return NextResponse.json(
        { error: 'Failed to store knowledge document' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Knowledge document uploaded successfully',
    });

  } catch (error: any) {
    console.error('[modeler/knowledge] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}
