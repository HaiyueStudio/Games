import { BasicMaterial, Camera3D, CartesianTransform3D, Entity, Geometry3D, Mesh3D, OrbitControl, SphericalTransform3D, HaiyueEngine, World, createBox3D, createSphere3D } from '@haiyue/engine';
import { Ray } from '@haiyue/engine/math';
import { Render3DSystem } from '@haiyue/engine/systems';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { mat4, vec3 } from 'wgpu-matrix';
import { PadOSScene } from './scenes/PadOSScene';
import { requiredItemAt, requiredNumberAt } from '../arrayAccess';
import { SingleSlotGameSave, isFiniteNumber, isNonNegativeInteger, isRecord } from '../save/SingleSlotGameSave';

interface PadSimulatorSaveData {
  page: number;
  brightness: number;
  showFps: boolean;
}

function isPadSimulatorSaveData(value: unknown): value is PadSimulatorSaveData {
  return isRecord(value)
    && isNonNegativeInteger(value.page)
    && isFiniteNumber(value.brightness) && value.brightness >= 0 && value.brightness <= 1
    && typeof value.showFps === 'boolean';
}

type Vec2 = [number, number];
type Vec3 = [number, number, number];

const BODY_WIDTH = 5.2;
const BODY_HEIGHT = 7.2;
const BODY_THICKNESS = 0.22;
const BODY_RADIUS = 0.42;
const SCREEN_WIDTH = 4.48;
const SCREEN_HEIGHT = 6.38;
const SCREEN_RADIUS = 0.24;
const TOP_Y = BODY_THICKNESS / 2;
const HOME_BUTTON_Z = -BODY_HEIGHT / 2 + 0.20;
const HOME_BUTTON_Y = TOP_Y + 0.016;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function normalize3(x: number, y: number, z: number): Vec3 {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function projectPoint(x: number, y: number, z: number, matrix: Float32Array): { x: number; y: number } | null {
  const clipX = requiredNumberAt(matrix, 0, 'pad view projection') * x + requiredNumberAt(matrix, 4, 'pad view projection') * y + requiredNumberAt(matrix, 8, 'pad view projection') * z + requiredNumberAt(matrix, 12, 'pad view projection');
  const clipY = requiredNumberAt(matrix, 1, 'pad view projection') * x + requiredNumberAt(matrix, 5, 'pad view projection') * y + requiredNumberAt(matrix, 9, 'pad view projection') * z + requiredNumberAt(matrix, 13, 'pad view projection');
  const clipW = requiredNumberAt(matrix, 3, 'pad view projection') * x + requiredNumberAt(matrix, 7, 'pad view projection') * y + requiredNumberAt(matrix, 11, 'pad view projection') * z + requiredNumberAt(matrix, 15, 'pad view projection');
  if (!Number.isFinite(clipW) || Math.abs(clipW) < 1e-6) return null;
  return { x: clipX / clipW, y: clipY / clipW };
}

function roundedRectBoundary(width: number, height: number, radius: number, segments: number): Vec2[] {
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(radius, hw, hh);
  const centers: Vec2[] = [
    [hw - r, hh - r],
    [-hw + r, hh - r],
    [-hw + r, -hh + r],
    [hw - r, -hh + r],
  ];
  const ranges: Array<[number, number]> = [
    [0, Math.PI / 2],
    [Math.PI / 2, Math.PI],
    [Math.PI, Math.PI * 1.5],
    [Math.PI * 1.5, Math.PI * 2],
  ];
  const points: Vec2[] = [];
  for (let corner = 0; corner < 4; corner++) {
    const [cx, cz] = requiredItemAt(centers, corner, 'rounded rectangle centers');
    const [start, end] = requiredItemAt(ranges, corner, 'rounded rectangle angle ranges');
    for (let i = 0; i <= segments; i++) {
      if (corner > 0 && i === 0) continue;
      const t = i / segments;
      const a = start + (end - start) * t;
      points.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  }
  return points;
}

function sideNormal(point: Vec2, width: number, height: number, radius: number): Vec3 {
  const hw = width / 2;
  const hh = height / 2;
  const innerX = clamp(point[0], -hw + radius, hw - radius);
  const innerZ = clamp(point[1], -hh + radius, hh - radius);
  return normalize3(point[0] - innerX, 0, point[1] - innerZ);
}

function createRoundedRectPlane(width: number, height: number, radius: number, segments = 14, y = 0, flipU = false): Geometry3D {
  const boundary = roundedRectBoundary(width, height, radius, segments);
  const positions: number[] = [0, y, 0];
  const normals: number[] = [0, 1, 0];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];

  for (const [x, z] of boundary) {
    positions.push(x, y, z);
    normals.push(0, 1, 0);
    uvs.push(flipU ? 0.5 - x / width : x / width + 0.5, 0.5 - z / height);
  }
  for (let i = 1; i <= boundary.length; i++) {
    indices.push(0, i, i === boundary.length ? 1 : i + 1);
  }

  return new Geometry3D({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    textureCoordinates: [{ set: 0, data: new Float32Array(uvs) }],
    indices: new Uint16Array(indices),
    cullMode: 'none',
  });
}

function createRoundedRectPrism(width: number, height: number, radius: number, thickness: number, segments = 16): Geometry3D {
  const boundary = roundedRectBoundary(width, height, radius, segments);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const topY = thickness / 2;
  const bottomY = -thickness / 2;

  const topCenter = positions.length / 3;
  positions.push(0, topY, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 0.5);
  const topStart = positions.length / 3;
  for (const [x, z] of boundary) {
    positions.push(x, topY, z);
    normals.push(0, 1, 0);
    uvs.push(x / width + 0.5, 0.5 - z / height);
  }

  const bottomCenter = positions.length / 3;
  positions.push(0, bottomY, 0);
  normals.push(0, -1, 0);
  uvs.push(0.5, 0.5);
  const bottomStart = positions.length / 3;
  for (const [x, z] of boundary) {
    positions.push(x, bottomY, z);
    normals.push(0, -1, 0);
    uvs.push(x / width + 0.5, 0.5 - z / height);
  }

  for (let i = 0; i < boundary.length; i++) {
    const next = (i + 1) % boundary.length;
    indices.push(topCenter, topStart + i, topStart + next);
    indices.push(bottomCenter, bottomStart + next, bottomStart + i);
  }

  for (let i = 0; i < boundary.length; i++) {
    const next = (i + 1) % boundary.length;
    const first = requiredItemAt(boundary, i, 'rounded rectangle boundary');
    const second = requiredItemAt(boundary, next, 'rounded rectangle boundary');
    const [x0, z0] = first;
    const [x1, z1] = second;
    const n0 = sideNormal(first, width, height, radius);
    const n1 = sideNormal(second, width, height, radius);
    const base = positions.length / 3;
    positions.push(x0, topY, z0, x0, bottomY, z0, x1, bottomY, z1, x1, topY, z1);
    normals.push(...n0, ...n0, ...n1, ...n1);
    uvs.push(0, 0, 0, 1, 1, 1, 1, 0);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  return new Geometry3D({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    textureCoordinates: [{ set: 0, data: new Float32Array(uvs) }],
    indices: new Uint16Array(indices),
    cullMode: 'none',
  });
}

class PadSimulator {
  private readonly saves = new SingleSlotGameSave<PadSimulatorSaveData>({
    gameId: 'pad-simulator',
    name: 'Pad Simulator 自动存档',
    validateData: isPadSimulatorSaveData,
  });
  private engine!: HaiyueEngine;
  private world!: World;
  private camera!: Camera3D;
  private cameraEntity!: Entity;
  private orbitTransform!: SphericalTransform3D;
  private orbit!: OrbitControl;
  private screenScene!: PadOSScene;
  private screenTexture!: GPUTexture;
  private screenEntity!: Entity;
  private screenGeometry!: Geometry3D;
  private screenTransform!: CartesianTransform3D;
  private homeGeometry!: Geometry3D;
  private homeTransform!: CartesianTransform3D;
  private frontCameraMaterial!: BasicMaterial;
  private resizeObserver: ResizeObserver | null = null;
  private screenPointerActive = false;
  private lastScreenPoint: { x: number; y: number } | null = null;
  private screenOrientation: 'portrait' | 'landscape' = 'portrait';
  private screenOrientationAngle = 0;
  private ray = new Ray();

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.engine = new HaiyueEngine({
      canvas,
      msaaSamples: 4,
      clearColor: { r: 0.055, g: 0.065, b: 0.085, a: 1 },
    });
    await this.engine.init();

    this.screenScene = new PadOSScene();
    await this.screenScene.load();
    const saved = await this.saves.load();
    if (saved) this.screenScene.restoreSettings(saved);
    this.screenTexture = this.engine.device.createTexture({
      size: [this.screenScene.canvas.width, this.screenScene.canvas.height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.world = new World('PadSimulator');
    this.setupCamera(canvas);
    const renderIntegration = new RenderIntegration(this.engine, { label: 'PadSimulator.render' });
    this.world.addRuntimeIntegration(renderIntegration);
    this.world.addSystem(new Render3DSystem(this.engine, this.cameraEntity, { priority: 0, loadOp: 'clear', msaaSamples: 4 }));
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));
    this.buildPad();
    this.setupResizeObserver(canvas);
    this.setupScreenInput(canvas);

    this.engine.on('update', ({ detail: { time, delta } }) => this.tick(time, delta));
    this.engine.run();
  }

  private setupCamera(canvas: HTMLCanvasElement): void {
    this.camera = new Camera3D({ type: 'perspective', fov: Math.PI / 4, near: 0.1, far: 100 });
    this.orbitTransform = new SphericalTransform3D({
      radius: 9.2,
      theta: Math.PI,
      phi: Math.PI * 0.08,
      target: [0, 0, 0],
    });
    this.cameraEntity = new Entity('Camera');
    this.cameraEntity.addComponent(this.camera);
    this.cameraEntity.addComponent(this.orbitTransform);
    this.world.addEntity(this.cameraEntity);
    this.orbit = new OrbitControl(canvas, this.orbitTransform, {
      minRadius: 5.4,
      maxRadius: 13.5,
      minPhi: Math.PI * 0.045,
      maxPhi: Math.PI * 0.48,
      rotateSpeed: 0.62,
      zoomSpeed: 0.42,
      enablePan: false,
    });
  }

  private setupResizeObserver(canvas: HTMLCanvasElement): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => {
      this.engine.resizeToDisplaySize();
    });
    this.resizeObserver.observe(canvas);
  }

  private buildPad(): void {
    this.addBody();
    this.addScreen();
    this.addDetails();
    this.addBaseShadow();
  }

  private addBody(): void {
    const body = new Entity('PadBody');
    body.addComponent(new CartesianTransform3D({ position: [0, 0, 0] }));
    body.addComponent(new Mesh3D(
      createRoundedRectPrism(BODY_WIDTH, BODY_HEIGHT, BODY_RADIUS, BODY_THICKNESS),
      new BasicMaterial({ color: [0.20, 0.21, 0.23, 1], cullMode: 'none' }),
    ));
    this.world.addEntity(body);
  }

  private addScreen(): void {
    this.screenEntity = new Entity('PadScreen');
    this.screenGeometry = createRoundedRectPlane(SCREEN_WIDTH, SCREEN_HEIGHT, SCREEN_RADIUS, 14, 0, true);
    this.screenTransform = new CartesianTransform3D({ position: [0, TOP_Y + 0.014, -0.05] });
    this.screenEntity.addComponent(this.screenTransform);
    this.screenEntity.addComponent(new Mesh3D(
      this.screenGeometry,
      new BasicMaterial({
        texture: this.screenTexture,
        cullMode: 'none',
        sampler: {
          magFilter: 'linear',
          minFilter: 'linear',
        },
      }),
    ));
    this.world.addEntity(this.screenEntity);

  }

  private addDetails(): void {
    const home = new Entity('HomeButton');
    this.homeTransform = new CartesianTransform3D({ position: [0, HOME_BUTTON_Y, HOME_BUTTON_Z], scale: [1, 0.028, 1] });
    this.homeGeometry = createSphere3D({ radius: 0.135, widthSegments: 48, heightSegments: 8 });
    home.addComponent(this.homeTransform);
    home.addComponent(new Mesh3D(
      this.homeGeometry,
      new BasicMaterial({ color: [0.18, 0.19, 0.21, 1] }),
    ));
    this.world.addEntity(home);

    const camera = new Entity('FrontCamera');
    camera.addComponent(new CartesianTransform3D({ position: [0, TOP_Y + 0.035, BODY_HEIGHT / 2 - 0.28], scale: [1, 0.14, 1] }));
    this.frontCameraMaterial = new BasicMaterial({ color: [0.010, 0.012, 0.015, 1] });
    camera.addComponent(new Mesh3D(
      createSphere3D({ radius: 0.055, widthSegments: 20, heightSegments: 8 }),
      this.frontCameraMaterial,
    ));
    this.world.addEntity(camera);

    this.addSideButton('PowerButton', BODY_WIDTH / 2 + 0.018, TOP_Y - 0.03, 2.14, 0.035, 0.075, 0.72);
    this.addSideButton('VolumeButtonA', -BODY_WIDTH / 2 - 0.018, TOP_Y - 0.03, 1.10, 0.035, 0.075, 0.46);
    this.addSideButton('VolumeButtonB', -BODY_WIDTH / 2 - 0.018, TOP_Y - 0.03, 0.48, 0.035, 0.075, 0.46);
  }

  private addSideButton(name: string, x: number, y: number, z: number, width: number, height: number, depth: number): void {
    const button = new Entity(name);
    button.addComponent(new CartesianTransform3D({ position: [x, y, z] }));
    button.addComponent(new Mesh3D(
      createBox3D({ width, height, depth }),
      new BasicMaterial({ color: [0.24, 0.25, 0.27, 1] }),
    ));
    this.world.addEntity(button);
  }

  private addBaseShadow(): void {
    const shadow = new Entity('ContactShadow');
    shadow.addComponent(new CartesianTransform3D({ position: [0, -0.17, 0], scale: [1.04, 1, 1.04] }));
    shadow.addComponent(new Mesh3D(
      createRoundedRectPlane(BODY_WIDTH, BODY_HEIGHT, BODY_RADIUS),
      new BasicMaterial({ color: [0, 0, 0, 0.20], blending: 'normal' }),
    ));
    this.world.addEntity(shadow);
  }

  private tick(time: number, delta: number): void {
    this.updateScreenOrientation();
    this.screenScene.update(time, delta);
    this.updateCameraLight();
    this.engine.device.queue.copyExternalImageToTexture(
      { source: this.screenScene.canvas },
      { texture: this.screenTexture },
      [this.screenScene.canvas.width, this.screenScene.canvas.height],
    );
    this.world.update(time, delta);
  }

  private setupScreenInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (event) => {
      if (this.homeHitFromPointer(canvas, event)) {
        this.screenScene.returnHome();
        this.updateCameraLight();
        this.screenPointerActive = false;
        this.lastScreenPoint = null;
        this.orbit.enableRotate = true;
        this.orbit.enableZoom = true;
        this.saveState();
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const point = this.screenPointFromPointer(canvas, event);
      if (!point) return;
      this.screenPointerActive = true;
      this.lastScreenPoint = point;
      this.orbit.enableRotate = false;
      this.orbit.enableZoom = false;
      canvas.setPointerCapture(event.pointerId);
      this.screenScene.pointerDown({
        ...point,
        time: performance.now(),
        button: event.button,
        buttons: event.buttons,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
      });
      event.preventDefault();
    }, { capture: true });

    canvas.addEventListener('pointermove', (event) => {
      if (!this.screenPointerActive) return;
      const point = this.screenPointFromPointer(canvas, event) ?? this.fallbackScreenPoint(canvas, event);
      this.lastScreenPoint = point;
      this.screenScene.pointerMove({
        ...point,
        time: performance.now(),
        button: event.button,
        buttons: event.buttons,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
      });
      event.preventDefault();
    });

    const release = (event: PointerEvent) => {
      if (!this.screenPointerActive) return;
      const point = this.screenPointFromPointer(canvas, event) ?? this.lastScreenPoint;
      if (point) {
        this.screenScene.pointerUp({
          ...point,
          time: performance.now(),
          button: event.button,
          buttons: event.buttons,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
        });
      }
      this.screenPointerActive = false;
      this.lastScreenPoint = null;
      this.orbit.enableRotate = true;
      this.orbit.enableZoom = true;
      this.saveState();
      event.preventDefault();
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    canvas.addEventListener('wheel', (event) => {
      const point = this.screenPointFromPointer(canvas, event);
      if (!point) return;
      this.screenScene.wheel({
        ...point,
        time: performance.now(),
        deltaY: event.deltaY,
        button: 0,
        buttons: 0,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
      });
      this.saveState();
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true, passive: false });
  }

  private screenPointFromPointer(canvas: HTMLCanvasElement, event: MouseEvent): { x: number; y: number } | null {
    this.setPointerRay(canvas, event);

    this.screenTransform.updateWorldMatrix();
    const hit = this.ray.intersectMesh(this.screenGeometry, this.screenTransform.worldMatrix, { useBVH: false });
    if (!hit) return null;

    const invScreen = mat4.inverse(this.screenTransform.worldMatrix) as Float32Array;
    const local = vec3.transformMat4(hit.point, invScreen) as Float32Array;
    const u = 0.5 - requiredNumberAt(local, 0, 'pad screen-local hit') / SCREEN_WIDTH;
    const v = 0.5 - requiredNumberAt(local, 2, 'pad screen-local hit') / SCREEN_HEIGHT;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    return {
      x: u * this.screenScene.canvas.width,
      y: v * this.screenScene.canvas.height,
    };
  }

  private homeHitFromPointer(canvas: HTMLCanvasElement, event: PointerEvent): boolean {
    if (!this.homeGeometry || !this.homeTransform) return false;
    this.setPointerRay(canvas, event);
    this.homeTransform.updateWorldMatrix();
    return !!this.ray.intersectMesh(this.homeGeometry, this.homeTransform.worldMatrix, { useBVH: false });
  }

  private setPointerRay(canvas: HTMLCanvasElement, event: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((event.clientY - rect.top) / rect.height) * 2;

    this.camera.updateAspect(this.engine.width / this.engine.height);
    this.orbitTransform.updateWorldMatrix();
    const camWorld = this.orbitTransform.worldMatrix;
    const viewMatrix = mat4.inverse(camWorld) as Float32Array;
    const viewProj = mat4.multiply(this.camera.projectionMatrix, viewMatrix) as Float32Array;
    const invViewProj = mat4.inverse(viewProj) as Float32Array;
    const camPos = new Float32Array([requiredNumberAt(camWorld, 12, 'pad camera matrix'), requiredNumberAt(camWorld, 13, 'pad camera matrix'), requiredNumberAt(camWorld, 14, 'pad camera matrix')]);
    this.ray.setFromCamera(ndcX, ndcY, camPos, invViewProj);
  }

  private updateScreenOrientation(): void {
    this.camera.updateAspect(this.engine.width / this.engine.height);
    this.orbitTransform.updateWorldMatrix();
    this.screenTransform.updateWorldMatrix();

    const camWorld = this.orbitTransform.worldMatrix;
    const viewMatrix = mat4.inverse(camWorld) as Float32Array;
    const viewProj = mat4.multiply(this.camera.projectionMatrix, viewMatrix) as Float32Array;
    const screenWorld = this.screenTransform.worldMatrix;
    const corners: Vec3[] = [
      [-SCREEN_WIDTH / 2, 0, -SCREEN_HEIGHT / 2],
      [SCREEN_WIDTH / 2, 0, -SCREEN_HEIGHT / 2],
      [SCREEN_WIDTH / 2, 0, SCREEN_HEIGHT / 2],
      [-SCREEN_WIDTH / 2, 0, SCREEN_HEIGHT / 2],
    ];

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let centerX = 0;
    let homeX = 0;
    for (const local of corners) {
      const world = vec3.transformMat4(local, screenWorld) as Float32Array;
      const projected = projectPoint(requiredNumberAt(world, 0, 'pad screen corner'), requiredNumberAt(world, 1, 'pad screen corner'), requiredNumberAt(world, 2, 'pad screen corner'), viewProj);
      if (!projected) return;
      minX = Math.min(minX, projected.x);
      maxX = Math.max(maxX, projected.x);
      minY = Math.min(minY, projected.y);
      maxY = Math.max(maxY, projected.y);
    }
    const centerWorld = vec3.transformMat4([0, 0, 0], screenWorld) as Float32Array;
    const homeWorld = vec3.transformMat4([0, 0, -SCREEN_HEIGHT / 2], screenWorld) as Float32Array;
    const centerProjected = projectPoint(requiredNumberAt(centerWorld, 0, 'pad screen center'), requiredNumberAt(centerWorld, 1, 'pad screen center'), requiredNumberAt(centerWorld, 2, 'pad screen center'), viewProj);
    const homeProjected = projectPoint(requiredNumberAt(homeWorld, 0, 'pad home position'), requiredNumberAt(homeWorld, 1, 'pad home position'), requiredNumberAt(homeWorld, 2, 'pad home position'), viewProj);
    if (centerProjected && homeProjected) {
      centerX = centerProjected.x;
      homeX = homeProjected.x;
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const next = width > height * 1.08 ? 'landscape' : height > width * 1.08 ? 'portrait' : this.screenOrientation;
    const angle = next === 'landscape'
      ? homeX >= centerX ? Math.PI / 2 : -Math.PI / 2
      : 0;
    if (next !== this.screenOrientation || angle !== this.screenOrientationAngle) {
      this.screenOrientation = next;
      this.screenOrientationAngle = angle;
      this.screenScene.setDeviceOrientation(next, angle);
    }
  }

  private fallbackScreenPoint(canvas: HTMLCanvasElement, event: PointerEvent): { x: number; y: number } {
    const last = this.lastScreenPoint ?? { x: this.screenScene.canvas.width / 2, y: this.screenScene.canvas.height / 2 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp(last.x + event.movementX * (this.screenScene.canvas.width / rect.width), 0, this.screenScene.canvas.width),
      y: clamp(last.y + event.movementY * (this.screenScene.canvas.height / rect.height), 0, this.screenScene.canvas.height),
    };
  }

  private updateCameraLight(): void {
    if (!this.frontCameraMaterial) return;
    if (this.screenScene.isCameraActive()) {
      this.frontCameraMaterial.color.setFromSRGB(0.20, 1.0, 0.55, 1);
      this.frontCameraMaterial.emissiveFactor = [1.8, 2.6, 1.8];
    } else {
      this.frontCameraMaterial.color.setFromSRGB(0.010, 0.012, 0.015, 1);
      this.frontCameraMaterial.emissiveFactor = [1, 1, 1];
    }
  }

  private saveState(): void {
    this.saves.save(this.screenScene.snapshotSettings());
  }
}

const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
if (!canvas) throw new Error('Canvas element not found');
new PadSimulator().init(canvas).catch((error) => {
  console.error(error);
});
