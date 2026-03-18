# Requirements Document

## Introduction

This document defines requirements for six UX and feature improvements to the Data Vault Knowledge Assistant. The enhancements improve conversation portability (export), document management efficiency (re-ingestion), query assistance (history suggestions), retrieval quality control (similarity threshold), system resilience (streaming error recovery), and mobile accessibility (responsive layout).

The base application uses Next.js 14, React, Supabase (PostgreSQL + pgvector), HuggingFace embeddings (all-MiniLM-L6-v2), and Groq LLM (LLaMA 3.1 8B). All enhancements integrate with the existing architecture without major refactoring.

## Glossary

- **Chat_Interface**: The web-based conversational UI component in the main application page
- **Admin_Panel**: The document management UI component in the admin page
- **Export_Manager**: The client-side subsystem responsible for formatting and triggering conversation exports
- **Export_API**: The `/api/export` server-side endpoint that generates PDF exports
- **Reindex_API**: The `/api/reindex` server-side endpoint that re-processes existing documents
- **Query_API**: The `/api/query` server-side endpoint that handles user queries with optional threshold filtering
- **Query_History_Manager**: The client-side module managing query history persistence in localStorage
- **Query_History_Dropdown**: The UI component displaying recent query suggestions below the input field
- **Threshold_Manager**: The client-side module managing similarity threshold state and persistence
- **Similarity_Threshold**: A numeric value between 0.0 and 1.0 used to filter retrieved chunks by confidence score
- **Streaming_Buffer**: The in-memory buffer accumulating streamed response tokens in the Chat_Interface
- **Layout_Manager**: The responsive layout subsystem detecting viewport breakpoints and applying appropriate styles
- **Document_Chunk**: A semantically meaningful segment of a source document with an associated embedding vector
- **Partial_Content**: Streamed response tokens received before a streaming connection failure

## Requirements

### Requirement 1: Conversation Export

**User Story:** As a data engineer, I want to export my conversation history as Markdown or PDF, so that I can document, share, or archive Q&A sessions for future reference.

#### Acceptance Criteria

1. WHEN a conversation contains at least one message, THE Chat_Interface SHALL display an export button in the chat header
2. WHEN a user clicks the export button, THE Chat_Interface SHALL display a modal with format selection (Markdown or PDF) and options for timestamps, sources, and metadata
3. WHEN a user selects Markdown format and confirms, THE Export_Manager SHALL generate a Markdown file containing all messages with role indicators and trigger a browser download
4. WHEN a user selects PDF format and confirms, THE Export_Manager SHALL send the messages to the Export_API and trigger a browser download of the returned PDF
5. WHEN exporting with includeTimestamps enabled, THE Export_Manager SHALL include a timestamp for each message in the exported output
6. WHEN exporting with includeSources enabled, THE Export_Manager SHALL include source citations for assistant messages in the exported output
7. THE Export_Manager SHALL produce identical output when the same conversation is exported multiple times with identical options
8. IF the conversation contains no messages, THEN THE Chat_Interface SHALL disable the export button
9. IF PDF generation fails, THEN THE Export_API SHALL return an error response and THE Chat_Interface SHALL present Markdown export as an alternative

### Requirement 2: Document Re-ingestion

**User Story:** As a system administrator, I want to re-index existing documents without re-uploading files, so that I can update embeddings after model changes or chunking strategy updates.

#### Acceptance Criteria

1. WHEN a document has stored content, THE Admin_Panel SHALL display a re-index action in the document's action menu
2. WHEN a user initiates re-ingestion, THE Admin_Panel SHALL display a confirmation modal showing current document settings
3. WHEN re-ingestion is confirmed, THE Reindex_API SHALL fetch the document content from the `documents.content` column, re-chunk it, and generate new embeddings
4. WHEN re-ingestion completes, THE Reindex_API SHALL atomically replace old chunks with new chunks using a database transaction, updating the document's `chunk_count` and `updated_at` fields
5. WHEN re-ingestion completes successfully, THE Reindex_API SHALL return the document ID, old chunk count, and new chunk count
6. WHILE re-ingestion is in progress, THE Admin_Panel SHALL display a progress indicator showing the current stage (fetching, chunking, embedding, storing)
7. FOR ALL re-ingested documents, the content of the new chunks SHALL cover all content from the original document with no omissions
8. IF the document content column is NULL, THEN THE Reindex_API SHALL return a 404 error indicating the original content is unavailable and suggest re-uploading
9. IF the embedding API fails during re-ingestion, THEN THE Reindex_API SHALL rollback the transaction so the original chunks remain intact

### Requirement 3: Query History Suggestions

**User Story:** As a user, I want to see suggestions from my past queries when I focus the search input, so that I can quickly reuse or refine previous questions without retyping them.

#### Acceptance Criteria

