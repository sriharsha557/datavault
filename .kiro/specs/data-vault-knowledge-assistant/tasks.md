# Implementation Plan: Data Vault Knowledge Assistant

## Overview

This implementation plan builds a production-ready RAG application using Next.js 14, TypeScript, React, Supabase (PostgreSQL + pgvector), HuggingFace embeddings, and Groq LLM. The system enables natural language queries over Data Vault documentation with semantic search, streaming responses, and source attribution.

The implementation follows a phased approach: core infrastructure setup, document processing pipeline, RAG query pipeline, feedback collection, and deployment. Each task builds incrementally with property-based tests validating correctness properties and unit tests covering specific scenarios.

## Tasks

- [x] 1. Set up core infrastructure and database
  - Initialize Next.js 14 project with TypeScript and Tailwind CSS
  - Configure Supabase project and run schema migrations (documents, chunks, feedback tables)
  - Set up pgvector extension and IVFFlat index
  - Configure environment variables (.env.local with API keys)
  - Set up Jest testing framework with fast-check for property-based testing
  - Create Supabase client wrapper with typed operations
  - Implement error handling utilities and logging infrastructure
  - _Requirements: 13.1, 13.2, 13.6_

- [ ] 2. Implement document processing pipeline
  - [x] 2.1 Create text extraction module
    - Implement PDF extractor using pdf-parse with page number preservation
    - Implement DOCX extractor using mammoth
    - Implement plain text and Markdown file readers
    - Add document type detection from filename patterns
    - Handle extraction errors with descriptive messages
    - _Requirements: 2.1, 2.2, 2.3, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x]* 2.2 Write unit tests for text extractors
    - Test PDF extraction with sample documents
    - Test DOCX extraction with sample documents
    - Test plain text and Markdown extraction
    - Test error handling for corrupted files
    - Test page number metadata preservation
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x]* 2.3 Write property test for text extraction completeness
    - **Property 4: Text Extraction Completeness**
    - **Validates: Requirements 2.6, 3.3, 3.6**

  - [x] 2.4 Implement document chunking algorithm
    - Create chunker with 800-character target size and 120-character overlap
    - Preserve sentence boundaries using separator hierarchy
    - Associate chunks with page numbers from extraction metadata
    - Ensure minimum chunk size (40 characters) and discard smaller chunks
    - Generate chunk metadata (index, offsets, page numbers)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x]* 2.5 Write unit tests for chunker
    - Test chunking with various document sizes
    - Test sentence boundary preservation
    - Test page number association
    - Test edge cases (empty document, single sentence, very long document)
    - _Requirements: 4.1, 4.2, 4.4_

  - [x]* 2.6 Write property test for chunk overlap invariant
    - **Property 7: Chunk Overlap Invariant**
    - **Validates: Requirements 4.3, 18.1, 18.2**

  - [ ]* 2.7 Write property test for chunk size bounds
    - **Property 8: Chunk Size Bounds**
    - **Validates: Requirements 4.2**

  - [ ]* 2.8 Write property test for chunk completeness
    - **Property 9: Chunk Completeness**
    - **Validates: Requirements 18.4**

  - [ ]* 2.9 Write property test for chunk coverage
    - **Property 10: Chunk Coverage**
    - **Validates: Requirements 18.3**

  - [ ]* 2.10 Write property test for minimum chunk count
    - **Property 11: Minimum Chunk Count**
    - **Validates: Requirements 4.7**

  - [ ]* 2.11 Write property test for chunk metadata association
    - **Property 12: Chunk Metadata Association**
    - **Validates: Requirements 4.5, 4.6**

