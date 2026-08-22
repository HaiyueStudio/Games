import { HaiyueEngine } from '@haiyue/engine';
import { World } from '@haiyue/engine';
import { Entity } from '@haiyue/engine';
import { Camera3D } from '@haiyue/engine';
import { CartesianTransform3D } from '@haiyue/engine';
import { SphericalTransform3D } from '@haiyue/engine';
import { Mesh3D } from '@haiyue/engine';
import { Render3DSystem } from '@haiyue/engine/systems';
import { BlinnPhongRenderSystem } from '@haiyue/engine/systems';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { BasicMaterial } from '@haiyue/engine';
import { ColorSRGB } from '@haiyue/engine';
import { AmbientLight } from '@haiyue/engine/lighting';
import { DirectionalLight } from '@haiyue/engine';
import { createBox3D } from '@haiyue/engine';
import { mat4 } from 'wgpu-matrix';
import { requiredNumberAt } from '../arrayAccess';
import { SingleSlotGameSave, isNonNegativeInteger, isRecord } from '../save/SingleSlotGameSave';

interface PianoSaveData { lastMidi: number | null }

function isPianoSaveData(value: unknown): value is PianoSaveData {
  return isRecord(value) && (value.lastMidi === null
    || (isNonNegativeInteger(value.lastMidi) && value.lastMidi <= 127));
}

interface Config {
  startMidi: number;
  keys: number;
}

interface PianoKey {
  midi: number;
  name: string;
  black: boolean;
  entity: Entity;
  material: BasicMaterial;
  transform: CartesianTransform3D;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  pressUntil: number;
}

interface MidiJs {
  loadPlugin(options: {
    soundfontUrl?: string;
    instrument?: string;
    onsuccess?: () => void;
    onerror?: () => void;
  }): void;
  setVolume(channel: number, volume: number): void;
  noteOn(channel: number, note: number, velocity: number, delay: number): void;
  noteOff(channel: number, note: number, delay: number): void;
}

declare global {
  interface Window {
    MIDI?: MidiJs;
  }
}

const CANVAS_W = 900;
const CANVAS_H = 600;
const WHITE_W = 0.34;
const WHITE_D = 2.45;
const WHITE_H = 0.20;
const BLACK_W = 0.21;
const BLACK_D = 1.48;
const BLACK_H = 0.28;
const PRESS_DEPTH = 0.13;
const PRESS_MS = 140;
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const geoWhite = createBox3D({ width: WHITE_W, height: WHITE_H, depth: WHITE_D });
const geoBlack = createBox3D({ width: BLACK_W, height: BLACK_H, depth: BLACK_D });

function color(hex: string): ColorSRGB {
  return ColorSRGB.fromHex(hex);
}

function isBlack(midi: number): boolean {
  return BLACK_PITCH_CLASSES.has(midi % 12);
}

function noteName(midi: number): string {
  const name = NOTE_NAMES[midi % 12] ?? '?';
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

function rayIntersectsAABB(
  ro: [number, number, number],
  rd: [number, number, number],
  min: [number, number, number],
  max: [number, number, number],
): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const direction = requiredNumberAt(rd, i, 'piano ray direction');
    const origin = requiredNumberAt(ro, i, 'piano ray origin');
    const minValue = requiredNumberAt(min, i, 'piano bounds minimum');
    const maxValue = requiredNumberAt(max, i, 'piano bounds maximum');
    if (Math.abs(direction) < 1e-8) {
      if (origin < minValue || origin > maxValue) return null;
    } else {
      const t1 = (minValue - origin) / direction;
      const t2 = (maxValue - origin) / direction;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
    }
  }
  if (tmax < tmin || tmax < 0) return null;
  return tmin >= 0 ? tmin : tmax;
}

function screenToRay(
  px: number,
  py: number,
  invViewProj: Float32Array,
): { origin: [number, number, number]; dir: [number, number, number] } {
  const ndcX = (px / CANVAS_W) * 2 - 1;
  const ndcY = -(py / CANVAS_H) * 2 + 1;

  const unproject = (z: number): [number, number, number] => {
    const v = [ndcX, ndcY, z, 1];
    const r = [0, 0, 0, 0];
    for (let row = 0; row < 4; row++) {
      r[row] = requiredNumberAt(invViewProj, row, 'piano inverse view projection') * requiredNumberAt(v, 0, 'piano clip point') +
        requiredNumberAt(invViewProj, 4 + row, 'piano inverse view projection') * requiredNumberAt(v, 1, 'piano clip point') +
        requiredNumberAt(invViewProj, 8 + row, 'piano inverse view projection') * requiredNumberAt(v, 2, 'piano clip point') +
        requiredNumberAt(invViewProj, 12 + row, 'piano inverse view projection') * requiredNumberAt(v, 3, 'piano clip point');
    }
    const w = requiredNumberAt(r, 3, 'piano unprojected point');
    return [
      requiredNumberAt(r, 0, 'piano unprojected point') / w,
      requiredNumberAt(r, 1, 'piano unprojected point') / w,
      requiredNumberAt(r, 2, 'piano unprojected point') / w,
    ];
  };

  const near = unproject(0);
  const far = unproject(1);
  const dx = far[0] - near[0];
  const dy = far[1] - near[1];
  const dz = far[2] - near[2];
  const len = Math.hypot(dx, dy, dz);
  return { origin: near, dir: [dx / len, dy / len, dz / len] };
}

