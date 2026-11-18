/** Coalesce ordinary edits while keeping transition checkpoints ordered. */
export class LatestAutosave<T> {
  private pending: { data: T; due: number; limit: number } | undefined;
  private writing: Promise<void> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly write: (data: T) => Promise<void>;
  private readonly delay: number;
  private readonly maxDelay: number;

  constructor(write: (data: T) => Promise<void>, delay = 250, maxDelay = 1000) {
    this.write = write;
    this.delay = delay;
    this.maxDelay = maxDelay;
  }

  schedule(data: T): void {
    const now = performance.now();
    const limit = this.pending?.limit ?? now + this.maxDelay;
    const due = this.pending?.due === 0 ? 0 : Math.min(now + this.delay, limit);
    this.pending = { data, due, limit };
    this.pump();
  }

  checkpoint(data: T): void {
    this.pending = { data, due: 0, limit: 0 };
    this.pump();
  }

  async flush(): Promise<void> {
    while (this.pending || this.writing) {
      if (this.pending) this.pending.due = 0;
      this.pump();
      await this.writing;
    }
  }

  private pump(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.writing || !this.pending) return;
    const wait = this.pending.due - performance.now();
    if (wait > 0) { this.timer = setTimeout(() => this.pump(), wait); return; }
    const { data } = this.pending;
    this.pending = undefined;
    this.writing = this.write(data).catch(() => {
      // The save service reports errors. A newer snapshot must still be writable.
    }).finally(() => {
      this.writing = undefined;
      this.pump();
    });
  }
}
