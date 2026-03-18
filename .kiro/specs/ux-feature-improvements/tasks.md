# Implementation Plan: UX Feature Improvements

## Overview

This plan implements six UX enhancements to the Data Vault Knowledge Assistant: conversation export (Markdown/PDF), document re-ingestion, query history suggestions, similarity threshold slider, streaming error recovery, and mobile responsive layout. The implementation uses TypeScript, Next.js 14, React, Tailwind CSS, and the existing Supabase/HuggingFace/Groq stack.

Each task builds incrementally, wiring new components into the existing `ChatWindow` and `DocumentPanel` as the final step of each feature.

## Tasks

- [x] 1. Update shared types and database schema
  - Add `ExportOptions`, `ExportRequest`, `ExportResponse`, `ReindexRequest`, `ReindexResponse`, `ReindexProgress`, `QueryHistoryEntry`, `SimilarityThresholdConfig`, `StreamingState`, `Breakpoint`, and `ResponsiveConfig` to `types.ts`
  - Add `similarity_threshold` field to the existing `QueryRequest` interface in `types.ts`
  - Write and apply SQL migration: add `content TEXT` and `updated_at TIMESTAMPTZ DEFAULT now()` columns to the `documents` table, plus `idx_documents_updated_at` index
  - _Requirements: 2.1, 2.3, 4.1, 5.1_

- [x] 2. Implement Conversation Export
  - [x] 2.1 Create `lib/export.ts` with Markdown formatter
    - Implement `exportToMarkdown(messages, options)` that formats messages with role indicators, optional timestamps, optional source citations as footnotes, and a metadata header
    - Implement `triggerDownload(content, filename, mimeType)` using the browser Download API
    - _Requirements: 1.3, 1.5, 1.6, 1.7_

  - [ ]* 2.2 Write property test for export idempotence
    - **Property 2: Export Idempotence**
    - **Validates: Requirement 1.7**

  - [ ]* 2.3 Write property test for export content completeness
    - **Property 1: Export Content Completeness**
    - **Validates: Requirements 1.3, 1.4**

  - [ ]* 2.4 Write property test for export options inclusion
    - **Property 3: Export Options Inclusion**
    - **Validates: Requirements 1.5, 1.6**

  - [x] 2.5 Create `app/api/export/route.ts` POST handler
    - Accept `ExportRequest` body, validate message array is non-empty
    - Generate PDF using `jspdf`, return base64-encoded PDF data in JSON response
    - Return 500 with `{ error: 'PDF generation failed' }` on failure
    - _Requirements: 1.4, 1.9_

  - [x] 2.6 Create `app/components/ExportModal.tsx`
    - Render format selector (Markdown / PDF), toggles for includeTimestamps, includeSources, includeMetadata
    - On confirm: call `exportToMarkdown` and `triggerDownload` for Markdown; POST to `/api/export` and trigger download for PDF
    - Display error message and highlight Markdown option if PDF fails
    - _Requirements: 1.2, 1.3, 1.4, 1.9_

  - [x] 2.7 Create `app/components/ExportButton.tsx` and wire into `ChatWindow`
    - Render button disabled when `messages.length === 0`, otherwise open `ExportModal`
    - Add `ExportButton` to the chat header in `app/components/ChatWindow.tsx`
    - _Requirements: 1.1, 1.8_