class PianoDemo {
  private readonly saves = new SingleSlotGameSave<PianoSaveData>({
    gameId: 'piano',
    name: 'Piano 自动存档',
    validateData: isPianoSaveData,
  });
  private engine!: HaiyueEngine;
  private world!: World;
  private camEntity!: Entity;
  private cam3D!: Camera3D;
  private keys: PianoKey[] = [];
  private viewProj = new Float32Array(16);
  private midiReady = false;

  private elStatus!: HTMLElement;
  private elNote!: HTMLElement;

  constructor(private config: Config) {
    this.config.startMidi = Math.max(0, Math.floor(config.startMidi || 21));
    this.config.keys = Math.max(1, Math.min(88, Math.floor(config.keys || 88)));
  }

  async init(canvas: HTMLCanvasElement) {
    this.engine = new HaiyueEngine({
      canvas,
      clearColor: { r: 0.06, g: 0.08, b: 0.10, a: 1 },
    });
    await this.engine.init();

    this.world = new World('Piano');
    this.elStatus = document.getElementById('status')!;
    this.elNote = document.getElementById('note')!;
    this._setupScene();
    this._buildKeyboard();
    this._setupInput(canvas);
    const saved = await this.saves.load();
    if (saved?.lastMidi !== null && saved?.lastMidi !== undefined) {
      this.elNote.textContent = `${noteName(saved.lastMidi)}  MIDI ${saved.lastMidi}`;
    }
    this._loadMidi();

    this.engine.on('update', ({ detail: { time, delta } }) => this._tick(time, delta));
    this.engine.run();
  }

