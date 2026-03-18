'use client';
import { useState, useEffect, useCallback } from 'react';
import DocumentPanel from '../components/DocumentPanel';
import { useTheme } from '../components/ThemeProvider';
import type { Document } from '@/types';

const ADMIN_PASSWORD = ''; // Removed hardcoded password - now verified server-side

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    if (authed) fetchDocuments();
  }, [authed, fetchDocuments]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      
      if (res.ok) {
        setAuthed(true);
        setPassword('');
      } else {
        const data = await res.json();
        setError(data.error || 'Incorrect password');
      }
    } catch {
      setError('Verification failed');
    } finally {
      setLoading(false);
    }
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-dv-bg flex items-center justify-center">
        <div className="bg-dv-surface border border-dv-border rounded-2xl p-8 w-full max-w-sm shadow-md">
          <div className="flex items-center gap-2.5 mb-6">
            <img src={theme === 'dark' ? '/logo_black.png' : '/favicon/android-chrome-192x192.png'} alt="Quick Query" className="h-9 w-auto" />
            <div>
              <h1 className="text-sm font-bold text-dv-text">Quick Query</h1>
              <p className="text-[10px] text-dv-muted">Admin Panel</p>
            </div>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-dv-muted mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  className="w-full px-3 py-2 pr-9 text-sm border border-dv-border rounded-lg bg-dv-bg text-dv-text placeholder-dv-muted focus:outline-none focus:border-dv-accent"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dv-muted hover:text-dv-text transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-dv-accent text-white text-sm font-medium rounded-lg hover:bg-dv-accent/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const readyDocs = documents.filter((d) => d.status === 'ready');

  return (
    <div className="min-h-screen bg-dv-bg">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-dv-border bg-dv-surface">
        <div className="flex items-center gap-2.5">
          <img src={theme === 'dark' ? '/logo_black.png' : '/favicon/android-chrome-192x192.png'} alt="Quick Query" className="h-8 w-auto" />
          <div>
            <h1 className="text-sm font-bold text-dv-text">Quick Query — Admin</h1>
            <p className="text-[10px] text-dv-muted">Knowledge Base Management</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-dv-muted">{readyDocs.length} document{readyDocs.length !== 1 ? 's' : ''} indexed</span>
          <button
            onClick={() => setAuthed(false)}
            className="text-xs text-dv-muted hover:text-red-500 transition-colors px-2 py-1 border border-dv-border rounded"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-6 py-8">
        <h2 className="text-lg font-semibold text-dv-text mb-1">Document Management</h2>
        <p className="text-sm text-dv-muted mb-6">Upload and manage documents in the knowledge base. Users can query these documents from the main page.</p>
        <div className="bg-dv-surface border border-dv-border rounded-xl overflow-hidden">
          <DocumentPanel documents={documents} onDocumentsChange={fetchDocuments} />
        </div>
      </main>
    </div>
  );
}
