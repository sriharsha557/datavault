import { NextRequest } from 'next/server';
import Groq from 'groq-sdk';
import { createServerClient } from '@/lib/supabase';
import { getEmbedding } from '@/lib/embeddings';
import { buildSystemPrompt, buildUserPrompt } from '@/lib/prompt';
import type { QueryRequest, MatchedChunk } from '@/types';

export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body: QueryRequest = await req.json();
    const { query, doc_type_filter, top_k = 5, chat_history = [] } = body;
    if (!query?.trim()) return new Response(JSON.stringify({ error: 'Query is required' }), { status: 400 });

    const supabase = createServerClient();
    const queryEmbedding = await getEmbedding(query);

    const { data: chunks, error } = await supabase.rpc('match_chunks', {
      query_embedding: queryEmbedding,
      match_count: top_k,
      filter_doc_type: doc_type_filter || null,
    });
    if (error) throw error;

    const matchedChunks = (chunks as MatchedChunk[]) || [];
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(query, matchedChunks, chat_history);

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const stream = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      max_tokens: 1500,
      temperature: 0.3,
      stream: true,
    });

    const sources = matchedChunks.map((c) => ({
      filename: c.filename,
      doc_type: c.doc_type,
      similarity: Math.round(c.similarity * 100) / 100,
      excerpt: c.content.slice(0, 180) + (c.content.length > 180 ? '...' : ''),
    }));

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`));
        for await (const chunk of stream) {
          const token = chunk.choices[0]?.delta?.content ?? '';
          if (token) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', token })}\n\n`));
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Error' }), { status: 500 });
  }
}
