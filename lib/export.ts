import type { ChatMessage, ExportOptions } from '@/types';

export function exportToMarkdown(messages: ChatMessage[], options: ExportOptions): string {
  const lines: string[] = [];

  if (options.includeMetadata) {
    lines.push('# Conversation Export');
    lines.push('');
    lines.push(`**Date:** ${new Date().toLocaleString()}`);
    lines.push(`**Messages:** ${messages.length}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  messages.forEach((msg, index) => {
    const roleLabel = msg.role === 'user' ? '## User' : '## Assistant';
    lines.push(roleLabel);

    if (options.includeTimestamps && msg.timestamp) {
      const ts = msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp);
      lines.push(`*${ts.toLocaleTimeString()}*`);
      lines.push('');
    }

    lines.push(msg.content);

    if (options.includeSources && msg.sources && msg.sources.length > 0) {
      lines.push('');
      lines.push('**Sources:**');
      msg.sources.forEach((src, i) => {
        lines.push(`[^${index + 1}-${i + 1}]: ${src.filename} (${Math.round(src.similarity * 100)}% match) — ${src.excerpt}`);
      });
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  });

  return lines.join('\n');
}

export function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
