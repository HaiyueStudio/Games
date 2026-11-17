import { GuiButton, GuiElement, GuiInput, GuiLabel, GuiRoot, GuiTooltip, type GuiRect, type GuiStyle } from '@haiyue/engine/gui';
import type { Direction } from '../levels/baba-format';
import type { WorldEditor } from '../levels/editor';
import { editorLayout } from '../rendering/layout';
import { characterLabel } from './names';
import { editorIcon, type EditorIcon } from './editor-icons';

export const screenCopy = {
  title: '大肥鱼', new: '新游戏', continue: '继续游戏', editor: '编辑器', back: '返回', home: '首页',
  slot: '存档', empty: '空存档', choose: '选择存档', overwrite: '覆盖此存档？', confirm: '确认覆盖',
  run: '试玩', undo: '撤销', add: '新关卡', map: '新地图', export: '导出', import: '导入',
  objects: '物件', words: '规则字块', links: '地图工具', target: '入口目标', select: '选择', erase: '橡皮', stack: '叠放',
  selection: '已选', noSelection: '空格', brush: '当前素材',
  direction: '朝向', path: '开放路径', hidden: '隐藏路径', spawn: '地图起点', node: '开放入口', locked: '锁定入口',
  width: '宽', height: '高', noEdit: '无法调整大小', storageError: '草稿保存失败', save: '保存', cancel: '取消',
  widthDown: '减小宽度', widthUp: '增加宽度', heightDown: '减小高度', heightUp: '增加高度',
  badImport: '无法读取世界草稿', editHelp: '点按或空格放置 · 右键擦除 · R 试玩',
  selectHelp: '点按选中 · Delete 擦除', eraseHelp: '点按或拖动擦除',
  added: '选好位置，放置入口', roomAdded: '已创建房间', name: '命名',
  directions: ['右', '上', '左', '下'],
};
const mapTools = ['@link', '@locked', '@path', '@secret', '@spawn'];
const tools = new Map(mapTools.map((tool, i) => [tool, [screenCopy.node, screenCopy.locked, screenCopy.path, screenCopy.hidden, screenCopy.spawn][i]!]));
tools.set('@erase', screenCopy.erase);
const labelForBrush = (name: string) => tools.get(name) ?? characterLabel(name) ?? name.replace(/^text_/, '').toUpperCase();
export const palettePageSize = 12;
export type PaletteTab = 'objects' | 'text' | 'map';
export type EditorCommand = 'home' | 'run' | 'undo' | 'export' | 'import' | 'rename' | 'add' | 'map' |
  'room-prev' | 'room-next' | 'world' | 'target-prev' | 'target-next' | 'objects' | 'text' | 'map-tools' |
  'palette-prev' | 'palette-next' | 'select' | 'erase' | 'stack' | 'rotate' | 'width-down' | 'width-up' | 'height-down' | 'height-up';
export const editorMapTools = mapTools;
const panelStyle: GuiStyle = { backgroundColor: '#081f39ef', borderColor: '#43879da8', radius: 15 };
const normal: GuiStyle = { backgroundColor: '#173d5bf2', hoverBackgroundColor: '#2a5c76', borderColor: '#568ba4', color: '#eaf9ff', radius: 8, padding: 2 };
const active: GuiStyle = { ...normal, backgroundColor: '#a6ede1', borderColor: '#c1fff1', hoverBackgroundColor: '#c1fff1', color: '#092b3b' };
const selectedMaterial: GuiStyle = { ...normal, backgroundColor: '#235a64', hoverBackgroundColor: '#306f78', borderColor: '#a2f7e9' };
const sizeBackground: GuiStyle = { backgroundColor: '#0a1d32', borderColor: '#315c77', radius: 9 };
const icons = {
  home: ['back', screenCopy.back], select: ['select', screenCopy.select], erase: ['erase', screenCopy.erase],
  undo: ['undo', screenCopy.undo], import: ['import', screenCopy.import], export: ['export', screenCopy.export], run: ['play', screenCopy.run],
  'width-down': ['minus', screenCopy.widthDown], 'width-up': ['plus', screenCopy.widthUp],
  'height-down': ['minus', screenCopy.heightDown], 'height-up': ['plus', screenCopy.heightUp],
} satisfies Partial<Record<EditorCommand, readonly [EditorIcon, string]>>;
type IconCommand = keyof typeof icons;
const actionText: [EditorCommand, string][] = [
  ['home', ''], ['select', ''], ['erase', ''], ['undo', ''], ['run', ''], ['export', ''], ['import', ''],
  ['room-prev', '‹'], ['world', ''], ['room-next', '›'], ['rename', screenCopy.name], ['add', screenCopy.add], ['map', screenCopy.map],
  ['objects', screenCopy.objects], ['text', screenCopy.words], ['map-tools', screenCopy.links],
  ['target-prev', '‹'], ['target-next', '›'], ['palette-prev', '‹'], ['palette-next', '›'],
  ['stack', screenCopy.stack], ['rotate', screenCopy.direction],
  ['width-down', ''], ['width-up', ''], ['height-down', ''], ['height-up', ''],
];
type HomePage = 'main' | 'new' | 'continue' | 'overwrite';
export interface HomeView { page: HomePage; selected: number; slots: (string | null)[]; busy: boolean; message: string }
export interface EditorView { editor: WorldEditor; tab: PaletteTab; page: number; choices: readonly string[]; message: string; naming: boolean }

