import {
  type Room,
  type Vec,
  type State,
  type BoxTransfer,
  entrances,
} from './model';
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => {
  const t = clamp(v);
  return t * t * (3 - 2 * t);
};
export function movementDuration(from: Vec, to: Vec, jump = false): number {
  if (from.every((v, i) => v === to[i])) return 0;
  return jump || from[1] !== to[1] ? 420 : 160;
}
/** Clear the entire body past the ledge before changing its support height. */
export function movementPose(
  from: Vec,
  to: Vec,
  elapsed: number,
  jump = false,
  player = true,
  duration = movementDuration(from, to, jump),
) {
  const t = duration ? clamp(elapsed / duration) : 1;
  const dy = to[1] - from[1];
  let horizontal = smooth(t),
    y = from[1] + dy * horizontal;
  let phase = 'walk';
  if (dy > 0 || (jump && dy === 0)) {
    const peak =
      Math.max(from[1], to[1]) + (player ? (dy > 0 ? 0.12 : 0.7) : 0);
    if (t < 0.34) {
      horizontal = 0;
      y = from[1] + (peak - from[1]) * smooth(t / 0.34);
      phase = 'rise';
    } else if (t < 0.82) {
      horizontal = smooth((t - 0.34) / 0.48);
      y = peak;
      phase = 'cross';
    } else {
      horizontal = 1;
      y = peak + (to[1] - peak) * smooth((t - 0.82) / 0.18);
      phase = 'fall';
    }
  } else if (dy < 0) {
    horizontal = smooth(t / 0.55);
    y = t < 0.55 ? from[1] : from[1] + dy * smooth((t - 0.55) / 0.45);
    if (player && t < 0.55) y += Math.sin((Math.PI * t) / 0.55) * 0.1;
    phase = t < 0.55 ? 'cross' : 'fall';
  } else if (player) y += Math.sin(Math.PI * t) * 0.12;
  const active = duration > 0 && elapsed < duration;
  return {
    position: (t === 1
      ? [...to]
      : [
          from[0] + (to[0] - from[0]) * horizontal,
          y,
          from[2] + (to[2] - from[2]) * horizontal,
        ]) as Vec,
    squash: player && active ? Math.sin(t * Math.PI * 2) * 0.065 : 0,
    active,
    phase: active ? phase : 'landed',
  };
}
export interface WallRun {
  min: Vec;
  max: Vec;
}
/** Greedy rectangulation of actual contiguous voxels, without gaps or hidden bridges. */
export function wallRuns(room: Room): WallRun[] {
  const cells = new Set(room.walls.map((p) => p.join(','))),
    runs: WallRun[] = [];
  for (let y = 0; y < room.size; y++)
    for (let z = 0; z < room.size; z++)
      for (let x = 0; x < room.size; x++) {
        if (!cells.has([x, y, z].join(','))) continue;
        let width = 1,
          depth = 1,
          height = 1;
        while (cells.has([x + width, y, z].join(','))) width++;
        while (
          Array.from({ length: width }, (_, i) =>
            cells.has([x + i, y, z + depth].join(',')),
          ).every(Boolean)
        )
          depth++;
        const layer = (h: number) =>
          Array.from({ length: width * depth }, (_, i) =>
            cells.has(
              [x + (i % width), y + h, z + Math.floor(i / width)].join(','),
            ),
          ).every(Boolean);
        while (layer(height)) height++;
        for (let a = 0; a < width; a++)
          for (let b = 0; b < depth; b++)
            for (let c = 0; c < height; c++)
              cells.delete([x + a, y + c, z + b].join(','));
        runs.push({
          min: [x - 0.5, y, z - 0.5],
          max: [x + width - 0.5, y + height, z + depth - 0.5],
        });
      }
  return runs;
}
export const JUMP_MS = 560;
export function jumpPose(elapsed: number) {
  const t = Math.max(0, Math.min(1, elapsed / JUMP_MS));
  return {
    active: elapsed >= 0 && elapsed < JUMP_MS,
    lift: Math.sin(Math.PI * t),
    squash: -Math.sin(2 * Math.PI * t) * 0.1,
  };
}
export const PORTAL_MS = 820;
export function portalPose(elapsed: number) {
  const t = Math.max(0, Math.min(1, elapsed / PORTAL_MS));
  const smooth = (v: number) => v * v * (3 - 2 * v);
  const switched = t >= 0.5;
  const phase = switched ? smooth((t - 0.5) * 2) : smooth(t * 2);
  // The old world is fully veiled before replacing its geometry.
  const opacity = smooth(Math.min(1, Math.abs(t - 0.5) / 0.17));
  return {
    active: elapsed >= 0 && elapsed < PORTAL_MS,
    switched,
    phase,
    opacity,
  };
}
export const CELEBRATION_MS = 1400;
export function celebrationPose(elapsed: number) {
  const t = Math.max(0, Math.min(1, elapsed / CELEBRATION_MS));
  const lift =
    t < 0.18
      ? -Math.sin((t / 0.18) * Math.PI) * 0.09
      : t < 0.68
        ? Math.sin(((t - 0.18) / 0.5) * Math.PI) * 1.35
        : 0;
  const spin = Math.min(1, Math.max(0, (t - 0.25) / 0.63));
  const yaw = spin * spin * (3 - 2 * spin) * Math.PI * 2;
  return {
    active: elapsed >= 0 && elapsed < CELEBRATION_MS,
    lift,
    yaw,
    laugh: t > 0.14 && t < 0.93,
  };
}

