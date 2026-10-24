export interface Point { x: number; y: number }
export type Kind = 'fruit' | 'bomb' | 'clock';
export interface Item extends Point { id: number; kind: Kind; fruit: number; radius: number; vx: number; vy: number; angle: number; spin: number }
export interface Round {
  phase: 'ready' | 'playing' | 'paused' | 'over'; reason: 'time' | 'bombs' | null;
  remaining: number; score: number; bombs: number; elapsed: number; height: number;
  combo: { count: number; bonus: number };
  items: Item[]; seed: number; nextId: number; nextWave: number; nextClock: number; waves: number; itemScale: number;
}
export const INITIAL_SECONDS = 60;
export const CLOCK_SECONDS = 10;
export const MAX_ITEMS = 24;
export const FRUIT_COUNT = 8;
export const ITEM_RADIUS = 46;
export const FLIGHT_SPEED = .75;
export function comboBonus(count: number): number { return 5 * count * (count - 1) / 2; }
export function endStroke(round: Round): void { round.combo.count = 0; round.combo.bonus = 0; }
export function createRound(seed: number, height = 600, itemScale = 1): Round {
  return { phase: 'ready', reason: null, remaining: INITIAL_SECONDS, score: 0, bombs: 0, elapsed: 0, height,
    combo: { count: 0, bonus: 0 }, items: [], seed: seed >>> 0 || 1, nextId: 1, nextWave: .2, nextClock: 7, waves: 0, itemScale };
}
function random(round: Round): number {
  let n = round.seed; n ^= n << 13; n ^= n >>> 17; n ^= n << 5; round.seed = n >>> 0; return round.seed / 4294967296;
}
function launch(round: Round, kind: Kind): void {
  if (round.items.length >= MAX_ITEMS) return;
  const x = 160 + random(round) * 680, h = round.height;
  round.items.push({ id: round.nextId++, kind, fruit: Math.floor(random(round) * FRUIT_COUNT), x, y: h + 55,
    radius: (kind === 'clock' ? 42 : ITEM_RADIUS) * round.itemScale, vx: (500 - x) * .25 + (random(round) - .5) * 100,
    vy: -h * (2.08 + random(round) * .25), angle: (random(round) - .5) * .5, spin: (random(round) - .5) * 2 });
}
/** Fixed-sized steps preserve wave timing across frame rates. No renderer or wall clock dependencies. */
export function advance(round: Round, seconds: number): void {
  if (round.phase !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return;
  let left = Math.min(seconds, round.remaining);
  while (left > 1e-8 && round.phase === 'playing') {
    const dt = Math.min(left, 1 / 60); left -= dt;
    round.elapsed += dt; round.remaining = Math.max(0, round.remaining - dt);
    const flightDt = dt * FLIGHT_SPEED;
    for (const item of round.items) {
      item.x += item.vx * flightDt; item.y += item.vy * flightDt + round.height * 1.4 * flightDt * flightDt;
      item.vy += round.height * 2.8 * flightDt; item.angle += item.spin * flightDt;
    }
    round.items = round.items.filter(item => item.y < round.height + 120 && item.x > -100 && item.x < 1100);
    if (round.elapsed >= round.nextWave) {
      round.waves++;
      const count = 2 + Math.floor(random(round) * 3);
      for (let i = 0; i < count; i++) launch(round, 'fruit');
      if (round.waves > 1 && random(round) < .58) launch(round, 'bomb');
      round.nextWave = round.elapsed + .85 + random(round) * .45;
    }
    if (round.elapsed >= round.nextClock) { launch(round, 'clock'); round.nextClock = round.elapsed + 7 + random(round) * 4; }
  }
  if (round.remaining < 1e-7) { round.remaining = 0; round.phase = 'over'; round.reason = 'time'; }
}
export function intersects(a: Point, b: Point, item: Point & { radius: number }): boolean {
  const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
  if (len < .01) return false;
  const t = Math.max(0, Math.min(1, ((item.x - a.x) * dx + (item.y - a.y) * dy) / len));
  return (a.x + dx * t - item.x) ** 2 + (a.y + dy * t - item.y) ** 2 <= item.radius ** 2;
}
/** Hit order follows the swipe, so nothing scores after the third bomb ends a round. */
export function slice(round: Round, a: Point, b: Point): Item[] {
  if (round.phase !== 'playing') return [];
  const dx = b.x - a.x, dy = b.y - a.y;
  const hits = round.items.filter(item => intersects(a, b, item)).sort((u, v) => (u.x - v.x) * dx + (u.y - v.y) * dy);
  const removed: Item[] = [];
  for (const item of hits) {
    if (round.phase !== 'playing') break;
    removed.push(item);
    if (item.kind === 'fruit') {
      const bonus = comboBonus(++round.combo.count);
      round.score += 10 + bonus - round.combo.bonus; round.combo.bonus = bonus;
    }
    if (item.kind === 'clock') round.remaining += CLOCK_SECONDS;
    if (item.kind === 'bomb') {
      endStroke(round);
      if (++round.bombs === 3) { round.phase = 'over'; round.reason = 'bombs'; }
    }
  }
  const ids = new Set(removed.map(item => item.id)); round.items = round.items.filter(item => !ids.has(item.id));
  return removed;
}
export function resizeRound(round: Round, height: number, itemScale = round.itemScale): void {
  const ratio = height / round.height, radiusRatio = itemScale / round.itemScale;
  for (const item of round.items) { item.y *= ratio; item.vy *= ratio; item.radius *= radiusRatio; }
  round.height = height; round.itemScale = itemScale;
}
