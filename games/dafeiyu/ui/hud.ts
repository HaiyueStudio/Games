import { Entity, type World } from '@haiyue/engine';
import { InputMap } from '@haiyue/engine/input';
import { GuiButton, GuiElement, GuiLabel, GuiRoot, GuiSystem, GuiTooltip, type GuiRect, type GuiStyle } from '@haiyue/engine/gui';
import type { IEngine } from '@haiyue/engine/extension-authoring';
import { INTRO, OVERWORLD, type LevelPack } from '../levels/pack';
import { isMap, type Puzzle } from '../rules/game';
import { player } from '../rules/properties';
import { playLayout } from '../rendering/layout';
import { screenCopy } from './screens';

export const copy = {
  title: '大肥鱼', undo: '撤销', redo: '重做', restart: '重开', pause: '暂停',
  paused: '游戏暂停', resume: '继续游戏', world: '返回大世界', home: '返回首页', editBack: '退出试玩',
  library: '关卡', enter: '进入', mapBack: '返回地图', cleared: '过关！', stuck: '没有可以控制的角色',
  choose: '选择关卡', files: '导入文件', folder: '导入关卡包', changePack: '切换关卡包', close: '关闭',
  load: '正在读取关卡…', failed: '关卡读取失败', noPair: '请同时选择同名的 .l 和 .ld 文件',
  choosePair: '选择 .l 和 .ld，或导入含 world_data.txt 的文件夹',
  unknown: '关卡包含未识别的对象', missingLink: '目标关卡不在当前关卡包', locked: '未解锁',
};
const glyphs = [...new Set([...Object.values(copy).join(''), ...Object.values(screenCopy).flat().join(''), ...INTRO.flat().join(''), ...OVERWORLD.join(''),
  ...Array.from({length: 95}, (_, i) => String.fromCharCode(i + 32)), ...'·×‹›↑↓←→「」—✓éèüöñ−第子间到'])].join('');
const pane: GuiStyle = { backgroundColor: '#0b2439f5', borderColor: '#3a788bd6', radius: 16 };
const mint = '#a4f2e8';
const dim = '#a0c4d1';
const regular: GuiStyle = { color: '#edfaff', backgroundColor: '#173c54', borderColor: '#40788c', radius: 9,
  hoverBackgroundColor: '#275973', padding: 2 };
const primary: GuiStyle = { ...regular, color: '#07283a', backgroundColor: '#9ce8d9', hoverBackgroundColor: '#b9f8ec', borderColor: '#a7f7e3' };
const iconSize = 23;
const toolbarActions = ['undo', 'redo', 'restart', 'pause'] as const;
type ToolbarAction = typeof toolbarActions[number];
export const pauseActions = ['resume', 'world', 'home'] as const;
type PauseAction = typeof pauseActions[number];
export type HudAction = ToolbarAction | PauseAction | 'library' | 'next' | 'files' | 'folder' | 'pack' | 'older' | 'newer';
export const rowsPerPage = 6;

export interface HudData {
  puzzle: Puzzle | null;
  pack: LevelPack;
  active: number;
  library: boolean;
  paused: boolean;
  pauseIndex: number;
  busy: boolean;
  message: string;
  canGoBack: boolean;
  canReturnWorld: boolean;
  selectedLink: string | undefined;
  completed: ReadonlySet<string>;
  locked: ReadonlySet<string>;
  playtest: boolean;
}

