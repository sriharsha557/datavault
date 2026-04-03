import type { MatchedChunk } from '@/types';

// ── Step 1: Strict grounding system prompt ────────────────────────────────────
export function buildSystemPrompt(strictMode = true): string {
  if (strictMode) {
    return `You are a Data Vault 2.0 assistant. You answer ONLY from the document context provided.

RULES:
1. Use ONLY the provided context. Do NOT use prior knowledge or training data.
2. If the answer is not explicitly present in the context, respond with exactly:
   "The answer is not available in the provided documents."
3. Do NOT assume, infer, or extrapolate beyond what the context states.
4. Quote or closely follow the document wording when possible.
5. Every claim must be traceable to a source in the context.
6. Use correct Data Vault terminology: Hubs, Links, Satellites, Business Keys, Load Date Stamp, Record Source, Hash Keys.
7. Use markdown (bullet points, bold, code blocks) where it improves clarity.
8. Be concise and precise — no padding or filler.`;
  }

  // Assist mode — can enrich with general DV knowledge
  return `You are a Data Vault 2.0 methodology expert assistant.

RULES:
1. Use the provided document context as your primary source.
2. You may supplement with general Data Vault 2.0 knowledge when context is thin — but clearly distinguish: say "Based on general Data Vault methodology..." when doing so.
3. Never fabricate specific facts, numbers, or quotes not in the context.
4. Use correct Data Vault terminology: Hubs, Links, Satellites, Business Keys, Load Date Stamp, Record Source, Hash Keys.
5. Use markdown (bullet points, bold, code blocks) where it improves clarity.`;
}

// ── Step 3: Definition boosting — expand query with semantic hints ─────────────
const DEFINITION_TRIGGERS = [
  'what is', 'what are', 'define', 'definition', 'explain', 'describe',
  'overview', 'introduction', 'concept', 'meaning', 'purpose',
];

// DV term → expansion phrases that match how books actually write about them
const DV_TERM_EXPANSIONS: Record<string, string> = {
  hub:         'hub is a central table stores unique business keys business entity',
  hubs:        'hub is a central table stores unique business keys business entity',
  link:        'link table relationship association between hubs many-to-many',
  links:       'link table relationship association between hubs many-to-many',
  satellite:   'satellite descriptive attributes context history changes over time',
  satellites:  'satellite descriptive attributes context history changes over time',
  pit:         'point-in-time table performance snapshot satellite joins',
  bridge:      'bridge table multi-active satellite span query performance',
  'business key': 'business key natural key unique identifier source system',
  'hash key':  'hash key surrogate key computed hash business key',
  'load date': 'load date stamp ldts record source audit columns',
  'raw vault': 'raw vault staging area uninterpreted data as-is source',
  'business vault': 'business vault derived calculated soft rules interpretations',
  'data vault': 'data vault 2.0 methodology architecture modeling',
};

export function expandQuery(query: string): string {
  const lower = query.toLowerCase();
  const isDefinitionQuery = DEFINITION_TRIGGERS.some((t) => lower.includes(t));

  // Collect DV-specific expansions for any terms found in the query
  const termExpansions: string[] = [];
  for (const [term, expansion] of Object.entries(DV_TERM_EXPANSIONS)) {
    if (lower.includes(term)) {
      termExpansions.push(expansion);
    }
  }

  const parts = [query];
  if (isDefinitionQuery) parts.push('definition overview introduction purpose');
  if (termExpansions.length > 0) parts.push(...termExpansions);

  return parts.join(' ');
}

// ── Step 6: User prompt with forced citations ─────────────────────────────────
export function buildUserPrompt(
  query: string,
  chunks: MatchedChunk[],
  chatHistory: Array<{ role: string; content: string }>,
  strictMode = true,
): string {
  // Deduplicate chunks by content prefix
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
        `[Source ${i + 1}: ${c.filename}${c.doc_type ? ` (${c.doc_type})` : ''} — Relevance: ${Math.round(c.similarity * 100)}%]\n${c.content}`
    )
    .join('\n\n---\n\n');

  const historyBlock =
    chatHistory.length > 0
      ? `Previous conversation:\n${chatHistory
          .slice(-6)
          .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n')}\n\n`
      : '';

  if (strictMode) {
    return `${historyBlock}DOCUMENT CONTEXT:
${contextBlock}

QUESTION: ${query}

INSTRUCTIONS:
- Answer using ONLY the document context above.
- Write a clear, natural answer — do NOT start every sentence with "According to Source N".
- Add a single inline citation only when introducing a key fact, e.g. "Data Vault 2.0 is... [Source 1]".
- Synthesize across sources into one coherent answer rather than listing each source separately.
- If the context does not contain the answer, respond: "The answer is not available in the provided documents."
- Do NOT use any knowledge outside the provided context.`;
  }

  // Assist mode prompt
  return `${historyBlock}DOCUMENT CONTEXT:
${contextBlock}

QUESTION: ${query}

Use the document context as your primary source. Reference sources where possible (e.g. "According to Source 1..."). If context is thin, you may supplement with general Data Vault 2.0 knowledge — clearly label it as such.`;
}
