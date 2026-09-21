import { decorationAt, decorationBlocksTop, isDecorationKind, DECORATION_SPECS, type Decoration, type DecorationKind } from './decorations';
/** Integer voxel rules. Space definitions are shared graph nodes; routes identify occurrences. */
export type Vec = [number, number, number];
export type CrateColor = 'blue' | 'coral' | 'gold';
export const CRATE_COLORS: CrateColor[] = ['blue', 'coral', 'gold'];
export interface PressurePlate {
  id: string;
  pos: Vec;
  channel: string;
}
export interface IronGate {
  id: string;
  pos: Vec;
  channel: string;
  axis: 'x' | 'z';
}
export interface Room {
  id: string;
  name: string;
  spawn?: Vec;
  /** Preserve planar puzzle topology; J remains a cosmetic hop. */
  planar?: boolean;
  anyGoalColor?: boolean;
  size: number;
  walls: Vec[];
  /** Wall voxels with studded, non-climbable tops; ordinary platforms stay climbable. */
  barriers?: Vec[];
  /** Clear opening widths: east, west, south, north, measured in inner-room cells. */
  doorWidths?: [number, number, number, number];
  buttons?: PressurePlate[];
  gates?: IronGate[];
  decorations?: Decoration[];
  /** Optional explicit paving cells; omitted means a full checkerboard. */
  floorTiles?: Vec[];
  goals: Vec[];
  goalColors?: CrateColor[];
  home: Vec | null;
  level: number;
  hint: string;
}
export interface Box {
  id: string;
  room: string;
  pos: Vec;
  size: number;
  inside: string | null;
  fixed: boolean;
  /** Museum gateways use an explicit interior spawn and return through E. */
  portal?: boolean;
  label?: string;
  required: boolean;
  objective?: number;
  color?: CrateColor;
}
/** Transient animation evidence; never persisted in a save. */
export interface BoxTransfer {
  box: string;
  container: string;
  fromRoom: string;
  toRoom: string;
  from: Vec;
  to: Vec;
  direction: Vec;
  entering: boolean;
}
export interface Frame {
  box: string;
  from: string;
  entry: Vec;
  cycle?: 'infinitesimal' | 'infinite' | 'cycle';
}
export interface Player {
  room: string;
  pos: Vec;
  facing: Vec;
  route: Frame[];
}
export interface State {
  version: 1;
  rulesRevision?: number;
  rooms: Record<string, Room>;
  boxes: Box[];
  player: Player;
  moves: number;
  completed: number[];
  paradox: 'none' | 'infinitesimal' | 'infinite' | 'cycle';
  message: string;
}
export interface GateRecoil { room: string; gate: string; at: Vec; to: Vec }
export type Action =
  | { type: 'move'; dir: Vec; jump?: boolean }
  | { type: 'dive' }
  | { type: 'leave' };
