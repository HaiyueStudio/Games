import type { Item } from '../rules/model';
import { FRUIT_SOUNDS, type FruitSound } from './sounds';

export interface FruitAudioPlay { channel: string; gain: number; pan: number; priority: number; rate: number }
export interface FruitAudioBackend {
  unlock(): void;
  play(id: FruitSound, options: FruitAudioPlay): boolean;
  stop(channel?: string): void;
  dispose(): void;
  snapshot(): unknown;
}

/** Event policy uses game time; gameplay rules never depend on playback or browser state. */
export class FruitAudio {
  private active = false;
  private disposed = false;
  private clock = 0;
  private pendingClick = -Infinity;
  private pendingOver = Infinity;
  private ended = false;
  private throwIndex = 0;
  private splashIndex = 0;
  private readonly last = new Map<string, number>();
  private readonly played = { button: 0, throw: 0, splash: 0, bomb: 0, over: 0 };
  private readonly backend: FruitAudioBackend;
  constructor(backend: FruitAudioBackend) { this.backend = backend; }
  unlock(): void { if (!this.disposed) this.backend.unlock(); }
  start(): void {
    if (this.disposed) return;
    this.pause(); this.ended = false; this.active = true; this.throwIndex = this.splashIndex = 0; this.backend.unlock();
  }
  resume(): void { if (!this.disposed && !this.ended) { this.active = true; this.backend.unlock(); } }
  click(): void {
    if (this.disposed) return;
    this.backend.unlock(); this.pendingClick = this.clock + .25;
  }
  update(dt: number): void {
    if (this.disposed) return;
    if (Number.isFinite(dt) && dt > 0) this.clock += dt;
    if (this.clock <= this.pendingClick && this.play('ui-click', 'ui', 0, 'button', .035)) this.pendingClick = -Infinity;
    if (this.clock >= this.pendingOver) {
      if (this.clock - this.pendingOver > .3 || this.play('game-over', 'over', 0, 'over')) this.pendingOver = Infinity;
    }
  }
  thrown(items: readonly Item[]): void {
    if (!this.active || this.disposed) return;
    const fruit = items.filter(item => item.kind === 'fruit'); if (!fruit.length) return;
    const id = (['fruit-throw-a', 'fruit-throw-b', 'fruit-throw-c'] as const)[this.throwIndex++ % 3]!;
    this.play(id, 'throw', fruit.reduce((sum, item) => sum + item.x, 0) / fruit.length, 'throw', .08);
  }
  hit(item: Item): void {
    if (!this.active || this.disposed) return;
    if (item.kind === 'bomb') this.play('bomb-explosion', 'bomb', item.x, 'bomb', .06);
    else if (item.kind === 'fruit') {
      const index = this.splashIndex++, id = (['fruit-splash-a', 'fruit-splash-b', 'fruit-splash-c'] as const)[index % 3]!;
      this.play(id, `splash-${index % 6}`, item.x, 'splash', .035, .95 + item.fruit * .015);
    }
  }
  finish(reason: 'time' | 'bombs'): void {
    if (this.disposed || this.ended) return;
    this.ended = true; this.active = false;
    this.backend.stop('throw');
    // Let the final bomb's attack be heard before the short ending cue enters.
    this.pendingOver = this.clock + (reason === 'bombs' ? .18 : 0);
  }
  private play(id: FruitSound, channel: string, x: number, category: keyof typeof this.played, cooldown = 0, rate = 1): boolean {
    if (this.clock - (this.last.get(category) ?? -Infinity) < cooldown) return false;
    const definition = FRUIT_SOUNDS[id], pan = category === 'button' || category === 'over' ? 0 : Math.max(-.65, Math.min(.65, (x - 500) / 700));
    if (!this.backend.play(id, { channel, gain: definition.gain, pan, priority: definition.priority, rate })) return false;
    this.last.set(category, this.clock); this.played[category]++; return true;
  }
  pause(): void {
    if (this.disposed) return;
    this.active = false; this.pendingClick = -Infinity; this.pendingOver = Infinity; this.last.clear(); this.backend.stop();
  }
  dispose(): void { if (this.disposed) return; this.pause(); this.disposed = true; this.backend.dispose(); }
  snapshot() { return { active: this.active, played: { ...this.played }, pending: Number.isFinite(this.pendingOver) || this.clock <= this.pendingClick, backend: this.backend.snapshot() }; }
}
