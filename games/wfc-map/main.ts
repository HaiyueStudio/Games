import { EnvironmentLight } from '@haiyue/engine/lighting';
import { PbrMaterial } from '@haiyue/engine/material';
import { Render3DSystem } from '@haiyue/engine/systems';
import { Camera3D, CartesianTransform3D, DirectionalLight, Entity, Geometry3D, Mesh3D, OrbitControl, SphericalTransform3D, HaiyueEngine, World, createBox3D, createSphere3D } from '@haiyue/engine';
import { Ray } from '@haiyue/engine/math';
import { createCone3D } from '@haiyue/engine/geometry';
import { NavMesh, NavMeshPath } from '@haiyue/engine/navigation';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { mat4 } from 'wgpu-matrix';
import { UNITY_WFC_MODULES, UnityWfcModule } from './unityModuleData';
import {
  UNITY_WFC_SPAWN_FLAGS,
} from './unityModuleFaces';
import { requiredItemAt, requiredNumberAt } from '../arrayAccess';
import { SingleSlotGameSave, isNonNegativeInteger, isRecord } from '../save/SingleSlotGameSave';

interface WfcMapSaveData {
  seed: number;
  playerX: number;
  playerZ: number;
}

function isWfcMapSaveData(value: unknown): value is WfcMapSaveData {
  return isRecord(value)
    && isNonNegativeInteger(value.seed) && value.seed <= 0xffff_ffff
    && Number.isSafeInteger(value.playerX)
    && Number.isSafeInteger(value.playerZ);
}
import { UnityInfiniteWfcMap } from './UnityInfiniteWfc';
import { buildWfcGroundNavMesh } from './WfcGroundNavMesh';
import {
  describePlayableWfcSurface,
  isUsefulPlayableWfcSurface,
  selectPlayableWfcSurface,
  type WfcPlayableSurface,
  wfcSlotKey,
} from './WfcPlayableSurface';

type Color = [number, number, number, number];
type Vec3 = [number, number, number];

type FixedColumnMap = Map<string, number[]>;

interface ChunkRecord {
  key: string;
  cx: number;
  cz: number;
  entities: Entity[];
}

interface GeneratedColumn {
  globalX: number;
  globalZ: number;
  column: number[];
}

interface PickableMesh {
  name: string;
  geometry: Geometry3D;
  transform: CartesianTransform3D;
}

const SIZE_X = 5;
const SIZE_Y = 6;
const SIZE_Z = 5;
const CHUNK_SIZE = 5;
const VIEW_RADIUS_X = Math.floor(SIZE_X / 2);
const VIEW_RADIUS_Z = Math.floor(SIZE_Z / 2);
const BLOCK = 28;
const LAYER = BLOCK;
const START_X = Math.floor(SIZE_X / 2);
const START_Z = Math.floor(SIZE_Z / 2);

const WALL: Color = [0.84, 0.88, 0.89, 1];
const WALL_DARK: Color = [0.58, 0.66, 0.70, 1];
const FLOOR: Color = [0.78, 0.86, 0.88, 1];
const SHADOW: Color = [0.18, 0.28, 0.34, 1];
const WATER: Color = [0.42, 0.68, 0.78, 1];
const BLOCK_ASSET_SCALE = 1400;
const WFC_PROPAGATION_RADIUS = CHUNK_SIZE + 20;
const NAV_CELLS_PER_BLOCK = 7;
const NAV_AGENT_RADIUS = 3;
const PLAYER_RADIUS = 6.2;
const PLAYER_SPEED = 46;
const WALK_SURFACE_Y = BLOCK * 0.2;
const INITIAL_GENERATION_ATTEMPTS = 6;
const BUILD_TAG = 'unity-connected-surface-navmesh-v4';

function moduleAt(index: number): UnityWfcModule {
  return requiredItemAt(UNITY_WFC_MODULES, index, 'Unity WFC modules');
}

function createMirrorXGeometry(geometry: Geometry3D): Geometry3D {
  const positions = Float32Array.from(geometry.positions);
  for (let i = 0; i < positions.length; i += 3) positions[i] = -requiredNumberAt(positions, i, 'mirrored positions');

  const normals = geometry.normals ? Float32Array.from(geometry.normals) : undefined;
  if (normals) {
    for (let i = 0; i < normals.length; i += 3) normals[i] = -requiredNumberAt(normals, i, 'mirrored normals');
  }

  let indices: Uint16Array | Uint32Array | undefined;
  if (geometry.indices) {
    indices = geometry.indices instanceof Uint32Array
      ? Uint32Array.from(geometry.indices)
      : Uint16Array.from(geometry.indices);
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const b = requiredNumberAt(indices, i + 1, 'mirrored indices');
      indices[i + 1] = requiredNumberAt(indices, i + 2, 'mirrored indices');
      indices[i + 2] = b;
    }
  } else {
    for (let i = 0; i < positions.length; i += 9) {
      for (let c = 0; c < 3; c++) {
        const b = requiredNumberAt(positions, i + 3 + c, 'mirrored positions');
        positions[i + 3 + c] = requiredNumberAt(positions, i + 6 + c, 'mirrored positions');
        positions[i + 6 + c] = b;
        if (normals) {
          const nb = requiredNumberAt(normals, i + 3 + c, 'mirrored normals');
          normals[i + 3 + c] = requiredNumberAt(normals, i + 6 + c, 'mirrored normals');
          normals[i + 6 + c] = nb;
        }
      }
    }
  }

  return new Geometry3D({
    positions,
    ...(normals === undefined ? {} : { normals }),
    ...(indices === undefined ? {} : { indices }),
    textureCoordinates: [...geometry.textureCoordinates].map(([set, data]) => ({ set, data: Float32Array.from(data) })),
    textureCoordinateLayout: geometry.textureCoordinateLayout,
    ...(geometry.topology == null ? {} : { topology: geometry.topology }),
    ...(geometry.cullMode == null ? {} : { cullMode: geometry.cullMode }),
    ...(geometry.frontFace == null ? {} : { frontFace: geometry.frontFace }),
  });
}

function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

function createGableRoof3D(width: number, depth: number, height: number, ridgeAlongX: boolean): Geometry3D {
  const hw = width * 0.5;
  const hd = depth * 0.5;
  const y0 = -height * 0.5;
  const y1 = height * 0.5;
  const positions: number[] = [];
  const normals: number[] = [];

  const push = (...vertices: Vec3[]): void => {
    const normal = faceNormal(requiredItemAt(vertices, 0, 'roof face vertices'), requiredItemAt(vertices, 1, 'roof face vertices'), requiredItemAt(vertices, 2, 'roof face vertices'));
    for (const v of vertices) {
      positions.push(v[0], v[1], v[2]);
      normals.push(normal[0], normal[1], normal[2]);
    }
  };

  if (ridgeAlongX) {
    const nw: Vec3 = [-hw, y0, -hd];
    const ne: Vec3 = [hw, y0, -hd];
    const se: Vec3 = [hw, y0, hd];
    const sw: Vec3 = [-hw, y0, hd];
    const rw: Vec3 = [-hw, y1, 0];
    const re: Vec3 = [hw, y1, 0];
    push(nw, rw, re, nw, re, ne);
    push(sw, se, re, sw, re, rw);
    push(nw, sw, rw);
    push(ne, re, se);
  } else {
    const nw: Vec3 = [-hw, y0, -hd];
    const ne: Vec3 = [hw, y0, -hd];
    const se: Vec3 = [hw, y0, hd];
    const sw: Vec3 = [-hw, y0, hd];
    const rn: Vec3 = [0, y1, -hd];
    const rs: Vec3 = [0, y1, hd];
    push(nw, rn, rs, nw, rs, sw);
    push(ne, se, rs, ne, rs, rn);
    push(nw, ne, rn);
    push(sw, rs, se);
  }

  return new Geometry3D({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
  });
}