class EditorTooltip extends GuiTooltip {
  viewportWidth = Infinity;
  minimumY = 0;

  override get popupRect(): GuiRect {
    const rect = super.popupRect;
    return { ...rect, x: Math.max(4, Math.min(rect.x, this.viewportWidth - rect.width - 4)), y: Math.max(rect.y, this.minimumY) };
  }
}

export class ScreenHud {
  readonly root = new GuiRoot({ theme: { fontFamily: 'Microsoft YaHei UI, Microsoft YaHei, sans-serif', fontSize: 16 } });
  private readonly nativeRects = new Map<GuiElement, GuiRect>();
  private readonly panel = this.add(new GuiElement({ style: panelStyle, pointerFilter: 'ignore' }));
  private readonly tools = this.add(new GuiElement({ style: panelStyle, pointerFilter: 'ignore' }));
  private readonly sizes = this.add(new GuiElement({ style: sizeBackground, pointerFilter: 'ignore' }));
  private readonly title = this.label('', 24, '#e9fbff');
  private readonly note = this.label('', 13, '#b4dcf0');
  private readonly target = this.label('', 13, '#a6ede1');
  private readonly page = this.label('', 13, '#a6ede1', 'center');
  private readonly width = this.label('', 14, '#d5f1f7', 'center', 'editor-width');
  private readonly height = this.label('', 14, '#d5f1f7', 'center', 'editor-height');
  private readonly selection = this.label('', 14, '#d5f1f7', 'left', 'editor-selection');
  private readonly homeButtons: GuiButton[];
  private readonly commands: Map<EditorCommand, GuiButton>;
  private readonly palette: GuiButton[];
  private readonly paletteTips: EditorTooltip[];
  private readonly commandTips = new Map<IconCommand, EditorTooltip>();
  private readonly iconImages = new Map<EditorIcon, readonly [HTMLCanvasElement, HTMLCanvasElement]>();
  readonly nameInput: GuiInput;
  private readonly nameConfirm: GuiButton;
  private readonly nameCancel: GuiButton;

