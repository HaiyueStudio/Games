import { Camera2D, Entity, Transform2D, HaiyueEngine, World } from '@haiyue/engine';
import {
  GuiButton,
  GuiCheckbox,
  GuiRoot,
  GuiSelect,
  GuiSlider,
  GuiSystem,
  GuiTree,
} from '@haiyue/engine/gui';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { Spine2DComponent, Spine2DRenderSystem } from '@haiyue/extensions/spine';

interface SpineLayer {
  name: string;
  bone: string;
  attachment: string;
}

interface SpineSource {
  jsonUrl: string;
  atlasUrl: string;
  imageUrl: string;
  imageUrls: Record<string, string>;
  animations: string[];
  durations: Record<string, number>;
  skins: string[];
  skin: string;
  layers: SpineLayer[];
  revoke(): void;
}

interface PointerOptions {
  button?: number;
  buttons?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

const VIEW_W = 1024;
const VIEW_H = 1458;
const PANEL_X = 690;
const PANEL_W = 300;
const PREVIEW_RIGHT = PANEL_X - 24;
const MIN_SPINE_SCALE = 0.2;
const MAX_SPINE_SCALE = 5;

function dataUri(type: string, text: string): string {
  return `data:${type};base64,${btoa(unescape(encodeURIComponent(text)))}`;
}

function createSampleImageUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, canvas.width, canvas.height);

  const body = context.createLinearGradient(16, 16, 112, 112);
  body.addColorStop(0, '#73b7ff');
  body.addColorStop(1, '#1f6fb8');
  context.fillStyle = body;
  context.beginPath();
  context.roundRect(16, 18, 96, 92, 22);
  context.fill();

  const head = context.createLinearGradient(152, 20, 226, 94);
  head.addColorStop(0, '#ffd66b');
  head.addColorStop(1, '#d97922');
  context.fillStyle = head;
  context.beginPath();
  context.arc(192, 64, 42, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#111827';
  context.beginPath();
  context.arc(178, 56, 5, 0, Math.PI * 2);
  context.arc(206, 56, 5, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#111827';
  context.lineWidth = 4;
  context.beginPath();
  context.arc(192, 68, 18, 0.15, Math.PI - 0.15);
  context.stroke();

  return canvas.toDataURL('image/png');
}

function createSampleSource(): SpineSource {
  const json = {
    skeleton: { hash: 'sample', spine: '3.8.0', width: 220, height: 180 },
    bones: [
      { name: 'root' },
      { name: 'body', parent: 'root', y: -25 },
      { name: 'head', parent: 'body', y: 72 },
    ],
    slots: [
      { name: 'body-slot', bone: 'body', attachment: 'body' },
      { name: 'head-slot', bone: 'head', attachment: 'head' },
    ],
    skins: [{
      name: 'default',
      attachments: {
        'body-slot': { body: { type: 'region', name: 'body', width: 96, height: 92 } },
        'head-slot': { head: { type: 'region', name: 'head', width: 84, height: 84 } },
      },
    }],
    animations: {
      idle: {
        bones: {
          body: {
            rotate: [{ time: 0, angle: -4 }, { time: 0.45, angle: 4 }, { time: 0.9, angle: -4 }],
            translate: [{ time: 0, y: 0 }, { time: 0.45, y: 10 }, { time: 0.9, y: 0 }],
          },
          head: { rotate: [{ time: 0, angle: 7 }, { time: 0.45, angle: -7 }, { time: 0.9, angle: 7 }] },
        },
      },
      nod: {
        bones: {
          head: { rotate: [{ time: 0, angle: -16 }, { time: 0.2, angle: 18 }, { time: 0.4, angle: -16 }, { time: 0.6, angle: 18 }, { time: 0.8, angle: -16 }] },
        },
      },
    },
  };
  const atlas = [
    'sample.png',
    'size: 256,128',
    'format: RGBA8888',
    'filter: Linear,Linear',
    'repeat: none',
    'body',
    '  rotate: false',
    '  xy: 16, 18',
    '  size: 96, 92',
    '  orig: 96, 92',
    '  offset: 0, 0',
    'head',
    '  rotate: false',
    '  xy: 150, 22',
    '  size: 84, 84',
    '  orig: 84, 84',
    '  offset: 0, 0',
  ].join('\n');
  return {
    jsonUrl: dataUri('application/json', JSON.stringify(json)),
    atlasUrl: dataUri('text/plain', atlas),
    imageUrl: createSampleImageUrl(),
    imageUrls: {},
    animations: Object.keys(json.animations),
    durations: getAnimationDurations(json.animations),
    skins: ['default'],
    skin: 'default',
    layers: getLayerList(json),
    revoke() {},
  };
}

function filePath(file: File): string {
  return ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).replace(/\\/g, '/');
}