interface GltfBufferView { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }
interface GltfAccessor { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string }
interface GltfPrimitive { attributes: Record<string, number>; indices?: number; mode?: number }
interface GltfMeshDef { name?: string; primitives: GltfPrimitive[] }
interface BlocksGltf { bufferViews: GltfBufferView[]; accessors: GltfAccessor[]; meshes: GltfMeshDef[] }

interface BlockMeshEntry {
  geometry: Geometry3D;
}

class BlocksMeshLibrary {
  private geometries = new Map<string, BlockMeshEntry>();

  async load(src: string): Promise<void> {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`Failed to load block mesh library: ${response.status} ${response.statusText}`);
    const { gltf, binary } = this.parseGlb(await response.arrayBuffer());
    for (let meshIndex = 0; meshIndex < (gltf.meshes ?? []).length; meshIndex++) {
      const mesh = gltf.meshes[meshIndex];
      if (!mesh) continue;
      const primitive = mesh.primitives?.[0];
      if (!mesh.name || !primitive || primitive.mode !== undefined && primitive.mode !== 4) continue;
      const positionAccessor = primitive.attributes.POSITION;
      if (positionAccessor === undefined) continue;
      const positions = this.readFloatAccessor(gltf, binary, positionAccessor, 3);
      const normals = primitive.attributes.NORMAL !== undefined
        ? this.readFloatAccessor(gltf, binary, primitive.attributes.NORMAL, 3)
        : undefined;
      const indices = primitive.indices !== undefined ? this.readIndices(gltf, binary, primitive.indices) : undefined;
      const geometry = new Geometry3D({
        positions,
        ...(normals === undefined ? {} : { normals }),
        ...(indices === undefined ? {} : { indices }),
      });
      this.geometries.set(this.normalize(mesh.name), {
        geometry: createMirrorXGeometry(geometry),
      });
    }
  }

  get(baseName: string): BlockMeshEntry | null {
    return this.geometries.get(this.normalize(baseName)) ?? null;
  }

  private normalize(name: string): string {
    return name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private parseGlb(buffer: ArrayBuffer): { gltf: BlocksGltf; binary: ArrayBuffer } {
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Block mesh library is not a GLB file.');
    let offset = 12;
    let gltf: BlocksGltf | null = null;
    let binary: ArrayBuffer | null = null;
    while (offset + 8 <= view.byteLength) {
      const length = view.getUint32(offset, true);
      const type = view.getUint32(offset + 4, true);
      const start = offset + 8;
      const chunk = buffer.slice(start, start + length);
      if (type === 0x4e4f534a) gltf = JSON.parse(new TextDecoder().decode(chunk)) as BlocksGltf;
      if (type === 0x004e4942) binary = chunk;
      offset = start + length;
    }
    if (!gltf || !binary) throw new Error('Block mesh library is missing GLB chunks.');
    return { gltf, binary };
  }

  private readFloatAccessor(gltf: BlocksGltf, buffer: ArrayBuffer, accessorIndex: number, itemSize: number): Float32Array {
    const accessor = gltf.accessors[accessorIndex];
    if (!accessor) throw new Error(`Missing float accessor ${accessorIndex}.`);
    const view = gltf.bufferViews[accessor.bufferView ?? -1];
    if (!view || accessor.componentType !== 5126) throw new Error(`Unsupported float accessor ${accessorIndex}.`);
    const stride = view.byteStride ?? itemSize * 4;
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const data = new DataView(buffer);
    const out = new Float32Array(accessor.count * itemSize);
    for (let i = 0; i < accessor.count; i++) {
      for (let c = 0; c < itemSize; c++) out[i * itemSize + c] = data.getFloat32(start + i * stride + c * 4, true);
    }
    return out;
  }

  private readIndices(gltf: BlocksGltf, buffer: ArrayBuffer, accessorIndex: number): Uint16Array | Uint32Array {
    const accessor = gltf.accessors[accessorIndex];
    if (!accessor) throw new Error(`Missing index accessor ${accessorIndex}.`);
    const view = gltf.bufferViews[accessor.bufferView ?? -1];
    if (!view) throw new Error(`Unsupported index accessor ${accessorIndex}.`);
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const data = new DataView(buffer);
    if (accessor.componentType === 5125) {
      const out = new Uint32Array(accessor.count);
      for (let i = 0; i < accessor.count; i++) out[i] = data.getUint32(start + i * 4, true);
      return out;
    }
    const out = new Uint16Array(accessor.count);
    if (accessor.componentType === 5123) {
      for (let i = 0; i < accessor.count; i++) out[i] = data.getUint16(start + i * 2, true);
      return out;
    }
    if (accessor.componentType === 5121) {
      for (let i = 0; i < accessor.count; i++) out[i] = data.getUint8(start + i);
      return out;
    }
    throw new Error(`Unsupported index component type ${accessor.componentType}.`);
  }
}

class WfcCityGame {
  private readonly saves = new SingleSlotGameSave<WfcMapSaveData>({
    gameId: 'wfc-map',
    name: 'WFC Map 自动存档',
    validateData: isWfcMapSaveData,
  });
  private engine!: HaiyueEngine;
  private world!: World;
  private cameraEntity!: Entity;
  private orbitTransform!: SphericalTransform3D;
  private readonly generator = new UnityInfiniteWfcMap(SIZE_Y);
  private readonly blockMeshes = new BlocksMeshLibrary();
  private readonly entities: Entity[] = [];
  private readonly pickables: PickableMesh[] = [];
  private readonly generatedColumns: FixedColumnMap = new Map();
  private readonly chunks = new Map<string, ChunkRecord>();
  private readonly columnEntities = new Map<string, Entity[]>();
  private readonly materials = new Map<string, PbrMaterial>();
  private readonly roofGeometries = new Map<string, Geometry3D>();
  private readonly ray = new Ray();
  private readonly cameraPosition = new Float32Array(3);
  private readonly viewMatrix = mat4.identity() as Float32Array;
  private readonly viewProjMatrix = mat4.identity() as Float32Array;
  private readonly invViewProjMatrix = mat4.identity() as Float32Array;
  private navMesh: NavMesh | null = null;
  private playableSurface: WfcPlayableSurface | null = null;
  private playableAnchorKey: string | undefined;
  private readonly playerPath = new NavMeshPath();
  private readonly playerPosition = new Float32Array(3);
  private readonly playerCommandTarget = new Float32Array(3);
  private playerWaypoint = 0;
  private playerMoving = false;
  private hasPlayerCommand = false;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private seed = Math.floor(Math.random() * 100000);
  private minGeneratedX = 0;
  private maxGeneratedX = SIZE_X - 1;
  private minGeneratedZ = 0;
  private maxGeneratedZ = SIZE_Z - 1;
  private playerX = START_X;
  private playerZ = START_Z;
  private playerEntity!: Entity;
  private playerTransform!: CartesianTransform3D;
  private pressed = new Set<string>();
  private moveCooldown = 0;

