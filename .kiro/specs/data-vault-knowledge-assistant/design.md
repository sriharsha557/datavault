# Design Document: Data Vault Knowledge Assistant

## Overview

The Data Vault Knowledge Assistant is a production-ready RAG (Retrieval-Augmented Generation) application that enables users to query Data Vault methodology documentation through natural language conversations. The system combines semantic search with AI-powered answer generation to provide accurate, contextual responses with source attribution.

### System Architecture

The application follows a modern serverless architecture deployed on Vercel with Supabase as the backend:

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Chat Interface (React + TypeScript)                   │ │
│  │  - Message history display                             │ │
│  │  - Query input with validation                         │ │
│  │  - Source citation rendering                           │ │
│  │  - Feedback collection UI                              │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Vercel (Next.js 14)                       │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  API Routes (Edge/Serverless Functions)               │ │
│  │                                                        │ │
│  │  /api/query                                           │ │
│  │  ├─ Query embedding generation                        │ │
│  │  ├─ Vector similarity search                          │ │
│  │  ├─ Context window construction                       │ │
│  │  └─ Streaming LLM response (SSE)                      │ │
│  │                                                        │ │
│  │  /api/ingest                                          │ │
│  │  ├─ File upload validation                            │ │
│  │  ├─ Text extraction (PDF/DOCX/TXT/MD)                │ │
│  │  ├─ Document chunking with overlap                    │ │
│  │  ├─ Batch embedding generation                        │ │
│  │  └─ Vector storage                                    │ │
│  │                                                        │ │
│  │  /api/documents                                       │ │
│  │  └─ Document management (list/delete)                 │ │
│  │                                                        │ │
│  │  /api/feedback                                        │ │
│  │  └─ User feedback persistence                         │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ PostgreSQL Protocol
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Supabase (PostgreSQL + pgvector)                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Vector Store                                         │ │
│  │  - documents table (metadata)                         │ │
│  │  - chunks table (text + vector(384))                  │ │
│  │  - feedback table (ratings)                           │ │
│  │  - IVFFlat index for ANN search                       │ │
│  │  - match_chunks() RPC function                        │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    External AI Services                      │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  HuggingFace API     │  │  Groq API                    │ │
│  │  all-MiniLM-L6-v2    │  │  LLaMA 3.1 8B                │ │
│  │  (Embeddings)        │  │  (Answer Generation)         │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Serverless Architecture**: Next.js API routes on Vercel provide automatic scaling, zero infrastructure management, and generous free tier limits (100GB bandwidth/month, 60s function timeout).

2. **Embedding Model Selection**: all-MiniLM-L6-v2 (384 dimensions) balances quality and performance. Smaller than OpenAI's ada-002 (1536 dims), enabling faster searches and lower storage costs while maintaining good semantic understanding for technical documentation.

3. **Chunking Strategy**: 800-character chunks with 120-character overlap (15%) preserve context across boundaries while keeping chunks focused. Overlap ensures important information near boundaries isn't lost.

4. **Vector Index**: IVFFlat (Inverted File with Flat compression) provides approximate nearest neighbor search with good recall/speed tradeoff. Lists=100 parameter optimized for up to 1M vectors.

5. **Streaming Responses**: Server-Sent Events (SSE) stream LLM tokens as they're generated, providing immediate feedback and better UX than waiting for complete responses.

6. **Document Type Classification**: Automatic detection from filenames (hub, link, satellite, pit, bridge, methodology) enables filtered retrieval for domain-specific queries.

## Architecture

### Component Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                      Frontend Layer                           │
│                                                                │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────┐│
│  │  ChatWindow     │  │  DocumentPanel   │  │  FeedbackUI  ││
│  │  Component      │  │  Component       │  │  Component   ││
│  └─────────────────┘  └──────────────────┘  └──────────────┘│
│           │                    │                     │        │
│           └────────────────────┴─────────────────────┘        │
│                              │                                │
└──────────────────────────────┼────────────────────────────────┘
                               │
┌──────────────────────────────┼────────────────────────────────┐
│                      API Layer                                 │
│                              │                                │
│  ┌───────────────────────────┴──────────────────────────────┐│
│  │              API Route Handlers                           ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ ││
│  │  │  Query   │  │  Ingest  │  │Documents │  │ Feedback │ ││
│  │  │  Handler │  │  Handler │  │ Handler  │  │ Handler  │ ││
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ ││
│  └───────────────────────────────────────────────────────────┘│
│                              │                                │
└──────────────────────────────┼────────────────────────────────┘
                               │
┌──────────────────────────────┼────────────────────────────────┐
│                    Business Logic Layer                        │
│                              │                                │
│  ┌──────────────┐  ┌─────────┴────────┐  ┌─────────────────┐│
│  │   Document   │  │   RAG Engine     │  │   Embedding     ││
│  │   Processor  │  │                  │  │   Generator     ││
│  │              │  │  ┌────────────┐  │  │                 ││
│  │ ┌──────────┐ │  │  │ Retriever  │  │  │ ┌─────────────┐││
│  │ │Extractor │ │  │  └────────────┘  │  │ │ HF API      │││
│  │ └──────────┘ │  │  ┌────────────┐  │  │ │ Client      │││
│  │ ┌──────────┐ │  │  │ Generator  │  │  │ └─────────────┘││
│  │ │ Chunker  │ │  │  └────────────┘  │  │                 ││
│  │ └──────────┘ │  │  ┌────────────┐  │  │                 ││
│  │              │  │  │  Context   │  │  │                 ││
│  │              │  │  │  Builder   │  │  │                 ││
│  │              │  │  └────────────┘  │  │                 ││
│  └──────────────┘  └──────────────────┘  └─────────────────┘│
│                              │                                │
└──────────────────────────────┼────────────────────────────────┘
                               │
