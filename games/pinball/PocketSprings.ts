import { Entity, Transform2D, World } from '@haiyue/engine';
import { Physics2DBody, Physics2DSystem } from '@haiyue/engine/physics';
import { POCKET_SPRINGS, advanceSpring, newSpring, springCompression } from './springRules';

/** Sensor-driven slingshot-pocket rescue. All movement remains in Haiyue physics. */
export class PocketSprings {
  private readonly states = POCKET_SPRINGS.map(() => newSpring());
  private readonly sensors: Entity[] = [];
  private readonly visuals: Array<{ node: SVGSVGElement; moving: SVGGElement }> = [];
  private readonly velocity = { x: 0, y: 0 };
  constructor(world: World, private physics: Physics2DSystem, art: HTMLElement) {
    POCKET_SPRINGS.forEach((spring, i) => {
      const entity = new Entity(`Pocket spring ${i}`);
      entity.addComponent(new Transform2D({ x: spring.x, y: spring.y }));
      entity.addComponent(new Physics2DBody({ type: 'static', shape: 'box', width: 20, height: 54, isSensor: true, categoryBits: 8, maskBits: 1 }));
      world.addEntity(entity); this.sensors.push(entity);
      const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      node.setAttribute('viewBox', '0 0 32 62'); node.setAttribute('aria-hidden', 'true');
      node.classList.add('pocket-spring'); node.style.left = `${(spring.x + 300) / 6}%`; node.style.top = `${(450 - spring.y) / 9}%`;
      node.innerHTML = '<g fill="none" stroke="#626552" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 46 H27 M7 48 H25"/><g class="spring-moving"><path d="M16 13 L7 18 L25 23 L7 28 L25 33 L7 38 L16 43"/><path d="M5 9 Q16 6 27 9 L26 14 H6 Z" fill="#b87552"/><path d="M8 11 H24" stroke="#efcf98"/></g><path d="M16 2 V-5 M12-1 L16-5 L20-1" stroke="#a96749"/></g><text x="16" y="58" text-anchor="middle" fill="#927b53" font-size="6">自动回弹</text>';
      const moving = node.querySelector<SVGGElement>('.spring-moving')!;
      art.append(node); this.visuals.push({ node, moving });
    });
  }
  afterStep(ball: { entity: Entity; body: Physics2DBody; transform: Transform2D }, time: number): boolean {
    let fired = false;
    this.physics.getLinearVelocity(ball.body, this.velocity);
    const events = this.physics.events();
    this.sensors.forEach((sensor, i) => {
      const touching = events.some(event => event.phase !== 'exit' && ((event.entityA === sensor && event.entityB === ball.entity) || (event.entityB === sensor && event.entityA === ball.entity)));
      const spring = POCKET_SPRINGS[i]!;
      const action = advanceSpring(this.states[i]!, time, touching, ball.transform.y, this.velocity.y, spring.clearY);
      if (action === 'launch') {
        // Go straight up while inside the wedge: an inward impulse here would
        // push the ball harder against the inner vertical rail.
        this.physics.setLinearVelocity(ball.body, 0, 10.5);
        this.physics.setAngularVelocity(ball.body, 0);
        fired = true;
      } else if (action === 'steer') {
        // Only steer inward after the ball has cleared the top of that rail.
        this.physics.setLinearVelocity(ball.body, spring.inward * 4.2, Math.max(6, this.velocity.y));
      }
    });
    return fired;
  }
  sync(time: number): void {
    this.visuals.forEach((visual, i) => {
      const compression = springCompression(this.states[i]!, time);
      visual.moving.setAttribute('transform', `translate(0 ${compression * 12}) scale(1 ${1 - compression * 0.28})`);
      visual.node.classList.toggle('firing', this.states[i]!.phase === 'launching');
    });
  }
  reset(): void { this.states.forEach(state => Object.assign(state, newSpring())); this.sync(0); }
  snapshot() { return this.states.map(state => ({ ...state })); }
}