function icon(kind: ToolbarAction): HTMLCanvasElement {
  const image = document.createElement('canvas');
  image.width = image.height = 72;
  const ctx = image.getContext('2d')!;
  ctx.scale(3, 3);
  ctx.strokeStyle = '#e5fbff';
  ctx.lineWidth = 1.9;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (kind === 'redo') { ctx.translate(24, 0); ctx.scale(-1, 1); }
  ctx.beginPath();
  if (kind === 'pause') {
    ctx.lineWidth = 3;
    ctx.moveTo(8, 5); ctx.lineTo(8, 19); ctx.moveTo(16, 5); ctx.lineTo(16, 19);
  } else if (kind === 'restart') {
    ctx.arc(12, 12, 7.6, -.76, Math.PI * 1.67);
    ctx.moveTo(19.8, 4.1); ctx.lineTo(19.8, 9); ctx.lineTo(14.9, 9);
  } else {
    ctx.moveTo(8.5, 4.5); ctx.lineTo(4, 9); ctx.lineTo(8.5, 13.5);
    ctx.moveTo(4, 9); ctx.lineTo(14.5, 9); ctx.bezierCurveTo(22, 9, 22, 19.5, 14.5, 19.5); ctx.lineTo(11, 19.5);
  }
  ctx.stroke();
  return image;
}

function display(text: string, width: number, size: number): string {
  let used = 0;
  let result = '';
  for (const letter of text) {
    if (used + size > width) return result + '…';
    result += letter;
    used += /[\u2e80-\uffff]/.test(letter) ? size : size * .58;
  }
  return result;
}

export class LagoonHud {
  readonly root = new GuiRoot({ theme: { fontFamily: 'Microsoft YaHei UI, Microsoft YaHei, sans-serif', fontSize: 16 } });
  readonly system: GuiSystem;
  private readonly rects = new Map<GuiElement, GuiRect>();
  private readonly buttons = new Map<ToolbarAction, GuiButton>();
  private readonly tooltips = new Map<ToolbarAction, GuiTooltip>();
  private readonly status = this.label('', 14, '#fff0bb', 'status');
  private readonly bookButton: GuiButton;
  private readonly nextButton: GuiButton;
  private readonly shade = this.place(new GuiElement({ id: 'shade', style: { backgroundColor: '#021222b8' }, pointerFilter: 'stop' }));
  private readonly book = this.panel('book');
  private readonly bookTitle = this.label(copy.choose, 22, mint);
  private readonly bookHelp = this.label(copy.choosePair, 13, dim);
  private readonly libraryButtons: Record<'library' | 'older' | 'newer' | 'files' | 'folder' | 'pack', GuiButton>;
  private readonly rows: GuiButton[];
  private readonly page = this.label('', 14, mint, 'page', 'center');
  private readonly pausePanel = this.panel('pause-panel');
  private readonly pauseTitle = this.label(copy.paused, 26, mint, 'pause-heading', 'center');
  private readonly pauseRoom = this.label('', 14, dim, 'pause-room', 'center');
  private readonly pauseButtons = new Map<PauseAction, GuiButton>();
  private readonly libraryNodes: GuiElement[];
  private readonly pauseNodes: GuiElement[];
  private size = { width: 0, height: 0 };
  private data: HudData | undefined;