/** Rounded wall runs overlap across internal joins, hiding their rounded end caps. */
export function wallPieces(room: Room): WallRun[] {
  const runs = wallRuns(room);
  // Grow existing ends into narrow openings instead of attaching square jamb strips.
  for (const door of entrances(room)) {
    const inset = (1 - door.width) / 2;
    if (!inset) continue;
    const axis = door.direction[0] ? 0 : 2,
      across = axis === 0 ? 2 : 0;
    const edge = door.direction[axis]! > 0 ? room.size - 1 : 0;
    const mid = Math.floor(room.size / 2);
    for (const run of runs) {
      if (run.min[1] > 0 || run.min[axis]! > edge || run.max[axis]! <= edge)
        continue;
      if (run.max[across] === mid - 0.5) run.max[across] += inset;
      if (run.min[across] === mid + 0.5) run.min[across] -= inset;
    }
  }
  const pieces = [...runs];
  for (let a = 0; a < runs.length; a++)
    for (let b = a + 1; b < runs.length; b++)
      for (const axis of [0, 1, 2]) {
        const first = runs[a]!,
          second = runs[b]!;
        const edge =
          first.max[axis] === second.min[axis]
            ? first.max[axis]
            : second.max[axis] === first.min[axis]
              ? second.max[axis]
              : undefined;
        if (edge === undefined) continue;
        const min = first.min.map((v, i) =>
          i === axis ? edge - 0.2 : Math.max(v, second.min[i]!),
        ) as Vec;
        const max = first.max.map((v, i) =>
          i === axis ? edge + 0.2 : Math.min(v, second.max[i]!),
        ) as Vec;
        if (min.every((v, i) => max[i]! > v)) pieces.push({ min, max });
      }
  return pieces;
}

