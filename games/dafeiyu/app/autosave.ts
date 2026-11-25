/** Coalesce ordinary edits while keeping transition checkpoints ordered. */
export class LatestAutosave<T> {
  private pending: { data: T; due: number; limit: number } | undefined;
  private writing: Promise<void> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private failure: { error: unknown } | undefined;
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
    this.failure = undefined;
    this.pump();
  }

  checkpoint(data: T): void {
    this.pending = { data, due: 0, limit: 0 };
    this.failure = undefined;
    this.pump();
  }

  async flush(): Promise<void> {
    // Each explicit flush may retry a failed snapshot once. Background writes
    // stop on failure so a full quota cannot start a busy retry loop.
    this.failure = undefined;
    while (this.pending || this.writing) {
      if (this.pending) this.pending.due = 0;
      this.pump();
      await this.writing;
      this.throwIfFailed();
    }
  }

  private throwIfFailed(): void { if (this.failure) throw this.failure.error; }

  private pump(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.writing || !this.pending || this.failure) return;
    const wait = this.pending.due - performance.now();
    if (wait > 0) { this.timer = setTimeout(() => this.pump(), wait); return; }
    const snapshot = this.pending;
    this.pending = undefined;
    // Normalize synchronous failures without deferring the start of a checkpoint.
    let write: Promise<void>;
    try { write = this.write(snapshot.data); }
    catch (error) { write = Promise.reject(error); }
    this.writing = write.catch(error => {
      this.pending ??= snapshot;
      this.failure = { error };
    }).finally(() => {
      this.writing = undefined;
      this.pump();
    });
  }
}
