/**
 * @jest-environment node
 */
import { GET, DELETE } from '@/app/api/documents/route';
import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// Mock dependencies
jest.mock('@/lib/supabase');

const mockSupabase = {
  from: jest.fn(),
};

const mockCreateServerClient = createServerClient as jest.MockedFunction<typeof createServerClient>;

describe('/api/documents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateServerClient.mockReturnValue(mockSupabase as any);
  });

  describe('GET - List documents', () => {
    it('should return list of documents ordered by created_at descending', async () => {
      const mockDocuments = [
        {
          id: 'doc-1',
          filename: 'test1.pdf',
          doc_type: 'hub',
          file_size: 1024,
          chunk_count: 5,
          status: 'ready',
          created_at: '2024-01-02T00:00:00Z',
        },
        {
          id: 'doc-2',
          filename: 'test2.pdf',
          doc_type: 'satellite',
          file_size: 2048,
          chunk_count: 10,
          status: 'ready',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: mockDocuments,
            error: null,
          }),
        }),
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockDocuments);
      expect(mockSupabase.from).toHaveBeenCalledWith('documents');
    });

    it('should return empty array when no documents exist', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database connection failed' },
          }),
        }),
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('code');
    });

    it('should include all document metadata fields', async () => {
      const mockDocument = {
        id: 'doc-1',
        filename: 'test.pdf',
        doc_type: 'methodology',
        file_size: 5120,
        chunk_count: 15,
        status: 'ready',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: [mockDocument],
            error: null,
          }),
        }),
      });

      const response = await GET();
      const data = await response.json();

      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('filename');
      expect(data[0]).toHaveProperty('doc_type');
      expect(data[0]).toHaveProperty('file_size');
      expect(data[0]).toHaveProperty('chunk_count');
      expect(data[0]).toHaveProperty('status');
      expect(data[0]).toHaveProperty('created_at');
    });
  });

  describe('DELETE - Remove document', () => {
    it('should successfully delete document with valid ID', async () => {
      mockSupabase.from.mockReturnValue({
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            error: null,
          }),
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/documents', {
        method: 'DELETE',
        body: JSON.stringify({ id: 'doc-1' }),
      });

      const response = await DELETE(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true });
      expect(mockSupabase.from).toHaveBeenCalledWith('documents');
    });

    it('should cascade delete chunks when document is deleted', async () => {
      const mockDelete = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          error: null,
        }),
      });

      mockSupabase.from.mockReturnValue({
        delete: mockDelete,
      });

      const req = new NextRequest('http://localhost:3000/api/documents', {
        method: 'DELETE',
        body: JSON.stringify({ id: 'doc-1' }),
      });

      await DELETE(req);

      // Verify delete was called (cascade is handled by database foreign key)
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should reject request without document ID', async () => {
      const req = new NextRequest('http://localhost:3000/api/documents', {
        method: 'DELETE',
        body: JSON.stringify({}),
      });

      const response = await DELETE(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Document ID required');
      expect(data.code).toBe('VALIDATION_ERROR');
    });

    it('should reject request with null document ID', async () => {
      const req = new NextRequest('http://localhost:3000/api/documents', {
        method: 'DELETE',
        body: JSON.stringify({ id: null }),
      });

      const response = await DELETE(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Document ID required');
    });

    it('should reject request with empty string document ID', async () => {
      const req = new NextRequest('http://localhost:3000/api/documents', {
        method: 'DELETE',
        body: JSON.stringify({ id: '' }),
      });

      const response = await DELETE(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Document ID required');
    });

    it('should handle database errors during deletion', async () => {
      mockSupabase.from.mockReturnValue({
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            error: { message: 'Database error during deletion' },
          }),
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/documents', {
        method: 'DELETE',
        body: JSON.stringify({ id: 'doc-1' }),
      });

      const response = await DELETE(req);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('code');
    });

    it('should handle non-existent document ID gracefully', async () => {
      mockSupabase.from.mockReturnValue({
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            error: null,
          }),
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/documents', {
        method: 'DELETE',
        body: JSON.stringify({ id: 'non-existent-id' }),
      });

      const response = await DELETE(req);
      const data = await response.json();

      // Supabase delete doesn't error on non-existent IDs
      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true });
    });
  });

  describe('Error handling', () => {
    it('should sanitize error messages for GET endpoint', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockRejectedValue(new Error('Internal database error with sensitive info')),
        }),
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).not.toContain('sensitive info');
      expect(data).toHaveProperty('code');
    });

    it('should sanitize error messages for DELETE endpoint', async () => {
      mockSupabase.from.mockReturnValue({
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockRejectedValue(new Error('Internal error with connection string')),
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/documents', {
        method: 'DELETE',
        body: JSON.stringify({ id: 'doc-1' }),
      });

      const response = await DELETE(req);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).not.toContain('connection string');
      expect(data).toHaveProperty('code');
    });

    it('should log errors with context for GET endpoint', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' },
          }),
        }),
      });

      await GET();

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should log errors with context for DELETE endpoint', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockSupabase.from.mockReturnValue({
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            error: { message: 'Database error' },
          }),
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/documents', {
        method: 'DELETE',
        body: JSON.stringify({ id: 'doc-1' }),
      });

      await DELETE(req);

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});
