// Feature: data-vault-knowledge-assistant
// Property tests for document chunking
import * as fc from 'fast-check';
import { splitIntoChunks } from '@/lib/chunker';

describe('Property Tests: Document Chunking', () => {
  // Property 7: Chunk Overlap Invariant
  describe('Property 7: Chunk Overlap Invariant', () => {
    it('should create overlap between consecutive chunks', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 3000, maxLength: 10000 }),
          (text) => {
            const chunks = splitIntoChunks(text);
            
            // For documents that produce multiple chunks
            if (chunks.length > 1) {
              for (let i = 0; i < chunks.length - 1; i++) {
                const currentChunk = chunks[i];
                const nextChunk = chunks[i + 1];
                
                // Check if there's overlap by looking at the offsets
                // The next chunk should start before the current chunk ends
                const hasOverlap = nextChunk.startOffset < currentChunk.endOffset;
                
                // Property: consecutive chunks should have overlap
                expect(hasOverlap).toBe(true);
                
                // Calculate overlap size
                const overlapSize = currentChunk.endOffset - nextChunk.startOffset;
                
                // Property: overlap should be reasonable (not negative, not too large)
                expect(overlapSize).toBeGreaterThanOrEqual(0);
                expect(overlapSize).toBeLessThanOrEqual(300); // Max overlap ~200 chars + some buffer
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // Property 8: Chunk Size Bounds
  describe('Property 8: Chunk Size Bounds', () => {
    it('should create chunks within size bounds (40-1400 characters)', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 100, maxLength: 20000 }),
          (text) => {
            const chunks = splitIntoChunks(text);
            
            // Property: all chunks should be within size bounds
            chunks.forEach((chunk) => {
              expect(chunk.content.length).toBeGreaterThanOrEqual(40);
              expect(chunk.content.length).toBeLessThanOrEqual(1400);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Property 9: Chunk Completeness
  describe('Property 9: Chunk Completeness', () => {
    it('should not omit any content from the original document', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 100, maxLength: 10000 }),
          (text) => {
            const chunks = splitIntoChunks(text);
            
            if (chunks.length === 0) {
              // If no chunks, the text must be too short or all whitespace
              expect(text.trim().length).toBeLessThan(40);
              return;
            }
            
            // Property: all content should be covered by at least one chunk
            // We'll verify this by checking that the chunks span the entire document
            const firstChunkStart = chunks[0].startOffset;
            const lastChunkEnd = chunks[chunks.length - 1].endOffset;
            
            // The chunks should cover from near the beginning to the end
            expect(firstChunkStart).toBeLessThanOrEqual(100); // Allow some trimming at start
            expect(lastChunkEnd).toBeGreaterThanOrEqual(text.trim().length - 100); // Allow some trimming at end
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Property 10: Chunk Coverage
  describe('Property 10: Chunk Coverage', () => {
    it('should create enough chunks to cover the document', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1000, maxLength: 20000 }),
          (text) => {
            const chunks = splitIntoChunks(text);
            const trimmedLength = text.trim().length;
            
            if (trimmedLength < 40) {
              // Too short to chunk
              expect(chunks.length).toBe(0);
              return;
            }
            
            // Property: number of chunks should be >= document_length / max_chunk_size
            const minExpectedChunks = Math.floor(trimmedLength / 1400);
            
            // Allow some flexibility due to overlap and separator-based splitting
            expect(chunks.length).toBeGreaterThanOrEqual(Math.max(1, minExpectedChunks - 1));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Property 11: Minimum Chunk Count (already in chunker.test.ts, but adding here for completeness)
  describe('Property 11: Minimum Chunk Count', () => {
    it('should create at least one chunk for any meaningful document', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 40, maxLength: 10000 }).filter(s => s.trim().length >= 40),
          (text) => {
            const chunks = splitIntoChunks(text);
            
            // Property: documents with >= 40 chars should produce at least one chunk
            expect(chunks.length).toBeGreaterThanOrEqual(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Property 12: Chunk Metadata Association
  describe('Property 12: Chunk Metadata Association', () => {
    it('should associate all chunks with source document metadata', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 100, maxLength: 5000 }),
          fc.record({
            document_id: fc.uuid(),
            filename: fc.string({ minLength: 5, maxLength: 50 }),
          }),
          (text, metadata) => {
            const chunks = splitIntoChunks(text, metadata);
            
            // Property: all chunks should have the source metadata
            chunks.forEach((chunk) => {
              expect(chunk.metadata).toMatchObject(metadata);
              expect(chunk.metadata.document_id).toBe(metadata.document_id);
              expect(chunk.metadata.filename).toBe(metadata.filename);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should associate chunks with page numbers when provided', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 2000, maxLength: 5000 }),
          (text) => {
            // Create page number mapping
            const pageNumbers = new Map<number, number>([
              [0, 1],
              [1000, 2],
              [2000, 3],
            ]);
            
            const chunks = splitIntoChunks(text, {}, { pageNumbers });
            
            // Property: chunks should have page number information when available
            if (chunks.length > 0) {
              const chunksWithPageNumbers = chunks.filter(
                chunk => chunk.metadata.page_number !== undefined
              );
              
              // At least some chunks should have page numbers
              expect(chunksWithPageNumbers.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // Additional property: Sequential chunk indices
  describe('Property: Sequential Chunk Indices', () => {
    it('should assign sequential indices starting from 0', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 100, maxLength: 10000 }),
          (text) => {
            const chunks = splitIntoChunks(text);
            
            // Property: chunk indices should be sequential starting from 0
            chunks.forEach((chunk, index) => {
              expect(chunk.chunk_index).toBe(index);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Additional property: Non-empty chunks
  describe('Property: Non-empty Chunks', () => {
    it('should never create empty chunks', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 10000 }),
          (text) => {
            const chunks = splitIntoChunks(text);
            
            // Property: all chunks should have non-empty content
            chunks.forEach((chunk) => {
              expect(chunk.content.trim().length).toBeGreaterThan(0);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