  constructor(onHome: (index: number) => void, onEditor: (command: EditorCommand) => void, onPick: (index: number) => void,
    onName: (value: string | undefined) => void, private readonly preview: (name: string, facing: Direction) => HTMLCanvasElement) {
    this.homeButtons = Array.from({ length: 4 }, (_, i) => this.button('', () => onHome(i)));
    this.commands = new Map(actionText.map(([action, text]) => [action, this.button(text, () => onEditor(action), `editor-${action}`)]));
    this.palette = Array.from({ length: palettePageSize }, (_, i) => this.button('', () => onPick(i), `editor-palette-${i}`));
    this.paletteTips = this.palette.map(button => this.tooltip(button, 'top'));
    for (const action of Object.keys(icons) as IconCommand[]) {
      const [kind, label] = icons[action];
      const tip = this.tooltip(this.commands.get(action)!, 'bottom');
      tip.content = label;
      this.commandTips.set(action, tip);
      if (!this.iconImages.has(kind)) this.iconImages.set(kind, [editorIcon(kind, false), editorIcon(kind, true)]);
    }
    this.nameInput = this.add(new GuiInput({ id: 'draft-name', maxLength: 48, style: normal, onSubmit: onName }));
    this.nameConfirm = this.button(screenCopy.save, () => onName(this.nameInput.value));
    this.nameCancel = this.button(screenCopy.cancel, () => onName(undefined));
  }
  private add<T extends GuiElement>(node: T): T {
    const rect = { x: 0, y: 0, width: 0, height: 0 };
    this.nativeRects.set(node, rect);
    node.layout = () => Object.assign(node.rect, rect);
    return this.root.add(node);
  }
  private label(text: string, fontSize: number, color: string, textAlign: 'left' | 'center' = 'left', id?: string): GuiLabel {
    return this.add(new GuiLabel({ id, text, fontSize, textAlign, style: { color, padding: 0 }, pointerFilter: 'ignore' }));
  }
  private button(text: string, onClick: () => void, id?: string): GuiButton {
    return this.add(new GuiButton({ id, text, onClick, style: normal, hoverTransition: true, focus: { mode: 'none' } }));
  }
  private tooltip(target: GuiButton, placement: 'top' | 'bottom'): EditorTooltip {
    return this.add(new EditorTooltip({ target, placement, delay: 250, style: { color: '#edfaff', backgroundColor: '#0b2439', radius: 7 } }));
  }
  private putIcon(button: GuiButton, base: GuiStyle, image: HTMLCanvasElement, rect: GuiRect, size: number): void {
    const left = Math.max(0, (rect.width - size) / 2);
    button.setStyle({ ...base, icon: image, iconSize: size, iconGap: 0, contentInsets: { left, right: left, top: 0, bottom: 0 } });
    this.place(button, rect.x, rect.y, rect.width, rect.height);
  }
  private place(node: GuiElement, x: number, y: number, width: number, height: number): void {
    Object.assign(this.nativeRects.get(node)!, { x, y, width: Math.max(1, width), height: Math.max(1, height) });
    node.setVisible(true);
  }
  private reset(visible: boolean): void {
    this.root.root.setVisible(visible);
    for (const node of this.nativeRects.keys()) node.setVisible(false);
  }
  hide(): void { this.root.root.setVisible(false); }

  home(width: number, height: number, view: HomeView): void {
    this.reset(true);
    const compact = width < 700;
    this.root.theme.fontSize = compact ? 17 : 19;
    const label = view.page === 'main' ? screenCopy.title : view.page === 'overwrite' ? screenCopy.overwrite : screenCopy.choose;
    const options = view.page === 'main' ? [screenCopy.new, screenCopy.continue, screenCopy.editor] : view.page === 'overwrite' ?
      [screenCopy.confirm, screenCopy.back] : [...view.slots.map((slot, i) => `${screenCopy.slot} ${i + 1} · ${slot ?? screenCopy.empty}`), screenCopy.back];
    const left = compact ? Math.max(14, width * .07) : Math.max(28, width * .095);
    const span = Math.min(compact ? width - left * 2 : width * .36, 390);
    const stride = Math.max(28, Math.min(66, height * .087));
    const titleHeight = view.page === 'main' ? (compact ? 68 : 108) : (compact ? 44 : 60);
    const stackHeight = titleHeight + options.length * stride + (view.message ? 34 : 4);
    const top = compact ? Math.max(15, height - stackHeight - 40) : Math.max(22, (height - stackHeight) * .42);
    if (compact || view.page !== 'main') this.place(this.panel, left - 12, top - 10, span + 24, stackHeight + 22);
    this.title.setFontSize(view.page === 'main' ? (compact ? 46 : 76) : (compact ? 25 : 38));
    this.title.setText(label);
    this.place(this.title, left, top, span, titleHeight);
    options.forEach((text, i) => {
      const button = this.homeButtons[i]!;
      button.setText(text.length > 26 ? text.slice(0, 25) + '…' : text);
      button.setStyle(i === view.selected ? active : normal);
      button.setDisabled(view.busy || (view.page === 'main' && i === 1 && view.slots.every(slot => slot === null)) ||
        (view.page === 'continue' && i < 3 && view.slots[i] === null));
      this.place(button, left, top + titleHeight + i * stride, span, stride - 9);
    });
    if (view.message) {
      this.note.setText(view.message);
      this.place(this.note, left, top + titleHeight + options.length * stride, span, 24);
    }
    this.root.root.markDirty();
  }

