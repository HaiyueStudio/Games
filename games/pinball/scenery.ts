import { Entity, Transform2D, World } from '@haiyue/engine';
import { Physics2DBody, Physics2DSystem } from '@haiyue/engine/physics';
import { scoreScene, type PinballState } from './rules';

export const MUSHROOMS = [{ x: -153, y: -27 }, { x: 113, y: -27 }] as const;
export const LANES = [{ x: -209, y: 113 }, { x: 161, y: 115 }] as const;
export const SPINNER = { x: -20, y: -141 };
export const SCENERY_ASSETS = ['mushroom-bumper.png', 'pinwheel.png'];

/** Physical playground props and their registered, fixed-position paper sprites. */
export class NotebookScenery {
  private readonly mushrooms: HTMLImageElement[] = [];
  private readonly lanes: HTMLElement[] = [];
  private readonly spinner: HTMLImageElement;
  private readonly blades: Array<{ body: Physics2DBody; transform: Transform2D }> = [];
  private readonly meter: HTMLElement;
  private spinSpeed = 0.8;
  private nextSpinnerHit = 0;
  private readonly velocity = { x: 0, y: 0 };

  constructor(private world: World, private physics: Physics2DSystem, private art: HTMLElement) {
    MUSHROOMS.forEach((point, i) => {
      this.body(`scene-mushroom-${i}`, point.x, point.y, new Physics2DBody({ type: 'static', shape: 'circle', radius: 25, restitution: 1, friction: 0 }));
      this.mushrooms.push(this.image('mushroom-bumper.png', point.x, point.y - 3, 66));
      this.label('弹力蘑菇 +200', point.x, point.y - 49, 'prop-label');
    });
    LANES.forEach((point, i) => {
      this.body(`scene-lane-${i}`, point.x, point.y, new Physics2DBody({ type: 'static', shape: 'box', width: 33, height: 76, isSensor: true }));
      const node = this.label('☆', point.x, point.y, 'bonus-lane');
      node.style.width = '6.3%'; node.style.height = '10%';
      this.lanes.push(node);
      this.label(i ? '右书签' : '左书签', point.x, point.y + 63, 'lane-caption');
    });
    this.spinner = this.image('pinwheel.png', SPINNER.x, SPINNER.y, 78);
    this.spinner.classList.add('pinwheel');
    // Two moving cross blades share one visual rotor; cooldown groups their contacts.
    for (let i = 0; i < 2; i++) {
      const body = new Physics2DBody({ type: 'kinematic', shape: 'box', width: 62, height: 8, restitution: 0.85, friction: 0.05, categoryBits: 4, maskBits: 1 });
      const entity = this.body('scene-spinner', SPINNER.x, SPINNER.y, body);
      const transform = entity.getComponent(Transform2D)!; transform.rotation = i * Math.PI / 2;
      this.blades.push({ body, transform });
    }
    this.meter = this.label('风车 0 / 5', SPINNER.x, SPINNER.y - 53, 'spinner-meter');
  }
  private body(name: string, x: number, y: number, body: Physics2DBody): Entity {
    const entity = new Entity(name); entity.addComponent(new Transform2D({ x, y })); entity.addComponent(body); this.world.addEntity(entity); return entity;
  }
  private place(node: HTMLElement, x: number, y: number): void {
    node.style.left = `${(x + 300) / 6}%`; node.style.top = `${(450 - y) / 9}%`;
    this.art.append(node);
  }
  private image(file: string, x: number, y: number, size: number): HTMLImageElement {
    const node = new Image(); node.src = `./assets/${file}`; node.alt = ''; node.style.width = `${size / 6}%`;
    this.place(node, x, y); return node;
  }
  private label(text: string, x: number, y: number, className: string): HTMLElement {
    const node = document.createElement('span'); node.className = className; node.textContent = text; this.place(node, x, y); return node;
  }
  beforeStep(delta: number): void {
    this.spinSpeed = Math.max(0.8, this.spinSpeed - delta * 2.2);
    for (const blade of this.blades) this.physics.setAngularVelocity(blade.body, this.spinSpeed);
  }
  sync(state: PinballState): void {
    this.spinner.style.transform = `translate(-50%,-50%) rotate(${-this.blades[0]!.transform.rotation}rad)`;
    this.lanes.forEach((node, i) => { const lit = Boolean(state.lanes & (1 << i)); node.classList.toggle('lit', lit); node.textContent = lit ? '★' : '☆'; });
    this.meter.textContent = `风车 ${state.spins} / 5`;
  }
  contact(entity: Entity, ball: { body: Physics2DBody; transform: Transform2D }, state: PinballState, time: number): { points: number; x: number; y: number } | null {
    if (!entity.name.startsWith('scene-')) return null;
    const position = entity.getComponent(Transform2D)!;
    let points: number;
    if (entity.name.startsWith('scene-mushroom-')) {
      points = scoreScene(state, 'mushroom');
      this.physics.getLinearVelocity(ball.body, this.velocity);
      const side = ball.transform.x < position.x ? -1 : 1;
      this.physics.setLinearVelocity(ball.body, side * 3.2, Math.max(7.5, Math.abs(this.velocity.y) * 0.85));
      const node = this.mushrooms[Number(entity.name.split('-').at(-1))]!;
      node.getAnimations().forEach(animation => animation.cancel());
      node.animate([{ scale: '1.18 .82' }, { scale: '.93 1.08' }, { scale: '1' }], { duration: 220 });
    } else if (entity.name === 'scene-spinner') {
      if (time < this.nextSpinnerHit) return null;
      this.nextSpinnerHit = time + 0.3; this.spinSpeed = 7;
      points = scoreScene(state, 'spinner');
    } else {
      points = scoreScene(state, 'lane', Number(entity.name.split('-').at(-1)));
    }
    return points ? { points, x: position.x, y: position.y } : null;
  }
  reset(): void {
    this.spinSpeed = 0.8; this.nextSpinnerHit = 0;
    this.blades.forEach((blade, i) => { this.physics.teleportBody(blade.body, SPINNER.x, SPINNER.y, i * Math.PI / 2); this.physics.setAngularVelocity(blade.body, 0); });
    this.mushrooms.forEach(node => node.getAnimations().forEach(animation => animation.cancel()));
  }
  snapshot(): { angle: number; speed: number } { return { angle: this.blades[0]!.transform.rotation, speed: this.spinSpeed }; }
  dispose(): void { this.mushrooms.forEach(node => node.getAnimations().forEach(animation => animation.cancel())); }
}
