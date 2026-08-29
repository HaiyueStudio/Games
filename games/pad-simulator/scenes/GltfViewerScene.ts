import { Camera3D, CartesianTransform3D, Entity, SphericalTransform3D, HaiyueEngine, World } from '@haiyue/engine';
import { Render3DSystem } from '@haiyue/engine/systems';
import {
  GuiButton,
  GuiCheckbox,
  GuiRoot,
  GuiSelect,
  GuiSlider,
  GuiSystem,
} from '@haiyue/engine/gui';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { applyGltfAnimationClip, GltfModelComponent, GltfModelSystem, type GltfAnimationClip } from '@haiyue/extensions/gltf';

interface PointerOptions {
  button?: number;
  buttons?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

interface GltfSource {
  src: string;
  name: string;
  revoke(): void;
}

const VIEW_W = 1024;
const VIEW_H = 1458;
const PANEL_X = 650;
const PANEL_W = 330;
const PREVIEW_RIGHT = PANEL_X - 24;

function normalizeLocalPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+/g, '/');
}

function getLocalFilePath(file: File): string {
  return normalizeLocalPath((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name);
}

function dirname(path: string): string {
  const normalized = normalizeLocalPath(path);
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(0, index) : '';
}

function resolveLocalPath(baseDir: string, uri: string): string {
  const parts = normalizeLocalPath(`${baseDir}/${uri}`).split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function isEmbeddedOrRemoteUri(uri: string): boolean {
  return /^(data:|blob:|https?:\/\/)/i.test(uri);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function getFileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function createLocalGltfSource(files: FileList | File[]): Promise<GltfSource> {
  const list = Array.from(files);
  if (!list.length) throw new Error('Select a folder containing a .gltf or .glb model.');
  const filesByPath = new Map<string, File>();
  for (const file of list) filesByPath.set(getLocalFilePath(file), file);

  const entry = list.find(file => /\.glb$/i.test(file.name))
    ?? list.find(file => /\.gltf$/i.test(file.name));
  if (!entry) throw new Error('Select a folder containing a .gltf or .glb model.');

  const name = entry.name.replace(/\.(gltf|glb)$/i, '') || 'glTF Model';
  if (/\.glb$/i.test(entry.name)) {
    const url = URL.createObjectURL(entry);
    return { src: url, name, revoke: () => URL.revokeObjectURL(url) };
  }

  const entryPath = getLocalFilePath(entry);
  const baseDir = dirname(entryPath);
  const gltf = JSON.parse(await entry.text());
  const dataUrlCache = new Map<File, Promise<string>>();
  const dataUrlFor = (file: File): Promise<string> => {
    let promise = dataUrlCache.get(file);
    if (!promise) {
      promise = getFileDataUrl(file);
      dataUrlCache.set(file, promise);
    }
    return promise;
  };
  const rewriteUri = async (uri: unknown): Promise<unknown> => {
    if (typeof uri !== 'string' || isEmbeddedOrRemoteUri(uri)) return uri;
    const normalized = normalizeLocalPath(uri);
    const match = filesByPath.get(resolveLocalPath(baseDir, normalized))
      ?? filesByPath.get(normalized)
      ?? list.find(file => file.name === normalized.split('/').pop());
    return match ? dataUrlFor(match) : uri;
  };

  for (const buffer of gltf.buffers ?? []) buffer.uri = await rewriteUri(buffer.uri);
  for (const image of gltf.images ?? []) image.uri = await rewriteUri(image.uri);
  const bytes = new TextEncoder().encode(JSON.stringify(gltf));
  return {
    src: `data:model/gltf+json;base64,${bytesToBase64(bytes)}`,
    name,
    revoke: () => {},
  };
}

export class GltfViewerScene {
  readonly canvas: HTMLCanvasElement;

  private engine!: HaiyueEngine;
  private world!: World;
  private cameraOrbit!: SphericalTransform3D;
  private model!: GltfModelComponent;
  private modelTransform!: CartesianTransform3D;
  private guiRoot!: GuiRoot;
  private importButton!: GuiButton;
  private statusButton!: GuiButton;
  private animationSelect!: GuiSelect<string>;
  private speedSlider!: GuiSlider;
  private scaleSlider!: GuiSlider;
  private spinCheckbox!: GuiCheckbox;
  private fileInput: HTMLInputElement;
  private source: GltfSource | null = null;
  private initialized = false;
  private lastStatus = '';
  private selectedAnimation = '';
  private animationTime = 0;
  private playbackSpeed = 1;
  private spin = false;
  private rotationX = 0;
  private rotationY = 0;
  private scale = 1;
  private draggingModel = false;
  private dragLastX = 0;
  private dragLastY = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;
    Object.assign(this.canvas.style, {
      position: 'fixed',
      left: '-20000px',
      top: '0px',
      width: `${VIEW_W}px`,
      height: `${VIEW_H}px`,
      pointerEvents: 'auto',
    });
    document.body.appendChild(this.canvas);

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.multiple = true;
    this.fileInput.accept = '.gltf,.glb,.bin,image/*,application/json,model/gltf+json,model/gltf-binary';
    (this.fileInput as HTMLInputElement & { webkitdirectory?: boolean }).webkitdirectory = true;
    this.fileInput.style.display = 'none';
    document.body.appendChild(this.fileInput);
    this.fileInput.addEventListener('change', () => {
      const files = this.fileInput.files;
      if (!files?.length) return;
      this.setStatus('Loading folder...');
      void createLocalGltfSource(files)
        .then(source => this.applySource(source))
        .catch(error => this.setStatus(error instanceof Error ? error.message : String(error)))
        .finally(() => {
          this.fileInput.value = '';
        });
    });
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.engine = new HaiyueEngine({
      canvas: this.canvas,
      clearColor: { r: 0.030, g: 0.038, b: 0.055, a: 1 },
      alphaMode: 'premultiplied',
      msaaSamples: 4,
      devicePixelRatio: 1,
    });
    await this.engine.init();

    this.world = new World('Pad glTF Viewer');
    const camera = new Entity('GltfViewerCamera');
    camera.addComponent(new Camera3D({ type: 'perspective', fov: Math.PI / 4.2, near: 0.02, far: 1000 }));
    this.cameraOrbit = new SphericalTransform3D({
      radius: 5.2,
      theta: Math.PI * 0.76,
      phi: Math.PI * 0.34,
      target: [0, 0, 0],
    });
    camera.addComponent(this.cameraOrbit);
    this.world.addEntity(camera);

    const modelEntity = new Entity('GltfViewerModel');
    this.modelTransform = new CartesianTransform3D({ scale: [1, 1, 1] });
    this.model = new GltfModelComponent({ src: '', autoLoad: true, clearPrevious: true });
    modelEntity.addComponent(this.modelTransform);
    modelEntity.addComponent(this.model);
    this.world.addEntity(modelEntity);

    const renderIntegration = new RenderIntegration(this.engine, { label: 'PadGltfViewer.render' });

    this.world.addRuntimeIntegration(renderIntegration);
    this.world.addSystem(new GltfModelSystem({ priority: 0 }));
    this.world.addSystem(new Render3DSystem(this.engine, camera, { loadOp: 'clear', priority: 1, renderProfile: 'simple' }));

    const guiEntity = new Entity('GltfViewerGui');
    this.guiRoot = new GuiRoot();
    guiEntity.addComponent(this.guiRoot);
    this.world.addEntity(guiEntity);
    this.buildGui();
    this.world.addSystem(new GuiSystem(this.engine, { loadOp: 'load' }));
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));
    this.setStatus('Import a glTF folder');
  }

  stop(): void {
    this.source?.revoke();
    this.source = null;
    this.world?.destroy();
    this.engine?.stop();
    this.canvas.remove();
    this.fileInput.remove();
  }

  update(time: number, delta = 16): void {
    if (!this.initialized) return;
    this.updateAnimation(delta);
    if (this.spin) {
      this.rotationY += delta * 0.00035;
      this.applyModelTransform();
    }
    this.world.update(time, delta);
    this.syncLoadedState();
  }

  dispatchPointer(type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', x: number, y: number, options: PointerOptions = {}): void {
    if (this.draggingModel && type === 'pointermove') {
      this.dragModelTo(x, y);
      this.update(performance.now());
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const event = new PointerEvent(type, {
      clientX: rect.left + x,
      clientY: rect.top + y,
      button: options.button ?? 0,
      buttons: options.buttons ?? (type === 'pointerup' || type === 'pointercancel' ? 0 : 1),
      ctrlKey: options.ctrlKey ?? false,
      metaKey: options.metaKey ?? false,
      pointerId: 1,
      bubbles: true,
      cancelable: true,
    });
    this.canvas.dispatchEvent(event);

    if (type === 'pointerdown' && this.isPreviewPoint(x, y) && (options.button ?? 0) === 0) {
      this.draggingModel = true;
      this.dragLastX = x;
      this.dragLastY = y;
    } else if (type === 'pointerup' || type === 'pointercancel') {
      this.draggingModel = false;
    }

    this.update(performance.now());
  }

  dispatchWheel(x: number, y: number, deltaY: number, options: PointerOptions = {}): void {
    if (this.isPreviewPoint(x, y)) {
      this.zoomModel(deltaY);
      this.update(performance.now());
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const event = new WheelEvent('wheel', {
      clientX: rect.left + x,
      clientY: rect.top + y,
      deltaY,
      deltaMode: 0,
      ctrlKey: options.ctrlKey ?? false,
      metaKey: options.metaKey ?? false,
      bubbles: true,
      cancelable: true,
    });
    this.canvas.dispatchEvent(event);
    this.update(performance.now());
  }

  private buildGui(): void {
    this.importButton = this.guiRoot.add(new GuiButton({
      id: 'import-gltf',
      x: PANEL_X,
      y: 62,
      width: 154,
      height: 40,
      text: 'Import',
      variant: 'primary',
      onClick: () => this.fileInput.click(),
    }));
    this.guiRoot.add(new GuiButton({
      id: 'reset-view',
      x: PANEL_X + 176,
      y: 62,
      width: 154,
      height: 40,
      text: 'Reset',
      onClick: () => this.resetView(),
    }));
    this.animationSelect = this.guiRoot.add(new GuiSelect<string>({
      id: 'gltf-animation',
      x: PANEL_X,
      y: 126,
      width: PANEL_W,
      placeholder: 'No animations',
      onChange: value => {
        this.selectedAnimation = value;
        this.animationTime = 0;
      },
    }));
    this.speedSlider = this.guiRoot.add(new GuiSlider({
      id: 'gltf-speed',
      x: PANEL_X,
      y: 184,
      width: PANEL_W,
      min: 0,
      max: 2,
      value: 1,
      step: 0.05,
      onChange: value => {
        this.playbackSpeed = value;
      },
    }));
    this.scaleSlider = this.guiRoot.add(new GuiSlider({
      id: 'gltf-scale',
      x: PANEL_X,
      y: 238,
      width: PANEL_W,
      min: 0.05,
      max: 18,
      value: 1,
      step: 0.05,
      onChange: value => {
        this.scale = value;
        this.applyModelTransform();
      },
    }));
    this.spinCheckbox = this.guiRoot.add(new GuiCheckbox({
      id: 'gltf-spin',
      x: PANEL_X,
      y: 292,
      width: 180,
      label: 'Auto rotate',
      checked: false,
      onChange: value => {
        this.spin = value;
      },
    }));
    this.statusButton = this.guiRoot.add(new GuiButton({
      id: 'gltf-status',
      x: PANEL_X,
      y: 356,
      width: PANEL_W,
      height: 78,
      text: 'Import a glTF folder',
    }));
    this.statusButton.setDisabled(true);
  }

  private applySource(source: GltfSource): void {
    this.source?.revoke();
    this.source = source;
    this.selectedAnimation = '';
    this.animationTime = 0;
    this.model.src = source.src;
    this.model.runtimeSourceKey = '';
    this.model.loadingSourceKey = '';
    this.model.status = 'idle';
    this.model.error = null;
    this.animationSelect.options = [];
    this.animationSelect.placeholder = 'Loading animations';
    this.animationSelect.setValue('');
    this.setStatus(`Loading ${source.name}`);
    this.resetView();
  }

  private syncLoadedState(): void {
    if (this.model.status === this.lastStatus) return;
    this.lastStatus = this.model.status;
    if (this.model.status === 'loaded') {
      const clips = this.model.runtimeAnimationClips;
      this.animationSelect.options = clips.map(clip => ({ label: clip.name, value: clip.name }));
      this.animationSelect.placeholder = clips.length ? 'Animation' : 'No animations';
      const firstClip = clips[0];
      if (firstClip) {
        this.selectedAnimation = firstClip.name;
        this.animationSelect.setValue(this.selectedAnimation);
      }
      const stats = this.model.runtimeAssetStats;
      const suffix = stats ? `Mesh ${stats.meshCount} / Tex ${stats.textureCount} / Anim ${stats.animationCount}` : 'Loaded';
      this.setStatus(suffix);
    } else if (this.model.status === 'error') {
      this.setStatus(this.model.error || 'Failed to load model');
    } else if (this.model.status === 'loading') {
      this.setStatus('Loading model...');
    }
  }

  private updateAnimation(delta: number): void {
    const clip = this.currentClip();
    if (!clip || this.playbackSpeed <= 0) return;
    this.animationTime += (delta / 1000) * this.playbackSpeed;
    applyGltfAnimationClip(clip, this.animationTime);
  }

  private currentClip(): GltfAnimationClip | null {
    if (!this.selectedAnimation) return null;
    return this.model.runtimeAnimationClips.find(clip => clip.name === this.selectedAnimation) ?? null;
  }

  private resetView(): void {
    this.rotationX = 0;
    this.rotationY = 0;
    this.scale = 1;
    this.cameraOrbit.set(5.2, Math.PI * 0.76, Math.PI * 0.34);
    this.cameraOrbit.setTarget(0, 0, 0);
    this.scaleSlider?.setValue(this.scale);
    this.applyModelTransform();
  }

  private isPreviewPoint(x: number, y: number): boolean {
    return x >= 0 && x <= PREVIEW_RIGHT && y >= 0 && y <= VIEW_H;
  }

  private dragModelTo(x: number, y: number): void {
    const dx = x - this.dragLastX;
    const dy = y - this.dragLastY;
    this.dragLastX = x;
    this.dragLastY = y;
    this.rotationY += dx * 0.008;
    this.rotationX = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, this.rotationX + dy * 0.006));
    this.applyModelTransform();
  }

  private zoomModel(deltaY: number): void {
    this.scale = Math.max(0.05, Math.min(18, this.scale * Math.exp(-deltaY * 0.0015)));
    this.scaleSlider?.setValue(this.scale);
    this.applyModelTransform();
  }

  private applyModelTransform(): void {
    this.modelTransform.setRotation(this.rotationX, this.rotationY, 0);
    this.modelTransform.setScale(this.scale, this.scale, this.scale);
  }

  private setStatus(text: string): void {
    this.statusButton?.setText(text.length > 34 ? `${text.slice(0, 31)}...` : text);
  }
}
