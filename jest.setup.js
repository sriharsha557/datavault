// Jest setup file
import '@testing-library/jest-dom';
import { randomUUID } from 'crypto';

// Mock react-markdown to avoid ES module issues
jest.mock('react-markdown', () => {
  return function ReactMarkdown({ children }) {
    return children;
  };
});

jest.mock('remark-gfm', () => {
  return function remarkGfm() {
    return () => {};
  };
});

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = jest.fn();

// Mock crypto.randomUUID (not available in jsdom)
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => randomUUID(),
  },
});

// Mock environment variables for tests
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.HF_TOKEN = 'test-hf-token';
process.env.GROQ_API_KEY = 'test-groq-key';
