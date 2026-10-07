import { Camera2D, ColorSRGB, Entity, HaiyueEngine, Material2D, Mesh2D, Transform2D, World } from '@haiyue/engine';
import { createCircle2D, createRect2D } from '@haiyue/engine/geometry';
import { Mesh2DRenderSystem } from '@haiyue/engine/systems';
import { Physics2DBody, Physics2DJoint, Physics2DSystem } from '@haiyue/engine/physics';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { BUMPERS, STEP, chargeBall, hit, launchBall, loseBall, newGame } from '../pinball/rules';
import { InkInput } from './InkInput';
import { InkGui } from './InkGui';
import { ToadSprings } from './ToadSprings';
import { LivingScene } from './LivingScene';
import { InkGarden } from './InkGarden';
import { RIVER_LOTUSES, lotusRebound } from './gardenRules';
import { InkEffects } from './InkEffects';
import { entersRiver, WATER_LEVEL } from './waterModel';
import { SingleSlotGameSave, isRecord, isNonNegativeInteger } from '../save/SingleSlotGameSave';

const INK = '#232823', PAPER = '#cdcfc1', RED = '#843e32';
function color(hex: string): ColorSRGB {
  return new ColorSRGB(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255, 1);
}
function element(id: string): HTMLElement { return document.getElementById(id)!; }
interface Piece { entity: Entity; transform: Transform2D; body: Physics2DBody }
interface Flipper extends Piece { rest: number; active: number; pivotX: number; pivotY: number }

export class InkPinballGame {
  private engine!: HaiyueEngine;
  private world = new World('Ink Pinball');
  private physics = new Physics2DSystem({ gravity: [0, -650], pixelsPerMeter: 100, fixedTimeStep: STEP, maxSubSteps: 1, velocityIterations: 12, positionIterations: 8 });
  private input!: InkInput;
  private gui!: InkGui;
  private helpWasPaused = false;
  private returningFromHelp = false;
  private ambient = true;
  private ball!: Piece;
  private flippers: Flipper[] = [];
  private ink!: InkEffects;
  private pocketSprings!: ToadSprings;
  private scene!: LivingScene;
  private state = newGame();
  private time = 0;
  private accumulator = 0;
  private paused = false;
  private ready = false;
  private disposed = false;
  private best = 0;
  private readonly verificationMode = new URLSearchParams(location.search).has('verify');
  private readonly saves = new SingleSlotGameSave<{ best: number }>({ gameId: 'ink-pinball', name: 'Ink Pinball record', validateData: (value): value is { best: number } => isRecord(value) && isNonNegativeInteger(value.best) });
  private launchLane = false;
  private ballWet = false;
  private sound = true;
  private audio: AudioContext | null = null;
  private readonly abort = new AbortController();
  private velocity = { x: 0, y: 0 };
  private hitCooldowns = new Map<number, number>();
  private bumperNodes: HTMLImageElement[] = [];
  private garden!: InkGarden;
  private fixtureFreeze=false;
  private profiling=false;
  private readonly frameCosts:number[]=[];
  private readonly frameGaps:number[]=[];
  private profileLast=0;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    const images = ['landscape-plate.png', 'brush.png', 'spirit-orb.png', 'dragon.png', 'toad.png', 'koi.png', 'lily-pad.png', 'river-lotuses.png', 'crane-poses.png'].map(file => {
      const image = new Image(); image.src = `./assets/${file}`; return image.decode();
    });
    this.engine = new HaiyueEngine({ canvas, renderProfile: 'simple', alphaMode: 'premultiplied', clearColor: { r: 0, g: 0, b: 0, a: 0 }, msaaSamples: 4, devicePixelRatio: () => Math.min(devicePixelRatio, 1.5) });
    await Promise.all([this.engine.init(), ...images]);
    this.engine.resizeToDisplaySize(true);
    const camera = new Entity('Camera');
    camera.addComponent(new Camera2D({ width: 600, height: 1200, designWidth: 600, designHeight: 1200, viewportMode: 'fit' }));
    this.world.addEntity(camera);
    this.world.addSystem(this.physics);
    this.world.addSystem(new Mesh2DRenderSystem(this.engine, camera, { priority: 10 }));
    this.ink = new InkEffects(this.engine);
    await this.ink.init();
    this.world.addSystem(this.ink);
    this.input = new InkInput(() => !this.paused && !this.gui?.helping);
    this.gui = new InkGui(this.engine, this.world, {
      pause: () => this.setPaused(!this.paused), resume: () => this.setPaused(false), restart: () => this.restart(), help: () => this.toggleHelp(),
      sound: () => { this.sound = !this.sound; this.updateHud(); },
      ambient: () => { this.ambient = !this.ambient; this.ink.ambient = this.ambient; this.updateHud(); },
      press: (control,id) => this.input.press(control,id), release: (id,cancel) => this.input.release(id,!cancel),
    });
    await this.gui.init();
    // Current Games package uses this public experimental bridge to submit 2D passes.
    const integration = new RenderIntegration(this.engine, { label: 'InkPinball.render' });
    this.world.addRuntimeIntegration(integration);
    integration.registerAll(this.world, system => system === this.gui.system ? { pass: 'isolated', loadOp: 'load', depth: true, sort: 30 } : system === this.ink ? { pass: 'isolated', loadOp: 'load', depth: false, sort: 20 } : { pass: 'shared', sort: 10 });
    this.buildTable();
    // Newly attached image elements decode asynchronously even after URL preloading.
    await Promise.all([...document.querySelectorAll<HTMLImageElement>('#art img, #creatures img')].map(image => image.decode()));
    this.best = this.verificationMode ? 0 : (await this.saves.load())?.best ?? 0;
    const options = { signal: this.abort.signal };
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