  constructor(engine: IEngine, world: World, callback: (action: HudAction) => void, select: (row: number) => void) {
    for (const action of toolbarActions) {
      const button = this.button('tool-' + action, '', () => callback(action));
      button.setStyle({ ...regular, backgroundColor: '#102c44f5', hoverBackgroundColor: '#26586f', icon: icon(action), iconSize, iconGap: 0 });
      this.buttons.set(action, button);
      this.tooltips.set(action, this.place(new GuiTooltip({ target: button, content: copy[action], placement: 'bottom',
        delay: 300, style: { color: '#edfaff', backgroundColor: '#0b2439', radius: 7 } })));
    }
    this.bookButton = this.button('open-library', copy.library, () => callback('library'));
    this.nextButton = this.button('next-room', copy.enter, () => callback('next'));
    this.libraryButtons = { library: this.button('close-library', copy.close, () => callback('library')),
      files: this.button('import-files', copy.files, () => callback('files')), folder: this.button('import-folder', copy.folder, () => callback('folder')),
      pack: this.button('choose-pack', copy.changePack, () => callback('pack')), older: this.button('page-prev', '‹', () => callback('older')),
      newer: this.button('page-next', '›', () => callback('newer')) };
    this.rows = Array.from({length: rowsPerPage}, (_, row) => this.button('room-' + row, '', () => select(row)));
    for (const action of pauseActions) this.pauseButtons.set(action, this.button('pause-' + action, copy[action], () => callback(action)));
    this.libraryNodes = [this.book, this.bookTitle, this.bookHelp, ...Object.values(this.libraryButtons), ...this.rows, this.page];
    this.pauseNodes = [this.pausePanel, this.pauseTitle, this.pauseRoom, ...this.pauseButtons.values()];
    for (const node of [this.shade, ...this.libraryNodes, ...this.pauseNodes]) {
      this.root.remove(node);
      this.root.add(node);
    }
    this.system = new GuiSystem(engine, { loadOp: 'load', textInputHost: 'browser', navigationMap: new InputMap({}),
      font: { chars: glyphs, fontSize: 44, fontFamily: this.root.theme.fontFamily, atlasSize: 2048 } });
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
  private label(text: string, fontSize: number, color: string, id?: string, textAlign: 'left' | 'center' = 'left'): GuiLabel {
    return this.place(new GuiLabel({ ...(id ? { id } : {}), text, fontSize, textAlign, style: { color, padding: 0 }, pointerFilter: 'ignore' }));
  }
  private button(id: string, text: string, onClick: () => void): GuiButton {
    return this.place(new GuiButton({ id, text, onClick, hoverTransition: true, style: regular, focus: { mode: 'none' } }));
  }
  private put(node: GuiElement, x: number, y: number, width: number, height: number): void {
    Object.assign(this.rects.get(node)!, { x, y, width: Math.max(1, width), height: Math.max(1, height) });
  }
  resize(width: number, height: number): void {
    this.size = { width, height };
    const { margin, button, gap, toolbar, library, pause } = playLayout(width, height);
    this.root.theme.fontSize = width < 600 ? 14 : 16;
    for (const [i, action] of toolbarActions.entries()) {
      const tool = this.buttons.get(action)!;
      const inset = (button - iconSize) / 2;
      if (tool.style.contentInsets?.left !== inset) tool.setStyle({ contentInsets: { left: inset, right: inset, top: 0, bottom: 0 } });
      this.put(tool, toolbar.x + i * (button + gap), toolbar.y, button, button);
      this.put(this.tooltips.get(action)!, 0, 0, 62, 26);
    }
    this.put(this.bookButton, margin, margin, 58, button);
    const mapBook = !!this.data?.puzzle && isMap(this.data.puzzle.level) && !this.data.playtest;
    this.put(this.nextButton, margin + (mapBook ? 64 : 0), margin, 76, button);
    const hasNext = !!this.data?.selectedLink || this.data?.puzzle?.state.won && this.data.canGoBack;
    const statusOffset = (mapBook ? 64 : 0) + (hasNext ? 84 : 0);
    this.put(this.status, margin + statusOffset, margin, Math.max(1, toolbar.x - margin - statusOffset - 9), button);
    this.put(this.shade, 0, 0, width, height);
    this.put(this.book, library.x, library.y, library.width, library.height);
    this.put(this.pausePanel, pause.x, pause.y, pause.width, pause.height);
    const px = pause.x + 23, pw = pause.width - 46;
    const heading = Math.min(49, pause.height * .21);
    const row = Math.min(46, Math.max(13, (pause.height - heading - 65) / 3));
    this.put(this.pauseTitle, px, pause.y + 13, pw, heading);
    this.put(this.pauseRoom, px, pause.y + 13 + heading, pw, 24);
    for (const [i, action] of pauseActions.entries()) {
      this.put(this.pauseButtons.get(action)!, px, pause.y + heading + 47 + i * (row + 7), pw, row);
    }

    const mx = library.x + 17, my = library.y, mw = library.width - 34;
    this.put(this.bookTitle, mx, my + 9, mw - 80, 30);
    this.put(this.libraryButtons.library, mx + mw - 59, my + 11, 59, 27);
    this.put(this.bookHelp, mx, my + 42, mw, 30);
    const rh = Math.min(45, Math.max(15, (library.height - 150) / rowsPerPage));
    for (const [i, item] of this.rows.entries()) this.put(item, mx, my + 76 + rh * i, mw, rh - 5);
    const toolsY = my + 77 + rh * rowsPerPage;
    this.put(this.libraryButtons.older, mx, toolsY, 43, 26);
    this.put(this.page, mx + 45, toolsY, mw - 90, 26);
    this.put(this.libraryButtons.newer, mx + mw - 43, toolsY, 43, 26);
    const toolWidth = (mw - 12) / 3;
    for (const [i, tool] of [this.libraryButtons.files, this.libraryButtons.folder, this.libraryButtons.pack].entries()) {
      this.put(tool, mx + i * (toolWidth + 6), toolsY + 32, toolWidth, 29);
    }
    this.root.root.markDirty();
    this.apply(pw);
  }
  update(data: HudData): void {
    this.data = data;
    this.resize(this.size.width, this.size.height);
  }
  private apply(pauseWidth: number): void {
    const data = this.data;
    if (!data) return;
    const { puzzle, pack, active, library, paused, pauseIndex, canGoBack, canReturnWorld, busy, message, selectedLink, completed, locked, playtest } = data;
    const overlay = library || paused;
    const map = !!puzzle && isMap(puzzle.level);
    const won = puzzle?.state.won ?? false;
    this.shade.setVisible(overlay);
    this.bookButton.setVisible(map && !playtest && !overlay);
    this.bookButton.setDisabled(busy);
    this.nextButton.setVisible(!overlay && (!!selectedLink || won && canGoBack));
    this.nextButton.setDisabled(busy);
    this.nextButton.setText(won && canGoBack ? copy.mapBack : copy.enter);
    this.nextButton.setStyle(primary);
    const controllable = puzzle?.context.units.some(unit => player(puzzle.context, unit));
    const note = message || (busy ? copy.load : won ? copy.cleared : puzzle && !map && !controllable ? copy.stuck :
      puzzle?.level.unknown.length ? copy.unknown : '');
    this.status.setText(display(note, this.rects.get(this.status)!.width, 14));
    this.status.setVisible(!overlay && !!note && (!map || !!message || busy));
    for (const [action, button] of this.buttons) {
      button.setVisible(!overlay);
      const available = action === 'undo' ? puzzle?.canUndo : action === 'redo' ? puzzle?.canRedo : !!puzzle;
      button.setDisabled(busy || !available);
      button.setStyle({ opacity: busy || !available ? .48 : 1 });
      this.tooltips.get(action)!.setVisible(!overlay);
    }
    for (const node of this.pauseNodes) node.setVisible(paused);
    if (paused) {
      this.pauseRoom.setText(display(puzzle?.level.title ?? '', pauseWidth, 14));
      this.pauseButtons.get('home')!.setText(playtest ? copy.editBack : copy.home);
      for (const [i, action] of pauseActions.entries()) {
        const button = this.pauseButtons.get(action)!;
        button.setStyle(i === pauseIndex ? primary : regular);
        button.setDisabled(busy || action === 'world' && !canReturnWorld);
      }
    }
    for (const node of this.libraryNodes) node.setVisible(library);
    if (!library) return;
    const page = Math.floor(active / rowsPerPage);
    this.bookTitle.setText(display(copy.choose + ' · ' + pack.title, this.rects.get(this.bookTitle)!.width, 21));
    this.bookHelp.setText(display(message || copy.choosePair, this.rects.get(this.bookHelp)!.width, 13));
    this.page.setText(String(page + 1) + ' / ' + Math.ceil(pack.entries.length / rowsPerPage));
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
      const status = completed.has(entry.id) ? '  ✓' : locked.has(entry.id) ? '  · ' + copy.locked : '';
      button.setText(display(number + entry.title + status, this.rects.get(button)!.width - 9, 16));
    }
  }
}