  private editorToolbar(header: GuiRect, compact: boolean, editor: WorldEditor, viewportWidth: number): void {
    const inset = compact ? 8 : 10;
    const gap = 5;
    const buttonSize = Math.max(12, Math.min(compact ? 36 : 38, (header.width - inset * 2 - gap * 6) / 7));
    const top = header.y + (compact ? 7 : 10);
    const put = (action: IconCommand, x: number, y: number, width: number, height: number, selected = false) => {
      const button = this.commands.get(action)!;
      this.putIcon(button, selected ? active : normal, this.iconImages.get(icons[action][0])![selected ? 1 : 0],
        { x, y, width, height }, Math.min(22, width - 6, height - 6));
      const tip = this.commandTips.get(action)!;
      tip.minimumY = header.y + header.height + 4;
      tip.viewportWidth = viewportWidth;
      this.place(tip, 0, 0, tip.content.length > 2 ? 79 : 55, 27);
    };
    const left = ['home', 'select', 'erase', 'undo'] as const;
    const right = ['import', 'export', 'run'] as const;
    const stride = buttonSize + gap;
    left.forEach((action, i) => put(action, header.x + inset + i * stride, top, buttonSize, buttonSize, editor.brush === '@' + action));
    right.forEach((action, i) => put(action, header.x + header.width - inset + gap - (right.length - i) * stride,
      top, buttonSize, buttonSize, action === 'run'));
    this.commands.get('undo')!.setDisabled(!editor.canUndo);

    const span = Math.max(65, Math.min(compact ? 100 : 108, (header.width - 34) / 2));
    const separation = 7;
    const total = span * 2 + separation;
    const sizeX = header.x + (header.width - total) / 2;
    const sizeY = compact ? header.y + 48 : top;
    const height = compact ? 31 : buttonSize;
    const buttonWidth = compact ? 25 : 28;
    this.place(this.sizes, sizeX - 5, sizeY - 3, total + 10, height + 6);
    for (const [axis, label, value, offset] of [
      ['width', this.width, editor.room.width, 0], ['height', this.height, editor.room.height, span + separation],
    ] as const) {
      const x = sizeX + offset;
      put(`${axis}-down`, x, sizeY, buttonWidth, height);
      put(`${axis}-up`, x + span - buttonWidth, sizeY, buttonWidth, height);
      label.setText(`${screenCopy[axis]} ${value}`);
      this.place(label, x + buttonWidth, sizeY, span - 2 * buttonWidth, height);
    }
  }