- [ ] 3. Implement embedding generation module
  - [x] 3.1 Create HuggingFace API client
    - Implement embedding generation using all-MiniLM-L6-v2 model
    - Add batch embedding support (10 texts per request)
    - Implement retry logic with exponential backoff (3 attempts)
    - Handle rate limiting (429 responses)
    - Add 10-second timeout per request
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 3.2 Write unit tests for embedding generator
    - Test single embedding generation
    - Test batch embedding generation
    - Test retry logic on transient failures
    - Test timeout handling
    - Test rate limit handling
    - _Requirements: 5.1, 5.5, 5.6_

  - [ ]* 3.3 Write property test for embedding model consistency
    - **Property 5: Embedding Model Consistency**
    - **Validates: Requirements 5.2, 5.4, 17.1, 17.2, 17.6**

  - [ ]* 3.4 Write property test for embedding dimensionality
    - **Property 6: Embedding Dimensionality Invariant**
    - **Validates: Requirements 5.3**

- [ ] 4. Implement document ingest API endpoint
  - [x] 4.1 Create /api/ingest route handler
    - Parse multipart/form-data file uploads
    - Validate file type (.pdf, .docx, .txt, .md) and size (max 10MB)
    - Reject executable file extensions
    - Extract text using appropriate extractor
    - Chunk document with overlap
    - Generate embeddings in batches
    - Insert document and chunks in database transaction
    - Handle errors with rollback and descriptive messages
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.8, 11.1, 11.2, 13.4, 13.5, 16.4, 16.5_

  - [ ]* 4.2 Write unit tests for ingest endpoint
    - Test successful document upload and processing
    - Test file type validation
    - Test file size validation
    - Test executable file rejection
    - Test transaction rollback on failure
    - Test error message sanitization
    - _Requirements: 2.4, 2.5, 2.7, 2.8, 11.1, 11.2, 16.4, 16.5_

  - [ ]* 4.3 Write property test for persistence completeness
    - **Property 13: Persistence Completeness**
    - **Validates: Requirements 6.1, 6.2, 6.6, 13.1, 13.2**

  - [ ]* 4.4 Write property test for transaction atomicity
    - **Property 30: Transaction Atomicity**
    - **Validates: Requirements 13.4, 13.5**

- [ ] 5. Implement document management API endpoint
  - [x] 5.1 Create /api/documents route handler
    - Implement GET handler to list all documents with metadata
    - Implement DELETE handler to remove document and cascade delete chunks
    - Add error handling for database operations
    - _Requirements: 13.1, 13.2, 13.7_

  - [ ]* 5.2 Write unit tests for document management
    - Test document listing
    - Test document deletion with cascade
    - Test error handling
    - _Requirements: 13.1, 13.2_

- [x] 6. Checkpoint - Ensure document processing works end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement RAG retrieval engine
  - [x] 7.1 Create vector similarity search function
    - Implement query embedding generation
    - Call Supabase match_chunks RPC function
    - Support optional document type filtering
    - Return top K chunks with metadata and similarity scores
    - Handle empty result sets (no chunks above threshold)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ]* 7.2 Write unit tests for retrieval
    - Test retrieval with known query and documents
    - Test document type filtering
    - Test empty result handling
    - Test performance (< 1 second)
    - _Requirements: 7.1, 7.2, 7.3, 7.6, 7.7_

  - [ ]* 7.3 Write property test for retrieval ranking monotonicity
    - **Property 14: Retrieval Ranking Monotonicity**
    - **Validates: Requirements 7.4, 19.1, 19.2**

  - [ ]* 7.4 Write property test for retrieval result bounds
    - **Property 15: Retrieval Result Bounds**
    - **Validates: Requirements 7.3, 19.4**

  - [ ]* 7.5 Write property test for retrieval determinism
    - **Property 16: Retrieval Determinism**
    - **Validates: Requirements 19.3**

  - [ ]* 7.6 Write property test for retrieved chunk metadata completeness
    - **Property 17: Retrieved Chunk Metadata Completeness**
    - **Validates: Requirements 7.5**

