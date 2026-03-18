'use client';
import { useState } from 'react';
import type { Document } from '@/types';

type Stage = 'idle' | 'fetching' | 'chunking' | 'embedding' | 'storing' | 'complete';

interface Props {
  document: Document;
  onSuccess: (newChunkCount: number) => void;
}

export default function ReindexButton({ document, onSuccess }: Props) {
  // Only render if content is available
  if (!(document as any).content) return null;

  const [showConfirm, setShowConfirm] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setShowConfirm(false);
    setError(null);
    setStage('fetching');

    try {
      const res = await fetch('/api/reindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: document.id }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Re-index failed');
      }

      setStage('complete');
      onSuccess(data.newChunkCount);

      // Reset to idle after a short delay
      setTimeout(() => setStage('idle'), 2000);
    } catch (err: any) {
      setError(err.message);
      setStage('idle');
    }
  };

  if (stage === 'fetching') {
    return (
      <span className="text-[10px] text-amber-500 animate-pulse">re-indexing...</span>
    );
  }

  if (stage === 'complete') {
    return (
      <span className="text-[10px] text-emerald-600">re-indexed ✓</span>
    );
  }

  if (showConfirm) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-dv-muted">Re-index this document? This will regenerate all chunks.</span>
        <button
          onClick={handleConfirm}
          className="text-[10px] px-1.5 py-0.5 bg-dv-accent text-white rounded hover:bg-dv-accent/90"
        >
          Yes
        </button>
        <button
          onClick={() => setShowConfirm(false)}
          className="text-[10px] px-1.5 py-0.5 border border-dv-border rounded text-dv-muted hover:text-dv-text"
        >
          No
        </button>
        {error && <span className="text-[10px] text-red-500">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setShowConfirm(true)}
        className="text-xs px-1.5 py-0.5 border border-dv-border rounded text-dv-muted hover:text-dv-text transition-colors"
        title="Re-index document"
      >
        Re-index
      </button>
      {error && <span className="text-[10px] text-red-500">{error}</span>}
    </div>
  );
}