  private readonly seedText = document.getElementById('seed')!;
  private readonly fixedSeedToggle = document.getElementById('fixed-seed') as HTMLInputElement;
  private readonly seedInput = document.getElementById('seed-input') as HTMLInputElement;
  private readonly backtracksText = document.getElementById('backtracks')!;
  private readonly pickedText = document.getElementById('picked')!;
  private readonly statusText = document.getElementById('status')!;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.engine = new HaiyueEngine({
      canvas,
      clearColor: { r: 0.72, g: 0.78, b: 0.82, a: 1 },
      msaaSamples: 4,
    });
    await this.engine.init();
    await this.blockMeshes.load('./assets/blocks.glb');
    this.world = new World('UnityWfcCity');
    this.setupCamera(canvas);
    this.setupLights();
    const render3DSystem = new Render3DSystem(this.engine, this.cameraEntity, { priority: 10, loadOp: 'clear' });
    this.world.addSystem(render3DSystem);
    const renderIntegration = new RenderIntegration(this.engine, { label: 'UnityWfcCity.render' });
    this.world.addRuntimeIntegration(renderIntegration);
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));
    canvas.addEventListener('pointerdown', event => {
      this.pointerDownX = event.clientX;
      this.pointerDownY = event.clientY;
    });
    canvas.addEventListener('pointerup', event => {
      if (Math.hypot(event.clientX - this.pointerDownX, event.clientY - this.pointerDownY) <= 5) {
        this.pickAt(canvas, event);
      }
    });
    this.seedInput.value = String(this.seed);
    this.seedInput.addEventListener('keydown', event => event.stopPropagation());
    document.getElementById('generate')!.addEventListener('click', () => this.resetWorld());
    window.addEventListener('keydown', event => {
      this.pressed.add(event.key);
      if (event.key.toLowerCase() === 'r') this.resetWorld();
      if (event.key.startsWith('Arrow')) event.preventDefault();
    });
    window.addEventListener('keyup', event => this.pressed.delete(event.key));
    const saved = await this.saves.load();
    if (saved) {
      this.fixedSeedToggle.checked = true;
      this.seedInput.value = String(saved.seed);
    }
    this.resetWorld(saved ?? undefined);
    this.engine.on('update', ({ detail: { time, delta } }) => this.tick(time, delta));
    this.engine.run();
  }

  private setupCamera(canvas: HTMLCanvasElement): void {
    const camera = new Camera3D({ type: 'perspective', fov: Math.PI / 4.8, near: 1, far: 4000 });
    this.orbitTransform = new SphericalTransform3D({
      radius: 360,
      theta: -Math.PI * 0.22,
      phi: Math.PI * 0.30,
      target: [0, 42, 0],
    });
    this.cameraEntity = new Entity('Camera');
    this.cameraEntity.addComponent(camera);
    this.cameraEntity.addComponent(this.orbitTransform);
    this.world.addEntity(this.cameraEntity);
    new OrbitControl(canvas, this.orbitTransform, {
      minRadius: 180,
      maxRadius: 720,
      minPhi: Math.PI * 0.12,
      maxPhi: Math.PI * 0.46,
      rotateSpeed: 0.58,
      zoomSpeed: 0.42,
      enablePan: true,
    });
  }

  private setupLights(): void {
    const environment = new Entity('Environment');
    environment.addComponent(new EnvironmentLight({
      intensity: 0.72,
      diffuseColor: [0.64, 0.72, 0.78],
      specularColor: [0.82, 0.88, 0.92],
    }));
    this.world.addEntity(environment);
    const sun = new Entity('Sun');
    sun.addComponent(new DirectionalLight({ color: [1, 0.96, 0.88], intensity: 1.85, direction: [-0.42, -1, -0.36] }));
    this.world.addEntity(sun);
    const fill = new Entity('Fill');
    fill.addComponent(new DirectionalLight({ color: [0.66, 0.78, 1], intensity: 0.62, direction: [0.58, -0.72, 0.42] }));
    this.world.addEntity(fill);
    const rim = new Entity('Rim');
    rim.addComponent(new DirectionalLight({ color: [1, 0.86, 0.68], intensity: 0.34, direction: [-0.28, -0.42, 0.78] }));
    this.world.addEntity(rim);
  }

  private resetWorld(restored?: WfcMapSaveData): void {
    while (this.entities.length) this.world.removeEntity(this.entities.pop()!);
    this.pickables.length = 0;
    this.playerPath.reset();
    this.playerMoving = false;
    this.hasPlayerCommand = false;
    const requestedSeed = restored?.seed ?? this.nextSeed();
    for (let attempt = 0; attempt < INITIAL_GENERATION_ATTEMPTS; attempt++) {
      while (this.entities.length) this.world.removeEntity(this.entities.pop()!);
      this.pickables.length = 0;
      this.generatedColumns.clear();
      this.chunks.clear();
      this.columnEntities.clear();
      this.navMesh = null;
      this.playableSurface = null;
      this.playableAnchorKey = undefined;
      this.seed = (requestedSeed + Math.imul(attempt, 0x9e3779b9)) >>> 0;
      this.generator.reset(this.seed);
      this.playerX = restored?.playerX ?? START_X;
      this.playerZ = restored?.playerZ ?? START_Z;
      this.minGeneratedX = this.playerX - VIEW_RADIUS_X;
      this.maxGeneratedX = this.playerX + VIEW_RADIUS_X;
      this.minGeneratedZ = this.playerZ - VIEW_RADIUS_Z;
      this.maxGeneratedZ = this.playerZ + VIEW_RADIUS_Z;
      this.ensureGeneratedAround(this.playerX, this.playerZ);
      if (isUsefulPlayableWfcSurface(this.playableSurface) || attempt === INITIAL_GENERATION_ATTEMPTS - 1) break;
    }
    this.createPlayer();
    this.updateCameraTarget();
    this.updateHud();
    this.pickedText.textContent = 'NavMesh ready';
    this.saveState();
  }

  private saveState(): void {
    this.saves.save({ seed: this.seed, playerX: this.playerX, playerZ: this.playerZ });
  }

  private nextSeed(): number {
    if (!this.fixedSeedToggle.checked) {
      const next = this.seed + 1;
      this.seedInput.value = String(next);
      return next;
    }
    const fixed = Number.parseInt(this.seedInput.value, 10);
    if (Number.isFinite(fixed) && fixed >= 0) return fixed;
    this.seedInput.value = String(this.seed);
    return this.seed;
  }

  private tick(_time: number, delta: number): void {
    this.moveCooldown = Math.max(0, this.moveCooldown - delta);
    this.handleMovement();
    this.updatePlayerPath(Math.min(delta * 0.001, 0.05));
    this.world.update(_time, delta);
  }

  private ensureGeneratedAround(x: number, z: number): void {
    const targetMinX = x - VIEW_RADIUS_X;
    const targetMaxX = x + VIEW_RADIUS_X;
    const targetMinZ = z - VIEW_RADIUS_Z;
    const targetMaxZ = z + VIEW_RADIUS_Z;
    const chunkMinX = this.chunkCoord(targetMinX);
    const chunkMaxX = this.chunkCoord(targetMaxX);
    const chunkMinZ = this.chunkCoord(targetMinZ);
    const chunkMaxZ = this.chunkCoord(targetMaxZ);
    const missingChunks: Array<{ x: number; z: number; distance: number }> = [];
    for (let chunkZ = chunkMinZ; chunkZ <= chunkMaxZ; chunkZ++) {
      for (let chunkX = chunkMinX; chunkX <= chunkMaxX; chunkX++) {
        if (this.chunks.has(this.chunkKey(chunkX, chunkZ))) continue;
        const centerX = (chunkX + 0.5) * CHUNK_SIZE;
        const centerZ = (chunkZ + 0.5) * CHUNK_SIZE;
        missingChunks.push({ x: chunkX, z: chunkZ, distance: Math.hypot(centerX - x, centerZ - z) });
      }
    }
    missingChunks.sort((a, b) => a.distance - b.distance || a.z - b.z || a.x - b.x);
    for (const chunk of missingChunks) this.renderGeneratedChunk(chunk.x, chunk.z);

    this.minGeneratedX = Math.min(this.minGeneratedX, chunkMinX * CHUNK_SIZE);
    this.maxGeneratedX = Math.max(this.maxGeneratedX, (chunkMaxX + 1) * CHUNK_SIZE - 1);
    this.minGeneratedZ = Math.min(this.minGeneratedZ, chunkMinZ * CHUNK_SIZE);
    this.maxGeneratedZ = Math.max(this.maxGeneratedZ, (chunkMaxZ + 1) * CHUNK_SIZE - 1);
  }

  private renderGeneratedChunk(chunkX: number, chunkZ: number): void {
    const chunkKey = this.chunkKey(chunkX, chunkZ);
    if (this.chunks.has(chunkKey)) return;
    const minX = chunkX * CHUNK_SIZE;
    const minZ = chunkZ * CHUNK_SIZE;
    this.renderGeneratedArea(minX, minX + CHUNK_SIZE - 1, minZ, minZ + CHUNK_SIZE - 1);
  }

  private renderGeneratedArea(minX: number, maxX: number, minZ: number, maxZ: number): void {
    if (minX > maxX || minZ > maxZ) return;
    let result;
    try {
      result = this.generator.collapseArea(minX, maxX, minZ, maxZ, WFC_PROPAGATION_RADIUS);
    } catch (error) {
      console.warn('[WFC] Persistent Unity InfiniteMap collapse failed; chunk was left unchanged.', error);
      this.backtracksText.textContent = 'failed';
      return;
    }

    this.renderGeneratedColumns(result.changedColumns.map(({ x, z, modules }) => ({
      globalX: x,
      globalZ: z,
      column: modules,
    })));

    const key = this.chunkKey(this.chunkCoord(minX), this.chunkCoord(minZ));
    this.chunks.set(key, { key, cx: minX, cz: minZ, entities: [] });
    this.backtracksText.textContent = String(result.backtracks);
    this.updatePlayableSurface();
  }

  private renderGeneratedColumns(columns: GeneratedColumn[]): void {
    for (const { globalX, globalZ, column } of columns) {
      const key = this.footprintKey(globalX, globalZ);
      this.generatedColumns.set(key, [...column]);
    }
  }

  private updatePlayableSurface(): void {
    const surface = selectPlayableWfcSurface(this.generatedColumns, this.playableAnchorKey);
    this.playableSurface = surface;
    this.playableAnchorKey = surface?.anchorKey;
    for (const key of [...this.columnEntities.keys()]) this.removeGeneratedColumnVisuals(key);
    for (const [key, column] of this.generatedColumns) {
      const parts = key.split(',');
      const globalX = Number(requiredItemAt(parts, 0, 'WFC render column x'));
      const globalZ = Number(requiredItemAt(parts, 1, 'WFC render column z'));
      this.renderGeneratedColumn(globalX, globalZ, column);
    }
    this.rebuildNavMesh();
    document.body.dataset.wfcSurface = describePlayableWfcSurface(surface);
    document.body.dataset.wfcSurfaceColumns = String(surface?.footprintCount ?? 0);
    document.body.dataset.wfcSurfaceTransitions = String(surface?.verticalTransitions ?? 0);
  }

  private renderGeneratedColumn(globalX: number, globalZ: number, column: number[]): void {
    const key = this.footprintKey(globalX, globalZ);
    this.removeGeneratedColumnVisuals(key);
    const entityStart = this.entities.length;
    for (let y = 0; y < SIZE_Y; y++) {
      if (!this.playableSurface?.slotKeys.has(wfcSlotKey(globalX, y, globalZ))) continue;
      const moduleIndex = requiredNumberAt(column, y, 'generated WFC column');
      if (!UNITY_WFC_SPAWN_FLAGS[moduleIndex]) continue;
      const module = moduleAt(moduleIndex);
      this.renderModule(module, ...this.slotToWorld(globalX, y, globalZ));
    }
    this.columnEntities.set(key, this.entities.slice(entityStart));
    this.generatedColumns.set(key, [...column]);
  }

  private removeGeneratedColumnVisuals(key: string): void {
    const oldEntities = this.columnEntities.get(key);
    if (!oldEntities) return;
    const oldSet = new Set(oldEntities);
    const oldTransforms = new Set<CartesianTransform3D>();
    for (const entity of oldEntities) {
      const transform = entity.getComponent(CartesianTransform3D);
      if (transform) oldTransforms.add(transform);
      this.world.removeEntity(entity);
    }
    for (let i = this.entities.length - 1; i >= 0; i--) {
      if (oldSet.has(requiredItemAt(this.entities, i, 'WFC render entities'))) this.entities.splice(i, 1);
    }
    for (let i = this.pickables.length - 1; i >= 0; i--) {
      if (oldTransforms.has(requiredItemAt(this.pickables, i, 'WFC pickables').transform)) this.pickables.splice(i, 1);
    }
    this.columnEntities.delete(key);
  }

  private rebuildNavMesh(): void {
    const result = buildWfcGroundNavMesh(this.playableSurface, {
      blockSize: BLOCK,
      cellsPerBlock: NAV_CELLS_PER_BLOCK,
      startX: START_X,
      startZ: START_Z,
      surfaceY: WALK_SURFACE_Y,
    });
    this.navMesh = result?.navMesh ?? null;
    document.body.dataset.navmeshStatus = result ? 'ready' : 'empty';
    document.body.dataset.navmeshWalkableCells = String(result?.walkableCellCount ?? 0);
    if (this.navMesh && this.playerEntity && this.entities.includes(this.playerEntity)) {
      const projected = this.navMesh.projectPoint([
        requiredNumberAt(this.playerPosition, 0, 'WFC player position'),
        requiredNumberAt(this.playerPosition, 1, 'WFC player position') - PLAYER_RADIUS,
        requiredNumberAt(this.playerPosition, 2, 'WFC player position'),
      ], { radius: NAV_AGENT_RADIUS });
      if (projected) {
        this.playerPosition.set([
          requiredNumberAt(projected, 0, 'WFC projected player position'),
          requiredNumberAt(projected, 1, 'WFC projected player position') + PLAYER_RADIUS,
          requiredNumberAt(projected, 2, 'WFC projected player position'),
        ]);
        this.playerTransform.setPosition(
          requiredNumberAt(this.playerPosition, 0, 'WFC player position'),
          requiredNumberAt(this.playerPosition, 1, 'WFC player position'),
          requiredNumberAt(this.playerPosition, 2, 'WFC player position'),
        );
      }
    }
    if (this.hasPlayerCommand && this.playerEntity) this.queryPlayerPath();
  }
  private pickAt(canvas: HTMLCanvasElement, event: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((event.clientY - rect.top) / rect.height) * 2;
    const camera = this.cameraEntity.getComponent(Camera3D);
    if (!camera) return;

    this.orbitTransform.updateWorldMatrix();
    const cameraWorld = this.orbitTransform.worldMatrix;
    this.cameraPosition[0] = requiredNumberAt(cameraWorld, 12, 'WFC camera matrix');
    this.cameraPosition[1] = requiredNumberAt(cameraWorld, 13, 'WFC camera matrix');
    this.cameraPosition[2] = requiredNumberAt(cameraWorld, 14, 'WFC camera matrix');
    const viewMatrix = mat4.inverse(cameraWorld, this.viewMatrix) as Float32Array;
    const viewProjMatrix = mat4.multiply(camera.projectionMatrix, viewMatrix, this.viewProjMatrix) as Float32Array;
    const invViewProjMatrix = mat4.inverse(viewProjMatrix, this.invViewProjMatrix) as Float32Array;
    this.ray.setFromCamera(ndcX, ndcY, this.cameraPosition, invViewProjMatrix);

    let closest: { name: string; distance: number } | null = null;
    for (const pickable of this.pickables) {
      pickable.transform.updateWorldMatrix();
      const hit = this.ray.intersectMesh(pickable.geometry, pickable.transform.worldMatrix, { useBVH: false });
      if (hit && (!closest || hit.distance < closest.distance)) {
        closest = { name: pickable.name, distance: hit.distance };
      }
    }

    const rayDirectionY = requiredNumberAt(this.ray.direction, 1, 'WFC pointer ray direction');
    const distanceToSurface = closest?.distance ?? (Math.abs(rayDirectionY) > 1e-6
      ? (WALK_SURFACE_Y - requiredNumberAt(this.ray.origin, 1, 'WFC pointer ray origin')) / rayDirectionY
      : -1);
    if (distanceToSurface > 0) {
      const targetX = requiredNumberAt(this.ray.origin, 0, 'WFC pointer ray origin')
        + requiredNumberAt(this.ray.direction, 0, 'WFC pointer ray direction') * distanceToSurface;
      const targetZ = requiredNumberAt(this.ray.origin, 2, 'WFC pointer ray origin')
        + requiredNumberAt(this.ray.direction, 2, 'WFC pointer ray direction') * distanceToSurface;
      const targetCellX = Math.round(targetX / BLOCK + START_X);
      const targetCellZ = Math.round(targetZ / BLOCK + START_Z);
      this.ensureGeneratedAround(targetCellX, targetCellZ);
      this.commandPlayer(targetX, targetZ);
    } else {
      this.pickedText.textContent = closest?.name ?? 'No NavMesh target';
    }
  }

  private createPlayer(): void {
    const [x, _y, z] = this.slotToWorld(this.playerX, 0, this.playerZ);
    const projected = this.navMesh?.projectPoint([x, WALK_SURFACE_Y, z], { radius: NAV_AGENT_RADIUS });
    const startX = projected?.[0] ?? x;
    const startY = (projected?.[1] ?? WALK_SURFACE_Y) + PLAYER_RADIUS;
    const startZ = projected?.[2] ?? z;
    this.playerPosition.set([startX, startY, startZ]);
    this.playerEntity = new Entity('PlayerBall');
    this.playerTransform = new CartesianTransform3D({ position: [startX, startY, startZ] });
    this.playerEntity.addComponent(this.playerTransform);
    this.playerEntity.addComponent(new Mesh3D(
      createSphere3D({ radius: PLAYER_RADIUS, widthSegments: 24, heightSegments: 12 }),
      new PbrMaterial({
        baseColor: [0.05, 0.30, 1.0, 1],
        metallic: 0.42,
        roughness: 0.2,
        clearcoatFactor: 0.32,
        clearcoatRoughnessFactor: 0.16,
      }),
    ));
    this.world.addEntity(this.playerEntity);
    this.entities.push(this.playerEntity);
  }

  private handleMovement(): void {
    if (this.moveCooldown > 0) return;
    let dx = 0;
    let dz = 0;
    if (this.pressed.has('ArrowLeft')) dx = -1;
    else if (this.pressed.has('ArrowRight')) dx = 1;
    else if (this.pressed.has('ArrowUp')) dz = -1;
    else if (this.pressed.has('ArrowDown')) dz = 1;
    else if (this.pressed.has('a') || this.pressed.has('A')) dx = -1;
    else if (this.pressed.has('d') || this.pressed.has('D')) dx = 1;
    else if (this.pressed.has('w') || this.pressed.has('W')) dz = -1;
    else if (this.pressed.has('s') || this.pressed.has('S')) dz = 1;
    if (!dx && !dz) return;
    const targetX = requiredNumberAt(this.playerPosition, 0, 'WFC player position') + dx * BLOCK;
    const targetZ = requiredNumberAt(this.playerPosition, 2, 'WFC player position') + dz * BLOCK;
    this.ensureChunkForCell(Math.round(targetX / BLOCK + START_X), Math.round(targetZ / BLOCK + START_Z));
    this.commandPlayer(targetX, targetZ);
    this.moveCooldown = 220;
  }

  private commandPlayer(targetX: number, targetZ: number): void {
    if (!this.navMesh) return;
    const target = this.navMesh.projectPoint([
      targetX,
      requiredNumberAt(this.playerPosition, 1, 'WFC player position') - PLAYER_RADIUS,
      targetZ,
    ], { radius: NAV_AGENT_RADIUS });
    if (!target) {
      this.pickedText.textContent = 'No reachable NavMesh surface';
      return;
    }
    this.playerCommandTarget.set(target);
    this.hasPlayerCommand = true;
    this.queryPlayerPath();
  }

  private queryPlayerPath(): void {
    if (!this.navMesh) return;
    this.navMesh.findPath(
      [
        requiredNumberAt(this.playerPosition, 0, 'WFC player position'),
        requiredNumberAt(this.playerPosition, 1, 'WFC player position') - PLAYER_RADIUS,
        requiredNumberAt(this.playerPosition, 2, 'WFC player position'),
      ],
      this.playerCommandTarget,
      { radius: NAV_AGENT_RADIUS },
      this.playerPath,
    );
    this.playerWaypoint = Math.min(1, Math.max(0, this.playerPath.pointCount - 1));
    this.playerMoving = this.playerPath.pointCount > 1;
    document.body.dataset.navmeshPathStatus = this.playerPath.status;
    document.body.dataset.navmeshPathPoints = String(this.playerPath.pointCount);
    document.body.dataset.playerMoving = String(this.playerMoving);
    this.pickedText.textContent = `${this.playerPath.status} path · ${this.playerPath.pointCount} points`;
  }

  private updatePlayerPath(deltaSeconds: number): void {
    if (!this.playerMoving || !this.navMesh) return;
    const offset = this.playerWaypoint * 3;
    const targetX = requiredNumberAt(this.playerPath.points, offset, 'WFC NavMesh path');
    const targetY = requiredNumberAt(this.playerPath.points, offset + 1, 'WFC NavMesh path') + PLAYER_RADIUS;
    const targetZ = requiredNumberAt(this.playerPath.points, offset + 2, 'WFC NavMesh path');
    const dx = targetX - requiredNumberAt(this.playerPosition, 0, 'WFC player position');
    const dz = targetZ - requiredNumberAt(this.playerPosition, 2, 'WFC player position');
    const distance = Math.hypot(dx, dz);
    if (distance < 0.08) {
      this.playerPosition.set([targetX, targetY, targetZ]);
      this.playerWaypoint++;
      if (this.playerWaypoint >= this.playerPath.pointCount) {
        this.playerMoving = false;
        this.hasPlayerCommand = false;
        document.body.dataset.playerMoving = 'false';
      }
    } else {
      const move = Math.min(distance, PLAYER_SPEED * deltaSeconds);
      const candidateX = requiredNumberAt(this.playerPosition, 0, 'WFC player position') + dx / distance * move;
      const candidateZ = requiredNumberAt(this.playerPosition, 2, 'WFC player position') + dz / distance * move;
      const surface = this.navMesh.sampleSurface([
        candidateX,
        requiredNumberAt(this.playerPosition, 1, 'WFC player position') - PLAYER_RADIUS,
        candidateZ,
      ], { radius: NAV_AGENT_RADIUS });
      if (!surface) {
        this.queryPlayerPath();
        return;
      }
      this.playerPosition.set([candidateX, requiredNumberAt(surface, 1, 'WFC NavMesh surface') + PLAYER_RADIUS, candidateZ]);
    }

    this.playerTransform.setPosition(
      requiredNumberAt(this.playerPosition, 0, 'WFC player position'),
      requiredNumberAt(this.playerPosition, 1, 'WFC player position'),
      requiredNumberAt(this.playerPosition, 2, 'WFC player position'),
    );
    const nextPlayerX = Math.round(requiredNumberAt(this.playerPosition, 0, 'WFC player position') / BLOCK + START_X);
    const nextPlayerZ = Math.round(requiredNumberAt(this.playerPosition, 2, 'WFC player position') / BLOCK + START_Z);
    if (nextPlayerX !== this.playerX || nextPlayerZ !== this.playerZ) {
      this.playerX = nextPlayerX;
      this.playerZ = nextPlayerZ;
      this.ensureGeneratedAround(this.playerX, this.playerZ);
      this.updateHud();
      this.saveState();
    }
    this.updateCameraTarget();
  }

  private ensureChunkForCell(x: number, z: number): void {
    this.ensureGeneratedAround(x, z);
  }

  private updateCameraTarget(): void {
    this.orbitTransform.setTarget(
      requiredNumberAt(this.playerPosition, 0, 'WFC player position'),
      requiredNumberAt(this.playerPosition, 1, 'WFC player position') + 22,
      requiredNumberAt(this.playerPosition, 2, 'WFC player position'),
    );
  }

  private updateHud(): void {
    this.seedText.textContent = String(this.seed);
    if (!this.fixedSeedToggle.checked) this.seedInput.value = String(this.seed);
    const width = this.maxGeneratedX - this.minGeneratedX + 1;
    const depth = this.maxGeneratedZ - this.minGeneratedZ + 1;
    this.statusText.textContent = `${width}x${depth} footprint. ${describePlayableWfcSurface(this.playableSurface)}. Click or use WASD/arrow keys to follow the NavMesh. ${BUILD_TAG}`;
    document.body.dataset.wfcStrategy = 'unity-persistent-connected-surface';
    document.body.dataset.wfcGeneratedColumns = String(this.generatedColumns.size);
  }

  private chunkKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  private chunkCoord(cell: number): number {
    return Math.floor(cell / CHUNK_SIZE);
  }

  private footprintKey(x: number, z: number): string {
    return `${x},${z}`;
  }

  private renderModule(module: UnityWfcModule, x: number, y: number, z: number): void {
    const name = module.baseName;
    if (name === 'Empty') return;
    const asset = this.blockMeshes.get(name);
    if (asset) {
      this.addAssetMesh(name, x, y, z, module.rotation, asset, module.name);
      if (name === 'Balcony') this.addBalconyConnector(x, y, z, module.rotation);
      return;
    }
    if (name === 'Solid') {
      this.addBox('Solid', x, y, z, BLOCK, LAYER, BLOCK, WALL_DARK, 8);
      return;
    }

    this.addFloor(x, y, z);
    if (name.includes('Water_Fountain') || name.includes('Fountain')) this.renderFountain(x, y, z);
    if (name.includes('Stairs')) this.renderStairs(x, y, z, module.rotation, name.includes('Spiral'));
    if (name.includes('Bridge')) this.renderBridge(x, y, z, module.rotation, name.includes('Arch'));
    if (name.includes('Railing')) this.renderRailing(x, y, z, module.rotation, name.includes('Corner'));
    if (name.includes('Wall') || name.includes('Tunnel') || name.includes('Interior')) this.renderWallFamily(x, y, z, module.rotation, name);
    if (name.includes('Roof')) this.renderRoofFamily(x, y, z, module.rotation, name);
    if (name.includes('Pillars')) this.renderPillars(x, y, z, module.rotation, name.includes('Corner'));
    if (name.includes('Balcony')) this.renderBalcony(x, y, z, module.rotation);
    if (name === 'Floor' || name.includes('Floor')) this.renderFloorDetails(x, y, z);
  }

  private addAssetMesh(name: string, x: number, y: number, z: number, rotation: number, asset: BlockMeshEntry, pickName = name): Entity {
    const entity = new Entity(name);
    const visualRotation = rotation * Math.PI * 0.5;
    const transform = new CartesianTransform3D({
      position: [x, y, z],
      rotation: [0, visualRotation, 0],
      scale: [BLOCK_ASSET_SCALE, BLOCK_ASSET_SCALE, BLOCK_ASSET_SCALE],
    });
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(asset.geometry, this.material(WALL, 18)));
    this.world.addEntity(entity);
    this.entities.push(entity);
    this.registerPickable(pickName, asset.geometry, transform);
    return entity;
  }

  private addFloor(x: number, y: number, z: number): void {
    this.addBox('Floor', x, y - LAYER * 0.45, z, BLOCK * 0.96, 2, BLOCK * 0.96, FLOOR, 8);
  }

  private addBalconyConnector(x: number, y: number, z: number, rotation: number): void {
    const [px, pz, w, d] = this.wallRect((rotation + 2) % 4, BLOCK * 0.96, 2.8);
    this.addBox('BalconyWallConnector', x + px, y + 2.2, z + pz, w, 22, d, WALL, 12);
    this.addBox('BalconyTopConnector', x + px, y + 13.8, z + pz, w, 1.8, d + 1.8, WALL, 10);
    this.addBox('BalconyBottomConnector', x + px, y - 8.3, z + pz, w, 1.8, d + 1.8, WALL_DARK, 8);
  }

  private renderFloorDetails(x: number, y: number, z: number): void {
    this.addBox('TileInset', x, y - LAYER * 0.40, z, BLOCK * 0.56, 0.8, BLOCK * 0.56, [0.88, 0.94, 0.95, 1], 10);
  }

  private renderFountain(x: number, y: number, z: number): void {
    this.addSphere('FountainBasin', x, y - 2, z, 7, WALL, 16, [1, 0.18, 1]);
    this.addSphere('FountainWater', x, y - 0.6, z, 5.2, WATER, 24, [1, 0.08, 1]);
    this.addColumn(x, y + 3, z, 1.4, 8);
  }

  private renderWallFamily(x: number, y: number, z: number, rotation: number, name: string): void {
    const high = name.includes('High') || name.includes('Tunnel') || name.includes('Enclosed');
    const h = high ? LAYER * 0.92 : LAYER * 0.68;
    const [px, pz, w, d] = this.wallRect(rotation, BLOCK * 0.88, 3);
    this.addBox('Wall', x + px, y - LAYER * 0.45 + h * 0.5, z + pz, w, h, d, name.includes('Interior') ? WALL_DARK : WALL, 14);
    if (name.includes('Window')) this.addWallOpening(x, y, z, rotation, false);
    if (name.includes('Door') || name.includes('Tunnel')) this.addWallOpening(x, y, z, rotation, true);
    if (name.includes('Clock')) this.addSphere('Clock', x + px * 1.04, y + 4, z + pz * 1.04, 4, [0.94, 0.96, 0.95, 1], 20, [1, 1, 0.16]);
    this.addWallTrim(x, y, z, rotation, h);
    if (name.includes('Corner')) {
      const r2 = (rotation + 1) % 4;
      const [px2, pz2, w2, d2] = this.wallRect(r2, BLOCK * 0.88, 3);
      this.addBox('WallCornerLeg', x + px2, y - LAYER * 0.45 + h * 0.5, z + pz2, w2, h, d2, WALL, 14);
    }
    if (name.includes('Roof')) this.addRoof('WallRoof', x, y + h * 0.5 + 3, z, BLOCK * 0.82, BLOCK * 0.68, 10, [0.92, 0.96, 0.97, 1], 20, rotation % 2 === 1);
  }

  private addWallTrim(x: number, y: number, z: number, rotation: number, height: number): void {
    const [px, pz, w, d] = this.wallRect(rotation, BLOCK * 0.92, 1.2);
    this.addBox('WallTrimTop', x + px, y - LAYER * 0.45 + height + 1.2, z + pz, w, 1.2, d, [0.94, 0.97, 0.97, 1], 10);
    this.addBox('WallTrimMid', x + px * 1.01, y - LAYER * 0.45 + height * 0.58, z + pz * 1.01, w, 0.8, d, WALL_DARK, 8);
  }

  private addWallOpening(x: number, y: number, z: number, rotation: number, door: boolean): void {
    const [px, pz, w, d] = this.wallRect(rotation, door ? 3 : 2, 1.5);
    this.addBox(door ? 'Door' : 'Window', x + px * 1.05, y + (door ? -1 : 2.5), z + pz * 1.05, w, door ? 11 : 6, d, SHADOW, 4);
  }

  private renderRailing(x: number, y: number, z: number, rotation: number, corner: boolean): void {
    this.addRailingLine(x, y + 1.5, z, rotation);
    if (corner) this.addRailingLine(x, y + 1.5, z, (rotation + 1) % 4);
  }

  private addRailingLine(x: number, y: number, z: number, rotation: number): void {
    const [px, pz, w, d] = this.wallRect(rotation, BLOCK * 0.84, 1.2);
    this.addBox('RailTop', x + px, y + 1, z + pz, w, 1.2, d, WALL, 10);
    for (let i = -2; i <= 2; i++) {
      const ox = rotation % 2 === 0 ? i * 5 : px;
      const oz = rotation % 2 === 0 ? pz : i * 5;
      this.addColumn(x + ox, y - 1.5, z + oz, 0.7, 5.5);
    }
  }

  private renderStairs(x: number, y: number, z: number, rotation: number, spiral: boolean): void {
    if (spiral) {
      for (let i = 0; i < 9; i++) {
        const a = rotation * Math.PI * 0.5 + i * 0.42;
        this.addBox('SpiralStep', x + Math.cos(a) * 6, y - 8 + i * 1.7, z + Math.sin(a) * 6, 8, 1.4, 3, WALL, 8);
      }
      this.addColumn(x, y - 2, z, 1.3, 18);
      return;
    }
    const alongX = rotation % 2 === 1;
    for (let i = 0; i < 8; i++) {
      const offset = (i - 3.5) * 3.1;
      const h = -8 + i * 1.7;
      this.addBox('Step', x + (alongX ? offset : 0), y + h, z + (alongX ? 0 : offset), alongX ? 3 : 20, 1.4, alongX ? 20 : 3, WALL, 8);
    }
    this.addRailingLine(x, y + 1, z, rotation);
    this.addRailingLine(x, y + 1, z, (rotation + 2) % 4);
  }

  private renderBridge(x: number, y: number, z: number, rotation: number, arch: boolean): void {
    const alongX = rotation % 2 === 1;
    this.addBox('BridgeDeck', x, y + 0.5, z, alongX ? BLOCK * 1.05 : 12, 4, alongX ? 12 : BLOCK * 1.05, WALL, 12);
    this.addRailingLine(x, y + 5, z, rotation);
    this.addRailingLine(x, y + 5, z, (rotation + 2) % 4);
    this.addBox('BridgeUnderside', x, y - 3.4, z, alongX ? BLOCK * 0.92 : 8, 2.4, alongX ? 8 : BLOCK * 0.92, WALL_DARK, 8);
    this.addColumn(x + (alongX ? -7 : 0), y - 12, z + (alongX ? 0 : -7), 1.1, 14);
    this.addColumn(x + (alongX ? 7 : 0), y - 12, z + (alongX ? 0 : 7), 1.1, 14);
    if (arch) {
      this.addBox('ArchLintel', x, y - 1, z, alongX ? BLOCK * 0.72 : 5, 4, alongX ? 5 : BLOCK * 0.72, WALL, 12);
      this.addSphere('ArchCurve', x, y - 3.5, z, 8, WALL_DARK, 12, alongX ? [1.2, 0.28, 0.25] : [0.25, 0.28, 1.2]);
    }
  }

  private renderRoofFamily(x: number, y: number, z: number, rotation: number, name: string): void {
    const upper = name.includes('Upper') || name.includes('Top');
    const ridgeAlongX = rotation % 2 === 1;
    this.addRoof('Roof', x, y + (upper ? 2 : -2), z, BLOCK * 0.92, BLOCK * 0.92, upper ? 12 : 8, [0.94, 0.98, 0.99, 1], 22, ridgeAlongX);
    if (name.includes('Corner')) this.addBox('RoofCornerTrim', x, y - 7, z, BLOCK * 0.55, 2, BLOCK * 0.55, WALL_DARK, 8);
    if (name.includes('Wall')) this.renderWallFamily(x, y - 2, z, rotation, 'Wall');
    if (name.includes('Floor')) this.addBox('RoofFloor', x, y - 8, z, BLOCK * 0.92, 2, BLOCK * 0.92, FLOOR, 8);
  }

  private renderPillars(x: number, y: number, z: number, _rotation: number, corner: boolean): void {
    const points: Array<[number, number]> = corner ? [[-9, -9], [9, -9], [-9, 9]] : [[-10, -9], [-3, -9], [4, -9], [11, -9]];
    for (const [px, pz] of points) this.addColumn(x + px, y - 1, z + pz, 1.2, 17);
  }

  private renderBalcony(x: number, y: number, z: number, rotation: number): void {
    const [px, pz, w, d] = this.wallRect(rotation, BLOCK * 0.72, 9);
    this.addBox('BalconyDeck', x + px, y - 4, z + pz, w, 2, d, FLOOR, 8);
    this.addRailingLine(x + px * 1.45, y + 1, z + pz * 1.45, rotation);
  }

  private wallRect(rotation: number, length: number, thickness: number): [number, number, number, number] {
    const offset = BLOCK * 0.43;
    if (rotation === 0) return [0, -offset, length, thickness];
    if (rotation === 1) return [offset, 0, thickness, length];
    if (rotation === 2) return [0, offset, length, thickness];
    return [-offset, 0, thickness, length];
  }

  private slotToWorld(x: number, y: number, z: number): Vec3 {
    const displayLayer = y - (this.playableSurface?.baseLayer ?? 0);
    return [
      (x - START_X) * BLOCK,
      displayLayer * LAYER + BLOCK * 0.5,
      (z - START_Z) * BLOCK,
    ];
  }

  private addColumn(x: number, y: number, z: number, radius: number, height: number): void {
    this.addBox('Column', x, y + height * 0.5, z, radius * 2, height, radius * 2, WALL, 12);
    this.addBox('ColumnCap', x, y + height + 0.8, z, radius * 3.2, 1.4, radius * 3.2, WALL, 12);
  }

  private addBox(name: string, x: number, y: number, z: number, width: number, height: number, depth: number, color: Color, shininess: number): Entity {
    const entity = new Entity(name);
    const transform = new CartesianTransform3D({ position: [x, y, z] });
    const geometry = createBox3D({ width, height, depth });
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(geometry, this.material(color, shininess)));
    this.world.addEntity(entity);
    this.entities.push(entity);
    this.registerPickable(name, geometry, transform);
    return entity;
  }

  private addBoxRotated(name: string, x: number, y: number, z: number, width: number, height: number, depth: number, rotation: Vec3, color: Color, shininess: number): Entity {
    const entity = new Entity(name);
    const transform = new CartesianTransform3D({ position: [x, y, z], rotation });
    const geometry = createBox3D({ width, height, depth });
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(geometry, this.material(color, shininess)));
    this.world.addEntity(entity);
    this.entities.push(entity);
    this.registerPickable(name, geometry, transform);
    return entity;
  }

  private addSphere(name: string, x: number, y: number, z: number, radius: number, color: Color, shininess: number, scale: Vec3 = [1, 1, 1]): Entity {
    const entity = new Entity(name);
    const transform = new CartesianTransform3D({ position: [x, y, z], scale });
    const geometry = createSphere3D({ radius, widthSegments: 24, heightSegments: 12 });
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(geometry, this.material(color, shininess)));
    this.world.addEntity(entity);
    this.entities.push(entity);
    this.registerPickable(name, geometry, transform);
    return entity;
  }

  private addCone(name: string, x: number, y: number, z: number, radius: number, height: number, color: Color, shininess: number, rotationY = 0): Entity {
    const entity = new Entity(name);
    const transform = new CartesianTransform3D({ position: [x, y, z], rotation: [0, rotationY, 0] });
    const geometry = createCone3D({ radius, height, radialSegments: 4 });
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(geometry, this.material(color, shininess)));
    this.world.addEntity(entity);
    this.entities.push(entity);
    this.registerPickable(name, geometry, transform);
    return entity;
  }

  private addRoof(name: string, x: number, y: number, z: number, width: number, depth: number, height: number, color: Color, shininess: number, ridgeAlongX: boolean): Entity {
    const entity = new Entity(name);
    const key = `${Math.round(width)}:${Math.round(depth)}:${Math.round(height)}:${ridgeAlongX ? 'x' : 'z'}`;
    let geometry = this.roofGeometries.get(key);
    if (!geometry) {
      geometry = createGableRoof3D(width, depth, height, ridgeAlongX);
      this.roofGeometries.set(key, geometry);
    }
    const transform = new CartesianTransform3D({ position: [x, y, z] });
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(geometry, this.material(color, shininess)));
    this.world.addEntity(entity);
    this.entities.push(entity);
    this.registerPickable(name, geometry, transform);
    const slopeLength = Math.hypot(height, (ridgeAlongX ? depth : width) * 0.5);
    const angle = Math.atan2(height, (ridgeAlongX ? depth : width) * 0.5);
    if (ridgeAlongX) {
      this.addBoxRotated('RoofPlaneA', x, y + height * 0.12, z - depth * 0.24, width * 1.04, 1.4, slopeLength, [angle, 0, 0], color, shininess);
      this.addBoxRotated('RoofPlaneB', x, y + height * 0.12, z + depth * 0.24, width * 1.04, 1.4, slopeLength, [-angle, 0, 0], color, shininess);
    } else {
      this.addBoxRotated('RoofPlaneA', x - width * 0.24, y + height * 0.12, z, slopeLength, 1.4, depth * 1.04, [0, 0, -angle], color, shininess);
      this.addBoxRotated('RoofPlaneB', x + width * 0.24, y + height * 0.12, z, slopeLength, 1.4, depth * 1.04, [0, 0, angle], color, shininess);
    }
    for (let i = -2; i <= 2; i++) {
      this.addBox('RoofRib', x + (ridgeAlongX ? i * 3.6 : 0), y + height * 0.48, z + (ridgeAlongX ? 0 : i * 3.6), ridgeAlongX ? 0.7 : width * 0.82, 0.8, ridgeAlongX ? depth * 0.82 : 0.7, WALL_DARK, 8);
    }
    return entity;
  }

  private registerPickable(name: string, geometry: Geometry3D, transform: CartesianTransform3D): void {
    this.pickables.push({ name, geometry, transform });
  }

  private material(color: Color, shininess: number): PbrMaterial {
    const key = `${color.join(',')}:${shininess}`;
    let material = this.materials.get(key);
    if (!material) {
      const roughness = Math.min(0.88, Math.max(0.2, Math.sqrt(2 / (shininess + 2))));
      material = new PbrMaterial({
        baseColor: color,
        metallic: 0.04,
        roughness,
        clearcoatFactor: shininess >= 20 ? 0.16 : 0.06,
        clearcoatRoughnessFactor: Math.min(0.7, roughness + 0.12),
      });
      this.materials.set(key, material);
    }
    return material;
  }
}

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
new WfcCityGame().init(canvas).catch(error => {
  console.error(error);
  const status = document.getElementById('status');
  if (status) status.textContent = error instanceof Error ? error.message : String(error);
});
