'use client';

/**
 * DocumentViewerModal — unified document viewer modal
 *
 * One modal shell, three content renderers:
 *   .pdf  → PDF.js (react-pdf) with page nav + text highlight
 *   .docx → mammoth (browser build) → HTML → rendered inline
 *   .json / .jsonl → chunks → Markdown → react-markdown
 *
 * Props:
 *   isOpen        — controlled open state
 *   onClose       — close callback
 *   fileUrl       — URL/path to the file (extension determines renderer)
 *   title         — display name shown in header
 *   pageNumber    — (PDF only) page to jump to on open
 *   highlightText — text to highlight (string or string[])
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ── Types ─────────────────────────────────────────────────────────────────────
export interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  title?: string;
  pageNumber?: number;
  highlightText?: string | string[];
}

type FileType = 'pdf' | 'docx' | 'json' | 'unknown';

function detectType(url: string): FileType {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'pdf')  return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'json' || ext === 'jsonl') return 'json';
  return 'unknown';
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function normaliseHighlights(h?: string | string[]): string[] {
  if (!h) return [];
  return (Array.isArray(h) ? h : [h]).filter(Boolean);
}

/** Wrap matching phrases in <mark> inside a plain string */
function applyHighlights(text: string, phrases: string[]): string {
  let out = text;
  for (const p of phrases) {
    if (!p.trim()) continue;
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(
      new RegExp(esc, 'gi'),
      (m) => `<mark style="background:rgba(250,204,21,0.55);border-radius:3px;padding:0 1px;">${m}</mark>`,
    );
  }
  return out;
}

