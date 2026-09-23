import { GuiElement, type GuiButton, type GuiRoot } from '@haiyue/engine/gui';

/** Calendar's network-action treatment: theme-colored activity dots and immediate tap feedback. */
export class CalendarNetworkButtons {
  private readonly entries = new Map<GuiButton, { dots: GuiElement[]; loading: boolean; step: number }>();
  constructor(private readonly root: GuiRoot) {}
  register(button: GuiButton): void {
    const dots = Array.from({ length: 8 }, (_, index) => {
      const dot = new GuiElement({ disabled: true, visible: false, style: { radius: 3, backgroundColor: '#17847b' } });
      dot.layout = () => {
        const r = button.rect, angle = index * Math.PI / 4 - Math.PI / 2;
        dot.rect = { x: r.x + r.width / 2 + Math.cos(angle) * 13 - 3,
          y: r.y + r.height / 2 + Math.sin(angle) * 13 - 3, width: 6, height: 6 };
      };
      this.root.add(dot); return dot;
    });
    this.entries.set(button, { dots, loading: false, step: -1 });
  }
  set(button: GuiButton, loading: boolean): void {
    const entry = this.entries.get(button);
    if (!entry) return;
    entry.loading = loading;
    for (const dot of entry.dots) dot.setVisible(loading && button.visible);
    if (loading) { button.disabled = true; button.setText(''); }
    button.markDirty();
  }
  loading(button: GuiButton): boolean { return this.entries.get(button)?.loading ?? false; }
  get isAnimating(): boolean { return [...this.entries].some(([button, entry]) => button.visible && entry.loading); }
  update(time: number): void {
    const step = Math.floor(time / 90) % 8;
    const rgb = (this.root.theme?.colors.primary ?? '#17847b').slice(1).match(/../g)!.map(value => parseInt(value, 16)).join(',');
    for (const [button, entry] of this.entries) {
      if (!button.visible || !entry.loading || entry.step === step) continue;
      entry.step = step;
      entry.dots.forEach((dot, index) => dot.setStyle({ backgroundColor: `rgba(${rgb},${1 - ((step - index + 8) % 8) * .1})` }));
    }
  }
}

/** Leading-edge debounce: never delay or replay a purchase/ad tap. */
export function calendarNetworkAction(button: () => GuiButton, action: () => void, now = () => performance.now()): () => void {
  let last = -Infinity;
  return () => {
    const control = button(), time = now();
    if (!control.visible || control.disabled || time - last < 400) return;
    last = time; action();
  };
}
