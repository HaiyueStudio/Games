type Position = { clientX: number; clientY: number };
type GestureResult = 'tap' | 'double-tap' | 'drag' | 'hold' | 'none';
interface Press {
  piece: string;
  start: Position;
  time: number;
  touch: boolean;
  dragging: boolean;
}
interface Tap { piece: string; point: Position; time: number; touch: boolean }

/** Distances are CSS pixels / native DIP, independent of the board's render scale. */
export class CalendarPieceGesture {
  private press: Press | null = null;
  private lastTap: Tap | null = null;
  begin(piece: string, point: Position, time: number, pointerType: string): void {
    const touch = pointerType !== 'mouse';
    if (this.lastTap?.piece !== piece || this.lastTap.touch !== touch) this.lastTap = null;
    this.press = { piece, start: { clientX: point.clientX, clientY: point.clientY }, time, touch, dragging: false };
  }
  move(point: Position): boolean {
    const press = this.press;
    if (!press) return false;
    if (Math.hypot(point.clientX - press.start.clientX, point.clientY - press.start.clientY) > (press.touch ? 12 : 4)) {
      press.dragging = true;
      this.lastTap = null;
    }
    // Crossing the drag threshold once remains a drag even after returning to the origin.
    return press.dragging;
  }
  end(point: Position, time: number): GestureResult {
    const press = this.press;
    if (!press) return 'none';
    this.move(point);
    this.press = null;
    if (press.dragging) return 'drag';
    if (time - press.time > 500) { this.lastTap = null; return 'hold'; }
    const last = this.lastTap;
    if (last && last.piece === press.piece && last.touch === press.touch &&
        time - last.time <= (press.touch ? 420 : 320) &&
        Math.hypot(point.clientX - last.point.clientX, point.clientY - last.point.clientY) <= (press.touch ? 32 : 14)) {
      this.lastTap = null;
      return 'double-tap';
    }
    this.lastTap = { piece: press.piece, point: { clientX: point.clientX, clientY: point.clientY }, time, touch: press.touch };
    return 'tap';
  }
  cancel(): void { this.press = null; this.lastTap = null; }
}
