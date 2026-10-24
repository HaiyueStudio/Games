import { World } from '@haiyue/engine';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { IndexedDbSaveBackend } from '@haiyue/engine/save';
import { GameEngine } from '../../session/GameEngine';
import { gameSession } from '../../session/SessionPause';
import { guardQueuedPointerCapture } from '../../shared/input/pointerCapture';
import { SingleSlotGameSave, type AutoSaveStatus } from '../../save/SingleSlotGameSave';
import { isJigsawPreferences, type JigsawPreferences } from '../save/preferences';
import { captureJigsawSave, isJigsawSaveData, restoreJigsawPuzzle, type JigsawSaveData, type JigsawSavedImage } from '../save/saveState';
import { createPuzzle, groupCenter, pieceCenter, puzzleBounds, rotateGroup, snapGroup, type Group, type Point } from '../rules/model';
import { JigsawScene, project, unproject, type DeskView } from '../rendering/JigsawScene';
import { createPieceTextures, loadImage } from '../rendering/images';
import { JigsawHud, type Action } from '../ui/JigsawHud';

export class JigsawGame {
  private readonly engine: GameEngine;
  private hudWorld = new World('Jigsaw GUI');
  private readonly lifetime = new AbortController();
  private readonly preferences = new SingleSlotGameSave<JigsawPreferences>({ gameId: 'jigsaw-puzzle', name: '拾光拼图设置', validateData: isJigsawPreferences });
  private readonly saveBackend = new IndexedDbSaveBackend();
  private saveStatus: AutoSaveStatus = 'idle';
  private readonly saves = new SingleSlotGameSave<JigsawSaveData>({ gameId: 'jigsaw-puzzle', name: '拾光拼图进度', backend: this.saveBackend,
    validateData: isJigsawSaveData, onStatus: status => {
      this.saveStatus = status;
      if (!this.disposed) this.hud?.setSaveStatus(status);
    } });
  private readonly observer: ResizeObserver;
  private readonly restorePointerCapture: () => void;
  private hud!: JigsawHud;
  private scene: JigsawScene | null = null;
  private image!: HTMLCanvasElement;
  private savedImage: JigsawSavedImage | null = null;
  private seed = 0;
  private selected: Group | null = null;
  private view: DeskView = { x: 0, y: 0, width: 1, height: 1, center: { x: 0, y: 0 }, scale: 1 };
  private fitScale = 1;
  private busy = false;
  private disposed = false;
  private generation = 0;
  private drag: { id: number; group: Group | null; offset: Point; last: Point; before: Point & { angle?: number } } | null = null;
  constructor(private readonly canvas: HTMLCanvasElement, private readonly upload: HTMLInputElement) {
    this.restorePointerCapture = guardQueuedPointerCapture(canvas);
    this.engine = new GameEngine({ canvas, msaaSamples: 4, clearColor: { r: .89, g: .89, b: .84, a: 1 }, devicePixelRatio: () => Math.min(devicePixelRatio || 1, 2) });
    this.observer = new ResizeObserver(() => this.resize());
  }
  async init(): Promise<void> {
    await this.engine.init(); if (this.disposed) return;
    this.createHud();
    this.busy = true; this.hud.setBusy(true);
    this.bindInput(); this.observer.observe(this.canvas); this.resize();
    this.engine.on('update', e => {
      this.scene?.sync(this.view, this.selected); this.scene?.draw(e.detail.time, e.detail.delta);
      this.hudWorld.update(e.detail.time, e.detail.delta);
    });
    this.engine.run();
    const [preferences, saved] = await Promise.all([this.preferences.load(), this.saves.load()]);
    if (this.disposed) return;
    if (preferences) { this.hud.rows.setValue(preferences.rows); this.hud.cols.setValue(preferences.cols); this.hud.rotation.setChecked(preferences.allowRotation); }
    this.busy = false;
    if (saved) {
      try { await this.restart(saved.image.dataUrl, saved); }
      catch (error) {
        console.warn('[jigsaw-puzzle save] 存档图片无法恢复，重新开始。', error);
        await this.saves.clear().catch(() => {});
        await this.restart('./assets/alpine-lake.svg');
      }
    } else await this.restart('./assets/alpine-lake.svg');
    if (new URLSearchParams(location.search).has('verify') || new URLSearchParams(location.search).has('gamepadVerify')) {
      Object.defineProperty(window, '__jigsaw', { configurable: true, get: () => this.snapshot() });
    }
  }
  private createHud(): void {
    this.hud = new JigsawHud(this.engine, this.hudWorld, action => this.action(action));
    this.hud.setSaveStatus(this.saveStatus);
    const integration = new RenderIntegration(this.engine, { label: 'Jigsaw.GUI' });
    this.hudWorld.addRuntimeIntegration(integration); integration.registerAll(this.hudWorld, () => ({ pass: 'shared' }));
  }
  private async restart(source?: string | File, saved?: JigsawSaveData): Promise<void> {
    if (this.busy || this.disposed) return;
    const generation = ++this.generation; this.cancelDrag(); this.busy = true; this.hud.setBusy(true); this.hud.status.setText('正在准备拼图，请稍候');
    try {
      const image = source ? await loadImage(source) : this.image;
      if (this.disposed || generation !== this.generation) return;
      if (saved && (image.width !== saved.image.width || image.height !== saved.image.height)) throw new Error('存档图片尺寸不匹配');
      const seed = saved?.seed ?? (Number(new URLSearchParams(location.search).get('seed') ?? Date.now()) >>> 0);
      const puzzle = saved ? restoreJigsawPuzzle(saved) : createPuzzle(this.hud.rows.value ?? 4, this.hud.cols.value ?? 5, image.width / image.height, this.hud.rotation.checked, seed);
      // Encode the decoded local image once per upload, never for individual moves.
      const savedImage = saved?.image ?? (!source && this.savedImage ? this.savedImage : { dataUrl: image.toDataURL('image/png'), width: image.width, height: image.height });
      const textures = await createPieceTextures(puzzle, image, () => !this.disposed && generation === this.generation);
      if (this.disposed || generation !== this.generation) return;
      const scene = new JigsawScene(this.engine, puzzle, textures, image);
      this.scene?.destroy(); this.scene = scene; this.image = image; this.selected = null;
      this.seed = seed; this.savedImage = savedImage;
      // GUI renderers retain uploaded preview textures until their World is destroyed.
      // Recreate the GUI owner too, keeping repeated image uploads bounded.
      this.hudWorld.destroy(); this.hudWorld = new World('Jigsaw GUI'); this.createHud();
      this.hud.rows.setValue(puzzle.rows); this.hud.cols.setValue(puzzle.cols); this.hud.rotation.setChecked(puzzle.allowRotation);
      this.hud.setBusy(true);
      this.hud.setImage(image); this.hud.preview.setVisible(false); this.resize(); this.refresh();
      this.preferences.save({ rows: puzzle.rows, cols: puzzle.cols, allowRotation: puzzle.allowRotation });
      this.saveProgress();
      document.body.dataset.renderStatus = 'ready';
    } catch (error) {
      if (!this.scene) throw error;
      this.hud.status.setText(error instanceof Error && error.message.includes('25 MB') ? error.message : '图片无法读取，请选择有效图片');
    } finally {
      this.busy = false;
      if (!this.disposed) { this.hud.setBusy(false); this.hud.setRotationEnabled(this.scene?.puzzle.allowRotation ?? false); }
    }
  }
  private resize(): void {
    if (!this.hud || this.disposed) return;
    this.cancelDrag();
    this.engine.resizeToDisplaySize(); this.hud.resize(this.engine.displayWidth, this.engine.displayHeight);
    Object.assign(this.view, this.hud.desk); this.fit();
  }
  private fit(): void {
    if (!this.scene) return;
    const b = puzzleBounds(this.scene.puzzle);
    this.view.center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    this.fitScale = Math.min(this.view.width / (b.maxX - b.minX + 50), this.view.height / (b.maxY - b.minY + 50));
    this.view.scale = this.fitScale;
  }
  private zoom(factor: number, point = { x: this.view.x + this.view.width / 2, y: this.view.y + this.view.height / 2 }): void {
    const before = unproject(point, this.view);
    this.view.scale = Math.max(this.fitScale * .5, Math.min(this.fitScale * 8, this.view.scale * factor));
    const after = unproject(point, this.view); this.view.center.x += before.x - after.x; this.view.center.y += before.y - after.y;
  }
  private action(action: Action): void {
    if (this.busy || gameSession.paused) return;
    if (action === 'upload') { this.upload.click(); return; }
    if (action === 'restart') { void this.restart(); return; }
    if (action === 'preview') { this.cancelDrag(); this.hud.togglePreview(); return; }
    if (action === 'fit') { this.cancelDrag(); this.fit(); return; }
    if (action === 'minus' || action === 'plus') { this.zoom(action === 'plus' ? 1.25 : .8); return; }
    if (!this.scene) return;
    const puzzle = this.scene.puzzle;
    if (action === 'scatter') {
      // Spread intact groups around their current centers; never undo an assembled group.
      const centers = puzzle.groups.map(group => groupCenter(puzzle, group));
      const mean = { x: centers.reduce((sum, p) => sum + p.x, 0) / centers.length, y: centers.reduce((sum, p) => sum + p.y, 0) / centers.length };
      puzzle.groups.forEach((group, i) => { group.x += (centers[i]!.x - mean.x) * .35; group.y += (centers[i]!.y - mean.y) * .35; });
      this.fit(); this.saveProgress(); return;
    }
    if (this.selected && rotateGroup(puzzle, this.selected, action === 'left' ? -1 : 1)) {
      if (this.drag?.group) {
        const p = unproject(this.drag.last, this.view); this.drag.offset = { x: p.x - this.selected.x, y: p.y - this.selected.y };
      } else this.snap();
      this.refresh();
      this.saveProgress();
    }
  }
  private snap(): void {
    if (this.selected && this.scene) snapGroup(this.scene.puzzle, this.selected, Math.min(Math.min(this.scene.puzzle.cellWidth, this.scene.puzzle.cellHeight) * .28, Math.max(10, 14 / this.view.scale)));
  }
  private saveProgress(): void {
    if (this.disposed || this.drag || !this.scene || !this.savedImage) return;
    this.saves.save(captureJigsawSave(this.scene.puzzle, this.seed, this.savedImage));
  }
  private refresh(): void {
    if (!this.scene) return;
    const p = this.scene.puzzle;
    this.hud.stats.setText(`${p.pieces.length} 片 · ${p.groups.length} 组`);
    this.hud.status.setText(p.groups.length === 1 ? '拼图完成！可继续整体拖动' : `已连接 ${p.pieces.length - p.groups.length}/${p.pieces.length - 1} · 选中 ${this.selected?.pieces.length ?? 0} 片${p.allowRotation ? ' · Q/R 旋转' : ' · 固定方向'}`);
  }
  private point(e: MouseEvent): Point {
    const r = this.canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * this.engine.displayWidth / r.width, y: (e.clientY - r.top) * this.engine.displayHeight / r.height };
  }
  private bindInput(): void {
    const options = { signal: this.lifetime.signal };
    this.upload.addEventListener('change', () => { const file = this.upload.files?.[0]; this.upload.value = ''; if (file) void this.restart(file); }, options);
    this.canvas.addEventListener('pointerdown', e => {
      if (this.busy || gameSession.paused || this.drag || e.button !== 0 || !this.scene) return;
      const point = this.point(e);
      if (this.hud.blocks(point.x, point.y)) return;
      const local = unproject(point, this.view), group = this.scene.pick(local);
      this.selected = group;
      if (group) group.order = Math.max(...this.scene.puzzle.groups.map(g => g.order)) + 1;
      this.drag = { id: e.pointerId, group, last: point, offset: group ? { x: local.x - group.x, y: local.y - group.y } : point, before: group ? { x: group.x, y: group.y, angle: group.angle } : { ...this.view.center } };
      this.canvas.setPointerCapture(e.pointerId); this.refresh();
    }, options);
    this.canvas.addEventListener('pointermove', e => {
      const drag = this.drag; if (!drag || drag.id !== e.pointerId || gameSession.paused) return;
      const point = this.point(e), local = unproject(point, this.view);
      if (drag.group) { drag.group.x = local.x - drag.offset.x; drag.group.y = local.y - drag.offset.y; }
      else { this.view.center.x -= (point.x - drag.last.x) / this.view.scale; this.view.center.y -= (point.y - drag.last.y) / this.view.scale; }
      drag.last = point;
    }, options);
    this.canvas.addEventListener('pointerup', e => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      if (this.drag.group) { this.snap(); this.scene!.puzzle.moves++; }
      this.drag = null; if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId); this.refresh();
      this.saveProgress();
    }, options);
    this.canvas.addEventListener('pointercancel', () => this.cancelDrag(), options);
    window.addEventListener('blur', () => this.cancelDrag(), options);
    this.canvas.addEventListener('wheel', e => { const p = this.point(e); if (!this.busy && !this.drag && !gameSession.paused && !this.hud.blocks(p.x, p.y)) { e.preventDefault(); this.zoom(Math.exp(-e.deltaY * .0015), p); } }, { ...options, passive: false });
    window.addEventListener('keydown', e => {
      if (e.repeat || this.busy || gameSession.paused || this.hud.rows.open || this.hud.cols.open) return;
      const actions: Partial<Record<string, Action>> = { KeyR: 'right', KeyQ: 'left', KeyV: 'preview', KeyF: 'fit' };
      const action = actions[e.code];
      if (action) { e.preventDefault(); this.action(action); }
    }, options);
  }
  private cancelDrag(): void {
    const drag = this.drag; if (!drag) return;
    if (drag.group) Object.assign(drag.group, drag.before); else this.view.center = drag.before;
    this.drag = null; if (this.canvas.hasPointerCapture(drag.id)) this.canvas.releasePointerCapture(drag.id);
  }
  private snapshot() {
    const p = this.scene?.puzzle;
    return { ready: !!p, busy: this.busy, saveStatus: this.saveStatus, moves: p?.moves, rows: p?.rows, cols: p?.cols, allowRotation: p?.allowRotation, image: { width: this.image?.width, height: this.image?.height },
      view: structuredClone(this.view), selected: this.selected?.id ?? null, dragging: !!this.drag, complete: p?.groups.length === 1,
      groups: p?.groups.map(g => ({ ...g, pieces: [...g.pieces] })), pieces: p?.pieces.map(piece => { const g = p.groups.find(g => g.pieces.includes(piece.id))!; return { ...piece, screen: project(pieceCenter(piece, g), this.view) }; }) };
  }
  destroy(): void {
    if (this.disposed) return;
    this.cancelDrag(); this.saveProgress(); this.disposed = true; this.generation++;
    this.lifetime.abort(); this.observer.disconnect(); this.scene?.destroy(); this.hudWorld.destroy(); this.engine.destroy(); this.restorePointerCapture();
    void this.saves.flush().then(() => this.saveBackend.dispose()).catch(() => {});
  }
}
