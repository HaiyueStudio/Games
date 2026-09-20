import { BasicMaterial, Camera3D, CartesianTransform3D, Entity, HaiyueEngine, Mesh3D, World, createPlane3D } from '@haiyue/engine';
import { RenderIntegration, requireEngineDevice } from '@haiyue/engine/experimental';
import { Render3DSystem } from '@haiyue/engine/systems';
import { SEGMENTS, type Puzzle } from './rules';

import { COLORS, drawDigit } from './led-display';

export interface ViewState { puzzle: Puzzle; board: number[]; notes: number[]; selected: number; hint: number; solution: number[]; glow: boolean; }
export class BoardView {
  private engine!: HaiyueEngine;
  private world!: World;
  private texture!: GPUTexture;
  private material = new BasicMaterial();
  private surface = document.createElement('canvas');
  private pending = 2;
  private observer: ResizeObserver | null = null;
  private stopped = false;
  private lastState: ViewState | null = null;
  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.engine = new HaiyueEngine({ canvas, clearColor: { r: .02, g: .045, b: .065, a: 1 }, msaaSamples: 4, devicePixelRatio: () => Math.min(devicePixelRatio, 2) });
    await this.engine.init();
    if (this.stopped) { this.engine.destroy(); return; }
    this.world = new World('LED Sudoku');
    const camera = new Entity('LED camera');
    camera.addComponent(new Camera3D({ type: 'orthographic', left: -1, right: 1, top: 1, bottom: -1, near: .1, far: 20 }));
    const transform = new CartesianTransform3D({ position: [0, 4, 0] }); transform.setRotation(-Math.PI / 2, 0, 0); camera.addComponent(transform); this.world.addEntity(camera);
    const integration = new RenderIntegration(this.engine, { label: 'LED Sudoku board' }); this.world.addRuntimeIntegration(integration);
    this.world.addSystem(new Render3DSystem(this.engine, camera, { loadOp: 'clear' }));
    const board = new Entity('LED board surface'); board.addComponent(new CartesianTransform3D()); board.addComponent(new Mesh3D(createPlane3D({ width: 2, height: 2, normal: 'y' }), this.material)); this.world.addEntity(board);
    integration.registerAll(this.world, () => ({ pass: 'shared' }));
    this.surface.width = this.surface.height = 1260;
    this.createTexture();
    this.engine.on('device-restored', () => { this.createTexture(); if (this.lastState) this.draw(this.lastState); });
    this.engine.on('update', ({ detail: { time, delta } }) => { if (this.pending > 0) { this.world.update(time, delta); this.pending--; } });
    this.observer = new ResizeObserver(() => { this.engine.resizeToDisplaySize(); this.pending = 3; }); this.observer.observe(canvas);
    this.engine.resizeToDisplaySize(); this.engine.run();
  }
  private createTexture(): void {
    this.texture?.destroy();
    this.texture = requireEngineDevice(this.engine).createTexture({ label: 'LED Sudoku raster', size: [1260, 1260], format: 'rgba8unorm-srgb', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    this.material.texture = this.texture;
  }
  draw(state: ViewState): void {
    if (this.stopped) return;
    this.lastState = state;
    const { puzzle: p, board, notes, selected, hint, solution, glow } = state;
    const c = this.surface.getContext('2d')!;
    c.setTransform(2, 0, 0, 2, 0, 0); c.fillStyle = '#061218'; c.fillRect(0, 0, 630, 630);
    for (let i = 0; i < 81; i++) {
      const x = i % 9 * 70, y = Math.floor(i / 9) * 70;
      const peer = selected >= 0 && (Math.floor(i / 9) === Math.floor(selected / 9) || i % 9 === selected % 9 || (Math.floor(i / 27) === Math.floor(selected / 27) && Math.floor(i % 9 / 3) === Math.floor(selected % 9 / 3)));
      const same = selected >= 0 && board[selected] && board[i] === board[selected];
      c.fillStyle = p.blocked[i] ? '#020609' : i === selected ? '#16474d' : i === hint ? '#4b3b20' : same ? '#16413e' : peer ? '#0c252c' : '#091a22';
      c.fillRect(x + 2, y + 2, 66, 66);
      if (!p.blocked[i] && p.options.parity && p.parity?.[i]) {
        c.fillStyle = p.parity[i] === 1 ? '#bc466550' : '#377fce60'; c.fillRect(x + 3, y + 3, 64, 64);
        c.fillStyle = p.parity[i] === 1 ? '#ff9fb3' : '#91caff'; c.font = 'bold 9px sans-serif'; c.fillText(p.parity[i] === 1 ? '奇' : '偶', x + 52, y + 63);
      }
      if (!p.blocked[i] && p.options.diagonal && (i % 10 === 0 || (i > 0 && i < 80 && i % 8 === 0))) { c.fillStyle = '#7261bd33'; c.fillRect(x + 3, y + 3, 64, 64); }
      if (p.blocked[i]) {
        c.strokeStyle = '#23333e'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 23, y + 23); c.lineTo(x + 47, y + 47); c.moveTo(x + 47, y + 23); c.lineTo(x + 23, y + 47); c.stroke();
      }
    }
    // Draw variant geometry behind the digits; every cage has its own boundary.
    c.lineJoin = 'round'; c.lineCap = 'round';
    if (p.options.multiDiagonal) (p.slants ?? []).forEach((line, n) => {
      const first = line[0]!, last = line[line.length - 1]!, dx = line[1]! % 9 - first % 9;
      const x1 = first % 9 * 70 + 35 - dx * 35, y1 = Math.floor(first / 9) * 70;
      const x2 = last % 9 * 70 + 35 + dx * 35, y2 = Math.floor(last / 9) * 70 + 70;
      c.strokeStyle = '#ffcb70a0'; c.lineWidth = 3; c.setLineDash([7, 5]); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.setLineDash([]);
      c.save(); c.font = 'bold 10px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (const [x, y] of [[x1, y1], [x2, y2]]) {
        const xx = Math.max(9, Math.min(621, x!)), yy = Math.max(9, Math.min(621, y!));
        c.fillStyle = '#ffcb70'; c.beginPath(); c.arc(xx, yy, 7, 0, Math.PI * 2); c.fill(); c.fillStyle = '#122027'; c.fillText(String(n + 1), xx, yy);
      }
      c.restore();
    });
    for (const line of p.lines) {
      c.strokeStyle = '#af88ff70'; c.lineWidth = 11; c.beginPath();
      line.forEach((i, n) => n ? c.lineTo(i % 9 * 70 + 35, Math.floor(i / 9) * 70 + 35) : c.moveTo(i % 9 * 70 + 35, Math.floor(i / 9) * 70 + 35)); c.stroke();
    }
    p.cages.forEach((cage, n) => {
      c.strokeStyle = n % 2 ? '#e9a85b99' : '#6caebb99'; c.lineWidth = 1; c.setLineDash([3, 3]);
      for (const i of cage.cells) {
        const x = i % 9 * 70, y = Math.floor(i / 9) * 70;
        c.beginPath();
        if (!cage.cells.includes(i - 9)) { c.moveTo(x + 5, y + 5); c.lineTo(x + 65, y + 5); }
        if (!cage.cells.includes(i + 9)) { c.moveTo(x + 5, y + 65); c.lineTo(x + 65, y + 65); }
        if (i % 9 === 0 || !cage.cells.includes(i - 1)) { c.moveTo(x + 5, y + 5); c.lineTo(x + 5, y + 65); }
        if (i % 9 === 8 || !cage.cells.includes(i + 1)) { c.moveTo(x + 65, y + 5); c.lineTo(x + 65, y + 65); }
        c.stroke();
      }
      c.setLineDash([]);
      const first = Math.min(...cage.cells); c.font = 'bold 11px monospace'; c.fillStyle = '#ffc16a'; c.fillText(String(cage.sum), first % 9 * 70 + 8, Math.floor(first / 9) * 70 + 15);
    });
    for (let i = 0; i < 81; i++) {
      if (p.blocked[i]) continue;
      const x = i % 9 * 70, y = Math.floor(i / 9) * 70, v = board[i]!;
      const color = v ? v !== solution[i] ? COLORS.wrong : p.givens[i] ? COLORS.given : COLORS.user : COLORS.clue;
      const hasNotes = !v && !!notes[i];
      if (p.options.led !== false) {
        // A playable empty cell still has seven dark tubes. Only black cells omit them.
        drawDigit(c, v ? SEGMENTS[v]! : p.lights[i]!, x + (hasNotes ? 22 : 19), y + 14, hasNotes ? 34 : 42, color, glow);
      } else if (v) {
        c.save(); c.fillStyle = color; c.font = `${p.givens[i] ? 600 : 500} 38px Arial, sans-serif`;
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(v), x + 35, y + 38); c.restore();
      }
      if (!v && notes[i]) {
        c.font = '10px monospace'; c.fillStyle = '#f1e7c7';
        for (let d = 1; d <= 9; d++) if (notes[i]! & 1 << (d - 1)) c.fillText(String(d), x + 5 + (d - 1) * 7, y + 63);
      }
      if (p.options.led !== false && !v && p.lights[i]) { c.fillStyle = COLORS.clue; c.fillRect(x + 57, y + 10, 3, 3); }
      if (i === selected) { c.strokeStyle = '#73ffcf'; c.lineWidth = 2; c.strokeRect(x + 2, y + 2, 66, 66); }
    }
    c.lineCap = 'butt';
    for (let n = 0; n <= 9; n++) { c.strokeStyle = n % 3 ? '#1c3943' : '#4c7f88'; c.lineWidth = n % 3 ? 1 : 2; c.beginPath(); c.moveTo(n * 70, 0); c.lineTo(n * 70, 630); c.moveTo(0, n * 70); c.lineTo(630, n * 70); c.stroke(); }
    for (const [a, b] of p.dots) { c.fillStyle = '#e8fdff'; c.strokeStyle = '#091a22'; c.lineWidth = 2; c.beginPath(); c.arc((a % 9 + b % 9 + 1) * 35, (Math.floor(a / 9) + Math.floor(b / 9) + 1) * 35, 4, 0, Math.PI * 2); c.fill(); c.stroke(); }
    if (p.options.inequality) for (const [a, b] of p.inequalities ?? []) {
      const dx = b % 9 - a % 9, dy = Math.floor(b / 9) - Math.floor(a / 9);
      const x = (a % 9 + b % 9 + 1) * 35, y = (Math.floor(a / 9) + Math.floor(b / 9) + 1) * 35;
      // When a consecutive dot shares this edge, offset the inequality along it.
      const shared = p.dots.some(pair => pair.includes(a) && pair.includes(b));
      const xx = x - (shared ? dy * 13 : 0), yy = y + (shared ? dx * 13 : 0);
      c.fillStyle = '#08171e'; c.beginPath(); c.arc(xx, yy, 8, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#ffdea1'; c.lineWidth = 2; c.beginPath();
      c.moveTo(xx + dx * 4 - dy * 4, yy + dy * 4 + dx * 4); c.lineTo(xx - dx * 4, yy - dy * 4); c.lineTo(xx + dx * 4 + dy * 4, yy + dy * 4 - dx * 4); c.stroke();
    }
    if (p.options.exclusion) for (const e of p.exclusions ?? []) {
      const x = (e.at % 9 + 1) * 70, y = (Math.floor(e.at / 9) + 1) * 70;
      c.fillStyle = '#08171e'; c.strokeStyle = e.mask ? '#ffbf73' : '#c7ecff'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, 16, 0, Math.PI * 2); c.fill(); c.stroke();
      if (e.mask) drawDigit(c, e.mask, x - 8, y - 11, 20, COLORS.clue, glow);
      else { c.save(); c.fillStyle = '#e2f6ff'; c.font = 'bold 18px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(e.digit), x, y + 1); c.restore(); }
    }
    requireEngineDevice(this.engine).queue.copyExternalImageToTexture({ source: this.surface }, { texture: this.texture }, [1260, 1260]);
    this.pending = 3;
  }
  stop(): void { this.stopped = true; this.observer?.disconnect(); this.world?.destroy(); this.texture?.destroy(); this.engine?.destroy(); }
}