- [ ] 8. Implement context window construction
  - [ ] 8.1 Create context builder function
    - Concatenate retrieved chunks with source metadata
    - Format context with document name, page number, and type
    - Order chunks by relevance score
    - Estimate token count (characters / 4)
    - Truncate lowest-ranked chunks if exceeding 3000 token limit
    - Generate formatted prompt for LLM
    - _Requirements: 8.1, 8.2, 20.1, 20.2, 20.3, 20.4, 20.5_

  - [ ]* 8.2 Write unit tests for context construction
    - Test context formatting with multiple chunks
    - Test token limit enforcement
    - Test chunk ordering by relevance
    - Test truncation behavior
    - _Requirements: 8.1, 20.1, 20.2, 20.3, 20.4, 20.5_

  - [ ]* 8.3 Write property test for context window construction
    - **Property 18: Context Window Construction**
    - **Validates: Requirements 8.1, 20.1, 20.2, 20.3**

  - [ ]* 8.4 Write property test for context window token limit
    - **Property 19: Context Window Token Limit**
    - **Validates: Requirements 20.4**

  - [ ]* 8.5 Write property test for context window subset property
    - **Property 20: Context Window Subset Property**
    - **Validates: Requirements 20.6**

- [ ] 9. Implement LLM answer generation
  - [ ] 9.1 Create Groq API client with streaming
    - Implement streaming response using Groq LLaMA 3.1 8B model
    - Handle Server-Sent Events (SSE) for token streaming
    - Add timeout handling (60 seconds)
    - Implement retry logic for transient failures
    - Handle API errors gracefully
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ]* 9.2 Write unit tests for LLM client
    - Test streaming response handling
    - Test timeout behavior
    - Test error handling
    - Test retry logic
    - _Requirements: 8.2, 8.7_

  - [ ]* 9.3 Write property test for response length bounds
    - **Property 21: Response Length Bounds**
    - **Validates: Requirements 8.6**

- [ ] 10. Implement query API endpoint
  - [ ] 10.1 Create /api/query route handler
    - Validate query input (1-500 characters, sanitization)
    - Generate query embedding
    - Perform vector similarity search
    - Construct context window
    - Stream LLM response via SSE
    - Send source citations as separate SSE event
    - Handle errors and timeouts
    - _Requirements: 1.3, 1.6, 7.1, 7.2, 8.1, 8.2, 11.3, 11.4, 16.1, 16.2, 16.3_

  - [ ]* 10.2 Write unit tests for query endpoint
    - Test successful query processing
    - Test query validation
    - Test streaming response
    - Test source citation inclusion
    - Test error handling
    - Test timeout handling
    - _Requirements: 1.3, 1.6, 11.3, 16.1, 16.2_

  - [ ]* 10.3 Write property test for query length validation
    - **Property 2: Query Length Validation**
    - **Validates: Requirements 1.6, 16.1, 16.2**

  - [ ]* 10.4 Write property test for input sanitization
    - **Property 32: Input Sanitization**
    - **Validates: Requirements 16.3**

- [ ] 11. Checkpoint - Ensure RAG query pipeline works end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Implement chat interface frontend
  - [x] 12.1 Create ChatWindow component
    - Display conversation history with messages
    - Render user queries and assistant responses
    - Show loading indicator during processing
    - Handle streaming response updates
    - Display error messages
    - Maintain session-scoped message state
    - Auto-scroll to latest message
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.7, 15.1, 15.2, 15.5_

  - [ ]* 12.2 Write unit tests for ChatWindow
    - Test message display
    - Test loading state
    - Test error display
    - Test auto-scroll behavior
    - _Requirements: 1.2, 1.4, 1.7_

  - [ ]* 12.3 Write property test for conversation history completeness
    - **Property 1: Conversation History Completeness**
    - **Validates: Requirements 1.2, 1.4, 15.1, 15.2**

  - [ ] 12.2 Create query input component
    - Implement controlled text input field
    - Add client-side validation (1-500 characters)
    - Disable submit during processing
    - Trim whitespace before submission
    - Display validation errors inline
    - _Requirements: 1.1, 1.6, 16.1, 16.2_

  - [ ]* 12.3 Write unit tests for query input
    - Test input validation
    - Test submit button state
    - Test whitespace trimming
    - Test error display
    - _Requirements: 1.1, 1.6, 16.1, 16.2_

  - [ ] 12.4 Create MessageDisplay component
    - Render message content with markdown support
    - Display timestamps for each message
    - Show user vs assistant message styling
    - _Requirements: 1.2, 1.4, 15.6_

  - [ ]* 12.5 Write property test for timestamp invariant
    - **Property 27: Timestamp Invariant**
    - **Validates: Requirements 15.6**

