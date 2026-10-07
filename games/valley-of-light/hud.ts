import { Entity, type Scene } from '@haiyue/engine';
import { GuiButton, GuiElement, GuiLabel, GuiRoot } from '@haiyue/engine/gui';
import { CHAPTERS, TEXT } from './story';
import { joins, type PuzzleState } from './rules';

const INK = '#304f53', MUTED = '#72847c', GOLD = '#a77637', TEAL = '#357e79';
type Box = [number, number, number, number];
export class ValleyHud {
  readonly root = new GuiRoot({ theme: { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 14, colors: { text: INK, textMuted: MUTED, primary: TEAL, danger: GOLD, background: '#e9eee7', surface: '#faf9ef', border: '#d4ddd2', hover: '#dbe6dc', active: '#c4d9cd', disabled: '#9caea5' } } });
  private readonly elements: Array<{ element: GuiElement; box: (w: number, h: number) => Box }> = [];
  private readonly message: GuiLabel;
  private readonly links: GuiLabel;
  private readonly action: GuiButton;
  private readonly journal: GuiElement;
  private readonly journalTitle: GuiLabel;
  private readonly journalSubtitle: GuiLabel;
  private readonly journalLines: GuiLabel[] = [];
  private readonly journalNote: GuiLabel;
  private readonly turnTag: GuiLabel;
  private readonly slideTag: GuiLabel;
  private readonly stats: GuiLabel;
  private page = 0;
  private width = 1440;
  private currentMessage: string = TEXT.objective;
  journalOpen = false;
  constructor(scene: Scene, actions: { walk: () => void; reset: () => void; hint: () => void; loadMap: () => void }) {
    scene.add(new Entity('Engine GUI · valley journal and HUD').addComponent(this.root));
    this.place(new GuiLabel({ text: TEXT.english, fontSize: 11, style: { color: MUTED } }), (w) => [w < 700 ? 22 : 38, 20, 340, 24]);
    this.place(new GuiLabel({ text: TEXT.title, fontSize: 38, style: { color: INK } }), (w) => [w < 700 ? 22 : 36, 49, 250, 58]);
    this.place(new GuiLabel({ text: TEXT.subtitle, fontSize: 14, style: { color: GOLD } }), (w) => [w < 700 ? 24 : 40, 116, 270, 26]);
    const quote = this.place(new GuiLabel({ text: TEXT.quote, fontSize: 13, style: { color: MUTED } }), () => [38, 165, 330, 25]);
    const rule = this.place(new GuiElement({ style: { backgroundColor: '#bacac0' } }), () => [40, 155, 42, 1]);
    const instruction1 = this.place(new GuiLabel({ text: '01   左右拖拽圆环，转动金桥', fontSize: 12, style: { color: GOLD } }), () => [40, 224, 260, 28]);
    const instruction2 = this.place(new GuiLabel({ text: '02   沿着轨道，推移青桥', fontSize: 12, style: { color: TEAL } }), () => [40, 255, 260, 28]);
    const instruction3 = this.place(new GuiLabel({ text: '03   点击相连的道路，向光出发', fontSize: 12, style: { color: MUTED } }), () => [40, 286, 260, 28]);
    const responsive = (w: number) => { for (const element of [quote, rule, instruction1, instruction2, instruction3]) element.setVisible(w > 1100); };
    this.resizeExtra = responsive;
    this.place(new GuiButton({ text: '旅途手记', variant: 'default', onClick: () => this.toggleJournal(), style: { radius: 20 } }), (w) => [w - 132, w < 700 ? 64 : 30, 106, 38]);
    this.place(new GuiButton({ text: '载入地图', variant: 'default', onClick: actions.loadMap, style: { radius: 20 } }), (w) => [w < 700 ? 24 : w-250, w < 700 ? 162 : 30, 106, 38]);
    this.place(new GuiButton({ text: '重新开始', variant: 'default', onClick: actions.reset }), (w) => [w - 132, w < 700 ? 108 : 76, 106, 34]);
    this.place(new GuiElement({ style: { backgroundColor: '#f8f8ef', borderColor: '#d5dfd3', radius: 16 } }), (w, h) => [w < 700 ? 14 : 32, h - (w < 700 ? 146 : 120), w - (w < 700 ? 28 : 64), w < 700 ? 128 : 94]);
    this.links = this.place(new GuiLabel({ fontSize: 12, style: { color: TEAL } }), (w, h) => [w < 700 ? 28 : 52, h - (w < 700 ? 137 : 111), w - 100, 25]);
    this.message = this.place(new GuiLabel({ text: TEXT.objective, fontSize: 14, style: { color: INK } }), (w, h) => [w < 700 ? 28 : 52, h - (w < 700 ? 107 : 80), w < 700 ? w - 56 : w - 330, 28]);
    this.action = this.place(new GuiButton({ text: '启程', variant: 'primary', onClick: actions.walk, style: { radius: 22, backgroundColor: TEAL, color: '#fffdf1' } }), (w, h) => [w - (w < 700 ? 140 : 184), h - (w < 700 ? 64 : 94), w < 700 ? 106 : 126, 44]);
    this.place(new GuiButton({ text: '提示', variant: 'default', onClick: actions.hint }), (w, h) => [w < 700 ? 26 : w - 262, h - (w < 700 ? 62 : 90), 66, 38]);
    this.stats = this.place(new GuiLabel({ fontSize: 11, style: { color: MUTED } }), (w, h) => [w < 700 ? 100 : 52, h - (w < 700 ? 57 : 49), 200, 20]);
    this.turnTag = this.root.add(new GuiLabel({ text: '01 / 转动', fontSize: 12, textAlign: 'center', style: { color: GOLD, backgroundColor: '#f7f4e9', radius: 12 } }));
    this.slideTag = this.root.add(new GuiLabel({ text: '02 / 平移', fontSize: 12, textAlign: 'center', style: { color: TEAL, backgroundColor: '#f0f6ed', radius: 12 } }));
    this.journal = this.place(new GuiElement({ visible: false, style: { backgroundColor: '#f7f7ed', borderColor: '#b9cec1', radius: 22 }, onPointerDown: e => e.stopPropagation() }), (w, h) => [Math.max(14, (w - 660) / 2), Math.max(20, (h - 430) / 2), Math.min(w - 28, 660), 430]);
    this.journal.add(new GuiLabel({ x: 28, y: 24, width: 200, height: 30, text: '旅途手记', fontSize: 13, style: { color: TEAL } }));
    this.journalTitle = this.journal.add(new GuiLabel({ x: 28, y: 80, width: '90%', height: 40, fontSize: 27 }));
    this.journalSubtitle = this.journal.add(new GuiLabel({ x: 28, y: 127, width: '90%', height: 30, fontSize: 16, style: { color: GOLD } }));
    for (let i = 0; i < 3; i++) this.journalLines.push(this.journal.add(new GuiLabel({ x: 28, y: 187 + i * 33, width: '91%', height: 30, fontSize: 14 })));
    this.journalNote = this.journal.add(new GuiLabel({ x: 28, y: 306, width: '90%', height: 28, fontSize: 12, style: { color: MUTED } }));
    this.journal.add(new GuiButton({ x: 24, y: 362, width: 88, height: 38, text: '上一页', variant: 'default', onClick: () => this.showPage(this.page - 1) }));
    this.journal.add(new GuiButton({ x: 119, y: 362, width: 88, height: 38, text: '下一页', variant: 'default', onClick: () => this.showPage(this.page + 1) }));
    this.journal.add(new GuiButton({ x: 218, y: 362, width: 102, height: 38, text: '返回关卡', variant: 'primary', style: { color: '#fffdf1' }, onClick: () => this.toggleJournal(false) }));
    this.showPage(0);
  }
  private resizeExtra: (w: number) => void = () => {};
  private place<T extends GuiElement>(element: T, box: (w: number, h: number) => Box): T {
    this.root.add(element); this.elements.push({ element, box }); return element;
  }
  resize(w: number, h: number): void {
    this.width = w;
    for (const { element, box } of this.elements) {
      const [x, y, width, height] = box(w, h);
      element.layout = () => { element.rect = { x, y, width, height }; for (const child of element.children) child.layout(element.rect); };
      element.markDirty();
    }
    this.journalLines.forEach(label => label.setFontSize(w < 700 ? 11 : 14));
    this.resizeExtra(w);
    this.setMessage(this.currentMessage);
  }
  tags(turn: [number, number], slide: [number, number]): void {
    for (const [element, point] of [[this.turnTag, turn], [this.slideTag, slide]] as const) {
      element.layout = () => {
        const small = this.width < 700, second = element === this.slideTag;
        element.rect = { x: point[0] - (small ? (second ? 4 : 58) : 46), y: point[1] + (small ? (second ? 51 : 24) : 22), width: small ? 80 : 92, height: 27 };
      };
      element.markDirty();
    }
  }
  setMessage(message: string): void {
    this.currentMessage = message;
    const short: Record<string,string> = {
      [TEXT.objective]: '拖拽金桥转动，拖拽青桥平移。',
      [TEXT.ready]: '道路已相连。点击光门，启程。',
      [TEXT.walking]: '微正走过一条地图上没有的路。',
      [TEXT.ending]: '微走出了山谷。远方，在等一个问题。',
      [TEXT.occupied]: '先离开桥梁，再移动它。',
    };
    this.message.setText(this.width < 700 ? short[message] ?? message : message);
  }
  update(s: PuzzleState, walking: boolean, saved: string): void {
    this.links.setText(`金桥 ${joins(s).some(j => j.from === 'turn') ? '相连' : '断开'}   /   青桥 ${joins(s).some(j => j.to === 'gate') ? '相连' : '断开'}`);
    this.stats.setText(`${s.moves} 次操作  ·  ${walking ? '行走' : '站立'}  ·  ${saved}`);
    this.action.setDisabled(walking); this.action.text = s.completed ? '再走一次' : '启程'; this.action.markDirty();
  }
  toggleJournal(force = !this.journalOpen): void { this.journalOpen = force; this.journal.setVisible(force); this.turnTag.setVisible(!force); this.slideTag.setVisible(!force); }
  private showPage(index: number): void {
    this.page = (index + CHAPTERS.length) % CHAPTERS.length;
    const chapter = CHAPTERS[this.page]!;
    this.journalTitle.setText(chapter.title); this.journalSubtitle.setText(chapter.subtitle);
    chapter.body.forEach((line, i) => this.journalLines[i]!.setText(line)); this.journalNote.setText(chapter.note);
  }
  hits(x: number, y: number, h: number, w: number): boolean { return this.journalOpen || y < (w < 700 ? 153 : 155) || y > h - (w < 700 ? 150 : 124); }
}

