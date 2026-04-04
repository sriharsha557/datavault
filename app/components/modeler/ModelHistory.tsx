'use client';
import { useState, useEffect } from 'react';
import type { ModelListItem, DVModelStructure } from '@/types/modeler';

interface ModelHistoryProps {
  onModelSelect: (model: DVModelStructure) => void;
}

export default function ModelHistory({ onModelSelect }: ModelHistoryProps) {
  const [models, setModels] = useState<ModelListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    try {
      const response = await fetch('/api/modeler/models');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch models');
      }

      setModels(data.models);
    } catch (error: any) {
      setError(error.message || 'Failed to fetch models');
    } finally {
      setLoading(false);
    }
  };

  const handleModelClick = async (modelId: string) => {
    try {
      const response = await fetch(`/api/modeler/models/${modelId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch model');
      }

      onModelSelect(data.model);
    } catch (error: any) {
      setError(error.message || 'Failed to load model');
    }
  };

  return (
    <div className="bg-dv-surface border border-dv-border rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-dv-text">Model History</h2>
        <button
          onClick={fetchModels}
          className="text-xs text-dv-muted hover:text-dv-accent transition-colors"
          title="Refresh"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="w-6 h-6 border-2 border-dv-accent border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs text-dv-muted">Loading models...</p>
        </div>
      ) : error ? (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      ) : models.length === 0 ? (
        <div className="text-center py-8">
          <svg className="w-12 h-12 mx-auto mb-2 text-dv-muted/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-xs text-dv-muted">No models yet</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {models.map((model) => (
            <button
              key={model.id}
              onClick={() => handleModelClick(model.id)}
              className="w-full text-left p-3 border border-dv-border rounded-lg hover:border-dv-accent hover:bg-dv-bg transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-dv-text truncate">
                    {model.filename}
                  </p>
                  <p className="text-xs text-dv-muted mt-1">
                    {new Date(model.created_at).toLocaleDateString()} · {model.grounded ? '🔒 Grounded' : 'Standard'}
                  </p>
                </div>
                <svg className="w-4 h-4 text-dv-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
