'use client';
import { useState } from 'react';
import UploadSection from '@/app/components/modeler/UploadSection';
import ModelVisualization from '@/app/components/modeler/ModelVisualization';
import ExportButtons from '@/app/components/modeler/ExportButtons';
import KnowledgeUpload from '@/app/components/modeler/KnowledgeUpload';
import ModelHistory from '@/app/components/modeler/ModelHistory';
import type { DVModelStructure } from '@/types/modeler';

export default function ModelerPage() {
  const [currentModel, setCurrentModel] = useState<DVModelStructure | null>(null);
  const [ocrId, setOcrId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUploadComplete = (id: string) => {
    setOcrId(id);
    setError(null);
  };

  const handleModelGenerated = (model: DVModelStructure) => {
    setCurrentModel(model);
    setError(null);
  };

  const handleModelSelected = (model: DVModelStructure) => {
    setCurrentModel(model);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-dv-bg">
      {/* Header */}
      <div className="border-b border-dv-border bg-dv-surface/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-dv-text">Data Vault Model Generator</h1>
              <p className="text-sm text-dv-muted mt-1">
                Transform ERD images into Data Vault 2.1 models with AI
              </p>
            </div>
            <div className="flex items-center gap-3">
              <a
                href="/"
                className="text-xs px-3 py-1.5 border border-dv-border rounded-lg text-dv-muted hover:border-dv-accent hover:text-dv-accent transition-colors"
              >
                DV Assistant
              </a>
              <a
                href="/admin"
                className="text-xs px-3 py-1.5 border border-dv-border rounded-lg text-dv-muted hover:border-dv-accent hover:text-dv-accent transition-colors"
              >
                Admin
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Upload & Controls */}
          <div className="lg:col-span-1 space-y-6">
            {/* Upload Section */}
            <UploadSection
              onUploadComplete={handleUploadComplete}
              onModelGenerated={handleModelGenerated}
              ocrId={ocrId}
              setLoading={setLoading}
              setError={setError}
            />

            {/* Knowledge Upload */}
            <KnowledgeUpload />

            {/* Model History */}
            <ModelHistory onModelSelect={handleModelSelected} />
          </div>

          {/* Right Column: Visualization & Export */}
          <div className="lg:col-span-2 space-y-6">
            {/* Visualization */}
            <div className="bg-dv-surface border border-dv-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-dv-text">Model Visualization</h2>
                {currentModel && <ExportButtons model={currentModel} />}
              </div>
              
              {loading ? (
                <div className="h-[600px] flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-12 h-12 border-4 border-dv-accent border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-sm text-dv-muted">Generating model...</p>
                  </div>
                </div>
              ) : currentModel ? (
                <ModelVisualization model={currentModel} />
              ) : (
                <div className="h-[600px] flex items-center justify-center border-2 border-dashed border-dv-border rounded-lg">
                  <div className="text-center max-w-md">
                    <svg className="w-16 h-16 mx-auto mb-4 text-dv-muted/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h3 className="text-lg font-semibold text-dv-text mb-2">No Model Yet</h3>
                    <p className="text-sm text-dv-muted">
                      Upload an ERD image and generate a Data Vault 2.1 model to see the visualization here.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Legend */}
            {currentModel && (
              <div className="bg-dv-surface border border-dv-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-dv-text mb-3">Entity Types</h3>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-blue-500"></div>
                    <span className="text-xs text-dv-muted">Hubs (Business Keys)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-green-500"></div>
                    <span className="text-xs text-dv-muted">Links (Relationships)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-orange-500"></div>
                    <span className="text-xs text-dv-muted">Satellites (Attributes)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confidentiality Disclaimer */}
      <div className="border-t border-dv-border bg-dv-surface/30 py-3">
        <p className="text-xs text-gray-500 text-center flex items-center justify-center gap-1.5">
          <span className="text-amber-500">⚠️</span>
          <span>Confidential: Internal enterprise tool. Commercial usage and extraction for LLM training purposes are strictly prohibited.</span>
        </p>
      </div>
    </div>
  );
}
