'use client';

interface Props {
  partialContent: string;
  onRetry: () => void;
  onKeep: () => void;
  onEditRetry: () => void;
}

export default function StreamingErrorBanner({ partialContent, onRetry, onKeep, onEditRetry }: Props) {
  return (
    <div className="mt-2 flex flex-col gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
      <p className="text-xs text-amber-700 font-medium">
        ⚠ Connection interrupted{partialContent ? ' — partial answer shown above' : ''}
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onRetry}
          className="text-xs px-2.5 py-1 bg-dv-accent text-white rounded-lg hover:bg-dv-accent/90 transition-colors"
        >
          Retry
        </button>
        {partialContent && (
          <button
            onClick={onKeep}
            className="text-xs px-2.5 py-1 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors"
          >
            Keep Partial
          </button>
        )}
        <button
          onClick={onEditRetry}
          className="text-xs px-2.5 py-1 border border-dv-border text-dv-muted rounded-lg hover:border-dv-accent hover:text-dv-accent transition-colors"
        >
          Edit &amp; Retry
        </button>
      </div>
    </div>
  );
}
