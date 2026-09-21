export const COMPLETION_SWEEP_MS = 2200;

/** One bounded pass per incomplete → complete transition, never on resume/redraw. */
export class CompletionSweep {
  private puzzle: object | null = null;
  private completed = false;
  private started: number | null = null;
  get active(): boolean { return this.started !== null; }
  observe(puzzle: object, completed: boolean, now: number): void {
    if(this.puzzle!==puzzle){this.puzzle=puzzle;this.completed=completed;this.cancel();return;}
    if(!completed)this.cancel();
    else if(!this.completed)this.started=now;
    this.completed=completed;
  }
  progress(now: number): number | undefined {
    if(this.started===null)return undefined;
    const elapsed=Math.max(0,now-this.started);
    if(elapsed>=COMPLETION_SWEEP_MS){this.cancel();return undefined;}
    return elapsed/COMPLETION_SWEEP_MS;
  }
  cancel(): void { this.started=null; }
}

/** Diagonal wave over cell backgrounds; no blur or lighting on the digits. */
export function completionCellOpacity(cell: number, progress?: number, width=9): number {
  if(progress===undefined||!Number.isFinite(progress)||progress<=0||progress>=1)return 0;
  const distance=Math.abs(Math.floor(cell/width)+cell%width-(progress*(2*width+4)-3));
  const strength=Math.max(0,1-distance/3);
  return .336*strength*strength*(3-2*strength);
}
