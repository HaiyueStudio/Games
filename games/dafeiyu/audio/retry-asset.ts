/** Retry failed audio on later gestures/resumes, without a retry timer or duplicate jobs. */
export class RetryAudioAsset {
  private job: Promise<void> | undefined;
  private retryAt = 0;
  private disposed = false;
  private status: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  private attempts = 0;
  private readonly load: () => Promise<void>;
  private readonly report: (error: unknown) => void;
  private readonly now: () => number;
  private readonly retryDelay: number;

  constructor(load: () => Promise<void>, report: (error: unknown) => void,
    now: () => number = () => performance.now(), retryDelay = 1000) {
    this.load = load; this.report = report; this.now = now; this.retryDelay = retryDelay;
  }

  prepare(): Promise<void> | undefined {
    if (this.disposed || this.status === 'ready') return;
    if (this.job) return this.job;
    if (this.now() < this.retryAt) return;
    this.status = 'loading';
    this.attempts++;
    this.job = (async () => this.load())().then(() => {
      if (!this.disposed) this.status = 'ready';
    }, error => {
      if (this.disposed) return;
      this.status = 'failed';
      this.retryAt = this.now() + this.retryDelay;
      this.report(error);
    }).finally(() => { this.job = undefined; });
    return this.job;
  }

  snapshot() { return { status: this.status, attempts: this.attempts }; }
  dispose(): void { this.disposed = true; }
}
