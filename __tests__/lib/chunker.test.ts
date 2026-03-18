import { splitIntoChunks, inferDocType } from '@/lib/chunker';
import fc from 'fast-check';

describe('Document Chunker', () => {
  describe('splitIntoChunks', () => {
    it('should create at least one chunk for any document', () => {
      const text = 'This is a test document with some content.';
      const chunks = splitIntoChunks(text);
      
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('should create chunks within size bounds', () => {
      const text = 'Lorem ipsum dolor sit amet, '.repeat(100);
      const chunks = splitIntoChunks(text);
      
      chunks.forEach((chunk) => {
        expect(chunk.content.length).toBeGreaterThanOrEqual(40);
        expect(chunk.content.length).toBeLessThanOrEqual(1400); // CHUNK_SIZE is 1400
      });
    });

    it('should assign sequential chunk indices', () => {
      const text = 'Test content. '.repeat(200);
      const chunks = splitIntoChunks(text);
      
      chunks.forEach((chunk, idx) => {
        expect(chunk.chunk_index).toBe(idx);
      });
    });

    it('should include metadata in chunks', () => {
      const text = 'Test document content.';
      const metadata = { document_id: 'test-123', filename: 'test.pdf' };
      const chunks = splitIntoChunks(text, metadata);
      
      chunks.forEach((chunk) => {
        expect(chunk.metadata).toMatchObject(metadata);
      });
    });

    it('should preserve sentence boundaries when possible', () => {
      const text = 'First sentence. Second sentence. Third sentence. Fourth sentence. '.repeat(20);
      const chunks = splitIntoChunks(text);
      
      // Most chunks should end with sentence terminators (. ! ?)
      const chunksEndingWithSentence = chunks.filter(chunk => 
        /[.!?]\s*$/.test(chunk.content.trim())
      );
      
      // At least 70% of chunks should respect sentence boundaries
      expect(chunksEndingWithSentence.length / chunks.length).toBeGreaterThan(0.7);
    });

    it('should handle empty documents', () => {
      const text = '';
      const chunks = splitIntoChunks(text);
      
      // Empty documents should produce no chunks
      expect(chunks.length).toBe(0);
    });

    it('should handle very short documents (single sentence)', () => {
      const text = 'This is a single short sentence.';
      const chunks = splitIntoChunks(text);
      
      // Short documents (< 40 chars) produce no chunks due to minimum size requirement
      expect(chunks.length).toBe(0);
    });

    it('should handle very long documents', () => {
      // Create a document with ~50,000 characters
      const text = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(1000);
      const chunks = splitIntoChunks(text);
      
      // Should create multiple chunks
      expect(chunks.length).toBeGreaterThan(30);
      
      // All chunks should be within size bounds (CHUNK_SIZE is 1400)
      chunks.forEach((chunk) => {
        expect(chunk.content.length).toBeLessThanOrEqual(1400);
      });
    });

    it('should associate page numbers with chunks when provided', () => {
      const text = 'Page 1 content. '.repeat(50) + 'Page 2 content. '.repeat(50);
      const pageNumbers = new Map<number, number>([
        [0, 1],
        [800, 2], // Page 2 starts at character 800
      ]);
      
      const chunks = splitIntoChunks(text, {}, { pageNumbers });
      
      // Verify that chunks have page number information in metadata
      const chunksWithPageNumbers = chunks.filter(chunk => 
        chunk.metadata?.page_number !== undefined
      );
      
      expect(chunksWithPageNumbers.length).toBeGreaterThan(0);
    });

    it('should handle documents with only whitespace', () => {
      const text = '   \n\n\t\t   ';
      const chunks = splitIntoChunks(text);
      
      // Whitespace-only documents should produce no chunks
      expect(chunks.length).toBe(0);
    });

    it('should handle documents with special characters', () => {
      const text = 'Test with émojis 🎉 and spëcial çharacters. '.repeat(30);
      const chunks = splitIntoChunks(text);
      
      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach((chunk) => {
        expect(chunk.content.length).toBeGreaterThan(0);
      });
    });
  });

  describe('inferDocType', () => {
    it('should infer hub type from filename', () => {
      expect(inferDocType('customer_hub.pdf')).toBe('hub');
      expect(inferDocType('HUB_definition.md')).toBe('hub');
    });

    it('should infer link type from filename', () => {
      expect(inferDocType('customer_order_link.pdf')).toBe('link');
      expect(inferDocType('LINK_patterns.md')).toBe('link');
    });

    it('should infer satellite type from filename', () => {
      expect(inferDocType('customer_satellite.pdf')).toBe('satellite');
      expect(inferDocType('sat_details.md')).toBe('satellite');
    });

    it('should infer methodology type from filename', () => {
      expect(inferDocType('dv_methodology.pdf')).toBe('methodology');
      expect(inferDocType('standards_guide.md')).toBe('methodology');
    });

    it('should default to general for unknown types', () => {
      expect(inferDocType('random_document.pdf')).toBe('general');
      expect(inferDocType('notes.txt')).toBe('general');
    });
  });
});

// Feature: data-vault-knowledge-assistant, Property 11: Minimum Chunk Count
describe('Property: Minimum Chunk Count', () => {
  it('should create at least one chunk for any document with meaningful content', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 40, maxLength: 10000 }).filter(s => s.trim().length >= 40),
        (text) => {
          const chunks = splitIntoChunks(text);
          expect(chunks.length).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