  private _setupScene() {
    const whiteCount = this._whiteKeyCount();
    const keyboardW = (whiteCount - 1) * WHITE_W;
    const targetX = keyboardW / 2;

    const spherical = new SphericalTransform3D({
      radius: 13.4,
      theta: 0,
      phi: Math.PI / 3.6,
      target: [targetX, 0, 0.28],
    });
    this.cam3D = new Camera3D({
      type: 'perspective',
      fov: Math.PI / 4.6,
      near: 0.1,
      far: 100,
    });

    this.camEntity = new Entity('Camera3D');
    this.camEntity.addComponent(this.cam3D);
    this.camEntity.addComponent(spherical);
    this.world.addEntity(this.camEntity);
    const render3DSystem = new Render3DSystem(this.engine, this.camEntity, {
      priority: 0,
      loadOp: 'clear',
    });
    this.world.addSystem(render3DSystem);
    this.world.addSystem(new BlinnPhongRenderSystem(this.engine, this.camEntity, {
      priority: -1,
      render3DSystem,
    }));
    const renderIntegration = new RenderIntegration(this.engine, { label: 'Piano.render' });
    this.world.addRuntimeIntegration(renderIntegration);
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));

    const ambient = new Entity('AmbientLight');
    ambient.addComponent(new AmbientLight({ color: [1, 1, 1], intensity: 0.38 }));
    this.world.addEntity(ambient);

    const dir = new Entity('DirectionalLight');
    dir.addComponent(new DirectionalLight({
      color: [1, 0.96, 0.88],
      intensity: 1.15,
      direction: [-0.35, -1, -0.45],
    }));
    this.world.addEntity(dir);
  }

  private _whiteKeyCount(): number {
    let count = 0;
    for (let i = 0; i < this.config.keys; i++) {
      if (!isBlack(this.config.startMidi + i)) count++;
    }
    return count;
  }

  private _buildKeyboard() {
    let whiteIndex = 0;
    const pendingBlack: Array<{ midi: number; x: number }> = [];

    for (let i = 0; i < this.config.keys; i++) {
      const midi = this.config.startMidi + i;
      if (isBlack(midi)) {
        pendingBlack.push({ midi, x: (whiteIndex - 0.5) * WHITE_W });
      } else {
        this._createKey(midi, false, whiteIndex * WHITE_W, 0.24);
        whiteIndex++;
      }
    }

    for (const key of pendingBlack) {
      this._createKey(key.midi, true, key.x, -0.25);
    }
  }

  private _createKey(midi: number, black: boolean, x: number, z: number) {
    const material = new BasicMaterial({ color: color(black ? '#111827' : '#f8fafc') });
    const transform = new CartesianTransform3D({
      position: [x, 0, z],
    });
    const entity = new Entity(`key_${midi}`);
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(black ? geoBlack : geoWhite, material));
    this.world.addEntity(entity);

    this.keys.push({
      midi,
      name: noteName(midi),
      black,
      entity,
      material,
      transform,
      x,
      z,
      width: black ? BLACK_W : WHITE_W,
      depth: black ? BLACK_D : WHITE_D,
      height: black ? BLACK_H : WHITE_H,
      pressUntil: 0,
    });
  }

  private _setupInput(canvas: HTMLCanvasElement) {
    canvas.addEventListener('mousedown', (e) => {
      const key = this._pickKey(e.clientX, e.clientY, canvas);
      if (!key) return;
      this._pressKey(key);
    });
  }

  private _loadMidi() {
    const midi = window.MIDI;
    if (!midi?.loadPlugin) {
      this.elStatus.textContent = 'MIDI.js unavailable';
      return;
    }

    midi.loadPlugin({
      soundfontUrl: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/',
      instrument: 'acoustic_grand_piano',
      onsuccess: () => {
        midi.setVolume(0, 127);
        this.midiReady = true;
        this.elStatus.textContent = 'MIDI.js ready';
      },
      onerror: () => {
        this.elStatus.textContent = 'MIDI.js load failed';
      },
    });
  }

  private _pressKey(key: PianoKey) {
    const now = performance.now();
    key.pressUntil = now + PRESS_MS;
    this.elNote.textContent = `${key.name}  MIDI ${key.midi}`;
    this._setKeyPressed(key, true);
    this.saves.save({ lastMidi: key.midi });

    if (this.midiReady && window.MIDI) {
      window.MIDI.noteOn(0, key.midi, 118, 0);
      window.MIDI.noteOff(0, key.midi, 0.72);
    }
  }

  private _setKeyPressed(key: PianoKey, pressed: boolean) {
    const y = pressed ? -PRESS_DEPTH : 0;
    key.transform.setPosition(key.x, y, key.z);
    const base = key.black ? color('#111827') : color('#f8fafc');
    const active = key.black ? color('#334155') : color('#dbeafe');
    const c = pressed ? active : base;
    key.material.color.setFromSRGB(c.r, c.g, c.b, 1);
  }

  private _pickKey(clientX: number, clientY: number, canvas: HTMLCanvasElement): PianoKey | null {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (CANVAS_W / rect.width);
    const py = (clientY - rect.top) * (CANVAS_H / rect.height);
    const invVP = mat4.inverse(this.viewProj) as Float32Array;
    const { origin, dir } = screenToRay(px, py, invVP);

    let best: PianoKey | null = null;
    let bestT = Infinity;
    const ordered = this.keys.slice().sort((a, b) => Number(b.black) - Number(a.black));
    for (const key of ordered) {
      const t = rayIntersectsAABB(
        origin,
        dir,
        [key.x - key.width / 2, -PRESS_DEPTH - key.height / 2, key.z - key.depth / 2],
        [key.x + key.width / 2, key.height / 2, key.z + key.depth / 2],
      );
      if (t !== null && t < bestT) {
        bestT = t;
        best = key;
      }
    }
    return best;
  }

  private _tick(time: number, delta: number) {
    const camT = this.camEntity.getComponent(SphericalTransform3D)!;
    camT.updateWorldMatrix();
    const view = mat4.inverse(camT.worldMatrix) as Float32Array;
    this.cam3D.updateAspect(CANVAS_W / CANVAS_H);
    mat4.multiply(this.cam3D.projectionMatrix, view, this.viewProj);

    const now = performance.now();
    for (const key of this.keys) {
      if (key.pressUntil && now >= key.pressUntil) {
        key.pressUntil = 0;
        this._setKeyPressed(key, false);
      }
    }
    this.world.update(time, delta);
  }
}

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const cfg = await fetch('./config.json')
    .then(r => r.json())
    .catch(() => ({ startMidi: 21, keys: 88 })) as Partial<Config>;

  const demo = new PianoDemo({
    startMidi: cfg.startMidi ?? 21,
    keys: cfg.keys ?? 88,
  });
  await demo.init(canvas);
}

main();
