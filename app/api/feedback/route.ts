import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { message_id, query, response, helpful } = await req.json();

    if (!message_id || !query || !response || typeof helpful !== 'boolean') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createServerClient();
    const { error } = await supabase.from('feedback').insert({
      message_id,
      query,
      response,
      helpful,
    });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[feedback] error:', err);
    return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 });
  }
}
