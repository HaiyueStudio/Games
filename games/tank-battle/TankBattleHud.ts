import { Entity, HaiyueEngine, World } from '@haiyue/engine';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { GuiRoot, GuiElement, GuiLabel, GuiButton, GuiImage, GuiSystem, type GuiRect } from '@haiyue/engine/gui';
import { SPRITE_INDEX, ATLAS_COLUMNS, SPRITES } from './sprites';
import { POWERUP_NAMES, STAGE_NAMES, type GameState } from './rules';

export interface HudState { state: GameState; best: number; hasRun: boolean; menuOpen: boolean; muted: boolean; saveStatus: string }
export type HudAction = 'solo' | 'duo' | 'resume' | 'pause' | 'menu' | 'sound';
const GOLD = '#e4c477', MUTED = '#a0ad90', TEXT = '#e9e5d4';
const FONT_COPY = '手柄摇杆指针切换铁甲前线作战指挥当前战区等待指令进行中暂停结束任务完成基地完好失守加固敌军冻结待清除消灭全部进入下一先先锋僚机未加入已阵亡生命最高总分移动开火声音关继续单人出击双协守住最后的防线选择模式开始新任务五个战区全部肃清所有坦克耗尽摧毁准备前往发现补给获得区域即将第秒火力升级无敌护盾全屏爆破时间铁锹额外射速双弹破甲免疫伤害增加一辆砖墙可坏满级穿雪地滑行海水阻挡丛林隐蔽战场补给击毁闪光敌军后掉落驾驶坦克拾取进度自动保存正在已失败当前对局仍可素材图鉴重新出发返回大厅' + STAGE_NAMES.join('') + Object.values(POWERUP_NAMES).join('');
export const HUD_FONT_CHARS = [...new Set(Array.from({ length: 95 }, (_, i) => String.fromCharCode(i + 32)).join('') + FONT_COPY + '菜单 / 保护基地！或上了种被' + '·×←↑→↓▶Ⅱ▰↗—…：，。/！')].join('');
export const TOUCH_KEYS: Record<string, string> = { up: 'KeyW', left: 'KeyA', down: 'KeyS', right: 'KeyD', fire: 'KeyJ' };