┌──────────────────────────────┼────────────────────────────────┐
│                      Data Layer                                │
│                              │                                │
│  ┌───────────────────────────┴──────────────────────────────┐│
│  │              Supabase Client                              ││
│  │  ┌──────────────────────────────────────────────────────┐││
│  │  │  Vector Store Operations                             │││
│  │  │  - insertDocument()                                  │││
│  │  │  - insertChunks()                                    │││
│  │  │  - matchChunks()                                     │││
│  │  │  - listDocuments()                                   │││
│  │  │  - deleteDocument()                                  │││
│  │  │  - insertFeedback()                                  │││
│  │  └──────────────────────────────────────────────────────┘││
│  └───────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────┘
```

### Data Flow

#### Query Processing Flow

```
User Query
    │
    ▼
[Input Validation]
    │ (max 500 chars)
    ▼
[Embedding Generation]
    │ (HuggingFace API)
    │ → vector(384)
    ▼
[Vector Similarity Search]
    │ (Supabase match_chunks RPC)
    │ → top 5 chunks with metadata
    ▼
[Context Window Construction]
    │ (concatenate chunks + metadata)
    │ → formatted prompt
    ▼
[LLM Generation]
    │ (Groq LLaMA 3.1 streaming)
    │ → SSE stream
    ▼
[Response Display]
    │ (with source citations)
    ▼
[Feedback Collection]
    │ (helpful/not helpful)
    ▼
[Feedback Storage]
```

#### Document Ingestion Flow

```
File Upload
    │
    ▼
[File Validation]
    │ (type, size checks)
    ▼
[Text Extraction]
    │ (pdf-parse, mammoth, fs)
    │ → raw text + metadata
    ▼
[Document Chunking]
    │ (800 chars, 120 overlap)
    │ → array of chunks
    ▼
[Batch Embedding]
    │ (HuggingFace API)
    │ → array of vector(384)
    ▼
[Database Transaction]
    │ (insert document + chunks)
    │ → document_id, chunk_ids
    ▼
[Status Update]
    │ (processing → ready)
    ▼
[UI Refresh]
```

## Components and Interfaces

### 1. Chat Interface (Frontend)

**File**: `app/page.tsx`, `app/components/ChatWindow.tsx`

**Responsibilities**:
- Render conversation history with messages and source citations
- Handle user input with client-side validation
- Stream responses from API using EventSource
- Display loading states and error messages
- Collect and submit user feedback

**Key Functions**:

```typescript
interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceCitation[];
  timestamp: Date;
  id: string;
}

interface SourceCitation {
  filename: string;
  pageNumber?: number;
  docType?: string;
  similarity: number;
}

// Submit query and handle streaming response
async function handleSubmitQuery(query: string): Promise<void>

// Render message with markdown and source citations
function MessageDisplay({ message }: { message: Message }): JSX.Element

// Feedback submission
async function submitFeedback(messageId: string, helpful: boolean): Promise<void>
```

**State Management**:
- `messages: Message[]` - conversation history (session-scoped)
- `isLoading: boolean` - query processing state
- `error: string | null` - error display state
- `inputValue: string` - controlled input field

**Validation**:
- Query length: 1-500 characters
- Trim whitespace before submission
- Disable submit during processing

### 2. Document Panel (Frontend)

**File**: `app/components/DocumentPanel.tsx`

**Responsibilities**:
- File upload with drag-and-drop support
- Document type selection/override
- Display uploaded documents list
- Document deletion
- Upload progress and status display

**Key Functions**:

```typescript
interface DocumentMetadata {
  id: string;
  filename: string;
  docType: string;
  fileSize: number;
  chunkCount: number;
  status: 'processing' | 'ready' | 'error';
  createdAt: Date;
}

// Handle file upload with validation
async function handleFileUpload(file: File, docType?: string): Promise<void>

// Fetch documents list
async function fetchDocuments(): Promise<DocumentMetadata[]>

// Delete document
async function deleteDocument(documentId: string): Promise<void>
```

**Validation**:
- File types: .pdf, .docx, .txt, .md
- Max file size: 10MB
- Reject executable extensions

### 3. Query API Handler

**File**: `app/api/query/route.ts`

**Responsibilities**:
- Validate incoming query requests
- Generate query embeddings
- Perform vector similarity search
- Construct context window
- Stream LLM responses via SSE
- Handle errors gracefully

**API Specification**:

```typescript
// POST /api/query
interface QueryRequest {
  query: string;
  docType?: string; // optional filter
}

interface QueryResponse {
  // Streamed as SSE events
  event: 'token' | 'sources' | 'done' | 'error';
  data: string | SourceCitation[] | ErrorMessage;
}

interface ErrorMessage {
  error: string;
  code: string;
}
```

**Implementation Flow**:
1. Validate query (length, sanitization)
2. Generate embedding via HuggingFace API
3. Call Supabase `match_chunks()` RPC
4. Build context window from top 5 chunks
5. Stream Groq LLM response
6. Send sources as separate SSE event
7. Close stream with 'done' event

**Error Handling**:
- 400: Invalid query (too long, empty)
- 500: Embedding generation failure
- 500: Database connection failure
- 500: LLM API failure
- Timeout: 60s function limit

### 4. Ingest API Handler

**File**: `app/api/ingest/route.ts`

**Responsibilities**:
- Accept file uploads via multipart/form-data
- Validate file type and size
- Extract text content
- Chunk documents with overlap
- Generate embeddings in batches
- Store in database with transaction safety

**API Specification**:

```typescript
// POST /api/ingest
interface IngestRequest {
  file: File; // multipart/form-data
  docType?: string;
}

