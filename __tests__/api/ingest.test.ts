/**
 * @jest-environment node
 */
import { POST } from '@/app/api/ingest/route';
import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { extractText } from '@/lib/extractor';
import { splitIntoChunks } from '@/lib/chunker';
import { getEmbeddingsBatch } from '@/lib/embeddings';

// Mock dependencies
jest.mock('@/lib/supabase');
jest.mock('@/lib/extractor');
jest.mock('@/lib/chunker');
jest.mock('@/lib/embeddings');

const mockSupabase = {
  from: jest.fn(),
};

const mockCreateServerClient = createServerClient as jest.MockedFunction<typeof createServerClient>;
const mockExtractText = extractText as jest.MockedFunction<typeof extractText>;
const mockSplitIntoChunks = splitIntoChunks as jest.MockedFunction<typeof splitIntoChunks>;
const mockGetEmbeddingsBatch = getEmbeddingsBatch as jest.MockedFunction<typeof getEmbeddingsBatch>;

describe('/api/ingest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateServerClient.mockReturnValue(mockSupabase as any);
  });

  describe('File validation', () => {
    it('should reject request with no file', async () => {
      const formData = new FormData();
      const req = new NextRequest('http://localhost:3000/api/ingest', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('No file provided');
    });

    it('should reject files exceeding 10MB', async () => {
      const largeFile = new File([new ArrayBuffer(11 * 1024 * 1024)], 'large.pdf', {
        type: 'application/pdf',
      });
      const formData = new FormData();
      formData.append('file', largeFile);

      const req = new NextRequest('http://localhost:3000/api/ingest', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('10MB');
    });

    it('should accept .pdf files', async () => {
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', file);

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'doc-1', filename: 'test.pdf' },
              error: null,
            }),
          }),
        }),
      });

      mockExtractText.mockResolvedValue({
        text: 'Sample text content',
        metadata: {},
      });

      mockSplitIntoChunks.mockReturnValue([
        { content: 'chunk 1', chunk_index: 0, startOffset: 0, endOffset: 10, metadata: {} },
      ]);

      mockGetEmbeddingsBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/ingest', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(req);
      expect(response.status).not.toBe(400);
    });

    it('should accept .docx files', async () => {
      const file = new File(['test'], 'test.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const formData = new FormData();
      formData.append('file', file);

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'doc-1', filename: 'test.docx' },
              error: null,
            }),
          }),
        }),
      });

      mockExtractText.mockResolvedValue({
        text: 'Sample text',
        metadata: {},
      });

      mockSplitIntoChunks.mockReturnValue([
        { content: 'chunk', chunk_index: 0, startOffset: 0, endOffset: 5, metadata: {} },
      ]);

      mockGetEmbeddingsBatch.mockResolvedValue([[0.1]]);

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/ingest', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(req);
      expect(response.status).not.toBe(400);
    });

    it('should accept .txt files', async () => {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', file);

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'doc-1', filename: 'test.txt' },
              error: null,
            }),
          }),
        }),
      });

      mockExtractText.mockResolvedValue({
        text: 'Sample text',
        metadata: {},
      });

      mockSplitIntoChunks.mockReturnValue([
        { content: 'chunk', chunk_index: 0, startOffset: 0, endOffset: 5, metadata: {} },
      ]);

      mockGetEmbeddingsBatch.mockResolvedValue([[0.1]]);

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/ingest', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(req);
      expect(response.status).not.toBe(400);
    });

    it('should accept .md files', async () => {
      const file = new File(['# Test'], 'test.md', { type: 'text/markdown' });
      const formData = new FormData();
      formData.append('file', file);

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'doc-1', filename: 'test.md' },
              error: null,
            }),
          }),
        }),
      });

      mockExtractText.mockResolvedValue({
        text: '# Test',
        metadata: {},
      });

      mockSplitIntoChunks.mockReturnValue([
        { content: 'chunk', chunk_index: 0, startOffset: 0, endOffset: 6, metadata: {} },
      ]);

      mockGetEmbeddingsBatch.mockResolvedValue([[0.1]]);

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/ingest', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(req);
      expect(response.status).not.toBe(400);
    });

    it('should reject unsupported file types', async () => {
      const file = new File(['test'], 'test.json', { type: 'application/json' });
      const formData = new FormData();
      formData.append('file', file);

      const req = new NextRequest('http://localhost:3000/api/ingest', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unsupported file type');
    });

    it('should reject executable files (.exe)', async () => {
      const file = new File(['malicious'], 'malware.exe', { type: 'application/x-msdownload' });
      const formData = new FormData();
      formData.append('file', file);

      const req = new NextRequest('http://localhost:3000/api/ingest', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Executable files are not allowed');
    });

    it('should reject shell scripts (.sh)', async () => {
      const file = new File(['#!/bin/bash'], 'script.sh', { type: 'application/x-sh' });
      const formData = new FormData();
      formData.append('file', file);

      const req = new NextRequest('http://localhost:3000/api/ingest', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Executable files are not allowed');
    });
  });

  describe('Document processing pipeline', () => {
    it('should extract text using appropriate extractor', async () => {
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', file);

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'doc-1', filename: 'test.pdf' },
              error: null,
            }),
          }),
        }),
      });

      mockExtractText.mockResolvedValue({
        text: 'Extracted text content',
        metadata: {},
      });

      mockSplitIntoChunks.mockReturnValue([
        { content: 'chunk', chunk_index: 0, startOffset: 0, endOffset: 5, metadata: {} },
      ]);

      mockGetEmbeddingsBatch.mockResolvedValue([[0.1]]);

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/ingest', {
        method: 'POST',
        body: formData,
      });

      await POST(req);

      expect(mockExtractText).toHaveBeenCalledWith(expect.any(File));
    });

    it('should chunk document with overlap', async () => {
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', file);

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'doc-1', filename: 'test.pdf' },
              error: null,
            }),
          }),
        }),
      });

      mockExtractText.mockResolvedValue({
        text: 'Long text content that needs chunking',
        metadata: { pageNumbers: new Map([[0, 1]]) },
      });

      mockSplitIntoChunks.mockReturnValue([
        { content: 'chunk 1', chunk_index: 0, startOffset: 0, endOffset: 10, metadata: {} },
        { content: 'chunk 2', chunk_index: 1, startOffset: 8, endOffset: 20, metadata: {} },
      ]);

      mockGetEmbeddingsBatch.mockResolvedValue([
        [0.1, 0.2],
        [0.3, 0.4],
      ]);

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/ingest', {
        method: 'POST',
        body: formData,
      });

      await POST(req);

      expect(mockSplitIntoChunks).toHaveBeenCalledWith(
        'Long text content that needs chunking',
        expect.objectContaining({
          document_id: 'doc-1',
          filename: 'test.pdf',
        }),
        expect.objectContaining({
          pageNumbers: expect.any(Map),
        })
      );
    });

    it('should generate embeddings in batches', async () => {
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', file);

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'doc-1', filename: 'test.pdf' },
              error: null,
            }),
          }),
        }),
      });

      mockExtractText.mockResolvedValue({
        text: 'Text content',
        metadata: {},
      });

      const chunks = [
        { content: 'chunk 1', chunk_index: 0, startOffset: 0, endOffset: 7, metadata: {} },
        { content: 'chunk 2', chunk_index: 1, startOffset: 5, endOffset: 12, metadata: {} },
      ];
      mockSplitIntoChunks.mockReturnValue(chunks);

      mockGetEmbeddingsBatch.mockResolvedValue([
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ]);

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/ingest', {
        method: 'POST',
        body: formData,
      });

      await POST(req);

      expect(mockGetEmbeddingsBatch).toHaveBeenCalledWith(['chunk 1', 'chunk 2']);
    });

    it('should insert document and chunks in database', async () => {
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', file);

      const mockInsert = jest.fn().mockResolvedValue({ error: null });
      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'documents') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'doc-1', filename: 'test.pdf' },
                  error: null,
                }),
              }),
            }),
            update: mockUpdate,
          };
        }
        if (table === 'chunks') {
          return {
            insert: mockInsert,
          };
        }
        return {};
      });

      mockExtractText.mockResolvedValue({
        text: 'Text content',
        metadata: {},
      });

      mockSplitIntoChunks.mockReturnValue([
        { content: 'chunk 1', chunk_index: 0, startOffset: 0, endOffset: 7, metadata: {} },
      ]);

      mockGetEmbeddingsBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

      const req = new NextRequest('http://localhost:3000/api/ingest', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(req);
      const data = await response.json();

      expect(mockInsert).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalled();
      expect(data.success).toBe(true);
      expect(data.document_id).toBe('doc-1');
      expect(data.chunk_count).toBe(1);
    });
  });

  describe('Error handling with rollback', () => {
    it('should rollback on extraction failure', async () => {
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', file);

      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'documents') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'doc-1', filename: 'test.pdf' },
                  error: null,
                }),
              }),
            }),
            update: mockUpdate,
          };
        }
        return {};
      });

      mockExtractText.mockRejectedValue(new Error('Extraction failed'));

      const req = new NextRequest('http://localhost:3000/api/ingest', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(data.success).toBe(false);
      expect(mockUpdate).toHaveBeenCalled(); // Status updated to 'error'
    });

    it('should rollback on embedding failure', async () => {
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', file);

      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'documents') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'doc-1', filename: 'test.pdf' },
                  error: null,
                }),
              }),
            }),
            update: mockUpdate,
          };
        }
        return {};
      });

      mockExtractText.mockResolvedValue({
        text: 'Text content',
        metadata: {},
      });

      mockSplitIntoChunks.mockReturnValue([
        { content: 'chunk 1', chunk_index: 0, startOffset: 0, endOffset: 7, metadata: {} },
      ]);

      mockGetEmbeddingsBatch.mockRejectedValue(new Error('Embedding service unavailable'));

      const req = new NextRequest('http://localhost:3000/api/ingest', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('embedding');
      expect(mockUpdate).toHaveBeenCalled(); // Status updated to 'error'
    });

    it('should rollback on database insertion failure', async () => {
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', file);

      const mockDelete = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'documents') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'doc-1', filename: 'test.pdf' },
                  error: null,
                }),
              }),
            }),
            delete: mockDelete,
          };
        }
        if (table === 'chunks') {
          return {
            insert: jest.fn().mockResolvedValue({ error: { message: 'Database error' } }),
          };
        }
        return {};
      });

      mockExtractText.mockResolvedValue({
        text: 'Text content',
        metadata: {},
      });

      mockSplitIntoChunks.mockReturnValue([
        { content: 'chunk 1', chunk_index: 0, startOffset: 0, endOffset: 7, metadata: {} },
      ]);

      mockGetEmbeddingsBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

      const req = new NextRequest('http://localhost:3000/api/ingest', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(mockDelete).toHaveBeenCalled(); // Document deleted (rollback)
    });

    it('should provide descriptive error messages', async () => {
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', file);

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'doc-1', filename: 'test.pdf' },
              error: null,
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      mockExtractText.mockResolvedValue({
        text: '',
        metadata: {},
      });

      const req = new NextRequest('http://localhost:3000/api/ingest', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(422);
      expect(data.success).toBe(false);
      expect(data.error).toContain('empty');
    });
  });
});