/** All visible interface and button hit testing belong to the public Engine GUI. */
export class TankBattleHud {
  readonly engine: HaiyueEngine;
  private readonly world = new World('Tank Battle GUI');
  private readonly root = new GuiRoot({ theme: { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 13, radius: 0,
    colors: { text: TEXT, textMuted: MUTED, primary: GOLD, danger: '#b85e44', background: '#182218', surface: '#263222', border: '#536345', hover: '#475737', active: '#677746', disabled: '#4b5544' } } });
  private system!: GuiSystem;
  private readonly labels = new Map<string, GuiLabel>();
  private readonly buttons = new Map<string, GuiButton>();
  private readonly images = new Map<string, GuiImage>();
  private readonly atlas = new Image();
  private modal!: GuiElement;
  private cleared!: GuiLabel;
  private width = 0;
  private height = 0;
  private board: GuiRect = { x: 0, y: 0, width: 416, height: 416 };
  private mobile = false;
  private sideX = 0;
  private sideY = 0;
  private sideW = 250;
  private touchY = 0;
  private supplyY = 0;
  private view: HudState | null = null;
  private readonly resizeObserver: ResizeObserver;
  private disposed = false;
  constructor(private readonly canvas: HTMLCanvasElement, private readonly battlefield: HTMLCanvasElement,
    private readonly host: HTMLElement, private readonly action: (action: HudAction) => void) {
    this.engine = new HaiyueEngine({ canvas, clearColor: { r: 0, g: 0, b: 0, a: 0 }, alphaMode: 'premultiplied', msaaSamples: 4,
      devicePixelRatio: () => Math.min(window.devicePixelRatio || 1, 2) });
    this.resizeObserver = new ResizeObserver(() => this.resize());
  }
  async init(): Promise<void> {
    this.atlas.src = './assets/atlas.png'; await this.atlas.decode(); await this.engine.init();
    const entity = new Entity('TankBattleHud'); entity.addComponent(this.root); this.world.addEntity(entity);
    this.build();
    this.system = new GuiSystem(this.engine, { loadOp: 'clear', font: { chars: HUD_FONT_CHARS, fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 28, atlasSize: 2048 } });
    this.world.addSystem(this.system);
    const integration = new RenderIntegration(this.engine, { label: 'TankBattle.gui' });
    this.world.addRuntimeIntegration(integration); integration.registerAll(this.world, () => ({ pass: 'shared' }));
    this.resizeObserver.observe(this.host); this.resize();
  }
  start(update: (time: number) => void): void {
    this.engine.on('update', ({ detail: { time, delta } }) => { update(performance.now());
      const controller=document.body.dataset.gamepadActive==='true';
      for(const player of [1,2])this.labels.get(`p${player}-keys`)!.setText(controller?`${player}P 摇杆移动 / A 开火`:player===1?'W A S D 移动 / J 开火':'↑ ← ↓ → 移动 / Enter 开火');
      this.labels.get('brand')!.setText(controller?'Back 指针 / Start 暂停 / Back+Start 大厅 / Back+LB/RB 切换':'HAIYUE  /  ARCADE DIVISION');
      this.world.update(time, delta); });
    this.engine.run();
  }
  private place<T extends GuiElement>(element: T, rect: () => GuiRect, parent: GuiElement = this.root.root): T {
    const layout = element.layout.bind(element);
    element.layout = parentRect => { layout(parentRect); Object.assign(element.rect, rect()); };
    parent.add(element); return element;
  }
  private label(id: string, text: string, rect: () => GuiRect, fontSize = 13, color = TEXT, parent?: GuiElement): GuiLabel {
    const label = this.place(new GuiLabel({ id, text, fontSize, style: { color } }), rect, parent);
    this.labels.set(id, label); return label;
  }
  private panel(rect: () => GuiRect, color = '#202a1e', parent?: GuiElement): GuiElement {
    return this.place(new GuiElement({ style: { backgroundColor: color, borderColor: '#4b593e' } }), rect, parent);
  }
  private button(id: string, text: string, rect: () => GuiRect, click: () => void, parent?: GuiElement, primary = false): GuiButton {
    const button = this.place(new GuiButton({ id, text, style: { padding: 6, backgroundColor: primary ? GOLD : '#2b3825', color: primary ? '#202a1c' : TEXT,
      hoverBackgroundColor: primary ? '#f4d68b' : '#4a5d37', hoverColor: primary ? '#202a1c' : TEXT, borderColor: '#677449' }, onClick: click }), rect, parent);
    this.buttons.set(id, button); return button;
  }
  private image(id: string, sprite: string, rect: () => GuiRect, parent?: GuiElement): void {
    const image = this.place(new GuiImage({ id, source: this.atlas, sourceKey: 'tank-battle-atlas' }), rect, parent);
    this.images.set(id, image); this.setSprite(id, sprite);
  }
  private setSprite(id: string, name: string): void {
    const i = SPRITE_INDEX[name]!; const rows = Math.ceil(SPRITES.length / ATLAS_COLUMNS);
    this.images.get(id)!.setUv([i % ATLAS_COLUMNS / ATLAS_COLUMNS, Math.floor(i / ATLAS_COLUMNS) / rows, 1 / ATLAS_COLUMNS, 1 / rows]);
  }
  private build(): void {
    const r = (x: number, y: number, width: number, height: number): GuiRect => ({ x, y, width, height });
    this.label('brand', 'HAIYUE  /  ARCADE DIVISION', () => r(12, 10, this.width - 24, 24), 11, MUTED);
    this.label('title', '铁甲前线  IRON OUTPOST', () => r(12, 39, this.width - 24, 38), 25, GOLD);
    this.label('phase', '', () => r(this.board.x, 82, this.board.width, 22), 12, MUTED);
    this.label('caption', '', () => r(this.board.x, this.board.y + this.board.height + 8, this.board.width, 23), 11, GOLD);
    this.label('message', '', () => r(this.board.x, this.board.y + this.board.height + 33, this.board.width, 23), 11, MUTED);
    const terrains = [['brick', '砖墙 / 可破坏'], ['steel', '铁墙 / 满级击穿'], ['snow', '雪地 / 滑行'], ['water-0', '海水 / 阻挡'], ['forest', '丛林 / 隐蔽']];
    terrains.forEach(([sprite, text], i) => {
      this.image(`terrain-${i}`, sprite!, () => r(this.board.x + i * this.board.width / 5, this.board.y + this.board.height + 67, 17, 17));
      this.label(`terrain-label-${i}`, text!, () => r(this.board.x + i * this.board.width / 5 + 21, this.board.y + this.board.height + 64, this.board.width / 5 - 21, 24), 10, MUTED);
    });
    this.panel(() => r(this.sideX, this.sideY, this.sideW, this.mobile ? 217 : 510));
    this.label('command', '作战指挥 / COMMAND', () => r(this.sideX + 14, this.sideY + 10, this.sideW - 28, 24), 13, GOLD);
    this.label('stage', '', () => r(this.sideX + 14, this.sideY + 42, this.sideW - 28, 28), 18);
    this.label('enemies', '', () => r(this.sideX + 14, this.sideY + 78, this.sideW - 28, 24), 14, GOLD);
    for (let p = 1; p <= 2; p++) {
      const playerRect = () => r(this.sideX + 12 + (this.mobile ? (p - 1) * (this.sideW - 24) / 2 : 0), this.sideY + (this.mobile ? 42 : 114 + (p - 1) * 112), this.mobile ? (this.sideW - 32) / 2 : this.sideW - 24, this.mobile ? 91 : 102);
      this.panel(playerRect, p === 1 ? '#2c3021' : '#20302b');
      this.label(`p${p}-lives`, '', () => { const a = playerRect(); return r(a.x + 9, a.y + 4, a.width - 18, 23); }, 12, p === 1 ? GOLD : '#a6dce4');
      this.image(`p${p}-image`, `p${p}-0-0`, () => { const a = playerRect(); return r(a.x + 9, a.y + 31, 30, 30); });
      this.label(`p${p}-score`, '', () => { const a = playerRect(); return r(a.x + 46, a.y + 27, a.width - 50, 23); }, 14);
      this.label(`p${p}-level`, '', () => { const a = playerRect(); return r(a.x + 46, a.y + 49, a.width - 50, 17); }, 10, MUTED);
      this.label(`p${p}-keys`, p === 1 ? 'W A S D 移动 / J 开火' : '↑ ← ↓ → 移动 / Enter 开火', () => { const a = playerRect(); return r(a.x + 9, a.y + 66, a.width - 18, 22); }, 10, MUTED);
    }
    this.label('best', '', () => r(this.sideX + 14, this.sideY + 350, this.sideW - 28, 24), 12, GOLD);
    this.button('pause', '暂停 [P]', () => r(this.sideX + 12, this.sideY + (this.mobile ? 145 : 391), (this.sideW - 32) / 2, 35), () => this.action('pause'));
    this.button('sound', '声音 开', () => r(this.sideX + 20 + (this.sideW - 32) / 2, this.sideY + (this.mobile ? 145 : 391), (this.sideW - 32) / 2, 35), () => this.action('sound'));
    this.button('menu', '作战菜单', () => r(this.sideX + 12, this.sideY + 435, this.sideW - 24, 32), () => this.action('menu'));
    this.label('save', '', () => r(this.sideX + 12, this.sideY + (this.mobile ? 183 : 477), this.sideW - 24, 22), 10, MUTED);
    const touchRects = [r(60, 0, 48, 43), r(8, 47, 48, 43), r(60, 47, 48, 43), r(112, 47, 48, 43), r(0, 10, 75, 75)];
    Object.keys(TOUCH_KEYS).forEach((id, i) => this.button(id, ['↑', '←', '↓', '→', '开火'][i]!, () => {
      const a = touchRects[i]!; return r(id === 'fire' ? this.width - 95 : a.x + 12, this.touchY + a.y, a.width, a.height);
    }, () => {}));
    this.label('supply-title', '战场补给 · 击毁闪光敌军后掉落', () => r(12, this.supplyY, this.width - 24, 25), 12, GOLD);
    Object.entries(POWERUP_NAMES).forEach(([kind, name], i) => {
      const box = () => { const cols = this.mobile ? 3 : 6, w = (this.width - 24) / cols; return r(12 + (i % cols) * w, this.supplyY + 34 + Math.floor(i / cols) * 61, w - 6, 53); };
      this.panel(box);
      this.image(`item-${kind}`, `item-${kind}`, () => { const a = box(); return r(a.x + 7, a.y + 14, 24, 24); });
      this.label(`item-label-${kind}`, name, () => { const a = box(); return r(a.x + 36, a.y + 7, a.width - 40, 24); }, 11);
      this.label(`item-help-${kind}`, ['射速 / 双弹 / 破甲', '无敌 10 秒', '清除场上敌军', '冻结 10 秒', '加固 20 秒', '增加一辆坦克'][i]!, () => { const a = box(); return r(a.x + 36, a.y + 29, a.width - 40, 17); }, 9, MUTED);
    });
    this.button('lobby', '返回大厅', () => r(12, this.height - 36, 110, 28), () => { location.assign('../../'); });
    this.button('gallery', '素材图鉴 ↗', () => r(this.width - 135, this.height - 36, 123, 28), () => { window.open('./assets/index.html', '_blank', 'noopener'); });
    this.cleared = this.label('clear', '区域肃清 · 准备前往下一战区', () => r(this.board.x + 8, this.board.y + this.board.height / 2 - 26, this.board.width - 16, 52), 17, GOLD);
    this.cleared.setStyle({ backgroundColor: '#1c2a1a', padding: 8 });
    this.modal = this.panel(() => ({ ...this.board }), 'rgba(13,23,13,0.88)');
    const dialog = () => { const w = Math.min(348, this.board.width - 24), h = Math.min(354, this.board.height - 16); return r(this.board.x + (this.board.width - w) / 2, this.board.y + (this.board.height - h) / 2, w, h); };
    this.panel(dialog, '#202b1d', this.modal);
    this.label('overlay-title', '', () => { const a = dialog(); return r(a.x + 12, a.y + 16, a.width - 24, 34); }, 22, GOLD, this.modal);
    this.label('overlay-description', '', () => { const a = dialog(); return r(a.x + 12, a.y + 55, a.width - 24, 22); }, 12, MUTED, this.modal);
    this.label('overlay-detail', '', () => { const a = dialog(); return r(a.x + 12, a.y + 79, a.width - 24, 22); }, 11, MUTED, this.modal);
    this.image('menu-tank', 'p1-3-0', () => { const a = dialog(); return r(a.x + a.width / 2 - 18, a.y + 110, 36, 36); }, this.modal);
    for (const [i, id, text] of [[0, 'resume', '继续作战'], [1, 'solo', '单人出击  /  1P'], [2, 'duo', '双人协作  /  2P']] as const) {
      this.button(id, text, () => { const a = dialog(); const h = this.mobile ? 35 : 40; return r(a.x + 15, a.y + a.height - (3 - i) * (h + 7) - 12, a.width - 30, h); }, () => this.action(id), this.modal, id !== 'duo');
    }
  }
  private resize(): void {
    if (this.disposed) return;
    const width = Math.floor(this.host.clientWidth); if (width === this.width) return; this.width = width;
    this.mobile = width < 700;
    const size = this.mobile ? width - 24 : Math.min(width - 300, 680);
    this.board = { x: 12, y: 112, width: size, height: size };
    this.touchY = 112 + size + 101;
    this.sideX = this.mobile ? 12 : size + 34; this.sideY = this.mobile ? this.touchY + 103 : 112; this.sideW = this.mobile ? width - 24 : width - this.sideX - 12;
    this.supplyY = this.mobile ? this.sideY + 234 : Math.max(112 + size + 105, 642);
    this.height = this.supplyY + (this.mobile ? 205 : 143); this.host.style.height = `${this.height}px`;
    Object.assign(this.battlefield.style, { left: `${this.board.x}px`, top: `${this.board.y}px`, width: `${size}px`, height: `${size}px` });
    for (const id of ['stage', 'enemies', 'best', 'menu']) (this.labels.get(id) ?? this.buttons.get(id))!.setVisible(!this.mobile);
    for (const id of Object.keys(TOUCH_KEYS)) this.buttons.get(id)!.setVisible(this.mobile);
    this.images.get('menu-tank')!.setVisible(this.board.width >= 340);
    ['砖墙 / 可破坏', '铁墙 / 满级击穿', '雪地 / 滑行', '海水 / 阻挡', '丛林 / 隐蔽'].forEach((text, i) => {
      this.labels.get(`terrain-label-${i}`)!.setText(this.mobile ? text.split(' / ')[0]! : text);
    });
    this.engine.resizeToDisplaySize(true);
    this.root.root.markDirty(); this.root.layout(this.width, this.height);
    if (this.view) this.update(this.view);
  }
  update(view: HudState): void {
    this.view = view; const { state: s, menuOpen, hasRun, muted } = view;
    const ended = s.phase === 'gameover' || s.phase === 'victory';
    this.labels.get('phase')!.setText(`${menuOpen ? '等待指令' : { playing: '作战进行中', paused: '作战暂停', cleared: '区域肃清', gameover: '任务结束', victory: '任务完成' }[s.phase]}  /  ${String(s.stage).padStart(2, '0')} ${STAGE_NAMES[s.stage - 1]}`);
    this.labels.get('caption')!.setText(`${!s.baseAlive ? '基地失守' : s.fortify > 0 ? `基地加固 ${Math.ceil(s.fortify / 60)}s` : '基地完好'}  /  待清除敌军 ${s.total - s.killed}`);
    this.labels.get('message')!.setText(!hasRun ? '选择模式，准备出击。' : s.freeze > 0 ? `敌军冻结 ${Math.ceil(s.freeze / 60)}s` : s.messageTimer > 0 ? s.message : '消灭敌军 · 保护基地');
    this.labels.get('stage')!.setText(`${String(s.stage).padStart(2, '0')} / ${STAGE_NAMES[s.stage - 1]}`);
    this.labels.get('enemies')!.setText(`待清除敌军  ${s.total - s.killed} / ${s.total}`);
    for (let p = 1; p <= 2; p++) { const player = s.players[p - 1];
      this.labels.get(`p${p}-lives`)!.setText(`${p}P ${p === 1 ? '先锋' : '僚机'}  /  ${player ? `生命 ${player.lives}` : '未加入'}`);
      this.labels.get(`p${p}-score`)!.setText(String(player?.score ?? 0).padStart(6, '0'));
      this.labels.get(`p${p}-level`)!.setText(`LV. ${(player?.level ?? 0) + 1}`);
      this.setSprite(`p${p}-image`, `p${p}-${player?.level ?? 0}-0`);
    }
    this.labels.get('best')!.setText(`最高总分  ${String(view.best).padStart(6, '0')}`);
    this.labels.get('save')!.setText(view.saveStatus);
    this.buttons.get('pause')!.setText(s.phase === 'paused' || menuOpen ? '继续 [P]' : '暂停 [P]');
    this.buttons.get('pause')!.setDisabled(!hasRun || ended); this.buttons.get('menu')!.setDisabled(!hasRun);
    this.buttons.get('sound')!.setText(`声音 ${muted ? '关' : '开'}`);
    this.modal.setVisible(menuOpen || ended || s.phase === 'paused');
    this.buttons.get('resume')!.setVisible(hasRun && !ended);
    this.cleared.setVisible(s.phase === 'cleared' && !menuOpen);
    this.labels.get('overlay-title')!.setText(ended ? (s.phase === 'victory' ? '防线守住了' : '作战结束') : menuOpen ? '守住最后的防线' : '作战已暂停');
    this.labels.get('overlay-description')!.setText(ended ? s.message : hasRun ? `第 ${s.stage} 关 · ${STAGE_NAMES[s.stage - 1]}` : '保护基地，击毁闪光敌军。');
    this.labels.get('overlay-detail')!.setText(ended ? `总分 ${s.players.reduce((n, p) => n + p.score, 0)}` : hasRun ? '继续进度，或选择模式开始新任务。' : '5 个战区 / 4 种敌军 / 6 种补给');
  }
  releaseFocus(): void { this.system.focus.blur(); this.canvas.focus({ preventScroll: true }); }
  touchKey(event: PointerEvent): string | undefined {
    const rect = this.canvas.getBoundingClientRect();
    const hit = this.root.hitTest((event.clientX - rect.left) * this.width / rect.width, (event.clientY - rect.top) * this.height / rect.height);
    return hit ? TOUCH_KEYS[hit.id] : undefined;
  }
  /** Read-only geometry for real pointer-driven browser coverage. */
  snapshot() {
    const canvas = this.canvas.getBoundingClientRect();
    const text = [...this.labels.values(), ...this.buttons.values()].map(element => element.text).join('');
    return { renderer: 'engine-gui', mobile: this.mobile, saveStatus: this.view?.saveStatus, muted: this.view?.muted,
      viewport: { width: this.engine.displayWidth, height: this.engine.displayHeight, cssWidth: canvas.width, cssHeight: canvas.height },
      missingGlyphs: [...new Set([...text].filter(char => !HUD_FONT_CHARS.includes(char)))],
      buttons: Object.fromEntries([...this.buttons].map(([id, b]) => [id, { ...b.rect, x: canvas.left + b.rect.x, y: canvas.top + b.rect.y, visible: b.visible, disabled: b.disabled }])),
      labels: Object.fromEntries([...this.labels].map(([id, l]) => [id, l.text])) };
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.resizeObserver.disconnect(); this.world.destroy(); this.engine.destroy(); }
}
