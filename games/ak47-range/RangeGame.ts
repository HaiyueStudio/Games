import { Camera3D, CartesianTransform3D, DirectionalLight, Entity, EnvironmentLight, HaiyueEngine,
  Geometry3D, Mesh3D, PbrMaterial, SphericalTransform3D, World, createBox3D, createSphere3D } from '@haiyue/engine';
import { GuiRoot, GuiElement, GuiLabel, GuiButton, GuiSystem, type GuiFontOptions, type GuiRect } from '@haiyue/engine/gui';
import { Render3DSystem } from '@haiyue/engine/systems';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { VirtualJoystickControls } from '@haiyue/extensions/controls';
import { applyGltfAnimationClip, disposeGltfModel, loadGltfModel, type LoadedGltfModel, type GltfAnimationClip } from '@haiyue/extensions/gltf';
import { MAGAZINE, RELOAD_SECONDS, SIGHT_RANGE, PLAYER_FOV, ENEMY_FOV, CORPSE_SECONDS, ENEMY_FIRE_RANGE, RangeRules, resolvePlayerHeading } from './rules';
import { RadarHud } from './RadarHud';
import { mountSoldier, soldierClip, soldierMuzzle, deathPose } from './SoldierModel';
import type { GameSaveBackend } from '@haiyue/engine/save';
import { SingleSlotGameSave, isRecord, isNonNegativeInteger } from '../save/SingleSlotGameSave';

export const FONT_CHARS = [...new Set(Array.from({ length: 95 }, (_, i) => String.fromCharCode(i + 32)).join('') +
  '前线训练场移动按住连续射击重新装填弹药中命中松手停止第三人称跟随空仓请装填弹匣无限备弹被生命击败生存秒视野掩体横屏继续战斗结束重新开始每刷新敌人雷达°·')].join('');
