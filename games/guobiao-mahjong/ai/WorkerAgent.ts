import type { Match, Observation } from '../rules/types';
import type { Replay } from '../rules/replay';
import type { Decision } from './strategy';
export class WorkerAgent {
  private readonly worker: Worker;
  private serial = 0;
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  constructor(url: URL) {
    this.worker = new Worker(url, { type: 'module', name: 'mcr-strategy' });
    this.worker.onmessage = event => { const p = this.pending.get(event.data.id); if (!p) return; this.pending.delete(event.data.id); if (event.data.error) p.reject(new Error(event.data.error)); else p.resolve(event.data.result); };
    this.worker.onerror = event => this.fail(new Error(event.message || 'AI worker failed'));
  }
  private fail(error: Error): void { for (const p of this.pending.values()) p.reject(error); this.pending.clear(); }
  private request<T>(data: object): Promise<T> { return new Promise((resolve, reject) => { const id = ++this.serial; this.pending.set(id, { resolve: value => resolve(value as T), reject }); this.worker.postMessage({ ...data, id }); }); }
  async init(bytes: ArrayBuffer): Promise<void> { await this.request({ bytes }); }
  decide(observation: Observation, depth = 2): Promise<Decision> { return this.request({ observation, depth }); }
  replay(replay: Replay): Promise<Match> { return this.request({ replay }); }
  dispose(): void { this.fail(new Error('AI worker disposed')); this.worker.terminate(); }
}
