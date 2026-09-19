import { GuiButton, GuiElement, GuiLabel, type GuiRoot } from '@haiyue/engine/gui';
import { CALENDAR_COPY, type CalendarLanguage } from './locale';
import { calendarDateKey, calendarMonthCells, shiftCalendarMonth } from './model';
import { calendarLayout } from './viewport';

type Layout = ReturnType<typeof calendarLayout>;
type Rect = { x: number; y: number; width: number; height: number };
export class CalendarHistoryView {
  private readonly controls: GuiElement[] = [];
  private readonly days: GuiButton[] = [];
  private readonly labels: Array<() => void> = [];
  private completed = new Set<string>();
  private selected = '';
  year = 2026;
  month = 1;
  visible = false;
  constructor(private readonly options: {
    root: GuiRoot; layout: () => Layout; language: () => CalendarLanguage;
    register: (id: string, element: GuiElement) => void;
    choose: (year: number, month: number, day: number) => void; close: () => void;
  }) {
    const area = () => options.layout().board;
    const place = <T extends GuiElement>(id: string, control: T, rect: () => Rect): T => {
      control.layout = () => { control.rect = rect(); };
      options.root.add(control); this.controls.push(control); options.register(id, control); return control;
    };
    const label = (id: string, text: () => string, rect: () => Rect, size: number) => {
      const control = place(id, new GuiLabel({ text: text(), textAlign: 'center', style: { color: '#416259' } }), rect);
      control.layout = () => { control.rect = rect(); control.setFontSize(size * options.layout().scale); };
      this.labels.push(() => control.setText(text()));
    };
    const button = (id: string, text: () => string, rect: () => Rect, action: () => void) => {
      const control = place(id, new GuiButton({ text: text(), onClick: action }), rect);
      this.labels.push(() => { control.text = text(); control.markDirty(); }); return control;
    };
    place('calendarPanel', new GuiElement({ style: { backgroundColor: '#f8fcf9', borderColor: '#b7d6c8', radius: 18 } }),
      () => ({ x: area().x - 14, y: area().y - 14, width: 536, height: 610 }));
    label('calendarTitle', () => `${this.year} / ${this.copy.months[this.month - 1]}`, () => ({ x: area().x + 106, y: area().y + 4, width: 296, height: 46 }), 27);
    for (const [id, text, offset, x] of [['previousYear','«',-12,0],['previousMonth','‹',-1,53],['nextMonth','›',1,402],['nextYear','»',12,455]] as const) {
      button(id, () => text, () => ({ x: area().x + x, y: area().y + 4, width: 48, height: 46 }), () => {
        Object.assign(this, shiftCalendarMonth(this.year, this.month, offset)); this.refresh();
      });
    }
    for (let i = 0; i < 7; i++) label(`week${i}`, () => this.copy.weekdays[i]!, () => ({ x: area().x + i * 73, y: area().y + 68, width: 64, height: 34 }), 20);
    for (let i = 0; i < 42; i++) {
      const control = place(`calendarDay${i}`, new GuiButton({ onClick: () => {
        const day = calendarMonthCells(this.year, this.month)[i];
        if (day) options.choose(this.year, this.month, day);
      } }), () => ({ x: area().x + i % 7 * 73, y: area().y + 114 + Math.floor(i / 7) * 57, width: 64, height: 49 }));
      this.days.push(control);
    }
    place('completedLegend', new GuiElement({ style: { backgroundColor: '#cfedce', radius: 5 } }), () => ({ x: area().x + 12, y: area().y + 466, width: 22, height: 22 }));
    label('historyCount', () => `${this.copy.cleared} · ${this.completed.size}`, () => ({ x: area().x + 40, y: area().y + 459, width: 450, height: 36 }), 21);
    button('calendarToday', () => this.copy.today, () => ({ x: area().x, y: area().y + 518, width: 152, height: 54 }), () => {
      const now = new Date(); options.choose(now.getFullYear(), now.getMonth() + 1, now.getDate());
    });
    button('calendarBack', () => this.copy.back, () => ({ x: area().x + 170, y: area().y + 518, width: 338, height: 54 }), options.close);
    this.setVisible(false);
  }
  private get copy() { return CALENDAR_COPY[this.options.language()]; }
  open(year: number, month: number, day: number, completed: readonly string[]): void {
    this.year = year; this.month = month; this.selected = calendarDateKey(year, month, day);
    this.completed = new Set(completed); this.setVisible(true);
  }
  setVisible(visible: boolean): void {
    this.visible = visible; for (const control of this.controls) control.setVisible(visible); this.refresh();
  }
  refresh(): void {
    for (const update of this.labels) update();
    calendarMonthCells(this.year, this.month).forEach((day, i) => {
      const button = this.days[i]!; button.setVisible(this.visible && day !== null);
      if (!day) return;
      const key = calendarDateKey(this.year, this.month, day), completed = this.completed.has(key);
      button.text = String(day);
      button.setStyle({ backgroundColor: completed ? '#cfedce' : '#ffffff', borderColor: key === this.selected ? '#17847b' : '#d6e5df', radius: 10 });
      button.markDirty();
    });
  }
  snapshot() { return { year: this.year, month: this.month, cells: calendarMonthCells(this.year, this.month).map(day => day ? { day, completed: this.completed.has(calendarDateKey(this.year, this.month, day)) } : null) }; }
}