- [ ] 3. Checkpoint — Export feature complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Document Re-ingestion
  - [ ] 4.1 Create `app/api/reindex/route.ts` POST handler
    - Accept `{ documentId: string }`, validate UUID format
    - Fetch `documents.content` for the given ID; return 404 with suggestion to re-upload if NULL
    - Re-chunk content using existing `lib/chunker.ts`, generate embeddings via `lib/embeddings.ts` in batches of 10
    - Wrap DELETE old chunks + INSERT new chunks + UPDATE `chunk_count`/`updated_at` in a single Supabase transaction; rollback on any failure
    - Return `ReindexResponse` with `oldChunkCount` and `newChunkCount`
    - _Requirements: 2.3, 2.4, 2.5, 2.7, 2.8, 2.9_

  - [ ]* 4.2 Write property test for re-ingestion content preservation
    - **Property 4: Re-ingestion Content Preservation**
    - **Validates: Requirement 2.7**

  - [ ]* 4.3 Write property test for re-ingestion atomicity
    - **Property 5: Re-ingestion Atomicity**
    - **Validates: Requirements 2.4, 2.9**

  - [ ] 4.4 Create `app/components/ReindexButton.tsx` and wire into `DocumentPanel`
    - Render button only when `document.content` is not null
    - Show confirmation modal with current document settings before calling `/api/reindex`
    - Display progress stages (fetching → chunking → embedding → storing) and update document row with new `chunk_count` on success
    - Show error message if re-index fails
    - Add `ReindexButton` to each document row in `app/components/DocumentPanel.tsx`
    - _Requirements: 2.1, 2.2, 2.6_

- [ ] 5. Checkpoint — Re-ingestion feature complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Query History
  - [x] 6.1 Create `lib/queryHistory.ts` — `QueryHistoryManager` class
    - Implement `addQuery(query)`: deduplicate (move to top if exists), prepend new entry, prune to 50 entries, persist to `localStorage` under key `dv-assistant-query-history`
    - Implement `getRecentQueries(limit?)`: return entries in descending chronological order
    - Implement `searchHistory(prefix)`: return entries whose `query` starts with `prefix` (case-insensitive)
    - Implement `clearHistory()`: remove key from localStorage
    - Gracefully disable all operations (no errors thrown) when localStorage is unavailable or data is corrupted; clear corrupted data and reinitialize
    - _Requirements: 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [ ]* 6.2 Write property test for query history chronological order
    - **Property 6: Query History Chronological Order**
    - **Validates: Requirements 3.1, 3.5**

  - [ ]* 6.3 Write property test for query history bounded size
    - **Property 7: Query History Bounded Size**
    - **Validates: Requirement 3.6**

  - [ ]* 6.4 Write property test for query history deduplication
    - **Property 8: Query History Deduplication**
    - **Validates: Requirement 3.7**

  - [ ]* 6.5 Write property test for query history prefix filtering
    - **Property 9: Query History Prefix Filtering**
    - **Validates: Requirement 3.2**

  - [x] 6.6 Create `app/components/QueryHistoryDropdown.tsx` and wire into `ChatWindow`
    - Show dropdown below query input on focus when history is non-empty
    - Filter suggestions in real time as user types (prefix match, max 10 shown)
    - On suggestion click, call `onSelectQuery` to populate the input
    - Integrate `QueryHistoryManager` into `ChatWindow`: call `addQuery` after a successful response, pass `onSelectQuery` handler to populate input
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 7. Implement Similarity Threshold Slider
  - [x] 7.1 Create `app/components/SimilarityThresholdSlider.tsx`
    - Render range input (0.0–1.0, step 0.05) with enable/disable toggle and real-time value display
    - Display warning when value < 0.4
    - Persist `{ enabled, value }` to localStorage under key `dv-assistant-preferences` on change
    - Load persisted value on mount
    - _Requirements: 4.1, 4.2, 4.5, 4.6_

  - [x] 7.2 Update `app/api/query/route.ts` to accept and apply `similarity_threshold`
    - Read optional `similarity_threshold` from request body
    - After retrieving chunks, filter to those with `similarity >= similarity_threshold` (when provided and enabled)
    - Return error message `'No documents meet the similarity threshold. Try lowering the threshold or rephrasing your query.'` when filtered set is empty
    - _Requirements: 4.3, 4.7_

  - [ ]* 7.3 Write property test for similarity threshold filtering
    - **Property 10: Similarity Threshold Filtering**
    - **Validates: Requirement 4.3**

  - [ ]* 7.4 Write property test for threshold monotonicity
    - **Property 11: Threshold Monotonicity**
    - **Validates: Requirement 4.4**

  - [x] 7.5 Wire `SimilarityThresholdSlider` into `ChatWindow`
    - Add slider to the filter bar in `ChatWindow`, collapsible on mobile
    - Pass current threshold value to the query submission handler
    - _Requirements: 4.1, 4.2_

