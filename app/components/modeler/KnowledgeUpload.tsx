'use client';
import { useState } from 'react';

export default function KnowledgeUpload() {
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccess(false);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/modeler/knowledge', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error: any) {
      setError(error.message || 'Upload failed');
    } finally {
      setUploading(false);
      // Reset input
      e.target.value = '';
    }
  };

  return (
    <div className="bg-dv-surface border border-dv-border rounded-xl p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-dv-text">Knowledge Base</h2>
        <p className="text-xs text-dv-muted mt-1">
          Upload DV 2.1 methodology docs for grounded model generation
        </p>
      </div>

      <label className="block">
        <input
          type="file"
          accept=".txt,.md,.pdf"
          onChange={handleFileChange}
          disabled={uploading}
          className="block w-full text-sm text-dv-muted
            file:mr-4 file:py-2 file:px-4
            file:rounded-lg file:border file:border-dv-border
            file:text-sm file:font-medium
            file:bg-dv-bg file:text-dv-text
            hover:file:bg-dv-surface hover:file:border-dv-accent
            file:transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </label>

      {uploading && (
        <div className="flex items-center gap-2 text-sm text-dv-muted">
          <div className="w-4 h-4 border-2 border-dv-accent border-t-transparent rounded-full animate-spin"></div>
          <span>Uploading...</span>
        </div>
      )}

      {success && (
        <div className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg p-2">
          ✓ Knowledge document uploaded successfully
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
          {error}
        </div>
      )}
    </div>
  );
}
