'use client';

/**
 * PdfViewerModal — production-ready inline PDF viewer
 *
 * Props:
 *   pdfUrl       — URL or path to the PDF file
 *   pageNumber   — page to jump to on open (1-indexed)
 *   highlightText — string (or string[]) to highlight on the page
 *   title        — optional display title shown in header
 *   isOpen       — controlled open state
 *   onClose      — close callback
 *
 * Usage:
 *   <PdfViewerModal
 *     isOpen={open}
 *     onClose={() => setOpen(false)}
 *     pdfUrl="/docs/data-vault.pdf"
 *     pageNumber={87}
 *     highlightText="Data Vault hub"
 *     title="Building a Scalable Data Warehouse"
 *   />
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

// Point pdfjs worker at the bundled CDN copy — avoids webpack config changes
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl: string;
  pageNumber?: number;
  highlightText?: string | string[];
  title?: string;
}

// ── Highlight text renderer ───────────────────────────────────────────────────
/**
 * Custom text renderer that wraps matching phrases in a <mark> span.
 * react-pdf calls this for every text item on the page.
 */
function makeTextRenderer(phrases: string[]) {
  return function customTextRenderer({ str }: { str: string }): string {
    if (!phrases.length || !str.trim()) return str;

    let result = str;
    for (const phrase of phrases) {
      if (!phrase.trim()) continue;
      // Case-insensitive global replace — wrap in mark
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(
        new RegExp(escaped, 'gi'),
        (match) =>
          `<mark style="background:rgba(250,204,21,0.55);border-radius:3px;padding:0 1px;">${match}</mark>`
      );
    }
    return result;
  };
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PdfViewerModal({
  isOpen,
  onClose,
  pdfUrl,
  pageNumber = 1,
  highlightText,
  title,
}: PdfViewerModalProps) {
  const [numPages, setNumPages]     = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(pageNumber);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  const containerRef = useRef<HTMLDivElement>(null);
  const modalRef     = useRef<HTMLDivElement>(null);

  // Normalise highlightText to string[]
  const phrases: string[] = highlightText
    ? Array.isArray(highlightText) ? highlightText : [highlightText]
    : [];

  const textRenderer = makeTextRenderer(phrases);

  // Sync page when prop changes (e.g. opening for a different source)
  useEffect(() => {
    if (isOpen) setCurrentPage(pageNumber);
  }, [isOpen, pageNumber]);

  // Measure container width for responsive page rendering
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(Math.floor(w) - 32); // 16px padding each side
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [isOpen]);

  // ESC key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Focus trap — keep focus inside modal
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;
    modalRef.current.focus();
  }, [isOpen]);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  }, []);

  const onDocumentLoadError = useCallback((err: Error) => {
    setError(`Failed to load PDF: ${err.message}`);
    setLoading(false);
  }, []);

  const goTo = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, numPages)));
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'PDF Viewer'}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-2xl outline-none"
        style={{ width: '85vw', maxWidth: 960, height: '88vh' }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/>
            </svg>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
              {title ?? pdfUrl.split('/').pop()}
            </span>
            {!loading && numPages > 0 && (
              <span className="text-xs text-gray-400 flex-shrink-0">
                Page {currentPage} of {numPages}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
            aria-label="Close PDF viewer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* ── PDF canvas area ── */}
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-100 dark:bg-gray-800 flex flex-col items-center py-4 px-4"
        >
          {error ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <span className="text-3xl">⚠️</span>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Could not load PDF</p>
              <p className="text-xs text-gray-500">{error}</p>
            </div>
          ) : (
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={<LoadingSpinner />}
              error={null}
            >
              {loading && <LoadingSpinner />}
              {!loading && (
                <Page
                  key={currentPage}
                  pageNumber={currentPage}
                  width={containerWidth}
                  customTextRenderer={textRenderer}
                  renderAnnotationLayer={false}
                  loading={<LoadingSpinner />}
                  className="shadow-lg rounded-lg overflow-hidden"
                />
              )}
            </Document>
          )}
        </div>

        {/* ── Footer navigation ── */}
        {!loading && !error && numPages > 0 && (
          <div className="flex items-center justify-center gap-3 px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
            <button
              onClick={() => goTo(currentPage - 1)}
              disabled={currentPage <= 1}
              className="flex items-center gap-1 text-xs px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
              </svg>
              Prev
            </button>

            {/* Page jump input */}
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span>Go to</span>
              <input
                type="number"
                min={1}
                max={numPages}
                value={currentPage}
                onChange={(e) => goTo(Number(e.target.value))}
                className="w-14 text-center border border-gray-300 dark:border-gray-600 rounded-md px-1.5 py-1 text-xs bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-blue-400"
              />
              <span>/ {numPages}</span>
            </div>

            <button
              onClick={() => goTo(currentPage + 1)}
              disabled={currentPage >= numPages}
              className="flex items-center gap-1 text-xs px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Loading spinner ───────────────────────────────────────────────────────────
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );
}
