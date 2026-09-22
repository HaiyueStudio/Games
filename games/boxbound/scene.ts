import {playerMirrored} from './model';
import {decorationParts,DECORATION_BEVEL_SEGMENTS,DECORATION_RADIAL_SEGMENTS} from './decoration-mesh';
import { labelIsNear } from './label-visibility';
import { browserLabels, type BoxboundLabels, type BoxboundLabel } from './labels';
import { THEME_COLORS, roomMaterialKeys } from './themes';
import { archedWalls, type SurfaceMesh } from './wall-mesh';
import { mapRoomTheme } from './world-map';
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
  createPlane3D,
  Geometry3D,
} from '@haiyue/engine/geometry';
import { Render3DSystem } from '@haiyue/engine/systems';
import { computeBoundingSphere, transformBoundingSphere } from '@haiyue/engine/math';
import {
  RenderIntegration,
  getEngineGPUResourceTracker,
} from '@haiyue/engine/experimental';
import { mat4 } from 'wgpu-matrix';
import {
  type Box,
  type Room,
  type BoxTransfer,
  type PlayerCrossing,
  type GateRecoil,
  type State,
  type Vec,
  eq,
  platePressed,
  gateOpen,
  gateCells,
  gatePowered,
  outerExitBarriers,
  entrances,
  boundaryEntrances,
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
import { spaceTransform, transformPoint, containmentTransform, type SpaceTransform } from './space-view';
import { MAP_PHI, MAP_THETA, MAP_FOV, MAP_COVERAGE, mapCameraAngles, mapCameraRadius, mapBasis, occludesPoint } from './camera-view';
import { finishedLevel } from './completion';
import { DecorationType, type DecorationKind } from './decorations';

type Color = [number, number, number, number];
const COLORS: Record<string, Color> = {
  ...THEME_COLORS,
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
  neutralGoal: [0.25, 0.28, 0.29, 1],
  shadow: [0.66, 0.74, 0.64, 1],
  leaf: [0.37, 0.61, 0.46, 1],
};
// Flat tiles sit at 0.004; keep goal paint above them and below child floors.
const GOAL_FRAME = [[0, -0.36, 0.78, 0.065], [0, 0.36, 0.78, 0.065],
  [-0.36, 0, 0.065, 0.72], [0.36, 0, 0.065, 0.72]] as const;
const GOAL_MARKER_Y = 0.009;
const GOAL_MARKER_HEIGHT = 0.004;
const GOAL_MARKER_RADIUS = 0.002;
const boxSurfaceColor = (box: Box): string => box.fixed && !box.portal
  ? box.inside === box.room ? 'purple' : 'stone' : boxColor(box);
interface Part {
  externalGroup?: string;
  actorKey?: string;
  previewBox?: string;
  wallSurface?: { room: string; top: boolean; lod: boolean };
  alpha?: number;
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
  space?: SpaceTransform;
  childOwner?: string;
  retiring?: boolean;
}
export class BoxboundScene {
  readonly world = new World('Boxbound');
  private readonly occurrenceTransform = new CartesianTransform3D();
  private readonly occurrenceRoot = new Entity('Current occurrence').addComponent(this.occurrenceTransform);
  private mirrored = false;
  readonly camera = new Camera3D({
    type: 'perspective',
    fov: MAP_FOV,
    near: 0.1,
    far: 600,
  });
  readonly orbit = new SphericalTransform3D({
    radius: 24,
    theta: MAP_THETA,
    phi: MAP_PHI,
    target: [0, 0, 0],
  });
  private createdParts = 0;
  private destroyedParts = 0;
  private rebuilds = 0;
  private transformWrites = 0;
  private partPool: Part[] = [];
  private partCursor = 0;
  private reusableParts: Part[] = [];
  private reusableShapes = new Map<string, Part[]>();
  private reusedStatic = new Set<Part>();
  private reservedParts = new Map<string, Part>();
  private buildingActor: string | undefined;
  private actorPartIndex = 0;
  private buildingPreviewBox: string | undefined;
  private previewExclusions = new Set<string>();
  private boxInstances = new Map<string, number>();
  private outerPartRange: [number, number] = [0, 0];
  private promotedPreviewChild: string | undefined;
  private labelCursor = 0;
  private labelsDirty = true;
  private disposed = false;
  private needsFrame = true;
  private presentationOnly = false;
  /** Refresh the engine GUI without recalculating a settled 3D scene. */
  requestPresent = (): void => { this.presentationOnly = true; };
  get hasPendingFrame(): boolean { return this.needsFrame || this.presentationOnly || this.wasAnimating || this.moving || this.transitioning || this.airborne || this.celebrating; }
  private integration!: RenderIntegration;
  attachOverlay(entity: Entity, system: import('@haiyue/engine/gui').GuiSystem): void {
    this.world.addEntity(entity); this.world.addSystem(system); this.integration.register(system, { pass: 'shared' }); this.requestPresent();
  }
  private renderedMood = '';
  private walkUpdates = 0;
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
  applyQuality(msaa: boolean, pixelRatio: number): void {
    this.engine.msaaSamples = msaa ? 4 : 1;
    this.renderer.msaaSamples = this.engine.msaaSamples;
    if (this.engine.devicePixelRatio !== pixelRatio) this.engine.devicePixelRatio = pixelRatio;
    this.invalidate();
  }
  labelSnapshot() { return this.labels.map(({room,outer,anchor,visible})=>({room,outer,anchor,visible})); }
  private shadowLights: DirectionalLight[] = [];
  /** Debug A/B switch; normal play starts with shadows disabled. */
  setShadowsEnabled(enabled: boolean): void {
    for (const light of this.shadowLights) {
      if (light.castShadow === enabled) continue;
      light.castShadow = enabled;
      light.markDirty();
    }
    this.invalidate();
  }
  /** On-demand diagnostics only: count each rendered occurrence, including parent/LOD. */
  triangleSnapshot() {
    // Reuse the renderer's actual last view (including its projection settings).
    const frustum = this.renderer.frustum;
    const geometries = new Map<Geometry3D, { triangles: number; sphere: ReturnType<typeof computeBoundingSphere> }>();
    let total = 0, inFrustum = 0, meshesInFrustum = 0;
    const byColor: Record<string, number> = {};
    for (const part of this.partPool) {
      const geometry = part.mesh.geometry as Geometry3D;
      let entry = geometries.get(geometry);
      if (!entry) {
        entry = { triangles: (geometry.indices?.length ?? geometry.positions.length / 3) / 3,
          sphere: computeBoundingSphere(geometry.positions) };
        geometries.set(geometry, entry);
      }
      total += entry.triangles;
      byColor[part.color] = (byColor[part.color] ?? 0) + entry.triangles;
      if (frustum.containsSphere(transformBoundingSphere(entry.sphere, this.world.frameData.transforms.getWorldMatrix(part.entity) ?? part.t.localMatrix))) {
        inFrustum += entry.triangles;
        meshesInFrustum++;
      }
    }
    return { total, inFrustum, meshes: this.partPool.length, meshesInFrustum, byColor };
  }
  resourceSnapshot() {
    const gpu = getEngineGPUResourceTracker(this.engine);
    return {
      entities: this.world.entities.size,
      parts: this.entities.length,
      createdParts: this.createdParts,
      destroyedParts: this.destroyedParts,
      rebuilds: this.rebuilds,
      walkUpdates: this.walkUpdates,
      wallLayoutBuilds: this.wallLayoutBuilds,
      occlusionPasses: this.occlusionPasses,
      transformWrites: this.transformWrites,
      geometries: this.geometries.size,
      materials: this.materials.size,
      labels: this.labelRoot.count,
      sceneExtractions: this.renderer.sceneExtractionCount,
      renderProfile: this.renderer.renderProfile,
      batches: this.renderer.lastGpuDrivenBatchCount,
      shadowsEnabled: this.shadowLights.some((light) => light.castShadow),
      shadowPasses: this.renderer.lastDirectionalShadowPassCount,
      shadowCasters: this.renderer.lastDirectionalShadowCasterCount,
      shadowCacheHit: this.renderer.lastDirectionalShadowCacheHit,
      frustumCulling: this.renderer.renderSettings.frustumCulling,
      visibleMeshes: this.renderer.lastVisibleCount,
      totalMeshes: this.renderer.lastTotalCount,
      gpu: gpu?.getUsage(),
      gpuTypes: gpu?.getDebugSnapshot().byType,
    };
  }
  themePalette(room: string) {
    const theme = mapRoomTheme(this.state!.rooms[room]!);
    const keys = roomMaterialKeys(theme);
    return { theme, colors: Object.fromEntries(Object.entries(keys).map(([surface, key]) => {
      const part = this.partPool.find((p) => p.color === key);
      return [surface, part ? Array.from((part.mesh.material as PbrMaterial).baseColor.writeSRGB(new Float32Array(4))) : []];
    })) };
  }
  wallPalette(room: string, lod: boolean): number[][] {
    return [false, true].map((top) => {
      const part = this.partPool.find((p) => p.wallSurface?.room === room && p.wallSurface.lod === lod && p.wallSurface.top === top);
      return part ? Array.from((part.mesh.material as PbrMaterial).baseColor.writeSRGB(new Float32Array(4))) : [];
    });
  }
  actorOpacity(id: string): number {
    const part = this.actors.find((a) => a.id === id)?.parts[0];
    return part ? (part.mesh.material as PbrMaterial).baseColor.writeSRGB(new Float32Array(4))[3]! : NaN;
  }
  topExpression() {
    const parts = this.actors.find((a) => a.id === 'player')?.parts.filter((p) => p.offset[1] > .78) ?? [];
    return { parts: parts.length, smile: parts.filter((p) => p.expression === 'smile' && p.scale[0] > .01).length,
      laugh: parts.filter((p) => p.expression === 'laugh' && p.scale[0] > .01).length };
  }
  sameActorModel(first: string, second: string): boolean {
    const a = this.actors.find((v) => v.id === first), b = this.actors.find((v) => v.id === second);
    return !!a && !!b && a.parts.length === b.parts.length && a.parts.every((p, i) =>
      p.mesh.geometry === b.parts[i]!.mesh.geometry && p.mesh.material === b.parts[i]!.mesh.material);
  }
  private wallLayoutBuilds = 0;
  private occlusionPasses = 0;
  // Weak keys do not retain rooms from old saves. The signature also handles
  // editor/fixture mutations of a wall array in place without stale geometry.
  private wallLayouts = new WeakMap<Room, { signature: string; pieces: ReturnType<typeof wallPieces>; arches: ReturnType<typeof archedWalls> }>();
  private roomWalls(room: Room) {
    const signature = JSON.stringify([room.size, room.walls, room.barriers, room.doorWidths]);
    let layout = this.wallLayouts.get(room);
    if (!layout || layout.signature !== signature) {
      const forbidden = new Set((room.barriers ?? []).map(p => p.join(',')));
      layout = { signature, pieces: wallPieces({...room, walls: room.walls.filter(p => !forbidden.has(p.join(',')))}), arches: archedWalls(room) };
      this.wallLayouts.set(room, layout); this.wallLayoutBuilds++;
    }
    return layout;
  }
  goalMarkerPalette(): number[][] {
    return this.partPool.filter((p) => p.color === 'neutralGoal').map((p) =>
      Array.from((p.mesh.material as PbrMaterial).baseColor.writeSRGB(new Float32Array(4))));
  }
  private geometries = new Map<string, Geometry3D>();
  private geometryRadii = new WeakMap<Geometry3D, number>();
  private geometrySizes = new WeakMap<Geometry3D, Vec>();
  private drawingOuter = false;
  private drawingExternalGroup: string | undefined;
  private materials = new Map<string, PbrMaterial>();
  private entities: Entity[] = [];
  private actors: Actor[] = [];
  private drawingRoom: string | undefined;
  private drawingSpace: SpaceTransform | undefined;
  private drawingPrevious: State | undefined;
  private parentSpace: SpaceTransform | undefined;
  private parentBase: SpaceTransform | undefined;
  private outerStaticParts: { part: Part; position: Vec }[] = [];
  private outerLabels: { entry: { node: BoxboundLabel; pos: Vec }; position: Vec }[] = [];
  private previewMotions: { parts: { part: Part; offset: Vec }[]; from: Vec; to: Vec; step: number; flipX: boolean }[] = [];
  private playerCopies: { owner: string; layer: 'parent' | 'child'; transform: SpaceTransform; parts: Part[] }[] = [];
  private mechanisms: {
    id: string;
    kind: 'button' | 'gate';
    room: string;
    indicators?: Part[];
    parts: Part[];
    from: number;
    to: number;
    active: boolean;
    powered: boolean;
    space?: SpaceTransform;
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
  private portal: { state: State; started: number;
    cameraFrom: { radius: number; target: Vec; phi: number; theta: number } } | undefined;
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
    this.labelRoot.opacity(1);
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
    playerScale: 1,
    playerInstances: [] as { layer: string; owner?: string; position: Vec; scale: number }[],
    retainedActors: [] as string[],
    actorEntities: [] as { id: string; entities: number[] }[],
    boxInstances: [] as { id: string; count: number }[],
    boxPositions: [] as { id: string; position: Vec }[],
    flags: [] as string[],
    parentSceneParts: 0,
    outerBoxPositions: [] as { id: string; position: Vec; rendered: Vec; scale: number }[],
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
    archedWallCells: 0,
    wallHeight: 0,
    jumping: false,
    transitioning: false,
    portalPhase: 0,
    cameraRadius: 0,
    viewMode: 'spatial' as 'planar' | 'spatial',
    fadedOuterObjects: [] as { id: string; parts: number; opacity: number }[],
    cameraDepthRange: { min: 0, max: 0, near: 0, far: 0 },
    cameraPhi: MAP_PHI,
    cameraTheta: MAP_THETA,
    displayedRoom: '',
    mirrored: false,
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

  private labels: { node: BoxboundLabel; pos: Vec; anchor: Vec; room: string; outer: boolean; visible: boolean }[] = [];
  home = true;
  mood = 'smile';
  private readonly labelRoot: BoxboundLabels;
  private newLabel() { const entry = { node:this.labelRoot.create(),pos:[0,0,0] as Vec,anchor:[0,0,0] as Vec,room:'',outer:false,visible:false }; this.labels.push(entry); return entry; }
  constructor(
    readonly engine: HaiyueEngine,
    private canvas: Pick<HTMLCanvasElement, 'width' | 'height' | 'clientWidth' | 'clientHeight'> & {style: {opacity:string}},
    labelRoot: HTMLElement | BoxboundLabels,
    private clock: () => number = () => performance.now(),
  ) {
    this.labelRoot = 'create' in labelRoot ? labelRoot : browserLabels(labelRoot);
    const cam = new Entity('Camera')
      .addComponent(this.camera)
      .addComponent(this.orbit);
    this.world.addEntity(cam);
    this.world.addEntity(this.occurrenceRoot);
    this.world.addEntity(
      new Entity('Sun').addComponent(
        new DirectionalLight({
          direction: [-0.5, -1, -0.4],
          color: [1, 0.95, 0.83],
          intensity: 2.2,
          castShadow: false,
        }),
      ),
    );
    this.world.addEntity(
      new Entity('Sky').addComponent(
        new EnvironmentLight({
          intensity: 1.45,
          diffuseColor: [0.95, 0.96, 1],
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
          castShadow: false,
        }),
      ),
    );
    for (const entity of this.world.entities.values()) {
      const light = entity.getComponent(DirectionalLight);
      if (light) this.shadowLights.push(light);
    }
    this.world.addSystem(
      (this.renderer = new Render3DSystem(engine, cam, {
        priority: 20,
        loadOp: 'clear',
        renderProfile: engine.renderProfile,
        toneMapping: 'none',
      })),
    );
    const integration = this.integration = new RenderIntegration(engine, {
      label: 'Boxbound.render',
    });
    this.world.addRuntimeIntegration(integration);
    integration.registerAll(this.world, () => ({ pass: 'shared' }));
    engine.on('update', this.frame);
    engine.on('resize', this.invalidate);
    engine.on('device-restored', this.invalidate);
  }
  private reflectedGeometry = new WeakMap<Geometry3D, Geometry3D>();
  private mirrorGeometry(source: Geometry3D): Geometry3D {
    let mirrored = this.reflectedGeometry.get(source);
    if (!mirrored) {
      mirrored = new Geometry3D({
        positions: source.positions.map((v, i) => i % 3 === 0 ? -v : v),
        ...(source.normals ? {normals: source.normals.map((v, i) => i % 3 === 0 ? -v : v)} : {}),
        ...(source.indices ? {indices: source.indices.map((_, i, a) => a[i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i]!)} : {}),
        textureCoordinates: [...source.textureCoordinates].map(([set, data]) => ({set, data})),
      });
      this.reflectedGeometry.set(source, mirrored); this.reflectedGeometry.set(mirrored, source);
      this.geometries.set(`reflected/${source.id}`, mirrored);
      this.geometryRadii.set(mirrored, this.geometryRadii.get(source)!);
      this.geometrySizes.set(mirrored, this.geometrySizes.get(source)!);
    }
    return mirrored;
  }
  /** Actual engine world transform, used by browser/native mirror regressions. */
  occurrenceSnapshot() {
    const part = this.actors.find(a => a.player)?.parts[0];
    return {mirrored: this.mirrored, rootScale: this.occurrenceTransform.scale[0],
      playerWorld: part ? Array.from(part.t.worldMatrix).slice(12, 15) : [],
      winding: part?.mesh.geometry.frontFace};
  }
  private part(
    pos: Vec,
    size: Vec,
    color: string,
    radius = 0.08,
    cylinder: boolean | 'cone' = false,
    surface?: 'plane' | SurfaceMesh,
    detail = 3,
  ): Part {
    if (this.drawingSpace) pos = transformPoint(pos, this.drawingSpace);
    if (surface && typeof surface !== 'string' && this.drawingSpace?.flipX)
      surface = {...surface, flipX:!surface.flipX};
    const k = size.join() + ':' + radius + ':' + cylinder + ':' + detail + (surface ? ':' + (typeof surface === 'string' ? surface : surface.key + ':' + (surface.scale ?? 1) + ':' + !!surface.flipX) : '');
    let g = this.geometries.get(k);
    if (!g) {
      g = surface === 'plane' ? createPlane3D({width:size[0],height:size[2],normal:'y'})
        : surface ? new Geometry3D({positions:new Float32Array(surface.positions.map((v,i) => v * (surface.scale ?? 1) * (surface.flipX && i%3===0 ? -1 : 1))),
          normals:new Float32Array(surface.normals.map((v,i)=>v*(surface.flipX&&i%3===0?-1:1))),indices:new Uint32Array(surface.flipX?surface.indices.map((_,i,a)=>a[i%3===1?i+1:i%3===2?i-1:i]!):surface.indices)})
        : cylinder
        ? createCylinder3D({
            radiusTop: cylinder === 'cone' ? 0 : size[0] / 2,
            radiusBottom: size[0] / 2,
            height: size[1],
            radialSegments: cylinder === 'cone' || detail < 3 ? DECORATION_RADIAL_SEGMENTS : 32,
          })
        : createRoundedBox3D({
            width: size[0],
            height: size[1],
            depth: size[2],
            radius: Math.min(radius, ...size.map((v) => v / 2)),
            segments: detail,
          });
      this.geometries.set(k, g);
      this.geometryRadii.set(g, Math.hypot(...size) / 2);
      this.geometrySizes.set(g, [...size]);
    }
    const m = this.material(color);
    const key = this.buildingActor ? `${this.buildingActor}:${this.actorPartIndex++}` : undefined;
    let part = key ? this.reservedParts.get(key) : undefined;
    if (!key) { const bucket=this.reusableShapes.get(g.id+':'+color); do {part=bucket?.pop();}while(part && this.reusedStatic.has(part)); }
    if (!key) {
      if (!part) do { part=this.reusableParts.pop(); } while(part && this.reusedStatic.has(part));
      if (part) this.reusedStatic.add(part);
    }
    if (key) this.reservedParts.delete(key);
    if (!part) {
      const t = new CartesianTransform3D({ position: pos });
      const mesh = new Mesh3D(g, m);
      const entity = new Entity('Boxbound part')
        .addComponent(t)
        .addComponent(mesh);
      this.occurrenceRoot.addChild(entity);
      part = {
        entity, t, mesh, color,
        position: [...pos],
        yaw: 0,
        offset: [0, 0, 0],
        scale: [1, 1, 1],
      };
      this.createdParts++;
    } else {
      part.mesh.geometry = g;
      part.mesh.material = m;
      part.color = color;
      delete part.expression;
      delete part.alpha;
      delete part.wallSurface;
      this.place(part, ...pos);
      this.rotate(part, 0);
      this.resize(part, 1, 1, 1);
    }
    if (this.drawingOuter) part.externalGroup = this.drawingExternalGroup ?? this.buildingActor ?? `static/${part.entity.id}`;
    else delete part.externalGroup;
    if (key) part.actorKey = key; else delete part.actorKey;
    if (this.buildingPreviewBox) part.previewBox = this.buildingPreviewBox; else delete part.previewBox;
    if (this.drawingSpace) this.resize(part, this.drawingSpace.scale, this.drawingSpace.scale, this.drawingSpace.scale);
    this.partPool.push(part); this.entities.push(part.entity); this.partCursor++;
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
    this.diagnostics.actorEntities = this.actors.map((a) => ({ id: a.id, entities: a.parts.map((p) => p.entity.id) }));
    for (const part of [...this.reusableParts, ...this.reservedParts.values()]) {
      if (this.reusedStatic.has(part)) continue;
      part.entity.destroy(); this.destroyedParts++;
    }
    this.reusableParts = []; this.reservedParts.clear(); this.reusableShapes.clear(); this.reusedStatic.clear();
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
  private material(color: string, alpha = 1): PbrMaterial {
    const key = color + (alpha < 1 ? ':alpha:' + alpha : '');
    let m = this.materials.get(key);
    if (!m) {
      const c = COLORS[color]!;
      m = new PbrMaterial({
        baseColor: [c[0], c[1], c[2], alpha],
        roughness: 0.82,
        metallic: color === 'iron' ? 0.7 : 0,
        alphaMode: alpha < 1 ? 'blend' : 'opaque',
      });
      this.materials.set(key, m);
    }
    return m;
  }
  private at(p: Vec): Vec {
    const n = this.state!.rooms[this.drawingRoom ?? this.state!.player.room]!.size;
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
    playerCrossing?: PlayerCrossing,
  ): void {
    this.invalidate();
    this.recoil = recoil;
    if (
      previous &&
      (reset || playerCrossing ||
        state.player.room !== previous.player.room ||
        state.player.route.length !== previous.player.route.length)
    ) {
      const entering = playerCrossing?.entering ?? (state.player.route.length > previous.player.route.length);
      const mapping = spaceTransform(previous, state, playerCrossing);
      const boundary = playerCrossing ? { box: playerCrossing.container }
        : entering ? state.player.route[previous.player.route.length] : previous.player.route[state.player.route.length];
      const excluded = new Set(this.actors.filter((a) => a.player || transfers.some((t) => t.box === a.id) || (entering && (a.id === boundary?.box || a.childOwner === boundary?.box)) ||
        (state.player.room !== previous.player.room && state.boxes.some((b) => b.id === a.id && b.room === state.player.room))).flatMap((a) => a.parts));
      const snapshots = reset ? [] : this.partPool.flatMap((part, i) =>
        part.actorKey?.startsWith('player-copy/') || (part.previewBox && transfers.some((t) => t.box === part.previewBox)) || excluded.has(part) || (entering ? !(i >= this.outerPartRange[0] && i < this.outerPartRange[1]) : i >= this.outerPartRange[0] && i < this.outerPartRange[1]) ? [] : [{
          actorId: part.actorKey?.split(':')[0], externalGroup: part.externalGroup, alpha: part.alpha,
          position: transformPoint(part.position, mapping),
          scale: part.scale.map((v) => v * mapping.scale) as Vec,
          color: part.color, geometry: mapping.flipX ? this.mirrorGeometry(part.mesh.geometry as Geometry3D) : part.mesh.geometry as Geometry3D, material: part.mesh.material as PbrMaterial,
        }]);
      const cameraFrom = { radius: this.orbit.radius * mapping.scale, phi: this.orbit.phi, theta: this.orbit.theta,
        target: transformPoint(transformPoint(Array.from(this.orbit.target) as Vec, {scale:1,offset:[0,0,0],flipX:this.mirrored}), mapping) };
      this.cancelMotion();
      // A multi-level return still needs the intermediate room's first-level LOD.
      // Replace only its terminal child with the retained detailed source room.
      this.promotedPreviewChild = !entering && previous.player.route.length - state.player.route.length > 1
        ? previous.player.route[state.player.route.length + 1]?.box : undefined;
      this.rebuild(state, previous, false, transfers);
      this.promotedPreviewChild = undefined;
      if (!reset) {
        const player = this.actors.find((a) => a.player)!;
        const oldSize = previous.rooms[previous.player.room]!.size;
        const source = previous.player.pos.map((v, i) => i === 1 ? v : v - (oldSize - 1) / 2) as Vec;
        player.travel = { from: transformPoint(source, mapping), to: [...player.to],
          startScale: mapping.scale, endScale: 1, entering, departure: false };
      }
      if (reset) { this.measureDuration(); return; }
      if (!entering && boundary && (playerCrossing || previous.player.route.length - state.player.route.length === 1)) {
        for (const actor of this.actors.filter((a) => a.id === boundary.box || a.childOwner === boundary.box)) {
          for (const part of actor.parts) this.resize(part, 0, 0, 0);
          actor.parts = [];
        }
      }
      for (const spec of snapshots) {
        const part = this.part(spec.position, [1, 1, 1], spec.color);
        part.mesh.geometry = spec.geometry;
        part.mesh.material = state.rooms[state.player.room]!.planar ? this.material(spec.color, spec.alpha ?? 1) : spec.material;
        part.alpha = spec.alpha ?? 1;
        if (entering) part.externalGroup = `retained/${spec.externalGroup ?? spec.actorId ?? part.entity.id}`;
        this.resize(part, ...spec.scale);
      }
      this.finishParts();
      this.diagnostics.retainedActors = [...new Set(snapshots.flatMap((s) => s.actorId ? [s.actorId] : []))];
      this.portal = { state, started: this.clock(), cameraFrom };
      this.duration = PORTAL_MS;
      return;
    }
    if (!previous) this.cancelMotion();
    const takeoff = jump ? jumpPose(this.clock() - this.jumpStart).lift : 0;
    if (jump) this.jumpStart = -Infinity;
    if (!previous || restoring || reset || recoil || transfers.length || !this.reuseWalk(state, previous, jump))
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
  /** A plain walk/jump changes actor poses, not walls, floors, previews or labels. */
  private reuseWalk(state: State, previous: State, jump: boolean): boolean {
    if (!this.state || this.current !== state.player.room || previous.player.room !== state.player.room ||
      state.rooms !== previous.rooms || this.renderedMood !== this.mood ||
      JSON.stringify(state.player.route) !== JSON.stringify(previous.player.route) ||
      JSON.stringify(state.completed) !== JSON.stringify(previous.completed) ||
      finishedLevel(state) !== finishedLevel(previous) || this.actors.some(a => a.retiring) ||
      state.boxes.length !== previous.boxes.length || state.boxes.some((b,i) => {
        const old=previous.boxes[i]!;
        return Object.keys(b).some(k => k==='pos' ? !eq(b.pos,old.pos) : b[k as keyof Box] !== old[k as keyof Box]);
      })) return false;
    const room=state.rooms[state.player.room]!;
    if ((this.parentSpace || this.playerCopies.length) && room.buttons?.some(b => eq(b.pos,state.player.pos) || eq(b.pos,previous.player.pos))) return false;
    this.state=state; this.start=this.clock(); this.jump=jump; this.celebrateStart=-Infinity; this.walkUpdates++;
    for(const a of this.actors){a.from=a.player?this.at(previous.player.pos):[...a.to];a.to=a.player?this.at(state.player.pos):a.to;a.travel=undefined;a.settled=!a.player;}
    for(const m of this.mechanisms){
      const r=state.rooms[m.room]!,id=m.id.replace(/^outer\//,'');m.from=m.to;
      if(m.kind==='button'){
        const plate=r.buttons!.find(b=>b.id===id)!;m.active=m.powered=platePressed(state,r.id,plate);m.to=m.active?-.04:0;
        const part=m.parts[0]!;part.color=m.active?'mint':'gold';part.mesh.material=this.material(part.color);
      }else{
        const gate=r.gates!.find(g=>g.id===id)!;m.active=gateOpen(state,r.id,gate);m.powered=gatePowered(state,r.id,gate);m.to=m.active?-1.18:0;
        for(const part of m.indicators??[]){part.color=m.powered?'mint':'gold';part.mesh.material=this.material(part.color);}
      }
    }
    this.previewMotions=[];
    return true;
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
    this.renderedMood = this.mood;
    this.celebrateStart =
      previous && finishedLevel(state) !== null && finishedLevel(previous) !== finishedLevel(state)
        ? this.clock()
        : -Infinity;
    this.mouthSmile = [];
    this.mouthLaugh = [];
    this.walls = [];
    this.doorCount = 0;
    this.start = this.clock();
    this.rebuilds++;
    const retiring: Actor[] = [];
    for (const transfer of transfers.filter((t) => previous && t.fromRoom === t.toRoom && t.fromRoom === state.player.room)) {
      const child = `child/${transfer.container}/${transfer.box}`, parent = `outer/${transfer.box}`;
      const context = outerContext(state), hasParent = context?.owner === transfer.container && context.parent === transfer.fromRoom;
      const shifts = new Map<string, string>(transfer.entering
        ? [[transfer.box, child], ...(hasParent ? [[parent, transfer.box] as [string, string]] : [])]
        : [[child, transfer.box], ...(hasParent ? [[transfer.box, parent] as [string, string]] : [])]);
      const departingId = transfer.entering ? child : hasParent ? parent : transfer.box;
      const departing = this.actors.find((a) => a.id === departingId);
      if (departing) {
        const travel = boxTravel(transfer, transfer.fromRoom, previous!, state, 'departure')!;
        const mid = (state.rooms[transfer.fromRoom]!.size - 1) / 2;
        travel.from = travel.from.map((v, i) => i === 1 ? v : v - mid) as Vec;
        travel.to = travel.to.map((v, i) => i === 1 ? v : v - mid) as Vec;
        departing.parts.forEach((part, i) => { part.actorKey = `departing/${departingId}:${i}`; });
        retiring.push({ ...departing, id: `departing/${departingId}`, travel, settled: false, retiring: true });
      }
      for (const actor of this.actors) {
        const target = shifts.get(actor.id);
        if (target) actor.parts.forEach((part, i) => { part.actorKey = `${target}:${i}`; });
      }
    }
    const retained = new Set(retiring.flatMap((a) => a.parts));
    // Reserve actor parts by identity before reusing any static scene objects.
    this.reusableParts = this.partPool.filter((p) => !p.actorKey).reverse();
    this.reusableShapes.clear(); this.reusedStatic.clear();
    for(const part of this.reusableParts){const key=part.mesh.geometry.id+':'+part.color;const bucket=this.reusableShapes.get(key)??[];bucket.push(part);this.reusableShapes.set(key,bucket);}
    this.reservedParts = new Map(this.partPool.filter((p) => p.actorKey && !retained.has(p)).map((p) => [p.actorKey!, p]));
    this.partPool = []; this.entities = []; this.partCursor = 0;
    this.previewExclusions = new Set(transfers.filter((t) => t.fromRoom !== t.toRoom && (t.fromRoom === state.player.room || t.toRoom === state.player.room)).map((t) => t.box));
    this.boxInstances.clear();
    this.diagnostics.flags = [];
    this.diagnostics.parentSceneParts = 0;
    this.diagnostics.retainedActors = [];
    this.labelCursor = 0;
    this.actors = [];
    this.playerCopies = [];
    this.mechanisms = [];
    this.buildingActor = undefined;
    this.parentSpace = undefined; this.parentBase = undefined; this.outerStaticParts = []; this.outerLabels = []; this.previewMotions = [];
    const r = state.rooms[state.player.room]!;
    this.current = r.id;
    this.diagnostics.outerBarriers = outerExitBarriers(state);
    this.diagnostics.outerContext = outerContext(state);
    this.outerPartRange = [this.partCursor, this.partCursor];
    // Keep the entire destination parent present from the first portal frame.
    // The engine frustum culls offscreen meshes; never crop the authored world.
    this.drawOuterContext(previous, transfers);
    this.outerPartRange[1] = this.partCursor;
    this.drawRoom(r, previous, transfers);
    // One explicit child occurrence only. Its model entities can become the
    // current/parent occurrence during a crossing without cloning the crate.
    for (const owner of state.boxes.filter((b) => b.room === r.id && b.inside === r.id)) {
      this.drawingRoom = r.id;
      this.drawingSpace = containmentTransform(state, owner.id);
      for (const box of state.boxes.filter((b) => b.room === r.id && !this.previewExclusions.has(b.id))) {
        const transfer = transfers.find((t) => t.box === box.id && t.fromRoom === t.toRoom);
        const travel = transfer && previous ? boxTravel(transfer, r.id, previous, state, 'arrival') : undefined;
        if (travel) { travel.from = this.at(travel.from); travel.to = this.at(travel.to); }
        this.buildingPreviewBox = box.id;
        this.drawBox(box, previous?.boxes.find((b) => b.id === box.id && b.room === r.id), travel, `child/${owner.id}/${box.id}`, true);
        this.actors.at(-1)!.childOwner = owner.id;
        this.boxInstances.set(box.id, (this.boxInstances.get(box.id) ?? 0) + 1);
      }
      this.buildingPreviewBox = undefined;
      this.drawingSpace = undefined; this.drawingRoom = undefined;
    }
    for (const actor of retiring) {
      for (const part of actor.parts) {
        this.partPool.push(part); this.entities.push(part.entity); this.partCursor++;
      }
      this.actors.push(actor);
    }
    this.buildingActor = 'player'; this.actorPartIndex = 0;
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
    // Lay the same expression on the top face for overhead cameras. These
    // shallow marks reuse pooled parts/materials and share celebration state.
    for (const original of parts.slice(1)) {
      const [x, y, z] = original.offset;
      const [w, h, d] = this.geometrySizes.get(original.mesh.geometry as Geometry3D)!;
      const top = face([x, 0.44 + z, 0.44 - y], [w, d, h], original.color, Math.min(w, h, d) / 2);
      if (this.mouthSmile.includes(original)) this.mouthSmile.push(top);
      if (this.mouthLaugh.includes(original)) this.mouthLaugh.push(top);
    }
    this.actors.push({
      id: 'player',
      parts,
      from: previous?.player.room === r.id ? this.at(previous.player.pos) : p,
      to: p,
      player: true,
    });
    for (const part of this.mouthSmile) part.expression = 'smile';
    for (const part of this.mouthLaugh) part.expression = 'laugh';
    // These are bounded visual occurrences of the same player, never new game
    // actors. Reuse the original geometry/material and copy its animated pose.
    const copies: { owner: string; layer: 'parent' | 'child' }[] = state.boxes
      .filter((b) => b.room === r.id && b.inside === r.id && !this.previewExclusions.has(b.id))
      .map((b) => ({ owner: b.id, layer: 'child' }));
    const outer = this.diagnostics.outerContext;
    if (outer?.parent === r.id) copies.push({ owner: outer.owner, layer: 'parent' });
    for (const copy of copies) {
      this.buildingActor = `player-copy/${copy.layer}/${copy.owner}`; this.actorPartIndex = 0;
      const transform = containmentTransform(state, copy.owner, copy.layer === 'child');
      const replicas = parts.map((source) => {
        const part = this.part(transformPoint(source.position, transform), [1, 1, 1], source.color);
        part.mesh.geometry = source.mesh.geometry; part.mesh.material = source.mesh.material;
        if (copy.layer === 'parent') part.externalGroup = 'outer/player';
        this.resize(part, transform.scale, transform.scale, transform.scale);
        return part;
      });
      this.playerCopies.push({ ...copy, transform, parts: replicas });
    }
    this.buildingActor = undefined;
    this.diagnostics.boxInstances = [...this.boxInstances].map(([id, count]) => ({ id, count }));
    this.finishParts();
    this.jump = jump;
  }
  private drawRoom(r: Room, previous: State | undefined, transfers: BoxTransfer[], outer = false): void {
    this.drawingRoom = r.id; this.drawingPrevious = previous;
    const state = this.state!, n = r.size, palette = roomMaterialKeys(mapRoomTheme(r));
    this.part([0, -0.47, 0], [n + 0.3, 0.8, n + 0.3], palette.edge, 0.25);
    this.part([0, -0.12, 0], [n + 0.2, 0.24, n + 0.2], palette.floor, 0.15);
    const tiles = r.floorTiles ?? Array.from({ length: n * n }, (_, i) =>
      [Math.floor(i / n), 0, i % n] as Vec);
    for (const [x, y, z] of tiles)
      this.part(
        this.at([x, y + 0.004, z]),
        [1, 0, 1],
        (x + z) % 2 ? palette.tile : palette.floor,
        0, false, 'plane',
      );
    // Walls retain their actual collision height. Connected voxels share solid runs.
    const {pieces, arches} = this.roomWalls(r);
    for (const [index, run] of pieces.entries()) {
      this.drawingExternalGroup = outer ? `wall/${r.id}/${index}` : undefined;
      const min = this.at(run.min),
        max = this.at(run.max);
      const center = min.map((v, i) => (v + max[i]!) / 2) as Vec;
      const size = min.map((v, i) => max[i]! - v) as Vec;
      const wall = this.part(center, size, palette.wall, 0.085);
      const cap = this.part(
        [center[0], max[1] - 0.04, center[2]],
        [size[0], 0.165, size[2]],
        palette.wallTop,
        0.08,
      );
      wall.wallSurface = {room:r.id,top:false,lod:false}; cap.wallSurface = {room:r.id,top:true,lod:false};
      if (!outer) this.walls.push({ min, max, parts: [wall, cap], faded: false });
    }
    for (const [index, arch] of arches.entries()) {
      this.drawingExternalGroup = outer ? `wall/${r.id}/arch-${index}` : undefined;
      const min=this.at(arch.min),max=this.at(arch.max),center=this.at(arch.center),parts: Part[]=[];
      for (const [surface,color,top] of [[arch.body,palette.wall,false],[arch.roof,palette.wallTop,true]] as const) {
        if (!surface.indices.length) continue;
        const part=this.part(center,arch.size,color,0,false,surface);
        part.wallSurface={room:r.id,top,lod:false};parts.push(part);
      }
      if (!outer) this.walls.push({min,max,parts,faded:false});
    }
    this.drawingExternalGroup = undefined;
    if (!outer) {
      this.diagnostics.roundedWallPieces = this.walls.length;
      this.diagnostics.archedWallCells = r.barriers?.length ?? 0;
      this.diagnostics.wallHeight = Math.max(0, ...r.walls.map((p) => p[1] + 1));
    }
    if (r.exitLabel) {
      for (const { direction: d } of entrances(r)) {
        const mid = Math.floor(n / 2), p = this.at([mid + d[0] * mid, 0, mid + d[2] * mid]);
        const angle = Math.atan2(d[0], d[2]);
        const shaft = this.part([p[0] - d[0] * 0.08, 0.07, p[2] - d[2] * 0.08], [0.095, 0.035, 0.4], 'mint', 0.018);
        this.rotate(shaft, angle);
        for (const side of [-1, 1]) {
          const tip = this.part([p[0] + d[0] * 0.12 + d[2] * side * 0.09, 0.07,
            p[2] + d[2] * 0.12 - d[0] * side * 0.09], [0.09, 0.035, 0.27], 'mint', 0.018);
          this.rotate(tip, angle + side * Math.PI / 4);
        }
        const entry = this.labels[this.labelCursor++] ?? this.newLabel();
        entry.node.text(r.exitLabel);
        entry.room=r.id; entry.outer=outer; entry.anchor=[...p];
        entry.pos = this.drawingSpace ? transformPoint([p[0], 0.36, p[2]], this.drawingSpace) : [p[0], 0.36, p[2]];
      }
    }
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
        id: (outer ? 'outer/' : '') + plate.id,
        ...(this.drawingSpace ? { space: this.drawingSpace } : {}),
        kind: 'button',
        room: r.id,
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
      const [x, y, z] = gate.pos, width = gate.width ?? 1,
        across = gate.axis === 'x';
      const pos = (u: number, height: number): Vec => [
        x + (across ? u + (width-1)/2 : 0),
        y + height,
        z + (across ? 0 : u + (width-1)/2),
      ];
      const indicators: Part[] = [];
      for (const sign of [-1, 1]) {
        this.part(
          this.at(pos(sign * (width/2+0.07), 0.54)),
          [0.12, 1.08, 0.12],
          'iron',
          0.025,
        );
        indicators.push(this.part(
          this.at(pos(sign * (width/2+0.07), 1.105)),
          [0.17, 0.09, 0.17],
          powered ? 'mint' : 'gold',
          0.035,
        ));
      }
      this.part(
        this.at(pos(0, 0.047)),
        across ? [width+0.03, 0.025, 0.22] : [0.22, 0.025, width+0.03],
        'iron',
        0.01,
      );
      const parts: Part[] = [];
      for (const u of Array.from({length:width*5},(_,i)=>-width/2+0.1+i*0.2))
        mechanismPart(parts, pos(u, 0.58), [0.055, 1.02, 0.055], 'iron');
      for (const h of [0.23, 0.92])
        mechanismPart(
          parts,
          pos(0, h),
          across ? [width-0.05, 0.07, 0.075] : [0.075, 0.07, width-0.05],
          'iron',
        );
      this.mechanisms.push({
        id: (outer ? 'outer/' : '') + gate.id,
        ...(this.drawingSpace ? { space: this.drawingSpace } : {}),
        kind: 'gate',
        room: r.id,
        indicators,
        parts,
        from: wasOpen ? -1.18 : 0,
        to: open ? -1.18 : 0,
        active: open,
        powered,
      });
    }
    for (let i = 0; i < r.goals.length; i++)
      this.marker(r.goals[i]!, r.anyGoalColor ? 'neutralGoal' : goalColor(r, i), false);
    if (r.home) this.marker(r.home, 'mint', true);
    if (!outer) this.diagnostics.decorations = (r.decorations ?? []).map((d) => ({ ...d, pos: [...d.pos] }));
    for (const d of r.decorations ?? []) {
      this.drawingExternalGroup = outer ? `decoration/${d.id}` : undefined; this.decoration(d.pos, d.type);
    }
    this.drawingExternalGroup = undefined;
    const visibleBoxes = state.boxes.filter((b) => b.room === r.id && (!outer || (b.id !== this.diagnostics.outerContext?.owner && !this.previewExclusions.has(b.id))));
    for (const transfer of transfers) {
      if (
        previous &&
        transfer.fromRoom === r.id && (!outer || !this.previewExclusions.has(transfer.box)) &&
        !visibleBoxes.some((b) => b.id === transfer.box)
      )
        visibleBoxes.push(previous.boxes.find((b) => b.id === transfer.box)!);
    }
    for (const b of visibleBoxes) {
      this.buildingPreviewBox = outer ? b.id : undefined;
      this.buildingActor = (outer ? 'outer/' : '') + b.id; this.actorPartIndex = 0;
      this.boxInstances.set(b.id, (this.boxInstances.get(b.id) ?? 0) + 1);
      const old = previous?.boxes.find((v) => v.id === b.id && v.room === r.id);
      const transfer = transfers.find((t) => t.box === b.id);
      const travel =
        transfer && previous
          ? boxTravel(transfer, r.id, previous, state, 'arrival')
          : undefined;
      if (travel) {
        travel.from = this.at(travel.from);
        travel.to = this.at(travel.to);
      }
      this.drawBox(b, old, travel, this.buildingActor);
    }
    this.buildingActor = undefined; this.buildingPreviewBox = undefined;
    this.drawingRoom = undefined; this.drawingPrevious = undefined;
  }
  /** Reuse the same model at each visible occurrence; containers stop at this LOD. */
  private drawBox(b: Box, old: Box | undefined, travel: BoxTravel | undefined, id: string, terminal = false): void {
    this.buildingActor = id; this.actorPartIndex = 0;
    const state = this.state!;
    const p = this.at(b.pos),
      body: Part[] = [];
    const unit = b.size;
    const complete =
      !!b.inside && state.completed.includes(state.rooms[b.inside]!.level);
    const color = boxSurfaceColor(b);
    const addPart = (o: Vec, size: Vec, c: string, rad = 0.09, alpha = 1, surface?: 'plane' | SurfaceMesh, shape: boolean | 'cone' = false, detail = 3) => {
      const part = this.part(
        [p[0] + o[0], p[1] + o[1], p[2] + o[2]],
        size,
        c,
        rad, shape, surface, detail,
      );
      part.offset = o;
      part.alpha = alpha;
      if (alpha < 1) part.mesh.material = this.material(c, alpha);
      body.push(part);
      return part;
    };
    const center = (unit - 1) / 2;
    if (b.inside && !terminal) {
      this.drawContainer(b, addPart, !this.drawingSpace);
      if (!b.levelEntry && (b.room === 'world' || b.portal)) {
        const entry = this.labels[this.labelCursor++] ?? this.newLabel();
        entry.room=b.room; entry.outer=!!this.drawingSpace; entry.anchor=[p[0]+center,p[1],p[2]+center];
        entry.node.text((b.label ?? String(state.rooms[b.inside]!.level).padStart(2, '0')) + (complete ? ' ✓' : ''), complete);
        entry.pos = this.drawingSpace ? transformPoint([p[0], 1.35, p[2]], this.drawingSpace) : [p[0], 1.35, p[2]];
      }
    } else {
      addPart(
        [center, 0.46 * unit, center],
        [0.86 * unit, 0.86 * unit, 0.86 * unit],
        color,
        0.1 * unit,
      );
      // A flat white target outline; no side badges or raised ribbon geometry.
      for (const [x, z, w, d] of GOAL_FRAME) {
        const scale = unit * 0.8;
        addPart([center + x * scale, unit * 0.894, center + z * scale],
          [w * scale, 0, d * scale], 'white', 0, 1, 'plane');
      }
    }
    if (complete && b.levelEntry) {
      const corner = center + unit * .32;
      addPart([corner, unit * 1.11, center - unit * .32], [unit * .025, unit * .42, unit * .025], 'cream', unit * .008);
      addPart([corner - unit * .12, unit * 1.23, center - unit * .32], [unit * .25, unit * .16, unit * .035], 'redFriend', unit * .012);
      this.diagnostics.flags.push(id);
    }
    this.actors.push({
      id,
      ...(this.drawingSpace ? { space: this.drawingSpace } : {}),
      parts: body,
      from: old ? this.at(old.pos) : p,
      to: p,
      player: false,
      travel,
      center,
    });
    this.buildingActor = undefined;
  }
  private drawContainer(b: Box, addPart: (o: Vec, size: Vec, color: string, radius?: number, alpha?: number, surface?: 'plane' | SurfaceMesh, shape?: boolean | 'cone', detail?: number) => Part, countDoors = false): void {
    const state = this.state!, unit = b.size, center = (unit - 1) / 2;
    const complete = state.completed.includes(state.rooms[b.inside!]!.level);
    const color = boxSurfaceColor(b);
    // Transparent cubic casing, actual first child room at its real scale.
    // Its children are terminal LOD boxes; cyclic maps cannot expand forever.
    const inner = state.rooms[b.inside!]!, step = unit / inner.size, palette = roomMaterialKeys(mapRoomTheme(inner));
    const map = (v: Vec): Vec => [center + (v[0] - (inner.size - 1) / 2) * step * (b.flipped ? -1 : 1),
      unit * 0.055 + v[1] * step, center + (v[2] - (inner.size - 1) / 2) * step];
    const mini = (v: Vec, size: Vec, c: string, radius = 0.06, surface?: 'plane' | SurfaceMesh, shape: boolean | 'cone' = false, detail = 3) =>
      addPart(map(v), size.map((x) => x * step) as Vec, c, radius * step, 1,
        surface && typeof surface !== 'string' ? {...surface,scale:step,flipX:!!b.flipped} : surface, shape, detail);
    mini([(inner.size - 1) / 2, -0.12, (inner.size - 1) / 2], [inner.size, 0.24, inner.size], palette.floor);
    const tiles = inner.floorTiles ?? Array.from({length: inner.size * inner.size}, (_, i) => [Math.floor(i / inner.size), 0, i % inner.size] as Vec);
    for (const [x, y, z] of tiles)
      mini([x, y + 0.004, z], [1, 0, 1], (x + z) % 2 ? palette.tile : palette.floor, 0, 'plane');
    for (const run of this.roomWalls(inner).pieces) {
      const v = run.min.map((x, i) => (x + run.max[i]!) / 2) as Vec;
      const size = run.min.map((x, i) => run.max[i]! - x) as Vec;
      mini(v, size, palette.wall, 0.085).wallSurface = {room:inner.id,top:false,lod:true};
      mini([v[0], run.max[1] - 0.04, v[2]], [size[0], 0.165, size[2]], palette.wallTop, 0.08).wallSurface = {room:inner.id,top:true,lod:true};
    }
    for (const arch of this.roomWalls(inner).arches) {
      if (arch.body.indices.length) mini(arch.center,arch.size,palette.wall,0,arch.body).wallSurface={room:inner.id,top:false,lod:true};
      if (arch.roof.indices.length) mini(arch.center,arch.size,palette.wallTop,0,arch.roof).wallSurface={room:inner.id,top:true,lod:true};
    }
    for (let i = 0; i < inner.goals.length; i++) {
      const g = inner.goals[i]!, c = inner.anyGoalColor ? 'neutralGoal' : goalColor(inner, i);
      for (const [x, z, w, d] of GOAL_FRAME)
        mini([g[0] + x!, g[1] + GOAL_MARKER_Y, g[2] + z!], [w!, GOAL_MARKER_HEIGHT, d!], c, GOAL_MARKER_RADIUS);
    }
    if (inner.home) {
      const g = inner.home;
      mini([g[0], g[1] + 0.07, g[2]], [0.72, 0.055, 0.72], 'white');
      for (const x of [-0.14, 0.14]) mini([g[0] + x, g[1] + 0.11, g[2] - 0.12], [0.065, 0.023, 0.1], 'mint', 0.01);
      mini([g[0], g[1] + 0.11, g[2] + 0.14], [0.3, 0.023, 0.06], 'mint', 0.01);
    }
    for (const child of state.boxes.filter((v) => !(inner.id === b.room && !this.drawingSpace) && v.room === inner.id && v.id !== this.promotedPreviewChild && !this.previewExclusions.has(v.id))) {
      const firstPart = this.partCursor;
      const parentPreview = this.buildingPreviewBox;
      this.buildingPreviewBox = child.id;
      this.boxInstances.set(child.id, (this.boxInstances.get(child.id) ?? 0) + 1);
      const middle = (child.size - 1) / 2, g = child.pos;
      mini([g[0] + middle, g[1] + child.size * 0.46, g[2] + middle],
        [child.size * 0.86, child.size * 0.86, child.size * 0.86], boxSurfaceColor(child), child.size * 0.08);
      if (child.inside) mini([g[0] + middle, g[1] + child.size * 0.91, g[2] + middle], [child.size * 0.6, child.size * 0.025, child.size * 0.6], roomMaterialKeys(mapRoomTheme(state.rooms[child.inside]!)).floor);
      else mini([g[0] + middle, g[1] + child.size * 0.9, g[2] + middle], [child.size * 0.25, child.size * 0.045, child.size * 0.83], 'cream');
      const old = this.drawingPrevious?.boxes.find((v) => v.id === child.id && v.room === child.room);
      if (old && !eq(old.pos, child.pos)) this.previewMotions.push({
        parts: this.partPool.slice(firstPart).map((part) => ({ part, offset: [...part.offset] })),
        from: [...old.pos], to: [...child.pos], step, flipX:!!b.flipped,
      });
      this.buildingPreviewBox = parentPreview;
    }
    for (const plate of inner.buttons ?? []) mini([plate.pos[0], plate.pos[1] + 0.07, plate.pos[2]], [0.48, 0.08, 0.48], platePressed(state, inner.id, plate) ? 'mint' : 'gold');
    for (const gate of inner.gates ?? []) {
      const h = gateOpen(state, inner.id, gate) ? 0.04 : 1;
      for (const cell of gateCells(gate)) for (const x of [-0.35, 0, 0.35]) mini([cell[0] + (gate.axis === 'x' ? x : 0), cell[1] + h / 2, cell[2] + (gate.axis === 'z' ? x : 0)], [0.06, h, 0.06], 'iron', 0.01);
    }
    for (const d of inner.decorations ?? []) for (const piece of decorationParts(d.type))
      mini(d.pos.map((v,i)=>v+piece.offset[i]!) as Vec,piece.size,piece.color,piece.radius,undefined,piece.shape,DECORATION_BEVEL_SEGMENTS);
    // Thin translucent panels preserve a cubic silhouette without an opaque lid.
    for (const sign of [-1, 1]) {
      addPart([center + sign * unit * 0.48, unit * 0.49, center], [unit * 0.015, unit * 0.98, unit * 0.98], color, 0.004, 0.24);
      addPart([center, unit * 0.49, center + sign * unit * 0.48], [unit * 0.98, unit * 0.98, unit * 0.015], color, 0.004, 0.24);
    }
    addPart([center, unit * 0.985, center], [unit * 0.98, unit * 0.015, unit * 0.98], color, 0.004, 0.06);
    const doors = (b.portal ? boundaryEntrances(inner) : entrances(inner)).map(e => e.direction);
    for (const d of doors) {
      if (countDoors) this.doorCount++;
      addPart([center + d[0] * unit * 0.49, unit * 0.025, center + d[2] * unit * 0.49],
        d[0] ? [unit * 0.025, unit * 0.045, unit * 0.24] : [unit * 0.24, unit * 0.045, unit * 0.025], complete ? 'gold' : 'mint', 0.005);
    }
  }
  /** Parent geometry uses the containing box scale, with the same bounded part pool. */
  private drawOuterContext(previous: State | undefined, transfers: BoxTransfer[]): void {
    const context = this.diagnostics.outerContext;
    if (!context) return;
    this.parentSpace = containmentTransform(this.state!, context.owner, false);
    this.parentBase = { ...this.parentSpace, offset: [...this.parentSpace.offset] };
    this.drawingSpace = this.parentSpace; this.drawingOuter = true;
    const start = this.partCursor, firstLabel = this.labelCursor;
    this.drawRoom(this.state!.rooms[context.parent]!, previous, transfers, true);
    this.drawingSpace = undefined; this.drawingOuter = false;
    this.diagnostics.parentSceneParts = this.partCursor - start;
    const moving = new Set(this.mechanisms.flatMap((m) => m.parts));
    this.outerStaticParts = this.partPool.slice(start).filter((p) => !p.actorKey && !moving.has(p))
      .map((part) => ({ part, position: [...part.position] }));
    this.outerLabels = this.labels.slice(firstLabel, this.labelCursor).map((entry) => ({ entry, position: [...entry.pos] }));
  }
  /** Geometry and collision type come from the same numeric decoration enum. */
  private decoration(pos: Vec, type: DecorationKind): void {
    for (const piece of decorationParts(type))
      this.part(this.at(pos.map((v,i)=>v+piece.offset[i]!) as Vec),piece.size,piece.color,piece.radius,piece.shape,undefined,DECORATION_BEVEL_SEGMENTS);
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
    for (const [dx, dz, w, d] of GOAL_FRAME)
      this.part(
        [p[0] + dx!, p[1] + GOAL_MARKER_Y, p[2] + dz!],
        [w!, GOAL_MARKER_HEIGHT, d!],
        color,
        GOAL_MARKER_RADIUS,
      );
  }
  private fadeExterior(planar: boolean): void {
    // Every rebuild assigns the base materials, including a 3D -> planar portal.
    // Planar rooms never fade exteriors, so skip grouping and bounding all meshes.
    if (planar) { this.diagnostics.fadedOuterObjects.length = 0; return; }
    this.occlusionPasses++;
    const groups = new Map<string, { parts: Part[]; min: Vec; max: Vec }>();
    for (const part of this.partPool) if (part.externalGroup) {
      let group = groups.get(part.externalGroup);
      if (!group) { group = { parts: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; groups.set(part.externalGroup, group); }
      group.parts.push(part);
      const size = this.geometrySizes.get(part.mesh.geometry as Geometry3D)!;
      const x = size[0] * Math.abs(part.scale[0]) / 2, y = size[1] * Math.abs(part.scale[1]) / 2, z = size[2] * Math.abs(part.scale[2]) / 2;
      const c = Math.abs(Math.cos(part.yaw)), s = Math.abs(Math.sin(part.yaw));
      const extent = [x * c + z * s, y, z * c + x * s];
      for (let i = 0; i < 3; i++) { group.min[i] = Math.min(group.min[i]!, part.position[i]! - extent[i]!); group.max[i] = Math.max(group.max[i]!, part.position[i]! + extent[i]!); }
    }
    if(!groups.size){this.diagnostics.fadedOuterObjects.length=0;return;}
    const room = this.state!.rooms[this.current]!, mid = (room.size - 1) / 2;
    const targets: Vec[] = [];
    if (!planar) {
      for (let x = 0; x < room.size; x++) for (let z = 0; z < room.size; z++)
        if (!room.walls.some((p) => p[0] === x && p[1] === 0 && p[2] === z)) targets.push([x - mid, .15, z - mid]);
      const player = this.actors.find((a) => a.player)!; targets.push([...player.parts[0]!.position]);
    }
    const eye = Array.from(this.orbit.eyePosition) as Vec;
    if (this.mirrored) eye[0] *= -1;
    this.diagnostics.fadedOuterObjects = [];
    for (const [id, group] of groups) {
      const faded = !planar && group.max[1] > .05 && targets.some((target) => occludesPoint(eye, target, group.min, group.max));
      for (const part of group.parts) {
        const alpha = faded ? Math.min(part.alpha ?? 1, .15) : part.alpha ?? 1;
        part.mesh.material = this.material(part.color, alpha);
      }
      if (faded) this.diagnostics.fadedOuterObjects.push({ id, parts: group.parts.length, opacity: .15 });
    }
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
    ) { if(this.presentationOnly){this.presentationOnly=false;this.world.update(time,delta);} return; }
    this.presentationOnly=false;
    const now = this.clock();
    this.mirrored = playerMirrored(this.state);
    this.diagnostics.mirrored = this.mirrored;
    const sign = this.mirrored ? -1 : 1;
    if (this.occurrenceTransform.scale[0] !== sign) this.occurrenceTransform.setScale(sign, 1, 1);
    const portal = this.portal;
    const travel = portal
      ? portalPose(Math.max(0, now - portal.started))
      : null;
    const width = this.canvas.clientWidth,
      height = this.canvas.clientHeight,
      aspect = width / Math.max(1, height),
      n = this.state.rooms[this.current]!.size;

    const planar = !!this.state.rooms[this.current]!.planar;
    const angles = mapCameraAngles(planar);
    let { phi, theta } = angles;
    const homeOffset = this.home && aspect > 1 ? -(n * 0.27) : 0;
    let radius = mapCameraRadius(n, aspect, phi, theta, this.home ? 0.6 : MAP_COVERAGE);
    let tx = homeOffset,
      ty = 0.25,
      tz = homeOffset * -0.35;
    if (portal && travel) {
      const t = travel.phase, from = portal.cameraFrom;
      const endRadius = radius;
      radius = Math.exp(Math.log(Math.max(0.001, from.radius)) * (1 - t) + Math.log(endRadius) * t);
      const remaining = Math.abs(from.radius - endRadius) > 0.001 ? (radius - endRadius) / (from.radius - endRadius) : 1 - t;
      phi += (from.phi - phi) * (1 - t); theta += (from.theta - theta) * (1 - t);
      tx += (from.target[0] - tx) * remaining;
      ty += (from.target[1] - ty) * remaining;
      tz += (from.target[2] - tz) * remaining;
      if (!travel.active) {
        this.portal = undefined;
        this.rebuild(portal.state);
        this.measureDuration();
      }
    }
    tx *= sign;
    const bounce = jumpPose(now - this.jumpStart);
    const elapsed = now - this.start;
    const celebration = celebrationPose(this.clock() - this.celebrateStart);
    // Every visible occurrence shares one movement clock. When the containing
    // self box moves, the entire parent scene follows its animated frame too.
    if (this.parentSpace && this.parentBase) {
      const owner = this.actors.find((a) => a.id === this.diagnostics.outerContext?.owner);
      const position = owner ? movementPose(owner.from, owner.to, elapsed, false, false, this.duration).position : undefined;
      const delta = [0, 1, 2].map((i) => position && owner ? (owner.to[i]! - position[i]!) * this.parentSpace!.scale : 0) as Vec;
      this.parentSpace.offset = this.parentBase.offset.map((v, i) => v + delta[i]!) as Vec;
      for (const { part, position: p } of this.outerStaticParts) this.place(part, p[0] + delta[0], p[1] + delta[1], p[2] + delta[2]);
      for (const { entry, position: p } of this.outerLabels) {
        const pos = p.map((v, i) => v + delta[i]!) as Vec;
        if (!eq(pos, entry.pos)) { entry.pos = pos; this.labelsDirty = true; }
      }
    }
    for (const motion of this.previewMotions) {
      const position = movementPose(motion.from, motion.to, elapsed, false, false, this.duration).position;
      for (const { part, offset } of motion.parts)
        for (const i of [0, 1, 2]) part.offset[i] = offset[i]! + (position[i]! - motion.to[i]!) * motion.step * (i===0 && motion.flipX ? -1 : 1);
    }
    Object.assign(this.diagnostics, {
      wallRuns: this.walls.length,
      moving: this.moving,
      jumping: bounce.active,
      transitioning: this.transitioning,
      portalPhase: travel?.phase ?? 0,
      cameraRadius: this.orbit.radius,
      cameraPhi: this.orbit.phi,
      cameraTheta: this.orbit.theta,
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
        this.place(part, ...(m.space ? transformPoint([part.offset[0], part.offset[1] + offset, part.offset[2]], m.space)
          : [part.offset[0], part.offset[1] + offset, part.offset[2]] as Vec));
      return {
        id: m.id,
        kind: m.kind,
        active: m.active,
        powered: m.powered,
        offset,
      };
    });
    this.diagnostics.mechanisms = this.diagnostics.mechanisms.filter((m) => !m.id.startsWith('outer/'));
    if (elapsed >= BOX_TRANSFER_MS && this.actors.some((a) => a.retiring)) {
      const expired = new Set(this.actors.filter((a) => a.retiring).flatMap((a) => a.parts));
      for (const part of expired) { part.entity.destroy(); this.destroyedParts++; }
      this.actors = this.actors.filter((a) => !a.retiring);
      this.partPool = this.partPool.filter((p) => !expired.has(p));
      this.entities = this.partPool.map((p) => p.entity); this.partCursor = this.partPool.length;
      this.diagnostics.actorEntities = this.actors.map((a) => ({ id: a.id, entities: a.parts.map((p) => p.entity.id) }));
    }

    this.diagnostics.boxTransfers.length = 0;
    this.diagnostics.boxPositions.length = 0;
    this.diagnostics.outerBoxPositions.length = 0;
    for (const a of this.actors) {
      if (a.childOwner && a.space) {
        const base = containmentTransform(this.state, a.childOwner);
        const owner = this.actors.find((v) => v.id === a.childOwner);
        const pos = owner ? movementPose(owner.from, owner.to, elapsed, false, false, this.duration).position : undefined;
        a.space.offset = base.offset.map((v, i) => v + (owner && pos ? pos[i]! - owner.to[i]! : 0)) as Vec;
      }
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
      const crossing = a.travel ? boxTravelPose(a.travel, a.player ? elapsed * BOX_TRANSFER_MS / PORTAL_MS : elapsed) : undefined;
      const position = crossing?.position ?? pose.position;
      if (a.space && a.id.startsWith('outer/')) this.diagnostics.outerBoxPositions.push({ id: a.id.slice('outer/'.length),
        position: [...position], rendered: transformPoint(position, a.space), scale: a.space.scale });
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
      if (crossing && !a.player) {
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
        this.diagnostics.playerScale = scale;
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
      if (a.settled && !cheer && !(a.player && bounce.active) && !(a.space && this.moving)) continue;
      a.settled = elapsed >= this.duration && !cheer && !(a.player && bounce.active);
      for (const part of a.parts) {
        const o = crossing
          ? ([
              center + (part.offset[0] - center) * scale,
              part.offset[1] * scale,
              center + (part.offset[2] - center) * scale,
            ] as Vec)
          : part.offset;
        const point: Vec = [position[0] + (o[0] * c + o[2] * s) * (1 + squash),
          position[1] + o[1] * (1 - squash) + hop,
          position[2] + (o[2] * c - o[0] * s) * (1 + squash)];
        this.place(part, ...(a.space ? transformPoint(point, a.space) : point));
        this.rotate(part, yaw);
        const hidden = part.expression === 'smile'
          ? cheer && celebration.laugh
          : part.expression === 'laugh'
            ? !(cheer && celebration.laugh)
            : false;
        this.resize(
          part,
          hidden ? 0.0001 : (1 + squash) * scale * (a.space?.scale ?? 1),
          hidden ? 0.0001 : (1 - squash) * scale * (a.space?.scale ?? 1),
          hidden ? 0.0001 : (1 + squash) * scale * (a.space?.scale ?? 1),
        );
      }
    }
    const player = this.actors.find((a) => a.player)!;
    this.diagnostics.playerInstances = [{ layer: 'current', position: [...player.parts[0]!.position], scale: player.parts[0]!.scale[0] }];
    for (const copy of this.playerCopies) {
      const base = copy.layer === 'parent' ? this.parentSpace ?? copy.transform : copy.transform;
      const transform = { ...base, offset: [...base.offset] as Vec };
      // Keep a miniature attached to its actual moving container, not its target cell.
      const owner = this.actors.find((a) => a.id === copy.owner);
      if (copy.layer === 'child' && owner) {
        const pos = movementPose(owner.from, owner.to, elapsed, false, false, this.duration).position;
        transform.offset = transform.offset.map((v, i) => v + pos[i]! - owner.to[i]!) as Vec;
      }
      copy.parts.forEach((part, i) => {
        const source = player.parts[i]!;
        this.place(part, ...transformPoint(source.position, transform));
        this.rotate(part, source.yaw);
        this.resize(part, ...source.scale.map((v) => v * transform.scale) as Vec);
      });
      this.diagnostics.playerInstances.push({ layer: copy.layer, owner: copy.owner,
        position: [...copy.parts[0]!.position], scale: copy.parts[0]!.scale[0] });
    }
    // Geometry is already at this frame's animated positions/scales. Conservative
    // shared local spheres cover walls, player poses and retained portal scenes.
    const basis = mapBasis(phi, theta);
    let back = 0, front = 0;
    for (const part of this.partPool) {
      const extent = this.geometryRadii.get(part.mesh.geometry as Geometry3D)! * Math.max(Math.abs(part.scale[0]), Math.abs(part.scale[1]), Math.abs(part.scale[2]));
      const depth = (part.position[0] * sign - tx) * basis.back[0] + (part.position[1] - ty) * basis.back[1] + (part.position[2] - tz) * basis.back[2];
      back = Math.min(back, depth - extent); front = Math.max(front, depth + extent);
    }
    const near = Math.max(.001, Math.min(.1, radius * .01)), far = Math.max(100, radius - back + 4);
    const cameraChanged =
      this.cameraPose[0] !== width || this.cameraPose[1] !== height ||
      this.cameraPose[2] !== radius || this.cameraPose[3] !== tx ||
      this.cameraPose[4] !== ty || this.cameraPose[5] !== tz ||
      this.cameraPose[6] !== phi || this.cameraPose[7] !== theta || this.cameraPose[8] !== far;
    if (cameraChanged) {
      this.camera.updateAspect(aspect);
      this.camera.fov = MAP_FOV;
      this.camera.near = near; this.camera.far = far;
      this.orbit.set(radius, theta, phi); this.orbit.setTarget(tx, ty, tz);
      this.cameraPose = [width, height, radius, tx, ty, tz, phi, theta, far];
    }
    this.diagnostics.cameraRadius = radius;
    this.diagnostics.cameraPhi = phi; this.diagnostics.cameraTheta = theta;
    this.diagnostics.viewMode = planar ? 'planar' : 'spatial';
    this.fadeExterior(planar);
    this.diagnostics.cameraDepthRange = { min: radius - front, max: radius - back, near, far };
    this.diagnostics.fadedWalls = 0;
    if ((cameraChanged || this.labelsDirty || this.moving || this.transitioning || this.wasAnimating) && this.labels.length) {
      const vp = mat4.multiply(
        this.camera.projectionMatrix,
        mat4.inverse(this.orbit.localMatrix, this.inverseView),
        this.viewProjection,
      );
      for (const entry of this.labels) {
        const {node,pos}=entry;
        const [px, y, z] = pos;
        const x = px * sign;
        const w = vp[3]! * x + vp[7]! * y + vp[11]! * z + vp[15]!;
        const sx = (vp[0]! * x + vp[4]! * y + vp[8]! * z + vp[12]!) / w,
          sy = (vp[1]! * x + vp[5]! * y + vp[9]! * z + vp[13]!) / w;
        const depth = (vp[2]! * x + vp[6]! * y + vp[10]! * z + vp[14]!) / w;
        entry.visible = depth >= 0 && depth <= 1 && labelIsNear(entry.room,this.current,entry.outer,entry.anchor,player.parts[0]!.position);
        node.project(((sx + 1) * width) / 2, ((1 - sy) * height) / 2, entry.visible);
      }
    }
    this.labelsDirty = false;
    // A reflected hierarchy reverses triangle winding. Reuse the same geometry
    // and material objects, updating the engine's pipeline state only on parity changes.
    for (const geometry of this.geometries.values()) geometry.frontFace = this.mirrored ? 'cw' : 'ccw';
    const renderedState=this.state, renderedHome=this.home;
    this.world.update(time, delta);
    this.needsFrame = renderedState !== this.state || renderedHome !== this.home;
    this.wasAnimating = this.moving || this.transitioning || this.airborne || this.celebrating;
    this.renderedHome = renderedHome;
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
    this.wallLayouts = new WeakMap();
    this.state = null;
    this.destroyedParts += this.entities.length;
    this.partPool.length = 0;
    this.labels.length = 0;
    this.walls.length = 0;
    this.mouthSmile.length = 0;
    this.mouthLaugh.length = 0;
    this.entities = [];
    this.actors = [];
    this.playerCopies = []; this.outerStaticParts = []; this.outerLabels = []; this.previewMotions = []; this.parentSpace = undefined; this.parentBase = undefined;
    this.reusableParts = []; this.reservedParts.clear(); this.reusableShapes.clear(); this.reusedStatic.clear(); this.previewExclusions.clear(); this.boxInstances.clear();
    this.diagnostics.actorEntities = []; this.diagnostics.boxInstances = [];
    this.mechanisms = [];
    this.labelRoot.clear();
    this.reflectedGeometry = new WeakMap();
    this.geometries.clear(); this.geometryRadii = new WeakMap();
    this.materials.clear(); this.geometrySizes = new WeakMap();
  }
}
