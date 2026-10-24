import { GameHud } from '../../shared/ui/GameHud';
import type { HaiyueEngine, World } from '@haiyue/engine';
import { GuiButton, GuiElement, GuiLabel, type GuiRect, type GuiStyle } from '@haiyue/engine/gui';

const PANELS = {
  status: [30, 175, 716, 224], counter: [792, 175, 720, 224],
  button: [30, 627, 716, 213], notice: [792, 626, 720, 214],
} as const;
const CONTROLS = 'Left: reveal   Right: flag   Left + Right: open neighbors   Drag: orbit   Wheel: zoom';

export class MinesHud extends GameHud {
  readonly elMines: GuiLabel;
  readonly elFlags: GuiLabel;
  readonly elOpen: GuiLabel;
  readonly elTotal: GuiLabel;
  readonly elMessage: GuiLabel;
  private readonly header: GuiElement;
  private readonly notice: GuiElement;
  private readonly title: GuiLabel;
  private readonly subtitle: GuiLabel;
  private readonly restart: GuiButton;
  private readonly help: GuiButton;
  private readonly cards: Array<{ panel: GuiElement; label: GuiLabel; value: GuiLabel }> = [];
  private readonly slots = new Map<GuiElement, GuiRect>();
  private messageRemaining = 0;
  private stickyMessage = false;
  private readonly skinNodes: Array<{ node: GuiElement; panel: keyof typeof PANELS }> = [];

  constructor(engine: HaiyueEngine, world: World, restart: () => void) {
    super(engine, world, '', 1280, 800);
    this.header = this.panel('status');
    this.title = this.text('ORBIT / MINES', 20, '#edf9fb');
    this.subtitle = this.text('ICOSAHEDRON  /  SECTOR 162', 10, '#84bdcc');
    const counter = (text: string) => {
      const card = { panel: this.panel('counter'), label: this.text(text, 10, '#8ab8c9'), value: this.text('0', 24, '#f6e3ab') };
      this.cards.push(card); return card.value;
    };
    this.elMines = counter('MINES'); this.elFlags = counter('FLAGS');
    this.elOpen = counter('OPEN'); this.elTotal = counter('SAFE');
    this.restart = this.add(new GuiButton({ id: 'restart', text: 'Restart', onClick: restart,
      style: { color: '#fff2cc', backgroundColor: '#173d4d', hoverColor: '#ffffff', hoverBackgroundColor: '#286179', padding: 4 } }));
    this.skinNodes.push({ node: this.restart, panel: 'button' });
    this.help = this.add(new GuiButton({ id: 'controls', text: '?', onClick: () => this.showMessage(CONTROLS, 6500),
      style: { color: '#bfe8ef', backgroundColor: '#173d4d', padding: 2 } }));
    this.skinNodes.push({ node: this.help, panel: 'counter' });
    this.notice = this.panel('notice');
    this.elMessage = this.text('', 13, '#daedf1');
    this.notice.setVisible(false); this.elMessage.setVisible(false);
    const resize = () => this.resize(engine.displayWidth, engine.displayHeight);
    engine.on('resize', resize); resize();
    world.addRuntimeIntegration({ onDetach: () => engine.off('resize', resize) });
  }

  async loadSkin(): Promise<void> {
    const source = new Image(); source.src = new URL('./assets/orbit-gui.png', location.href).href;
    await source.decode();
    for (const { node, panel } of this.skinNodes) {
      const [x, y, width, height] = PANELS[panel];
      const nineSlice: NonNullable<GuiStyle['nineSlice']> = {
        source, sourceWidth: width, sourceHeight: height, cuts: [76, 58, 76, 58], pixelRatio: node === this.help ? 6 : 4,
        contentInsets: { left: 6, right: 6, top: 3, bottom: 3 },
        uv: [x / source.naturalWidth, y / source.naturalHeight, width / source.naturalWidth, height / source.naturalHeight],
      };
      node.setStyle({ nineSlice, backgroundColor: 'transparent' });
    }
  }

