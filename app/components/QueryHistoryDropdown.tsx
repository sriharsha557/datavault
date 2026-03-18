'use client';
import { useEffect, useRef } from 'react';
import type { QueryHistoryEntry } from '@/types';

interface Props {
  suggestions: QueryHistoryEntry[];
  onSelect: (query: string) => void;
  onClose: () => void;
}

export default function QueryHistoryDropdown({ suggestions, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  if (suggestions.length === 0) return null;

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 right-0 mb-1 bg-dv-surface border border-dv-border rounded-xl shadow-lg z-50 overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-dv-border">
        <span className="text-[10px] text-dv-muted uppercase tracking-wider font-medium">Recent queries</span>
        <button
          onClick={onClose}
          className="text-[10px] text-dv-muted hover:text-dv-text transition-colors"
        >
          ✕
        </button>
      </div>
      <ul className="max-h-48 overflow-y-auto">
        {suggestions.slice(0, 10).map((entry, i) => (
          <li key={i}>
            <button
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur before click
                onSelect(entry.query);
              }}
              className="w-full text-left px-3 py-2 text-xs text-dv-text hover:bg-dv-accent/10 transition-colors flex items-center gap-2"
            >
              <span className="text-dv-muted flex-shrink-0">🕐</span>
              <span className="truncate">{entry.query}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
