import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const maxDuration = 60;

// OCR.space API endpoint
const OCR_API_URL = 'https://api.ocr.space/parse/image';

async function extractTextOCR(file: File): Promise<string> {
  const apiKey = process.env.OCR_SPACE_KEY;
  
  if (!apiKey) {
    throw new Error('OCR_SPACE_KEY not configured');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('apikey', apiKey);
  formData.append('language', 'eng');
  formData.append('isOverlayRequired', 'false');
  formData.append('detectOrientation', 'true');
  formData.append('scale', 'true');
  formData.append('OCREngine', '2');

  const response = await fetch(OCR_API_URL, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`OCR API error: ${response.status}`);
  }

  const result = await response.json();

  if (result.IsErroredOnProcessing) {
    throw new Error(result.ErrorMessage || 'OCR processing failed');
  }

  if (!result.ParsedResults || result.ParsedResults.length === 0) {
    throw new Error('No text extracted from image');
  }

  return result.ParsedResults[0].ParsedText;
}

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

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: PNG, JPG, GIF, PDF' },
        { status: 400 }
      );
    }

    // Validate file size (16MB max)
    if (file.size > 16 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large. Maximum size: 16MB' },
        { status: 400 }
      );
    }

    // Extract text via OCR
    const extractedText = await extractTextOCR(file);

    // Store in Supabase
    const supabase = createServerClient();
    
    const { data, error } = await supabase
      .from('ocr_results')
      .insert({
        filename: file.name,
        extracted_text: extractedText,
      })
      .select()
      .single();

    if (error) {
      console.error('[modeler/upload] Database error:', error);
      return NextResponse.json(
        { error: 'Failed to store OCR result' },
        { status: 500 }
      );
    }

    // Return preview of extracted text (first 500 chars)
    const preview = extractedText.length > 500 
      ? extractedText.slice(0, 500) + '...' 
      : extractedText;

    return NextResponse.json({
      success: true,
      ocr_id: data.id,
      extracted_text: preview,
    });

  } catch (error: any) {
    console.error('[modeler/upload] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}
