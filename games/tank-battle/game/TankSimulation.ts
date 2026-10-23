import { FixedStepClock } from '@haiyue/engine/experimental/simulation';
import { STEP, stepGame, type GameState, type Input } from '../rules/rules';

/** Desktop and mobile share the same tick budget and phase-transition boundary. */
export class TankSimulation {
  private readonly clock = new FixedStepClock({ tickRateHz: 1 / STEP, maxSubSteps: 6, maxBacklogTicks: 0 });
  reset(): void { this.clock.reset(); }
  advance(deltaMs: number, state: GameState, inputs: readonly Input[], afterStep: (transitioned: boolean) => void): boolean {
    let transitioned = false;
    this.clock.advance(Math.min(100, Math.max(0, deltaMs)), () => {
      if (transitioned) return;
      const before = state.phase;
      stepGame(state, inputs);
      transitioned = before !== state.phase;
      afterStep(transitioned);
    });
    if (transitioned) this.reset();
    return transitioned;
  }
}
