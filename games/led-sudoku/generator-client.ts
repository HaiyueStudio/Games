import type { Generated, Options } from './rules';
/** New generation cancels the previous worker. No synchronous fallback. */
export class GeneratorClient {
  private worker: Worker | null = null;
  private cancel: (() => void) | null = null;
  private serial = 0;
  dispose(): void { this.cancel?.(); this.cancel = null; this.worker?.terminate(); this.worker = null; }
  generate(options: Options, seed: number): Promise<Generated | null> {
    this.dispose();
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      const finish = (result: Generated | null, error?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer); this.worker?.terminate(); this.worker = null; this.cancel = null;
        if (error) reject(error); else resolve(result);
      };
      this.cancel = () => finish(null);
      try {
        const worker = new Worker(new URL('./generator.worker.js', window.location.href));
        this.worker = worker;
        worker.onmessage = ({ data }) => {
          if (data.kind !== 'led-sudoku-generated' || data.id !== id) return;
          finish(data.result ?? null, data.error ? new Error(data.error) : undefined);
        };
        worker.onerror = () => finish(null, new Error('出题线程不可用，请确认 generator.worker.js 已构建并通过 HTTP 访问。'));
        timer = setTimeout(() => finish(null, new Error('出题超时，请重试或减少组合规则。')), 30000);
        worker.postMessage({ kind: 'led-sudoku-generate', version: 1, id, options, seed });
      } catch (error) { finish(null, error instanceof Error ? error : new Error(String(error))); }
    });
  }
}
