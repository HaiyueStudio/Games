import { CALENDAR_SOLVER_MODEL, solveCalendarPuzzle, type CalendarSolveInput, type CalendarSolveResult } from './solver';
import { CalendarSolutionCache } from './solution-cache';
export interface CalendarSolverWorker {
  onmessage: ((event: { data: { kind: string; id: number; result?: CalendarSolveResult; error?: string } }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  postMessage(data: unknown): void;
  terminate(): void;
}
interface SolveRequest {
  id: number;
  input: CalendarSolveInput;
  finish: (result: CalendarSolveResult | null, error?: unknown) => void;
}
/** One reusable worker, one running solve and at most one latest waiting request. */
export class CalendarSolverClient {
  private worker: CalendarSolverWorker | null = null;
  private active: SolveRequest | null = null;
  private waiting: SolveRequest | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private revision = 0;
  private disposed = false;
  private readonly cache = new CalendarSolutionCache();
  private cacheHits = 0;
  private workerRuns = 0;
  private readonly factory: () => CalendarSolverWorker;
  constructor(factory: () => CalendarSolverWorker = createBrowserCalendarWorker) { this.factory = factory; }
  cached(input: CalendarSolveInput): CalendarSolveResult | null {
    if (this.disposed) return null;
    const result = this.cache.get(input);
    if (result) this.cacheHits++;
    return result;
  }
  snapshot() { return { cacheHits:this.cacheHits, workerRuns:this.workerRuns, solutions:this.cache.size }; }
  cancel(): void {
    // Let bounded worker computation finish. Terminating and reloading on every
    // pointer event races native module teardown and wastes worker startup time.
    this.active?.finish(null);
    this.waiting?.finish(null);
    this.waiting = null;
  }
  dispose(): void {
    this.disposed = true;
    this.cancel();
    this.resetWorker();
    this.active = null;
    this.cache.clear();
  }
  solve(input: CalendarSolveInput): Promise<CalendarSolveResult | null> {
    if (this.disposed) return Promise.resolve(null);
    this.cancel();
    return new Promise((resolve, reject) => {
      let done = false;
      this.waiting = { id: ++this.revision, input:{ ...input, fixed:input.fixed.map(p => ({ ...p })) }, finish: (result, error) => {
        if (done) return;
        done = true;
        if (error) reject(error); else resolve(result);
      } };
      this.dispatch();
    });
  }
  private resetWorker(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
  }
  private complete(result: CalendarSolveResult | null, error?: unknown, broken = false): void {
    const request = this.active;
    // Even a cancelled consumer can leave a useful bounded worker computation.
    if (request && result && !error) this.cache.put(request.input, result);
    this.active = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (broken) this.resetWorker();
    request?.finish(result, error);
    this.dispatch();
  }
  private dispatch(): void {
    if (this.disposed || !this.waiting) return;
    const cached = this.cached(this.waiting.input);
    if (cached) {
      const request = this.waiting; this.waiting = null; request.finish(cached); return;
    }
    if (this.active) return;
    this.active = this.waiting;
    this.waiting = null;
    try {
      if (!this.worker) {
        const worker = this.factory();
        this.worker = worker;
        worker.onmessage = ({ data }) => {
          if (this.worker !== worker || data.kind !== 'calendar-solution' || data.id !== this.active?.id) return;
          this.complete(data.result ?? null, data.error ? new Error(data.error) : undefined);
        };
        worker.onerror = error => { if (this.worker === worker) this.complete(null, error, true); };
      }
      this.timer = setTimeout(() => this.complete(null, new Error('Calendar solver timed out'), true), 8000);
      this.workerRuns++;
      this.worker.postMessage({ kind: 'calendar-solve', version: 1, id: this.active.id, input: this.active.input });
    } catch (error) { this.complete(null, error, true); }
  }
}
function createBrowserCalendarWorker(): CalendarSolverWorker {
  const source = `const solve=${solveCalendarPuzzle.toString()};const model=${JSON.stringify(CALENDAR_SOLVER_MODEL)};onmessage=({data})=>{if(data.kind!=='calendar-solve'||data.version!==1)return;try{postMessage({kind:'calendar-solution',id:data.id,result:solve(data.input,model)})}catch(error){postMessage({kind:'calendar-solution',id:data.id,error:String(error)})}};`;
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    const worker = new globalThis.Worker(url);
    const terminate = worker.terminate.bind(worker);
    worker.terminate = () => { terminate(); URL.revokeObjectURL(url); };
    return worker as unknown as CalendarSolverWorker;
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}