export const levelIds = (state: State): number[] => [...new Set(Object.values(state.rooms).map((r) => r.level).filter((n) => n > 0))].sort((a, b) => a - b);
export const clone = <T>(x: T): T => structuredClone(x);
/** Gameplay never edits room definitions. Copy dynamic state, share the immutable map. */
export function copyState(state: State): State {
  return {
    ...state,
    boxes: clone(state.boxes),
    player: clone(state.player),
    completed: [...state.completed],
  };
}
export const eq = (a: Vec, b: Vec): boolean => a.every((v, i) => v === b[i]);
export const add = (a: Vec, b: Vec): Vec => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
export function boxAt(
  s: State,
  room: string,
  p: Vec,
  except = '',
): Box | undefined {
  return s.boxes.find(
    (b) =>
      b.id !== except &&
      b.room === room &&
      p.every((v, i) => v >= b.pos[i]! && v < b.pos[i]! + b.size),
  );
}
export function within(r: Room, p: Vec): boolean {
  return p.every((v) => v >= 0 && v < r.size);
}
export const PLAYER_WIDTH = 0.72;
export const DOOR_DIRECTIONS: Vec[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
];
export function doorwayWidth(room: Room, outward: Vec): number {
  const i = DOOR_DIRECTIONS.findIndex((d) => eq(d, outward));
  return i < 0 ? 0 : (room.doorWidths?.[i] ?? 1);
}
/** Narrow jambs occupy only the boundary opening, not a full wall voxel. */
export function fitsDoorways(room: Room, pos: Vec, size: number): boolean {
  const mid = Math.floor(room.size / 2);
  return DOOR_DIRECTIONS.every((d) => {
    const axis = d[0] ? 0 : 2,
      across = d[0] ? 2 : 0;
    const edge = d[axis]! > 0 ? room.size - 1 : 0;
    const touches =
      pos[axis]! <= edge &&
      pos[axis]! + size > edge &&
      pos[across]! <= mid &&
      pos[across]! + size > mid;
    return !touches || size <= doorwayWidth(room, d);
  });
}
export function platePressed(
  s: State,
  room: string,
  plate: PressurePlate,
): boolean {
  if (s.player.room === room && eq(s.player.pos, plate.pos)) return true;
  const b = boxAt(s, room, plate.pos);
  return !!b && b.pos[1] === plate.pos[1];
}
export function gatePowered(s: State, room: string, gate: IronGate): boolean {
  return (s.rooms[room]!.buttons ?? []).some(
    (p) => p.channel === gate.channel && platePressed(s, room, p),
  );
}
/** Crates hold the bars down. Player occupancy is temporary during a transaction or legacy load; transition ejects an unpowered player. */
export function gateOpen(s: State, room: string, gate: IronGate): boolean {
  return (
    gatePowered(s, room, gate) ||
    (s.player.room === room && eq(s.player.pos, gate.pos)) ||
    !!boxAt(s, room, gate.pos)
  );
}
export function gateBlocks(s: State, room: string, p: Vec): boolean {
  return (s.rooms[room]!.gates ?? []).some(
    (g) => eq(g.pos, p) && !gateOpen(s, room, g),
  );
}
function gateBlocksTop(s: State, room: string, p: Vec): boolean {
  return (s.rooms[room]!.gates ?? []).some(
    (g) =>
      g.pos[0] === p[0] &&
      g.pos[2] === p[2] &&
      p[1] > g.pos[1] &&
      !gateOpen(s, room, g),
  );
}
export function solid(s: State, room: string, p: Vec, except = ''): boolean {
  return (
    s.rooms[room]!.walls.some((w) => eq(w, p)) ||
    gateBlocks(s, room, p) ||
    !!decorationAt(s.rooms[room]!, p) ||
    !!boxAt(s, room, p, except)
  );
}
export function wallBlocksTop(room: Room, p: Vec): boolean {
  return (room.barriers ?? []).some(
    (w) => w[0] === p[0] && w[2] === p[2] && p[1] > w[1],
  );
}
export function canJump(s: State): boolean {
  const overhead = add(s.player.pos, [0, 1, 0]);
  return (
    within(s.rooms[s.player.room]!, overhead) &&
    !solid(s, s.player.room, overhead)
  );
}
function freeCube(s: State, b: Box, room: string, pos: Vec): boolean {
  const r = s.rooms[room]!;
  if (!fitsDoorways(r, pos, b.size)) return false;
  for (let x = 0; x < b.size; x++)
    for (let y = 0; y < b.size; y++)
      for (let z = 0; z < b.size; z++) {
        const p: Vec = [pos[0] + x, pos[1] + y, pos[2] + z];
        if (
          !within(r, p) ||
          solid(s, room, p, b.id) ||
          (room === s.player.room && eq(p, s.player.pos))
        )
          return false;
      }
  return true;
}
function settleBox(s: State, b: Box): void {
  while (b.pos[1] > 0 && freeCube(s, b, b.room, add(b.pos, [0, -1, 0])))
    b.pos[1]--;
}
export function entryPoint(
  r: Room,
  d: Vec,
  relative: Vec = [0.5, 0, 0.5],
): Vec {
  const p: Vec = relative.map((v) =>
    Math.min(r.size - 1, Math.max(0, Math.floor(v * r.size))),
  ) as Vec;
  if (d[0]) p[0] = d[0] > 0 ? 0 : r.size - 1;
  else if (d[2]) p[2] = d[2] > 0 ? 0 : r.size - 1;
  else {
    p[0] = Math.floor(r.size / 2);
    p[1] = 0;
    p[2] = r.size - 2;
  }
  return p;
}
/** Door openings are derived from the same voxels used for collision. */
export function entrances(
  room: Room,
): { direction: Vec; height: number; width: number }[] {
  return (
    [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
    ] as Vec[]
  ).flatMap((direction) => {
    const p = entryPoint(room, direction.map((v) => -v) as Vec);
    let height = 0;
    while (room.walls.some((w) => eq(w, [p[0], height, p[2]]))) height++;
    return height === 0
      ? [{ direction, height, width: doorwayWidth(room, direction) }]
      : [];
  });
}
export const boxColor = (box: Box): CrateColor => box.color ?? 'blue';
export const goalColor = (room: Room, index: number): CrateColor =>
  room.goalColors?.[index] ?? 'blue';
