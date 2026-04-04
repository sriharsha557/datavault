'use client';
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import type { DVModelStructure } from '@/types/modeler';

interface UploadSectionProps {
  onUploadComplete: (ocrId: string) => void;
  onModelGenerated: (model: DVModelStructure) => void;
  ocrId: string | null;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export default function UploadSection({
  onUploadComplete,
  onModelGenerated,
  ocrId,
  setLoading,
  setError,
}: UploadSectionProps) {
  const [uploading, setUploading] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [grounded, setGrounded] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/modeler/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setExtractedText(data.extracted_text);
      onUploadComplete(data.ocr_id);
    } catch (error: any) {
      setError(error.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [onUploadComplete, setError]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif'],
      'application/pdf': ['.pdf'],
    },
    maxSize: 16 * 1024 * 1024, // 16MB
    multiple: false,
  });

  const handleGenerate = async () => {
    if (!ocrId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/modeler/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocr_id: ocrId, grounded }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Model generation failed');
      }

      onModelGenerated(data.model);
    } catch (error: any) {
      setError(error.message || 'Model generation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-dv-surface border border-dv-border rounded-xl p-6 space-y-4">
      <h2 className="text-lg font-semibold text-dv-text">Upload ERD</h2>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-dv-accent bg-dv-accent/5'
            : 'border-dv-border hover:border-dv-accent'
        }`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <div className="py-4">
            <div className="w-8 h-8 border-4 border-dv-accent border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-sm text-dv-muted">Extracting text...</p>
          </div>
        ) : (
          <>
            <svg
              className="w-12 h-12 mx-auto mb-3 text-dv-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-sm font-medium text-dv-text mb-1">
              {isDragActive ? 'Drop the file here' : 'Drop ERD image or click to upload'}
            </p>
            <p className="text-xs text-dv-muted">PNG, JPG, GIF, PDF (max 16MB)</p>
          </>
        )}
      </div>

      {/* Extracted Text Preview */}
      {extractedText && (
        <div className="bg-dv-bg border border-dv-border rounded-lg p-3">
          <p className="text-xs font-semibold text-dv-text mb-2">Extracted Text Preview:</p>
          <p className="text-xs text-dv-muted font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
            {extractedText}
          </p>
        </div>
      )}

      {/* Knowledge-Grounded Mode */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={grounded}
          onChange={(e) => setGrounded(e.target.checked)}
          className="w-4 h-4 accent-dv-accent"
        />
        <span className="text-sm text-dv-text">Knowledge-Grounded Mode</span>
        <span className="text-xs text-dv-muted">(Use uploaded DV methodology)</span>
      </label>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={!ocrId || uploading}
        className="w-full px-4 py-2.5 bg-dv-accent text-white rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-dv-accent/90 transition-colors"
      >
        Generate Data Vault 2.1 Model
      </button>
    </div>
  );
}