// ── Modal shell ───────────────────────────────────────────────────────────────
export default function DocumentViewerModal({
  isOpen,
  onClose,
  fileUrl,
  title,
  pageNumber = 1,
  highlightText,
}: DocumentViewerModalProps) {
  const fileType = detectType(fileUrl);
  const phrases  = normaliseHighlights(highlightText);
  const modalRef = useRef<HTMLDivElement>(null);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [isOpen, onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Focus trap
  useEffect(() => {
    if (isOpen) modalRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  const displayTitle = title ?? fileUrl.split('/').pop() ?? 'Document';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={displayTitle}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-2xl outline-none overflow-hidden"
        style={{ width: '85vw', maxWidth: 960, height: '88vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-2 min-w-0">
            <FileIcon type={fileType} />
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
              {displayTitle}
            </span>
            <TypeBadge type={fileType} />
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0 ml-3"
            aria-label="Close viewer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Content — renderer selected by file type */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {fileType === 'pdf'  && <PdfRenderer     fileUrl={fileUrl} pageNumber={pageNumber} phrases={phrases} />}
          {fileType === 'docx' && <DocxRenderer    fileUrl={fileUrl} phrases={phrases} />}
          {fileType === 'json' && <JsonRenderer    fileUrl={fileUrl} phrases={phrases} />}
          {fileType === 'unknown' && <UnknownRenderer fileUrl={fileUrl} />}
        </div>
      </div>
    </div>
  );
}

// ── PDF renderer ──────────────────────────────────────────────────────────────
function PdfRenderer({ fileUrl, pageNumber, phrases }: {
  fileUrl: string; pageNumber: number; phrases: string[];
}) {
  const [numPages, setNumPages]       = useState(0);
  const [current, setCurrent]         = useState(pageNumber);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [containerWidth, setWidth]    = useState(800);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setCurrent(pageNumber); }, [pageNumber]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((e) => {
      const w = e[0]?.contentRect.width;
      if (w) setWidth(Math.floor(w) - 32);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const textRenderer = useCallback(({ str }: { str: string }) =>
    applyHighlights(str, phrases), [phrases]);

  const goTo = (p: number) => setCurrent(Math.max(1, Math.min(p, numPages)));

  return (
    <>
      <div ref={containerRef} className="flex-1 overflow-y-auto bg-gray-100 dark:bg-gray-800 flex flex-col items-center py-4 px-4">
        {error ? (
          <ErrorState message={error} />
        ) : (
          <Document
            file={fileUrl}
            onLoadSuccess={({ numPages: n }) => { setNumPages(n); setLoading(false); }}
            onLoadError={(e) => { setError(e.message); setLoading(false); }}
            loading={<Spinner />}
          >
            {!loading && (
              <Page
                key={current}
                pageNumber={current}
                width={containerWidth}
                customTextRenderer={textRenderer}
                renderAnnotationLayer={false}
                loading={<Spinner />}
                className="shadow-lg rounded-lg overflow-hidden"
              />
            )}
          </Document>
        )}
      </div>

      {/* PDF footer nav */}
      {!loading && !error && numPages > 0 && (
        <div className="flex items-center justify-center gap-3 px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
          <NavButton onClick={() => goTo(current - 1)} disabled={current <= 1} dir="prev" />
          <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <span>Go to</span>
            <input
              type="number" min={1} max={numPages} value={current}
              onChange={(e) => goTo(Number(e.target.value))}
              className="w-14 text-center border border-gray-300 dark:border-gray-600 rounded-md px-1.5 py-1 text-xs bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-blue-400"
            />
            <span>/ {numPages}</span>
          </span>
          <NavButton onClick={() => goTo(current + 1)} disabled={current >= numPages} dir="next" />
        </div>
      )}
    </>
  );
}

// ── DOCX renderer ─────────────────────────────────────────────────────────────
function DocxRenderer({ fileUrl, phrases }: { fileUrl: string; phrases: string[] }) {
  const [html, setHtml]   = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        // mammoth browser build — dynamic import to avoid SSR issues
        const mammoth = (await import('mammoth/mammoth.browser')).default;
        const { value } = await mammoth.convertToHtml({ arrayBuffer: buf });
        if (!cancelled) setHtml(phrases.length ? applyHighlights(value, phrases) : value);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load DOCX');
      }
    })();
    return () => { cancelled = true; };
  }, [fileUrl, phrases]);

  if (error) return <div className="flex-1 flex items-center justify-center"><ErrorState message={error} /></div>;
  if (!html)  return <div className="flex-1 flex items-center justify-center"><Spinner /></div>;

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 bg-white dark:bg-gray-900">
      <div
        className="prose prose-sm dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

// ── JSON renderer ─────────────────────────────────────────────────────────────
function JsonRenderer({ fileUrl, phrases }: { fileUrl: string; phrases: string[] }) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();

        // Parse JSON array or JSONL
        let chunks: Record<string, unknown>[] = [];
        const trimmed = text.trim();
        if (trimmed.startsWith('[')) {
          chunks = JSON.parse(trimmed);
        } else {
          // JSONL
          chunks = trimmed.split('\n').filter(Boolean).map((l) => JSON.parse(l));
        }

        // Convert chunks to readable markdown
        const md = chunks.map((c, i) => {
          const section = c.section ? `### ${c.section}` : `### Chunk ${i + 1}`;
          const meta: string[] = [];
          if (c.page_range)   meta.push(`📄 Page ${c.page_range}`);
          if (c.content_type) meta.push(`Type: ${c.content_type}`);
          if (Array.isArray(c.keywords) && c.keywords.length)
            meta.push(`Keywords: ${(c.keywords as string[]).join(', ')}`);
          const metaLine = meta.length ? `\n*${meta.join(' · ')}*\n` : '';
          return `${section}\n${metaLine}\n${c.content ?? ''}`;
        }).join('\n\n---\n\n');

        if (!cancelled) setMarkdown(md);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load JSON');
      }
    })();
    return () => { cancelled = true; };
  }, [fileUrl]);

  if (error)    return <div className="flex-1 flex items-center justify-center"><ErrorState message={error} /></div>;
  if (!markdown) return <div className="flex-1 flex items-center justify-center"><Spinner /></div>;

  // Apply highlights to the rendered markdown text via CSS ::highlight or mark injection
  const highlighted = phrases.length ? applyHighlights(markdown, phrases) : null;

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 bg-white dark:bg-gray-900">
      {highlighted ? (
        <div
          className="prose prose-sm dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

// ── Unknown file type ─────────────────────────────────────────────────────────
function UnknownRenderer({ fileUrl }: { fileUrl: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
      <span className="text-3xl">📎</span>
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Preview not available</p>
      <p className="text-xs text-gray-500">This file type cannot be previewed inline.</p>
      <a
        href={fileUrl}
        download
        className="text-xs px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
      >
        Download file
      </a>
    </div>
  );
}

// ── Shared UI atoms ───────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <span className="text-3xl">⚠️</span>
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Failed to load document</p>
      <p className="text-xs text-gray-400 max-w-xs">{message}</p>
    </div>
  );
}

function NavButton({ onClick, disabled, dir }: { onClick: () => void; disabled: boolean; dir: 'prev' | 'next' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 text-xs px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {dir === 'prev' && (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
        </svg>
      )}
      {dir === 'prev' ? 'Prev' : 'Next'}
      {dir === 'next' && (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
        </svg>
      )}
    </button>
  );
}

function FileIcon({ type }: { type: FileType }) {
  const icons: Record<FileType, string> = {
    pdf: '🔴', docx: '🔵', json: '🟡', unknown: '📎',
  };
  return <span className="text-base flex-shrink-0">{icons[type]}</span>;
}

function TypeBadge({ type }: { type: FileType }) {
  const labels: Record<FileType, string> = {
    pdf: 'PDF', docx: 'DOCX', json: 'JSON', unknown: 'File',
  };
  const colors: Record<FileType, string> = {
    pdf:     'bg-red-50 text-red-600 border-red-200',
    docx:    'bg-blue-50 text-blue-600 border-blue-200',
    json:    'bg-yellow-50 text-yellow-700 border-yellow-200',
    unknown: 'bg-gray-50 text-gray-500 border-gray-200',
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0 ${colors[type]}`}>
      {labels[type]}
    </span>
  );
}