1. WHEN a user focuses the query input and history exists, THE Query_History_Dropdown SHALL display recent queries in descending chronological order
2. WHEN a user types in the query input, THE Query_History_Dropdown SHALL filter displayed suggestions to those matching the current input as a prefix
3. WHEN a user selects a suggestion, THE Chat_Interface SHALL populate the query input with the selected query text
4. WHEN a query is submitted successfully, THE Query_History_Manager SHALL store the query in localStorage under the key `dv-assistant-query-history`
5. THE Query_History_Manager SHALL maintain queries in descending chronological order, with the most recently submitted query first
6. THE Query_History_Manager SHALL limit stored queries to 50 entries, removing the oldest entry when the limit is exceeded
7. WHEN a query that already exists in history is submitted, THE Query_History_Manager SHALL move it to the top of the list without creating a duplicate entry
8. IF localStorage is unavailable, THEN THE Query_History_Manager SHALL disable the history feature without displaying error messages to the user
9. IF localStorage contains corrupted history data, THEN THE Query_History_Manager SHALL clear the corrupted data and initialize fresh empty storage

### Requirement 4: Similarity Threshold Slider

**User Story:** As a data analyst, I want to control the minimum confidence score for retrieved document chunks, so that I can tune the precision of answers and filter out low-relevance results.

#### Acceptance Criteria

1. THE Chat_Interface SHALL display a similarity threshold slider in the filter bar with a range of 0.0 to 1.0
2. WHEN a user adjusts the threshold slider, THE Chat_Interface SHALL update the displayed threshold value in real time
3. WHEN a query is submitted with a Similarity_Threshold T, THE Query_API SHALL return only Document_Chunks with similarity scores greater than or equal to T
4. FOR ANY two thresholds T1 and T2 where T1 < T2, the set of chunks returned with threshold T2 SHALL be a subset of the chunks returned with threshold T1
5. THE Threshold_Manager SHALL persist the user's threshold value and enabled state in localStorage under the key `dv-assistant-preferences`
6. WHEN the threshold is set below 0.4, THE Chat_Interface SHALL display a warning indicating that low threshold values may return low-confidence results
7. IF no Document_Chunks meet the Similarity_Threshold, THEN THE Query_API SHALL return an error message advising the user to lower the threshold or rephrase the query

### Requirement 5: Streaming Error Recovery

**User Story:** As a user, I want partial responses to be preserved when my connection drops mid-stream, so that I do not lose content that was already delivered and can choose how to proceed.

#### Acceptance Criteria

1. WHEN streaming tokens are received, THE Chat_Interface SHALL accumulate all tokens in the Streaming_Buffer
2. WHEN a streaming connection fails, THE Chat_Interface SHALL preserve all tokens in the Streaming_Buffer as Partial_Content and set the message state to `hasError: true` and `isStreaming: false`
3. WHEN a streaming error occurs, THE Chat_Interface SHALL display a StreamingErrorBanner above the affected message with Retry, Keep Partial, and Edit & Retry options
4. WHEN a user clicks Retry, THE Chat_Interface SHALL clear the Partial_Content and re-submit the original query
5. WHEN a user clicks Keep Partial, THE Chat_Interface SHALL mark the message as incomplete, display the Partial_Content, and dismiss the error banner
6. WHEN a user clicks Edit & Retry, THE Chat_Interface SHALL pre-populate the query input with the original query text for the user to modify before resubmitting
7. FOR ANY streaming response that fails after receiving N tokens, all N tokens SHALL be present in the preserved Partial_Content
8. WHEN no tokens are received for 30 seconds during an active stream, THE Chat_Interface SHALL treat the connection as timed out and trigger error recovery

### Requirement 6: Mobile Responsive Layout

**User Story:** As a mobile user, I want the chat interface and admin panel to be fully usable on my phone or tablet, so that I can access the knowledge assistant from any device.

#### Acceptance Criteria

1. THE Layout_Manager SHALL detect the viewport width and apply breakpoints: mobile for widths below 641px, tablet for widths between 641px and 1024px inclusive, and desktop for widths of 1025px and above
2. WHILE on a mobile viewport, THE Chat_Interface SHALL display a single-column stacked layout with no sidebars
3. WHILE on a mobile viewport, THE Admin_Panel SHALL display documents in a single-column card layout
4. THE Mobile_Layout SHALL ensure all interactive elements have a minimum touch target size of 44x44 pixels on mobile viewports
5. WHILE on a mobile viewport, THE Chat_Interface SHALL display a collapsible filter bar to preserve vertical space
6. WHILE on a mobile viewport, THE Chat_Interface SHALL anchor the query input to the bottom of the viewport and handle virtual keyboard appearance
7. IF the viewport width is below 320px, THEN THE Layout_Manager SHALL display an overlay message recommending landscape orientation or a larger device

