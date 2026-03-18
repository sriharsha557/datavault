import type { QueryHistoryEntry } from '@/types';

const STORAGE_KEY = 'dv-assistant-query-history';
const MAX_ENTRIES = 50;

export class QueryHistoryManager {
  private isAvailable(): boolean {
    try {
      localStorage.setItem('__test__', '1');
      localStorage.removeItem('__test__');
      return true;
    } catch {
      return false;
    }
  }

  private load(): QueryHistoryEntry[] {
    if (!this.isAvailable()) return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Invalid data');
      return parsed as QueryHistoryEntry[];
    } catch {
      // Clear corrupted data and reinitialize
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      return [];
    }
  }

  private save(entries: QueryHistoryEntry[]): void {
    if (!this.isAvailable()) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {}
  }

  addQuery(query: string): void {
    if (!query.trim()) return;
    const entries = this.load();
    // Deduplicate: remove existing entry with same query
    const filtered = entries.filter((e) => e.query.toLowerCase() !== query.toLowerCase());
    // Prepend new entry
    const updated = [{ query, timestamp: Date.now() }, ...filtered].slice(0, MAX_ENTRIES);
    this.save(updated);
  }

  getRecentQueries(limit = MAX_ENTRIES): QueryHistoryEntry[] {
    return this.load().slice(0, limit);
  }

  searchHistory(prefix: string): QueryHistoryEntry[] {
    if (!prefix.trim()) return this.getRecentQueries();
    const lower = prefix.toLowerCase();
    return this.load().filter((e) => e.query.toLowerCase().startsWith(lower));
  }

  clearHistory(): void {
    if (!this.isAvailable()) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }
}

export const queryHistory = new QueryHistoryManager();
