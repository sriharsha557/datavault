import { NextRequest } from 'next/server';
import Groq from 'groq-sdk';
import { createServerClient } from '@/lib/supabase';
import { getEmbedding } from '@/lib/embeddings';
import { buildSystemPrompt, buildUserPrompt, expandQuery } from '@/lib/prompt';
import type { QueryRequest, MatchedChunk } from '@/types';

export const maxDuration = 60;

// Step 7: Minimum similarity to attempt an answer — below this, return fallback
const WEAK_RETRIEVAL_THRESHOLD = 0.15;

// Initialize Groq client with validation
function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY environment variable is not set');
  }
  return new Groq({ apiKey });
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();
      let retrievedChunkIds: string[] = [];

      try {
        const body: QueryRequest = await req.json();
        const {
          query,
          doc_type_filter,
          top_k = 8,           // Step 4: fetch 8, re-rank to top 5
          chat_history = [],
          similarity_threshold,
          strict_mode = true,  // Step 5: strict by default
        } = body;

        if (!query || query.length > 500) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Invalid query' })}\n\n`));
          controller.close();
          return;
        }

        // Step 3: Expand query with definition hints if applicable
        const expandedQuery = expandQuery(query);

        // 1. Generate query embedding (use expanded query for retrieval)
        let queryEmbedding: number[];
        try {
          queryEmbedding = await getEmbedding(expandedQuery);
        } catch (embErr: any) {
          console.error('[query] Embedding generation failed:', embErr.message);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            error: 'Failed to generate query embedding. Please try again.' 
          })}\n\n`));
          controller.close();
          return;
        }
        
        // Validate embedding dimensions (should never fail after retry logic, but double-check)
        if (!queryEmbedding || queryEmbedding.length !== 384) {
          console.error('[query] Invalid embedding dimensions after retries:', queryEmbedding?.length);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            error: 'Embedding validation failed. Please try again.' 
          })}\n\n`));
          controller.close();
          return;
        }

        // 2. Search for similar chunks
        const supabase = createServerClient();

        // Debug: Log embedding details
        console.log('[query] Embedding type:', typeof queryEmbedding, 'isArray:', Array.isArray(queryEmbedding));
        console.log('[query] Embedding length:', queryEmbedding.length);
        console.log('[query] First 3 values:', queryEmbedding.slice(0, 3));

        // Send embedding as JSON array (PostgREST converts to jsonb)
        const { data: rpcData, error: rpcError } = await supabase.rpc('match_chunks', {
          query_embedding: queryEmbedding,
          match_count: top_k,
          filter_doc_type: doc_type_filter ?? null,
        });

        console.log('[query] chunks:', rpcData?.length ?? 0, 'err:', rpcError?.message ?? 'none');
        if (rpcError) console.error('[query] RPC error details:', rpcError);
        if (rpcData?.length) console.log('[query] sims:', (rpcData as MatchedChunk[]).slice(0,3).map((c:MatchedChunk) => c.similarity?.toFixed(3)));

        const chunks = rpcData as MatchedChunk[] | null;
        const error = rpcError;

        if (error || !chunks || chunks.length === 0) {
          // No docs found at all
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'sources', sources: [] })}\n\n`));

          if (strict_mode) {
            // Strict: refuse to answer without context
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', token: 'The answer is not available in the provided documents.' })}\n\n`));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', answerSource: 'none' })}\n\n`));
          } else {
            // Assist mode: fall back to LLM general knowledge
            const groq = getGroqClient();
            const fallback = await groq.chat.completions.create({
              model: 'llama-3.1-8b-instant',
              messages: [
                { role: 'system', content: buildSystemPrompt(false) },
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
          }
          controller.close();
          return;
        }

        const matchedChunks = chunks as MatchedChunk[];

        // Apply explicit similarity threshold filter if provided
        let filteredChunks = matchedChunks;
        if (typeof similarity_threshold === 'number') {
          filteredChunks = matchedChunks.filter((c) => c.similarity >= similarity_threshold);
          if (filteredChunks.length === 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'No documents meet the similarity threshold. Try lowering the threshold or rephrasing your query.' })}\n\n`));
            controller.close();
            return;
          }
        }

        // Step 7: Detect weak retrieval — best raw similarity is below minimum confidence
        // Use raw similarity here, NOT rerank score, to avoid false negatives
        const bestSimilarity = filteredChunks[0]?.similarity ?? 0;
        if (bestSimilarity < WEAK_RETRIEVAL_THRESHOLD) {
          // Soft fallback: show what we have with a caveat rather than hard refusal
          const softChunks = filteredChunks.slice(0, 3);
          const softSources = softChunks.map((c) => ({
            filename: c.filename,
            doc_type: c.doc_type,
            similarity: c.similarity,
            excerpt: c.content.slice(0, 150) + (c.content.length > 150 ? '...' : ''),
          }));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'sources', sources: softSources })}\n\n`));

          if (strict_mode) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', token: 'The answer is not available in the provided documents.' })}\n\n`));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', answerSource: 'none' })}\n\n`));
          } else {
            // Assist mode: answer from general knowledge with disclaimer
            const groq = getGroqClient();
            const fallback = await groq.chat.completions.create({
              model: 'llama-3.1-8b-instant',
              messages: [
                { role: 'system', content: buildSystemPrompt(false) },
                { role: 'user', content: `The document index has low-confidence matches for this query. Answer from general Data Vault 2.0 knowledge and clearly note this is from general knowledge, not the indexed documents.\n\nQuery: ${query}` },
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
          }
          controller.close();
          return;
        }

        retrievedChunkIds = filteredChunks.map((c) => c.id);

        // Step 4: Re-rank — boost substantive content, penalize TOC/heading noise, keep top 5
        // NOTE: rerank_score is used ONLY for ordering, never for threshold checks
        const rankedChunks = filteredChunks
          .map((chunk) => {
            // Start from a quality score independent of similarity
            let qualityBoost = 1.0;
            const text = chunk.content;

            // ── Penalize TOC / heading-only chunks ───────────────────────────
            const tocPatterns = [
              /table of contents/i,
              /^\s*chapter\s+\d+[\s.:]/im,
              /^\s*\d+\.\d+(\.\d+)?\s+[A-Z]/m,
              /^\s*abstract\s+\d+/im,
            ];
            if (tocPatterns.some((p) => p.test(text))) qualityBoost *= 0.3;
            if (text.length < 150) qualityBoost *= 0.5;

            // ── Boost substantive content ────────────────────────────────────
            const sentenceCount = (text.match(/[.!?]\s/g) || []).length;
            if (sentenceCount >= 3) qualityBoost *= 1.2;
            if (sentenceCount >= 6) qualityBoost *= 1.1;

            if (/\b(is defined as|refers to|is a|are used to|consists of|contains|stores|is used to|represents|captures|tracks)\b/i.test(text)) {
              qualityBoost *= 1.35;  // stronger boost for definition language
            }
            // Extra boost for chunks that directly answer "what is X" style queries
            if (/\b(a hub is|a link is|a satellite is|data vault is|defined as|the purpose of)\b/i.test(text)) {
              qualityBoost *= 1.2;
            }
            if (text.length > 400) qualityBoost *= 1.1;
            if (text.length > 800) qualityBoost *= 1.05;
            // ── Doc type + term match boosts ─────────────────────────────────
            if (chunk.doc_type === 'methodology') qualityBoost *= 1.1;
            if (chunk.doc_type === 'hub') qualityBoost *= 1.05;

            const technicalTerms = ['business key', 'satellite', 'hub', 'link', 'pit', 'bridge', 'load date', 'hash key', 'record source'];
            const queryLower = query.toLowerCase();
            const lower = text.toLowerCase();
            for (const term of technicalTerms) {
              if (queryLower.includes(term) && lower.includes(term)) {
                qualityBoost *= 1.15;
                break;
              }
            }

            // rerank_score combines similarity + quality — used for ordering only
            return { ...chunk, rerank_score: chunk.similarity * qualityBoost };
          })
          .sort((a, b) => b.rerank_score - a.rerank_score)
          .slice(0, 5);

        // 3. Deduplicate sources by filename — one entry per document, best chunk wins
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
        const systemPrompt = buildSystemPrompt(strict_mode);
        const userPrompt = buildUserPrompt(query, rankedChunks, chat_history, strict_mode);

        const groq = getGroqClient();
        const completion = await groq.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: strict_mode ? 0.1 : 0.3, // lower temp in strict mode = less creativity
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