export type ModelLoader = (name: 'ren42' | 'qiang_ak47') => Promise<LoadedGltfModel>;
function place(node: GuiElement, rect: (r: GuiRect) => GuiRect): void { node.layout = r => { node.rect = rect(r); }; }
export interface SafeInsets { top: number; right: number; bottom: number; left: number }
const ZERO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
export function actionRects(width: number, height: number, insets = ZERO_INSETS) {
  return { fire: { x: width - insets.right - 116, y: height - insets.bottom - 120, width: 96, height: 96 },
    reload: { x: width - insets.right - 108, y: height - insets.bottom - 182, width: 88, height: 48 } };
}
export class RangeGame {
  readonly world = new World('AK47 Range');
  readonly rules = new RangeRules();
  readonly root = new GuiRoot({ theme: { fontSize: 14, radius: 12,
    colors: { text: '#e9f1f3', textMuted: '#99b0b8', background: '#101b23', surface: '#1d3038',
      primary: '#d6ad5e', danger: '#e78851', border: '#69878c', hover: '#466167', active: '#647f7c', disabled: '#26373b' } } });
  readonly playerTransform = new CartesianTransform3D({ position: [0, 0, 3] });
  readonly player = new Entity('ren42 player').addComponent(this.playerTransform);
  readonly camera = new Camera3D({ type: 'perspective', fov: Math.PI / 4, near: 0.1, far: 100 });
  readonly orbit = new SphericalTransform3D({ radius: 12, theta: 0, phi: 0.92, target: [0, 0.8, 3] });
  readonly controls: VirtualJoystickControls;
  readonly aimControls: VirtualJoystickControls;
  private character: LoadedGltfModel | null = null;
  private weapon: LoadedGltfModel | null = null;
  private hand: Entity | null = null;
  private socket: Entity | null = null;
  private flash = new Entity('Muzzle flash').addComponent(new CartesianTransform3D());
  private readonly radar: RadarHud;
  private stats: GuiLabel;
  private ammoLabel: GuiLabel;
  private reloadButton: GuiButton;
  private fireButton: GuiButton;
  private bulletPool: { entity: Entity; transform: CartesianTransform3D }[] = [];
  private enemyPool: { entity: Entity; transform: CartesianTransform3D; character: LoadedGltfModel; weapon: LoadedGltfModel;
    flash: Entity; hand: Entity; socket: Entity; id: number; animation: string; animationTime: number }[] = [];
  private enemyLoading: Promise<void> | null = null;
  private enemyLoadError: unknown = null;
  private playerDeathAge = 0;
  private addBulletView!: () => void;
  private fogGeometry!: Geometry3D;
  private fogKey = '';
  private orientationLabel: GuiLabel;
  private restartButton: GuiButton;
  private hurtLabel: GuiLabel;
  private hurtTime = 0;
  private damageBefore = 0;
  private portrait = false;
  private readonly safeInsets: () => SafeInsets;
  private readonly haptic: (kind: 'shot' | 'hit') => void;
  private disposed = false;
  private initialized = false;
  private elapsed = 0;
  private runTime = 0;
  private shotsBefore = 0;
  private flashTime = 0;
  private dimensions = '';
  private readonly save: SingleSlotGameSave<{ shots: number; hits: number }>;
  private savedCounts = '';
  private lastSaveTime = 0;
  private readonly canvas: HTMLCanvasElement;
  private readonly loadModel: ModelLoader;
  constructor(readonly engine: HaiyueEngine, options: { guiFont?: GuiFontOptions; loadModel?: ModelLoader; saveBackend?: GameSaveBackend; safeInsets?: () => SafeInsets; haptic?: (kind: 'shot' | 'hit') => void } = {}) {
    if (!engine.canvas) throw new Error('RangeGame requires an Engine surface');
    this.canvas = engine.canvas;
    this.safeInsets = options.safeInsets ?? (() => ZERO_INSETS);
    this.haptic = options.haptic ?? (() => {});
    this.save = new SingleSlotGameSave({ gameId: 'ak47-range', name: '训练记录',
      ...(options.saveBackend ? { backend: options.saveBackend } : {}),
      validateData: (v): v is { shots: number; hits: number } => isRecord(v) && isNonNegativeInteger(v.shots) && isNonNegativeInteger(v.hits) && Number(v.hits) <= Number(v.shots) });
    this.loadModel = options.loadModel ?? (name => loadGltfModel(new URL(`assets/${name}/model.gltf`, location.href).href, { assetManager: engine.assetManager ?? null }));
    const cameraEntity = new Entity('Following third-person camera').addComponent(this.camera).addComponent(this.orbit);
    this.world.addEntity(cameraEntity);
    this.world.addEntity(this.player);
    this.world.addEntity(new Entity('Engine HUD').addComponent(this.root));
    this.world.addEntity(new Entity('Sun').addComponent(new DirectionalLight({ direction: [-0.6, -1, -0.5], intensity: 2.4, color: [1, 0.91, 0.77] })));
    this.world.addEntity(new Entity('Sky').addComponent(new EnvironmentLight({ intensity: 1, diffuseColor: [0.65, 0.77, 0.85] })));
    this.world.addSystem(new Render3DSystem(engine, cameraEntity, { priority: 20, loadOp: 'clear', renderProfile: 'simple' }));
    this.world.addSystem(new GuiSystem(engine, { loadOp: 'load', font: { ...options.guiFont, chars: FONT_CHARS, fontSize: 32, atlasSize: 2048 } }));
    const integration = new RenderIntegration(engine, { label: 'AK47Range.render' });
    this.world.addRuntimeIntegration(integration);
    integration.registerAll(this.world, () => ({ pass: 'shared' }));
    this.buildArena();
    this.radar = new RadarHud(this.root, () => this.safeInsets());
    const title = this.root.add(new GuiLabel({ text: '前线 / 生存', fontSize: 23, style: { color: '#ebdfc2' } }));
    place(title, r => ({ x: this.safeInsets().left + 18, y: this.safeInsets().top + 12, width: r.width - 36, height: 32 }));
    this.stats = this.root.add(new GuiLabel({ text: '', fontSize: 12, style: { color: '#adc1c3' } }));
    place(this.stats, r => ({ x: this.safeInsets().left + 19, y: this.safeInsets().top + 49, width: r.width - 38, height: 22 }));
    this.ammoLabel = this.root.add(new GuiLabel({ text: '', fontSize: 17, textAlign: 'right', style: { color: '#f2d49d' } }));
    place(this.ammoLabel, r => ({ x: r.width - this.safeInsets().right - 178, y: r.height - this.safeInsets().bottom - 217, width: 155, height: 28 }));
    this.reloadButton = this.root.add(new GuiButton({ text: '重新装填', onClick: () => { this.rules.reload(); }, style: { backgroundColor: '#273a43', borderColor: '#728e94', radius: 12 } }));
    place(this.reloadButton, r => actionRects(r.width, r.height, this.safeInsets()).reload);
    // Idle presentation only. The aiming control owns shooting pointers and expands on press.
    this.fireButton = this.root.add(new GuiButton({ text: '射击', style: { backgroundColor: '#aa7841', borderColor: '#ead3a2', radius: 48 } }));
    place(this.fireButton, r => actionRects(r.width, r.height, this.safeInsets()).fire);
    const hint = this.root.add(new GuiLabel({ text: '120° 视野 · 掩体', fontSize: 12, textAlign: 'center', style: { color: '#aec7c9' } }));
    place(hint, r => ({ x: this.safeInsets().left + 28, y: r.height - this.safeInsets().bottom - 27, width: 130, height: 22 }));
    this.controls = new VirtualJoystickControls(this.canvas, { mode: 'fixed', target: this.player, guiRoot: this.root,
      maxDistance: 48, knobRadius: 23, moveSpeed: 4.4, rotateToDirection: false, deadZone: 0.12,
      shouldActivate: () => this.initialized && !this.portrait && this.rules.alive,
      center: ({ width, height }) => this.joystickCenter(width, height),
      region: ({ width, height }) => ({ x: 0, y: height * 0.45, width: width * 0.5, height: height * 0.55 }),
      baseStyle: { backgroundColor: '#263f4666', borderColor: '#b3d5d580' }, knobStyle: { backgroundColor: '#b9dcd980', borderColor: '#def7ee99' } });
    this.aimControls = new VirtualJoystickControls(this.canvas, { mode: 'fixed', guiRoot: this.root,
      maxDistance: 40, knobRadius: 20, activationRadius: 48, deadZone: 0.12, showIdle: false,
      center: ({ width, height }) => {
        const fire = actionRects(width, height, this.safeInsets()).fire;
        return { x: fire.x + fire.width / 2, y: fire.y + fire.height / 2 };
      },
      region: ({ width, height }) => actionRects(width, height, this.safeInsets()).fire,
      shouldActivate: () => this.initialized && !this.portrait && this.rules.alive,
      baseStyle: { backgroundColor: '#8a633e66', borderColor: '#ead3a280' },
      knobStyle: { backgroundColor: '#e8bd788c', borderColor: '#fff0d099' } });
    this.aimControls.events.on('start', this.startAim);
    this.aimControls.events.on('end', this.stopAim);
    this.aimControls.events.on('cancel', this.stopAim);
    this.hurtLabel = this.root.add(new GuiLabel({ text: '被击中', textAlign: 'center', fontSize: 20, style: { color: '#ff967c' } }));
    place(this.hurtLabel, r => ({ x: r.width / 2 - 80, y: this.safeInsets().top + 25, width: 160, height: 32 }));
    this.hurtLabel.setVisible(false);
    this.restartButton = this.root.add(new GuiButton({ text: '重新开始', onClick: () => this.restart(), style: { backgroundColor: '#ae7146' } }));
    place(this.restartButton, r => ({ x: r.width / 2 - 85, y: r.height / 2 + 10, width: 170, height: 54 }));
    this.restartButton.setVisible(false);
    this.orientationLabel = this.root.add(new GuiLabel({ text: '请横屏继续', fontSize: 26, textAlign: 'center', style: { backgroundColor: '#10202aee', color: '#ebdfc2', padding: 12 } }));
    place(this.orientationLabel, r => ({ x: 0, y: r.height / 2 - 60, width: r.width, height: 60 }));
    this.orientationLabel.setVisible(false);
    engine.on('update', this.frame);
  }
  async init(): Promise<void> {
    const saved = await this.save.load();
    if (this.disposed) return;
    if (saved) { this.rules.shots = saved.shots; this.rules.hits = saved.hits; this.shotsBefore = saved.shots; }
    // Keep partial assets owned even if the second load fails or page unloads during loading.
    const character = await this.loadModel('ren42');
    if (this.disposed) { disposeGltfModel(character); return; }
    this.character = character;
    // Cool the player's camouflage while retaining its texture; enemy materials are separate instances.
    const tintPlayer = (entity: Entity): void => {
      const material = entity.getComponent(Mesh3D)?.material;
      if (material instanceof PbrMaterial) material.baseColor = [0.45, 0.65, 1, 1];
      for (const child of entity.children) tintPlayer(child);
    };
    tintPlayer(character.root);
    const weapon = await this.loadModel('qiang_ak47');
    if (this.disposed) { disposeGltfModel(weapon); return; }
    this.weapon = weapon;
    const mounted = mountSoldier(this.player, character, weapon);
    this.hand = mounted.hand; this.socket = mounted.socket;
    // Warm independent skeletons once; subsequent enemy appearances reuse these views.
    await this.addEnemyView(); await this.addEnemyView();
    if (this.disposed) return;
    this.flash.addComponent(new Mesh3D(createSphere3D({ radius: 0.14, widthSegments: 8, heightSegments: 6 }),
      new PbrMaterial({ baseColor: [1, 0.65, 0.08, 1], emissiveFactor: [4, 1.5, 0.1], roughness: 1 })));
    this.flash.disabled = true; this.world.addEntity(this.flash);
    this.initialized = true;
  }
  private clip(name: string): GltfAnimationClip {
    if (!this.character) throw new Error('Character is not loaded');
    return soldierClip(this.character, name);
  }
  private animate(dt: number): void {
    if (!this.character) return;
    if (!this.rules.alive) {
      this.playerDeathAge += dt;
      deathPose(this.character, this.playerDeathAge);
      this.player.disabled = this.playerDeathAge >= CORPSE_SECONDS;
      return;
    }
    this.runTime += dt * this.controls.state.strength * 1.5;
    const moving = this.controls.state.strength > 0;
    // Upper and lower clips are authored separately; apply lower last to preserve locomotion roots.
    const upper = this.clip(this.rules.reloadRemaining > 0 ? 'reload_top' : 'run_top2');
    applyGltfAnimationClip(upper, this.rules.reloadRemaining > 0 ? (1 - this.rules.reloadRemaining / RELOAD_SECONDS) * (upper.duration - 0.001) : 0);
    applyGltfAnimationClip(this.clip(moving ? 'run_bottom' : 'idle_bottom'), moving ? this.runTime : this.elapsed);
  }
  private buildArena(): void {
    const box = createBox3D();
    const ground = [new PbrMaterial({ baseColor: [0.075, 0.105, 0.11, 1], roughness: 1 }),
      new PbrMaterial({ baseColor: [0.085, 0.12, 0.12, 1], roughness: 1 })];
    const addBox = (name: string, position: [number, number, number], scale: [number, number, number], material: PbrMaterial) => {
      const e = new Entity(name).addComponent(new CartesianTransform3D({ position, scale })).addComponent(new Mesh3D(box, material));
      this.world.addEntity(e); return e;
    };
    for (let x = -20; x < 20; x += 4) for (let z = -20; z < 20; z += 4)
      addBox('Concrete training floor', [x + 2, -0.14, z + 2], [3.96, 0.2, 3.96], ground[((x + z + 40) / 4) % 2]!);
    const wall = new PbrMaterial({ baseColor: [0.10, 0.15, 0.16, 1], roughness: 0.9 });
    for (const x of [-20, 20]) addBox('Range boundary', [x, 0.5, 0], [0.35, 1, 40], wall);
    for (const z of [-20, 20]) addBox('Range boundary', [0, 0.5, z], [40, 1, 0.35], wall);
    const yellow = new PbrMaterial({ baseColor: [0.86, 0.64, 0.27, 1], roughness: 1 });
    for (const cover of this.rules.obstacles) {
      const material = new PbrMaterial({ baseColor: [0.22, 0.29, 0.29, 1], roughness: 0.85 });
      addBox('Solid cover', [cover.x, cover.height / 2, cover.z], [cover.width, cover.height, cover.depth], material);
      addBox('Cover top stripe', [cover.x, cover.height + 0.012, cover.z], [cover.width * 0.88, 0.025, 0.12], yellow);
    }
    // One dynamic visibility fan. Terrain remains readable outside it; actor visibility is exact LOS.
    const positions = new Float32Array(256 * 9), normals = new Float32Array(positions.length);
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
    this.fogGeometry = new Geometry3D({ positions, normals, cullMode: 'none', boundsMode: 'dynamic' });
    this.world.addEntity(new Entity('Visible ground / occluded 120-degree fan').addComponent(new CartesianTransform3D())
      .addComponent(new Mesh3D(this.fogGeometry, new PbrMaterial({ baseColor: [0.30, 0.44, 0.35, 0.55], alphaMode: 'blend', roughness: 1 }))));
    const tracer = createBox3D({ width: 0.018, height: 0.018, depth: 0.24 });
    const tracerMaterial = new PbrMaterial({ baseColor: [1, 0.82, 0.28, 1], emissiveFactor: [3, 1.9, 0.3] });
    this.addBulletView = () => {
      const transform = new CartesianTransform3D();
      const entity = new Entity('Bullet tracer').addComponent(transform).addComponent(new Mesh3D(tracer, tracerMaterial));
      entity.disabled = true; this.world.addEntity(entity); this.bulletPool.push({ entity, transform });
    };
  }
  muzzle(): { x: number; y: number; z: number } {
    if (!this.weapon) return { x: this.playerTransform.position[0]!, y: 1.2, z: this.playerTransform.position[2]! - 0.8 };
    return soldierMuzzle(this.weapon);
  }
  private async addEnemyView(): Promise<void> {
    const character = await this.loadModel('ren42');
    if (this.disposed) { disposeGltfModel(character); return; }
    let weapon: LoadedGltfModel | null = null;
    try {
      weapon = await this.loadModel('qiang_ak47');
      if (this.disposed) { disposeGltfModel(weapon); disposeGltfModel(character); return; }
      const transform = new CartesianTransform3D(), entity = new Entity('ren42 enemy').addComponent(transform);
      const mounted = mountSoldier(entity, character, weapon);
      const flash = new Entity('Enemy muzzle flash').addComponent(new CartesianTransform3D())
        .addComponent(new Mesh3D(createSphere3D({ radius: 0.09, widthSegments: 8, heightSegments: 6 }),
          new PbrMaterial({ baseColor: [1, 0.6, 0.15, 1], emissiveFactor: [2, 0.8, 0.1] })));
      entity.disabled = true; flash.disabled = true;
      this.world.addEntity(entity); this.world.addEntity(flash);
      this.enemyPool.push({ entity, transform, character, weapon, flash, hand: mounted.hand, socket: mounted.socket,
        id: 0, animation: 'idle_bottom', animationTime: 0 });
    } catch (error) {
      if (weapon) disposeGltfModel(weapon);
      disposeGltfModel(character); throw error;
    }
  }

