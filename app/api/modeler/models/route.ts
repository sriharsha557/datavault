import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('dv_models')
      .select(`
        id,
        ocr_id,
        grounded,
        created_at,
        ocr_results (
          filename
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[modeler/models] Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch models' },
        { status: 500 }
      );
    }

    // Transform data to match expected format
    const models = data.map((model: any) => ({
      id: model.id,
      ocr_id: model.ocr_id,
      filename: model.ocr_results?.filename || 'Unknown',
      grounded: model.grounded,
      created_at: model.created_at,
    }));

    return NextResponse.json({ models });

  } catch (error: any) {
    console.error('[modeler/models] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch models' },
      { status: 500 }
    );
  }
}
