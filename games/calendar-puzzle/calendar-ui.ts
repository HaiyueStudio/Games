import { GuiButton, GuiElement, GuiLabel, type GuiRoot } from '@haiyue/engine/gui';
import { CALENDAR_STYLE, type CalendarSkin } from './calendar-style';
import { CALENDAR_COPY, type CalendarLanguage } from './locale';
import { calendarDateKey, calendarMonthCells, shiftCalendarMonth } from './model';
import { calendarLayout } from './viewport';

type Layout = ReturnType<typeof calendarLayout>;
type Rect = { x: number; y: number; width: number; height: number };
export class CalendarHistoryView {
  private readonly controls: GuiElement[] = [];
  private readonly days: GuiButton[] = [];
  private readonly stars: GuiLabel[] = [];
  private readonly labels: Array<() => void> = [];
  private completed = new Set<string>();
  private starred = new Set<string>();
  private selected = '';
  year = 2026;
  month = 1;
  visible = false;
  constructor(private readonly options: {
    skin?: () => CalendarSkin; root: GuiRoot; layout: () => Layout; language: () => CalendarLanguage;
    register: (id: string, element: GuiElement) => void;
    choose: (year: number, month: number, day: number) => void; close: () => void;
  }) {
    const area = () => options.layout().board;
    const place = <T extends GuiElement>(id: string, control: T, rect: () => Rect): T => {
      control.layout = () => { control.rect = rect(); };
      options.root.add(control); this.controls.push(control); options.register(id, control); return control;
    };
    const label = (id: string, text: () => string, rect: () => Rect, size: number) => {
      const control = place(id, new GuiLabel({ text: text(), textAlign: 'center', style: {} }), rect);
      control.layout = () => { control.rect = rect(); control.setFontSize(size * options.layout().scale); };
      this.labels.push(() => control.setText(text()));
      return control;
    };
    const button = (id: string, text: () => string, rect: () => Rect, action: () => void) => {
      const control = place(id, new GuiButton({ text: text(), onClick: action }), rect);
      this.labels.push(() => { control.text = text(); control.markDirty(); }); return control;
    };
    // Plain GuiElement renders a fill, not borderColor. Draw both layers explicitly
    // so the inset cannot cover the straight edges of the underlying board frame.
    const frame = this.skin.panel;
    const outer = place('calendarPanel', new GuiElement({ style: { backgroundColor: frame.border } }),
      () => { outer.style.radius = frame.radius * options.layout().scale; return { x: area().x - 14, y: area().y - 14, width: 536, height: 610 }; });
    const inner = place('calendarPanelFill', new GuiElement({ style: { backgroundColor: frame.background } }),
      () => { inner.style.radius = (frame.radius - frame.borderWidth) * options.layout().scale; return { x: area().x - 14 + frame.borderWidth, y: area().y - 14 + frame.borderWidth, width: 536 - frame.borderWidth * 2, height: 610 - frame.borderWidth * 2 }; });
    label('calendarTitle', () => `${this.year} / ${this.copy.months[this.month - 1]}`, () => ({ x: area().x + 106, y: area().y + 4, width: 296, height: 46 }), 27);
    for (const [id, text, offset, x] of [['previousYear','«',-12,0],['previousMonth','‹',-1,53],['nextMonth','›',1,402],['nextYear','»',12,455]] as const) {
      button(id, () => text, () => ({ x: area().x + x, y: area().y + 4, width: 48, height: 46 }), () => {
        Object.assign(this, shiftCalendarMonth(this.year, this.month, offset)); this.refresh();
      });
    }
    for (let i = 0; i < 7; i++) label(`week${i}`, () => this.copy.weekdays[i]!, () => ({ x: area().x + i * 74, y: area().y + 54, width: 64, height: 28 }), 20);
    for (let i = 0; i < 42; i++) {
      const control = place(`calendarDay${i}`, new GuiButton({ onClick: () => {
        const day = calendarMonthCells(this.year, this.month)[i];
        if (day) options.choose(this.year, this.month, day);
      } }), () => ({ x: area().x + i % 7 * 74, y: area().y + 88 + Math.floor(i / 7) * 74, width: 64, height: 64 }));
      this.days.push(control);
      const star = label(`calendarStar${i}`, () => '★', () => ({ x: area().x + i % 7 * 74 + 44, y: area().y + 88 + Math.floor(i / 7) * 74 + 2, width: 18, height: 18 }), 17);
      star.disabled = true;
      star.setStyle({ color: '#b77718' });
      this.stars.push(star);
    }
    place('completedLegend', new GuiElement({ style: { backgroundColor: this.skin.completed, radius: 5 } }), () => ({ x: area().x + 198, y: area().y + 479, width: 22, height: 22 }));
    label('historyCount', () => `${this.copy.cleared} · ${this.completed.size}`, () => ({ x: area().x + 234, y: area().y + 472, width: 264, height: 36 }), 21).setTextAlign('left');
    button('calendarToday', () => this.copy.today, () => ({ x: area().x, y: area().y + 532, width: 152, height: 50 }), () => {
      const now = new Date(); options.choose(now.getFullYear(), now.getMonth() + 1, now.getDate());
    });
    button('calendarBack', () => this.copy.back, () => ({ x: area().x + 170, y: area().y + 532, width: 338, height: 50 }), options.close);
    this.setVisible(false);
  }
  private get skin() { return this.options.skin?.() ?? CALENDAR_STYLE; }
  private get copy() { return CALENDAR_COPY[this.options.language()]; }
  open(year: number, month: number, day: number, completed: readonly string[], starred: readonly string[] = []): void {
    this.year = year; this.month = month; this.selected = calendarDateKey(year, month, day);
    this.completed = new Set(completed); this.starred = new Set(starred); this.setVisible(true);
  }
  setVisible(visible: boolean): void {
    this.visible = visible; for (const control of this.controls) control.setVisible(visible); this.refresh();
  }
  refresh(): void {
    for (const update of this.labels) update();
    calendarMonthCells(this.year, this.month).forEach((day, i) => {
      const button = this.days[i]!; button.setVisible(this.visible && day !== null);
      this.stars[i]!.setVisible(this.visible && day !== null && this.starred.has(calendarDateKey(this.year, this.month, day)));
      if (!day) return;
      const key = calendarDateKey(this.year, this.month, day), completed = this.completed.has(key);
      button.text = String(day);
      const selected = key === this.selected;
      button.setStyle({ backgroundColor: completed ? this.skin.completed : selected ? this.skin.selected.background : this.skin.cell.background, borderColor: selected ? this.skin.selected.border : this.skin.cell.border, color: selected ? this.skin.selected.text : this.skin.cell.text, radius: this.skin.cell.radius * this.options.layout().scale });
      button.markDirty();
    });
  }
  snapshot() { return { year: this.year, month: this.month, cells: calendarMonthCells(this.year, this.month).map(day => day ? { day, completed: this.completed.has(calendarDateKey(this.year, this.month, day)), starred: this.starred.has(calendarDateKey(this.year, this.month, day)) } : null) }; }
}
