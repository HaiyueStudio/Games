import { CALENDAR_SOLVER_MODEL, solveCalendarPuzzle, type CalendarSolveInput, type CalendarSolveResult } from './solver';
export interface CalendarSolverWorker {
  onmessage: ((event: { data: { kind: string; id: number; result?: CalendarSolveResult; error?: string } }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  postMessage(data: unknown): void;
  terminate(): void;
}
export class CalendarSolverClient {
  private pending: { worker: CalendarSolverWorker; cancel: () => void } | null = null;
  private revision = 0;
  private readonly factory: () => CalendarSolverWorker;
  constructor(factory: () => CalendarSolverWorker = createBrowserCalendarWorker) { this.factory = factory; }
  cancel(): void { this.pending?.cancel(); this.pending = null; }
  solve(input: CalendarSolveInput): Promise<CalendarSolveResult | null> {
    this.cancel(); const id = ++this.revision;
    return new Promise((resolve, reject) => {
      let worker: CalendarSolverWorker;
      try { worker = this.factory(); } catch (error) { reject(error); return; }
      let done = false;
      const finish = (result: CalendarSolveResult | null, error?: unknown) => {
        if (done) return; done = true; clearTimeout(timer); worker.onmessage = null; worker.onerror = null; worker.terminate();
        if (this.pending?.worker === worker) this.pending = null;
        if (error) reject(error); else resolve(result);
      };
      const timer = setTimeout(() => finish(null, new Error('Calendar solver timed out')), 8000);
      this.pending = { worker, cancel: () => finish(null) };
      worker.onmessage = ({ data }) => { if (data.kind === 'calendar-solution' && data.id === id) finish(data.result ?? null, data.error ? new Error(data.error) : undefined); };
      worker.onerror = error => finish(null, error);
      try { worker.postMessage({ kind: 'calendar-solve', version: 1, id, input }); } catch (error) { finish(null, error); }
    });
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