- [ ] 13. Implement source citation display
  - [ ] 13.1 Create SourceCitation component
    - Display document filename for each citation
    - Display page number when available
    - Display document type
    - Display similarity score
    - Order citations by relevance score
    - Limit display to 5 citations
    - Use visually distinct styling
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [ ]* 13.2 Write unit tests for source citations
    - Test citation rendering with all fields
    - Test citation rendering without page numbers
    - Test citation ordering
    - Test citation count limit
    - _Requirements: 9.1, 9.2, 9.3, 9.5, 9.6_

  - [ ]* 13.3 Write property test for source citation count bounds
    - **Property 22: Source Citation Count Bounds**
    - **Validates: Requirements 9.5**

  - [ ]* 13.4 Write property test for source citation ordering
    - **Property 23: Source Citation Ordering**
    - **Validates: Requirements 9.6**

  - [ ]* 13.5 Write property test for source citation required fields
    - **Property 24: Source Citation Required Fields**
    - **Validates: Requirements 9.2, 9.3**

- [ ] 14. Implement document management UI
  - [x] 14.1 Create DocumentPanel component
    - Display list of uploaded documents with metadata
    - Show document status (processing, ready, error)
    - Show chunk count and file size
    - Implement file upload with drag-and-drop
    - Add document type selection/override
    - Display upload progress
    - Implement document deletion
    - Handle upload errors with user-friendly messages
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.8, 11.1_

  - [ ]* 14.2 Write unit tests for DocumentPanel
    - Test document list rendering
    - Test file upload handling
    - Test document deletion
    - Test error display
    - Test drag-and-drop
    - _Requirements: 2.4, 2.5, 11.1_

  - [ ]* 14.3 Write property test for file type validation
    - **Property 3: File Type Validation**
    - **Validates: Requirements 2.4, 2.5, 16.4**

  - [ ]* 14.4 Write property test for executable file rejection
    - **Property 33: Executable File Rejection**
    - **Validates: Requirements 16.5**

- [ ] 15. Implement feedback collection system
  - [ ] 15.1 Create FeedbackButtons component
    - Display "helpful" and "not helpful" buttons
    - Disable buttons after submission
    - Show confirmation message after submission
    - Style buttons distinctly
    - _Requirements: 10.1, 10.2, 10.3, 10.5_

  - [ ] 15.2 Create /api/feedback route handler
    - Accept feedback submissions (message ID, query, response, rating)
    - Validate feedback data
    - Persist feedback to database
    - Enforce one feedback per message (idempotence)
    - _Requirements: 10.4, 10.6, 10.7, 13.3_

  - [ ]* 15.3 Write unit tests for feedback system
    - Test feedback submission
    - Test feedback persistence
    - Test idempotence (duplicate submissions)
    - Test validation
    - _Requirements: 10.4, 10.6, 10.7_

  - [ ]* 15.4 Write property test for feedback persistence
    - **Property 25: Feedback Persistence**
    - **Validates: Requirements 10.4, 10.7, 13.3**

  - [ ]* 15.5 Write property test for feedback idempotence
    - **Property 26: Feedback Idempotence**
    - **Validates: Requirements 10.6**

