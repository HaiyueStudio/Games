import { Entity, Transform2D, World } from '@haiyue/engine';
import { Physics2DBody } from '@haiyue/engine/physics';
import { INK_TARGETS } from './sceneRules';
import { RIVER_LOTUSES, advanceGarden, collectLotus, newGarden } from './gardenRules';

export class InkGarden {
  private state = newGarden();
  private readonly flowers: HTMLElement[] = [];
  private readonly cranes: HTMLElement[] = [];
  private readonly hitTimes = [-100, -100, -100];
  private celebrationUntil = -1;
  constructor(world: World, layer: HTMLElement) {
    RIVER_LOTUSES.forEach((p, i) => {
      const entity = new Entity(`lotus-${i}`);
      entity.addComponent(new Transform2D(p));
      entity.addComponent(new Physics2DBody({ type: 'static', shape: 'circle', radius: 18, isSensor: true, categoryBits: 8, maskBits: 1 }));
      world.addEntity(entity);
      const node = this.sprite(layer, 'river-lotus', p.x, p.y);
      node.style.backgroundPosition = `${i * 50}% center`; this.flowers.push(node);
    });
    INK_TARGETS.forEach((p, i) => {
      const entity = new Entity(`target-${i}`);
      entity.addComponent(new Transform2D(p));
      entity.addComponent(new Physics2DBody({ type: 'static', shape: 'circle', radius: 11, restitution: .95 }));
      world.addEntity(entity);
      this.cranes.push(this.sprite(layer, 'crane', p.x, p.y));
    });
    this.sync(0, 0);
  }
  private sprite(layer: HTMLElement, className: string, x: number, y: number): HTMLElement {
    const node = document.createElement('span'); node.className = className;
    node.style.left = `${(x + 300) / 6}%`; node.style.top = `${(450 - y) / 9}%`; layer.append(node); return node;
  }
  collect(index: number, time: number): number { return collectLotus(this.state, index, time); }
  advance(time: number): void { advanceGarden(this.state, time); }
  canHitCrane(time: number): boolean { return time >= this.celebrationUntil; }
  hitCrane(index: number, time: number, completed: boolean): void {
    this.hitTimes[index] = time;
    if (completed) this.celebrationUntil = time + .9;
  }
  sync(time: number, targets: number): void {
    this.flowers.forEach((node, i) => {
      const collected = Boolean(this.state.collected & (1 << i));
      node.hidden = collected; node.dataset.collected = String(collected);
      // The painted flower stays small; a translucent ellipse anchors it to the river.
      node.style.transform = `translate(-50%,-50%) rotate(${Math.sin(time * .9 + i * 2) * 3}deg)`;
    });
    this.cranes.forEach((node, i) => {
      const celebrating = time < this.celebrationUntil;
      const hit = Boolean(targets & (1 << i));
      const elapsed = time - this.hitTimes[i]!;
      const frame = celebrating ? (Math.floor(time * 7) % 2 + 1) : hit ? (elapsed < .12 ? 1 : 2) : 0;
      node.style.backgroundPosition = `${frame * 50}% center`;
      node.dataset.pose = ['gliding', 'downstroke', 'upstroke'][frame]!;
      node.dataset.lit = String(hit || celebrating);
    });
  }
  reset(): void { this.state = newGarden(); this.hitTimes.fill(-100); this.celebrationUntil = -1; this.sync(0, 0); }
  snapshot() { return { ...this.state, cranes: this.cranes.map(node => node.dataset.pose), celebrationUntil: this.celebrationUntil }; }
}
