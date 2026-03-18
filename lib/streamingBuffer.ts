export class StreamingBuffer {
  private content = '';
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  append(token: string): void {
    this.content += token;
    // Reset timeout watcher on each new token
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  getPartialContent(): string {
    return this.content;
  }

  clear(): void {
    this.content = '';
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  startTimeoutWatcher(ms: number, onTimeout: () => void): void {
    if (this.timeoutId !== null) clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => {
      this.timeoutId = null;
      onTimeout();
    }, ms);
  }
}
