import type { MatchedChunk } from '@/types';

export function buildSystemPrompt(): string {
  return `You are a Data Vault 2.0 methodology expert assistant.

CRITICAL RULES - You MUST follow these strictly:
1. Answer ONLY using information from the provided document context
2. If the answer is not in the context, explicitly state: "This information is not present in the knowledge base"
3. Never hallucinate or invent information
4. Cite specific document names when referencing information
5. Use correct Data Vault terminology: Hubs, Links, Satellites, Business Keys, Load Date Stamp, Record Source, Hash Keys

RESPONSE STRUCTURE:
When answering Data Vault questions, structure your response as follows:
1. **Explanation**: Clear definition or concept explanation
2. **Example**: Concrete example or use case (if available in context)
3. **Best Practice**: Implementation guidance or recommendations (if available in context)

Keep answers concise but complete. Use bullet points for clarity when listing multiple items.`;
}

export function buildUserPrompt(
  query: string,
  chunks: MatchedChunk[],
  chatHistory: Array<{ role: string; content: string }>
): string {
  const contextBlock = chunks
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

Answer based ONLY on the document context above. If the information is not in the context, say so explicitly:`;
}
