import { Entity, type World } from '@haiyue/engine';
import { InputMap } from '@haiyue/engine/input';
import { GuiButton, GuiElement, GuiLabel, GuiRoot, GuiSystem, type GuiRect, type GuiStyle } from '@haiyue/engine/gui';
import type { IEngine } from '@haiyue/engine/extension-authoring';
import type { Puzzle } from '../rules/game';
import { isMap } from '../rules/game';
import { INTRO, OVERWORLD, type LevelPack } from '../levels/pack';
import { gameLayout } from '../rendering/layout';

export const copy = {
  title: '大肥鱼', undo: '撤销', restart: '重开', library: '关卡', next: '下一关', enter: '进入',
  currentRules: '生效规则', empty: '当前没有规则', stuck: '没有可以控制的角色', cleared: '过关！',
  steps: '步', play: '方向键 / WASD 移动   空格 等待   Z 撤销   R 重开   L 关卡',
  pad: '摇杆 / 十字键 移动   A 等待 / 确认   B 撤销   X 重开   Y 关卡',
  compactKeys: '方向键 移动 · 空格 等待 · Z 撤销 · L 关卡',
  compactPad: '摇杆 移动 · A 等待 · B 撤销 · Y 关卡',
  choose: '选择关卡', files: '导入文件', folder: '导入关卡包', changePack: '切换关卡包', close: '关闭',
  load: '正在读取关卡…', failed: '关卡读取失败', noPair: '请同时选择同名的 .l 和 .ld 文件',
  choosePair: '选择 .l 和 .ld，或导入含 world_data.txt 的文件夹',
  mapHelp: '沿路径移动，按 Enter 或 A 进入关卡。', unknown: '关卡包含未识别的对象', missingLink: '目标关卡不在当前关卡包',
  mapBack: '返回地图', completed: '已完成', route: '航线进度', locked: '未解锁',
  mapKeys: '方向键 移动 · Enter 进入 · L 关卡', mapPad: '摇杆 移动 · A 进入 · Y 关卡',
};
const glyphs = [...new Set([...Object.values(copy).join(''), ...INTRO.flat().join(''), ...OVERWORLD.join(''),
  ...Array.from({length: 95}, (_, i) => String.fromCharCode(i + 32)), ...'·×‹›↑↓←→「」—✓éèüöñ'])].join('');
const pane: GuiStyle = { backgroundColor: '#0b2439f5', borderColor: '#3a788bb8', radius: 12 };
const mint = '#7dece3';
const dim = '#a0c4d1';
const white = '#edfaff';
const gold = '#ffd98c';
const regular: GuiStyle = { color: white, backgroundColor: '#173c54', borderColor: '#40788c', radius: 8,
  hoverBackgroundColor: '#275973', padding: 2 };
const primary: GuiStyle = { ...regular, color: '#07283a', backgroundColor: '#9ce8d9', hoverBackgroundColor: '#b9f8ec', borderColor: '#a7f7e3' };

export type HudAction = 'undo' | 'restart' | 'library' | 'next' | 'files' | 'folder' | 'pack' | 'older' | 'newer';
export const rowsPerPage = 6;
export interface HudData {
  puzzle: Puzzle | null;
  pack: LevelPack;
  index: number;
  active: number;
  library: boolean;
  busy: boolean;
  gamepad: boolean;
  message: string;
  canGoBack: boolean;
  builtin: boolean;
  selectedLink: string | undefined;
  completed: ReadonlySet<string>;
  locked: ReadonlySet<string>;
}

