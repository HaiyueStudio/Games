import { Camera2D, ColorSRGB, Entity, HaiyueEngine, Material2D, Mesh2D, Transform2D, World } from '@haiyue/engine';
import { createCircle2D, createRect2D } from '@haiyue/engine/geometry';
import { Mesh2DRenderSystem } from '@haiyue/engine/systems';
import { Physics2DBody, Physics2DJoint, Physics2DSystem } from '@haiyue/engine/physics';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { BUMPERS, TARGETS, STEP, chargeBall, hit, launchBall, loseBall, newGame } from './rules';
import { PinballInput } from './input';
import { PocketSprings } from './PocketSprings';
import { NotebookScenery, SCENERY_ASSETS } from './scenery';
import { SingleSlotGameSave, isRecord, isNonNegativeInteger } from '../save/SingleSlotGameSave';

const INK = '#484a43', PAPER = '#ede4ce', RED = '#a75943';
function color(hex: string): ColorSRGB {
  return new ColorSRGB(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255, 1);
}
function element(id: string): HTMLElement { return document.getElementById(id)!; }
interface Piece { entity: Entity; transform: Transform2D; body: Physics2DBody }
interface Flipper extends Piece { rest: number; active: number; pivotX: number; pivotY: number }

export class PinballGame {
  private engine!: HaiyueEngine;
  private world = new World('Notebook Pinball');
  private physics = new Physics2DSystem({ gravity: [0, -650], pixelsPerMeter: 100, fixedTimeStep: STEP, maxSubSteps: 1, velocityIterations: 12, positionIterations: 8 });
  private input!: PinballInput;
  private ball!: Piece;
  private flippers: Flipper[] = [];
  private scenery!: NotebookScenery;
  private pocketSprings!: PocketSprings;
  private state = newGame();
  private time = 0;
  private accumulator = 0;
  private paused = false;
  private ready = false;
  private disposed = false;
  private best = 0;
  private readonly saves = new SingleSlotGameSave<{ best: number }>({ gameId: 'pinball', name: 'Notebook Pinball record', validateData: (value): value is { best: number } => isRecord(value) && isNonNegativeInteger(value.best) });
  private launchLane = false;
  private sound = true;
  private audio: AudioContext | null = null;
  private readonly abort = new AbortController();
  private velocity = { x: 0, y: 0 };
  private hitCooldowns = new Map<number, number>();
  private bumperNodes: HTMLImageElement[] = [];
  private targetNodes: HTMLElement[] = [];
  private popups: Array<{ node: HTMLElement; until: number }> = [];
  private highlights: Array<{ transform: Transform2D; until: number }> = [];
  private lastHud = '';

