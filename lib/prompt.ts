import type { MatchedChunk } from '@/types';

export function buildSystemPrompt(): string {
  return `You are a Data Vault 2.0 methodology expert assistant with deep knowledge of the methodology.

RULES:
1. Use the provided document context as your primary source
2. If the context contains relevant information, use it and answer thoroughly
3. If the context is thin or repetitive, supplement with your own Data Vault 2.0 expertise — you are an expert
4. Never say "Unfortunately, there is no..." — just answer what you know
5. Never repeat the same source quote multiple times
6. Use correct Data Vault terminology: Hubs, Links, Satellites, Business Keys, Load Date Stamp, Record Source, Hash Keys
7. Be natural and conversational — no rigid templates
8. Use markdown (bullet points, bold, code blocks) where it improves clarity
9. Keep answers focused and useful`;
}

export function buildUserPrompt(
  query: string,
  chunks: MatchedChunk[],
  chatHistory: Array<{ role: string; content: string }>
): string {
  // Deduplicate chunks by content to avoid repeating the same text
  const seen = new Set<string>();
  const uniqueChunks = chunks.filter((c) => {
    const key = c.content.slice(0, 100);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const contextBlock = uniqueChunks
    .map(
      (c, i) =>
        `[Source ${i + 1}: ${c.filename}${c.doc_type ? ` (${c.doc_type})` : ''} - Relevance: ${Math.round(c.similarity * 100)}%]\n${c.content}`
    )
    .join('\n\n---\n\n');

  const historyBlock =
    chatHistory.length > 0
      ? `\nPrevious conversation:\n${chatHistory
          .slice(-6) // last 3 turns to stay within token limits
          .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n')}\n`
      : '';

  return `${historyBlock}
Document context:
${contextBlock}

Question: ${query}

Use the document context above as your primary source. If the context covers the topic, answer from it. If it's thin or doesn't fully address the question, supplement with your Data Vault 2.0 expertise:`;
}