- [ ] 8. Checkpoint — Query history and threshold complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement Streaming Error Recovery
  - [x] 9.1 Create `lib/streamingBuffer.ts` — `StreamingBuffer` class
    - Implement `append(token: string)`: accumulate tokens in internal string
    - Implement `getPartialContent()`: return accumulated string
    - Implement `clear()`: reset buffer
    - Implement `startTimeoutWatcher(ms, onTimeout)`: call `onTimeout` if no `append` call occurs within `ms` milliseconds; cancel on `clear()`
    - _Requirements: 5.1, 5.7, 5.8_

  - [ ]* 9.2 Write property test for partial content preservation
    - **Property 12: Partial Content Preservation**
    - **Validates: Requirements 5.1, 5.7**

  - [x] 9.3 Create `app/components/StreamingErrorBanner.tsx`
    - Accept `{ partialContent, onRetry, onKeep, onEditRetry }` props
    - Render Retry, Keep Partial, and Edit & Retry action buttons
    - _Requirements: 5.3, 5.4, 5.5, 5.6_

  - [x] 9.4 Update `app/components/ChatWindow.tsx` to use `StreamingBuffer` and handle errors
    - Instantiate `StreamingBuffer` per active stream; feed each received token into it
    - On `EventSource` `onerror` or timeout (30 s without tokens): set message state to `{ hasError: true, isStreaming: false }`, preserve `partialContent` from buffer
    - Render `StreamingErrorBanner` above the affected message
    - Wire Retry (clear partial, re-submit), Keep Partial (mark incomplete, dismiss banner), and Edit & Retry (populate input with original query) handlers
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8_

  - [ ]* 9.5 Write property test for streaming error state consistency
    - **Property 13: Streaming Error State Consistency**
    - **Validates: Requirement 5.2**

- [ ] 10. Checkpoint — Streaming error recovery complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement Mobile Responsive Layout
  - [x] 11.1 Create `app/components/MobileLayout.tsx` with `useBreakpoint` hook
    - Implement `useBreakpoint()` hook using `window.matchMedia` / `ResizeObserver`: return `'mobile'` for width < 641 px, `'tablet'` for 641–1024 px, `'desktop'` for ≥ 1025 px
    - Implement `MobileLayout` wrapper that renders an orientation overlay when viewport width < 320 px
    - _Requirements: 6.1, 6.7_

  - [ ]* 11.2 Write property test for mobile breakpoint consistency
    - **Property 14: Mobile Breakpoint Consistency**
    - **Validates: Requirement 6.1**

  - [x] 11.3 Apply responsive Tailwind classes to `app/components/ChatWindow.tsx`
    - Single-column stacked layout on mobile (`flex-col` / `md:flex-row`)
    - Collapsible filter bar on mobile (hidden by default, toggle button visible)
    - Bottom-anchored query input on mobile (`fixed bottom-0` with padding for virtual keyboard)
    - Ensure all interactive elements meet 44×44 px touch target minimum (padding adjustments)
    - _Requirements: 6.2, 6.4, 6.5, 6.6_

  - [x] 11.4 Apply responsive Tailwind classes to `app/components/DocumentPanel.tsx`
    - Single-column card layout on mobile (`grid-cols-1` / `md:grid-cols-2`)
    - Touch-friendly action buttons with minimum 44×44 px targets
    - _Requirements: 6.3, 6.4_

  - [ ]* 11.5 Write property test for touch target size
    - **Property 15: Touch Target Size**
    - **Validates: Requirement 6.4**

- [ ] 12. Final checkpoint — All features integrated
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Property tests use `fast-check` with tag format: `// Feature: ux-feature-improvements, Property {N}: {title}`
- All property tests run a minimum of 100 iterations
- The `content` column migration must be applied before any re-ingestion tasks are tested
- `jspdf` must be added to `package.json` before task 2.5 is implemented
