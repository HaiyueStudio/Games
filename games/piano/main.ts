import { HaiyueEngine } from '@haiyue/engine';
import { World } from '@haiyue/engine';
import { Entity } from '@haiyue/engine';
import { Camera3D } from '@haiyue/engine';
import { CartesianTransform3D } from '@haiyue/engine';
import { SphericalTransform3D } from '@haiyue/engine';
import { Mesh3D } from '@haiyue/engine';
import { Render3DSystem } from '@haiyue/engine/systems';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { BasicMaterial } from '@haiyue/engine';
import { ColorSRGB } from '@haiyue/engine';
import { AmbientLight } from '@haiyue/engine/lighting';
import { DirectionalLight } from '@haiyue/engine';
import { createBox3D } from '@haiyue/engine';
import { mat4 } from 'wgpu-matrix';
import { requiredNumberAt } from '../arrayAccess';
import { CameraViewProjectionCache } from '../CameraViewProjectionCache';
import { SingleSlotGameSave, isNonNegativeInteger, isRecord } from '../save/SingleSlotGameSave';
import { PianoSynth } from './audio';
import { type ParsedMidi, parseMidi } from './midi';

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

interface ScoreCatalogEntry {
  composer: string;
  file: string;
  id: string;
  license: string;
  mutopiaId: string;
  sourcePage: string;
  title: string;
}

interface ScoreCatalog {
  entries: ScoreCatalogEntry[];
  license: string;
  source: string;
}

