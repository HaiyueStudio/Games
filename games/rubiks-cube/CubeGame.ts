import {
  Camera3D,
  DirectionalLight,
  Entity,
  EnvironmentLight,
  HaiyueEngine,
  Mesh3D,
  PbrMaterial,
  SphericalTransform3D,
  World,
} from '@haiyue/engine';
import { createRoundedBox3D, type Geometry3D } from '@haiyue/engine/geometry';
import { Transform3D } from '@haiyue/engine/components';
import { GuiSystem, type GuiFontOptions } from '@haiyue/engine/gui';
import { Render3DSystem } from '@haiyue/engine/systems';
import type { GameSaveBackend } from '@haiyue/engine/save';
import { SingleSlotGameSave, isRecord } from '../save/SingleSlotGameSave';
import { KINDS } from './model';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { mat4, vec3, type Mat4 } from 'wgpu-matrix';
import { CubeHud, FONT_CHARS } from './hud';
import { cubeLayout, contains } from './layout';
import { CubeSession } from './session';
import { transform, type Axis, type Cubie, type Kind, type Vec } from './model';
interface Visual {
  entity: Entity;
  transform: Transform3D;
  cubie: Cubie;
  local: Mat4;
}
interface Pick {
  cubie: Cubie;
  point: Vec;
  normal: Vec;
}
interface Gesture {
  id: number;
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  pick: Pick | null;
}
const COLORS: [number, number, number, number][] = [
  [0.98, 0.25, 0.025, 1],
  [0.82, 0.018, 0.035, 1],
  [1, 0.68, 0.015, 1],
  [0.92, 0.95, 1, 1],
  [0.015, 0.13, 0.85, 1],
  [0.015, 0.64, 0.23, 1],
];
export class CubeGame {
  readonly world = new World('Rubiks Cube');
  session = new CubeSession('3');
  home = true;
  axis: Axis = 0;
  layer = 2;
  private readonly camera = new Camera3D({ type: 'perspective', fov: Math.PI / 4, near: 0.1, far: 100 });
  private readonly orbit = new SphericalTransform3D({ radius: 12, theta: 0.62, phi: 1.05 });
  private readonly geometries = new Map<string, Geometry3D>();
  private readonly body = new PbrMaterial({
    baseColor: [0.016, 0.022, 0.03, 1],
    roughness: 0.32,
    metallic: 0.12,
  });
  private readonly silver = new PbrMaterial({
    baseColor: [0.67, 0.75, 0.88, 1],
    roughness: 0.2,
    metallic: 0.75,
  });
  private readonly colors = COLORS.map(
    (baseColor) => new PbrMaterial({ baseColor, roughness: 0.27, metallic: 0.08 }),
  );
  private readonly hud: CubeHud;
  private readonly preferences: SingleSlotGameSave<{ lastKind: Kind }>;
  private visuals: Visual[] = [];
  private gesture: Gesture | null = null;
  private disposed = false;
  private readonly canvas: HTMLCanvasElement;
  private width = 1;
  private height = 1;
  private dimensions = '';
  private viewProjection: Mat4 = mat4.identity();
  constructor(
    private readonly engine: HaiyueEngine,
    options: { guiFont?: GuiFontOptions; saveBackend?: GameSaveBackend } = {},
  ) {
    if (!engine.canvas) throw new Error('CubeGame requires an Engine surface');
    this.canvas = engine.canvas;
    this.preferences = new SingleSlotGameSave({
      gameId: 'rubiks-cube',
      name: '魔方偏好',
      ...(options.saveBackend ? { backend: options.saveBackend } : {}),
      validateData: (value): value is { lastKind: Kind } =>
        isRecord(value) && KINDS.includes(value.lastKind as Kind),
    });
    const cameraEntity = new Entity('Cube camera').addComponent(this.camera).addComponent(this.orbit);
    this.world.addEntity(cameraEntity);
    this.world.addEntity(
      new Entity('Key light').addComponent(
        new DirectionalLight({ direction: [-0.5, -1, -0.65], color: [1, 0.94, 0.85], intensity: 2.3 }),
      ),
    );
    this.world.addEntity(
      new Entity('Cool fill').addComponent(
        new DirectionalLight({ direction: [0.7, -0.2, 0.6], color: [0.45, 0.68, 1], intensity: 0.8 }),
      ),
    );
    this.world.addEntity(
      new Entity('Studio environment').addComponent(
        new EnvironmentLight({
          intensity: 0.85,
          diffuseColor: [0.46, 0.56, 0.72],
          specularColor: [0.9, 0.95, 1],
        }),
      ),
    );
    this.world.addSystem(
      new Render3DSystem(engine, cameraEntity, { priority: 20, loadOp: 'clear', renderProfile: 'simple' }),
    );
    this.hud = new CubeHud(this.world, {
      start: (k) => this.start(k),
      home: () => this.goHome(),
      shuffle: () => this.session.shuffle(Date.now() >>> 0),
      undo: () => this.session.undo(),
      restore: () => {
        if (this.session.busy) this.session.stop();
        else this.session.restore();
      },
      axis: (a) => {
        this.axis = a;
      },
      layer: (l) => {
        this.layer = l;
      },
      turn: (direction) => this.session.turn({ axis: this.axis, layer: this.layer, direction }),
      view: () => this.resetView(),
    });
    this.world.addSystem(
      new GuiSystem(engine, {
        loadOp: 'load',
        font: { ...options.guiFont, chars: FONT_CHARS + '°', fontSize: 32, atlasSize: 2048 },
      }),
    );
    const integration = new RenderIntegration(engine, { label: 'RubiksCube.render' });
    this.world.addRuntimeIntegration(integration);
    integration.registerAll(this.world, () => ({ pass: 'shared' }));
    this.rebuild();
    this.resize();
    this.hud.update(this.session, this.home, this.axis, this.layer);
    this.canvas.addEventListener('pointerdown', this.pointerDown);
    this.canvas.addEventListener('pointermove', this.pointerMove);
    this.canvas.addEventListener('pointerup', this.pointerUp);
    this.canvas.addEventListener('pointercancel', this.pointerCancel);
    engine.on('update', this.frame);
  }
  async init(): Promise<void> {
    const saved = await this.preferences.load();
    if (saved && !this.disposed && this.home) {
      this.session = new CubeSession(saved.lastKind);
      this.layer = this.session.model.order - 1;
      this.rebuild();
      this.resize();
    }
  }
  flushSave(): Promise<void> {
    return this.preferences.flush();
  }
  start(kind: Kind): void {
    this.cancelInteraction();
    this.session = new CubeSession(kind);
    this.preferences.save({ lastKind: kind });
    this.home = false;
    this.axis = 0;
    this.layer = this.session.model.order - 1;
    this.resetView();
    this.rebuild();
  }
  goHome(): void {
    this.cancelInteraction();
    this.session = new CubeSession(this.session.model.kind);
    this.home = true;
    this.resetView();
    this.rebuild();
  }
  resetView(): void {
    this.orbit.set(12, 0.62, 1.05);
    this.resize();
  }
  cancelInteraction(): void {
    if (this.gesture) {
      try {
        this.canvas.releasePointerCapture(this.gesture.id);
      } catch {
        /* capture can already have ended */
      }
      this.gesture = null;
    }
  }
  snapshot() {
    return {
      kind: this.session.model.kind,
      home: this.home,
      order: this.session.model.order,
      moves: this.session.model.history.length,
      recentMoves: this.session.model.history.slice(-8).map((m) => ({ ...m })),
      solved: this.session.model.solved,
      busy: this.session.busy,
      restoring: this.session.restoring,
      axis: this.axis,
      layer: this.layer,
      cubies: this.session.model.cubies.length,
      projection: this.camera.projectionType,
      roundedGeometryCount: this.geometries.size,
      width: this.width,
      height: this.height,
    };
  }
  private readonly frame = ({
    detail: { time, delta },
  }: {
    detail: { time: number; delta: number };
  }): void => {
    if (this.disposed) return;
    this.resize();
    const changed = this.session.update(delta / 1000);
    if (changed || this.session.active) this.syncVisuals();
    this.hud.update(this.session, this.home, this.axis, this.layer);
    this.world.update(time, delta);
  };
  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    const dimensions = `${this.width}:${this.height}`;
    if (this.dimensions && dimensions !== this.dimensions) this.cancelInteraction();
    this.dimensions = dimensions;
    const stage = cubeLayout(this.width, this.height).stage;
    const scale = Math.max(
      1,
      Math.min(stage.width, stage.height) / (this.session.model.kind === 'mirror' ? 7.0 : 5.9),
    );
    // Fit the cube into the gameplay region while retaining a true 45° perspective.
    // Offsetting the orbit target in its screen plane keeps the HUD's space clear.
    this.camera.updateAspect(this.width / this.height);
    this.orbit.radius = this.height / (2 * scale * Math.tan(this.camera.fov / 2));
    const dx = (stage.x + stage.width / 2 - this.width / 2) / scale,
      dy = -(stage.y + stage.height / 2 - this.height / 2) / scale;
    const m = this.orbit.localMatrix;
    this.orbit.setTarget(-m[0]! * dx - m[4]! * dy, -m[1]! * dx - m[5]! * dy, -m[2]! * dx - m[6]! * dy);
    this.viewProjection = mat4.multiply(this.camera.projectionMatrix, mat4.inverse(this.orbit.localMatrix));
  }
  private rebuild(): void {
    for (const visual of this.visuals) visual.entity.destroy();
    this.visuals = [];
    const n = this.session.model.order;
    for (const cubie of this.session.model.cubies) {
      this.addVisual(cubie, [0, 0, 0], cubie.size.map((v) => v - 0.0275) as Vec, this.body);
      for (const a of [0, 1, 2] as Axis[])
        for (const sign of [-1, 1]) {
          if (cubie.home[a] !== (sign < 0 ? 0 : n - 1)) continue;
          const offset: Vec = [0, 0, 0];
          offset[a] = sign * (cubie.size[a] / 2 - 0.01125);
          const size = cubie.size.map((v) => v - 0.06) as Vec;
          size[a] = 0.018;
          this.addVisual(
            cubie,
            offset,
            size,
            this.session.model.kind === 'mirror' ? this.silver : this.colors[a * 2 + (sign > 0 ? 1 : 0)]!,
            a,
          );
        }
    }
    this.syncVisuals();
  }
  private addVisual(cubie: Cubie, offset: Vec, size: Vec, material: PbrMaterial, faceAxis?: Axis): void {
    // Build bodies at their actual dimensions so mirror cubies retain circular bevels.
    // Face tiles flatten a rounded solid only along their normal, preserving broad
    // rounded corners instead of clamping the radius to the tiny sticker thickness.
    const radius = Math.min(
      faceAxis === undefined ? 0.065 : 0.08,
      Math.min(...size.filter((_, axis) => axis !== faceAxis)) * 0.12,
    );
    const dimensions: Vec = [...size];
    const scale: Vec = [1, 1, 1];
    if (faceAxis !== undefined) {
      dimensions[faceAxis] = radius * 2;
      scale[faceAxis] = size[faceAxis] / dimensions[faceAxis];
    }
    const key = `${dimensions.join(':')}:${radius}`;
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = createRoundedBox3D({
        width: dimensions[0],
        height: dimensions[1],
        depth: dimensions[2],
        radius,
        segments: 4,
      });
      this.geometries.set(key, geometry);
    }
    const tr = new Transform3D();
    const entity = new Entity('Cube piece ' + cubie.id)
      .addComponent(tr)
      .addComponent(new Mesh3D(geometry, material));
    this.world.addEntity(entity);
    this.visuals.push({
      entity,
      transform: tr,
      cubie,
      local: mat4.multiply(
        mat4.translation(cubie.center.map((v, a) => v + offset[a]!) as Vec),
        mat4.scaling(scale),
      ),
    });
  }
  private orientation(piece: Cubie): Mat4 {
    const b = piece.basis;
    return new Float32Array([
      b[0][0],
      b[0][1],
      b[0][2],
      0,
      b[1][0],
      b[1][1],
      b[1][2],
      0,
      b[2][0],
      b[2][1],
      b[2][2],
      0,
      0,
      0,
      0,
      1,
    ]);
  }
  private syncVisuals(): void {
    const active = this.session.active;
    const t = active ? Math.min(1, active.elapsed / active.duration) : 0;
    const angle = active ? (t * t * (3 - 2 * t) * active.move.direction * Math.PI) / 2 : 0;
    const rotation = active
      ? [mat4.rotationX, mat4.rotationY, mat4.rotationZ][active.move.axis]!(angle)
      : null;
    const transforms = new Map<number, Mat4>();
    for (const p of this.session.model.cubies) {
      let m = this.orientation(p);
      if (active && rotation && p.position[active.move.axis] === active.move.layer)
        m = mat4.multiply(rotation, m);
      transforms.set(p.id, m);
    }
    for (const v of this.visuals) v.transform.setMatrix(mat4.multiply(transforms.get(v.cubie.id)!, v.local));
  }
  private point(event: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [event.clientX - r.left, event.clientY - r.top];
  }
  private readonly pointerDown = (e: PointerEvent): void => {
    if (this.gesture || e.isPrimary === false || e.button > 0) return;
    const [x, y] = this.point(e);
    if (!contains(cubeLayout(this.width, this.height).stage, x, y)) return;
    this.gesture = {
      id: e.pointerId,
      x,
      y,
      lastX: x,
      lastY: y,
      pick: !this.home && !this.session.busy ? this.pick(x, y) : null,
    };
    this.canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  private readonly pointerMove = (e: PointerEvent): void => {
    const g = this.gesture;
    if (!g || g.id !== e.pointerId) return;
    const [x, y] = this.point(e);
    if (!g.pick) {
      this.orbit.theta -= (x - g.lastX) * 0.008;
      this.orbit.phi = Math.max(0.15, Math.min(Math.PI - 0.15, this.orbit.phi + (y - g.lastY) * 0.008));
      this.resize();
    }
    g.lastX = x;
    g.lastY = y;
    e.preventDefault();
  };
  private readonly pointerUp = (e: PointerEvent): void => {
    const g = this.gesture;
    if (!g || g.id !== e.pointerId) return;
    const [x, y] = this.point(e);
    if (g.pick && !this.session.busy && Math.hypot(x - g.x, y - g.y) > 18) {
      // Project the two legal face tangents; the signed best match selects the slice.
      let best = -1,
        chosen: { axis: Axis; direction: 1 | -1 } | null = null;
      const p = g.pick.point,
        normal = g.pick.normal,
        from = this.project(p),
        dx = x - g.x,
        dy = y - g.y;
      for (const axis of [0, 1, 2] as Axis[]) {
        if (Math.abs(normal[axis]) > 0.5) continue;
        const unit: Vec = [0, 0, 0];
        unit[axis] = 1;
        const tangent = vec3.cross(unit, normal);
        const to = this.project([p[0] + tangent[0]!, p[1] + tangent[1]!, p[2] + tangent[2]!]);
        const sx = to[0] - from[0],
          sy = to[1] - from[1],
          length = Math.hypot(sx, sy);
        if (length < 1) continue;
        const dot = (dx * sx + dy * sy) / length,
          score = Math.abs(dot);
        if (score > best) {
          best = score;
          chosen = { axis, direction: dot > 0 ? 1 : -1 };
        }
      }
      if (chosen) {
        this.axis = chosen.axis;
        this.layer = g.pick.cubie.position[chosen.axis];
        this.session.turn({ ...chosen, layer: this.layer });
      }
    }
    this.cancelInteraction();
  };
  private readonly pointerCancel = (e: PointerEvent): void => {
    if (this.gesture?.id === e.pointerId) this.cancelInteraction();
  };
  private project(v: Vec): [number, number] {
    const p = vec3.transformMat4(v, this.viewProjection);
    return [((p[0]! + 1) * this.width) / 2, ((1 - p[1]!) * this.height) / 2];
  }
  private pick(x: number, y: number): Pick | null {
    const inv = mat4.inverse(this.viewProjection),
      origin = vec3.transformMat4([(x / this.width) * 2 - 1, 1 - (y / this.height) * 2, 0], inv),
      end = vec3.transformMat4([(x / this.width) * 2 - 1, 1 - (y / this.height) * 2, 1], inv);
    const direction = vec3.normalize(vec3.subtract(end, origin));
    let best = Infinity,
      result: Pick | null = null;
    for (const cubie of this.session.model.cubies) {
      const center = transform(cubie.basis, cubie.center),
        size = transform(cubie.basis, cubie.size).map(Math.abs);
      let near = -Infinity,
        far = Infinity,
        axis: Axis = 0,
        sign = 1;
      for (const a of [0, 1, 2] as Axis[]) {
        const low = center[a]! - size[a]! / 2,
          high = center[a]! + size[a]! / 2,
          d = direction[a]!,
          o = origin[a]!;
        if (Math.abs(d) < 1e-8) {
          if (o < low || o > high) {
            far = -Infinity;
            break;
          }
          continue;
        }
        let t1 = (low - o) / d,
          t2 = (high - o) / d;
        const s = d > 0 ? -1 : 1;
        if (t1 > t2) [t1, t2] = [t2, t1];
        if (t1 > near) {
          near = t1;
          axis = a;
          sign = s;
        }
        far = Math.min(far, t2);
      }
      if (near >= 0 && near <= far && near < best) {
        best = near;
        const normal: Vec = [0, 0, 0];
        normal[axis] = sign;
        result = { cubie, normal, point: origin.map((v, a) => v + direction[a]! * near) as unknown as Vec };
      }
    }
    return result;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelInteraction();
    this.engine.off('update', this.frame);
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerup', this.pointerUp);
    this.canvas.removeEventListener('pointercancel', this.pointerCancel);
    this.world.destroy();
    this.visuals = [];
    this.geometries.clear();
  }
}