export function goalMatches(s: State, room: Room, index: number): boolean {
  const box = boxAt(s, room.id, room.goals[index]!);
  return !!box && !box.fixed && (room.anyGoalColor || boxColor(box) === goalColor(room, index));
}
function ownerFor(s: State, room: string): Box | undefined {
  const routeOwner = [...s.player.route]
    .reverse()
    .find((f) => s.boxes.some((b) => b.id === f.box && b.inside === room));
  return routeOwner
    ? s.boxes.find((b) => b.id === routeOwner.box)
    : s.boxes.find((b) => b.inside === room);
}
/** A transaction-local visited set terminates cyclic push dependencies without mutating the caller. */
function push(
  s: State,
  b: Box,
  d: Vec,
  visiting: Set<string>,
  transfers: BoxTransfer[],
): boolean {
  if (b.fixed) return false;
  const token = `${b.id}/${b.room}/${d.join()}`;
  if (visiting.has(token)) {
    s.paradox = 'cycle';
    return false;
  }
  visiting.add(token);
  const next = add(b.pos, d),
    room = s.rooms[b.room]!;
  if (
    !within(room, next) ||
    !within(room, add(next, [b.size - 1, b.size - 1, b.size - 1]))
  ) {
    const opening = entrances(room).find((e) => eq(e.direction, d));
    const across = d[0] ? 2 : 0;
    if (b.pos[across] !== Math.floor(room.size / 2)) return false;
    if (
      !opening ||
      opening.width < b.size ||
      !fitsDoorways(room, b.pos, b.size)
    )
      return false;
    const owner = ownerFor(s, b.room);
    if (owner && b.id !== owner.id) {
      const outside = add(
        owner.pos,
        d.map((v) => (v > 0 ? owner.size : v < 0 ? -b.size : 0)) as Vec,
      );
      const snapshot = clone(s.boxes),
        count = transfers.length;
      const blockers = s.boxes.filter(
        (other) =>
          other.id !== b.id &&
          other.room === owner.room &&
          outside.every(
            (v, i) =>
              v < other.pos[i]! + other.size && v + b.size > other.pos[i]!,
          ),
      );
      if (
        blockers.every((other) =>
          push(s, other, d, new Set(visiting), transfers),
        ) &&
        freeCube(s, b, owner.room, outside)
      ) {
        const fromRoom = b.room,
          from: Vec = [...b.pos];
        b.room = owner.room;
        b.pos = outside;
        settleBox(s, b);
        transfers.push({
          box: b.id,
          container: owner.id,
          fromRoom,
          toRoom: b.room,
          from,
          to: [...b.pos],
          direction: [...d],
          entering: false,
        });
        return true;
      }
      s.boxes.forEach((box, i) => Object.assign(box, snapshot[i]!));
      transfers.length = count;
    }
    return false;
  }
  const obstacles: Box[] = [];
  for (let x = 0; x < b.size; x++)
    for (let y = 0; y < b.size; y++)
      for (let z = 0; z < b.size; z++) {
        const at: Vec = [next[0] + x, next[1] + y, next[2] + z];
        const blocker = boxAt(s, b.room, at, b.id);
        if (blocker && !obstacles.includes(blocker)) obstacles.push(blocker);
      }
  const obstacle = obstacles[0];
  if (obstacle) {
    // Try a conventional push first, then enter the obstructing container.
    const snapshot = clone(s.boxes),
      count = transfers.length;
    if (
      obstacles.every((blocker) =>
        push(s, blocker, d, new Set(visiting), transfers),
      ) &&
      freeCube(s, b, b.room, next)
    ) {
      b.pos = next;
      settleBox(s, b);
      return true;
    }
    s.boxes.forEach((box, i) => Object.assign(box, snapshot[i]!));
    transfers.length = count;
    if (
      obstacles.length === 1 &&
      obstacle.inside &&
      !obstacle.portal &&
      b.size <= s.rooms[obstacle.inside]!.size
    ) {
      const inner = s.rooms[obstacle.inside]!,
        at = entryPoint(inner, d);
      if (
        doorwayWidth(inner, d.map((v) => -v) as Vec) >= b.size &&
        freeCube(s, b, inner.id, at)
      ) {
        const fromRoom = b.room,
          from: Vec = [...b.pos];
        b.room = inner.id;
        b.pos = at;
        settleBox(s, b);
        transfers.push({
          box: b.id,
          container: obstacle.id,
          fromRoom,
          toRoom: b.room,
          from,
          to: [...b.pos],
          direction: [...d],
          entering: true,
        });
        return true;
      }
    }
    return false;
  }
  if (!freeCube(s, b, b.room, next)) return false;
  b.pos = next;
  settleBox(s, b);
  return true;
}
/** Product of linear scale ratios around a reference cycle, evaluated in log space. */
export function classifyScaleCycle(
  ratios: number[],
): 'infinitesimal' | 'infinite' | 'cycle' {
  if (!ratios.length || ratios.some((v) => !Number.isFinite(v) || v <= 0))
    throw new Error('Invalid scale cycle');
  const logScale = ratios.reduce((sum, ratio) => sum + Math.log(ratio), 0);
  return Math.abs(logScale) < 1e-10
    ? 'cycle'
    : logScale < 0
      ? 'infinitesimal'
      : 'infinite';
}
function enter(s: State, b: Box, d: Vec, transfers: BoxTransfer[]): boolean {
  if (!b.inside) return false;
  const r = s.rooms[b.inside]!,
    p: Vec = b.portal && r.spawn ? [...r.spawn] : entryPoint(r, d);
  if (!b.portal && d[1] === 0 && doorwayWidth(r, d.map((v) => -v) as Vec) < PLAYER_WIDTH)
    return false;

  const occupant = boxAt(s, r.id, p);
  if (occupant && (d[1] !== 0 || !push(s, occupant, d, new Set(), transfers)))
    return false;
  if (solid(s, r.id, p) || wallBlocksTop(r, p) || decorationBlocksTop(r, p) || gateBlocksTop(s, r.id, p))
    return false;
  const repeated =
    s.player.room === r.id || s.player.route.some((f) => f.from === r.id);
  const frame: Frame = {
    box: b.id,
    from: s.player.room,
    entry: [...s.player.pos],
  };
  if (repeated) {
    const first =
      s.player.room === r.id
        ? s.player.route.length
        : s.player.route.findLastIndex((f) => f.from === r.id);
    const edges = [
      ...s.player.route
        .slice(first)
        .map((f) => s.boxes.find((box) => box.id === f.box)!),
      b,
    ];
    frame.cycle = classifyScaleCycle(
      edges.map((edge) => edge.size / s.rooms[edge.inside!]!.size),
    );
  }
  s.player.route.push(frame);
  s.player.room = r.id;
  s.player.pos = p;
  if (frame.cycle) {
    s.paradox = frame.cycle;
    s.message =
      frame.cycle === 'infinitesimal'
        ? '∞− 无穷小：循环尺度收缩，空间引用复用。'
        : frame.cycle === 'infinite'
          ? '∞+ 无穷大：循环尺度扩张，空间引用复用。'
          : '↻ 等尺度循环：回到了同一个空间引用。';
  } else s.message = `进入「${r.name}」`;
  return true;
}
export function outerExitPosition(owner: Box, direction: Vec): Vec {
  return add(owner.pos, direction.map((v) => (v > 0 ? owner.size : v)) as Vec);
}
export interface OuterBarrier {
  direction: Vec;
  outside: Vec;
  kind: 'wall' | 'gate' | 'decoration';
  decorationType?: DecorationKind;
}
/** Only the active route occurrence identifies the outside of a shared room. */
export function outerExitBarriers(
  s: State,
): OuterBarrier[] {
  const frame = s.player.route.at(-1);
  const owner = s.boxes.find(
    (b) => b.id === frame?.box && b.inside === s.player.room,
  );
  if (!owner) return [];
  const outer = s.rooms[owner.room]!;
  return entrances(s.rooms[s.player.room]!).flatMap<OuterBarrier>(({ direction }) => {
    const outside = outerExitPosition(owner, direction);
    if (
      outer.walls.some((w) => eq(w, outside)) ||
      wallBlocksTop(outer, outside)
    )
      return [{ direction, outside, kind: 'wall' as const }];
    if (gateBlocks(s, outer.id, outside) || gateBlocksTop(s, outer.id, outside))
      return [{ direction, outside, kind: 'gate' as const }];
    const decoration = outer.decorations?.find((d) => d.pos[0] === outside[0] && d.pos[2] === outside[2] && outside[1] >= d.pos[1]);
    if (decoration) return [{ direction, outside, kind: 'decoration', decorationType: decoration.type }];
    return [];
  });
}
export function reverseTransfers(transfers: BoxTransfer[]): BoxTransfer[] {
  return transfers.toReversed().map((t) => ({
    ...t,
    fromRoom: t.toRoom,
    toRoom: t.fromRoom,
    from: [...t.to],
    to: [...t.from],
    direction: t.direction.map((v) => (v === 0 ? 0 : -v)) as Vec,
    entering: !t.entering,
  }));
}
function exit(s: State, transfers: BoxTransfer[], d?: Vec): boolean {
  const f = s.player.route.at(-1);
  if (!f) return false;
  const b = s.boxes.find((v) => v.id === f.box);
  if (!b) return false;
  const choices: Vec[] = d
    ? [d]
    : [
        [0, 0, 1],
        [-1, 0, 0],
        [1, 0, 0],
        [0, 0, -1],
      ];
  for (const dir of choices) {
    if (
      !b.portal && !entrances(s.rooms[s.player.room]!).some(
        (e) => eq(e.direction, dir) && e.width >= PLAYER_WIDTH,
      )
    )
      continue;
    const p = outerExitPosition(b, dir);
    if (
      !within(s.rooms[b.room]!, p) ||
      s.rooms[b.room]!.walls.some((w) => eq(w, p)) ||
      gateBlocks(s, b.room, p) ||
      gateBlocksTop(s, b.room, p) ||
      decorationBlocksTop(s.rooms[b.room]!, p) ||
      wallBlocksTop(s.rooms[b.room]!, p)
    )
      continue;
    const snapshot = clone(s.boxes),
      count = transfers.length;
    const occupant = boxAt(s, b.room, p);
    if (
      (occupant && !push(s, occupant, dir, new Set(), transfers)) ||
      solid(s, b.room, p)
    ) {
      s.boxes.forEach((box, i) => Object.assign(box, snapshot[i]!));
      transfers.length = count;
      continue;
    }
    const repeated = f.cycle;
    s.player.room = b.room;
    s.player.pos = p;
    s.player.route.pop();
    if (repeated) {
      s.paradox =
        repeated === 'infinitesimal'
          ? 'infinite'
          : repeated === 'infinite'
            ? 'infinitesimal'
            : 'cycle';
      s.message =
        s.paradox === 'infinite'
          ? '∞+ 无穷大：沿收缩循环的反方向向外返回。'
          : s.paradox === 'infinitesimal'
            ? '∞− 无穷小：沿扩张循环的反方向向外返回。'
            : '↻ 等尺度循环：返回外层引用。';
    } else s.message = '回到外层空间';
    return true;
  }
  const obstruction = outerExitBarriers(s).find(
    (b) => !d || eq(b.direction, d),
  );
  s.message = obstruction
    ? obstruction.kind === 'wall'
      ? '外层的墙挡住了这个出口，试试其他方向。'
      : obstruction.kind === 'decoration'
        ? '外层的石头或树木挡住了出口，试试其他方向。'
        : '外层的铁栅栏还没打开，试试其他方向。'
    : '出口被挡住了，先移动外面的箱子。';
  return false;
}
function fall(s: State): void {
  while (
    s.player.pos[1] > 0 &&
    !solid(s, s.player.room, add(s.player.pos, [0, -1, 0]))
  )
    s.player.pos[1]--;
}
export function goalsSatisfied(s: State, level: number): boolean {
  const rooms = Object.values(s.rooms).filter((r) => r.level === level);
  const goals = rooms.flatMap((r) =>
    r.goals.map((pos, index) => ({ room: r.id, pos, index })),
  );
  const required = s.boxes.filter(
    (b) => b.required && (b.objective ?? s.rooms[b.room]?.level) === level,
  );
  return (
    goals.length > 0 &&
    goals.every((g) => goalMatches(s, s.rooms[g.room]!, g.index)) &&
    required.every((b) =>
      goals.some(
        (g) =>
          g.room === b.room &&
          eq(b.pos, g.pos) &&
          (s.rooms[g.room]!.anyGoalColor || boxColor(b) === goalColor(s.rooms[g.room]!, g.index)),
      ),
    )
  );
}
export function updateCompletion(s: State): void {
  const room = s.rooms[s.player.room]!;
  if (
    room.level > 0 &&
    room.home &&
    eq(room.home, s.player.pos) &&
    goalsSatisfied(s, room.level) &&
    !s.completed.includes(room.level)
  ) {
    s.completed.push(room.level);
    s.completed.sort((a, b) => a - b);
    s.message = `第 ${room.level} 关完成！小盒子亮起来了。沿出口返回世界继续探索。`;
  }
}
export function transition(
  state: State,
  action: Action,
): { state: State; changed: boolean; transfers: BoxTransfer[]; recoil?: GateRecoil | undefined } {
  // In classic planar puzzles, K follows the same push-before-entry priority as walking.
  if (action.type === 'dive' && state.rooms[state.player.room]!.planar)
    return transition(state, { type: 'move', dir: state.player.facing });
  const s = copyState(state);
  const transfers: BoxTransfer[] = [];
  s.message = '';
  s.paradox = 'none';
  let ok = false;
  if (action.type === 'leave') {
    if (s.rooms[s.player.room]!.planar) {
      const index = s.player.route.findLastIndex((f) => s.boxes.find((b) => b.id === f.box)?.portal);
      if (index >= 0) {
        const gateway = s.boxes.find((b) => b.id === s.player.route[index]!.box)!;
        s.player.room = gateway.inside!;
        s.player.route = s.player.route.slice(0, index + 1);
      }
    }
    ok = exit(s, transfers);
  }
  else if (action.type === 'dive') {
    const below = boxAt(s, s.player.room, add(s.player.pos, [0, -1, 0]));
    const front = boxAt(s, s.player.room, add(s.player.pos, s.player.facing));
    ok =
      !!(below?.inside && enter(s, below, [0, -1, 0], transfers)) ||
      !!(front?.inside && enter(s, front, s.player.facing, transfers));
  } else {
    const d = action.dir;
    if (d[1] !== 0 || Math.abs(d[0]) + Math.abs(d[2]) !== 1)
      return { state, changed: false, transfers: [] };
    s.player.facing = [...d];
    const next = add(s.player.pos, d),
      room = s.rooms[s.player.room]!;
    if (!fitsDoorways(room, next, PLAYER_WIDTH)) {
      s.message = '这个入口太窄，无法通过。';
    } else if (!within(room, next)) ok = exit(s, transfers, d);
    else if (action.jump && !room.planar) {
      const raised = add(next, [0, 1, 0]),
        overhead = add(s.player.pos, [0, 1, 0]);
      if (
        within(room, raised) &&
        !wallBlocksTop(room, raised) &&
        !decorationBlocksTop(room, raised) &&
        !gateBlocksTop(s, room.id, raised) &&
        !solid(s, room.id, raised) &&
        !solid(s, room.id, overhead)
      ) {
        s.player.pos = raised;
        fall(s);
        ok = true;
      }
    } else if (
      !wallBlocksTop(room, next) &&
      !decorationAt(room, next) &&
      !decorationBlocksTop(room, next) &&
      !gateBlocksTop(s, room.id, next) &&
      !gateBlocks(s, room.id, next) &&
      !room.walls.some((w) => eq(w, next))
    ) {
      const b = boxAt(s, room.id, next);
      if (!b) {
        s.player.pos = next;
        fall(s);
        ok = true;
      } else {
        const backup = clone(s.boxes);
        if (push(s, b, d, new Set(), transfers)) {
          s.player.pos = next;
          fall(s);
          ok = true;
        } else {
          s.boxes = backup;
          transfers.length = 0;
          const original = s.boxes.find((v) => v.id === b.id)!;
          ok = enter(s, original, d, transfers);
        }
      }
    }
  }
  let recoil: GateRecoil | undefined;
  if (ok) {
    const room = s.rooms[s.player.room]!;
    const gate = room.gates?.find((g) =>
      g.pos[0] === s.player.pos[0] && g.pos[2] === s.player.pos[2] &&
      s.player.pos[1] >= g.pos[1] && s.player.pos[1] <= g.pos[1] + 1 &&
      !gatePowered(s, room.id, g) && !boxAt(s, room.id, g.pos));
    if (gate) {
      const candidates = [
        ...(state.player.room === room.id ? [state.player.pos] : []),
        add(gate.pos, s.player.facing.map((v) => -v) as Vec),
        ...DOOR_DIRECTIONS.map((d) => add(gate.pos, d)),
      ];
      const safe = candidates.find((p) => within(room, p) &&
        (p[0] !== gate.pos[0] || p[2] !== gate.pos[2]) &&
        !solid(s, room.id, p) && !wallBlocksTop(room, p) &&
        !decorationBlocksTop(room, p) && !gateBlocksTop(s, room.id, p) &&
        fitsDoorways(room, p, PLAYER_WIDTH));
      if (safe) {
        s.player.pos = [...safe];
        fall(s);
        recoil = { room: room.id, gate: gate.id, at: [...gate.pos], to: [...s.player.pos] };
        s.message = '栅栏弹起，把你轻轻弹回了！用箱子压住按钮再通过。';
      } else {
        ok = false;
        s.message = '栅栏即将升起，身后没有安全落点，本步已撤回。';
      }
    }
  }
  if (!ok) {
    if (action.type === 'move') {
      const npc = decorationAt(state.rooms[state.player.room]!, add(state.player.pos, action.dir));
      if (npc?.type === 5) s.message = npc.message ?? '红方：欢迎来到盒子里的小世界！';
    }
    s.boxes = clone(state.boxes);
    s.player = { ...clone(state.player), facing: s.player.facing };
    s.message ||=
      String(s.paradox) === 'cycle'
        ? '循环推箱依赖：本步已撤回，可换方向或下钻。'
        : '这里暂时走不通。试试 J 跳跃、K 下钻，或 Z 撤销。';
  } else {
    s.moves++;
    updateCompletion(s);
  }
  return { state: s, changed: ok, transfers: ok ? transfers : [], recoil };
}
/** Strict save validation, including graph references and voxel coordinates. */
export function validState(value: unknown): value is State {
  try {
    return validateState(value);
  } catch {
    return false;
  }
}
function validateState(value: unknown): value is State {
  if (!value || typeof value !== 'object') return false;
  const s = value as State;
  const vec = (p: unknown): p is Vec =>
    Array.isArray(p) && p.length === 3 && p.every(Number.isSafeInteger);
  if (
    s.version !== 1 ||
    !s.rooms ||
    typeof s.rooms !== 'object' ||
    !Array.isArray(s.boxes) ||
    !s.player ||
    !Array.isArray(s.player.route) ||
    s.player.route.length > 10000 ||
    !Array.isArray(s.completed) ||
    !s.completed.every((n) => Number.isInteger(n) && n >= 1 && Object.values(s.rooms).some((r) => r?.level === n)) ||
    !Number.isSafeInteger(s.moves) ||
    s.moves < 0
  )
    return false;
  if (
    !Object.entries(s.rooms).every(
      ([id, r]) =>
        r &&
        r.id === id &&
        Number.isInteger(r.size) &&
        r.size >= 3 &&
        r.size <= 32 &&
        typeof r.name === 'string' &&
        typeof r.hint === 'string' &&
        Number.isInteger(r.level) && r.level >= 0 &&
        (r.spawn === undefined || (vec(r.spawn) && within(r, r.spawn) && !r.walls.some((w) => eq(w, r.spawn!)))) &&
        (r.planar === undefined || typeof r.planar === 'boolean') &&
        (r.anyGoalColor === undefined || typeof r.anyGoalColor === 'boolean') &&
        (r.doorWidths === undefined ||
          (Array.isArray(r.doorWidths) &&
            r.doorWidths.length === 4 &&
            r.doorWidths.every(
              (w) => Number.isFinite(w) && w >= PLAYER_WIDTH && w <= 1,
            ))) &&
        (r.goalColors === undefined ||
          (Array.isArray(r.goalColors) &&
            r.goalColors.length === r.goals.length &&
            r.goalColors.every((c) => CRATE_COLORS.includes(c)))) &&
        Array.isArray(r.walls) &&
        r.walls.every((p) => vec(p) && within(r, p)) &&
        (r.barriers === undefined ||
          (Array.isArray(r.barriers) &&
            r.barriers.every(
              (p) => vec(p) && r.walls.some((w) => eq(w, p)),
            ))) &&
        (r.buttons === undefined ||
          (Array.isArray(r.buttons) &&
            new Set(r.buttons.map((p) => p.id)).size === r.buttons.length &&
            new Set(r.buttons.map((p) => p.pos.join())).size ===
              r.buttons.length &&
            r.buttons.every(
              (p) =>
                typeof p.id === 'string' &&
                p.id.length > 0 &&
                typeof p.channel === 'string' &&
                p.channel.length > 0 &&
                vec(p.pos) &&
                within(r, p.pos) &&
                !r.walls.some((w) => eq(w, p.pos)),
            ))) &&
        (r.gates === undefined ||
          (Array.isArray(r.gates) &&
            new Set(r.gates.map((g) => g.id)).size === r.gates.length &&
            new Set(r.gates.map((g) => g.pos.join())).size === r.gates.length &&
            r.gates.every(
              (g) =>
                typeof g.id === 'string' &&
                g.id.length > 0 &&
                (g.axis === 'x' || g.axis === 'z') &&
                vec(g.pos) &&
                within(r, g.pos) &&
                !r.walls.some((w) => eq(w, g.pos)) &&
                !(r.buttons ?? []).some((p) => eq(p.pos, g.pos)) &&
                (r.buttons ?? []).some((p) => p.channel === g.channel),
            ))) &&
        (r.floorTiles === undefined ||
          (Array.isArray(r.floorTiles) &&
            r.floorTiles.every((p) => vec(p) && p[1] === 0 && within(r, p)) &&
            new Set(r.floorTiles.map((p) => p.join())).size === r.floorTiles.length)) &&
        (r.decorations === undefined ||
          (Array.isArray(r.decorations) &&
            new Set(r.decorations.map((d) => d.id)).size === r.decorations.length &&
            new Set(r.decorations.map((d) => `${d.pos[0]},${d.pos[2]}`)).size === r.decorations.length &&
            r.decorations.every((d) =>
              d && typeof d.id === 'string' && d.id.length > 0 &&
              (d.message === undefined || (typeof d.message === 'string' && d.message.length <= 1000)) &&
              isDecorationKind(d.type) && vec(d.pos) && within(r, d.pos) &&
              d.pos[1] + DECORATION_SPECS[d.type].height <= r.size &&
              ![...r.walls, ...r.goals, ...(r.home ? [r.home] : []),
                ...(r.buttons ?? []).map((b) => b.pos), ...(r.gates ?? []).map((g) => g.pos)]
                .some((p) => p[0] === d.pos[0] && p[2] === d.pos[2] &&
                  p[1] >= d.pos[1] && p[1] < d.pos[1] + DECORATION_SPECS[d.type].height),
            ))) &&
        Array.isArray(r.goals) &&
        r.goals.every((p) => vec(p) && within(r, p)) &&
        (r.home === null || (vec(r.home) && within(r, r.home))),
    )
  )
    return false;
  if (
    new Set(s.boxes.map((b) => b.id)).size !== s.boxes.length ||
    !s.boxes.every(
      (b) =>
        typeof b.id === 'string' &&
        !!s.rooms[b.room] &&
        vec(b.pos) &&
        Number.isInteger(b.size) &&
        b.size >= 1 &&
        b.size <= 8 &&
        within(s.rooms[b.room]!, b.pos) &&
        within(
          s.rooms[b.room]!,
          add(b.pos, [b.size - 1, b.size - 1, b.size - 1]),
        ) &&
        !(s.rooms[b.room]!.decorations ?? []).some((d) =>
          d.pos[0] >= b.pos[0] && d.pos[0] < b.pos[0] + b.size &&
          d.pos[2] >= b.pos[2] && d.pos[2] < b.pos[2] + b.size &&
          d.pos[1] < b.pos[1] + b.size && d.pos[1] + DECORATION_SPECS[d.type].height > b.pos[1]) &&
        (b.inside === null || !!s.rooms[b.inside]) &&
        typeof b.fixed === 'boolean' &&
        (b.portal === undefined || (typeof b.portal === 'boolean' && (!b.portal || (b.fixed && !!b.inside && !!s.rooms[b.inside]?.spawn)))) &&
        (b.label === undefined || (typeof b.label === 'string' && b.label.length <= 50)) &&
        typeof b.required === 'boolean' &&
        (b.color === undefined || CRATE_COLORS.includes(b.color)),
    )
  )
    return false;
  return (
    !!s.rooms[s.player.room] &&
    vec(s.player.pos) &&
    within(s.rooms[s.player.room]!, s.player.pos) &&
    vec(s.player.facing) &&
    Math.abs(s.player.facing[0]) + Math.abs(s.player.facing[2]) === 1 &&
    s.player.facing[1] === 0 &&
    s.player.route.every(
      (f) =>
        f &&
        s.boxes.some((b) => b.id === f.box) &&
        !!s.rooms[f.from] &&
        vec(f.entry),
    ) &&
    ['none', 'infinitesimal', 'infinite', 'cycle'].includes(s.paradox) &&
    typeof s.message === 'string' &&
    !decorationBlocksTop(s.rooms[s.player.room]!, s.player.pos) &&
    !solid(s, s.player.room, s.player.pos)
  );
}
