/**
 * Unit tests for ChatWindow component
 * Task 12.1: Create ChatWindow component
 * Requirements: 1.1, 1.2, 1.4, 1.5, 1.7, 15.1, 15.2, 15.5
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatWindow from '@/app/components/ChatWindow';
import '@testing-library/jest-dom';

// Mock fetch for API calls
global.fetch = jest.fn();

describe('ChatWindow Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should display empty state when no documents are uploaded', () => {
      render(<ChatWindow hasDocuments={false} />);
      
      expect(screen.getByText('Quick Query')).toBeInTheDocument();
      expect(screen.getByText('Ask anything about your Data Vault documents')).toBeInTheDocument();
      expect(screen.getByText('Upload documents in the sidebar to get started.')).toBeInTheDocument();
    });

    it('should display suggested queries when documents are available', () => {
      render(<ChatWindow hasDocuments={true} />);
      
      expect(screen.getByText('What is a Hub in Data Vault 2.0?')).toBeInTheDocument();
      expect(screen.getByText('Explain the difference between a Link and a Satellite')).toBeInTheDocument();
    });

    it('should display document type filter dropdown', () => {
      render(<ChatWindow hasDocuments={true} />);
      
      const filterSelect = screen.getByRole('combobox');
      expect(filterSelect).toBeInTheDocument();
      expect(screen.getByText('All documents')).toBeInTheDocument();
    });
  });

  describe('Message Display - Requirement 1.2, 1.4', () => {
    it('should display user message after submission', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"sources","sources":[]}\n\n') })
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"token","token":"Hello"}\n\n') })
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"done"}\n\n') })
              .mockResolvedValueOnce({ done: true, value: undefined }),
          }),
        },
      });

      render(<ChatWindow hasDocuments={true} />);
      
      const input = screen.getByPlaceholderText('Ask about your documents...');
      const submitButton = screen.getByRole('button', { name: '' });

      fireEvent.change(input, { target: { value: 'What is a Hub?' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('What is a Hub?')).toBeInTheDocument();
      });
    });

    it('should display assistant response with markdown support', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"sources","sources":[]}\n\n') })
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"token","token":"A **Hub** is"}\n\n') })
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"done"}\n\n') })
              .mockResolvedValueOnce({ done: true, value: undefined }),
          }),
        },
      });

      render(<ChatWindow hasDocuments={true} />);
      
      const input = screen.getByPlaceholderText('Ask about your documents...');
      fireEvent.change(input, { target: { value: 'What is a Hub?' } });
      fireEvent.click(screen.getByRole('button', { name: '' }));

      await waitFor(() => {
        expect(screen.getByText(/A/)).toBeInTheDocument();
      });
    });
  });

  describe('Loading State - Requirement 1.7', () => {
    it('should show loading indicator during processing', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<ChatWindow hasDocuments={true} />);
      
      const input = screen.getByPlaceholderText('Ask about your documents...');
      fireEvent.change(input, { target: { value: 'Test query' } });
      fireEvent.click(screen.getByRole('button', { name: '' }));

      await waitFor(() => {
        expect(screen.getByText('Thinking...')).toBeInTheDocument();
      });
    });

    it('should disable input during processing', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<ChatWindow hasDocuments={true} />);
      
      const input = screen.getByPlaceholderText('Ask about your documents...') as HTMLTextAreaElement;
      fireEvent.change(input, { target: { value: 'Test query' } });
      fireEvent.click(screen.getByRole('button', { name: '' }));

      await waitFor(() => {
        expect(input.disabled).toBe(true);
      });
    });
  });

  describe('Error Handling - Requirement 1.5', () => {
    it('should display error message when query fails', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockRejectedValue(new Error('Network error'));

      render(<ChatWindow hasDocuments={true} />);
      
      const input = screen.getByPlaceholderText('Ask about your documents...');
      fireEvent.change(input, { target: { value: 'Test query' } });
      fireEvent.click(screen.getByRole('button', { name: '' }));

      await waitFor(() => {
        expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
      });
    });
  });

  describe('Input Validation', () => {
    it('should disable submit button when input is empty', () => {
      render(<ChatWindow hasDocuments={true} />);
      
      const submitButton = screen.getByRole('button', { name: '' });
      expect(submitButton).toBeDisabled();
    });

    it('should enable submit button when input has text', () => {
      render(<ChatWindow hasDocuments={true} />);
      
      const input = screen.getByPlaceholderText('Ask about your documents...');
      const submitButton = screen.getByRole('button', { name: '' });

      fireEvent.change(input, { target: { value: 'Test query' } });
      expect(submitButton).not.toBeDisabled();
    });

    it('should disable submit button when no documents are available', () => {
      render(<ChatWindow hasDocuments={false} />);
      
      const input = screen.getByPlaceholderText('Upload documents to start querying');
      const submitButton = screen.getByRole('button', { name: '' });

      expect(input).toBeDisabled();
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Streaming Response - Requirement 1.4', () => {
    it('should handle streaming response updates', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"sources","sources":[]}\n\n') })
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"token","token":"Hello"}\n\n') })
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"token","token":" world"}\n\n') })
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"done"}\n\n') })
              .mockResolvedValueOnce({ done: true, value: undefined }),
          }),
        },
      });

      render(<ChatWindow hasDocuments={true} />);
      
      const input = screen.getByPlaceholderText('Ask about your documents...');
      fireEvent.change(input, { target: { value: 'Test' } });
      fireEvent.click(screen.getByRole('button', { name: '' }));

      await waitFor(() => {
        expect(screen.getByText('Hello world')).toBeInTheDocument();
      });
    });
  });

  describe('Source Citations', () => {
    it('should display source citations when available', async () => {
      const mockSources = [
        { filename: 'hub-guide.pdf', doc_type: 'hub', similarity: 0.95, excerpt: 'A Hub is a core business entity...' },
      ];

      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(`data: ${JSON.stringify({ type: 'sources', sources: mockSources })}\n\n`) })
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"token","token":"Answer"}\n\n') })
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"done"}\n\n') })
              .mockResolvedValueOnce({ done: true, value: undefined }),
          }),
        },
      });

      render(<ChatWindow hasDocuments={true} />);
      
      const input = screen.getByPlaceholderText('Ask about your documents...');
      fireEvent.change(input, { target: { value: 'Test' } });
      fireEvent.click(screen.getByRole('button', { name: '' }));

      await waitFor(() => {
        expect(screen.getByText('1 source')).toBeInTheDocument();
      });
    });
  });

  describe('Session State - Requirement 15.1, 15.2', () => {
    it('should maintain conversation history during session', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"sources","sources":[]}\n\n') })
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"token","token":"Response 1"}\n\n') })
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"done"}\n\n') })
              .mockResolvedValueOnce({ done: true, value: undefined }),
          }),
        },
      });

      render(<ChatWindow hasDocuments={true} />);
      
      // First query
      const input = screen.getByPlaceholderText('Ask about your documents...');
      fireEvent.change(input, { target: { value: 'Query 1' } });
      fireEvent.click(screen.getByRole('button', { name: '' }));

      await waitFor(() => {
        expect(screen.getByText('Query 1')).toBeInTheDocument();
        expect(screen.getByText('Response 1')).toBeInTheDocument();
      });

      // Second query
      mockFetch.mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"sources","sources":[]}\n\n') })
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"token","token":"Response 2"}\n\n') })
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"done"}\n\n') })
              .mockResolvedValueOnce({ done: true, value: undefined }),
          }),
        },
      });

      fireEvent.change(input, { target: { value: 'Query 2' } });
      fireEvent.click(screen.getByRole('button', { name: '' }));

      await waitFor(() => {
        expect(screen.getByText('Query 1')).toBeInTheDocument();
        expect(screen.getByText('Response 1')).toBeInTheDocument();
        expect(screen.getByText('Query 2')).toBeInTheDocument();
        expect(screen.getByText('Response 2')).toBeInTheDocument();
      });
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should submit on Enter key', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"sources","sources":[]}\n\n') })
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"done"}\n\n') })
              .mockResolvedValueOnce({ done: true, value: undefined }),
          }),
        },
      });

      render(<ChatWindow hasDocuments={true} />);
      
      const input = screen.getByPlaceholderText('Ask about your documents...');
      fireEvent.change(input, { target: { value: 'Test query' } });
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

      await waitFor(() => {
        expect(screen.getByText('Test query')).toBeInTheDocument();
      });
    });

    it('should not submit on Shift+Enter', () => {
      render(<ChatWindow hasDocuments={true} />);
      
      const input = screen.getByPlaceholderText('Ask about your documents...');
      fireEvent.change(input, { target: { value: 'Test query' } });
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

      expect(screen.queryByText('Test query')).not.toBeInTheDocument();
    });
  });
});