  editor(width: number, height: number, view: EditorView): void {
    this.reset(true);
    this.root.theme.fontSize = 16;
    const { editor, tab, page, choices, message, naming } = view;
    const { header, panel, compact } = editorLayout(width, height, editor.room);
    this.place(this.panel, header.x, header.y, header.width, header.height);
    this.place(this.tools, panel.x, panel.y, panel.width, panel.height);
    this.editorToolbar(header, compact, editor, width);
    const row = (items: readonly EditorCommand[], x: number, y: number, w: number, h: number) => {
      const gap = 5, size = (w - (items.length - 1) * gap) / items.length;
      items.forEach((action, i) => this.place(this.commands.get(action)!, x + i * (size + gap), y, size, h));
    };
    const x = panel.x + 9, w = panel.width - 18;
    const step = Math.max(12, Math.min(35, (panel.height - 12) / 11));
    const rh = step - 3;
    let y = panel.y + 6;
    const emit = (items: readonly EditorCommand[]) => { row(items, x, y, w, rh); y += step; };
    const first = this.commands.get('world')!;
    first.setText(editor.room.title.length > 13 ? editor.room.title.slice(0, 12) + '…' : editor.room.title);
    this.place(this.commands.get('room-prev')!, x, y, 27, rh);
    this.place(first, x + 32, y, w - 64, rh);
    this.place(this.commands.get('room-next')!, x + w - 27, y, 27, rh);
    this.commands.get('room-prev')!.setDisabled(editor.index === 0);
    this.commands.get('room-next')!.setDisabled(editor.index + 1 === editor.project.rooms.length);
    y += step;
    emit(['add', 'map', 'rename']);
    this.commands.get('add')!.setDisabled(editor.project.rooms.length >= 128);
    this.commands.get('map')!.setDisabled(editor.project.rooms.length >= 128);
    emit(editor.room.map ? ['objects', 'text', 'map-tools'] : ['objects', 'text']);
    for (const [action, selected] of [['objects', tab === 'objects'], ['text', tab === 'text'], ['map-tools', tab === 'map'],
      ['stack', editor.stacking]] as const) this.commands.get(action)!.setStyle(selected ? active : normal);
    const targetName = editor.project.rooms[editor.target]?.title ?? screenCopy.empty;
    this.target.setText(`${screenCopy.target} · ${targetName.slice(0, 16)}`);
    const label = (node: GuiLabel, text: string, left: number, wide: number) => { node.setText(text); this.place(node, left, y, wide, rh); };
    const control = (action: EditorCommand, left: number, wide: number) => this.place(this.commands.get(action)!, left, y, wide, rh);
    if (editor.room.map && tab === 'map') {
      control('target-prev', x, 26); control('target-next', x + w - 26, 26);
      this.place(this.target, x + 34, y, w - 68, rh);
      y += step;
    } else {
      control('palette-prev', x, 26); control('palette-next', x + w - 26, 26);
      label(this.page, `${page + 1} / ${Math.max(1, Math.ceil(choices.length / palettePageSize))}`, x + 32, w - 64);
      y += step;
    }
    const visible = choices.slice(page * palettePageSize, (page + 1) * palettePageSize);
    const gap = 6;
    const chip = (w - 3 * gap) / 4;
    const rows = Math.max(1, Math.ceil(visible.length / 4));
    const chipHeight = Math.max(8, Math.min(chip, (panel.y + panel.height - y - step * 3 - 8 - gap * (rows - 1)) / rows));
    const selected = editor.brush === '@select' ? editor.selectedElement : editor.brush;
    visible.forEach((name, i) => {
      const button = this.palette[i]!;
      const text = labelForBrush(name);
      const rect = { x: x + i % 4 * (chip + gap), y: y + Math.floor(i / 4) * (chipHeight + gap), width: chip, height: chipHeight };
      const art = this.preview(name, editor.facing);
      const style = selected === name ? selectedMaterial : normal;
      this.putIcon(button, style, art, rect, Math.max(1, Math.min(chip, chipHeight) - 12));
      const tip = this.paletteTips[i]!;
      tip.content = text;
      tip.viewportWidth = width;
      this.place(tip, 0, 0, Math.max(58, Math.min(130, text.length * 11 + 18)), 27);
    });
    y += rows * (chipHeight + gap) + 3;
    const selectionPrefix = editor.brush === '@select' ? screenCopy.selection : screenCopy.brush;
    label(this.selection, `${selectionPrefix} · ${selected ? labelForBrush(selected) : screenCopy.noSelection}`, x + 2, w - 4);
    y += step;
    this.commands.get('rotate')!.setText(`${screenCopy.direction} · ${screenCopy.directions[editor.facing]}`);
    emit(['stack', 'rotate']);
    if (naming) {
      this.place(this.nameInput, x, y, w - 96, rh);
      this.place(this.nameConfirm, x + w - 90, y, 43, rh);
      this.place(this.nameCancel, x + w - 43, y, 43, rh);
    } else {
      const hint = editor.brush === '@select' ? screenCopy.selectHelp : editor.brush === '@erase' ? screenCopy.eraseHelp : screenCopy.editHelp;
      this.note.setText((message || hint).slice(0, 32));
      this.place(this.note, x, y, w, rh);
    }
    this.root.root.markDirty();
  }
}
