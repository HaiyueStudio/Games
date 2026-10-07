import { Entity, Transform2D, World } from '@haiyue/engine';
import { Physics2DBody, Physics2DSystem } from '@haiyue/engine/physics';
import { POCKET_SPRINGS, advanceSpring, newSpring, springCompression } from '../pinball/springRules';
import { advanceToad, diveToad, newToadCycle, toadGateOpen, toadPose } from './toadRules';
import { WATER_LEVEL } from './waterModel';

type Ball = { entity: Entity; body: Physics2DBody; transform: Transform2D };
/** One rescue per visit. Empty leaves expose a real opening in the side rail. */
export class ToadSprings {
 private readonly states = POCKET_SPRINGS.map(() => newSpring());
 private readonly cycles = POCKET_SPRINGS.map(() => newToadCycle());
 private readonly sensors: Entity[] = [];
 private readonly nodes: HTMLImageElement[] = [];
 private readonly pads: HTMLImageElement[] = [];
 private readonly gates = [false, false];
 private readonly velocity = { x: 0, y: 0 };
 private time = 0;
 constructor(world: World, private readonly physics: Physics2DSystem, art: HTMLElement,
  private readonly impact: (x: number, y: number) => void,
  private readonly setGate: (index: number, open: boolean) => void,
  private readonly splash: (x: number, y: number, time: number) => void) {
  POCKET_SPRINGS.forEach((s, i) => {
   const e = new Entity(`Toad rescue ${i}`); e.addComponent(new Transform2D({ x: s.x, y: s.y }));
   e.addComponent(new Physics2DBody({ type: 'static', shape: 'box', width: 20, height: 54, isSensor: true, categoryBits: 8, maskBits: 1 })); world.addEntity(e); this.sensors.push(e);
   const pad = new Image(); pad.src = './assets/lily-pad.png'; pad.alt = ''; pad.className = 'lily-pad'; pad.style.left = `${(s.x + 300) / 6}%`; pad.style.top = `${(450 - s.y + 42) / 9}%`; art.append(pad); this.pads.push(pad);
   const node = new Image(); node.src = './assets/toad.png'; node.alt = ''; node.className = 'toad'; node.style.left = `${(s.x + 300) / 6}%`; node.style.top = `${(450 - s.y + 18) / 9}%`; art.append(node); this.nodes.push(node);
  });
 }
 beforeStep(time: number, ball: Ball, playing: boolean): void {
  this.cycles.forEach((cycle, i) => {
   const s = POCKET_SPRINGS[i]!, transition = advanceToad(cycle, time);
   if (transition === 'dive' || transition === 'return') this.splash(s.x, WATER_LEVEL, time);
   if (transition === 'perch') { const launches = this.states[i]!.launches; Object.assign(this.states[i]!, newSpring(), { launches }); this.impact(s.x, s.y); }
   let open = toadGateOpen(cycle, time);
   // Let a ball already crossing the gap finish falling before restoring support.
   if (!open && this.gates[i] && playing && Math.abs(ball.transform.x - s.x) < 36 && ball.transform.y < -100 && ball.transform.y > -245) open = true;
   if (open !== this.gates[i]) { this.gates[i] = open; this.setGate(i, open); }
  });
 }
 afterStep(ball: Ball, time: number): boolean {
  let fired = false; this.physics.getLinearVelocity(ball.body, this.velocity); const events = this.physics.events();
  this.sensors.forEach((sensor, i) => {
   const state = this.states[i]!, cycle = this.cycles[i]!;
   // Finish steering the rescued ball, but never arm again while the toad is away.
   if (cycle.phase !== 'perched' && state.phase !== 'launching') return;
   const touching = events.some(e => e.phase !== 'exit' && ((e.entityA === sensor && e.entityB === ball.entity) || (e.entityB === sensor && e.entityA === ball.entity)));
   const spring = POCKET_SPRINGS[i]!, action = advanceSpring(state, time, touching, ball.transform.y, this.velocity.y, spring.clearY);
   if (action === 'launch') { this.physics.setLinearVelocity(ball.body, 0, 10.5); this.physics.setAngularVelocity(ball.body, 0); diveToad(cycle, time); this.impact(spring.x, spring.y); fired = true; }
   else if (action === 'steer') this.physics.setLinearVelocity(ball.body, spring.inward * 4.2, Math.max(6, this.velocity.y));
  }); return fired;
 }
 sync(time: number): void {
  this.time = time; this.nodes.forEach((node, i) => {
   const s = POCKET_SPRINGS[i]!, cycle = this.cycles[i]!, depth = s.y - 18 - WATER_LEVEL;
   const compression = springCompression(this.states[i]!, time), pose = toadPose(cycle, time, depth);
   node.style.transform = `translate(-50%, calc(-50% - ${pose.lift / 65 * 100}%)) rotate(${pose.rotation * (i ? -1 : 1)}deg) scale(${(i ? -1 : 1) * (1 + compression * .12)},${1 - compression * .2})`;
   node.style.opacity = String(pose.opacity); node.dataset.phase = cycle.phase;
   this.pads[i]!.dataset.empty = String(cycle.phase !== 'perched');
  });
 }
 ballLost(): void { this.states.forEach(s => { const launches = s.launches; Object.assign(s, newSpring(), { launches }); }); }
 reset(): void {
  this.states.forEach(s => Object.assign(s, newSpring())); this.cycles.forEach(s => Object.assign(s, newToadCycle()));
  this.gates.forEach((_, i) => { this.gates[i] = false; this.setGate(i, false); }); this.sync(0);
 }
 snapshot() { return this.states.map((s, i) => ({ ...s, cycle: { ...this.cycles[i]! }, gateOpen: this.gates[i]!, jump: Math.max(0, toadPose(this.cycles[i]!, this.time, POCKET_SPRINGS[i]!.y - 18 - WATER_LEVEL).lift) })); }
}
