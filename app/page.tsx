'use client';
import { useState, useEffect, useCallback } from 'react';
import ChatWindow from './components/ChatWindow';
import ThemeToggle from './components/ThemeToggle';
import { useTheme } from './components/ThemeProvider';
import type { Document } from '@/types';

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const { theme } = useTheme();

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
      <header className="flex items-center justify-between px-6 py-2 border-b border-dv-border bg-dv-surface flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <img src={theme === 'dark' ? '/logo_black.png' : '/favicon/android-chrome-192x192.png'} alt="Quick Query" className="h-14 w-auto" />
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
          <ThemeToggle />
          <a
            href="/admin"
            className="ml-1 flex items-center gap-1.5 text-xs px-3 py-1.5 border border-dv-border rounded-lg text-dv-muted hover:border-dv-accent hover:text-dv-accent transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
            Admin
          </a>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <ChatWindow hasDocuments={readyDocs.length > 0} />
      </div>
    </div>
  );
}