function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index >= 0 ? path.slice(0, index) : '';
}

function resolvePath(baseDir: string, path: string): string {
  const out: string[] = [];
  for (const part of `${baseDir}/${path}`.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function getLayerList(json: unknown): SpineLayer[] {
  if (!json || typeof json !== 'object') return [];
  const slots = (json as { slots?: unknown }).slots;
  if (!Array.isArray(slots)) return [];
  return slots.map((slot): SpineLayer => {
    const value = slot && typeof slot === 'object' ? slot as Record<string, unknown> : {};
    return {
      name: typeof value.name === 'string' ? value.name : '',
      bone: typeof value.bone === 'string' ? value.bone : '',
      attachment: typeof value.attachment === 'string' ? value.attachment : '',
    };
  }).filter(slot => slot.name.length > 0);
}

function getSkinNames(skins: unknown): string[] {
  if (Array.isArray(skins)) {
    const names = skins
      .map((skin: unknown) => skin && typeof skin === 'object' ? (skin as { name?: unknown }).name : null)
      .filter((name): name is string => typeof name === 'string' && name.length > 0);
    return names.length ? names : ['default'];
  }
  if (skins && typeof skins === 'object') {
    const names = Object.keys(skins);
    return names.length ? names : ['default'];
  }
  return ['default'];
}

function getAnimationDurations(animations: Record<string, unknown>): Record<string, number> {
  const durations: Record<string, number> = {};
  for (const [name, animation] of Object.entries(animations)) durations[name] = getTimelineDuration(animation);
  return durations;
}

function getAtlasPages(text: string): string[] {
  const pages: string[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? '';
    if (!line || line.includes(':')) continue;
    const next = lines[i + 1]?.trim() ?? '';
    if (next.startsWith('size:') || next.startsWith('format:') || next.startsWith('filter:') || next.startsWith('repeat:') || next.startsWith('pma:')) {
      pages.push(line);
    }
  }
  return pages;
}

function getTimelineDuration(value: unknown): number {
  let duration = 0;
  const scan = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const frame of node) {
        if (frame && typeof frame === 'object' && typeof (frame as { time?: unknown }).time === 'number') {
          duration = Math.max(duration, (frame as { time: number }).time);
        }
      }
    } else if (node && typeof node === 'object') {
      for (const child of Object.values(node)) scan(child);
    }
  };
  scan(value);
  return duration;
}

function parseSpineMeta(text: string): { animations: string[]; durations: Record<string, number>; skins: string[]; layers: SpineLayer[] } {
  try {
    const json = JSON.parse(text);
    const animations = json.animations ?? {};
    return {
      animations: Object.keys(animations),
      durations: getAnimationDurations(animations),
      skins: getSkinNames(json.skins),
      layers: getLayerList(json),
    };
  } catch {
    return { animations: [], durations: {}, skins: ['default'], layers: [] };
  }
}

