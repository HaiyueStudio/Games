import { GuiButton, GuiScrollView, type GuiPointerEvent } from '@haiyue/engine/gui';
import { DeviceGui } from './DeviceGui';
import { deviceIconGrid, iconRectangle, swipePage, type DeviceMode } from './layout';
import type { DesktopGame } from '../launcher/DesktopGui';
import type { LauncherPanel } from '../launcher/GameOS';

export interface SimulatorHomeOptions { mode: DeviceMode; games: DesktopGame[]; embedded?: boolean; launch(id: string): void; desktop(): void; device(mode: DeviceMode): void; external(): void }
export class SimulatorHome implements LauncherPanel {
  private readonly gui: DeviceGui;
  readonly root;
  private readonly screen: GuiScrollView;
  private page = 0;
  private offset = 0;
  private focused = 0;
  private drag: { id: number; x: number; y: number; page: number; moved: boolean } | null = null;
  private readonly options: SimulatorHomeOptions;
  constructor(options: SimulatorHomeOptions) {
    this.options = options;
    this.gui = new DeviceGui(!options.embedded); this.root = this.gui.root;
    if (!options.embedded) {
      this.gui.button('sim-desktop', '游戏库', options.desktop, '#245d93');
      this.gui.button('sim-pad', '平板', () => options.device('pad')); this.gui.button('sim-phone', '手机', () => options.device('phone')); this.gui.button('sim-external', '↗', options.external, '#245d93');
    }
    this.screen = this.gui.add(new GuiScrollView({ id: 'sim-screen', width: '100%', height: '100%', showScrollbar: false, inertia: false, style: { backgroundColor: options.embedded ? 'rgba(8,16,42,.22)' : '#111c42', borderColor: '#4f5bb0', padding: 0 },
      onPointerDown: event => { this.drag = { id: event.pointerId, x: event.localX, y: event.localY, page: this.page, moved: false }; },
      onPointerMove: event => this.pointerMove(event), onPointerUp: event => this.pointerUp(event), onPointerCancel: () => { this.drag = null; } }));
    this.gui.label('sim-welcome', '你的游戏 · 点击启动', options.embedded && options.mode === 'pad' ? 22 : 14, '#dfe8ff', this.screen);
    this.gui.label('sim-pages', '', 12, '#bac8f1');
    options.games.forEach((game, index) => {
      const tile = this.gui.add(new GuiButton({ id: 'sim-icon-' + game.id, text: '', width: '100%', height: '100%', pointerFilter: 'ignore', focus: { mode: 'none' }, style: { backgroundColor: ['#7854dc', '#167dcc', '#df526d', '#159e88'][index % 4]!, borderColor: 'transparent', radius: 12, padding: 0 } }), this.screen);
      const image = this.gui.image('sim-cover-' + game.id, tile); image.setUv([.2, 0, .6, 1]); this.gui.thumbnail(image, game.thumbnail);
      this.gui.label('sim-name-' + game.id, game.title.length > 8 ? game.title.slice(0, 7) + '…' : game.title, options.embedded && options.mode === 'pad' ? 18 : 11, '#f1f6ff', this.screen).setTextAlign('center');
    });
  }
  private pointerMove(event: GuiPointerEvent): void {
    if (!this.drag || this.drag.id !== event.pointerId) return;
    const distance = event.localX - this.drag.x; if (Math.abs(distance) > 8) this.drag.moved = true;
    if (this.drag.moved) this.offset = Math.max(-.08, Math.min(this.pageCount - .92, this.drag.page - distance / this.screen.rect.width));
  }
  private pointerUp(event: GuiPointerEvent): void {
    const drag = this.drag; if (!drag || drag.id !== event.pointerId) return; this.drag = null;
    if (drag.moved) { this.page = swipePage(drag.page, event.localX - drag.x, this.screen.rect.width, this.pageCount); return; }
    if (Math.hypot(event.localX - drag.x, event.localY - drag.y) > 12) return;
    for (let slot = 0; slot < 12; slot++) {
      const game = this.options.games[this.page * 12 + slot]; if (!game) break;
      const rectangle = iconRectangle(slot, this.gui.layout.screen, this.gui.layout.columns, this.gui.layout.rows);
      if (event.localX >= rectangle.x - 8 && event.localX < rectangle.x + rectangle.width + 8 && event.localY >= rectangle.y - 5 && event.localY < rectangle.y + rectangle.height + 28) { queueMicrotask(() => this.options.launch(game.id)); return; }
    }
  }
  private get pageCount(): number { return Math.max(1, Math.ceil(this.options.games.length / 12)); }
  resize(width: number, height: number): void {
    if (this.options.embedded) this.gui.layout = { body: { x: 0, y: 0, width, height }, screen: { x: 0, y: 0, width, height }, ...deviceIconGrid(this.options.mode, width, height), pages: 12 };
    else this.gui.resize(width, height, this.options.mode);
    this.gui.place(this.screen, this.gui.layout.screen); this.screen.setContentHeight(this.gui.layout.screen.height);
    const compact = width < 600, start = compact ? Math.max(100, width - 212) : width - 330, step = compact ? 45 : 82;
    if (!this.options.embedded) {
      this.gui.place('sim-desktop', { x: start, y: 18, width: compact ? 50 : 76, height: 32 });
      this.gui.place('sim-pad', { x: start + (compact ? 54 : step), y: 18, width: compact ? 40 : 72, height: 32 });
      this.gui.place('sim-phone', { x: start + (compact ? 98 : step * 2), y: 18, width: compact ? 40 : 72, height: 32 });
      this.gui.place('sim-external', { x: width - 52, y: 18, width: 32, height: 32 });
    }
    this.gui.place('sim-welcome', { x: 16, y: 14, width: this.gui.layout.screen.width - 32, height: 26 });
    this.gui.place('sim-pages', { x: this.gui.layout.body.x, y: this.options.embedded ? height - 29 : this.gui.layout.body.y + this.gui.layout.body.height + 12, width: this.gui.layout.body.width, height: 24 });
    this.layoutIcons();
  }
  private layoutIcons(): void {
    const { screen, columns, rows } = this.gui.layout;
    this.options.games.forEach((game, index) => {
      const rectangle = iconRectangle(index % 12, screen, columns, rows), page = Math.floor(index / 12), shift = (page - this.offset) * screen.width;
      this.gui.place('sim-icon-' + game.id, { ...rectangle, x: rectangle.x + shift });
      this.gui.place('sim-cover-' + game.id, { x: 3, y: 3, width: rectangle.width - 6, height: rectangle.height - 6 });
      const cell = screen.width / columns;
      this.gui.place('sim-name-' + game.id, { x: index % columns * cell + shift + 2, y: rectangle.y + rectangle.height + 4, width: cell - 4, height: 24 });
      this.gui.nodes.get('sim-icon-' + game.id)!.setStyle({ borderColor: index === this.focused ? '#e8ffad' : 'transparent' });
    });
    const label = this.gui.nodes.get('sim-pages'); if (label && 'setText' in label) (label as { setText(text: string): void }).setText(String(this.page + 1).padStart(2, '0') + ' / ' + String(this.pageCount).padStart(2, '0'));
  }
  update(delta: number): void {
    if (!this.drag) { this.offset += (this.page - this.offset) * (matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 1 - Math.exp(-Math.max(0, delta) / .12)); if (Math.abs(this.page - this.offset) < .001) this.offset = this.page; }
    this.layoutIcons();
  }
  move(horizontal: number, vertical: number): void { this.focused = Math.max(0, Math.min(this.options.games.length - 1, this.focused + horizontal + vertical * this.gui.layout.columns)); this.page = Math.floor(this.focused / 12); }
  launch(): void { const game = this.options.games[this.focused]; if (game) this.options.launch(game.id); }
  snapshot() { return { simulatorHome: { mode: this.options.mode, page: this.page, offset: this.offset, pages: this.pageCount, focused: this.options.games[this.focused]?.id, screen: this.gui.layout.screen }, nodes: this.gui.snapshot() }; }
  destroy(): void { this.gui.destroy(); }
}
