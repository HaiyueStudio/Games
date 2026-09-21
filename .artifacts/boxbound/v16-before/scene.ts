import {
  HaiyueEngine,
  World,
  Entity,
  Camera3D,
  SphericalTransform3D,
  CartesianTransform3D,
  Mesh3D,
  DirectionalLight,
  EnvironmentLight,
  PbrMaterial,
} from '@haiyue/engine';
import {
  createRoundedBox3D,
  createCylinder3D,
  type Geometry3D,
} from '@haiyue/engine/geometry';
import { Render3DSystem } from '@haiyue/engine/systems';
import {
  RenderIntegration,
  getEngineGPUResourceTracker,
} from '@haiyue/engine/experimental';
import { mat4 } from 'wgpu-matrix';
import {
  type BoxTransfer,
  type GateRecoil,
  type State,
  type Vec,
  eq,
  platePressed,
  gateOpen,
  gatePowered,
  outerExitBarriers,
  entrances,
  boxColor,
  goalColor,
} from './model';
import {
  wallPieces,
  boxTravel,
  boxTravelPose,
  BOX_TRANSFER_MS,
  type BoxTravel,
  recoilPose,
  RECOIL_MS,
  GATE_RECOIL_DELAY_MS,
  movementDuration,
  movementPose,
  celebrationPose,
  CELEBRATION_MS,
  PORTAL_MS,
  jumpPose,
  portalPose,
} from './visuals';
import { outerContext } from './outer-context';
import { DecorationType, type DecorationKind } from './decorations';

type Color = [number, number, number, number];
const COLORS: Record<string, Color> = {
  wood: [0.48, 0.32, 0.2, 1],
  blue: [0.2, 0.53, 0.87, 1],
  coral: [0.93, 0.36, 0.31, 1],
  iron: [0.31, 0.39, 0.43, 1],
  stone: [0.66, 0.7, 0.72, 1],
  stoneTop: [0.82, 0.84, 0.82, 1],
  stud: [0.75, 0.78, 0.76, 1],
  mortar: [0.34, 0.42, 0.45, 1],
  floor: [0.86, 0.89, 0.78, 1],
  tile: [0.97, 0.95, 0.85, 1],
  edge: [0.51, 0.69, 0.59, 1],
  wall: [0.57, 0.73, 0.65, 1],
  mint: [0.3, 0.7, 0.59, 1],
  gold: [0.91, 0.62, 0.26, 1],
  crate: [0.96, 0.7, 0.42, 1],
  cream: [1, 0.94, 0.77, 1],
  ink: [0.16, 0.28, 0.25, 1],
  redFriend: [0.91, 0.16, 0.22, 1],
  rose: [0.97, 0.52, 0.43, 1],
  purple: [0.68, 0.59, 0.82, 1],
  white: [1, 0.99, 0.92, 1],
  shadow: [0.66, 0.74, 0.64, 1],
  leaf: [0.37, 0.61, 0.46, 1],
};
interface Part {
  entity: Entity;
  position: Vec;
  yaw: number;
  mesh: Mesh3D;
  color: string;
  expression?: 'smile' | 'laugh';
  t: CartesianTransform3D;
  offset: Vec;
  scale: Vec;
}
interface Actor {
  id: string;
  parts: Part[];
  from: Vec;
  to: Vec;
  player: boolean;
  travel?: BoxTravel | undefined;
  center?: number;
  settled?: boolean;
}
export class BoxboundScene {
  readonly world = new World('Boxbound');
  readonly camera = new Camera3D({
    type: 'perspective',
    fov: 0.65,
    near: 0.1,
    far: 600,
  });
  readonly orbit = new SphericalTransform3D({
    radius: 24,
    theta: 0.54,
    phi: 0.7,
    target: [0, 0, 0],
  });
  private createdParts = 0;
  private destroyedParts = 0;
  private rebuilds = 0;
  private transformWrites = 0;
  private partPool: Part[] = [];
  private partCursor = 0;
  private labelCursor = 0;
  private labelsDirty = true;
  private disposed = false;
  private needsFrame = true;
  private wasAnimating = false;
  private renderedHome = true;
  private renderedWidth = 0;
  private renderedHeight = 0;
  private targetVersion = -1;
  invalidate = (): void => {
    this.needsFrame = true;
  };
  private cameraPose: number[] = [];
  private viewProjection = mat4.identity();
  private inverseView = mat4.identity();
  private renderer!: Render3DSystem;
  resourceSnapshot() {
    const gpu = getEngineGPUResourceTracker(this.engine);
    return {
      entities: this.world.entities.size,
      parts: this.entities.length,
      createdParts: this.createdParts,
      destroyedParts: this.destroyedParts,
      rebuilds: this.rebuilds,
      transformWrites: this.transformWrites,
      geometries: this.geometries.size,
      materials: this.materials.size,
      labels: this.labelRoot.childElementCount,
      sceneExtractions: this.renderer.sceneExtractionCount,
      gpu: gpu?.getUsage(),
      gpuTypes: gpu?.getDebugSnapshot().byType,
    };
  }
  private geometries = new Map<string, Geometry3D>();
  private materials = new Map<string, PbrMaterial>();
  private entities: Entity[] = [];
  private actors: Actor[] = [];
  private mechanisms: {
    id: string;
    kind: 'button' | 'gate';
    parts: Part[];
    from: number;
    to: number;
    active: boolean;
    powered: boolean;
  }[] = [];
  private recoil: GateRecoil | undefined;
  private current = '';
  private state: State | null = null;
  private start = 0;
  private duration = 0;
  get moving(): boolean {
    return this.duration > 0 && this.clock() - this.start < this.duration;
  }
  private celebrateStart = -Infinity;
  private jumpStart = -Infinity;
  private portal:
    | {
        state: State;
        previous: State;
        transfers: BoxTransfer[];
        started: number;
        focus: Vec;
        entering: boolean;
        switched: boolean;
        restoring: boolean;
        reset: boolean;
      }
    | undefined;
  get transitioning(): boolean {
    return !!this.portal;
  }
  get airborne(): boolean {
    return jumpPose(this.clock() - this.jumpStart).active;
  }
  jumpInPlace(): void {
    this.jumpStart = this.clock();
    this.invalidate();
  }
  cancelMotion(): void {
    this.invalidate();
    this.portal = undefined;
    this.recoil = undefined;
    this.duration = 0;
    this.jumpStart = -Infinity;
    this.celebrateStart = -Infinity;
    this.canvas.style.opacity = '1';
    this.labelRoot.style.opacity = '1';
  }
  private walls: { min: Vec; max: Vec; parts: Part[]; faded: boolean }[] = [];
  private mouthSmile: Part[] = [];
  private mouthLaugh: Part[] = [];
  private doorCount = 0;
  readonly diagnostics = {
    wallRuns: 0,
    moving: false,
    playerPosition: [0, 0, 0] as Vec,
    motionPhase: 'landed',
    boxPositions: [] as { id: string; position: Vec }[],
    boxTransfers: [] as {
      id: string;
      position: Vec;
      scale: number;
      opacity: number;
      phase: string;
    }[],
    roundedWallPieces: 0,
    outerBarriers: [] as ReturnType<typeof outerExitBarriers>,
    outerContext: null as ReturnType<typeof outerContext>,
    decorations: [] as { id: string; type: DecorationKind; pos: Vec }[],
    mechanisms: [] as {
      id: string;
      kind: string;
      active: boolean;
      powered: boolean;
      offset: number;
    }[],
    studs: 0,
    wallHeight: 0,
    jumping: false,
    transitioning: false,
    portalPhase: 0,
    cameraRadius: 0,
    displayedRoom: '',
    fadedWalls: 0,
    doorCount: 0,
    celebrating: false,
    laugh: false,
    lift: 0,
    yaw: 0,
  };
  get celebrating(): boolean {
    return this.clock() - this.celebrateStart < CELEBRATION_MS;
  }