- [ ] 16. Implement error handling and logging
  - [ ] 16.1 Create error handling utilities
    - Implement error classification (client vs server, retryable vs permanent)
    - Create error response formatter with sanitization
    - Implement retry logic with exponential backoff
    - Add error logging with structured format
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [ ]* 16.2 Write unit tests for error handling
    - Test error classification
    - Test error message sanitization
    - Test retry logic
    - Test error logging
    - _Requirements: 11.5, 11.6_

  - [ ]* 16.3 Write property test for error message sanitization
    - **Property 28: Error Message Sanitization**
    - **Validates: Requirements 11.6**

  - [ ]* 16.4 Write property test for error logging completeness
    - **Property 29: Error Logging Completeness**
    - **Validates: Requirements 11.5**

  - [ ]* 16.5 Write property test for data validation before storage
    - **Property 34: Data Validation Before Storage**
    - **Validates: Requirements 16.6**

- [ ] 17. Implement main page and layout
  - [x] 17.1 Create app/page.tsx
    - Compose ChatWindow and DocumentPanel components
    - Implement responsive layout (side-by-side on desktop, stacked on mobile)
    - Add application header and branding
    - _Requirements: 1.1, 12.4_

  - [x] 17.2 Create app/layout.tsx
    - Set up root layout with metadata
    - Configure Tailwind CSS
    - Add global styles
    - _Requirements: 12.4_

  - [ ]* 17.3 Write unit tests for page layout
    - Test component composition
    - Test responsive behavior
    - _Requirements: 12.4_

- [ ] 18. Checkpoint - Ensure complete application works end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 19. Integration testing and performance optimization
  - [ ]* 19.1 Write integration tests for document ingestion flow
    - Test end-to-end document upload, processing, and storage
    - Test transaction rollback on failures
    - Test performance (< 60 seconds for 10MB document)
    - _Requirements: 2.7, 12.3, 13.4, 13.5_

  - [ ]* 19.2 Write integration tests for query flow
    - Test end-to-end query processing with streaming
    - Test source citation inclusion
    - Test performance (< 10 seconds for 95% of queries)
    - _Requirements: 1.3, 12.1, 12.2_

  - [ ]* 19.3 Write integration tests for feedback flow
    - Test end-to-end feedback submission and persistence
    - _Requirements: 10.7, 13.3_

  - [ ] 19.4 Performance testing and optimization
    - Test concurrent user load (50 users)
    - Optimize database queries and indexes
    - Optimize embedding batch sizes
    - Test and optimize page load time (< 3 seconds)
    - _Requirements: 12.4, 12.5_

- [ ] 20. Documentation and deployment preparation
  - [ ] 20.1 Create comprehensive README
    - Document system architecture and features
    - Provide setup instructions (environment variables, database)
    - Document API endpoints
    - Include usage examples
    - Add troubleshooting guide

  - [ ] 20.2 Create deployment configuration
    - Configure Vercel deployment settings (function timeouts)
    - Set up environment variables in Vercel
    - Configure custom domain (optional)
    - Create deployment runbook

  - [ ] 20.3 Security audit and hardening
    - Review input validation and sanitization
    - Review error message sanitization
    - Review environment variable security
    - Add rate limiting to API routes
    - Configure Content Security Policy headers
    - _Requirements: 11.6, 16.3, 16.5, 16.6_

- [ ] 21. Final checkpoint - Production readiness verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional testing tasks and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties across all inputs (minimum 100 iterations)
- Unit tests validate specific examples, edge cases, and error conditions
- Checkpoints ensure incremental validation at major milestones
- Implementation uses TypeScript, Next.js 14, React, Supabase, HuggingFace API, and Groq API
- All property tests use fast-check library with tag format: `// Feature: data-vault-knowledge-assistant, Property {N}: {title}`
- Testing tasks are complementary: both property tests and unit tests are valuable for comprehensive coverage