export class LagoonHud {
  readonly root = new GuiRoot({ theme: { fontFamily: 'Microsoft YaHei UI, Microsoft YaHei, sans-serif', fontSize: 16 } });
  readonly system: GuiSystem;
  private readonly rects = new Map<GuiElement, GuiRect>();
  private readonly header = this.panel('header');
  private readonly title = this.label(copy.title, 35, mint);
  private readonly level = this.label('', 21, white);
  private readonly chapter = this.label('', 13, dim);
  private readonly buttons: Record<'undo' | 'restart' | 'library' | 'next', GuiButton>;
  private readonly sidebar = this.panel('sidebar');
  private readonly ruleTitle = this.label(copy.currentRules, 21, mint);
  private readonly step = this.label('', 13, dim, 'right');
  private readonly ruleLines = Array.from({length: 8}, () => this.label('', 14, white));
  private readonly note = this.label('', 15, gold);
  private readonly help = this.label('', 14, dim);
  private readonly footer = this.panel('footer');
  private readonly keyboard = this.label('', 14, dim, 'center');
  private readonly shade = this.place(new GuiElement({ id: 'shade', style: { backgroundColor: '#021222d9' }, pointerFilter: 'stop' }));
  private readonly book = this.panel('book');
  private readonly bookTitle = this.label(copy.choose, 22, mint);
  private readonly bookHelp = this.label(copy.choosePair, 13, dim);
  private readonly libraryButtons: Record<'library' | 'older' | 'newer' | 'files' | 'folder' | 'pack', GuiButton>;
  private readonly rows: GuiButton[];
  private readonly page = this.label('', 14, mint, 'center');
  private readonly modal: GuiElement[];
  private size = { width: 0, height: 0 };
  private data: HudData | undefined;