  async init(canvas: HTMLCanvasElement): Promise<void> {
    const images = ['notebook-paper.png', 'star-bumper.png', ...SCENERY_ASSETS].map(file => {
      const image = new Image(); image.src = `./assets/${file}`; return image.decode();
    });
    this.engine = new HaiyueEngine({ canvas, renderProfile: 'simple', alphaMode: 'premultiplied', clearColor: { r: 0, g: 0, b: 0, a: 0 }, msaaSamples: 4 });
    await Promise.all([this.engine.init(), ...images]);
    this.engine.resizeToDisplaySize(true);
    const camera = new Entity('Camera');
    camera.addComponent(new Camera2D({ width: 600, height: 900, designWidth: 600, designHeight: 900, viewportMode: 'fit' }));
    this.world.addEntity(camera);
    this.world.addSystem(this.physics);
    this.world.addSystem(new Mesh2DRenderSystem(this.engine, camera, { priority: 10 }));
    // Current Games package uses this public experimental bridge to submit 2D passes.
    const integration = new RenderIntegration(this.engine, { label: 'Pinball.render' });
    this.world.addRuntimeIntegration(integration);
    integration.registerAll(this.world, () => ({ pass: 'shared' }));
    this.buildTable();
    this.input = new PinballInput();
    this.best = (await this.saves.load())?.best ?? 0;
    const options = { signal: this.abort.signal };
    element('pause').addEventListener('click', () => this.setPaused(!this.paused), options);
    element('restart').addEventListener('click', () => this.restart(), options);
    element('sound').addEventListener('click', () => {
      this.sound = !this.sound; element('sound').setAttribute('aria-pressed', String(this.sound));
      element('sound').textContent = this.sound ? '♪ 声音' : '♪ 静音';
    }, options);
    window.addEventListener('blur', () => this.setPaused(true), options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.setPaused(true); }, options);
    window.addEventListener('pointerdown', () => this.unlockAudio(), options);
    window.addEventListener('keydown', () => this.unlockAudio(), options);
    this.world.update(0, 0);
    this.parkBall();
    this.ready = true;
    this.engine.on('update', ({ detail }) => this.frame(detail.delta / 1000));
    this.engine.run();
    this.updateHud();
  }

  private mesh(name: string, x: number, y: number, width: number, height: number, fill: string, circle = false, parent?: Entity): Entity {
    const entity = new Entity(name);
    entity.addComponent(new Transform2D({ x, y }));
    entity.addComponent(new Mesh2D(circle ? createCircle2D({ radius: width / 2, segments: 40 }) : createRect2D({ width, height }), new Material2D({ color: color(fill) })));
    if (parent) parent.addChild(entity); else this.world.addEntity(entity);
    return entity;
  }

  private rail(x1: number, y1: number, x2: number, y2: number, width = 12): void {
    const length = Math.hypot(x2 - x1, y2 - y1), angle = Math.atan2(y2 - y1, x2 - x1);
    const entity = this.mesh('Pencil rail', (x1 + x2) / 2, (y1 + y2) / 2, length + 5, width + 4, INK);
    entity.getComponent(Transform2D)!.rotation = angle;
    entity.addComponent(new Physics2DBody({ shape: 'box', type: 'static', width: length + 3, height: width, restitution: 0.66, friction: 0.06, categoryBits: 4, maskBits: 1 }));
    this.mesh('Paper rail center', 0, 0, length, Math.max(1, width - 3), PAPER, false, entity);
    this.mesh('Graphite echo', 0, width / 2 + 4, length - 3, 0.8, '#8b897b', false, entity);
    for (let x = -length / 2 + 5; x < length / 2; x += 11) {
      const hatch = this.mesh('Pencil hatch', x, 0, 0.8, width - 2, '#b7ad95', false, entity);
      hatch.getComponent(Transform2D)!.rotation = -0.45;
    }
  }

  private buildTable(): void {
    // Rounded upper rail also carries a launched ball out of the shooter lane.
    const outline = [[-252, -350], [-252, 260], [-237, 313], [-202, 351], [-135, 373], [130, 373], [202, 349], [251, 305], [266, 253], [266, -350]];
    for (let i = 1; i < outline.length; i++) { const a = outline[i - 1]!, b = outline[i]!; this.rail(a[0]!, a[1]!, b[0]!, b[1]!); }
    this.rail(205, -354, 205, 253, 9);
    this.rail(205, -355, 266, -355, 12);
    this.rail(-244, -131, -146, -274, 13);
    this.rail(194, -131, 121, -274, 13);
    // Side slingshots guide rebounds back into the bumper field.
    this.rail(-200, -93, -120, -191, 9);
    this.rail(150, -93, 75, -191, 9);
    this.rail(-200, -93, -194, -193, 9);
    this.rail(150, -93, 148, -193, 9);
    const art = element('art'); art.replaceChildren();
    for (const [i, bumper] of BUMPERS.entries()) {
      const entity = new Entity(`bumper-${i}`);
      entity.addComponent(new Transform2D({ x: bumper.x, y: bumper.y }));
      entity.addComponent(new Physics2DBody({ type: 'static', shape: 'circle', radius: bumper.radius, restitution: 1, friction: 0 }));
      this.world.addEntity(entity);
      const image = new Image(); image.src = './assets/star-bumper.png'; image.alt = '';
      image.style.left = `${(bumper.x + 300) / 6}%`; image.style.top = `${(450 - bumper.y) / 9}%`;
      image.style.width = `${(bumper.radius * 2 + 5) / 6}%`;
      art.append(image); this.bumperNodes.push(image);
    }
    TARGETS.forEach((target, i) => {
      const entity = new Entity(`target-${i}`);
      entity.addComponent(new Transform2D({ x: target.x, y: target.y }));
      entity.addComponent(new Physics2DBody({ type: 'static', shape: 'box', width: 25, height: 38, restitution: 0.95 }));
      this.world.addEntity(entity);
      const node = document.createElement('span'); node.className = 'target'; node.textContent = ['课', '间', '乐'][i]!;
      node.style.left = `${(target.x + 300) / 6}%`; node.style.top = `${(450 - target.y) / 9}%`;
      art.append(node); this.targetNodes.push(node);
    });
    this.scenery = new NotebookScenery(this.world, this.physics, art);
    this.pocketSprings = new PocketSprings(this.world, this.physics, art);
    this.flippers = [this.flipper(-146, -279, false), this.flipper(121, -279, true)];
    const ball = this.mesh('Ball', 235, -324, 22, 22, INK, true);
    this.mesh('Ball graphite', 0, 0, 17, 17, '#77776b', true, ball);
    this.mesh('Ball highlight', -3, 4, 8, 8, '#fdf9e9', true, ball);
    this.mesh('Ball pencil stroke', 3, -4, 9, 1.1, '#3b403b', false, ball).getComponent(Transform2D)!.rotation = 0.45;
    const body = new Physics2DBody({ type: 'dynamic', shape: 'circle', radius: 11, density: 1, restitution: 0.55, friction: 0.05, bullet: true, allowSleep: false, linearDamping: 0.035 });
    ball.addComponent(body); this.ball = { entity: ball, body, transform: ball.getComponent(Transform2D)! };
    // Fixed-size effect pool, reused for every bumper hit.
    for (let i = 0; i < 12; i++) {
      const entity = this.mesh('Pencil spark', 0, 0, 9, 2, RED);
      const transform = entity.getComponent(Transform2D)!; transform.setScale(0);
      this.highlights.push({ transform, until: 0 });
    }
  }

  private flipper(x: number, y: number, right: boolean): Flipper {
    const rest = right ? -Math.PI + 0.35 : -0.35, length = 103;
    const anchor = new Entity('Flipper anchor'); anchor.addComponent(new Transform2D({ x, y }));
    anchor.addComponent(new Physics2DBody({ type: 'static', shape: 'circle', radius: 3, maskBits: 0 })); this.world.addEntity(anchor);
    const entity = this.mesh(right ? 'Right flipper' : 'Left flipper', x + Math.cos(rest) * length / 2, y + Math.sin(rest) * length / 2, length, 19, INK);
    const transform = entity.getComponent(Transform2D)!; transform.rotation = rest;
    this.mesh('Flipper colored pencil', 0, 0, length - 5, 13, RED, false, entity);
    for (let i = -43; i < 45; i += 6) this.mesh('Flipper hatching', i, 0, 1, 11, '#dbab82', false, entity).getComponent(Transform2D)!.rotation = 0.55;
    this.mesh('Flipper tip', length / 2 - 2, 0, 18, 18, INK, true, entity);
    this.mesh('Flipper tip fill', length / 2 - 2, 0, 12, 12, RED, true, entity);
    this.mesh('Flipper pivot', -length / 2 + 3, 0, 23, 23, INK, true, entity);
    this.mesh('Flipper pivot fill', -length / 2 + 3, 0, 15, 15, PAPER, true, entity);
    this.mesh('Flipper screw', -length / 2 + 3, 0, 9, 2, INK, false, entity);
    const body = new Physics2DBody({ type: 'dynamic', shape: 'box', width: length, height: 19, density: 8, friction: 0.2, restitution: 0.4, allowSleep: false, categoryBits: 2, maskBits: 1 });
    entity.addComponent(body);
    const joint = new Entity('Flipper hinge');
    joint.addComponent(new Physics2DJoint({ type: 'revolute', bodyA: anchor, bodyB: entity, anchor: [x, y], enableLimit: true, lowerAngle: right ? -0.86 : 0, upperAngle: right ? 0 : 0.86 }));
    this.world.addEntity(joint);
    return { entity, transform, body, rest, active: rest + (right ? -0.83 : 0.83), pivotX: x, pivotY: y };
  }

  private frame(delta: number): void {
    if (!this.ready || this.disposed) return;
    if (this.input.take('restart')) this.restart();
    if (this.input.take('pause')) this.setPaused(!this.paused);
    const launch = this.input.take('launch'), released = this.input.releasedCharge;
    this.input.releasedCharge = false;
    if (!this.paused) {
      if (launch && this.state.phase === 'over') this.restart();
      if (launch || released) this.launch(launch);
      this.accumulator += Math.min(delta, 0.05);
      while (this.accumulator >= STEP) { this.step(); this.accumulator -= STEP; }
    }
    // Physics is stepped explicitly above; delta=0 submits one render pass per frame.
    this.scenery.sync(this.state);
    this.pocketSprings.sync(this.time);
    this.world.update(this.time * 1000, 0);
    this.updateHud();
  }

  private step(): void {
    this.time += STEP;
    if (this.input.down('charge')) chargeBall(this.state, STEP);
    this.flippers.forEach((flipper, i) => {
      const target = this.input.down(i === 0 ? 'left' : 'right') ? flipper.active : flipper.rest;
      // A persistent revolute joint holds the pivot. Velocity drives the real body,
      // so its surface transfers momentum to the ball through Haiyue / Box2D.
      const difference = Math.atan2(Math.sin(target - flipper.transform.rotation), Math.cos(target - flipper.transform.rotation));
      this.physics.setAngularVelocity(flipper.body, Math.max(-22, Math.min(22, difference * 45)));
    });
    this.scenery.beforeStep(STEP);
    if (this.state.phase !== 'playing') this.parkBall();
    this.physics.update(this.world, this.time * 1000, STEP * 1000);
    if (this.state.phase === 'playing') {
      if (this.pocketSprings.afterStep(this.ball, this.time)) this.tone(330, 0.15);
      if (this.launchLane && this.ball.transform.y > 279) {
        this.launchLane = false;
        this.physics.setLinearVelocity(this.ball.body, -6.5, 4.8);
      }
      for (const event of this.physics.events()) {
        if (event.phase !== 'enter') continue;
        const other = event.entityA === this.ball.entity ? event.entityB : event.entityB === this.ball.entity ? event.entityA : null;
        if (!other || (this.hitCooldowns.get(other.id) ?? 0) > this.time) continue;
        if (other.name.startsWith('scene-')) {
          const reward = this.scenery.contact(other, this.ball, this.state, this.time);
          if (reward) {
            this.hitCooldowns.set(other.id, this.time + 0.18);
            this.feedback(reward.x, reward.y, reward.points);
            this.tone(reward.points >= 1000 ? 1040 : 620, 0.12);
          }
        }
        if (other.name.startsWith('bumper-') || other.name.startsWith('target-')) {
          this.hitCooldowns.set(other.id, this.time + 0.12);
          const target = other.name.startsWith('target-') ? Number(other.name.slice(7)) : -1;
          const points = hit(this.state, this.time, target);
          const position = other.getComponent(Transform2D)!;
          if (target < 0) {
            const dx = this.ball.transform.x - position.x, dy = this.ball.transform.y - position.y;
            const distance = Math.max(1, Math.hypot(dx, dy));
            this.physics.getLinearVelocity(this.ball.body, this.velocity);
            const speed = Math.max(7.8, Math.hypot(this.velocity.x, this.velocity.y));
            this.physics.setLinearVelocity(this.ball.body, dx / distance * speed, dy / distance * speed);
            const node = this.bumperNodes[Number(other.name.slice(7))]!;
            node.getAnimations().forEach(animation => animation.cancel());
            node.animate([{ scale: '1.13' }, { scale: '1' }], { duration: 170 });
          }
          this.feedback(position.x, position.y, points);
          this.tone(target >= 0 ? 720 : 430 + this.state.combo * 85, 0.09);
        }
      }
      this.physics.getLinearVelocity(this.ball.body, this.velocity);
      const speed = Math.hypot(this.velocity.x, this.velocity.y);
      if (speed > 16) this.physics.setLinearVelocity(this.ball.body, this.velocity.x / speed * 16, this.velocity.y / speed * 16);
      // A weak launch falling back in the lane is returned without consuming a ball.
      if (this.ball.transform.x > 216 && this.ball.transform.y < -335 && this.velocity.y < 0) {
        this.state.phase = 'ready'; this.state.charge = 0; this.pocketSprings.reset(); this.parkBall();
      }
      if (this.ball.transform.y < -410 || Math.abs(this.ball.transform.x) > 330) {
        loseBall(this.state); this.pocketSprings.reset(); this.parkBall(); this.tone(145, 0.2);
      }
    }
    this.popups = this.popups.filter(item => { if (item.until > this.time) return true; item.node.remove(); return false; });
    for (const effect of this.highlights) if (effect.until <= this.time) effect.transform.setScale(0);
  }

  private parkBall(): void {
    this.physics.teleportBody(this.ball.body, 235, -321 - this.state.charge * 12, 0);
    this.physics.setLinearVelocity(this.ball.body, 0, 0);
    this.physics.setAngularVelocity(this.ball.body, 0);
  }
  private launch(quick: boolean): void {
    const velocity = launchBall(this.state, quick);
    if (!velocity) return;
    this.launchLane = true;
    this.physics.setLinearVelocity(this.ball.body, 0, velocity);
    this.tone(260, 0.12);
  }
  restart(): void {
    this.scenery.reset();
    this.pocketSprings.reset();
    this.state = newGame(); this.paused = false; this.accumulator = 0; this.time = 0;
    this.input.clear(); this.hitCooldowns.clear(); this.launchLane = false;
    for (const item of this.popups) item.node.remove(); this.popups = [];
    for (const effect of this.highlights) { effect.until = 0; effect.transform.setScale(0); }
    for (const flipper of this.flippers) {
      this.physics.teleportBody(flipper.body, flipper.pivotX + Math.cos(flipper.rest) * 51.5, flipper.pivotY + Math.sin(flipper.rest) * 51.5, flipper.rest);
      this.physics.setLinearVelocity(flipper.body, 0, 0); this.physics.setAngularVelocity(flipper.body, 0);
    }
    this.parkBall();
    this.scenery.sync(this.state);
    this.updateHud();
  }
  private setPaused(value: boolean): void {
    this.paused = value; this.input.clear(); this.state.charge = 0; this.accumulator = 0;
    this.updateHud();
  }
  private feedback(x: number, y: number, points: number): void {
    if (this.popups.length >= 12) this.popups.shift()!.node.remove();
    const node = document.createElement('span'); node.className = 'pop'; node.textContent = `+${points}`;
    node.style.left = `${(x + 300) / 6}%`; node.style.top = `${(450 - y - 38) / 9}%`;
    element('floaters').append(node); this.popups.push({ node, until: this.time + 0.7 });
    for (let i = 0; i < this.highlights.length; i++) {
      const effect = this.highlights[i]!, angle = i / 12 * Math.PI * 2;
      effect.transform.setPosition(x + Math.cos(angle) * 53, y + Math.sin(angle) * 53);
      effect.transform.rotation = angle; effect.transform.setScale(1); effect.until = this.time + 0.12;
    }
  }
  private unlockAudio(): void {
    if (!this.sound) return;
    this.audio ??= new AudioContext();
    void this.audio.resume().catch(() => {});
  }
  private tone(frequency: number, duration: number): void {
    if (!this.sound || !this.audio || this.audio.state !== 'running') return;
    const oscillator = this.audio.createOscillator(), gain = this.audio.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, this.audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.65, this.audio.currentTime + duration);
    gain.gain.setValueAtTime(0.08, this.audio.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + duration);
    oscillator.connect(gain); gain.connect(this.audio.destination); oscillator.start(); oscillator.stop(this.audio.currentTime + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  private updateHud(): void {
    if (this.state.score > this.best) {
      this.best = this.state.score;
      this.saves.save({ best: this.best });
    }
    const combo = this.time - this.state.lastHit <= 2.2 ? this.state.combo : 0;
    element('power').style.height = `${this.state.charge * 100}%`;
    const key = `${this.state.phase}/${this.state.score}/${this.state.balls}/${combo}/${this.paused}/${this.state.targets}`;
    if (key === this.lastHud) return; this.lastHud = key;
    element('score').textContent = String(this.state.score).padStart(6, '0');
    element('best').textContent = String(this.best).padStart(6, '0');
    element('balls').textContent = '● '.repeat(this.state.balls) + '○ '.repeat(3 - this.state.balls) + ` 第 ${Math.min(3, 4 - this.state.balls)} 球`;
    element('combo').textContent = combo > 1 ? `×${combo} 连击!` : 'LET’S PLAY!';
    element('pause').textContent = this.paused ? '▷ 继续' : 'Ⅱ 暂停';
    element('pause').setAttribute('aria-label', this.paused ? '继续游戏' : '暂停游戏');
    this.targetNodes.forEach((node, i) => node.classList.toggle('lit', Boolean(this.state.targets & (1 << i))));
    const banner = element('banner'); banner.dataset.phase = this.paused ? 'paused' : this.state.phase; banner.hidden = !this.paused && this.state.phase === 'playing';
    element('banner-title').textContent = this.paused ? '课间休息一下' : this.state.phase === 'over' ? '这页，写得不错。' : '准备好，弹走烦恼。';
    element('banner-detail').textContent = this.paused ? '按 P / Esc 或点击继续' : this.state.phase === 'over' ? `本局 ${this.state.score} 分 · 按 W / ↑ 再来一局` : '按 W / ↑ 发球 · 或按住 S / ↓ 蓄力后松开';
  }
  snapshot() {
    return { ...this.state, paused: this.paused, time: this.time, ready: this.ready, ball: { x: this.ball.transform.x, y: this.ball.transform.y }, flippers: this.flippers.map(f => f.rest + Math.atan2(Math.sin(f.transform.rotation - f.rest), Math.cos(f.transform.rotation - f.rest))), scenery: this.scenery.snapshot(), springs: this.pocketSprings.snapshot(), resources: this.physics.resourceSnapshot(), entities: this.world.entities.size };
  }
  /** Deterministic browser fixture advances the same physics and rules as play. */
  verifyStep(count: number): void { for (let i = 0; i < count; i++) this.frame(STEP); }
  verifyBall(x: number, y: number, vx: number, vy: number): void {
    this.state.phase = 'playing'; this.launchLane = false;
    this.physics.teleportBody(this.ball.body, x, y, 0); this.physics.setLinearVelocity(this.ball.body, vx, vy);
  }
  stopLoop(): void { this.engine.stop(); }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.ready = false;
    this.abort.abort(); this.input?.dispose(); this.scenery?.dispose();
    this.bumperNodes.forEach(node => node.getAnimations().forEach(animation => animation.cancel()));
    this.popups.forEach(item => item.node.remove());
    this.engine?.stop(); this.world.destroy(); this.engine?.destroy();
    if (this.audio) void this.audio.close();
  }
}
