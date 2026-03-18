'use client';
import { useState } from 'react';
import type { ChatMessage } from '@/types';
import ExportModal from './ExportModal';

interface ExportButtonProps {
  messages: ChatMessage[];
}

export default function ExportButton({ messages }: ExportButtonProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={messages.length === 0}
        title="Export conversation"
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-dv-border text-dv-muted hover:border-dv-accent hover:text-dv-accent disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Export
      </button>

      {showModal && (
        <ExportModal messages={messages} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