async function createLocalSource(files: FileList | File[]): Promise<SpineSource> {
  const list = Array.from(files);
  const jsonFile = list.find(file => /\.json$/i.test(file.name));
  if (!jsonFile) throw new Error('Select a folder that contains a Spine .json file.');
  const atlasFiles = list.filter(file => /\.atlas$/i.test(file.name));
  const atlasFile = atlasFiles.find(file => !/-pma\.atlas$/i.test(file.name)) ?? atlasFiles[0] ?? null;
  const urls: string[] = [];
  const makeUrl = (file: File): string => {
    const url = URL.createObjectURL(file);
    urls.push(url);
    return url;
  };

  const jsonText = await jsonFile.text();
  const meta = parseSpineMeta(jsonText);
  let imageFile = list.find(file => /\.(png|jpg|jpeg|webp)$/i.test(file.name)) ?? null;
  const imageUrls: Record<string, string> = {};
  let atlasUrl: string;
  if (atlasFile) {
    const atlasText = await atlasFile.text();
    const atlasBase = dirname(filePath(atlasFile));
    const pages = getAtlasPages(atlasText);
    for (const page of pages) {
      const pageMatch = list.find(file => filePath(file) === resolvePath(atlasBase, page) || file.name === page.split('/').pop());
      if (!pageMatch) continue;
      imageUrls[page] = makeUrl(pageMatch);
      imageFile ??= pageMatch;
    }
    const firstPage = pages[0] ?? '';
    const pageMatch = firstPage
      ? list.find(file => filePath(file) === resolvePath(atlasBase, firstPage) || file.name === firstPage.split('/').pop())
      : null;
    imageFile = pageMatch ?? imageFile;
    atlasUrl = makeUrl(atlasFile);
  } else {
    const parsed = JSON.parse(jsonText);
    const attachmentNames = Object.keys(parsed.skins?.[0]?.attachments ?? {});
    atlasUrl = dataUri('text/plain', [
      imageFile?.name ?? 'spine.png',
      'size: 1,1',
      'format: RGBA8888',
      'filter: Linear,Linear',
      'repeat: none',
      ...attachmentNames.flatMap(name => [name, '  rotate: false', '  xy: 0, 0', '  size: 1, 1', '  orig: 1, 1', '  offset: 0, 0']),
    ].join('\n'));
  }
  if (!imageFile) throw new Error('Select a folder that contains the atlas image.');

  return {
    jsonUrl: makeUrl(jsonFile),
    atlasUrl,
    imageUrl: makeUrl(imageFile),
    imageUrls,
    animations: meta.animations,
    durations: meta.durations,
    skins: meta.skins,
    skin: meta.skins[0] ?? 'default',
    layers: meta.layers,
    revoke: () => urls.forEach(url => URL.revokeObjectURL(url)),
  };
}

export class SpineViewerScene {
  readonly canvas: HTMLCanvasElement;

  private engine!: HaiyueEngine;
  private world!: World;
  private spine!: Spine2DComponent;
  private spineTransform!: Transform2D;
  private guiRoot!: GuiRoot;
  private animationSelect!: GuiSelect<string>;
  private skinSelect!: GuiSelect<string>;
  private timelineSlider!: GuiSlider;
  private meshCheckbox!: GuiCheckbox;
  private boneCheckbox!: GuiCheckbox;
  private layerTree!: GuiTree<string>;
  private fileInput: HTMLInputElement;
  private currentSource: SpineSource | null = null;
  private playbackSpeed = 1;
  private lastTime = 0;
  private initialized = false;
  private draggingSpine = false;
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
    (this.fileInput as HTMLInputElement & { webkitdirectory?: boolean }).webkitdirectory = true;
    this.fileInput.style.display = 'none';
    document.body.appendChild(this.fileInput);
    this.fileInput.addEventListener('change', () => {
      const files = this.fileInput.files;
      if (!files?.length) return;
      void createLocalSource(files)
        .then(source => this.applySource(source))
        .catch(error => console.error(error))
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
      clearColor: { r: 0.032, g: 0.041, b: 0.060, a: 1 },
      alphaMode: 'premultiplied',
      msaaSamples: 4,
      devicePixelRatio: 1,
    });
    await this.engine.init();

    this.world = new World('Pad Spine Viewer');
    const camera = new Entity('SpineCamera');
    camera.addComponent(new Camera2D({ width: VIEW_W, height: VIEW_H, zoom: 1 }));
    this.world.addEntity(camera);

    this.spine = new Spine2DComponent({ loop: true, scale: 1.45, timeScale: this.playbackSpeed, mixDuration: 0.12 });
    this.spineTransform = new Transform2D({ x: -190, y: -105 });
    const spineEntity = new Entity('SpineModel');
    spineEntity.addComponent(this.spineTransform);
    spineEntity.addComponent(this.spine);
    this.world.addEntity(spineEntity);
    const renderIntegration = new RenderIntegration(this.engine, { label: 'PadSpineViewer.render' });
    this.world.addRuntimeIntegration(renderIntegration);
    this.world.addSystem(new Spine2DRenderSystem(this.engine, camera, { loadOp: 'clear' }));

