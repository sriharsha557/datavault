'use client';
import { useState } from 'react';
import type { ChatMessage, ExportOptions } from '@/types';
import { exportToMarkdown, triggerDownload } from '@/lib/export';

interface ExportModalProps {
  messages: ChatMessage[];
  onClose: () => void;
}

export default function ExportModal({ messages, onClose }: ExportModalProps) {
  const [format, setFormat] = useState<'markdown' | 'pdf'>('markdown');
  const [includeTimestamps, setIncludeTimestamps] = useState(true);
  const [includeSources, setIncludeSources] = useState(true);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options: ExportOptions = { format, includeTimestamps, includeSources, includeMetadata };

  const handleExport = async () => {
    setError(null);
    setLoading(true);

    try {
      if (format === 'markdown') {
        const content = exportToMarkdown(messages, options);
        triggerDownload(content, 'conversation-export.md', 'text/markdown');
        onClose();
      } else {
        const res = await fetch('/api/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, options }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          setError(data.error || 'PDF generation failed. Try Markdown instead.');
          setFormat('markdown');
          return;
        }

        // Decode base64 and trigger download
        const binary = atob(data.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename || 'conversation-export.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        onClose();
      }
    } catch {
      setError('Export failed. Try Markdown instead.');
      setFormat('markdown');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-800 border border-dv-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 text-white">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Export Conversation</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-xl leading-none">✕</button>
        </div>

        {/* Format selection */}
        <div className="mb-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Format</p>
          <div className="flex gap-3">
            {(['markdown', 'pdf'] as const).map((f) => (
              <label
                key={f}
                className={`flex items-center gap-2 cursor-pointer px-4 py-2.5 rounded-lg border transition-all text-sm ${
                  format === f
                    ? 'border-dv-accent bg-dv-accent/10 text-white'
                    : 'border-dv-border text-gray-400 hover:border-gray-500'
                } ${error && f === 'markdown' ? 'ring-2 ring-yellow-500' : ''}`}
              >
                <input
                  type="radio"
                  name="format"
                  value={f}
                  checked={format === f}
                  onChange={() => { setFormat(f); setError(null); }}
                  className="sr-only"
                />
                {f === 'markdown' ? '📄 Markdown' : '📕 PDF'}
              </label>
            ))}
          </div>
        </div>

        {/* Options */}
        <div className="mb-5 space-y-3">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Options</p>
          {[
            { label: 'Include timestamps', value: includeTimestamps, set: setIncludeTimestamps },
            { label: 'Include source citations', value: includeSources, set: setIncludeSources },
            { label: 'Include metadata header', value: includeMetadata, set: setIncludeMetadata },
          ].map(({ label, value, set }) => (
            <label key={label} className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => set(!value)}
                className={`w-9 h-5 rounded-full transition-colors relative ${value ? 'bg-dv-accent' : 'bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm text-gray-300">{label}</span>
            </label>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-3 py-2 bg-red-900/40 border border-red-700 rounded-lg text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-dv-border rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={loading}
            className="px-4 py-2 text-sm bg-dv-accent text-white rounded-lg hover:bg-dv-accent/90 disabled:opacity-50 transition-all"
          >
            {loading ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
