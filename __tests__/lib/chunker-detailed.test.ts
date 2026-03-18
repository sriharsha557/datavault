import { splitIntoChunks } from '@/lib/chunker';

describe('Chunker - Detailed Tests', () => {
  it('should properly chunk a 2500 character document with correct overlap', () => {
    const text = 'This is a test sentence. '.repeat(100); // ~2500 characters
    
    console.log('Text length:', text.length);
    
    const chunks = splitIntoChunks(text);
    
    console.log('Generated chunks:', chunks.length);
    
    // Should create approximately 3-4 chunks
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.length).toBeLessThanOrEqual(5);
    
    // Check each chunk
    chunks.forEach((chunk, i) => {
      console.log(`Chunk ${i}: start=${chunk.startOffset}, end=${chunk.endOffset}, len=${chunk.content.length}`);
      
      // Chunk should be within size bounds
      expect(chunk.content.length).toBeGreaterThanOrEqual(40);
      expect(chunk.content.length).toBeLessThanOrEqual(1000);
      
      // Chunk index should match
      expect(chunk.chunk_index).toBe(i);
    });
    
    // Check overlap between consecutive chunks
    for (let i = 0; i < chunks.length - 1; i++) {
      const chunk1End = chunks[i].endOffset;
      const chunk2Start = chunks[i + 1].startOffset;
      const overlap = chunk1End - chunk2Start;
      
      console.log(`Overlap between chunks ${i} and ${i+1}: ${overlap} chars`);
      
      // Overlap should be within the expected range (100-200 chars)
      expect(overlap).toBeGreaterThanOrEqual(100);
      expect(overlap).toBeLessThanOrEqual(200);
    }
  });
  
  it('should include startOffset and endOffset in chunk metadata', () => {
    const text = 'A'.repeat(2000);
    const chunks = splitIntoChunks(text);
    
    chunks.forEach(chunk => {
      expect(chunk).toHaveProperty('startOffset');
      expect(chunk).toHaveProperty('endOffset');
      expect(typeof chunk.startOffset).toBe('number');
      expect(typeof chunk.endOffset).toBe('number');
      expect(chunk.endOffset).toBeGreaterThan(chunk.startOffset);
    });
  });
  
  it('should associate chunks with page numbers when provided', () => {
    const text = 'A'.repeat(2000);
    const pageNumbers = new Map<number, number>();
    pageNumbers.set(0, 1);
    pageNumbers.set(1000, 2);
    
    const chunks = splitIntoChunks(text, {}, { pageNumbers });
    
    // First chunk should be on page 1
    expect(chunks[0].metadata.page_number).toBe(1);
    
    // Later chunks should be on page 2
    const lastChunk = chunks[chunks.length - 1];
    if (lastChunk.startOffset >= 1000) {
      expect(lastChunk.metadata.page_number).toBe(2);
    }
  });
});