    const guiEntity = new Entity('SpineGui');
    this.guiRoot = new GuiRoot();
    guiEntity.addComponent(this.guiRoot);
    this.world.addEntity(guiEntity);
    this.buildGui();
    this.world.addSystem(new GuiSystem(this.engine, { loadOp: 'load' }));
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));
    this.applySource(createSampleSource());
  }

  stop(): void {
    this.currentSource?.revoke();
    this.currentSource = null;
    this.engine?.stop();
    this.canvas.remove();
    this.fileInput.remove();
  }

  update(time: number): void {
    if (!this.initialized || !this.timelineSlider) return;
    const delta = this.lastTime ? time - this.lastTime : 16;
    this.lastTime = time;
    this.updateTimelineFromSpine();
    this.world.update(time, delta);
  }

  dispatchPointer(type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', x: number, y: number, options: PointerOptions = {}): void {
    if (this.draggingSpine && type === 'pointermove') {
      this.dragSpineTo(x, y);
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
      this.draggingSpine = true;
      this.dragLastX = x;
      this.dragLastY = y;
    } else if (type === 'pointerup' || type === 'pointercancel') {
      this.draggingSpine = false;
    }

    this.update(performance.now());
  }

  dispatchWheel(x: number, y: number, deltaY: number, options: PointerOptions = {}): void {
    if (this.isPreviewPoint(x, y)) {
      this.zoomSpine(deltaY);
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

  private isPreviewPoint(x: number, y: number): boolean {
    return x >= 0 && x <= PREVIEW_RIGHT && y >= 0 && y <= VIEW_H;
  }

  private dragSpineTo(x: number, y: number): void {
    const dx = x - this.dragLastX;
    const dy = y - this.dragLastY;
    this.dragLastX = x;
    this.dragLastY = y;
    this.spineTransform.x += dx;
    this.spineTransform.y -= dy;
  }

  private zoomSpine(deltaY: number): void {
    const factor = Math.exp(-deltaY * 0.0015);
    this.spine.scale = Math.max(MIN_SPINE_SCALE, Math.min(MAX_SPINE_SCALE, this.spine.scale * factor));
  }

  private buildGui(): void {
    this.guiRoot.add(new GuiButton({
      id: 'import',
      x: PANEL_X,
      y: 62,
      width: 132,
      height: 38,
      text: 'Import',
      variant: 'primary',
      onClick: () => this.fileInput.click(),
    }));
    this.guiRoot.add(new GuiButton({
      id: 'sample',
      x: PANEL_X + 148,
      y: 62,
      width: 132,
      height: 38,
      text: 'Sample',
      onClick: () => this.applySource(createSampleSource()),
    }));
    this.animationSelect = this.guiRoot.add(new GuiSelect<string>({
      id: 'animation',
      x: PANEL_X,
      y: 126,
      width: PANEL_W,
      placeholder: 'Animation',
      onChange: value => this.changeAnimation(value),
    }));
    this.skinSelect = this.guiRoot.add(new GuiSelect<string>({
      id: 'skin',
      x: PANEL_X,
      y: 182,
      width: PANEL_W,
      placeholder: 'Skin',
      onChange: value => {
        this.spine.skin = value || 'default';
        this.spine.runtimeKey = '';
        this.spine.loadingKey = '';
        this.spine.status = 'idle';
      },
    }));
    this.timelineSlider = this.guiRoot.add(new GuiSlider({
      id: 'timeline',
      x: PANEL_X,
      y: 238,
      width: PANEL_W,
      min: 0,
      max: 1,
      value: 0,
      step: 0.001,
      onChange: value => {
        this.spine.timeScale = 0;
        this.setAnimationTime(value);
      },
      onCommit: () => {
        this.spine.timeScale = 0;
      },
    }));
    this.meshCheckbox = this.guiRoot.add(new GuiCheckbox({
      id: 'mesh',
      x: PANEL_X,
      y: 288,
      width: 138,
      label: 'Mesh',
      onChange: value => {
        this.spine.debugMesh = value;
      },
    }));
    this.boneCheckbox = this.guiRoot.add(new GuiCheckbox({
      id: 'bones',
      x: PANEL_X + 148,
      y: 288,
      width: 138,
      label: 'Bones',
      onChange: value => {
        this.spine.debugBones = value;
      },
    }));
    this.layerTree = this.guiRoot.add(new GuiTree<string>({
      id: 'layers',
      x: PANEL_X,
      y: 340,
      width: PANEL_W,
      height: 464,
      expandedKeys: [],
      nodes: [],
    }));
  }

  private applySource(source: SpineSource): void {
    this.currentSource?.revoke();
    this.currentSource = source;
    this.spine.jsonUrl = source.jsonUrl;
    this.spine.atlasUrl = source.atlasUrl;
    this.spine.imageUrl = source.imageUrl;
    this.spine.imageUrls = source.imageUrls;
    this.spine.skin = source.skins.includes(source.skin) ? source.skin : source.skins[0] ?? 'default';
    this.spine.animation = source.animations.includes('idle') ? 'idle' : source.animations[0] ?? '';
    this.spine.elapsed = 0;
    this.spine.previousAnimation = '';
    this.spine.previousElapsed = 0;
    this.spine.mixElapsed = 0;
    this.spine.runtimeKey = '';
    this.spine.loadingKey = '';
    this.spine.status = 'idle';
    this.spine.timeScale = this.playbackSpeed;
    this.animationSelect.options = (source.animations.length ? source.animations : ['']).map(name => ({
      label: name || 'setup pose',
      value: name,
    }));
    this.animationSelect.setValue(this.spine.animation);
    this.skinSelect.options = (source.skins.length ? source.skins : ['default']).map(name => ({
      label: name,
      value: name,
    }));
    this.skinSelect.setValue(this.spine.skin);
    this.timelineSlider.min = 0;
    this.timelineSlider.max = Math.max(this.currentDuration(), 0.001);
    this.timelineSlider.setValue(0);
    this.layerTree.setNodes(this.createLayerTreeNodes(source.layers));
    this.layerTree.expandedKeys = new Set(this.layerTree.nodes.map(node => node.key));
    this.layerTree.markDirty();
  }

  private changeAnimation(nextAnimation: string): void {
    if (nextAnimation === this.spine.animation) return;
    this.spine.previousAnimation = this.spine.animation;
    this.spine.previousElapsed = this.spine.elapsed;
    this.spine.mixElapsed = 0;
    this.spine.animation = nextAnimation;
    this.spine.elapsed = 0;
    if (this.spine.mixDuration <= 0) this.spine.previousAnimation = '';
    this.spine.timeScale = this.playbackSpeed;
    this.timelineSlider.max = Math.max(this.currentDuration(), 0.001);
    this.timelineSlider.setValue(0);
  }

  private currentDuration(): number {
    return this.currentSource?.durations[this.spine.animation] ?? 0;
  }

  private currentAnimationTime(): number {
    const duration = this.currentDuration();
    const seconds = this.spine.elapsed / 1000;
    if (duration <= 0) return seconds;
    return this.spine.loop ? seconds % duration : Math.min(seconds, duration);
  }

  private setAnimationTime(seconds: number): void {
    this.spine.elapsed = Math.max(0, seconds) * 1000;
  }

  private updateTimelineFromSpine(): void {
    const duration = this.currentDuration();
    this.timelineSlider.max = Math.max(duration, 0.001);
    this.timelineSlider.setValue(duration > 0 ? this.currentAnimationTime() : 0);
  }

  private createLayerTreeNodes(layers: SpineLayer[]) {
    const byBone = new Map<string, SpineLayer[]>();
    for (const layer of layers) {
      const key = layer.bone || 'root';
      const list = byBone.get(key) ?? [];
      list.push(layer);
      byBone.set(key, list);
    }
    return Array.from(byBone.entries()).map(([bone, boneLayers]) => ({
      key: `bone:${bone}`,
      label: bone,
      children: boneLayers.map(layer => ({
        key: `slot:${bone}:${layer.name}`,
        label: `${layer.name}${layer.attachment ? ` (${layer.attachment})` : ''}`,
        value: layer.name,
      })),
    }));
  }
}
