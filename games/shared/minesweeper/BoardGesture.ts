export type BoardAction = { cellId: number; kind: 'reveal' | 'flag' | 'chord' };
interface Press {
  x: number; y: number; pointerId: number; button: number; cellId: number | null;
  buttons: number; chord: boolean; dragged: boolean; consumed: boolean;
}

/** Mouse pointerdown/up bracket the whole gesture; mousedown/up report individual chord buttons. */
export class BoardGesture {
  private press: Press | null = null;
  get active(): boolean { return this.press !== null; }
  get dragging(): boolean { return this.press?.dragged ?? false; }
  get chording(): boolean { return this.press?.chord ?? false; }
  private readonly dragThreshold: number;
  constructor(dragThreshold = 6) { this.dragThreshold = dragThreshold; }

  begin(x: number, y: number, button: number, buttons: number, pointerId: number, cellId: number | null): void {
    if (this.press) {
      if (pointerId !== this.press.pointerId) this.press.dragged = true;
      else this.move(x, y, buttons);
      return;
    }
    if (button !== 0 && button !== 2) return;
    this.press = { x, y, button, buttons, pointerId, cellId, chord: (buttons & 3) === 3, dragged: false, consumed: false };
  }

  move(x: number, y: number, buttons: number): void {
    if (!this.press) return;
    this.press.chord ||= (buttons & 3) === 3;
    this.press.buttons = buttons;
    this.press.dragged ||= Math.hypot(x - this.press.x, y - this.press.y) > this.dragThreshold;
  }

  release(x: number, y: number, buttons: number, cellId: number | null): BoardAction | null {
    const press = this.press;
    if (!press) return null;
    this.move(x, y, buttons);
    // Some devices only expose both buttons in the release packet.
    press.chord ||= ((press.button === 0 ? 1 : 2) | buttons) === 3;
    let action: BoardAction | null = null;
    if (!press.consumed && !press.dragged && press.cellId !== null && press.cellId === cellId) {
      action = { cellId, kind: press.chord ? 'chord' : press.button === 2 ? 'flag' : 'reveal' };
    }
    press.consumed = true;
    if (buttons === 0) this.press = null;
    return action;
  }

  cancel(): void { this.press = null; }
}
