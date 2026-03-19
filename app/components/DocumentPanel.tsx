'use client';
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import type { Document, DocType } from '@/types';
import ReindexButton from './ReindexButton';

const DOC_TYPE_LABELS: Record<DocType, string> = {
  hub: 'Hub',
  link: 'Link',
  satellite: 'Satellite',
  methodology: 'Methodology',
  pit_bridge: 'PIT / Bridge',
  general: 'General',
};

const DOC_TYPE_COLORS: Record<DocType, string> = {
  hub: 'bg-amber-50 text-amber-700 border border-amber-200',
  link: 'bg-blue-50 text-blue-700 border border-blue-200',
  satellite: 'bg-purple-50 text-purple-700 border border-purple-200',
  methodology: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  pit_bridge: 'bg-rose-50 text-rose-700 border border-rose-200',
  general: 'bg-gray-50 text-gray-700 border border-gray-200',
};

interface Props {
  documents: Document[];
  onDocumentsChange: () => void;
}

interface UploadState {
  file: File;
  docType: DocType;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
  chunkCount?: number;
  progress?: number; // 0-100 percentage
}

export default function DocumentPanel({ documents, onDocumentsChange }: Props) {
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);

  // Upload a single file directly — no stale-index dependency
  const uploadFile = useCallback(async (file: File, docType: DocType) => {
    const id = `${file.name}-${Date.now()}`;

    setUploads((prev) => [...prev, { file, docType, status: 'uploading', progress: 0 }]);

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('doc_type', docType);

      const res = await fetch('/api/ingest', { method: 'POST', body: form });
      const data = await res.json();

      setUploads((prev) => prev.map((u) =>
        u.file === file
          ? data.success
            ? { ...u, status: 'done', progress: 100, chunkCount: data.chunk_count }
            : { ...u, status: 'error', error: data.error, progress: undefined }
          : u
      ));
      if (data.success) onDocumentsChange();
    } catch {
      setUploads((prev) => prev.map((u) =>
        u.file === file ? { ...u, status: 'error', error: 'Network error', progress: undefined } : u
      ));
    }
  }, [onDocumentsChange]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => uploadFile(file, inferDocTypeClient(file.name)));
  }, [uploadFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'], 'text/plain': ['.txt'], 'text/markdown': ['.md'] },
    maxSize: 10 * 1024 * 1024,
  });

  // Cancel an uploading item
  const cancelUpload = (idx: number) => {
    setUploads((prev) => prev.filter((_, i) => i !== idx));
  };

  // Clean up stuck 'processing' documents
  const cleanupStuck = async () => {
    const stuckDocs = documents.filter((d) => d.status === 'processing');
    await Promise.all(
      stuckDocs.map((d) =>
        fetch('/api/documents', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.id }) })
      )
    );
    onDocumentsChange();
  };
  const processUpload = async (idx: number) => {
    const upload = uploads[idx];
    if (upload.status !== 'pending') return;
    await uploadFile(upload.file, upload.docType);
    setUploads((prev) => prev.filter((_, i) => i !== idx));
  };

  const processAll = () => {
    uploads.forEach((u, i) => { if (u.status === 'pending') processUpload(i); });
  };

  const deleteDocument = async (id: string) => {
    await fetch('/api/documents', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    onDocumentsChange();
  };

  const pendingCount = uploads.filter((u) => u.status === 'pending').length;

  return (
    <div className="border-b border-dv-border">
      <button onClick={() => setIsExpanded(!isExpanded)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-dv-text hover:bg-dv-surface transition-colors">
        <span className="flex items-center gap-2">
          <span className="text-dv-accent">◈</span> Knowledge Base
          <span className="text-xs font-normal text-dv-muted ml-1">{documents.filter(d => d.status === 'ready').length} docs</span>
        </span>
        <span className="text-dv-muted text-xs">{isExpanded ? '▲' : '▼'}</span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Drop zone */}
          <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all ${isDragActive ? 'border-dv-accent bg-dv-accent/5' : 'border-dv-border hover:border-dv-accent/50'}`}>
            <input {...getInputProps()} />
            <p className="text-xs text-dv-muted">Drop PDF, DOCX, TXT, MD<br /><span className="text-dv-accent">or click to browse</span> · max 10MB</p>
          </div>

          {/* Upload queue */}
          {uploads.length > 0 && (
            <div className="space-y-2">
              {uploads.map((u, i) => (
                <div key={i} className="bg-dv-surface rounded-lg p-2.5 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex-1 min-w-0 mr-2">
                      <span className="text-dv-text truncate block">{u.file.name}</span>
                      <span className="text-[10px] text-dv-muted">{formatFileSize(u.file.size)}</span>
                    </div>
                    <StatusBadge status={u.status} />
                  </div>
                  {u.status === 'uploading' && (
                    <div className="w-full bg-dv-border rounded-full h-1.5 mb-1 overflow-hidden">
                      <div className="bg-dv-accent h-1.5 rounded-full animate-[indeterminate_1.5s_ease-in-out_infinite]" style={{ width: '40%' }}></div>
                    </div>
                  )}
                  {(u.status === 'pending' || u.status === 'uploading') && (
                    <button
                      onClick={() => cancelUpload(i)}
                      className="text-[10px] text-dv-muted hover:text-red-500 transition-colors mt-1"
                    >
                      ✕ Cancel
                    </button>
                  )}
                  {u.status === 'pending' && (
                    <div className="flex items-center gap-2 mt-1">
                      <select value={u.docType} onChange={(e) => setUploads(prev => prev.map((x, j) => j === i ? { ...x, docType: e.target.value as DocType } : x))} className="flex-1 text-xs bg-dv-bg border border-dv-border rounded px-1 py-0.5 text-dv-text">
                        {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map((t) => (<option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>))}
                      </select>
                      <button onClick={() => processUpload(i)} className="px-2 py-0.5 bg-dv-accent text-white rounded text-xs hover:bg-dv-accent/90">Upload</button>
                    </div>
                  )}
                  {u.status === 'done' && <p className="text-emerald-600 mt-0.5">{u.chunkCount} chunks indexed</p>}
                  {u.status === 'error' && <p className="text-red-500 mt-0.5">{u.error}</p>}
                </div>
              ))}
              {pendingCount > 1 && (
                <button onClick={processAll} className="w-full text-xs py-1.5 bg-dv-accent text-white rounded-lg hover:bg-dv-accent/90 transition-colors">Upload all {pendingCount} files</button>
              )}
            </div>
          )}

          {/* Document list */}
          {documents.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-dv-muted font-medium uppercase tracking-wider">Indexed documents</p>
                {documents.some((d) => d.status === 'processing') && (
                  <button
                    onClick={cleanupStuck}
                    className="text-[10px] text-amber-500 hover:text-red-500 transition-colors border border-amber-200 rounded px-1.5 py-0.5"
                    title="Remove stuck processing documents"
                  >
                    Clean up stuck
                  </button>
                )}
              </div>
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 py-1.5 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-dv-text truncate">{doc.filename}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {doc.doc_type && (<span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${DOC_TYPE_COLORS[doc.doc_type as DocType] || DOC_TYPE_COLORS.general}`}>{DOC_TYPE_LABELS[doc.doc_type as DocType] || doc.doc_type}</span>)}
                      <span className="text-[10px] text-dv-muted">{doc.chunk_count} chunks</span>
                      <span className="text-[10px] text-dv-muted">· {formatFileSize(doc.file_size)}</span>
                      {doc.status !== 'ready' && <span className="text-[10px] text-amber-500">{doc.status}</span>}
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                    <ReindexButton
                      document={doc}
                      onSuccess={(newChunkCount) => {
                        onDocumentsChange();
                      }}
                    />
                    <button onClick={() => deleteDocument(doc.id)} className="text-red-400 hover:text-red-600 text-xs min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center" title="Delete">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: UploadState['status'] }) {
  const map = { pending: 'text-dv-muted', uploading: 'text-amber-500 animate-pulse', done: 'text-emerald-600', error: 'text-red-500' };
  const labels = { pending: 'pending', uploading: 'uploading...', done: 'done', error: 'error' };
  return <span className={`text-[10px] font-medium ${map[status]}`}>{labels[status]}</span>;
}

function inferDocTypeClient(filename: string): DocType {
  const lower = filename.toLowerCase();
  if (lower.includes('hub')) return 'hub';
  if (lower.includes('link')) return 'link';
  if (lower.includes('sat')) return 'satellite';
  if (lower.includes('pit') || lower.includes('bridge')) return 'pit_bridge';
  if (lower.includes('method') || lower.includes('guide')) return 'methodology';
  return 'general';
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
