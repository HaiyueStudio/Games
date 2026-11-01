import type { GameState, Ink, InkPair } from '../rules/model';

const inks: readonly Ink[] = ['black', 'white'];
/** Distance in board cells reached by each wet brush tip. Rule state remains immediate. */
export class InkStrokeReveal {
  private puzzle: GameState['puzzle'] | null = null;
  private paths: GameState['paths'] = { black: [], white: [] };
  private distance: InkPair<number> = { black: 0, white: 0 };
  private lastTime: number | null = null;
  get distances(): InkPair<number> { return { ...this.distance }; }
  get animating(): boolean { return inks.some(ink => this.distance[ink] < this.paths[ink].length - 1); }
  setState(state: GameState): void {
    const changedPuzzle = state.puzzle !== this.puzzle;
    for (const ink of inks) {
      const before = this.paths[ink], after = state.paths[ink];
      if (changedPuzzle) this.distance[ink] = after.length - 1;
      else if (before !== after) {
        let common = 0;
        while (common < before.length && before[common] === after[common]) common++;
        this.distance[ink] = Math.min(this.distance[ink], Math.max(0, common - 1));
      }
    }
    this.paths = state.paths; this.puzzle = state.puzzle;
  }
  advance(time: number, reducedMotion = false): boolean {
    const delta = this.lastTime === null ? 0 : Math.max(0, Math.min(50, time - this.lastTime));
    this.lastTime = time;
    let changed = false;
    for (const ink of inks) {
      const target = Math.max(0, this.paths[ink].length - 1), before = this.distance[ink];
      // A long fast drag catches up smoothly without leaving a seconds-long animation queue.
      this.distance[ink] = reducedMotion ? target : Math.min(target, before + delta / 115 * (1 + Math.max(0, target - before - 1) * .3));
      changed ||= before !== this.distance[ink];
    }
    return changed;
  }
}