export const BOX_TRANSFER_MS = 640;
export interface BoxTravel {
  from: Vec;
  to: Vec;
  startScale: number;
  endScale: number;
  entering: boolean;
  departure: boolean;
}
/** Project a crossing into either adjacent room without copying its space graph. */
export function boxTravel(
  transfer: BoxTransfer,
  room: string,
  before: State,
  after: State,
): BoxTravel | undefined {
  if (room !== transfer.fromRoom && room !== transfer.toRoom) return;
  const owner = before.boxes.find((b) => b.id === transfer.container)!;
  const box = before.boxes.find((b) => b.id === transfer.box)!;
  const inner = after.rooms[owner.inside!]!;
  const outerView = room === owner.room;
  const ratio = owner.size / inner.size;
  const departure = room === transfer.fromRoom;
  const direction = transfer.direction;
  const center = (box.size - 1) / 2;
  if (outerView) {
    const portal = owner.pos.map((v, i) =>
      i === 1 ? v : v + (owner.size - 1) / 2 - center,
    ) as Vec;
    return {
      from: transfer.entering ? transfer.from : portal,
      to: transfer.entering ? portal : transfer.to,
      startScale: transfer.entering ? 1 : ratio,
      endScale: transfer.entering ? ratio : 1,
      entering: transfer.entering,
      departure,
    };
  }
  // The outside belongs to a different scale. Bound its on-screen projection so
  // unusually large room ratios cannot cover the entire current board.
  const outsideScale = Math.min(2.5, Math.max(1, 1 / ratio));
  const at = transfer.entering ? transfer.to : transfer.from;
  const outside = at.map(
    (v, i) =>
      v +
      direction[i]! *
        (transfer.entering ? -1 : 1) *
        (box.size * outsideScale * 0.5 + 0.6),
  ) as Vec;
  return {
    from: transfer.entering ? outside : transfer.from,
    to: transfer.entering ? transfer.to : outside,
    startScale: transfer.entering ? outsideScale : 1,
    endScale: transfer.entering ? 1 : outsideScale,
    entering: transfer.entering,
    departure,
  };
}
export function boxTravelPose(travel: BoxTravel, elapsed: number) {
  const t = clamp(elapsed / BOX_TRANSFER_MS);
  const scaleT = smooth(travel.entering ? t / 0.45 : (t - 0.45) / 0.55);
  const moveT = smooth(travel.entering ? (t - 0.35) / 0.65 : t / 0.55);
  return {
    position: travel.from.map((v, i) => v + (travel.to[i]! - v) * moveT) as Vec,
    scale:
      t === 1
        ? travel.endScale
        : travel.startScale + (travel.endScale - travel.startScale) * scaleT,
    opacity: travel.departure ? 1 - smooth((t - 0.78) / 0.22) : 1,
    active: elapsed < BOX_TRANSFER_MS,
    phase: travel.entering
      ? t < 0.45
        ? 'shrink'
        : 'enter'
      : t < 0.45
        ? 'exit'
        : 'grow',
  };
}


export const RECOIL_MS = 600;
export const GATE_RECOIL_DELAY_MS = 200;
/** Approach the bars, then spring back; the body stays outside the rising metal plane. */
export function recoilPose(from: Vec, gate: Vec, to: Vec, elapsed: number) {
  const t = clamp(elapsed / RECOIL_MS);
  if (t === 1) return { position: [...to] as Vec, squash: 0, active: false, phase: 'landed' };
  const dx = to[0] - gate[0], dz = to[2] - gate[2];
  const length = Math.hypot(dx, dz) || 1;
  const contact: Vec = [gate[0] + dx / length * 0.56, from[1], gate[2] + dz / length * 0.56];
  const retreat = elapsed >= GATE_RECOIL_DELAY_MS;
  const u = retreat ? clamp((elapsed - GATE_RECOIL_DELAY_MS) / (RECOIL_MS - GATE_RECOIL_DELAY_MS)) : clamp(elapsed / GATE_RECOIL_DELAY_MS);
  const a = retreat ? contact : from, b = retreat ? to : contact;
  const position = a.map((v, i) => v + (b[i]! - v) * smooth(u)) as Vec;
  if (retreat) position[1] += Math.sin(Math.PI * u) * 0.42;
  return { position, squash: t < 1 ? Math.sin(u * Math.PI * 2) * 0.08 : 0,
    active: true, phase: retreat ? 'recoil' : 'approach' };
}