  constructor(engine: IEngine, world: World, callback: (action: HudAction) => void, select: (row: number) => void) {
    this.buttons = { undo: this.button(copy.undo, () => callback('undo')), restart: this.button(copy.restart, () => callback('restart')),
      library: this.button(copy.library, () => callback('library')), next: this.button(copy.next, () => callback('next'), true) };
    this.libraryButtons = { library: this.button(copy.close, () => callback('library')), files: this.button(copy.files, () => callback('files')),
      folder: this.button(copy.folder, () => callback('folder')), pack: this.button(copy.changePack, () => callback('pack')),
      older: this.button('‹', () => callback('older')), newer: this.button('›', () => callback('newer')) };
    this.rows = Array.from({length: rowsPerPage}, (_, row) => this.button('', () => select(row)));
    this.modal = [this.shade, this.book, this.bookTitle, this.bookHelp, ...Object.values(this.libraryButtons), ...this.rows, this.page];
    // The modal must be last in the hit-test and paint order.
    for (const node of this.modal) { this.root.remove(node); this.root.add(node); }
    this.system = new GuiSystem(engine, { loadOp: 'load', navigationMap: new InputMap({}), font: { chars: glyphs,
      fontSize: 28, fontFamily: this.root.theme.fontFamily, atlasSize: 1024 } });
    this.system.priority = 1000;
    world.addEntity(new Entity('大肥鱼 HUD').addComponent(this.root));
    world.addSystem(this.system);
  }
  private place<T extends GuiElement>(node: T): T {
    const rect = { x: 0, y: 0, width: 0, height: 0 };
    this.rects.set(node, rect);
    node.layout = () => { Object.assign(node.rect, rect); };
    return this.root.add(node);
  }
  private panel(id: string): GuiElement { return this.place(new GuiElement({ id, style: pane, pointerFilter: 'ignore' })); }
  private label(text: string, fontSize: number, color: string, textAlign: 'left' | 'center' | 'right' = 'left'): GuiLabel {
    return this.place(new GuiLabel({ text, fontSize, textAlign, style: { color, padding: 0 }, pointerFilter: 'ignore' }));
  }
  private button(text: string, onClick: () => void, highlight = false): GuiButton {
    return this.place(new GuiButton({ text, onClick, hoverTransition: true, style: highlight ? primary : regular, focus: { mode: 'none' } }));
  }
  private put(node: GuiElement, x: number, y: number, width: number, height: number): void {
    Object.assign(this.rects.get(node)!, { x, y, width: Math.max(1, width), height: Math.max(1, height) });
  }
  resize(width: number, height: number): void {
    this.size = { width, height };
    const { header, sidebar, footer, modal, compact } = gameLayout(width, height, this.data?.puzzle?.level);
    const p = compact ? 12 : 17;
    for (const [node, rect] of [[this.header, header], [this.sidebar, sidebar], [this.footer, footer], [this.book, modal]] as const) this.put(node, rect.x, rect.y, rect.width, rect.height);
    this.put(this.shade, 0, 0, width, height);
    const x = header.x + p, y = header.y;
    this.title.setFontSize(compact ? 25 : 35);
    this.level.setFontSize(compact ? 15 : 21);
    this.root.theme.fontSize = compact ? 13 : 16;
    this.put(this.title, x, y + 4, compact ? 85 : 132, compact ? 43 : 62);
    const bx = compact ? x : header.x + header.width - p - 320;
    const bw = compact ? (header.width - 2 * p - 21) / 4 : 74;
    for (const [i, button] of Object.values(this.buttons).entries()) this.put(button, bx + i * (bw + 7), y + (compact ? 51 : 17), bw, compact ? 33 : 37);
    const titleX = x + (compact ? 85 : 144);
    const titleWidth = (compact ? header.x + header.width - p : bx - 12) - titleX;
    this.put(this.chapter, titleX, y + (compact ? 5 : 9), titleWidth, 19);
    this.put(this.level, titleX, y + (compact ? 22 : 29), titleWidth, compact ? 23 : 28);
    const sx = sidebar.x + p, sy = sidebar.y, sw = sidebar.width - 2 * p;
    this.ruleTitle.setFontSize(compact ? 16 : 21);
    this.put(this.ruleTitle, sx, sy + (compact ? 4 : 14), sw, 31);
    this.put(this.step, sx + sw - 70, sy + (compact ? 4 : 16), 70, 27);
    const count = compact ? (sidebar.height < 100 ? 2 : 4) : Math.min(8, Math.max(2, Math.floor((sidebar.height - 150) / 33)));
    const columns = compact ? 2 : 1;
    const stepHeight = compact ? 23 : 33;
    for (const [i, label] of this.ruleLines.entries()) this.put(label, sx + i % columns * sw / columns, sy + (compact ? 34 : 58) + Math.floor(i / columns) * stepHeight, sw / columns - 5, stepHeight - 2);
    this.put(this.note, sx, sy + sidebar.height - (compact ? 23 : 86), sw, 20);
    this.put(this.help, sx, sy + sidebar.height - 56, sw, 47);
    this.put(this.keyboard, footer.x + p, footer.y, footer.width - 2 * p, footer.height);
    this.keyboard.setFontSize(compact ? 12 : 14);
    const mx = modal.x + 17, my = modal.y, mw = modal.width - 34;
    this.put(this.bookTitle, mx, my + 9, mw - 80, 30);
    this.put(this.libraryButtons.library, mx + mw - 59, my + 11, 59, 27);
    this.put(this.bookHelp, mx, my + 42, mw, 30);
    const rh = Math.min(45, Math.max(18, (modal.height - 150) / rowsPerPage));
    for (const [i, button] of this.rows.entries()) this.put(button, mx, my + 76 + rh * i, mw, rh - 5);
    const toolsY = my + 77 + rh * rowsPerPage;
    this.put(this.libraryButtons.older, mx, toolsY, 43, 26);
    this.put(this.page, mx + 45, toolsY, mw - 90, 26);
    this.put(this.libraryButtons.newer, mx + mw - 43, toolsY, 43, 26);
    const toolWidth = (mw - 12) / 3;
    for (const [i, button] of [this.libraryButtons.files, this.libraryButtons.folder, this.libraryButtons.pack].entries()) {
      this.put(button, mx + i * (toolWidth + 6), toolsY + 32, toolWidth, 29);
    }
    this.root.root.markDirty();
    this.apply(count, compact, titleWidth, sw);
  }
  update(data: HudData): void {
    this.data = data;
    this.resize(this.size.width, this.size.height);
  }
  private apply(count: number, compact: boolean, titleWidth: number, sideWidth: number): void {
    const data = this.data;
    if (!data) return;
    const { puzzle, pack, index, active, library, busy, message, canGoBack, builtin, gamepad, selectedLink, completed, locked } = data;
    const display = (text: string, width: number, size: number): string => {
      let widthUsed = 0;
      let result = '';
      for (const letter of text) {
        if (widthUsed + size > width) return result + '…';
        result += letter;
        widthUsed += /[\u2e80-\uffff]/.test(letter) ? size : size * .58;
      }
      return result;
    };
    const won = puzzle?.state.won ?? false;
    const map = !!puzzle && isMap(puzzle.level);
    const overworld = builtin && map;
    this.chapter.setText(display(overworld ? pack.title : `${pack.title}  /  ${index + 1} · ${builtin ? INTRO.length : pack.entries.length}`, titleWidth, 13));
    this.level.setText(display(puzzle?.level.title ?? copy.load, titleWidth, compact ? 15 : 21));
    this.ruleTitle.setText(overworld ? copy.route : copy.currentRules);
    this.step.setText(overworld ? `${completed.size} / ${INTRO.length}` : `${puzzle?.state.turn ?? 0} ${copy.steps}`);
    const target = overworld && pack.entries.find(entry => entry.id === selectedLink);
    const rules = overworld ? (target ? [target.title] : []) : puzzle?.context.rules.map(rule => rule.label) ?? [];
    for (const [i, line] of this.ruleLines.entries()) {
      line.setVisible(i < count && (i < rules.length || i === 0 && !overworld));
      const text = rules[i] && i === count - 1 && rules.length > count ? `+ ${rules.length - i}` : rules[i] ?? copy.empty;
      line.setText(display(text, sideWidth / (compact ? 2 : 1), 14));
    }
    const controllable = puzzle?.context.units.some(unit => puzzle.context.has(unit, 'you') || puzzle.context.has(unit, 'you2'));
    this.note.setText(display(message || (busy ? copy.load : won ? copy.cleared : puzzle && !map && !controllable ? copy.stuck :
      puzzle?.level.unknown.length ? copy.unknown : ''), sideWidth, 15));
    this.help.setVisible(!compact);
    this.help.setText(display(map ? copy.mapHelp : puzzle?.level.subtitle ?? '', sideWidth, 15));
    this.keyboard.setText(map ? gamepad ? copy.mapPad : copy.mapKeys : gamepad ? compact ? copy.compactPad : copy.pad : compact ? copy.compactKeys : copy.play);
    this.buttons.undo.setDisabled(busy || library || !puzzle?.canUndo);
    this.buttons.restart.setDisabled(busy || library || !puzzle);
    this.buttons.library.setDisabled(busy || library);
    const enabled = !!selectedLink || canGoBack;
    this.buttons.next.setDisabled(busy || library || !enabled);
    this.buttons.next.setStyle(enabled ? primary : regular);
    this.buttons.next.setText(selectedLink && !won ? copy.enter : canGoBack ? copy.mapBack : map ? copy.enter : copy.next);
    for (const node of this.modal) node.setVisible(library);
    if (!library) return;
    const page = Math.floor(active / rowsPerPage);
    this.bookTitle.setText(display(copy.choose + ' · ' + pack.title, this.rects.get(this.bookTitle)!.width, 21));
    this.bookHelp.setText(display(message || copy.choosePair, this.rects.get(this.bookHelp)!.width, 13));
    this.page.setText(`${page + 1} / ${Math.ceil(pack.entries.length / rowsPerPage)}`);
    this.libraryButtons.older.setDisabled(busy || page === 0);
    this.libraryButtons.newer.setDisabled(busy || (page + 1) * rowsPerPage >= pack.entries.length);
    for (const action of ['files', 'folder', 'pack'] as const) this.libraryButtons[action].setDisabled(busy);
    for (const [i, button] of this.rows.entries()) {
      const row = page * rowsPerPage + i;
      const entry = pack.entries[row];
      button.setVisible(!!entry);
      button.setDisabled(busy || !!entry && locked.has(entry.id));
      if (!entry) continue;
      button.setStyle(row === active ? primary : regular);
      const number = entry.map ? '' : String(row + 1).padStart(2, '0') + '    ';
      const status = completed.has(entry.id) ? '  ✓' : locked.has(entry.id) ? `  · ${copy.locked}` : '';
      button.setText(display(number + entry.title + status, this.rects.get(button)!.width - 9, 16));
    }
  }
}
