/**
 * Unit tests for HuggingFace embedding API client
 * Tests basic functionality - comprehensive tests in task 3.2
 */

import { getEmbedding, getEmbeddingsBatch } from '@/lib/embeddings';

// Mock fetch globally
global.fetch = jest.fn();

describe('HuggingFace Embeddings API Client', () => {
  const mockEmbedding = Array(384).fill(0.1);
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, HF_TOKEN: 'test-token' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getEmbedding', () => {
    it('should generate embedding for single text', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [mockEmbedding],
      });

      const result = await getEmbedding('test text');

      expect(result).toEqual(mockEmbedding);
      expect(result).toHaveLength(384);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should throw error when HF_TOKEN is missing', async () => {
      delete process.env.HF_TOKEN;

      await expect(getEmbedding('test')).rejects.toThrow(
        'Missing HF_TOKEN environment variable'
      );
    });

    it('should retry on 503 error and succeed', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: async () => 'Model loading',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => [mockEmbedding],
        });

      const result = await getEmbedding('test text');

      expect(result).toEqual(mockEmbedding);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should handle 429 rate limit error', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      });

      await expect(getEmbedding('test')).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle timeout errors', async () => {
      // Simulate timeout by throwing AbortError on all retry attempts
      (global.fetch as jest.Mock).mockRejectedValue(
        Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
      );

      await expect(getEmbedding('test')).rejects.toThrow('Request timeout');
      
      // Should have retried 3 times
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('getEmbeddingsBatch', () => {
    it('should generate embeddings for multiple texts', async () => {
      const texts = ['text1', 'text2', 'text3'];
      const mockBatchEmbeddings = texts.map(() => mockEmbedding);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockBatchEmbeddings,
      });

      const result = await getEmbeddingsBatch(texts);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(mockEmbedding);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should batch requests with 10 texts per request', async () => {
      const texts = Array(25).fill('test');
      
      // Mock responses for each batch
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => Array(10).fill(mockEmbedding),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => Array(10).fill(mockEmbedding),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => Array(5).fill(mockEmbedding),
        });

      const result = await getEmbeddingsBatch(texts);

      // Should make 3 requests: 10 + 10 + 5
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(25);
    });
  });
});
