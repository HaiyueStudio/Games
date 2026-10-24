import type { HaiyueEngine, World } from '@haiyue/engine';
import { GuiButton, GuiCheckbox, GuiElement, GuiImage, GuiLabel, GuiSelect, type GuiRect } from '@haiyue/engine/gui';
import { GameHud } from '../../shared/ui/GameHud';
import type { AutoSaveStatus } from '../../save/SingleSlotGameSave';
export type Action = 'upload' | 'restart' | 'preview' | 'left' | 'right' | 'scatter' | 'minus' | 'fit' | 'plus';
const CHARS = '°·−。「」上不中于传住体作候允光入关再准击分切列加动原取可右合同后向吸回固图在块处备失始完定小左已平并应度开式张戏成手才拖择拼拾按接操放效整新方旋无有松柄查模正法消游滚点片理白的相看秒移稍空组继续缩置能行要许设请读败转轮载返连适选邻闭附需页首！，：';

export class JigsawHud extends GameHud {
  readonly rows: GuiSelect<number>;
  readonly cols: GuiSelect<number>;
  readonly rotation: GuiCheckbox;
  readonly status: GuiLabel;
  readonly stats: GuiLabel;
  readonly preview = new GuiImage({ visible: false, disabled: true });
  readonly buttons = new Map<Action, GuiButton>();
  readonly desk: GuiRect = { x: 12, y: 120, width: 1000, height: 600 };
  private readonly slots = new Map<GuiElement, GuiRect>();
  private readonly controls: Array<{ node: GuiElement; width: number }> = [];
  private readonly top: GuiElement;
  private readonly bottom: GuiElement;
  private readonly title: GuiLabel;
  private readonly help: GuiLabel;
  private imageAspect = 1.5;
  private busy = false;
  constructor(engine: HaiyueEngine, world: World, action: (action: Action) => void) {
    super(engine, world, CHARS + '自动保存正在失败下次操作将重试…', 1280, 800);
    this.root.theme.fontSize = 14;
    this.top = this.add(new GuiElement({ disabled: true, style: { backgroundColor: '#16353c' } }));
    this.bottom = this.add(new GuiElement({ disabled: true, style: { backgroundColor: '#16353c' } }));
    this.title = this.text('拾光拼图 / JIGSAW', 26, '#f5dfb0');
    this.stats = this.text('', 14, '#b7d6ce');
    this.status = this.text('拖动拼块，松开吸附', 13, '#f5dfb0');
    this.help = this.text('拖动拼块 / 空白处平移 / 滚轮缩放', 11, '#a8bfc0');
    const button = (key: Action, text: string, width: number, top = false) => {
      const node = this.add(new GuiButton({ id: key, text, onClick: () => action(key), style: { backgroundColor: key === 'restart' ? '#d9b873' : '#28505a', color: key === 'restart' ? '#19383d' : '#f6eee0', padding: 4, radius: 7 } }));
      this.buttons.set(key, node); if (top) this.controls.push({ node, width }); return node;
    };
    button('upload', '上传图片', 112, true);
    const select = (suffix: string, value: number) => {
      const node = this.add(new GuiSelect({ value, options: Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1} ${suffix}` })), optionHeight: 30, maxVisibleOptions: 4,
        style: { backgroundColor: '#28505a', color: '#ffffff', borderColor: '#598080' }, onChange: () => this.settingsChanged() }));
      this.controls.push({ node, width: 88 }); return node;
    };
    this.rows = select('行', 4); this.cols = select('列', 5);
    this.rotation = this.add(new GuiCheckbox({ label: '允许旋转', checked: false, onChange: () => this.settingsChanged() }));
    this.controls.push({ node: this.rotation, width: 120 });
    button('restart', '开始新拼图', 128, true); button('preview', '原图', 68, true);
    button('left', '左转90°', 90); button('right', '右转90°', 90); button('scatter', '整理', 96);
    button('minus', '−', 40); button('fit', '适应', 56); button('plus', '+', 40);
    this.add(this.preview);
  }
  private add<T extends GuiElement>(node: T): T {
    const rect = { x: 0, y: 0, width: 0, height: 0 }; this.slots.set(node, rect);
    node.layout = () => Object.assign(node.rect, rect); this.root.add(node); return node;
  }
  private text(text: string, fontSize: number, color: string): GuiLabel {
    return this.add(new GuiLabel({ text, fontSize, disabled: true, textAlign: 'center', style: { color, padding: 0 } }));
  }
  private rect(node: GuiElement, x: number, y: number, width: number, height: number): void { Object.assign(this.slots.get(node)!, { x, y, width, height }); }
  private settingsChanged(): void { this.status.setText('设置后点「开始新拼图」'); }
  resize(width: number, height: number): void {
    const narrow = width < 600, short = height < 500, margin = 12, footer = short ? 78 : 94;
    this.title.setFontSize(width < 380 ? 16 : narrow ? 19 : short ? 21 : 26);
    this.rect(this.title, margin, short ? 2 : 10, narrow ? Math.min(190, width * .52 - margin) : 280, 38);
    this.rect(this.stats, width - (narrow ? 145 : 240) - margin, short ? 4 : 12, narrow ? 145 : 240, 34);
    let x = margin, y = short ? 42 : 60;
    for (const { node, width: w } of this.controls) {
      if (x + w > width - margin) { x = margin; y += short ? 38 : 42; }
      this.rect(node, x, y, w, short ? 30 : 34); x += w + 6;
    }
    const header = y + (short ? 40 : 48);
    this.rect(this.top, 0, 0, width, header);
    this.rect(this.bottom, 0, height - footer, width, footer);
    const keys: Action[] = ['left', 'right', 'scatter', 'minus', 'fit', 'plus'];
    const widths = narrow ? [68, 68, 60, 28, 44, 28] : [90, 90, 96, 40, 56, 40];
    if (width < 350) for (let i = 0; i < widths.length; i++) widths[i]! *= (width - 54) / 296;
    x = (width - widths.reduce((a, b) => a + b, 0) - 30) / 2;
    keys.forEach((key, index) => { this.rect(this.buttons.get(key)!, x, height - footer + (short ? 4 : 10), widths[index]!, short ? 28 : 32); x += widths[index]! + 6; });
    this.rect(this.status, margin, height - (short ? 42 : 47), width - margin * 2, 23);
    this.rect(this.help, margin, height - (short ? 20 : 24), width - margin * 2, short ? 16 : 20);
    Object.assign(this.desk, { x: margin, y: header + 8, width: width - 2 * margin, height: Math.max(24, height - header - footer - 16) });
    const previewWidth = Math.min(580, this.desk.width * .9, this.desk.height * .9 * this.imageAspect), previewHeight = previewWidth / this.imageAspect;
    this.rect(this.preview, width / 2 - previewWidth / 2, this.desk.y + (this.desk.height - previewHeight) / 2, previewWidth, previewHeight);
    this.root.root.markDirty();
  }
  setImage(image: HTMLCanvasElement): void { this.preview.setSource(image); this.imageAspect = image.width / image.height; }
  setSaveStatus(status: AutoSaveStatus): void {
    this.help.setText(status === 'saving' ? '正在自动保存…' : status === 'saved' ? '已自动保存 · 拖动拼块 / 滚轮缩放'
      : status === 'error' ? '自动保存失败 · 下次操作将重试' : '拖动拼块 / 空白处平移 / 滚轮缩放');
  }
  setBusy(busy: boolean): void {
    this.busy = busy; this.rows.setDisabled(busy); this.cols.setDisabled(busy); this.rotation.setDisabled(busy);
    for (const button of this.buttons.values()) button.setDisabled(busy);
  }
  setRotationEnabled(enabled: boolean): void { for (const key of ['left', 'right'] as const) this.buttons.get(key)!.setDisabled(this.busy || !enabled); }
  togglePreview(): void { this.preview.setVisible(!this.preview.visible); }
  blocks(x: number, y: number): boolean {
    if (this.preview.visible) return true;
    if ([this.rows, this.cols].some(select => select.open && select.containsPointIncludingPopup(x, y))) return true;
    return y < this.desk.y || y > this.desk.y + this.desk.height;
  }
}