interface IngestResponse {
  success: boolean;
  documentId: string;
  chunkCount: number;
  message: string;
}

interface IngestError {
  error: string;
  code: 'INVALID_FILE' | 'FILE_TOO_LARGE' | 'EXTRACTION_FAILED' | 'EMBEDDING_FAILED' | 'DATABASE_ERROR';
}
```

**Implementation Flow**:
1. Parse multipart form data
2. Validate file (type, size, extension)
3. Detect/override document type
4. Extract text (call appropriate extractor)
5. Chunk text with overlap
6. Generate embeddings (batch HF API calls)
7. Begin database transaction
8. Insert document record (status='processing')
9. Insert all chunks with embeddings
10. Update document status to 'ready'
11. Commit transaction
12. Return success response

**Error Handling**:
- 400: Invalid file type
- 413: File too large (>10MB)
- 500: Extraction failure
- 500: Embedding API failure
- 500: Database transaction failure
- Rollback on any failure

### 5. Document Processor

**Files**: `lib/extractor.ts`, `lib/chunker.ts`

**Extractor Responsibilities**:
- Extract text from PDF files (pdf-parse)
- Extract text from DOCX files (mammoth)
- Read plain text and markdown files
- Preserve page numbers for PDFs
- Handle extraction errors

**Extractor Interface**:

```typescript
interface ExtractionResult {
  text: string;
  pageCount?: number;
  metadata: {
    pageNumbers?: Map<number, number>; // char offset → page number
  };
}

async function extractText(file: Buffer, fileType: string): Promise<ExtractionResult>
```

**Chunker Responsibilities**:
- Split text into chunks (target 800 chars)
- Create overlap between consecutive chunks (120 chars)
- Preserve sentence boundaries
- Associate chunks with page numbers
- Ensure complete coverage (no text omitted)

**Chunker Interface**:

```typescript
interface ChunkResult {
  content: string;
  chunkIndex: number;
  pageNumber?: number;
  startOffset: number;
  endOffset: number;
}

function chunkText(
  text: string,
  metadata: ExtractionResult['metadata'],
  options?: {
    chunkSize?: number; // default 800
    overlap?: number; // default 120
  }
): ChunkResult[]
```

**Chunking Algorithm**:
1. Define separators: `\n\n`, `\n`, `. `, ` `
2. Start at offset 0
3. Attempt to fill chunk to target size
4. Find last separator before size limit
5. If no separator, hard break at limit
6. Record chunk with metadata
7. Move offset back by overlap amount
8. Repeat until text exhausted
9. Discard chunks < 40 characters

### 6. Embedding Generator

**File**: `lib/embeddings.ts`

**Responsibilities**:
- Generate embeddings via HuggingFace Inference API
- Use consistent model (all-MiniLM-L6-v2)
- Handle batch requests efficiently
- Implement retry logic for rate limits
- Cache model configuration

**Interface**:

```typescript
interface EmbeddingConfig {
  model: 'sentence-transformers/all-MiniLM-L6-v2';
  dimensions: 384;
}

async function generateEmbedding(text: string): Promise<number[]>

async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]>
```

**Implementation Details**:
- API endpoint: `https://api-inference.huggingface.co/pipeline/feature-extraction/{model}`
- Authentication: Bearer token from HF_TOKEN env var
- Retry strategy: exponential backoff (3 attempts)
- Rate limiting: respect 429 responses
- Timeout: 10s per request
- Batch size: 10 texts per request (balance latency/throughput)

### 7. RAG Engine

**File**: `lib/rag.ts`

**Responsibilities**:
- Orchestrate retrieval and generation
- Construct context windows from chunks
- Format prompts for LLM
- Handle streaming responses
- Manage token limits

**Interface**:

```typescript
interface RAGConfig {
  topK: number; // default 5
  similarityThreshold: number; // default 0.3
  maxContextTokens: number; // default 3000
}

interface RetrievalResult {
  chunks: ChunkWithMetadata[];
  sources: SourceCitation[];
}

interface ChunkWithMetadata {
  id: string;
  content: string;
  docType: string;
  filename: string;
  pageNumber?: number;
  similarity: number;
}

async function retrieveContext(
  queryEmbedding: number[],
  config?: Partial<RAGConfig>
): Promise<RetrievalResult>

function buildContextWindow(chunks: ChunkWithMetadata[]): string

async function* generateAnswer(
  query: string,
  context: string
): AsyncGenerator<string>
```

**Context Window Format**:

```
You are a Data Vault methodology expert. Answer the user's question based solely on the provided context. If the context doesn't contain enough information, say so.

Context:
---
[Document: filename.pdf, Page: 5, Type: hub]
{chunk content}

[Document: guide.md, Type: methodology]
{chunk content}

[Document: satellite-patterns.pdf, Page: 12, Type: satellite]
{chunk content}
---

User Question: {query}

Answer:
```

**Token Management**:
- Estimate tokens: ~4 chars per token
- Reserve 500 tokens for answer
- Allocate remaining to context
- Truncate lowest-ranked chunks if needed

### 8. Vector Store Client

**File**: `lib/supabase.ts`

**Responsibilities**:
- Initialize Supabase client with service role key
- Provide typed database operations
- Handle connection errors
- Implement retry logic

**Interface**:

```typescript
interface SupabaseClient {
  // Document operations
  insertDocument(doc: Omit<Document, 'id' | 'createdAt'>): Promise<string>
  updateDocumentStatus(id: string, status: string, chunkCount?: number): Promise<void>
  listDocuments(): Promise<DocumentMetadata[]>
  deleteDocument(id: string): Promise<void>
  
  // Chunk operations
  insertChunks(chunks: ChunkInsert[]): Promise<void>
  matchChunks(embedding: number[], limit: number, docType?: string): Promise<ChunkWithMetadata[]>
  
  // Feedback operations
  insertFeedback(feedback: FeedbackInsert): Promise<void>
}

interface ChunkInsert {
  documentId: string;
  content: string;
  embedding: number[];
  chunkIndex: number;
  docType: string;
  metadata: Record<string, any>;
}

interface FeedbackInsert {
  messageId: string;
  query: string;
  response: string;
  helpful: boolean;
  timestamp: Date;
}
```

## Data Models

### Database Schema

#### documents table

```sql
create table documents (
  id          uuid primary key default gen_random_uuid(),
  filename    text not null,
  doc_type    text,
  file_size   int,
  chunk_count int default 0,
  status      text default 'processing',
  created_at  timestamptz default now()
);
```

**Fields**:
- `id`: Unique identifier (UUID v4)
- `filename`: Original uploaded filename
- `doc_type`: Classification (hub, link, satellite, pit, bridge, methodology, general)
- `file_size`: File size in bytes
- `chunk_count`: Number of chunks created from document
- `status`: Processing state (processing, ready, error)
- `created_at`: Upload timestamp

**Indexes**:
- Primary key on `id`
- Index on `status` for filtering

#### chunks table

```sql
create table chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  content     text not null,
  embedding   vector(384),
  chunk_index int not null,
  doc_type    text,
  metadata    jsonb default '{}',
  created_at  timestamptz default now()
);
```

**Fields**:
- `id`: Unique identifier (UUID v4)
- `document_id`: Foreign key to documents table (cascade delete)
- `content`: Text content of chunk (500-1000 chars)
- `embedding`: Vector embedding (384 dimensions, all-MiniLM-L6-v2)
- `chunk_index`: Sequential position in source document
- `doc_type`: Denormalized from document for filtering
- `metadata`: JSONB field for page numbers, offsets, etc.
- `created_at`: Creation timestamp

**Indexes**:
- Primary key on `id`
- IVFFlat index on `embedding` for ANN search
- B-tree index on `doc_type` for filtering
- B-tree index on `document_id` for joins

#### feedback table

```sql
create table feedback (
  id          uuid primary key default gen_random_uuid(),
  message_id  text not null,
  query       text not null,
  response    text not null,
  helpful     boolean not null,
  created_at  timestamptz default now()
);
```

**Fields**:
- `id`: Unique identifier (UUID v4)
- `message_id`: Client-generated message identifier
- `query`: User's original question
- `response`: Generated answer
- `helpful`: User rating (true=helpful, false=not helpful)
- `created_at`: Feedback timestamp

**Indexes**:
- Primary key on `id`
- Index on `created_at` for analytics queries

### RPC Functions

#### match_chunks

```sql
create or replace function match_chunks(
  query_embedding vector(384),
  match_count     int default 5,
  filter_doc_type text default null
)
returns table (
  id          uuid,
  content     text,
  doc_type    text,
  metadata    jsonb,
  filename    text,
  similarity  float
)
```

**Purpose**: Perform vector similarity search with optional document type filtering

**Parameters**:
- `query_embedding`: Query vector (384 dimensions)
- `match_count`: Number of results to return (default 5)
- `filter_doc_type`: Optional document type filter

**Returns**: Table of matching chunks with similarity scores (1 - cosine distance)

**Performance**: Uses IVFFlat index for approximate nearest neighbor search (O(log n) with lists=100)

### TypeScript Types