  private add<T extends GuiElement>(node: T): T {
    const rect = { x: 0, y: 0, width: 0, height: 0 }; this.slots.set(node, rect);
    node.layout = () => Object.assign(node.rect, rect); return this.root.add(node);
  }
  private panel(panel: keyof typeof PANELS): GuiElement {
    const node = this.add(new GuiElement({ disabled: true, pointerFilter: 'ignore', style: { backgroundColor: '#102534' } }));
    this.skinNodes.push({ node, panel }); return node;
  }
  private text(text: string, fontSize: number, color: string): GuiLabel {
    return this.add(new GuiLabel({ text, fontSize, disabled: true, pointerFilter: 'ignore', textAlign: 'center',
      style: { color, backgroundColor: 'transparent', padding: 0 } }));
  }
  private rect(node: GuiElement, x: number, y: number, width: number, height: number): void {
    Object.assign(this.slots.get(node)!, { x, y, width, height });
  }

  private resize(width: number, height: number): void {
    const narrow = width < 650, short = height < 500;
    const margin = narrow ? 12 : 22, headerWidth = Math.min(1120, width - margin * 2), left = (width - headerWidth) / 2;
    const top = short ? 8 : 16, headerHeight = narrow ? 144 : 88;
    this.rect(this.header, left, top, headerWidth, headerHeight);
    this.rect(this.title, left + 16, top + 12, narrow ? 162 : 225, 28);
    this.title.setFontSize(narrow ? 17 : 20);
    this.rect(this.subtitle, left + 16, top + 39, narrow ? 162 : 225, 18);
    this.subtitle.setFontSize(narrow ? 8 : 10);
    this.rect(this.restart, left + headerWidth - (narrow ? 112 : 138), top + 17, narrow ? 90 : 108, 38);
    this.rect(this.help, left + headerWidth - (narrow ? 154 : 184), top + 17, 34, 38);
    const gap = narrow ? 6 : 8, cardWidth = narrow ? (headerWidth - 32 - 3 * gap) / 4 : Math.min(105, (headerWidth - 475) / 4);
    const cardLeft = narrow ? left + 16 : left + 255;
    this.cards.forEach((card, i) => {
      const x = cardLeft + i * (cardWidth + gap), y = top + (narrow ? 70 : 10);
      this.rect(card.panel, x, y, cardWidth, 66);
      this.rect(card.label, x + 6, y + 7, cardWidth - 12, 16);
      this.rect(card.value, x + 6, y + 23, cardWidth - 12, 32);
      card.value.setFontSize(narrow ? 23 : 26);
    });
    const noticeWidth = Math.min(880, width - margin * 2), noticeHeight = narrow ? 64 : 46;
    this.rect(this.notice, (width - noticeWidth) / 2, height - noticeHeight - 18, noticeWidth, noticeHeight);
    this.rect(this.elMessage, (width - noticeWidth) / 2 + 20, height - noticeHeight - 10, noticeWidth - 40, noticeHeight - 16);
    this.elMessage.setFontSize(narrow ? 11 : 13);
    this.root.root.markDirty();
  }

  showMessage(text: string, durationMs = 2800, sticky = false): void {
    this.messageRemaining = durationMs; this.stickyMessage = sticky;
    this.elMessage.setText(text); this.notice.setVisible(true); this.elMessage.setVisible(true);
    this.notice.setStyle({ opacity: 1 }); this.elMessage.setStyle({ opacity: 1 });
  }

  update(deltaMs: number): void {
    if (!this.notice.visible || this.stickyMessage) return;
    this.messageRemaining = Math.max(0, this.messageRemaining - Math.max(0, deltaMs));
    const opacity = Math.min(1, this.messageRemaining / 400);
    this.notice.setStyle({ opacity }); this.elMessage.setStyle({ opacity });
    if (this.messageRemaining === 0) { this.notice.setVisible(false); this.elMessage.setVisible(false); }
  }

  noticeSnapshot() { return { visible: this.notice.visible, text: this.elMessage.text, remaining: this.messageRemaining }; }
}
