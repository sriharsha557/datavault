'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage, DocType, Source } from '@/types';
import ExportButton from './ExportButton';
import QueryHistoryDropdown from './QueryHistoryDropdown';
import { queryHistory } from '@/lib/queryHistory';
import SimilarityThresholdSlider from './SimilarityThresholdSlider';
import type { SimilarityThresholdConfig } from '@/types';
import StreamingErrorBanner from './StreamingErrorBanner';
import { StreamingBuffer } from '@/lib/streamingBuffer';

const SUGGESTED = [
  'What defines a Hub in Data Vault?',
  'When should a Link be created?',
  'What problem does a PIT table solve?',
  'Explain Raw Vault vs Business Vault.',
];

const DOC_TYPE_OPTIONS: Array<{ value: DocType | ''; label: string }> = [
  { value: '', label: 'All documents' },
  { value: 'hub', label: 'Hubs only' },
  { value: 'link', label: 'Links only' },
  { value: 'satellite', label: 'Satellites only' },
  { value: 'methodology', label: 'Methodology' },
  { value: 'pit_bridge', label: 'PIT / Bridge' },
  { value: 'general', label: 'General' },
];

export default function ChatWindow({ hasDocuments }: { hasDocuments: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [docTypeFilter, setDocTypeFilter] = useState<DocType | ''>('');
  const [showHistory, setShowHistory] = useState(false);
  const [historySuggestions, setHistorySuggestions] = useState(queryHistory.getRecentQueries());
  const [thresholdConfig, setThresholdConfig] = useState<SimilarityThresholdConfig>({ threshold: 0.5, enabled: false });
  const [filterBarOpen, setFilterBarOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [strictMode, setStrictMode] = useState(true);
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const streamStartRef = useRef<number>(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close filter popover on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(e.target as Node)) {
        setFilterBarOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const sendMessage = async (query: string) => {
    if (!query.trim() || loading) return;
    setInput('');

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: query, timestamp: new Date() };
    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = { 
      id: assistantId, 
      role: 'assistant', 
      content: '', 
      timestamp: new Date(), 
      isStreaming: true,
      query: query,
      originalQuery: query,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setLoading(true);

    const buffer = new StreamingBuffer();
    streamStartRef.current = Date.now();

    const handleStreamError = () => {
      const partial = buffer.getPartialContent();
      setMessages((prev) => prev.map((m) =>
        m.id === assistantId
          ? { ...m, content: partial, isStreaming: false, hasError: true }
          : m
      ));
      setLoading(false);
    };

    try {
      const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, doc_type_filter: docTypeFilter || null, top_k: 8, chat_history: history, strict_mode: strictMode, ...(thresholdConfig.enabled ? { similarity_threshold: thresholdConfig.threshold } : {}) }),
      });

      if (!res.ok) throw new Error('Query failed');
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = '';
      let sources: Source[] = [];

      // Start 30s timeout watcher
      buffer.startTimeoutWatcher(30000, handleStreamError);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'sources') {
              sources = event.sources;
              setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, sources } : m));
            } else if (event.type === 'token') {
              buffer.append(event.token);
              // Reset timeout on each token
              buffer.startTimeoutWatcher(30000, handleStreamError);
              setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: buffer.getPartialContent() } : m));
            } else if (event.type === 'done') {
              const finalContent = buffer.getPartialContent();
              buffer.clear();
              const latencyMs = Date.now() - streamStartRef.current;
              setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: finalContent, isStreaming: false, latencyMs, answerSource: event.answerSource } : m));
              queryHistory.addQuery(query);
              setHistorySuggestions(queryHistory.getRecentQueries());
              setLoading(false);
              return;
            } else if (event.type === 'error') {
              // Check if it's a threshold "no results" error — show friendly card
              if (event.error?.includes('similarity threshold')) {
                setMessages((prev) => prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: '__no_results__', isStreaming: false }
                    : m
                ));
                setLoading(false);
                return;
              }
              handleStreamError();
              return;
            }
          } catch {}
        }
      }
    } catch (err) {
      handleStreamError();
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setShowHistory(false); sendMessage(input); }
    if (e.key === 'Escape') setShowHistory(false);
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    const suggestions = value.trim()
      ? queryHistory.searchHistory(value)
      : queryHistory.getRecentQueries();
    setHistorySuggestions(suggestions);
  };

  const hasConversation = messages.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Persistent Header */}
      <div className={`border-b border-dv-border bg-dv-surface/50 transition-all duration-300 ${hasConversation ? 'py-3' : 'py-6'}`}>
        <div className="max-w-3xl mx-auto px-5">
          <div className="flex items-center justify-between">
          <h2 className={`font-semibold text-dv-text transition-all duration-300 ${hasConversation ? 'text-xl mb-1' : 'text-3xl mb-2'}`}>
            Hello, EDWH Engineer! 👋
          </h2>
          <div className="flex items-center gap-2">
            {hasConversation && (
              <>
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-dv-border rounded-lg text-dv-muted hover:border-dv-accent hover:text-dv-accent transition-colors"
                  title="Back to home screen"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                  </svg>
                  Home
                </button>
                {/* Confirmation dialog */}
                {showClearConfirm && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-dv-surface border border-dv-border rounded-xl shadow-xl p-5 max-w-xs w-full mx-4 space-y-3">
                      <p className="text-sm font-semibold text-dv-text">Clear conversation?</p>
                      <p className="text-xs text-dv-muted">This will remove all messages and return to the home screen. This can't be undone.</p>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => { setMessages([]); setShowClearConfirm(false); }}
                          className="flex-1 text-xs px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                        >
                          Clear
                        </button>
                        <button
                          onClick={() => setShowClearConfirm(false)}
                          className="flex-1 text-xs px-3 py-1.5 border border-dv-border text-dv-muted rounded-lg hover:border-dv-accent hover:text-dv-accent transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <ExportButton messages={messages} />
          </div>
          </div>
          <p className={`text-dv-muted transition-all duration-300 ${hasConversation ? 'text-xs' : 'text-sm mb-2'}`}>
            I am your Data Vault Knowledge Assistant!
          </p>
          {!hasConversation && (
            <p className="text-xs text-dv-muted/80 max-w-2xl animate-in fade-in duration-300">
              A conversational assistant designed to help engineers explore Data Vault modeling patterns, architecture decisions, and SQL implementation strategies.
            </p>
          )}
        </div>
      </div>

      {/* Filter bar — compact popover */}
      <div className="border-b border-dv-border bg-dv-surface/30 px-5 py-2 flex items-center gap-3">
        <div className="relative" ref={filterPopoverRef}>
          <button
            onClick={() => setFilterBarOpen((v) => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg transition-all ${
              docTypeFilter
                ? 'border-dv-accent text-dv-accent bg-dv-accent/5'
                : 'border-dv-border text-dv-muted hover:border-dv-accent hover:text-dv-accent'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            {docTypeFilter ? DOC_TYPE_OPTIONS.find(o => o.value === docTypeFilter)?.label : 'Filter'}
            {docTypeFilter && (
              <span
                onClick={(e) => { e.stopPropagation(); setDocTypeFilter(''); }}
                className="ml-0.5 text-dv-accent hover:text-red-500 transition-colors cursor-pointer"
              >×</span>
            )}
          </button>
          {filterBarOpen && (
            <div className="absolute top-full left-0 mt-1.5 z-30 bg-dv-surface border border-dv-border rounded-xl shadow-lg p-3 min-w-[200px] space-y-1">
              {DOC_TYPE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => { setDocTypeFilter(o.value as DocType | ''); setFilterBarOpen(false); }}
                  className={`w-full text-left text-xs px-3 py-1.5 rounded-lg transition-all ${
                    docTypeFilter === o.value
                      ? 'bg-dv-accent text-white'
                      : 'text-dv-muted hover:bg-dv-bg hover:text-dv-text'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Active filter pill mid-conversation */}
        {hasConversation && docTypeFilter && (
          <span className="text-[10px] text-dv-muted">
            Filtering: <span className="font-medium text-dv-accent">{DOC_TYPE_OPTIONS.find(o => o.value === docTypeFilter)?.label}</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {/* Step 5: Strict / Assist mode toggle */}
          <button
            onClick={() => setStrictMode((v) => !v)}
            title={strictMode ? 'Strict mode: answers only from your documents' : 'Assist mode: can use general DV knowledge'}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg transition-all ${
              strictMode
                ? 'border-dv-accent text-dv-accent bg-dv-accent/5'
                : 'border-dv-border text-dv-muted hover:border-dv-accent hover:text-dv-accent'
            }`}
          >
            {strictMode ? '🔒 Strict' : '🤖 Assist'}
          </button>
          <SimilarityThresholdSlider onChange={setThresholdConfig} />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-5">
        <div className="max-w-3xl mx-auto px-5 space-y-5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-8 text-center max-w-4xl mx-auto pt-8">

            {hasDocuments && (
              <>
                {/* Browse by Area Cards */}
                <div className={`w-full transition-all duration-500 ${hasConversation ? 'opacity-0 max-h-0 overflow-hidden' : 'opacity-100 max-h-[1000px]'}`}>
                  <h3 className="text-xs font-semibold text-dv-muted uppercase tracking-wider mb-3 text-left">Browse by Area</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <button onClick={() => { setDocTypeFilter('hub'); sendMessage('What are Hubs in Data Vault?'); }} className="group bg-dv-surface border border-dv-border rounded-xl p-4 hover:border-dv-accent hover:shadow-md transition-all text-left">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 text-lg flex-shrink-0 group-hover:bg-blue-200 transition-colors">🔵</div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-dv-text mb-1">Hubs</h4>
                          <p className="text-xs text-dv-muted line-clamp-2">Core business entities and keys</p>
                        </div>
                      </div>
                    </button>

                    <button onClick={() => { setDocTypeFilter('link'); sendMessage('Explain Links in Data Vault'); }} className="group bg-dv-surface border border-dv-border rounded-xl p-4 hover:border-dv-accent hover:shadow-md transition-all text-left">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600 text-lg flex-shrink-0 group-hover:bg-purple-200 transition-colors">🔗</div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-dv-text mb-1">Links</h4>
                          <p className="text-xs text-dv-muted line-clamp-2">Relationships between entities</p>
                        </div>
                      </div>
                    </button>

                    <button onClick={() => { setDocTypeFilter('satellite'); sendMessage('What are Satellites in Data Vault?'); }} className="group bg-dv-surface border border-dv-border rounded-xl p-4 hover:border-dv-accent hover:shadow-md transition-all text-left">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-green-600 text-lg flex-shrink-0 group-hover:bg-green-200 transition-colors">🛰️</div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-dv-text mb-1">Satellites</h4>
                          <p className="text-xs text-dv-muted line-clamp-2">Descriptive attributes and history</p>
                        </div>
                      </div>
                    </button>

                    <button onClick={() => { setDocTypeFilter('pit_bridge'); sendMessage('Explain PIT and Bridge tables'); }} className="group bg-dv-surface border border-dv-border rounded-xl p-4 hover:border-dv-accent hover:shadow-md transition-all text-left">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600 text-lg flex-shrink-0 group-hover:bg-orange-200 transition-colors">🌉</div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-dv-text mb-1">PIT / Bridge</h4>
                          <p className="text-xs text-dv-muted line-clamp-2">Performance optimization tables</p>
                        </div>
                      </div>
                    </button>

                    <button onClick={() => { setDocTypeFilter('methodology'); sendMessage('What is Data Vault methodology?'); }} className="group bg-dv-surface border border-dv-border rounded-xl p-4 hover:border-dv-accent hover:shadow-md transition-all text-left">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 text-lg flex-shrink-0 group-hover:bg-indigo-200 transition-colors">📚</div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-dv-text mb-1">Methodology</h4>
                          <p className="text-xs text-dv-muted line-clamp-2">Best practices and patterns</p>
                        </div>
                      </div>
                    </button>

                    <button onClick={() => { setDocTypeFilter(''); sendMessage('Tell me about Data Vault 2.0'); }} className="group bg-dv-surface border border-dv-border rounded-xl p-4 hover:border-dv-accent hover:shadow-md transition-all text-left">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600 text-lg flex-shrink-0 group-hover:bg-gray-200 transition-colors">📖</div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-dv-text mb-1">General</h4>
                          <p className="text-xs text-dv-muted line-clamp-2">Overview and fundamentals</p>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Suggested Questions */}
                <div className={`w-full transition-all duration-500 ${hasConversation ? 'opacity-0 max-h-0 overflow-hidden' : 'opacity-100 max-h-[500px]'}`}>
                  <h3 className="text-xs font-semibold text-dv-muted uppercase tracking-wider mb-3 text-left">Suggested Questions</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {SUGGESTED.map((s, idx) => {
                      const colors = ['bg-blue-50 text-blue-700 border-blue-200', 'bg-purple-50 text-purple-700 border-purple-200', 'bg-green-50 text-green-700 border-green-200', 'bg-orange-50 text-orange-700 border-orange-200', 'bg-indigo-50 text-indigo-700 border-indigo-200'];
                      return (
                        <button key={s} onClick={() => sendMessage(s)} className={`text-left text-xs px-4 py-2.5 border rounded-lg hover:shadow-sm transition-all ${colors[idx % colors.length]}`}>
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
            {!hasDocuments && (
              <NoDocs onAskAnyway={() => sendMessage(input || 'Tell me about Data Vault 2.0')} />
            )}
          </div>
        )}

        {/* Conversation Context Indicator */}
        {hasConversation && (
          <div className="mb-4 animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="flex items-center gap-2 text-xs text-dv-muted/70 bg-dv-surface/50 border border-dv-border/50 rounded-lg px-3 py-2 max-w-fit">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span>Data Vault Discussion</span>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            {/* Avatar */}
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-md bg-gray-200">
                <img 
                  src={msg.role === 'user' ? '/avatars/engineer.svg' : '/avatars/assistant.svg'} 
                  alt={msg.role === 'user' ? 'EDWH Engineer' : 'DV Assistant'}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to colored circle with initials if image fails
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement!.innerHTML = `<div class="w-full h-full flex items-center justify-center text-sm font-bold ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-700 text-white'}">${msg.role === 'user' ? 'E' : 'D'}</div>`;
                  }}
                />
              </div>
            </div>

            {/* Message bubble */}
            <div className={`flex flex-col gap-1 max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              {/* Name and timestamp */}
              <div className={`flex items-center gap-2 px-1 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <span className="text-[11px] font-semibold text-dv-text">
                  {msg.role === 'user' ? 'EDWH Engineer' : 'DV Assistant'}
                </span>
                <span className="text-[10px] text-dv-muted">
                  {msg.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>

              {/* Bubble content */}
              {msg.role === 'user' ? (
                <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-100 px-4 py-3 rounded-3xl rounded-tr-md shadow-sm text-sm">
                  {msg.content}
                </div>
              ) : (
                <div className="space-y-2 w-full">
                  <AssistantBubble msg={msg} onRetry={(q) => { setMessages((prev) => prev.filter((m) => m.id !== msg.id)); sendMessage(q); }} onKeep={() => setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, hasError: false } : m))} onEditRetry={(q) => { setMessages((prev) => prev.filter((m) => m.id !== msg.id)); setInput(q); inputRef.current?.focus(); }} />
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
        </div> {/* end max-w-3xl */}
      </div>

      {/* Input */}
      <div className="border-t border-dv-border py-4">
        <div className="max-w-3xl mx-auto px-5">
          <div ref={inputWrapperRef} className="relative">
            {showHistory && (
              <QueryHistoryDropdown
                suggestions={historySuggestions}
                onSelect={(q) => { setInput(q); setShowHistory(false); inputRef.current?.focus(); }}
                onClose={() => setShowHistory(false)}
              />
            )}
            <div className={`flex gap-2 items-end border rounded-xl px-3 py-2 transition-colors ${loading ? 'border-dv-border' : 'border-dv-border focus-within:border-dv-accent'}`}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                onFocus={() => setShowHistory(true)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your documents..."
                disabled={loading}
                rows={1}
                className="flex-1 bg-transparent text-sm text-dv-text placeholder-dv-muted resize-none focus:outline-none max-h-32 min-h-[1.5rem]"
                style={{ fieldSizing: 'content' } as React.CSSProperties}
              />
              <button
                onClick={() => { setShowHistory(false); sendMessage(input); }}
                disabled={!input.trim() || loading}
                className="p-1.5 md:p-1.5 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 bg-dv-accent text-white rounded-lg disabled:opacity-40 hover:bg-dv-accent/90 transition-all flex-shrink-0 flex items-center justify-center"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
          <p className="text-[10px] text-dv-muted mt-1.5 text-center">Shift+Enter for new line · Enter to send</p>
        </div>
      </div>
    </div>
  );
}

function AssistantBubble({ msg, onRetry, onKeep, onEditRetry }: {
  msg: ChatMessage;
  onRetry: (q: string) => void;
  onKeep: () => void;
  onEditRetry: (q: string) => void;
}) {
  const COLLAPSE_THRESHOLD = 600; // chars
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);

  // Auto-collapse long responses once streaming is done
  useEffect(() => {
    if (!msg.isStreaming && msg.content.length > COLLAPSE_THRESHOLD) {
      setCollapsed(true);
    }
  }, [msg.isStreaming, msg.content.length]);

  const displayContent = collapsed
    ? msg.content.slice(0, COLLAPSE_THRESHOLD) + '…'
    : msg.content;

  return (
    <div
      className="space-y-2 w-full"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="bg-gray-800 text-white px-4 py-3 rounded-3xl rounded-tl-md shadow-md">
        {msg.content === '__no_results__' ? (
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <span className="text-2xl">🔍</span>
            <p className="text-sm font-semibold text-white">No matching results</p>
            <p className="text-xs text-gray-300">Nothing met the similarity threshold. Try lowering it or rephrasing your question.</p>
          </div>
        ) : msg.content ? (
          <div className="prose prose-sm prose-invert max-w-none [&>*]:text-white [&_p]:text-white [&_li]:text-white [&_strong]:text-white">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
          </div>
        ) : (
          /* Skeleton loader while waiting for first token */
          <div className="space-y-2 py-1">
            <div className="h-3 bg-gray-600 rounded animate-pulse w-3/4" />
            <div className="h-3 bg-gray-600 rounded animate-pulse w-full" />
            <div className="h-3 bg-gray-600 rounded animate-pulse w-5/6" />
          </div>
        )}
        {msg.isStreaming && msg.content && <span className="inline-block w-1.5 h-4 bg-white animate-pulse ml-0.5 rounded-sm" />}
      </div>

      {/* Collapse / expand toggle */}
      {!msg.isStreaming && msg.content !== '__no_results__' && msg.content.length > COLLAPSE_THRESHOLD && (
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="text-[10px] text-dv-muted hover:text-dv-accent transition-colors flex items-center gap-1"
        >
          {collapsed ? '▼ Show full answer' : '▲ Collapse'}
        </button>
      )}

      {/* Meta badges row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {!msg.isStreaming && msg.latencyMs && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
            ⚡ {(msg.latencyMs / 1000).toFixed(1)}s
          </span>
        )}
        {!msg.isStreaming && msg.answerSource && (
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
            msg.answerSource === 'documents'
              ? 'bg-blue-50 text-blue-600 border-blue-200'
              : 'bg-gray-100 text-gray-500 border-gray-200'
          }`}>
            {msg.answerSource === 'documents' ? '📄 From your documents' : '🤖 LLM knowledge'}
          </span>
        )}
      </div>

      {msg.sources && msg.sources.length > 0 && <SourceList sources={msg.sources} />}

      {/* Hover-only actions */}
      {!msg.isStreaming && msg.content && msg.content !== '__no_results__' && !msg.hasError && (
        <div className={`transition-opacity duration-150 ${hovered ? 'opacity-100' : 'opacity-0'}`}>
          <MessageActions messageId={msg.id} content={msg.content} query={msg.query || ''} />
        </div>
      )}

      {msg.hasError && (
        <StreamingErrorBanner
          partialContent={msg.content}
          onRetry={() => onRetry(msg.originalQuery || msg.query || '')}
          onKeep={onKeep}
          onEditRetry={() => onEditRetry(msg.originalQuery || msg.query || '')}
        />
      )}
    </div>
  );
}

function MessageActions({ messageId, content, query }: { messageId: string; content: string; query: string }) {
  const [feedback, setFeedback] = useState<'helpful' | 'not_helpful' | null>(null);
  const [copied, setCopied] = useState(false);

  const submitFeedback = async (helpful: boolean) => {
    const type = helpful ? 'helpful' : 'not_helpful';
    setFeedback(type);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message_id: messageId, 
          query: query,
          response: content,
          helpful 
        }),
      });
    } catch {}
  };

  const copyAnswer = async () => {
    // Strip markdown to plain text
    const plain = content
      .replace(/#{1,6}\s+/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, ''))
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^\s*[-*+]\s+/gm, '• ')
      .trim();
    await navigator.clipboard.writeText(plain);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-1.5 mt-1">
      <button
        onClick={() => submitFeedback(true)}
        disabled={feedback !== null}
        className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
          feedback === 'helpful'
            ? 'bg-green-50 border-green-300 text-green-700'
            : 'border-dv-border text-dv-muted hover:border-green-300 hover:text-green-600 disabled:opacity-50'
        }`}
      >
        👍 Helpful
      </button>
      <button
        onClick={() => submitFeedback(false)}
        disabled={feedback !== null}
        className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
          feedback === 'not_helpful'
            ? 'bg-red-50 border-red-300 text-red-700'
            : 'border-dv-border text-dv-muted hover:border-red-300 hover:text-red-600 disabled:opacity-50'
        }`}
      >
        👎 Not Helpful
      </button>
      <button
        onClick={copyAnswer}
        className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border border-dv-border text-dv-muted hover:border-dv-accent hover:text-dv-accent transition-all"
      >
        {copied ? '✅ Copied!' : '📋 Copy Answer'}
      </button>
    </div>
  );
}

const DOC_TYPE_LABELS: Record<string, string> = {
  hub: 'Hub', link: 'Link', satellite: 'Sat', pit_bridge: 'PIT/Bridge', methodology: 'Method', general: 'General',
};

function SourceList({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);

  // Group by filename
  const grouped = sources.reduce<Record<string, { doc_type?: string; bestSimilarity: number; excerpts: string[] }>>(
    (acc, s) => {
      if (!acc[s.filename]) {
        acc[s.filename] = { doc_type: s.doc_type, bestSimilarity: s.similarity, excerpts: [] };
      } else {
        acc[s.filename].bestSimilarity = Math.max(acc[s.filename].bestSimilarity, s.similarity);
      }
      acc[s.filename].excerpts.push(s.excerpt);
      return acc;
    },
    {}
  );

  const files = Object.entries(grouped);
  const singleFile = files.length === 1;

  return (
    <div>
      <button onClick={() => setOpen(!open)} className="text-[11px] text-dv-muted hover:text-dv-accent transition-colors flex items-center gap-1">
        <span>{open ? '▼' : '▶'}</span>
        {singleFile
          ? `1 source · ${files[0][0]}`
          : `${files.length} source${files.length !== 1 ? 's' : ''}`}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          {files.map(([filename, info]) => (
            <div key={filename} className="bg-dv-bg border border-dv-border rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 mb-1">
                {info.doc_type && (
                  <span className={`src-badge src-badge-${info.doc_type}`}>
                    {DOC_TYPE_LABELS[info.doc_type] ?? info.doc_type}
                  </span>
                )}
                <span className="text-[11px] font-medium text-dv-text truncate flex-1">{filename}</span>
                <span className="text-[10px] text-dv-muted flex-shrink-0">{Math.round(info.bestSimilarity * 100)}%</span>
              </div>
              {/* Only show excerpt if multiple files — single file just shows the name */}
              {!singleFile && (
                <p className="text-[11px] text-dv-muted leading-relaxed">{info.excerpts[0]}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NoDocs({ onAskAnyway }: { onAskAnyway: () => void }) {
  return (
    <div className="bg-dv-surface border border-dv-border rounded-xl p-6 max-w-sm mx-auto text-center space-y-3">
      <div className="text-3xl">📂</div>
      <p className="text-sm font-semibold text-dv-text">No documents indexed yet</p>
      <p className="text-xs text-dv-muted">The knowledge base is being set up. You can still ask general Data Vault questions now.</p>
      <button
        onClick={onAskAnyway}
        className="text-xs px-3 py-1.5 bg-dv-accent text-white rounded-lg hover:bg-dv-accent/90 transition-colors"
      >
        Ask anyway
      </button>
    </div>
  );
}
