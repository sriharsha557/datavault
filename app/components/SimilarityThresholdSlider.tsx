'use client';
import { useState, useEffect } from 'react';
import type { SimilarityThresholdConfig } from '@/types';

const PREFS_KEY = 'dv-assistant-preferences';
const DEFAULT_CONFIG: SimilarityThresholdConfig = { threshold: 0.5, enabled: false };

function loadConfig(): SimilarityThresholdConfig {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      threshold: typeof parsed.threshold === 'number' ? parsed.threshold : DEFAULT_CONFIG.threshold,
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_CONFIG.enabled,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

interface Props {
  onChange: (config: SimilarityThresholdConfig) => void;
}

export default function SimilarityThresholdSlider({ onChange }: Props) {
  const [config, setConfig] = useState<SimilarityThresholdConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    const saved = loadConfig();
    setConfig(saved);
    onChange(saved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (next: SimilarityThresholdConfig) => {
    setConfig(next);
    onChange(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {}
  };

  const lowConfidence = config.enabled && config.threshold < 0.4;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => update({ ...config, enabled: e.target.checked })}
          className="w-3 h-3 accent-dv-accent"
        />
        <span className="text-xs text-dv-muted">Min similarity</span>
      </label>

      {config.enabled && (
        <>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.threshold}
            onChange={(e) => update({ ...config, threshold: parseFloat(e.target.value) })}
            className="w-24 accent-dv-accent"
            aria-label="Similarity threshold"
          />
          <span className={`text-xs font-mono ${lowConfidence ? 'text-amber-500' : 'text-dv-text'}`}>
            {config.threshold.toFixed(2)}
          </span>
          {lowConfidence && (
            <span className="text-[10px] text-amber-500" title="Low threshold may return poor matches">
              ⚠ low
            </span>
          )}
        </>
      )}
    </div>
  );
}
