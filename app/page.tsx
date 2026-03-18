'use client';
import { useState, useEffect, useCallback } from 'react';
import ChatWindow from './components/ChatWindow';
import type { Document } from '@/types';

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : []);
    } catch {
      setDocuments([]);
    }
  }, []);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const readyDocs = documents.filter((d) => d.status === 'ready');

  return (
    <div className="flex flex-col h-screen bg-dv-bg overflow-hidden">
      {/* Topbar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-dv-border bg-dv-surface flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-dv-accent rounded-md flex items-center justify-center text-white text-xs font-bold">Q</div>
          <div>
            <h1 className="text-sm font-bold text-dv-text tracking-tight">Quick Query</h1>
            <p className="text-[10px] text-dv-muted">Data Vault Knowledge Base</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${readyDocs.length > 0 ? 'bg-emerald-500' : 'bg-gray-400'}`} />
          <span className="text-xs text-dv-muted">
            {readyDocs.length > 0 ? `${readyDocs.length} document${readyDocs.length !== 1 ? 's' : ''} indexed` : 'No documents indexed'}
          </span>
          <div className="ml-4 flex items-center gap-1.5 text-[10px] text-dv-muted">
            <span className="px-1.5 py-0.5 bg-dv-bg border border-dv-border rounded">LLaMA 3.1 8B</span>
            <span className="px-1.5 py-0.5 bg-dv-bg border border-dv-border rounded">pgvector</span>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <ChatWindow hasDocuments={readyDocs.length > 0} />
      </div>
    </div>
  );
}
