// Feature: data-vault-knowledge-assistant, Property 4: Text Extraction Completeness
import * as fc from 'fast-check';
import { extractText } from '@/lib/extractor';

describe('Property Tests: Text Extraction', () => {
  describe('Property 4: Text Extraction Completeness', () => {
    it('should preserve all text content for plain text files (no loss or addition)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 0, maxLength: 10000 }),
          async (originalText) => {
            // Create a mock File object with the text content
            const buffer = Buffer.from(originalText, 'utf-8');
            const file = {
              name: 'test.txt',
              arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
            } as File;

            // Extract text
            const result = await extractText(file);

            // Property: extracted text should equal original text (no loss, no addition)
            expect(result.text).toBe(originalText);
            expect(result.text.length).toBe(originalText.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve all text content for markdown files', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 0, maxLength: 10000 }),
          async (originalText) => {
            const buffer = Buffer.from(originalText, 'utf-8');
            const file = {
              name: 'test.md',
              arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
            } as File;

            const result = await extractText(file);

            // Property: extracted text should equal original text
            expect(result.text).toBe(originalText);
            expect(result.text.length).toBe(originalText.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle various character encodings without loss', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.unicodeString({ minLength: 0, maxLength: 5000 }),
          async (originalText) => {
            const buffer = Buffer.from(originalText, 'utf-8');
            const file = {
              name: 'unicode.txt',
              arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
            } as File;

            const result = await extractText(file);

            // Property: Unicode characters should be preserved
            expect(result.text).toBe(originalText);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should extract non-empty text from non-empty files', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 10000 }),
          async (originalText) => {
            const buffer = Buffer.from(originalText, 'utf-8');
            const file = {
              name: 'nonempty.txt',
              arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
            } as File;

            const result = await extractText(file);

            // Property: non-empty input should produce non-empty output
            if (originalText.trim().length > 0) {
              expect(result.text.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