  private readonly frame = ({ detail }: { detail: { time: number; delta: number } }): void => {
    if (this.disposed || !this.initialized) return;
    if (this.enemyLoadError) throw this.enemyLoadError;
    const dt = Math.min(0.1, Math.max(0, detail.delta / 1000)); this.elapsed += dt;
    this.resize();
    const old = { x: this.playerTransform.position[0]!, z: this.playerTransform.position[2]! };
    this.controls.disabled = this.portrait || !this.rules.alive;
    this.aimControls.disabled = this.controls.disabled;
    this.controls.step(Math.max(0, detail.delta));
    this.aimControls.step(Math.max(0, detail.delta));
    this.playerTransform.setRotation(0, resolvePlayerHeading(this.playerTransform.rotation[1]!, this.controls.state, this.aimControls.state, dt), 0);
    const p = this.playerTransform.position;
    const moved = this.rules.move(old, { x: p[0]!, z: p[2]! });
    this.playerTransform.setPosition(moved.x, 0, moved.z);
    this.animate(this.portrait ? 0 : dt);
    const muzzle = this.muzzle();
    this.rules.step(this.portrait ? 0 : dt, muzzle, this.playerTransform.rotation[1]!, moved);
    if (this.rules.shots > this.shotsBefore) { this.flashTime = 0.045; this.haptic('shot'); }
    if (this.rules.damageEvents > this.damageBefore) { this.hurtTime = 0.3; this.haptic('hit'); }
    this.damageBefore = this.rules.damageEvents; this.hurtTime = Math.max(0, this.hurtTime - dt);
    this.hurtLabel.setVisible(this.hurtTime > 0);
    if (!this.rules.alive) this.cancelInteraction();
    this.updateVisibility();
    this.radar.update(this.rules.player, this.rules.enemies.filter(e => e.health > 0));
    this.shotsBefore = this.rules.shots; this.flashTime = Math.max(0, this.flashTime - dt);
    this.flash.disabled = !this.rules.alive || this.flashTime <= 0;
    this.flash.getComponent(CartesianTransform3D)!.setPosition(muzzle.x, muzzle.y, muzzle.z);
    while (this.bulletPool.length < this.rules.bullets.length) this.addBulletView();
    this.bulletPool.forEach((v, i) => {
      const b = this.rules.bullets[i]; v.entity.disabled = !b || (b.team === 'enemy' && !this.rules.canSee(this.rules.player, b));
      if (b) { v.transform.setPosition(b.x, b.y, b.z); v.transform.setRotation(0, Math.atan2(-b.dx, -b.dz), 0); }
    });
    const follow = 1 - Math.exp(-9 * dt), target = this.orbit.target;
    this.orbit.setTarget(target[0]! + (p[0]! - target[0]!) * follow, 0.8, target[2]! + (p[2]! - target[2]!) * follow);
    this.stats.setText(`生命 ${this.rules.health}  ·  击败 ${this.rules.kills}  ·  生存 ${Math.floor(this.rules.time)} 秒`);
    this.restartButton.setVisible(!this.rules.alive && !this.portrait);
    this.orientationLabel.setVisible(this.portrait || !this.rules.alive);
    this.orientationLabel.setText(this.portrait ? '请横屏继续' : '战斗结束');
    this.ammoLabel.setText(`${String(this.rules.ammo).padStart(2, '0')} / ${MAGAZINE}  ·  AK47`);
    this.reloadButton.setText(this.rules.reloadRemaining > 0 ? `装填 ${this.rules.reloadRemaining.toFixed(1)}` : '重新装填');
    this.reloadButton.setDisabled(this.portrait || !this.rules.alive || this.rules.reloadRemaining > 0 || this.rules.ammo === MAGAZINE);
    this.fireButton.setDisabled(this.portrait || !this.rules.alive);
    this.fireButton.setText(this.rules.reloadRemaining > 0 ? '装填中' : this.rules.ammo ? '射击' : '空仓');
    this.fireButton.setStyle({ backgroundColor: this.rules.firing ? '#d89d4d' : '#aa7841' });
    if (this.elapsed - this.lastSaveTime >= 5) this.saveStats();
    this.world.update(detail.time, Math.max(0, detail.delta));
  };
  joystickCenter(width: number, height: number) {
    return { x: this.safeInsets().left + Math.min(104, (width - this.safeInsets().left - this.safeInsets().right) * 0.25), y: height - this.safeInsets().bottom - 100 };
  }
  hudActions() { const r = this.canvas.getBoundingClientRect(); return actionRects(r.width, r.height, this.safeInsets()); }
  restart(): void {
    this.cancelInteraction(); this.rules.restart(); this.playerTransform.setPosition(0, 0, 3);
    this.playerTransform.setRotation(0, 0, 0); this.orbit.setTarget(0, 0.8, 3); this.fogKey = '';
    this.playerDeathAge = 0; this.player.disabled = false; this.hurtTime = 0; this.flashTime = 0;
  }
  private updateVisibility(): void {
    const observer = this.rules.player;
    const visibleEnemies = this.rules.enemies.filter(enemy => this.rules.canSee(observer, enemy));
    if (this.enemyPool.length < visibleEnemies.length + 1 && !this.enemyLoading) {
      this.enemyLoading = this.addEnemyView().catch(error => { this.enemyLoadError = error; })
        .finally(() => { this.enemyLoading = null; });
    }
    this.enemyPool.forEach((view, i) => {
      const enemy = visibleEnemies[i];
      view.entity.disabled = !enemy; view.flash.disabled = true;
      if (!enemy) { view.id = 0; return; }
      view.id = enemy.id;
      view.transform.setPosition(enemy.x, 0, enemy.z); view.transform.setRotation(0, enemy.heading, 0);
      if (enemy.deathAge !== null) {
        view.animation = 'death'; view.animationTime = deathPose(view.character, enemy.deathAge);
      } else {
        view.animation = enemy.moving ? 'run_bottom' : 'idle_bottom'; view.animationTime = enemy.animationTime;
        applyGltfAnimationClip(soldierClip(view.character, 'run_top2'), 0);
        applyGltfAnimationClip(soldierClip(view.character, view.animation), enemy.animationTime);
        view.flash.disabled = enemy.flash <= 0;
        const muzzle = soldierMuzzle(view.weapon);
        view.flash.getComponent(CartesianTransform3D)!.setPosition(muzzle.x, muzzle.y, muzzle.z);
      }
    });
    const key = `${observer.x.toFixed(3)},${observer.z.toFixed(3)},${observer.heading.toFixed(3)}`;
    if (key === this.fogKey) return; this.fogKey = key;
    const angles = Array.from({ length: 129 }, (_, i) => -PLAYER_FOV / 2 + i / 128 * PLAYER_FOV);
    for (const box of this.rules.obstacles) for (const x of [box.x - box.width / 2, box.x + box.width / 2]) for (const z of [box.z - box.depth / 2, box.z + box.depth / 2]) {
      const a = Math.atan2(observer.x - x, observer.z - z) - observer.heading;
      const angle = Math.atan2(Math.sin(a), Math.cos(a));
      for (const offset of [-0.0001, 0, 0.0001]) if (Math.abs(angle + offset) < PLAYER_FOV / 2) angles.push(angle + offset);
    }
    angles.sort((a, b) => a - b);
    const points = angles.map(a => {
      const end = { x: observer.x - Math.sin(observer.heading + a) * SIGHT_RANGE, z: observer.z - Math.cos(observer.heading + a) * SIGHT_RANGE };
      let t = Math.min(1, this.rules.coverFraction(observer, end));
      for (const [start, delta] of [[observer.x, end.x - observer.x], [observer.z, end.z - observer.z]])
        if (Math.abs(delta!) > 1e-8) t = Math.min(t, ((delta! > 0 ? 20 : -20) - start!) / delta!);
      return { x: observer.x + (end.x - observer.x) * t, z: observer.z + (end.z - observer.z) * t };
    });
    const positions = this.fogGeometry.positions; positions.fill(0);
    for (let i = 1; i < points.length; i++) positions.set([observer.x, -0.025, observer.z, points[i - 1]!.x, -0.025, points[i - 1]!.z, points[i]!.x, -0.025, points[i]!.z], (i - 1) * 9);
    this.fogGeometry.markDirty();
  }
  private resize(): void {
    const r = this.canvas.getBoundingClientRect(), key = `${r.left},${r.top},${r.width},${r.height},${JSON.stringify(this.safeInsets())}`;
    if (key === this.dimensions) return;
    if (this.dimensions) this.cancelInteraction();
    this.dimensions = key; this.camera.updateAspect(r.width / Math.max(1, r.height));
    this.portrait = r.width < r.height;
    this.root.root.markDirty();
    this.orbit.radius = 12;
  }
  private readonly startAim = (): void => {
    this.rules.setFiring(true);
    this.fireButton.setVisible(false);
  };
  private readonly stopAim = (): void => {
    this.rules.cancel();
    this.fireButton.setVisible(true);
  };
  cancelInteraction(): void {
    this.controls.cancel(); this.aimControls.cancel(); this.rules.cancel();
    this.saveStats();
  }
  private saveStats(): void {
    if (!this.initialized) return;
    this.lastSaveTime = this.elapsed;
    const key = `${this.rules.shots}:${this.rules.hits}`;
    if (key === this.savedCounts) return;
    this.savedCounts = key; this.save.save({ shots: this.rules.shots, hits: this.rules.hits });
  }
  flushSave(): Promise<void> { this.saveStats(); return this.save.flush(); }
  snapshot() {
    return { ready: this.initialized, ammo: this.rules.ammo, shots: this.rules.shots, hits: this.rules.hits,
      health: this.rules.health, kills: this.rules.kills, survival: this.rules.time, spawned: this.rules.spawned,
      enemies: this.rules.enemies.map(e => ({ id: e.id, x: e.x, z: e.z, heading: e.heading, alert: e.alert, health: e.health, deathAge: e.deathAge, visible: this.rules.canSee(this.rules.player, e) })),
      enemyModels: this.enemyPool.filter(e => !e.entity.disabled).map(e => ({ id: e.id, model: 'ren42',
        weaponAttached: e.weapon.root.parent === e.socket && e.socket.parent === e.hand,
        animation: e.animation, animationTime: e.animationTime, deathDuration: soldierClip(e.character, 'death').duration })),
      enemyFireRange: ENEMY_FIRE_RANGE, playerDeathAge: this.playerDeathAge, playerVisible: !this.player.disabled,
      renderedEnemies: this.enemyPool.filter(e => !e.entity.disabled).length, portraitPaused: this.portrait,
      radar: this.radar.snapshot(), fieldOfView: { player: PLAYER_FOV * 180 / Math.PI, enemy: ENEMY_FOV * 180 / Math.PI },
      safeInsets: this.safeInsets(), damageEvents: this.rules.damageEvents,
      reloading: this.rules.reloadRemaining, firing: this.rules.firing, bullets: this.rules.bullets.length,
      player: Array.from(this.playerTransform.position), heading: this.playerTransform.rotation[1],
      cameraTarget: Array.from(this.orbit.target), cameraEye: Array.from(this.orbit.eyePosition),
      hand: this.hand?.name, weaponAttached: this.weapon?.root.parent === this.socket && this.socket?.parent === this.hand,
      aimJoystick: this.aimControls.state, fireButtonVisible: this.fireButton.visible,
      muzzle: this.muzzle(), joystick: this.controls.state, animation: !this.rules.alive ? 'death' : this.controls.state.strength ? 'run_bottom' : 'idle_bottom' };
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.cancelInteraction(); this.controls.destroy(); this.aimControls.destroy(); this.engine.off('update', this.frame);
    for (const view of this.enemyPool) { disposeGltfModel(view.weapon); disposeGltfModel(view.character); }
    this.enemyPool.length = 0;
    if (this.weapon) disposeGltfModel(this.weapon);
    if (this.character) disposeGltfModel(this.character);
    this.world.destroy();
  }
}