```typescript
// Frontend types
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceCitation[];
  timestamp: Date;
}

interface SourceCitation {
  filename: string;
  pageNumber?: number;
  docType?: string;
  similarity: number;
}

interface DocumentMetadata {
  id: string;
  filename: string;
  docType: string;
  fileSize: number;
  chunkCount: number;
  status: 'processing' | 'ready' | 'error';
  createdAt: Date;
}

// Backend types
interface Document {
  id: string;
  filename: string;
  doc_type: string;
  file_size: number;
  chunk_count: number;
  status: string;
  created_at: Date;
}

interface Chunk {
  id: string;
  document_id: string;
  content: string;
  embedding: number[];
  chunk_index: number;
  doc_type: string;
  metadata: Record<string, any>;
  created_at: Date;
}

interface Feedback {
  id: string;
  message_id: string;
  query: string;
  response: string;
  helpful: boolean;
  created_at: Date;
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified several areas of redundancy:

1. **Embedding consistency properties (5.2, 5.4, 17.1, 17.2)**: These all verify the same model is used consistently. Combined into Property 5.
2. **Persistence properties (6.1, 6.2, 13.1, 13.2)**: These all verify data is stored. Combined into Property 11.
3. **Retrieval ordering properties (7.4, 19.1, 19.2)**: These all verify monotonic ordering. Combined into Property 13.
4. **Context construction properties (8.1, 20.1, 20.2)**: These verify context includes all chunks with metadata. Combined into Property 15.
5. **Citation display properties (9.1, 9.2, 9.3)**: These verify citations are displayed with required fields. Combined into Property 17.
6. **Chunk overlap properties (4.3, 18.1, 18.2)**: These all verify overlap behavior. Combined into Property 7.
7. **Message display properties (1.2, 1.4)**: Both verify messages appear in history. Combined into Property 1.

### Property 1: Conversation History Completeness

*For any* sequence of user queries and assistant responses, all submitted queries and generated responses should appear in the conversation history in chronological order.

**Validates: Requirements 1.2, 1.4, 15.1, 15.2**

### Property 2: Query Length Validation

*For any* user input, if the input length is between 1 and 500 characters (inclusive), the system should accept it; otherwise, the system should reject it with an appropriate error message.

**Validates: Requirements 1.6, 16.1, 16.2**

### Property 3: File Type Validation

*For any* uploaded file, if the file extension is one of [.pdf, .docx, .txt, .md], the system should accept it for processing; otherwise, the system should reject it with an error message indicating supported formats.

**Validates: Requirements 2.4, 2.5, 16.4**

### Property 4: Text Extraction Completeness

*For any* valid document file, after extraction, the total character count of extracted text should equal the character count of the original document content (no text should be lost or added).

**Validates: Requirements 2.6, 3.3, 3.6**

### Property 5: Embedding Model Consistency

*For any* pair of identical text inputs (whether document chunks or queries), the embedding generator should produce identical vector embeddings, and all embeddings should use the same model (all-MiniLM-L6-v2) with dimensionality of 384.

**Validates: Requirements 5.2, 5.4, 17.1, 17.2, 17.6**

### Property 6: Embedding Dimensionality Invariant

*For any* generated embedding (document chunk or query), the embedding vector should have exactly 384 dimensions.

**Validates: Requirements 5.3**

### Property 7: Chunk Overlap Invariant

*For any* pair of consecutive chunks from the same document, there should exist an overlap region containing between 100 and 200 characters that appears at the end of chunk N and the beginning of chunk N+1.

**Validates: Requirements 4.3, 18.1, 18.2**

### Property 8: Chunk Size Bounds

*For any* generated document chunk, the chunk content length should be between 500 and 1000 characters (excluding chunks from documents shorter than 500 characters).

**Validates: Requirements 4.2**

### Property 9: Chunk Completeness

*For any* document, when all chunks are concatenated (removing overlaps), the resulting text should contain all content from the original document with no omissions.

**Validates: Requirements 18.4**

### Property 10: Chunk Coverage

*For any* document of length L characters, the number of chunks generated should be greater than or equal to L divided by the maximum chunk size (1000 characters).

**Validates: Requirements 18.3**

### Property 11: Minimum Chunk Count

*For any* processed document, at least one chunk should be created.

**Validates: Requirements 4.7**

### Property 12: Chunk Metadata Association

*For any* generated chunk, the chunk should be associated with its source document metadata (document ID, filename, document type) and, when available, page number information.

**Validates: Requirements 4.5, 4.6**

### Property 13: Persistence Completeness

*For any* successfully uploaded document, all associated data (document metadata, all chunks, all embeddings) should be persisted in the vector store and retrievable via queries.

**Validates: Requirements 6.1, 6.2, 6.6, 13.1, 13.2**

### Property 14: Retrieval Ranking Monotonicity

*For any* retrieval operation returning N chunks, the similarity score of chunk i should be greater than or equal to the similarity score of chunk i+1 for all i in [0, N-2] (monotonically decreasing order).

**Validates: Requirements 7.4, 19.1, 19.2**

### Property 15: Retrieval Result Bounds

*For any* query with requested top K value, the number of returned chunks should be less than or equal to K.

**Validates: Requirements 7.3, 19.4**

### Property 16: Retrieval Determinism

*For any* query embedding, when the same query is submitted multiple times against an unchanged vector store, the retrieval results (chunk IDs and similarity scores) should be identical.

**Validates: Requirements 19.3**

### Property 17: Retrieved Chunk Metadata Completeness

*For any* retrieved chunk, the chunk should include source metadata containing at minimum: document filename, document type, and similarity score.

**Validates: Requirements 7.5**

### Property 18: Context Window Construction

*For any* set of retrieved chunks, the constructed context window should include the text content and source metadata of all retrieved chunks, ordered by relevance score.

**Validates: Requirements 8.1, 20.1, 20.2, 20.3**

### Property 19: Context Window Token Limit

*For any* constructed context window, the total token count should not exceed the AI model's token limit (approximately 3000 tokens, estimated as total characters divided by 4).

**Validates: Requirements 20.4**

### Property 20: Context Window Subset Property

*For any* context window constructed from N retrieved chunks, the number of chunks included in the context window should be less than or equal to N (context is a subset of retrieval results).

**Validates: Requirements 20.6**

### Property 21: Response Length Bounds

*For any* generated response, the word count should be between 50 and 500 words (inclusive).

**Validates: Requirements 8.6**

### Property 22: Source Citation Count Bounds

*For any* response with source citations, the number of displayed citations should be less than or equal to 5.

**Validates: Requirements 9.5**

### Property 23: Source Citation Ordering

*For any* response with multiple source citations, the citations should be ordered by relevance score in descending order (matching the order of retrieved chunks).

**Validates: Requirements 9.6**

### Property 24: Source Citation Required Fields

*For any* displayed source citation, the citation should include the document filename and similarity score; if page number metadata exists for that chunk, the citation should also include the page number.

**Validates: Requirements 9.2, 9.3**

### Property 25: Feedback Persistence

*For any* submitted feedback (helpful or not helpful), the feedback should be persisted in the database with the associated message ID, query text, response text, rating, and timestamp.

**Validates: Requirements 10.4, 10.7, 13.3**

### Property 26: Feedback Idempotence

*For any* response message, only one feedback submission should be recorded; subsequent feedback submissions for the same message should either update the existing record or be rejected.

**Validates: Requirements 10.6**

### Property 27: Timestamp Invariant

*For any* message (query or response) in the conversation history, the message should have an associated timestamp.

**Validates: Requirements 15.6**

### Property 28: Error Message Sanitization

*For any* error condition, the user-facing error message should not contain internal system details such as stack traces, database connection strings, API keys, or internal file paths.

**Validates: Requirements 11.6**

### Property 29: Error Logging Completeness

*For any* error condition, an error log entry should be created containing sufficient detail for debugging (error type, error message, stack trace, timestamp, request context).

**Validates: Requirements 11.5**

### Property 30: Transaction Atomicity

*For any* document upload operation, either all associated data (document record, all chunks, all embeddings) should be committed to the database, or none should be committed (all-or-nothing property).

**Validates: Requirements 13.4, 13.5**

### Property 31: Document Parsing Round-Trip

*For any* successfully parsed document, parsing the document, then formatting the parsed structure back to text, then parsing again should produce an equivalent structured representation.

**Validates: Requirements 14.4**

### Property 32: Input Sanitization

*For any* user input (query text, file upload), the input should be sanitized to prevent injection attacks (SQL injection, XSS, command injection) before being processed or stored.

**Validates: Requirements 16.3**

### Property 33: Executable File Rejection

*For any* uploaded file with an executable extension (.exe, .sh, .bat, .cmd, .app, .dmg, .jar), the system should reject the file with an appropriate error message.

**Validates: Requirements 16.5**

### Property 34: Data Validation Before Storage

*For any* data being stored in the vector store (documents, chunks, embeddings, feedback), the data should be validated against expected schemas and constraints before insertion.

**Validates: Requirements 16.6**

## Error Handling

### Error Categories

The system handles errors across multiple layers with consistent patterns:

#### 1. Client-Side Validation Errors (400-level)

**Trigger Conditions**:
- Query exceeds 500 characters
- Empty query submission
- Invalid file type upload
- File size exceeds 10MB
- Executable file upload attempt

**Handling Strategy**:
- Validate on client before API call
- Display inline error messages
- Prevent form submission
- Provide clear guidance on valid inputs

**User Experience**:
- Immediate feedback (no network round-trip)
- Error message appears near input field
- Input field remains populated for correction
- Submit button remains disabled until valid

#### 2. Processing Errors (500-level)

**Trigger Conditions**:
- Text extraction failure (corrupted PDF, unsupported encoding)
- Embedding API failure (rate limit, timeout, service down)
- Database connection failure
- Transaction rollback
- LLM API failure

**Handling Strategy**:
- Log detailed error information server-side
- Return sanitized error message to client
- Maintain system stability (no crashes)
- Enable retry for transient failures

**User Experience**:
- Toast notification with error message
- Retry button for transient failures
- Graceful degradation (system remains usable)
- Error doesn't clear conversation history

#### 3. Timeout Errors

**Trigger Conditions**:
- Embedding generation exceeds 10s
- LLM response generation exceeds 60s (Vercel limit)
- Database query exceeds 30s

**Handling Strategy**:
- Set appropriate timeouts at each layer
- Return timeout error to user
- Log timeout events for monitoring
- Suggest retry or simplification

**User Experience**:
- Loading indicator shows progress
- Timeout message explains what happened
- Retry button available
- Suggestion to simplify query or document

### Error Response Format

All API errors follow a consistent JSON structure:

```typescript
interface ErrorResponse {
  error: string;           // User-friendly message
  code: string;            // Machine-readable error code
  details?: string;        // Optional additional context
  retryable: boolean;      // Whether retry might succeed
}
```

**Error Codes**:
- `INVALID_QUERY`: Query validation failed
- `INVALID_FILE`: File validation failed
- `FILE_TOO_LARGE`: File exceeds size limit
- `EXTRACTION_FAILED`: Text extraction error
- `EMBEDDING_FAILED`: Embedding generation error
- `DATABASE_ERROR`: Database operation error
- `LLM_ERROR`: LLM API error
- `TIMEOUT`: Operation exceeded time limit
- `SERVICE_UNAVAILABLE`: External service down

### Error Recovery Strategies

#### Transient Failures (Retryable)

**Examples**: Network timeouts, rate limits, temporary service unavailability

**Strategy**:
- Exponential backoff (1s, 2s, 4s)
- Maximum 3 retry attempts
- Display retry progress to user
- Log retry attempts

**Implementation**:
```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts || !isRetryable(error)) {
        throw error;
      }
      await sleep(Math.pow(2, attempt - 1) * 1000);
    }
  }
}
```

#### Permanent Failures (Non-Retryable)

**Examples**: Invalid file format, corrupted document, malformed query

**Strategy**:
- Return clear error message immediately
- No retry attempts
- Provide guidance on fixing the issue
- Log for debugging

#### Partial Failures (Transaction Rollback)

**Examples**: Document uploaded but chunking failed, chunks created but embedding failed

**Strategy**:
- Wrap operations in database transactions
- Rollback all changes on any failure
- Return error indicating no partial state
- User can retry entire operation

**Implementation**:
```typescript
async function ingestDocument(file: File): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    
    const docId = await insertDocument(client, metadata);
    const chunks = await chunkDocument(text);
    const embeddings = await generateEmbeddings(chunks);
    await insertChunks(client, docId, chunks, embeddings);
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### Logging Strategy

