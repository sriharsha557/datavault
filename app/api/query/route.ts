import { NextRequest } from 'next/server';
import Groq from 'groq-sdk';
import { createServerClient } from '@/lib/supabase';
import { getEmbedding } from '@/lib/embeddings';
import { buildSystemPrompt, buildUserPrompt } from '@/lib/prompt';
import type { QueryRequest, MatchedChunk } from '@/types';

export const maxDuration = 60;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();
      let retrievedChunkIds: string[] = [];
      
      try {
        const body: QueryRequest = await req.json();
        const { query, doc_type_filter, top_k = 12, chat_history = [], similarity_threshold } = body;

        if (!query || query.length > 500) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Invalid query' })}\n\n`));
          controller.close();
          return;
        }

        // 1. Generate query embedding
        const queryEmbedding = await getEmbedding(query);

        // 2. Search for similar chunks
        const supabase = createServerClient();
        const { data: chunks, error } = await supabase.rpc('match_chunks', {
          query_embedding: queryEmbedding,
          match_count: top_k,
          filter_doc_type: doc_type_filter || null,
        });

        if (error || !chunks || chunks.length === 0) {
          // No docs found — answer as general DV assistant without RAG context
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'sources', sources: [] })}\n\n`));
          const fallback = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [
              { role: 'system', content: buildSystemPrompt() },
              { role: 'user', content: query },
            ],
            temperature: 0.3,
            max_tokens: 1024,
            stream: true,
          });
          for await (const chunk of fallback) {
            const token = chunk.choices[0]?.delta?.content || '';
            if (token) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', token })}\n\n`));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', answerSource: 'llm' })}\n\n`));
          controller.close();
          return;
        }

        const matchedChunks = chunks as MatchedChunk[];

        // Apply similarity threshold filter if provided
        let filteredChunks = matchedChunks;
        if (typeof similarity_threshold === 'number') {
          filteredChunks = matchedChunks.filter((c) => c.similarity >= similarity_threshold);
          if (filteredChunks.length === 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'No documents meet the similarity threshold. Try lowering the threshold or rephrasing your query.' })}\n\n`));
            controller.close();
            return;
          }
        }

        retrievedChunkIds = filteredChunks.map((c) => c.id);

        // Apply simple re-ranking: boost chunks with higher similarity and preferred doc types
        const rankedChunks = filteredChunks
          .map((chunk) => {
            let score = chunk.similarity;
            
            // Boost methodology and hub documents slightly
            if (chunk.doc_type === 'methodology') score *= 1.1;
            if (chunk.doc_type === 'hub') score *= 1.05;
            
            // Boost if query contains exact technical terms found in chunk
            const technicalTerms = ['business key', 'satellite', 'hub', 'link', 'pit', 'bridge', 'load date'];
            const queryLower = query.toLowerCase();
            const contentLower = chunk.content.toLowerCase();
            
            for (const term of technicalTerms) {
              if (queryLower.includes(term) && contentLower.includes(term)) {
                score *= 1.15;
                break;
              }
            }
            
            return { ...chunk, rerank_score: score };
          })
          .sort((a, b) => b.rerank_score - a.rerank_score)
          .slice(0, 5); // Keep top 5 after re-ranking — enough context, less noise

        // 3. Send sources to client — deduplicate by filename first (keep best chunk per file),
        // then cap at 3 unique documents shown to user
        const seenFiles = new Map<string, { similarity: number; content: string; doc_type: string }>();
        for (const c of rankedChunks) {
          const existing = seenFiles.get(c.filename);
          if (!existing || c.similarity > existing.similarity) {
            seenFiles.set(c.filename, { similarity: c.similarity, content: c.content, doc_type: c.doc_type });
          }
        }
        const sources = Array.from(seenFiles.entries())
          .sort((a, b) => b[1].similarity - a[1].similarity)
          .slice(0, 3)
          .map(([filename, info]) => ({
            filename,
            doc_type: info.doc_type,
            similarity: info.similarity,
            excerpt: info.content.slice(0, 150) + (info.content.length > 150 ? '...' : ''),
          }));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`));

        // 4. Build prompt and stream LLM response
        const systemPrompt = buildSystemPrompt();
        const userPrompt = buildUserPrompt(query, rankedChunks, chat_history);

        const completion = await groq.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 1024,
          stream: true,
        });

        for await (const chunk of completion) {
          const token = chunk.choices[0]?.delta?.content || '';
          if (token) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', token })}\n\n`));
          }
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', answerSource: 'documents' })}\n\n`));
        controller.close();
        
        // Log query for analytics
        const responseTime = Date.now() - startTime;
        try {
          await supabase.from('query_logs').insert({
            query_text: query,
            retrieved_chunk_ids: retrievedChunkIds,
            response_time_ms: responseTime,
            doc_type_filter: doc_type_filter || null,
            chunks_returned: retrievedChunkIds.length,
          });
        } catch (logErr) {
          console.error('[query] Failed to log query:', logErr);
        }
      } catch (err) {
        console.error('[query] error:', err);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Query processing failed' })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