const WHITE_W = 0.34;
const WHITE_D = 2.45;
const WHITE_H = 0.20;
const BLACK_W = 0.21;
const BLACK_D = 1.48;
const BLACK_H = 0.28;
const PRESS_DEPTH = 0.13;
const PRESS_MS = 140;
const CAMERA_BASE_RADIUS = 13.4;
const CAMERA_REFERENCE_ASPECT = 3 / 2;
const CAMERA_MAX_RADIUS = 55;
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

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
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
  ndcX: number,
  ndcY: number,
  invViewProj: Float32Array,
): { origin: [number, number, number]; dir: [number, number, number] } {
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
  private readonly cameraProjection = new CameraViewProjectionCache(this.viewProj);
  private readonly audio = new PianoSynth();
  private audioReady = false;
  private readonly scoreCache = new Map<string, ParsedMidi>();
  private scores: ScoreCatalogEntry[] = [];
  private playbackFrame: number | null = null;
  private playbackToken = 0;

  private elStatus!: HTMLElement;
  private elNote!: HTMLElement;
  private elScoreList!: HTMLSelectElement;
  private elAutoPlay!: HTMLButtonElement;
  private elAutoStop!: HTMLButtonElement;
  private elPlaybackStatus!: HTMLElement;
  private elPlaybackProgress!: HTMLProgressElement;
  private elScoreSource!: HTMLAnchorElement;

  constructor(private config: Config) {
    this.config.startMidi = Math.max(0, Math.floor(config.startMidi || 21));
    this.config.keys = Math.max(1, Math.min(88, Math.floor(config.keys || 88)));
  }

  async init(canvas: HTMLCanvasElement) {
    this.engine = new HaiyueEngine({
      canvas,
      clearColor: { r: 0.06, g: 0.08, b: 0.10, a: 1 },
      msaaSamples: 4,
      devicePixelRatio: () => Math.min(window.devicePixelRatio || 1, 2),
    });
    await this.engine.init();

    this.world = new World('Piano');
    this.elStatus = document.getElementById('status')!;
    this.elNote = document.getElementById('note')!;
    this.elScoreList = document.getElementById('score-list') as HTMLSelectElement;
    this.elAutoPlay = document.getElementById('auto-play') as HTMLButtonElement;
    this.elAutoStop = document.getElementById('auto-stop') as HTMLButtonElement;
    this.elPlaybackStatus = document.getElementById('playback-status')!;
    this.elPlaybackProgress = document.getElementById('playback-progress') as HTMLProgressElement;
    this.elScoreSource = document.getElementById('score-source') as HTMLAnchorElement;
    this._setupScene();
    this._buildKeyboard();
    this._setupInput(canvas);
    this._setupScoreLibrary();
    const saved = await this.saves.load();
    if (saved?.lastMidi !== null && saved?.lastMidi !== undefined) {
      this.elNote.textContent = `${noteName(saved.lastMidi)}  MIDI ${saved.lastMidi}`;
    }
    this.elStatus.textContent = this.audio.isSupported
      ? 'Click a key to enable audio'
      : 'Web Audio unavailable';

    this.engine.on('update', ({ detail: { time, delta } }) => this._tick(time, delta));
    this.engine.run();
  }

  private _setupScene() {
    const whiteCount = this._whiteKeyCount();
    const keyboardW = (whiteCount - 1) * WHITE_W;
    const targetX = keyboardW / 2;

    const spherical = new SphericalTransform3D({
      radius: CAMERA_BASE_RADIUS,
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
    let activePointerId: number | null = null;
    let lastPointerMidi: number | null = null;
    const triggerAtPointer = (event: PointerEvent) => {
      const key = this._pickKey(event.clientX, event.clientY, canvas);
      if (!key) {
        lastPointerMidi = null;
        return;
      }
      if (key.midi === lastPointerMidi) return;
      lastPointerMidi = key.midi;
      this._pressKey(key);
    };

    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || activePointerId !== null) return;
      event.preventDefault();
      activePointerId = event.pointerId;
      lastPointerMidi = null;
      canvas.setPointerCapture(event.pointerId);
      triggerAtPointer(event);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (event.pointerId !== activePointerId) return;
      event.preventDefault();
      triggerAtPointer(event);
    });
    const endPointer = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) return;
      activePointerId = null;
      lastPointerMidi = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('lostpointercapture', () => {
      activePointerId = null;
      lastPointerMidi = null;
    });
  }

  private _pressKey(key: PianoKey, velocity = 118, persist = true) {
    const now = performance.now();
    key.pressUntil = now + PRESS_MS;
    this.elNote.textContent = `${key.name}  MIDI ${key.midi}`;
    this._setKeyPressed(key, true);
    if (persist) this.saves.save({ lastMidi: key.midi });

    void this.audio.play(key.midi, velocity).then(() => {
      if (this.audioReady) return;
      this.audioReady = true;
      this.elStatus.textContent = 'Web Audio ready';
    }).catch((error: unknown) => {
      this.elStatus.textContent = 'Audio could not start';
      console.error('[piano] Unable to play note.', error);
    });
  }

  private _setupScoreLibrary() {
    this.elScoreList.addEventListener('change', () => {
      this._stopPlayback('Ready');
      this._updateSelectedScore();
    });
    this.elAutoPlay.addEventListener('click', () => {
      void this._playSelectedScore();
    });
    this.elAutoStop.addEventListener('click', () => this._stopPlayback('Stopped'));

    void fetch('./scores/catalog.json')
      .then(async response => {
        if (!response.ok) throw new Error(`Score catalog request failed with ${response.status}.`);
        return response.json() as Promise<ScoreCatalog>;
      })
      .then(catalog => {
        if (catalog.license !== 'Public Domain' || !Array.isArray(catalog.entries) || catalog.entries.length === 0) {
          throw new Error('Score catalog is empty or has an unsupported license.');
        }
        this.scores = catalog.entries.map(entry => ({ ...entry, license: catalog.license }));
        this.elScoreList.replaceChildren(...this.scores.map(score => {
          const option = document.createElement('option');
          option.value = score.id;
          option.textContent = `${score.title} — ${score.composer}`;
          return option;
        }));
        this.elScoreList.selectedIndex = 0;
        this.elScoreList.disabled = false;
        this.elAutoPlay.disabled = false;
        this.elPlaybackStatus.textContent = 'Ready';
        this._updateSelectedScore();
      })
      .catch((error: unknown) => {
        this.elPlaybackStatus.textContent = 'Score list unavailable';
        console.error('[piano] Unable to load score catalog.', error);
      });
  }

  private _selectedScore(): ScoreCatalogEntry | null {
    return this.scores.find(score => score.id === this.elScoreList.value) ?? null;
  }

  private _updateSelectedScore() {
    const score = this._selectedScore();
    this.elScoreSource.href = score?.sourcePage ?? 'https://www.mutopiaproject.org/';
    this.elScoreSource.textContent = score ? `${score.license} · ${score.mutopiaId}` : 'Mutopia Project';
  }

  private async _playSelectedScore() {
    const score = this._selectedScore();
    if (!score) return;
    this._stopPlayback('Loading MIDI…');
    const token = this.playbackToken;
    this.elAutoPlay.disabled = true;
    this.elAutoStop.disabled = false;

    try {
      await this.audio.activate();
      this.audioReady = true;
      this.elStatus.textContent = 'Web Audio ready';
      let parsed = this.scoreCache.get(score.id);
      if (!parsed) {
        const response = await fetch(score.file);
        if (!response.ok) throw new Error(`MIDI request failed with ${response.status}.`);
        parsed = parseMidi(await response.arrayBuffer());
        if (parsed.notes.length === 0) throw new Error('MIDI score contains no playable notes.');
        this.scoreCache.set(score.id, parsed);
      }
      if (token !== this.playbackToken) return;
      this._startPlayback(score, parsed, token);
    } catch (error) {
      if (token !== this.playbackToken) return;
      this._finishPlayback('Unable to play score');
      console.error('[piano] Unable to start automatic playback.', error);
    }
  }

  private _startPlayback(score: ScoreCatalogEntry, midi: ParsedMidi, token: number) {
    const startedAt = performance.now();
    let cursor = 0;
    this.elPlaybackStatus.textContent = `Playing ${score.title}`;
    this.elPlaybackProgress.value = 0;

    const advance = (now: number) => {
      if (token !== this.playbackToken) return;
      const elapsed = now - startedAt;
      while (cursor < midi.notes.length) {
        const note = midi.notes[cursor];
        if (!note || note.startMs > elapsed + 10) break;
        const key = this.keys.find(candidate => candidate.midi === note.midi);
        if (key) this._pressKey(key, note.velocity, false);
        cursor += 1;
      }
      this.elPlaybackProgress.value = midi.durationMs > 0 ? Math.min(1, elapsed / midi.durationMs) : 1;
      this.elPlaybackStatus.textContent = `${score.title} · ${formatDuration(elapsed)} / ${formatDuration(midi.durationMs)}`;
      if (cursor >= midi.notes.length && elapsed >= midi.durationMs) {
        this.elPlaybackProgress.value = 1;
        this._finishPlayback('Playback complete');
        return;
      }
      this.playbackFrame = requestAnimationFrame(advance);
    };
    this.playbackFrame = requestAnimationFrame(advance);
  }

  private _stopPlayback(status: string) {
    this.playbackToken += 1;
    this.audio.stopAll();
    this._finishPlayback(status);
  }

  private _finishPlayback(status: string) {
    if (this.playbackFrame !== null) cancelAnimationFrame(this.playbackFrame);
    this.playbackFrame = null;
    this.elAutoPlay.disabled = this.scores.length === 0;
    this.elAutoStop.disabled = true;
    this.elPlaybackStatus.textContent = status;
    if (status !== 'Playback complete') this.elPlaybackProgress.value = 0;
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
    if (rect.width <= 0 || rect.height <= 0) return null;
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const invVP = mat4.inverse(this.viewProj) as Float32Array;
    const { origin, dir } = screenToRay(ndcX, ndcY, invVP);

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
    const aspect = this.engine.displayWidth / Math.max(1, this.engine.displayHeight);
    const responsiveRadius = Math.min(
      CAMERA_MAX_RADIUS,
      CAMERA_BASE_RADIUS * Math.max(1, CAMERA_REFERENCE_ASPECT / aspect),
    );
    if (Math.abs(camT.radius - responsiveRadius) > 0.001) camT.radius = responsiveRadius;
    this.cameraProjection.update(
      camT,
      this.cam3D,
      this.engine.displayWidth,
      this.engine.displayHeight,
    );

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