**Log Levels**:
- `ERROR`: All errors (client and server)
- `WARN`: Retries, slow operations, deprecated usage
- `INFO`: Successful operations, key events
- `DEBUG`: Detailed execution flow (dev only)

**Log Structure**:
```typescript
interface LogEntry {
  timestamp: string;
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  message: string;
  context: {
    requestId?: string;
    userId?: string;
    operation: string;
    duration?: number;
  };
  error?: {
    name: string;
    message: string;
    stack: string;
  };
}
```

**Log Destinations**:
- Development: Console with formatting
- Production: Vercel logs + external monitoring (optional)
- Error tracking: Sentry or similar (optional)

## Testing Strategy

### Dual Testing Approach

The system requires both unit testing and property-based testing for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs

Both approaches are complementary and necessary. Unit tests catch concrete bugs in specific scenarios, while property tests verify general correctness across a wide input space.

### Property-Based Testing Configuration

**Library Selection**: 
- **JavaScript/TypeScript**: fast-check (https://github.com/dubzzz/fast-check)
- Mature, well-maintained, excellent TypeScript support
- Integrated shrinking for minimal failing examples
- Configurable generators for complex data types

**Test Configuration**:
- Minimum 100 iterations per property test (due to randomization)
- Seed-based reproducibility for debugging
- Timeout: 30s per property test
- Shrinking enabled for minimal counterexamples

**Property Test Structure**:

```typescript
import fc from 'fast-check';

// Feature: data-vault-knowledge-assistant, Property 7: Chunk Overlap Invariant
test('consecutive chunks have 100-200 character overlap', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 2000, maxLength: 10000 }), // arbitrary document
      (documentText) => {
        const chunks = chunkText(documentText);
        
        for (let i = 0; i < chunks.length - 1; i++) {
          const chunk1 = chunks[i].content;
          const chunk2 = chunks[i + 1].content;
          
          // Find overlap
          let overlapLength = 0;
          for (let len = Math.min(chunk1.length, chunk2.length); len > 0; len--) {
            if (chunk1.slice(-len) === chunk2.slice(0, len)) {
              overlapLength = len;
              break;
            }
          }
          
          expect(overlapLength).toBeGreaterThanOrEqual(100);
          expect(overlapLength).toBeLessThanOrEqual(200);
        }
      }
    ),
    { numRuns: 100 }
  );
});
```

**Tag Format**: Each property test must include a comment referencing the design property:
```typescript
// Feature: data-vault-knowledge-assistant, Property {number}: {property_text}
```

### Unit Testing Strategy

Unit tests focus on specific examples, edge cases, and integration points:

**Test Categories**:

1. **Example Tests**: Verify specific known inputs produce expected outputs
   - PDF extraction with known document
   - Query with known expected chunks
   - Feedback submission with specific message

2. **Edge Case Tests**: Verify boundary conditions
   - Empty document
   - Single-character query
   - Maximum file size (10MB)
   - Maximum query length (500 chars)
   - Document with 1000 pages
   - Context window at token limit

3. **Error Condition Tests**: Verify error handling
   - Corrupted PDF file
   - Unsupported file type
   - Database connection failure
   - Embedding API timeout
   - LLM API error

4. **Integration Tests**: Verify component interactions
   - End-to-end document ingestion
   - End-to-end query processing
   - Database transaction rollback
   - Streaming response handling

**Unit Test Structure**:

```typescript
describe('Document Processor', () => {
  describe('Text Extraction', () => {
    it('should extract text from valid PDF', async () => {
      const pdfBuffer = await fs.readFile('test-fixtures/sample.pdf');
      const result = await extractText(pdfBuffer, 'pdf');
      
      expect(result.text).toContain('Data Vault');
      expect(result.pageCount).toBe(5);
    });
    
    it('should handle corrupted PDF gracefully', async () => {
      const corruptedBuffer = Buffer.from('not a pdf');
      
      await expect(extractText(corruptedBuffer, 'pdf'))
        .rejects
        .toThrow('EXTRACTION_FAILED');
    });
    
    it('should reject files over 10MB', async () => {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024);
      
      await expect(validateFile(largeBuffer, 'pdf'))
        .rejects
        .toThrow('FILE_TOO_LARGE');
    });
  });
});
```

### Test Coverage Goals

**Target Coverage**:
- Line coverage: >80%
- Branch coverage: >75%
- Function coverage: >90%

**Critical Paths** (require 100% coverage):
- Input validation
- Error handling
- Transaction management
- Security sanitization

### Testing Tools

**Framework**: Jest (Next.js default)
- Fast execution
- Built-in mocking
- Snapshot testing
- Coverage reporting

**Additional Libraries**:
- `fast-check`: Property-based testing
- `@testing-library/react`: Component testing
- `msw`: API mocking
- `@supabase/supabase-js`: Database mocking

### Test Data Management

**Fixtures**:
- Sample PDF documents (various sizes, structures)
- Sample Markdown files
- Sample text files
- Known embeddings for deterministic tests
- Mock API responses

**Generators** (for property tests):
- Arbitrary text (various lengths, unicode)
- Arbitrary documents (various formats)
- Arbitrary queries (various lengths)
- Arbitrary embeddings (384 dimensions)
- Arbitrary chunks (with metadata)

### Continuous Integration

**CI Pipeline**:
1. Lint code (ESLint)
2. Type check (TypeScript)
3. Run unit tests
4. Run property tests
5. Generate coverage report
6. Build application
7. Deploy to preview (on PR)

**Quality Gates**:
- All tests must pass
- Coverage must meet thresholds
- No TypeScript errors
- No ESLint errors

## Implementation Approach

### Phase 1: Core Infrastructure (Week 1)

**Goal**: Set up project foundation and database

**Tasks**:
1. Initialize Next.js project with TypeScript
2. Configure Tailwind CSS
3. Set up Supabase project
4. Run database schema migrations
5. Configure environment variables
6. Set up testing framework (Jest + fast-check)
7. Implement Supabase client wrapper
8. Implement basic error handling utilities

**Deliverables**:
- Working Next.js app (empty UI)
- Database with tables and indexes
- Test infrastructure ready
- Environment configuration documented

### Phase 2: Document Processing Pipeline (Week 2)

**Goal**: Implement document ingestion from upload to storage

**Tasks**:
1. Implement text extractors (PDF, DOCX, TXT, MD)
2. Implement chunking algorithm with overlap
3. Implement embedding generator (HuggingFace API client)
4. Implement document type detection
5. Implement `/api/ingest` endpoint with transaction handling
6. Write unit tests for extractors and chunker
7. Write property tests for chunking properties
8. Implement document upload UI component

**Deliverables**:
- Working document upload and processing
- Documents stored in vector database
- Test coverage >80%
- UI for document management

### Phase 3: RAG Query Pipeline (Week 3)

**Goal**: Implement query processing and answer generation

**Tasks**:
1. Implement query embedding generation
2. Implement vector similarity search (Supabase RPC)
3. Implement context window construction
4. Implement LLM integration (Groq API client)
5. Implement streaming response handling (SSE)
6. Implement `/api/query` endpoint
7. Write unit tests for RAG components
8. Write property tests for retrieval properties
9. Implement chat interface UI

**Deliverables**:
- Working query processing
- Streaming responses in UI
- Source citations displayed
- Test coverage >80%

### Phase 4: Feedback and Polish (Week 4)

**Goal**: Add feedback mechanism and improve UX

**Tasks**:
1. Implement feedback collection UI
2. Implement `/api/feedback` endpoint
3. Implement feedback persistence
4. Add loading states and error messages
5. Improve UI/UX (animations, accessibility)
6. Write integration tests (end-to-end)
7. Performance testing and optimization
8. Documentation (README, API docs)

**Deliverables**:
- Complete feedback system
- Polished UI with good UX
- Comprehensive documentation
- Performance benchmarks

### Phase 5: Deployment and Monitoring (Week 5)

**Goal**: Deploy to production and set up monitoring

**Tasks**:
1. Configure Vercel deployment
2. Set up production environment variables
3. Configure custom domain (optional)
4. Set up error tracking (Sentry or similar)
5. Set up analytics (optional)
6. Load testing with realistic data
7. Security audit
8. Create deployment runbook

**Deliverables**:
- Production deployment on Vercel
- Monitoring and alerting configured
- Security hardening complete
- Operational documentation

### Development Guidelines

**Code Organization**:
```
app/
  api/
    query/route.ts          # Query endpoint
    ingest/route.ts         # Document upload endpoint
    documents/route.ts      # Document management endpoint
    feedback/route.ts       # Feedback endpoint
  components/
    ChatWindow.tsx          # Chat interface
    DocumentPanel.tsx       # Document management UI
    MessageDisplay.tsx      # Message rendering
    SourceCitation.tsx      # Citation display
    FeedbackButtons.tsx     # Feedback UI
  page.tsx                  # Main page
  layout.tsx                # Root layout
  globals.css               # Global styles

lib/
  supabase.ts               # Database client
  extractor.ts              # Text extraction
  chunker.ts                # Document chunking
  embeddings.ts             # Embedding generation
  rag.ts                    # RAG engine
  prompt.ts                 # Prompt templates
  errors.ts                 # Error handling utilities
  validation.ts             # Input validation
  logger.ts                 # Logging utilities

tests/
  unit/
    extractor.test.ts
    chunker.test.ts
    embeddings.test.ts
    rag.test.ts
  property/
    chunking.property.test.ts
    retrieval.property.test.ts
    embedding.property.test.ts
  integration/
    ingest.integration.test.ts
    query.integration.test.ts
  fixtures/
    sample.pdf
    sample.md
    sample.txt
```

**Coding Standards**:
- TypeScript strict mode enabled
- ESLint with Next.js config
- Prettier for formatting
- Conventional commits
- Meaningful variable names
- Comprehensive JSDoc comments
- Error handling at every layer

**Performance Considerations**:
- Batch embedding generation (10 chunks at a time)
- Database connection pooling
- Streaming responses (don't wait for complete LLM output)
- Lazy loading for document list
- Debounced search input
- Optimistic UI updates

**Security Considerations**:
- Input validation on client and server
- SQL injection prevention (parameterized queries)
- XSS prevention (React escaping + sanitization)
- CSRF protection (Next.js built-in)
- Rate limiting on API routes
- Environment variable security (never commit secrets)
- Content Security Policy headers

### Deployment Configuration

**Vercel Settings**:
```json
{
  "functions": {
    "app/api/query/route.ts": {
      "maxDuration": 60
    },
    "app/api/ingest/route.ts": {
      "maxDuration": 60
    }
  },
  "env": {
    "GROQ_API_KEY": "@groq-api-key",
    "SUPABASE_URL": "@supabase-url",
    "SUPABASE_SERVICE_KEY": "@supabase-service-key",
    "HF_TOKEN": "@hf-token"
  }
}
```

**Environment Variables**:
- `GROQ_API_KEY`: Groq API key for LLM
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_KEY`: Supabase service role key (server-side only)
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase URL (client-side)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon key (client-side)
- `HF_TOKEN`: HuggingFace API token

**Monitoring**:
- Vercel Analytics (built-in)
- Error tracking: Sentry (optional)
- Database monitoring: Supabase dashboard
- API usage tracking: Groq dashboard, HuggingFace dashboard

### Success Metrics

**Functional Metrics**:
- Document upload success rate >95%
- Query response success rate >98%
- Average response time <5 seconds
- Property test pass rate 100%
- Unit test coverage >80%

**User Experience Metrics**:
- Feedback "helpful" rate >70%
- Average session duration >5 minutes
- Queries per session >3
- Document upload completion rate >90%

**System Health Metrics**:
- API error rate <2%
- Database query latency <100ms (p95)
- Embedding API latency <2s (p95)
- LLM API latency <8s (p95)
- Uptime >99.5%

