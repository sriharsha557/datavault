import type { DocType } from '@/types';
import { getPageNumber } from './extractor';

export interface TextChunk {
  content: string;
  chunk_index: number;
  startOffset: number;
  endOffset: number;
  metadata: Record<string, unknown>;
}

export interface ChunkingOptions {
  pageNumbers?: Map<number, number>; // char offset → page number
  [key: string]: unknown;
}

// DV2.0-aware separators: respect document structure headers before falling back
const DV_SEPARATORS = [
  '\n## ',   // H2 markdown headers (hub/link/sat definitions)
  '\n### ',  // H3 sub-sections
  '\n#### ',
  '\n\n',    // Paragraph breaks
  '\n',
  '. ',      // Sentence boundaries
  ' ',
];

const CHUNK_SIZE = 1400;    // Larger chunks for technical documentation (1200-1500 range)
const CHUNK_OVERLAP = 200;  // ~14% overlap to preserve context across boundaries

export function splitIntoChunks(
  text: string,
  metadata: Record<string, unknown> = {},
  options: ChunkingOptions = {}
): TextChunk[] {
  const trimmedText = text.trim();
  const chunks: TextChunk[] = [];
  
  let startOffset = 0;
  let chunkIndex = 0;

  while (startOffset < trimmedText.length) {
    // Determine the end of this chunk (target size from start)
    let endOffset = Math.min(startOffset + CHUNK_SIZE, trimmedText.length);
    
    // If we're not at the end of the text, try to find a good break point
    if (endOffset < trimmedText.length) {
      let bestBreak = endOffset;
      
      // Try each separator in order of preference
      for (const separator of DV_SEPARATORS) {
        // Look for the separator within the chunk
        const searchStart = startOffset;
        const searchEnd = endOffset;
        const chunkText = trimmedText.substring(searchStart, searchEnd);
        const lastSepIndex = chunkText.lastIndexOf(separator);
        
        if (lastSepIndex !== -1) {
          // Found a separator, use it as the break point
          bestBreak = searchStart + lastSepIndex + separator.length;
          break;
        }
      }
      
      endOffset = bestBreak;
    }
    
    // Extract the chunk content
    const content = trimmedText.substring(startOffset, endOffset);
    
    // Skip chunks that are too small (less than 40 characters)
    if (content.trim().length >= 40) {
      // Calculate page number for this chunk if page metadata is available
      const pageNumber = options.pageNumbers 
        ? getPageNumber(startOffset, options.pageNumbers)
        : undefined;
      
      const chunkMetadata = { ...metadata };
      if (pageNumber !== undefined) {
        chunkMetadata.page_number = pageNumber;
      }
      
      chunks.push({
        content: content.trim(),
        chunk_index: chunkIndex,
        startOffset,
        endOffset,
        metadata: chunkMetadata,
      });
      
      chunkIndex++;
    }
    
    // Move to the next chunk with overlap
    // If we just processed the last chunk (reached the end), stop
    if (endOffset >= trimmedText.length) {
      break;
    }
    
    // Move forward by (chunk_size - overlap)
    startOffset = endOffset - CHUNK_OVERLAP;
    
    // Ensure we make progress (at least 1 character forward from previous start)
    if (startOffset <= chunks[chunks.length - 1]?.startOffset) {
      startOffset = (chunks[chunks.length - 1]?.startOffset || 0) + 1;
    }
  }

  return chunks;
}

// Infer Data Vault document type from filename
export function inferDocType(filename: string): DocType {
  const lower = filename.toLowerCase();
  if (lower.includes('hub')) return 'hub';
  if (lower.includes('link')) return 'link';
  if (lower.includes('sat') || lower.includes('satellite')) return 'satellite';
  if (lower.includes('pit') || lower.includes('bridge')) return 'pit_bridge';
  if (lower.includes('method') || lower.includes('standard') || lower.includes('guide')) return 'methodology';
  return 'general';
}