  private labels: { node: HTMLDivElement; pos: Vec }[] = [];
  home = true;
  mood = 'smile';
  constructor(
    readonly engine: HaiyueEngine,
    private canvas: HTMLCanvasElement,
    private labelRoot: HTMLElement,
    private clock: () => number = () => performance.now(),
  ) {
    const cam = new Entity('Camera')
      .addComponent(this.camera)
      .addComponent(this.orbit);
    this.world.addEntity(cam);
    this.world.addEntity(
      new Entity('Sun').addComponent(
        new DirectionalLight({
          direction: [-0.5, -1, -0.4],
          color: [1, 0.95, 0.83],
          intensity: 2.2,
        }),
      ),
    );
    this.world.addEntity(
      new Entity('Sky').addComponent(
        new EnvironmentLight({
          intensity: 1,
          diffuseColor: [0.81, 0.9, 0.86],
          specularColor: [1, 1, 1],
        }),
      ),
    );
    this.world.addEntity(
      new Entity('Fill').addComponent(
        new DirectionalLight({
          direction: [0.8, -0.3, 0.8],
          color: [0.69, 0.82, 1],
          intensity: 0.5,
        }),
      ),
    );
    this.world.addSystem(
      (this.renderer = new Render3DSystem(engine, cam, {
        priority: 20,
        loadOp: 'clear',
        renderProfile: 'simple',
        toneMapping: 'none',
      })),
    );
    const integration = new RenderIntegration(engine, {
      label: 'Boxbound.render',
    });
    this.world.addRuntimeIntegration(integration);
    integration.registerAll(this.world, () => ({ pass: 'shared' }));
    engine.on('update', this.frame);
    engine.on('resize', this.invalidate);
    engine.on('device-restored', this.invalidate);
  }
  private part(
    pos: Vec,
    size: Vec,
    color: string,
    radius = 0.08,
    cylinder: boolean | 'cone' = false,
  ): Part {
    const k = size.join() + ':' + radius + ':' + cylinder;
    let g = this.geometries.get(k);
    if (!g) {
      g = cylinder
        ? createCylinder3D({
            radiusTop: cylinder === 'cone' ? 0 : size[0] / 2,
            radiusBottom: size[0] / 2,
            height: size[1],
            radialSegments: cylinder === 'cone' ? 8 : 32,
          })
        : createRoundedBox3D({
            width: size[0],
            height: size[1],
            depth: size[2],
            radius: Math.min(radius, ...size.map((v) => v / 2)),
            segments: 3,
          });
      this.geometries.set(k, g);
    }
    const m = this.material(color);
    let part = this.partPool[this.partCursor++];
    if (!part) {
      const t = new CartesianTransform3D({ position: pos });
      const mesh = new Mesh3D(g, m);
      const entity = new Entity('Boxbound part')
        .addComponent(t)
        .addComponent(mesh);
      this.world.addEntity(entity);
      this.entities.push(entity);
      part = {
        entity, t, mesh, color,
        position: [...pos],
        yaw: 0,
        offset: [0, 0, 0],
        scale: [1, 1, 1],
      };
      this.partPool.push(part);
      this.createdParts++;
    } else {
      part.mesh.geometry = g;
      part.mesh.material = m;
      part.color = color;
      delete part.expression;
      this.place(part, ...pos);
      this.rotate(part, 0);
      this.resize(part, 1, 1, 1);
    }
    return part;
  }
  private place(part: Part, x: number, y: number, z: number): void {
    if (part.position[0] === x && part.position[1] === y && part.position[2] === z)
      return;
    part.position[0] = x;
    part.position[1] = y;
    part.position[2] = z;
    part.t.setPosition(x, y, z);
    this.transformWrites++;
  }
  private rotate(part: Part, yaw: number): void {
    if (part.yaw === yaw) return;
    part.yaw = yaw;
    part.t.setRotation(0, yaw, 0);
    this.transformWrites++;
  }
  private resize(part: Part, x: number, y: number, z: number): void {
    if (part.scale[0] === x && part.scale[1] === y && part.scale[2] === z)
      return;
    part.scale[0] = x;
    part.scale[1] = y;
    part.scale[2] = z;
    part.t.setScale(x, y, z);
    this.transformWrites++;
  }
  private finishParts(): void {
    // Retain only live render objects; a smaller room cannot keep the island alive.
    for (let i = this.partCursor; i < this.partPool.length; i++) {
      this.partPool[i]!.entity.destroy();
      this.destroyedParts++;
    }
    this.partPool.length = this.partCursor;
    this.entities.length = this.partCursor;
    for (let i = this.labelCursor; i < this.labels.length; i++)
      this.labels[i]!.node.remove();
    this.labels.length = this.labelCursor;
    this.labelsDirty = true;
    // Shared CPU assets survive room switches, with a finite inactive-cache budget.
    const usedGeometry = new Set(this.partPool.map((p) => p.mesh.geometry));
    const usedMaterial = new Set(this.partPool.map((p) => p.mesh.material));
    for (const [key, geometry] of this.geometries) {
      if (this.geometries.size <= 256) break;
      if (!usedGeometry.has(geometry)) this.geometries.delete(key);
    }
    for (const [key, material] of this.materials) {
      if (this.materials.size <= 96) break;
      if (!usedMaterial.has(material)) this.materials.delete(key);
    }
  }
  private material(color: string, transfer = ''): PbrMaterial {
    const key = color + (transfer ? ':transfer:' + transfer : '');
    let m = this.materials.get(key);
    if (!m) {
      const c = COLORS[color]!;
      m = new PbrMaterial({
        baseColor: [c[0], c[1], c[2], 1],
        roughness: 0.82,
        metallic: color === 'iron' ? 0.7 : 0,
        alphaMode: transfer ? 'blend' : 'opaque',
      });
      this.materials.set(key, m);
    }
    return m;
  }
  private at(p: Vec): Vec {
    const n = this.state!.rooms[this.state!.player.room]!.size;
    return [p[0] - (n - 1) / 2, p[1], p[2] - (n - 1) / 2];
  }
  show(
    state: State,
    previous?: State,
    jump = false,
    transfers: BoxTransfer[] = [],
    restoring = false,
    reset = false,
    recoil?: GateRecoil,
  ): void {
    this.invalidate();
    this.recoil = recoil;
    if (
      previous &&
      (reset ||
        state.player.room !== previous.player.room ||
        state.player.route.length !== previous.player.route.length)
    ) {
      this.cancelMotion();
      const entering = state.player.route.length > previous.player.route.length;
      const frame = entering
        ? state.player.route.at(-1)
        : previous.player.route.at(-1);
      const box = previous.boxes.find((b) => b.id === frame?.box);
      const focus: Vec =
        entering && box
          ? this.at([
              box.pos[0] + (box.size - 1) / 2,
              box.pos[1] + box.size * 0.45,
              box.pos[2] + (box.size - 1) / 2,
            ])
          : this.at(previous.player.pos);
      const sourceTransfer = transfers.some(
        (t) =>
          t.fromRoom === previous.player.room ||
          t.toRoom === previous.player.room,
      );
      if (sourceTransfer) {
        this.rebuild(
          { ...state, player: previous.player },
          previous,
          false,
          transfers,
        );
        this.measureDuration();
      }
      this.portal = {
        state,
        previous,
        transfers,
        started: this.clock() + (sourceTransfer ? BOX_TRANSFER_MS : 0),
        focus,
        entering,
        switched: false,
        restoring,
        reset,
      };
      return;
    }
    if (!previous) this.cancelMotion();
    const takeoff = jump ? jumpPose(this.clock() - this.jumpStart).lift : 0;
    if (jump) this.jumpStart = -Infinity;
    this.rebuild(state, previous, jump, transfers);
    const player = this.actors.find((a) => a.player);
    if (jump && player) {
      player.from[1] += takeoff;
    }
    this.measureDuration();
    if (restoring) this.celebrateStart = -Infinity;
    if (Number.isFinite(this.celebrateStart))
      this.celebrateStart += this.duration;
  }
  private measureDuration(): void {
    this.duration = Math.max(
      this.recoil ? RECOIL_MS : 0,
      ...this.mechanisms.map((m) => (m.from === m.to ? 0 : 320)),
      ...this.actors.map((a) =>
        a.travel
          ? BOX_TRANSFER_MS
          : movementDuration(a.from, a.to, a.player && this.jump),
      ),
    );
  }
  private rebuild(
    state: State,
    previous?: State,
    jump = false,
    transfers: BoxTransfer[] = [],
  ): void {
    this.state = state;
    this.celebrateStart =
      previous && state.completed.some((n) => !previous.completed.includes(n))
        ? this.clock()
        : -Infinity;
    this.mouthSmile = [];
    this.mouthLaugh = [];
    this.walls = [];
    this.doorCount = 0;
    this.start = this.clock();
    this.rebuilds++;
    this.partCursor = 0;
    this.labelCursor = 0;
    this.actors = [];
    this.mechanisms = [];
    const r = state.rooms[state.player.room]!,
      n = r.size,
      world = r.id === 'world';
    this.current = r.id;
    this.part([0, -0.47, 0], [n + 0.3, 0.8, n + 0.3], 'edge', 0.25);
    this.part([0, -0.12, 0], [n + 0.2, 0.24, n + 0.2], 'floor', 0.15);
    const tiles = r.floorTiles ?? Array.from({ length: n * n }, (_, i) =>
      [Math.floor(i / n), 0, i % n] as Vec);
    for (const [x, y, z] of tiles)
      this.part(
        this.at([x, y + 0.015, z]),
        [0.95, 0.06, 0.95],
        world ? 'tile' : (x + z) % 2 ? 'tile' : 'floor',
        0.06,
      );
    // Walls retain their actual collision height. Connected voxels share solid runs.
    for (const run of wallPieces(r)) {
      const min = this.at(run.min),
        max = this.at(run.max);
      const center = min.map((v, i) => (v + max[i]!) / 2) as Vec;
      const size = min.map((v, i) => max[i]! - v) as Vec;
      const wall = this.part(center, size, 'stone', 0.085);
      const cap = this.part(
        [center[0], max[1] - 0.04, center[2]],
        [size[0], 0.165, size[2]],
        'stoneTop',
        0.08,
      );
      this.walls.push({ min, max, parts: [wall, cap], faded: false });
    }
    this.diagnostics.roundedWallPieces = this.walls.length;
    this.diagnostics.studs = 0;
    this.diagnostics.wallHeight = Math.max(0, ...r.walls.map((p) => p[1] + 1));
    for (const wall of r.barriers ?? []) {
      for (const dx of [-0.25, 0, 0.25])
        for (const dz of [-0.25, 0, 0.25]) {
          this.part(
            this.at([wall[0] + dx, wall[1] + 1.085, wall[2] + dz]),
            [0.13, 0.115, 0.13],
            'stud',
            0.057,
          );
          this.diagnostics.studs++;
        }
    }
    // Outside obstructions sit beyond the boundary tile; the inner room stays unchanged.
    this.diagnostics.outerBarriers = outerExitBarriers(state);
    this.diagnostics.outerContext = outerContext(state);
    this.drawOuterContext();
    const mechanismPart = (
      parts: Part[],
      pos: Vec,
      size: Vec,
      color: string,
      round = false,
    ) => {
      const part = this.part(this.at(pos), size, color, 0.025, round);
      part.offset = this.at(pos);
      parts.push(part);
    };
    for (const plate of r.buttons ?? []) {
      const pressed = platePressed(state, r.id, plate);
      const wasPressed = previous
        ? platePressed(previous, r.id, plate)
        : pressed;
      const [x, y, z] = plate.pos,
        parts: Part[] = [];
      this.part(
        this.at([x, y + 0.044, z]),
        [0.76, 0.024, 0.76],
        'iron',
        0.01,
        true,
      );
      this.part(
        this.at([x, y + 0.055, z]),
        [0.67, 0.015, 0.67],
        'gold',
        0.01,
        true,
      );
      mechanismPart(
        parts,
        [x, y + 0.092, z],
        [0.56, 0.045, 0.56],
        pressed ? 'mint' : 'gold',
        true,
      );
      mechanismPart(parts, [x, y + 0.117, z], [0.2, 0.012, 0.2], 'cream', true);
      this.mechanisms.push({
        id: plate.id,
        kind: 'button',
        parts,
        from: wasPressed ? -0.04 : 0,
        to: pressed ? -0.04 : 0,
        active: pressed,
        powered: pressed,
      });
    }
    for (const gate of r.gates ?? []) {
      const open = gateOpen(state, r.id, gate),
        powered = gatePowered(state, r.id, gate);
      const wasOpen = previous ? gateOpen(previous, r.id, gate) : open;
      const [x, y, z] = gate.pos,
        across = gate.axis === 'x';
      const pos = (u: number, height: number): Vec => [
        x + (across ? u : 0),
        y + height,
        z + (across ? 0 : u),
      ];
      for (const sign of [-1, 1]) {
        this.part(
          this.at(pos(sign * 0.57, 0.54)),
          [0.12, 1.08, 0.12],
          'iron',
          0.025,
        );
        this.part(
          this.at(pos(sign * 0.57, 1.105)),
          [0.17, 0.09, 0.17],
          powered ? 'mint' : 'gold',
          0.035,
        );
      }
      this.part(
        this.at(pos(0, 0.047)),
        across ? [1.03, 0.025, 0.22] : [0.22, 0.025, 1.03],
        'iron',
        0.01,
      );
      const parts: Part[] = [];
      for (const u of [-0.4, -0.2, 0, 0.2, 0.4])
        mechanismPart(parts, pos(u, 0.58), [0.055, 1.02, 0.055], 'iron');
      for (const h of [0.23, 0.92])
        mechanismPart(
          parts,
          pos(0, h),
          across ? [0.95, 0.07, 0.075] : [0.075, 0.07, 0.95],
          'iron',
        );
      this.mechanisms.push({
        id: gate.id,
        kind: 'gate',
        parts,
        from: wasOpen ? -1.18 : 0,
        to: open ? -1.18 : 0,
        active: open,
        powered,
      });
    }
    for (let i = 0; i < r.goals.length; i++)
      this.marker(r.goals[i]!, r.anyGoalColor ? 'white' : goalColor(r, i), false);
    if (r.home) this.marker(r.home, 'mint', true);
    this.diagnostics.decorations = (r.decorations ?? []).map((d) => ({ ...d, pos: [...d.pos] }));
    for (const d of r.decorations ?? []) this.decoration(d.pos, d.type);
    const visibleBoxes = state.boxes.filter((b) => b.room === r.id);
    for (const transfer of transfers) {
      if (
        previous &&
        transfer.fromRoom === r.id &&
        !visibleBoxes.some((b) => b.id === transfer.box)
      )
        visibleBoxes.push(previous.boxes.find((b) => b.id === transfer.box)!);
    }
    for (const b of visibleBoxes) {
      const old = previous?.boxes.find((v) => v.id === b.id && v.room === r.id);
      const transfer = transfers.find((t) => t.box === b.id);
      const travel =
        transfer && previous
          ? boxTravel(transfer, r.id, previous, state)
          : undefined;
      if (travel) {
        travel.from = this.at(travel.from);
        travel.to = this.at(travel.to);
      }
      const p = this.at(b.pos),
        body: Part[] = [];
      const unit = b.size;
      const self = b.inside === r.id;
      const complete =
        !!b.inside && state.completed.includes(state.rooms[b.inside]!.level);
      const color = b.fixed ? (self ? 'purple' : b.portal ? boxColor(b) : 'stone') : boxColor(b);
      const addPart = (o: Vec, size: Vec, c: string, rad = 0.09) => {
        const part = this.part(
          [p[0] + o[0], p[1] + o[1], p[2] + o[2]],
          size,
          c,
          rad,
        );
        part.offset = o;
        if (travel) part.mesh.material = this.material(c, b.id);
        body.push(part);
      };
      const center = (unit - 1) / 2;
      if (b.inside) {
        // An open shell: four jambs and roof, with an actual recess on every allowed side.
        const doors = b.portal ? ([[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]] as Vec[]).map((direction) => ({ direction, height: 0, width: 0.82 })) : entrances(state.rooms[b.inside]!);
        for (const x of [-0.32, 0.32])
          for (const z of [-0.32, 0.32])
            addPart(
              [center + x * unit, 0.46 * unit, center + z * unit],
              [0.23 * unit, 0.86 * unit, 0.23 * unit],
              color,
              0.045 * unit,
            );
        addPart(
          [center, 0.86 * unit, center],
          [0.9 * unit, 0.16 * unit, 0.9 * unit],
          color,
          0.05 * unit,
        );
        addPart(
          [center, 0.09 * unit, center],
          [0.86 * unit, 0.13 * unit, 0.86 * unit],
          b.fixed ? 'mortar' : color,
          0.025 * unit,
        );
        addPart(
          [center, 0.4 * unit, center],
          [0.32 * unit, 0.46 * unit, 0.32 * unit],
          'ink',
          0.025 * unit,
        );
        for (const direction of [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 0, 1],
          [0, 0, -1],
        ] as Vec[]) {
          const door = doors.find((d) => eq(d.direction, direction));
          const dx = direction[0],
            dz = direction[2];
          if (!door) {
            addPart(
              [
                center + dx * 0.43 * unit,
                0.45 * unit,
                center + dz * 0.43 * unit,
              ],
              dx
                ? [0.12 * unit, 0.7 * unit, 0.65 * unit]
                : [0.65 * unit, 0.7 * unit, 0.12 * unit],
              color,
              0.025 * unit,
            );
            continue;
          }
          this.doorCount++;
          const inset = ((1 - door.width) * 0.41) / 2;
          if (inset > 0)
            for (const sign of [-1, 1]) {
              const across = sign * (0.205 - inset / 2);
              addPart(
                [
                  center + dx * 0.43 * unit + dz * across * unit,
                  0.46 * unit,
                  center + dz * 0.43 * unit + dx * across * unit,
                ],
                dx
                  ? [0.12 * unit, 0.7 * unit, inset * unit]
                  : [inset * unit, 0.7 * unit, 0.12 * unit],
                color,
                0.006,
              );
            }
          const y = 0.045;
          addPart(
            [center + dx * 0.435 * unit, y * unit, center + dz * 0.435 * unit],
            dx
              ? [0.13 * unit, 0.1 * unit, 0.4 * unit]
              : [0.4 * unit, 0.1 * unit, 0.13 * unit],
            'stoneTop',
            0.015 * unit,
          );
          addPart(
            [center + dx * 0.46 * unit, 0.72 * unit, center + dz * 0.46 * unit],
            dx
              ? [0.04 * unit, 0.06 * unit, 0.45 * unit]
              : [0.45 * unit, 0.06 * unit, 0.04 * unit],
            complete ? 'gold' : self ? 'purple' : b.fixed ? 'mint' : color,
            0.01 * unit,
          );
        }
        if (b.fixed) {
          addPart(
            [center, 0.045 * unit, center],
            [0.97 * unit, 0.09 * unit, 0.97 * unit],
            'mortar',
            0.025 * unit,
          );
          for (const x of [-0.36, 0.36])
            for (const z of [-0.36, 0.36])
              addPart(
                [center + x * unit, 0.15 * unit, center + z * unit],
                [0.1 * unit, 0.055 * unit, 0.1 * unit],
                'stoneTop',
                0.02 * unit,
              );
        }
        addPart(
          [center, 0.965 * unit, center],
          [0.68 * unit, 0.055 * unit, 0.68 * unit],
          'ink',
          0.025 * unit,
        );
        addPart(
          [center, 0.995 * unit, center],
          [0.6 * unit, 0.025 * unit, 0.6 * unit],
          'floor',
          0.01 * unit,
        );
        const inner = state.rooms[b.inside]!,
          step = (0.58 * unit) / inner.size;
        const preview = (pos: Vec): Vec => [
          center + (pos[0] - (inner.size - 1) / 2) * step,
          unit + 0.006 + Math.min(pos[1] * step, 0.018),
          center + (pos[2] - (inner.size - 1) / 2) * step,
        ];
        // The lid is a low-relief map, not a second tower on top of the cubic shell.
        const outline = new Map<string, number>();
        for (const w of inner.walls)
          outline.set(
            `${w[0]},${w[2]}`,
            Math.max(outline.get(`${w[0]},${w[2]}`) ?? 0, w[1] + 1),
          );
        for (const [key, height] of outline) {
          const [x, z] = key.split(',').map(Number);
          const h = Math.min(0.03, height === 1 ? 0.025 * unit : 0.075 * unit);
          const at = preview([x!, 0, z!]);
          at[1] += h / 2;
          addPart(at, [step, h, step], 'stoneTop', 0.002);
        }
        for (let i = 0; i < inner.goals.length; i++)
          addPart(
            preview(inner.goals[i]!),
            [step * 0.75, 0.012, step * 0.75],
            inner.anyGoalColor ? 'white' : goalColor(inner, i),
            0.002,
          );
        for (const decoration of inner.decorations ?? [])
          addPart(preview(decoration.pos), [step * 0.75, 0.02, step * 0.75],
            decoration.type === DecorationType.Rock ? 'stoneTop' : 'leaf', 0.004);
        for (const child of state.boxes.filter((v) => v.room === inner.id))
          addPart(
            preview(child.pos),
            [step * 0.75, Math.min(0.024, step * 0.8), step * 0.75],
            child.fixed ? 'stone' : boxColor(child),
            0.008,
          );
        if (world || b.portal) {
          const entry = this.labels[this.labelCursor++] ?? {
            node: document.createElement('div'),
            pos: [0, 0, 0] as Vec,
          };
          const label = entry.node;
          label.className = 'map-label' + (complete ? ' done' : '');
          label.textContent =
            (b.label ?? String(state.rooms[b.inside]!.level).padStart(2, '0')) +
            (complete ? ' ✓' : '');
          if (!label.parentNode) {
            this.labelRoot.append(label);
            this.labels.push(entry);
          }
          entry.pos = [p[0], 1.35, p[2]];
        }
      } else {
        addPart(
          [center, 0.46 * unit, center],
          [0.86 * unit, 0.86 * unit, 0.86 * unit],
          color,
          0.1 * unit,
        );
        addPart(
          [center, 0.9 * unit, center],
          [0.25 * unit, 0.045 * unit, 0.83 * unit],
          'cream',
          0.015 * unit,
        );
        for (const d of [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 0, 1],
          [0, 0, -1],
        ] as Vec[]) {
          const dx = d[0],
            dz = d[2];
          addPart(
            [
              center + dx * 0.445 * unit,
              0.46 * unit,
              center + dz * 0.445 * unit,
            ],
            dx
              ? [0.025 * unit, 0.36 * unit, 0.36 * unit]
              : [0.36 * unit, 0.36 * unit, 0.025 * unit],
            'cream',
            0.04 * unit,
          );
          const bars = color === 'coral' ? 2 : color === 'gold' ? 3 : 1;
          for (let k = 0; k < bars; k++)
            addPart(
              [
                center +
                  dx * 0.464 * unit +
                  dz * (k - (bars - 1) / 2) * 0.075 * unit,
                0.46 * unit,
                center +
                  dz * 0.464 * unit +
                  dx * (k - (bars - 1) / 2) * 0.075 * unit,
              ],
              dx
                ? [0.026 * unit, 0.18 * unit, 0.045 * unit]
                : [0.045 * unit, 0.18 * unit, 0.026 * unit],
              color,
              0.009 * unit,
            );
        }
      }
      this.actors.push({
        id: b.id,
        parts: body,
        from: old ? this.at(old.pos) : p,
        to: p,
        player: false,
        travel,
        center,
      });
    }
    const p = this.at(state.player.pos),
      parts: Part[] = [];
    const face = (offset: Vec, size: Vec, c: string, rad = 0.04) => {
      const v = this.part(
        [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]],
        size,
        c,
        rad,
      );
      v.offset = offset;
      parts.push(v);
      return v;
    };
    face([0, 0.44, 0], [0.72, 0.72, 0.72], 'cream', 0.16);
    face(
      [-0.15, 0.51, 0.355],
      [0.067, this.mood === 'tired' ? 0.035 : 0.11, 0.035],
      'ink',
      0.025,
    );
    face(
      [0.15, 0.51, 0.355],
      [
        0.067,
        this.mood === 'confused' ? 0.14 : this.mood === 'tired' ? 0.035 : 0.11,
        0.035,
      ],
      'ink',
      0.025,
    );
    face([-0.235, 0.41, 0.351], [0.095, 0.045, 0.025], 'rose', 0.02);
    face([0.235, 0.41, 0.351], [0.095, 0.045, 0.025], 'rose', 0.02);
    for (let i = -2; i <= 2; i++)
      this.mouthSmile.push(
        face(
          [
            i * 0.027,
            0.355 + (this.mood === 'smile' ? i * i * 0.009 : 0),
            0.363,
          ],
          [0.036, 0.029, 0.025],
          'ink',
          0.013,
        ),
      );
    this.mouthLaugh.push(
      face([0, 0.36, 0.367], [0.23, 0.18, 0.035], 'ink', 0.055),
    );
    this.mouthLaugh.push(
      face([0, 0.41, 0.39], [0.16, 0.035, 0.018], 'white', 0.008),
    );
    this.mouthLaugh.push(
      face([0, 0.305, 0.391], [0.105, 0.035, 0.018], 'coral', 0.01),
    );
    this.actors.push({
      id: 'player',
      parts,
      from: previous?.player.room === r.id ? this.at(previous.player.pos) : p,
      to: p,
      player: true,
    });
    for (const part of this.mouthSmile) part.expression = 'smile';
    for (const part of this.mouthLaugh) part.expression = 'laugh';
    this.finishParts();
    this.jump = jump;
  }
  /** Parent geometry uses the containing box scale, with the same bounded part pool. */
  private drawOuterContext(): void {
    const context = this.diagnostics.outerContext;
    if (!context) return;
    const scale = context.scale, drawnBoxes = new Set<string>();
    for (const cell of context.cells) {
      const p = this.at(cell.center);
      const part = (offset: Vec, size: Vec, color: string, radius = 0.045, round = false) => {
        // Scale transforms, so different parent ratios share the same meshes.
        const item = this.part([p[0] + offset[0] * scale, p[1] + offset[1] * scale, p[2] + offset[2] * scale], size, color, radius, round);
        this.resize(item, scale, scale, scale);
        return item;
      };
      part([0, -0.29, 0], [0.98, 0.35, 0.98], 'edge', 0.065);
      part([0, -0.04, 0], [0.96, 0.08, 0.96], cell.paved ? 'tile' : 'floor');
      if (cell.goal || cell.home) {
        part([0, -0.025, 0], [0.6, 0.035, 0.6], cell.goal ?? 'mint');
        part([0, -0.005, 0], [0.47, 0.035, 0.47], 'floor');
      }
      if (cell.button !== undefined)
        part([0, cell.button ? 0.01 : 0.07, 0], [0.48, 0.08, 0.48], cell.button ? 'mint' : 'gold', 0.02, true);
      if (cell.wall) {
        part([0, 0.48, 0], [0.99, 0.96, 0.99], 'stone');
        part([0, 0.96, 0], [0.99, 0.14, 0.99], 'stoneTop');
        for (const dx of [-0.25, 0, 0.25]) for (const dz of [-0.25, 0, 0.25])
          part([dx, 1.085, dz], [0.13, 0.115, 0.13], 'stud', 0.057);
      }
      if (cell.decoration) {
        const cursor = this.partCursor;
        this.decoration(cell.center, cell.decoration);
        for (let i = cursor; i < this.partCursor; i++) {
          const item = this.partPool[i]!;
          this.place(item, p[0] + (item.position[0] - p[0]) * scale, item.position[1] * scale, p[2] + (item.position[2] - p[2]) * scale);
          this.resize(item, scale, scale, scale);
        }
      }
      if (cell.box && !drawnBoxes.has(cell.box.id)) {
        drawnBoxes.add(cell.box.id);
        const boxPart = (offset: Vec, size: Vec, color: string, radius = 0.045) => part(
          offset.map((v, i) => cell.box!.offset[i]! + v * cell.box!.size) as Vec,
          size.map((v) => v * cell.box!.size) as Vec, color, radius * cell.box!.size,
        );
        const c = cell.box.fixed && !cell.box.portal ? 'stone' : cell.box.color;
        boxPart([0, 0.46, 0], [0.86, 0.86, 0.86], c, 0.07);
        if (cell.box.inside) {
          boxPart([0, 0.9, 0], [0.53, 0.05, 0.53], 'floor');
          for (const sign of [-1, 1]) {
            boxPart([0, 0.23, sign * 0.436], [0.32, 0.38, 0.018], 'ink', 0.015);
            boxPart([sign * 0.436, 0.23, 0], [0.018, 0.38, 0.32], 'ink', 0.015);
          }
        } else boxPart([0, 0.9, 0], [0.17, 0.04, 0.71], 'cream');
      }
      if (cell.gate) {
        const h = cell.gate.open ? 0.03 : 0.7;
        for (const offset of [-0.28, 0, 0.28])
          part(cell.gate.axis === 'x' ? [offset, h / 2, 0] : [0, h / 2, offset], [0.045, Math.max(0.04, h), 0.045], 'iron', 0.01);
        part([0, h, 0], cell.gate.axis === 'x' ? [0.74, 0.06, 0.06] : [0.06, 0.06, 0.74], 'iron', 0.01);
      }
    }
  }
  /** Geometry and collision type come from the same numeric decoration enum. */
  private decoration(pos: Vec, type: DecorationKind): void {
    const add = (offset: Vec, size: Vec, color: string, radius = 0.08,
      shape: boolean | 'cone' = false) => this.part(
        this.at([pos[0] + offset[0], pos[1] + offset[1], pos[2] + offset[2]]),
        size, color, radius, shape,
      );
    if (type === DecorationType.RedFriend) {
      add([0, 0.44, 0], [0.76, 0.8, 0.76], 'redFriend', 0.1);
      for (const x of [-0.18, 0.18]) {
        add([x, 0.54, 0.386], [0.075, 0.1, 0.026], 'ink', 0.018);
        add([x, 0.54, -0.386], [0.075, 0.1, 0.026], 'ink', 0.018);
      }
      add([0, 0.34, 0.39], [0.14, 0.035, 0.025], 'ink', 0.012);
    } else if (type === DecorationType.Rock) {
      add([0, 0.29, 0], [0.78, 0.58, 0.68], 'stoneTop', 0.18);
      add([-0.14, 0.55, -0.04], [0.28, 0.055, 0.27], 'cream', 0.025);
    } else if (type === DecorationType.Shrub) {
      add([0, 0.3, 0], [0.7, 0.6, 0.68], 'leaf', 0.23);
      add([0.18, 0.58, 0.06], [0.43, 0.43, 0.45], 'mint', 0.2);
    } else {
      add([0, 0.42, 0], [0.24, 0.84, 0.24], 'wood', 0.025, true);
      if (type === DecorationType.RoundTree) {
        add([-0.08, 1.19, 0], [0.86, 0.98, 0.85], 'leaf', 0.36);
        add([0.18, 1.55, 0.04], [0.58, 0.65, 0.65], 'mint', 0.28);
        add([-0.25, 1.28, 0.31], [0.12, 0.13, 0.12], 'gold', 0.05);
      } else {
        add([0, 0.91, 0], [0.92, 0.91, 0.92], 'leaf', 0, 'cone');
        add([0, 1.36, 0], [0.73, 0.86, 0.73], 'mint', 0, 'cone');
        add([0, 1.76, 0], [0.5, 0.76, 0.5], 'leaf', 0, 'cone');
      }
    }
  }
  private jump = false;

  private marker(g: Vec, color: string, filled: boolean) {
    const p = this.at(g);
    if (filled) {
      this.part([p[0], p[1] + 0.07, p[2]], [0.72, 0.055, 0.72], 'white', 0.025);
      for (const dx of [-0.14, 0.14])
        this.part(
          [p[0] + dx, p[1] + 0.108, p[2] - 0.12],
          [0.065, 0.023, 0.1],
          color,
          0.01,
        );
      for (let i = -3; i <= 3; i++)
        this.part(
          [p[0] + i * 0.049, p[1] + 0.108, p[2] + 0.15 - i * i * 0.012],
          [0.06, 0.023, 0.044],
          color,
          0.01,
        );
      return;
    }
    for (const [dx, dz, w, d] of [
      [0, -0.36, 0.78, 0.065],
      [0, 0.36, 0.78, 0.065],
      [-0.36, 0, 0.065, 0.72],
      [0.36, 0, 0.065, 0.72],
    ])
      this.part(
        [p[0] + dx!, p[1] + 0.075, p[2] + dz!],
        [w!, 0.055, d!],
        color,
        0.02,
      );
  }
  private frame = ({
    detail: { time, delta },
  }: {
    detail: { time: number; delta: number };
  }): void => {
    if (!this.state) return;
    // The scene is static outside input/animations. Keep the last canvas image and
    // avoid extraction, command encoding and GPU submission until it changes.
    const animating =
      this.moving || this.transitioning || this.airborne || this.celebrating;
    if (
      !this.needsFrame && !this.wasAnimating && !animating &&
      this.renderedHome === this.home &&
      this.cameraPose[0] === this.canvas.clientWidth &&
      this.cameraPose[1] === this.canvas.clientHeight &&
      this.renderedWidth === this.canvas.width &&
      this.renderedHeight === this.canvas.height &&
      this.targetVersion === this.engine.getRenderPassDescriptorVersion()
    ) return;
    const now = this.clock();
    const portal = this.portal;
    const travel = portal
      ? portalPose(Math.max(0, now - portal.started))
      : null;
    if (portal && travel?.switched && !portal.switched) {
      this.rebuild(
        portal.state,
        portal.reset ? undefined : portal.previous,
        false,
        portal.transfers,
      );
      this.measureDuration();
      if (
        !portal.restoring &&
        portal.state.completed.some(
          (n) => !portal.previous.completed.includes(n),
        )
      )
        this.celebrateStart = portal.started + PORTAL_MS;
      if (portal.restoring) this.celebrateStart = -Infinity;
      portal.switched = true;
    }
    const width = this.canvas.clientWidth,
      height = this.canvas.clientHeight,
      aspect = width / Math.max(1, height),
      n = this.state.rooms[this.current]!.size;

    // A near-overhead, longer lens keeps true-scale parent walls outside the
    // playable board without shrinking their geometry or making them transparent.
    const contextScale = this.diagnostics.outerContext?.scale;
    const phi = contextScale ? Math.min(0.7, Math.atan(0.45 / contextScale)) : 0.7;
    const fov = contextScale ? 0.35 : 0.65;
    const homeOffset = this.home && aspect > 1 ? -(n * 0.27) : 0;
    let radius =
      (n + (this.diagnostics.outerContext ? 2 : 0)) *
      (this.home ? 2.32 : this.current === 'world' ? 2.25 : 2.35) *
      Math.max(1, 1.25 / aspect) * Math.tan(0.65 / 2) / Math.tan(fov / 2);
    let tx = homeOffset,
      ty = this.current === 'world' ? 0 : 0.25,
      tz = homeOffset * -0.35;
    if (portal && travel) {
      if (!travel.switched) {
        radius *= 1 - travel.phase * (portal.entering ? 0.86 : 0.25);
        tx = homeOffset * (1 - travel.phase) + portal.focus[0] * travel.phase;
        ty = (this.current === 'world' ? 0 : 0.25) * (1 - travel.phase) + portal.focus[1] * travel.phase;
        tz = homeOffset * -0.35 * (1 - travel.phase) + portal.focus[2] * travel.phase;
      } else radius *= 0.64 + travel.phase * 0.36;
      this.canvas.style.opacity = String(travel.opacity);
      this.labelRoot.style.opacity = String(travel.opacity);
      if (!travel.active) {
        this.portal = undefined;
        this.canvas.style.opacity = '1';
        this.labelRoot.style.opacity = '1';
      }
    }
    const cameraChanged =
      this.cameraPose[0] !== width || this.cameraPose[1] !== height ||
      this.cameraPose[2] !== radius || this.cameraPose[3] !== tx ||
      this.cameraPose[4] !== ty || this.cameraPose[5] !== tz ||
      this.cameraPose[6] !== phi || this.cameraPose[7] !== fov;
    if (cameraChanged) {
      this.camera.updateAspect(aspect);
      this.camera.fov = fov;
      this.orbit.set(radius, 0.54, phi);
      this.orbit.setTarget(tx, ty, tz);
      this.cameraPose = [width, height, radius, tx, ty, tz, phi, fov];
    }
    const bounce = jumpPose(now - this.jumpStart);
    const elapsed = now - this.start;
    const celebration = celebrationPose(this.clock() - this.celebrateStart);
    Object.assign(this.diagnostics, {
      wallRuns: this.walls.length,
      moving: this.moving,
      jumping: bounce.active,
      transitioning: this.transitioning,
      portalPhase: travel?.phase ?? 0,
      cameraRadius: this.orbit.radius,
      displayedRoom: this.current,
      doorCount: this.doorCount,
      celebrating: celebration.active,
      laugh: celebration.active && celebration.laugh,
      lift: celebration.active ? celebration.lift : bounce.lift,
      yaw: celebration.yaw,
    });
    const mechanismT = Math.max(0, Math.min(1, elapsed / 320));
    const mechanismEase = mechanismT * mechanismT * (3 - 2 * mechanismT);
    this.diagnostics.mechanisms = this.mechanisms.map((m) => {
      const delayed = this.recoil?.gate === m.id && m.kind === 'gate';
      const progress = delayed ? Math.max(0, Math.min(1, (elapsed - GATE_RECOIL_DELAY_MS) / 320)) : mechanismT;
      const ease = delayed ? progress * progress * (3 - 2 * progress) : mechanismEase;
      const offset = m.from + (m.to - m.from) * ease;
      for (const part of m.parts)
        this.place(
          part,
          part.offset[0],
          part.offset[1] + offset,
          part.offset[2],
        );
      return {
        id: m.id,
        kind: m.kind,
        active: m.active,
        powered: m.powered,
        offset,
      };
    });
    this.diagnostics.boxTransfers.length = 0;
    this.diagnostics.boxPositions.length = 0;
    for (const a of this.actors) {
      const moving = !eq(a.from, a.to),
        cheer = a.player && celebration.active;
      const pose = a.player && this.recoil
        ? recoilPose(a.from, this.at(this.recoil.at), a.to, elapsed)
        : movementPose(
        a.from,
        a.to,
        elapsed,
        a.player && this.jump,
        a.player && moving,
        this.recoil ? movementDuration(a.from, a.to, a.player && this.jump) : this.duration,
      );
      const crossing = a.travel ? boxTravelPose(a.travel, elapsed) : undefined;
      const position = crossing?.position ?? pose.position;
      if (!a.player)
        this.diagnostics.boxPositions.push({
          id: a.id,
          position: [
            position[0] + (n - 1) / 2,
            position[1],
            position[2] + (n - 1) / 2,
          ],
        });
      const scale = crossing?.scale ?? 1;
      const center = a.center ?? 0;
      if (crossing) {
        const mid = (n - 1) / 2;
        this.diagnostics.boxTransfers.push({
          id: a.id,
          position: [position[0] + mid, position[1], position[2] + mid],
          scale,
          opacity: crossing.opacity,
          phase: crossing.phase,
        });
      }
      // Celebration starts after landing; idle jumps are separate from movement.
      const hop = cheer
        ? Math.max(0, celebration.lift)
        : a.player && bounce.active
          ? bounce.lift
          : 0;
      const squash =
        a.player && bounce.active
          ? bounce.squash
          : cheer && celebration.lift < 0
            ? 0.12
            : pose.squash;
      if (a.player) {
        const mid = (n - 1) / 2;
        this.diagnostics.playerPosition = [
          position[0] + mid,
          position[1] + hop,
          position[2] + mid,
        ];
        this.diagnostics.motionPhase = pose.phase;
      }
      const yaw = cheer ? celebration.yaw : 0,
        c = Math.cos(yaw),
        s = Math.sin(yaw);
      if (a.settled && !cheer && !(a.player && bounce.active)) continue;
      a.settled = elapsed >= this.duration && !cheer && !(a.player && bounce.active);
      for (const part of a.parts) {
        const o = crossing
          ? ([
              center + (part.offset[0] - center) * scale,
              part.offset[1] * scale,
              center + (part.offset[2] - center) * scale,
            ] as Vec)
          : part.offset;
        if (crossing) {
          const color = COLORS[part.color]!;
          (part.mesh.material as PbrMaterial).baseColor = [
            color[0],
            color[1],
            color[2],
            crossing.opacity,
          ];
        }
        this.place(
          part,
          position[0] + (o[0] * c + o[2] * s) * (1 + squash),
          position[1] + o[1] * (1 - squash) + hop,
          position[2] + (o[2] * c - o[0] * s) * (1 + squash),
        );
        this.rotate(part, yaw);
        const hidden = part.expression === 'smile'
          ? cheer && celebration.laugh
          : part.expression === 'laugh'
            ? !(cheer && celebration.laugh)
            : false;
        this.resize(
          part,
          hidden ? 0.0001 : (1 + squash) * scale,
          hidden ? 0.0001 : (1 - squash) * scale,
          hidden ? 0.0001 : (1 + squash) * scale,
        );
      }
    }
    this.diagnostics.fadedWalls = 0;
    if ((cameraChanged || this.labelsDirty) && this.labels.length) {
      const vp = mat4.multiply(
        this.camera.projectionMatrix,
        mat4.inverse(this.orbit.localMatrix, this.inverseView),
        this.viewProjection,
      );
      for (const { node, pos } of this.labels) {
        const [x, y, z] = pos;
        const w = vp[3]! * x + vp[7]! * y + vp[11]! * z + vp[15]!;
        const sx = (vp[0]! * x + vp[4]! * y + vp[8]! * z + vp[12]!) / w,
          sy = (vp[1]! * x + vp[5]! * y + vp[9]! * z + vp[13]!) / w;
        node.style.left = `${((sx + 1) * width) / 2}px`;
        node.style.top = `${((1 - sy) * height) / 2}px`;
      }
    }
    this.labelsDirty = false;
    this.world.update(time, delta);
    this.needsFrame = false;
    this.wasAnimating = this.moving || this.transitioning || this.airborne || this.celebrating;
    this.renderedHome = this.home;
    this.renderedWidth = this.canvas.width;
    this.renderedHeight = this.canvas.height;
    this.targetVersion = this.engine.getRenderPassDescriptorVersion();
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelMotion();
    this.engine.off('update', this.frame);
    this.engine.off('resize', this.invalidate);
    this.engine.off('device-restored', this.invalidate);
    this.world.destroy();
    this.state = null;
    this.destroyedParts += this.entities.length;
    this.partPool.length = 0;
    this.labels.length = 0;
    this.walls.length = 0;
    this.mouthSmile.length = 0;
    this.mouthLaugh.length = 0;
    this.entities = [];
    this.actors = [];
    this.mechanisms = [];
    this.labelRoot.replaceChildren();
    this.geometries.clear();
    this.materials.clear();
  }
}
