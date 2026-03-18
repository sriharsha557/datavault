// Core type definitions for Data Vault Knowledge Assistant

export type DocType = 'hub' | 'link' | 'satellite' | 'methodology' | 'pit_bridge' | 'general';

export interface Document {
  id: string;
  filename: string;
  doc_type: DocType;
  file_size: number;
  chunk_count: number;
  status: 'processing' | 'ready' | 'error';
  created_at: string;
}

export interface Chunk {
  id: string;
  document_id: string;
  content: string;
  embedding: number[];
  chunk_index: number;
  doc_type: DocType;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface MatchedChunk {
  id: string;
  content: string;
  doc_type: string;
  metadata: Record<string, unknown>;
  filename: string;
  similarity: number;
}

export interface Source {
  filename: string;
  doc_type?: string;
  similarity: number;
  excerpt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: Source[];
  isStreaming?: boolean;
  query?: string; // Store the original query for feedback
  hasError?: boolean;
  originalQuery?: string;
  latencyMs?: number;
}

// API Request/Response types
export interface QueryRequest {
  query: string;
  doc_type_filter?: string | null;
  top_k?: number;
  chat_history?: Array<{ role: string; content: string }>;
  similarity_threshold?: number;
}

export interface IngestResponse {
  success: boolean;
  document_id?: string;
  chunk_count?: number;
  error?: string;
}

export interface ErrorResponse {
  error: string;
  code?: string;
  details?: string;
}

// Export types
export interface ExportOptions {
  format: 'markdown' | 'pdf';
  includeTimestamps: boolean;
  includeSources: boolean;
  includeMetadata: boolean;
}

export interface ExportRequest {
  messages: ChatMessage[];
  options: ExportOptions;
}

export interface ExportResponse {
  success: boolean;
  downloadUrl?: string;
  filename?: string;
  error?: string;
}

// Reindex types
export interface ReindexRequest {
  documentId: string;
  options?: {
    chunkSize?: number;
    overlap?: number;
    forceReEmbed?: boolean;
  };
}

export interface ReindexResponse {
  success: boolean;
  documentId: string;
  oldChunkCount: number;
  newChunkCount: number;
  message: string;
}

export interface ReindexProgress {
  stage: 'fetching' | 'chunking' | 'embedding' | 'storing' | 'complete';
  progress: number;
  message: string;
}

// Query history
export interface QueryHistoryEntry {
  query: string;
  timestamp: number;
  resultCount?: number;
}

// Similarity threshold config
export interface SimilarityThresholdConfig {
  threshold: number;
  enabled: boolean;
}

// Streaming state
export interface StreamingState {
  messageId: string;
  partialContent: string;
  sources: Source[];
  isRecoverable: boolean;
  error?: string;
}

// Responsive layout types
export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export interface ResponsiveConfig {
  breakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}
