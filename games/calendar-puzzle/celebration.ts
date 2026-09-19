import { GuiButton, GuiElement, GuiImage, GuiLabel, type GuiRoot } from '@haiyue/engine/gui';
import { CALENDAR_COPY, type CalendarLanguage } from './locale';
import { calendarLayout } from './viewport';

type Rect = { x: number; y: number; width: number; height: number };
/** A single cached icon and a fixed pool of GUI particles; no per-frame texture uploads. */
export class CalendarCelebration {
  private readonly controls: GuiElement[] = [];
  private readonly particles: Array<{ control: GuiElement; rect: Rect; vx: number; vy: number; delay: number; color: string }> = [];
  private readonly captions: Array<() => void> = [];
  private thumbRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private startedAt = 0;
  private animating = false;
  visible = false;
  constructor(private readonly options: {
    root: GuiRoot; layout: () => ReturnType<typeof calendarLayout>; language: () => CalendarLanguage;
    canvas: (width: number, height: number) => HTMLCanvasElement;
    texture: ((canvas: HTMLCanvasElement, key: string) => unknown) | undefined;
    register: (id: string, control: GuiElement) => void;
    close: (history: boolean) => void;
  }) {
    const panel = () => ({ x: (options.layout().width - 580) / 2, y: (options.layout().height - 480) / 2, width: 580, height: 480 });
    const place = <T extends GuiElement>(id: string, control: T, rect: () => Rect): T => {
      control.layout = () => { control.rect = rect(); };
      options.root.add(control); options.register(id, control); this.controls.push(control); return control;
    };
    place('victoryBackdrop', new GuiElement({ style: { backgroundColor: 'rgba(232,247,236,0.40)', radius: 0 } }), () => ({ x: 0, y: 0, width: options.layout().width, height: options.layout().height }));
    place('victoryPanel', new GuiElement({ style: { backgroundColor: '#fafff7', borderColor: '#b0d8b4', radius: 30 } }), panel);
    const colors = ['#f5bb44','#48b9a5','#ef7776','#8d78e5','#61b9e2','#91ca6e'];
    for (let i = 0; i < 72; i++) {
      const rect = { x: 0, y: 0, width: 8 + i % 5, height: 7 + i % 9 };
      const color = colors[i % colors.length]!;
      const control = place(`confetti${i}`, new GuiElement({ disabled: true, style: { backgroundColor: color, radius: i % 3 === 0 ? 8 : 2 } }), () => rect);
      const angle = -Math.PI * (0.12 + (i * 0.61803398875 % 1) * 0.76), speed = 190 + (i * 73 % 260);
      this.particles.push({ control, rect, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, delay: (i % 3) * 0.12, color });
    }
    const canvas = options.canvas(384, 384); canvas.width = 384; canvas.height = 384;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Victory icon needs Canvas 2D.');
    ctx.scale(1.5, 1.5);
    ctx.fillStyle = '#e3f4d4'; ctx.beginPath(); ctx.arc(128,128,112,0,Math.PI*2); ctx.fill();
    ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.strokeStyle = '#ae7326'; ctx.fillStyle = '#ffd276';
    // Raised thumb, folded fingers and rounded palm, with a contrasting cuff.
    ctx.beginPath(); ctx.moveTo(80,122); ctx.bezierCurveTo(105,112,118,91,121,55);
    ctx.bezierCurveTo(122,35,150,36,153,57); ctx.bezierCurveTo(156,78,147,93,143,104);
    ctx.lineTo(197,104); ctx.bezierCurveTo(215,104,218,119,211,132);
    ctx.lineTo(198,183); ctx.bezierCurveTo(195,198,186,207,168,207);
    ctx.lineTo(110,207); ctx.bezierCurveTo(99,207,89,198,80,195); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#d9983e'; ctx.lineWidth = 3;
    for (let i=0;i<3;i++) { ctx.beginPath(); ctx.moveTo(174,131+i*22); ctx.lineTo(208-i*5,131+i*22); ctx.stroke(); }
    ctx.fillStyle = '#218c7e'; ctx.strokeStyle = '#176559';
    ctx.beginPath(); ctx.moveTo(43,123); ctx.lineTo(79,123); ctx.lineTo(79,209); ctx.lineTo(43,209); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff5c7'; ctx.beginPath(); ctx.arc(61,191,5,0,Math.PI*2); ctx.fill();
    const source = options.texture?.(canvas, 'calendar-victory-thumb') ?? canvas;
    place('victoryThumb', new GuiImage({ source: source as HTMLCanvasElement | GPUTexture, disabled: true }), () => this.thumbRect);
    const label = (id: string, caption: () => string, y: number, size: number) => {
      const control = place(id, new GuiLabel({ text: caption(), textAlign: 'center', style: { color: '#245c47' } }), () => ({ x: panel().x + 24, y: panel().y + y, width: 532, height: 48 }));
      control.layout = () => { control.rect = { x: panel().x + 24, y: panel().y + y, width: 532, height: 48 }; control.setFontSize(size * options.layout().scale); };
      this.captions.push(() => control.setText(caption()));
    };
    label('victoryTitle', () => this.copy.won, 276, 38);
    label('victoryRecorded', () => this.copy.recorded, 326, 22);
    for (const [id, history, x] of [['victoryContinue',false,30],['victoryHistory',true,297]] as const) {
      const control = place(id, new GuiButton({ text: history ? this.copy.viewHistory : this.copy.continue, onClick: () => options.close(history) }), () => ({ x: panel().x+x, y:panel().y+398, width:253, height:56 }));
      this.captions.push(() => { control.text = history ? this.copy.viewHistory : this.copy.continue; control.markDirty(); });
    }
    this.hide();
  }
  private get copy() { return CALENDAR_COPY[this.options.language()]; }
  show(): void {
    this.visible = true; this.animating = true; this.startedAt = performance.now();
    this.captions.forEach(update => update()); this.controls.forEach(control => control.setVisible(true)); this.update();
  }
  hide(): void { this.visible = false; this.animating = false; this.controls.forEach(control => control.setVisible(false)); }
  update(): void {
    if (!this.visible) return;
    const t = Math.min(4, (performance.now() - this.startedAt) / 1000), layout = this.options.layout();
    const progress = Math.min(1, t / 0.65), c = progress - 1;
    const size = 238 * (1 + 2.70158 * c * c * c + 1.70158 * c * c);
    this.thumbRect = { x: layout.width / 2 - size / 2, y: layout.height / 2 - 210 + (238-size)/2, width: size, height: size };
    if (!this.animating) return;
    for (const p of this.particles) {
      const age = t - p.delay;
      p.control.setVisible(age >= 0 && age < 3.2);
      p.rect.x = layout.width / 2 + p.vx * age + Math.sin(age * 6 + p.vx) * 15;
      p.rect.y = layout.height / 2 - 40 + p.vy * age + 160 * age * age;
    }
    this.options.root.root.markDirty();
    if (t >= 4) this.animating = false;
  }
}
