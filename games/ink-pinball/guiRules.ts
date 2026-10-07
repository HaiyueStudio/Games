export type ScrollPage = 'game' | 'help';
export function newScroll() { return { page: 'game' as ScrollPage, target: 'game' as ScrollPage, phase: 'idle' as 'idle' | 'closing' | 'opening', since: 0, open: 1 }; }
export type ScrollState = ReturnType<typeof newScroll>;
export function turnScroll(s: ScrollState, page: ScrollPage, time: number): boolean {
  if (s.phase !== 'idle' || s.page === page) return false;
  s.target = page; s.phase = 'closing'; s.since = time; return true;
}
export function advanceScroll(s: ScrollState, time: number): void {
  if (s.phase === 'idle') return;
  const elapsed = Math.max(0, time - s.since);
  const ease = (t: number) => t * t * (3 - 2 * t);
  if (elapsed + 1e-9 < .34) { s.open = 1 - ease(elapsed / .34); return; }
  s.page = s.target; s.phase = 'opening';
  s.open = ease(Math.max(0, Math.min(1, (elapsed - .34) / .46)));
  if (elapsed >= .8) { s.phase = 'idle'; s.open = 1; }
}
