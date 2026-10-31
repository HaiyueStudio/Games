/** Shared input and motion rules for every board presentation. Coordinates are adapter-owned. */
export interface Point { x: number; y: number }
export interface Rect extends Point { w: number; h: number }
export const TURN_DURATION = 160;
export const SWAP_DURATION = 260;
export function easeOutCubic(t: number): number { return 1 - (1 - Math.max(0, Math.min(1, t))) ** 3; }
export function shortestRotationAngle(from: number, to: number): number {
  let delta = ((to - from) % 6 + 6) % 6; if (delta > 3) delta -= 6;
  return -delta * Math.PI / 3;
}
export function turnProgress(elapsed: number): number { return easeOutCubic(elapsed / TURN_DURATION); }
export function swapFrame(elapsed: number): { progress: number; eased: number; arc: number } {
  const progress = Math.max(0, Math.min(1, elapsed / SWAP_DURATION));
  return { progress, eased: easeOutCubic(progress), arc: Math.sin(progress * Math.PI) };
}
export function hitRect(point: Point | null, rect: Rect): boolean {
  return !!point && point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}
export function hitCurrentTile(point: Point | null, center: Point | null, radius: number): boolean {
  return !!point && !!center && Math.hypot(point.x - center.x, point.y - center.y) < radius * (2 / Math.sqrt(3)) * 1.18;
}
export function rotationButtonCenter(center: Point, direction: -1 | 1, scale = 1): Point {
  return { x: center.x + direction * 43.5 * scale, y: center.y + 46.5 * scale };
}
export function arrowFeedback(alpha: number, hover: number, visible: boolean, hovered: boolean, direction: number, now: number, pressed: number) {
  const hoverAmount = hover + (Number(hovered) - hover) * .2;
  const next = alpha + (Number(visible) - alpha) * .22, opacity = Math.abs(next) < .01 ? 0 : next;
  const press = Math.max(0, Math.min(1, (now - pressed) / 150)), pulse = Math.sin(press * Math.PI);
  return { alpha: opacity, hover: hoverAmount, scale: opacity * (1 + hoverAmount * .14) * (1 + pulse * .06),
    angle: -direction * ((.055 + Math.sin(now * .008) * .018) * hoverAmount + pulse * .18) };
}
interface BoardInput {
  ready(): boolean; token(): string;
  click(event: MouseEvent): void; move(event: PointerEvent): void; leave(): void;
  rotate(delta: number): void; swap(): void; confirm(): void; mode(): void; level(delta: number): void;
}
export function bindBoardInput(canvas: HTMLCanvasElement, input: BoardInput): () => void {
  const removers: (() => void)[] = [];
  const listen = (target: EventTarget, type: string, callback: EventListener, options?: AddEventListenerOptions) => {
    target.addEventListener(type, callback, options); removers.push(() => target.removeEventListener(type, callback, options));
  };
  let wheel = 0, token = input.token();
  listen(canvas, 'click', event => { if (input.ready()) input.click(event as MouseEvent); });
  listen(canvas, 'pointermove', event => input.move(event as PointerEvent));
  listen(canvas, 'pointerleave', () => input.leave());
  listen(window, 'blur', () => input.leave());
  listen(canvas, 'contextmenu', event => { event.preventDefault(); if (input.ready()) input.rotate(1); });
  listen(canvas, 'wheel', event => {
    event.preventDefault(); if (!input.ready()) return;
    if (token !== input.token()) { token = input.token(); wheel = 0; }
    wheel += (event as WheelEvent).deltaY;
    if (Math.abs(wheel) >= 180) { input.rotate(Math.sign(wheel)); wheel = 0; }
  }, { passive: false });
  listen(window, 'keydown', event => {
    const e = event as KeyboardEvent;
    if (e.target instanceof HTMLElement && (e.target.closest('input, select, textarea') || e.isTrusted && e.target.closest('button'))) return;
    if (!input.ready()) return;
    const key = e.key.toLowerCase();
    if ([' ', 'enter', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
    if (key === 'arrowleft') input.rotate(-1);
    else if (key === 'arrowright' || key === 'r') input.rotate(1);
    else if (e.repeat) return;
    else if (key === 'b') input.swap();
    else if (key === 'm') input.mode();
    else if (key === ' ' || key === 'enter') input.confirm();
    else if (key === '[' || e.code === 'BracketLeft') input.level(-1);
    else if (key === ']' || e.code === 'BracketRight' || key === '/' || e.code === 'Slash') input.level(1);
  });
  return () => { for (const remove of removers) remove(); input.leave(); };
}