  private rail(x1: number, y1: number, x2: number, y2: number, width = 12): { body: Physics2DBody; inkRail: number } {
    const length = Math.hypot(x2 - x1, y2 - y1), angle = Math.atan2(y2 - y1, x2 - x1);
    const entity = new Entity('Ink rail');
    entity.addComponent(new Transform2D({ x: (x1 + x2) / 2, y: (y1 + y2) / 2, rotation: angle }));
    entity.addComponent(new Physics2DBody({ shape: 'box', type: 'static', width: length + 3, height: width, restitution: 0.66, friction: 0.06, categoryBits: 4, maskBits: 1 }));
    this.world.addEntity(entity);
    const inkRail = this.ink.addRail((x1 + x2) / 2, (y1 + y2) / 2, length, width, -angle);
    return { body: entity.getComponent(Physics2DBody)!, inkRail };
  }

  private buildTable(): void {
    // Rounded upper rail also carries a launched ball out of the shooter lane.
    const outline = [[-252, -350], [-252, 260], [-237, 313], [-202, 351], [-135, 373], [130, 373], [202, 349], [251, 305], [266, 253], [266, -350]];
    for (let i = 1; i < outline.length; i++) { const a = outline[i - 1]!, b = outline[i]!; this.rail(a[0]!, a[1]!, b[0]!, b[1]!); }
    this.rail(205, -354, 205, 253, 9);
    this.rail(205, -355, 266, -355, 12);
    const gates = [this.rail(-244, -131, -190, -210, 13), this.rail(194, -131, 154, -210, 13)];
    this.rail(-190, -210, -146, -274, 13);
    this.rail(154, -210, 121, -274, 13);
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
      const image = new Image(); image.src = './assets/spirit-orb.png'; image.alt = '';
      image.style.left = `${(bumper.x + 300) / 6}%`; image.style.top = `${(450 - bumper.y) / 9}%`;
      image.style.width = `${(bumper.radius * 2 + 5) / 6}%`;
      art.append(image); this.bumperNodes.push(image);
    }
    this.garden = new InkGarden(this.world, art);
    const creatures = element('creatures'); creatures.replaceChildren();
    this.pocketSprings = new ToadSprings(this.world, this.physics, creatures, (x,y) => this.ink.impact(x,y,.7),
      (i, open) => { gates[i]!.body.setCollisionFilter(4, open ? 0 : 1); this.ink.setRailVisible(gates[i]!.inkRail, !open); },
      (x,y,time) => this.ink.splash(x,y,.7,'leap',time));
    this.scene = new LivingScene(this.world, this.physics, creatures, (x,y,strength) => this.ink.impact(x,y,strength), (x,y) => this.ink.ripple(x,y), (x,y,strength,source,time) => this.ink.splash(x,y,strength,source,time));
    this.flippers = [this.flipper(-146, -279, false), this.flipper(121, -279, true)];
    const ball = new Entity('Ink ball');
    ball.addComponent(new Transform2D({ x: 235, y: -324 })); this.world.addEntity(ball);
    const body = new Physics2DBody({ type: 'dynamic', shape: 'circle', radius: 11, density: 1, restitution: 0.55, friction: 0.05, bullet: true, allowSleep: false, linearDamping: 0.035 });
    ball.addComponent(body); this.ball = { entity: ball, body, transform: ball.getComponent(Transform2D)! };

  }

  private flipper(x: number, y: number, right: boolean): Flipper {
    const rest = right ? -Math.PI + 0.35 : -0.35, length = 103;
    const anchor = new Entity('Flipper anchor'); anchor.addComponent(new Transform2D({ x, y }));
    anchor.addComponent(new Physics2DBody({ type: 'static', shape: 'circle', radius: 3, maskBits: 0 })); this.world.addEntity(anchor);
    const entity = this.mesh(right ? 'Right flipper' : 'Left flipper', x + Math.cos(rest) * length / 2, y + Math.sin(rest) * length / 2, length, 19, INK);
    const transform = entity.getComponent(Transform2D)!; transform.rotation = rest;
    this.mesh('Flipper ink wash', 0, 0, length - 5, 10, '#646b5c', false, entity);
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
    const frameStart=this.profiling?performance.now():0;
    if(this.profiling && this.profileLast)this.frameGaps.push(frameStart-this.profileLast);
    if(this.profiling)this.profileLast=frameStart;
    if(this.fixtureFreeze)delta=0;
    if (this.input.take('restart')) this.restart();
    if (this.input.take('pause')) { if(this.gui.helping) this.toggleHelp(); else this.setPaused(!this.paused); }
    this.gui.animate(delta);
    if(this.returningFromHelp && !this.gui.helping) { this.returningFromHelp=false; this.setPaused(this.helpWasPaused); }
    const launch = this.input.take('launch'), released = this.input.releasedCharge;
    this.input.releasedCharge = false;
    if (!this.paused && !this.gui.helping) {
      if (launch && this.state.phase === 'over') this.restart();
      if (launch || released) this.launch(launch);
      this.accumulator += Math.min(delta, 0.05);
      while (this.accumulator >= STEP) { this.step(); this.accumulator -= STEP; }
    }
    // Physics is stepped explicitly above; delta=0 submits one render pass per frame.
    this.ink.sync(this.time, this.ball.transform.x, this.ball.transform.y, !this.scene.holding);
    this.pocketSprings.sync(this.time);
    this.scene.sync(this.time);
    if(this.ambient) this.bumperNodes.forEach((node, i) => { node.style.transform = `translate(-50%,-50%) rotate(${this.time * (i % 2 ? -14 : 12) + i * 30}deg)`; });
    this.garden.sync(this.time, this.state.targets);
    this.updateHud();
    this.world.update(this.time * 1000, 0);
    this.input.flushReleases();
    if(this.profiling)this.frameCosts.push(performance.now()-frameStart);
  }

  private step(): void {
    this.time += STEP;
    this.garden.advance(this.time);
    if (this.input.down('charge')) chargeBall(this.state, STEP);
    this.flippers.forEach((flipper, i) => {
      const target = this.input.down(i === 0 ? 'left' : 'right') ? flipper.active : flipper.rest;
      // A persistent revolute joint holds the pivot. Velocity drives the real body,
      // so its surface transfers momentum to the ball through Haiyue / Box2D.
      const difference = Math.atan2(Math.sin(target - flipper.transform.rotation), Math.cos(target - flipper.transform.rotation));
      this.physics.setAngularVelocity(flipper.body, Math.max(-22, Math.min(22, difference * 45)));
    });
    if (this.state.phase !== 'playing') this.parkBall();
    this.pocketSprings.beforeStep(this.time, this.ball, this.state.phase === 'playing');
    this.scene.beforeStep(this.ball);
    this.physics.update(this.world, this.time * 1000, STEP * 1000);
    if (this.state.phase === 'playing') {
      const dragon = this.scene.afterStep(this.ball, this.time, true);
      if (dragon === 'capture') { this.launchLane = false; this.tone(180,.14); }
      if (dragon === 'spit') { this.state.score += 500; this.feedback(this.ball.transform.x,this.ball.transform.y,500); this.tone(650,.15); }
      if (this.pocketSprings.afterStep(this.ball, this.time)) this.tone(330, 0.15);
      if (this.launchLane && this.ball.transform.y > 279) {
        this.launchLane = false;
        this.physics.setLinearVelocity(this.ball.body, -6.5, 4.8);
      }
      for (const event of this.physics.events()) {
        if (event.phase !== 'enter') continue;
        const other = event.entityA === this.ball.entity ? event.entityB : event.entityB === this.ball.entity ? event.entityA : null;
        if (!other || (this.hitCooldowns.get(other.id) ?? 0) > this.time || this.scene.holding) continue;
        if (event.kind === 'collision') {
          this.physics.getLinearVelocity(this.ball.body,this.velocity);
          if(Math.hypot(this.velocity.x,this.velocity.y)>1.2){this.ink.impact(this.ball.transform.x,this.ball.transform.y,other.name.startsWith('bumper-')?1:.5);this.hitCooldowns.set(other.id,this.time+.12);}
        }
        if (other.name.startsWith('lotus-')) {
          const index = Number(other.name.slice(6));
          const points = this.garden.collect(index, this.time);
          if (points) {
            const p = RIVER_LOTUSES[index]!; this.state.score += points;
            this.physics.getLinearVelocity(this.ball.body,this.velocity);
            const rebound=lotusRebound(this.ball.transform.x-p.x,this.ball.transform.y-p.y,this.velocity.x,this.velocity.y);
            this.physics.setLinearVelocity(this.ball.body,rebound.x,rebound.y);
            this.feedback(p.x, p.y, points); this.ink.ripple(p.x, p.y); this.ink.impact(p.x, p.y, .5); this.tone(points > 250 ? 960 : 680, .12);
          }
        }
        if (other.name.startsWith('bumper-') || other.name.startsWith('target-')) {
          this.hitCooldowns.set(other.id, this.time + 0.12);
          const target = other.name.startsWith('target-') ? Number(other.name.slice(7)) : -1;
          if (target >= 0 && !this.garden.canHitCrane(this.time)) continue;
          const points = hit(this.state, this.time, target);
          if (target >= 0) this.garden.hitCrane(target, this.time, this.state.targets === 0);
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
      if(!this.ballWet && entersRiver(this.ball.transform.x,this.ball.transform.y,this.velocity.y)){
        this.ballWet=true;
        this.ink.splash(this.ball.transform.x,WATER_LEVEL,.7+speed*.035,'ball',this.time);
      }
      if (speed > 16) this.physics.setLinearVelocity(this.ball.body, this.velocity.x / speed * 16, this.velocity.y / speed * 16);
      // A weak launch falling back in the lane is returned without consuming a ball.
      if (this.ball.transform.x > 216 && this.ball.transform.y < -335 && this.velocity.y < 0) {
        this.state.phase = 'ready'; this.state.charge = 0; this.pocketSprings.ballLost(); this.parkBall();
      }
      if (this.ball.transform.y < -410 || Math.abs(this.ball.transform.x) > 330) {
        this.scene.drain(this.time);
        loseBall(this.state); this.pocketSprings.ballLost(); this.parkBall(); this.tone(145, 0.2);
      }
    }
    this.ink.sample(this.time, this.ball.transform.x, this.ball.transform.y, this.state.phase === 'playing' && !this.scene.holding);
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
    this.ballWet = false;
    this.scene.launch(this.time);
    this.physics.setLinearVelocity(this.ball.body, 0, velocity);
    this.tone(260, 0.12);
  }
  restart(): void {
    this.ink.reset();
    this.pocketSprings.reset();
    this.scene.reset();
    this.garden.reset();
    this.state = newGame(); this.paused = false; this.accumulator = 0; this.time = 0;
    this.input.clear(); this.hitCooldowns.clear(); this.launchLane = false; this.ballWet = false;
    this.gui.reset(); this.returningFromHelp=false;
    for (const flipper of this.flippers) {
      this.physics.teleportBody(flipper.body, flipper.pivotX + Math.cos(flipper.rest) * 51.5, flipper.pivotY + Math.sin(flipper.rest) * 51.5, flipper.rest);
      this.physics.setLinearVelocity(flipper.body, 0, 0); this.physics.setAngularVelocity(flipper.body, 0);
    }
    this.parkBall();
    this.ink.sync(this.time, this.ball.transform.x, this.ball.transform.y, !this.scene.holding);
    this.updateHud();
  }
  private setPaused(value: boolean): void {
    this.paused = value; this.input.clear(); this.state.charge = 0; this.accumulator = 0;
    this.updateHud();
  }
  private toggleHelp(): void {
    if(this.gui.busy) return;
    if(this.gui.scroll.page==='game') { this.helpWasPaused=this.paused; this.setPaused(true); }
    else this.returningFromHelp=true;
    this.input.clear(); this.gui.turnHelp(); this.updateHud();
  }
  private feedback(x: number, y: number, points: number): void { this.gui.feedback(x,y,points); }
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
      if(!this.verificationMode) this.saves.save({ best: this.best });
    }
    const combo = this.time - this.state.lastHit <= 2.2 ? this.state.combo : 0;
    this.gui.sync({ ...this.state, best:this.best, combo, paused:this.paused, sound:this.sound, ambient:this.ambient });
  }

  snapshot() {
    return { ...this.state, paused: this.paused, time: this.time, ready: this.ready, ball: { x: this.ball.transform.x, y: this.ball.transform.y }, flippers: this.flippers.map(f => f.rest + Math.atan2(Math.sin(f.transform.rotation - f.rest), Math.cos(f.transform.rotation - f.rest))), gui: this.gui.snapshot(), ink: this.ink.snapshot(), scene: this.scene.snapshot(), garden: this.garden.snapshot(), springs: this.pocketSprings.snapshot(), resources: this.physics.resourceSnapshot(), entities: this.world.entities.size };
  }
  /** Deterministic browser fixture advances the same physics and rules as play. */
  verifyStep(count: number): void { for (let i = 0; i < count; i++) this.frame(STEP); }
  /** Long cooldown fixtures use the same fixed physics steps, submitting one final render. */
  verifyPhysicsSteps(count: number): void { for (let i = 0; i < count; i++) if (!this.paused) this.step(); this.frame(0); }
  /** A stopped-loop fixture must reacquire its swapchain view after an await. */
  verifyResumeManual(): void { this.engine.resizeToDisplaySize(true); }
  verifyBall(x: number, y: number, vx: number, vy: number): void {
    this.state.phase = 'playing'; this.launchLane = false;
    this.physics.teleportBody(this.ball.body, x, y, 0); this.physics.setLinearVelocity(this.ball.body, vx, vy);
  }
  async verifyPresent():Promise<void>{
    this.fixtureFreeze=true;this.engine.run();
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    this.engine.stop();this.fixtureFreeze=false;await this.engine.device.queue.onSubmittedWorkDone();
  }
  async verifyPerformance(){
    this.restart();this.launch(true);this.frameCosts.length=0;this.frameGaps.length=0;this.profileLast=0;this.profiling=true;this.engine.run();
    for(let i=0;i<120;i++)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    this.engine.stop();this.profiling=false;const queueDrainMs=await this.verifyQueueDrain();
    const quantile=(values:number[],fraction:number)=>{const a=[...values].sort((a,b)=>a-b);return Number((a[Math.floor((a.length-1)*fraction)]??0).toFixed(3));};
    return {frames:this.frameCosts.length,cpuFrameMs:{median:quantile(this.frameCosts,.5),p95:quantile(this.frameCosts,.95)},animationFrameIntervalMs:{median:quantile(this.frameGaps,.5),p95:quantile(this.frameGaps,.95)},queueDrainMs:Number(queueDrainMs.toFixed(3)),gpuTimestampMs:null,gpuTimestampUnavailable:'timestamp-query not requested; queue drain is reported separately, not as GPU duration',fluid:this.ink.snapshot().fluid};
  }
  verifyGuiInk() { return this.gui.effects.inspect(); }
  verifyFluid() { return this.ink.verifyFluid(); }
  verifyWaterfall() { return this.ink.verifyDiffusion(5); }
  verifyOrbAura() { return this.ink.verifyDiffusion(9); }
  async verifyWater(){return{surface:await this.ink.verifyDiffusion(7),splash:await this.ink.verifyDiffusion(8)};}
  async verifyQueueDrain(): Promise<number> { const start=performance.now(); await this.engine.device.queue.onSubmittedWorkDone(); return performance.now()-start; }
  verifyDiffusion(): Promise<{ changed: number; transparent: number; opaque: number }> { return this.gui.effects.verifySkins(); }
  stopLoop(): void { this.engine.stop(); }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.ready = false;
    this.abort.abort(); this.input?.dispose();
    this.bumperNodes.forEach(node => node.getAnimations().forEach(animation => animation.cancel()));
    this.gui?.dispose();
    this.engine?.stop(); this.world.destroy(); this.engine?.destroy();
    if (this.audio) void this.audio.close();
  }
}
