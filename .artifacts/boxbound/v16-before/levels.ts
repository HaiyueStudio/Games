import {
  solid,
  fitsDoorways,
  wallBlocksTop,
  within,
  clone,
  copyState,
  type Room,
  type State,
  type Vec,
} from './model';
import { decorationBlocksTop } from './decorations';
import { createWorldState } from './world-map';

/** World layout, nested rooms and initial boxes are authored in levels/index.json and its referenced files. */
export function createGame(): State {
  return createWorldState();
}
/** Keep all five existing journeys; only upgrade authored geometry/colour semantics. */
function upgradeLegacyState(saved: State): State {
  if ((saved.rulesRevision ?? 1) >= 4) return saved;
  const next = clone(saved),
    initial = createGame();
  for (const [id, r] of Object.entries(next.rooms)) {
    const fresh = initial.rooms[id];
    if (fresh) {
      r.walls = clone(fresh.walls);
      r.barriers = clone(fresh.barriers ?? []);
      r.doorWidths = clone(fresh.doorWidths!);
      if (fresh.goalColors) r.goalColors = clone(fresh.goalColors);
      else delete r.goalColors;
      r.hint = fresh.hint;
    }
  }
  for (const box of next.boxes)
    box.color = initial.boxes.find((b) => b.id === box.id)?.color ?? 'blue';
  // Preserve exported crates and progress; settle actors whose old sills were removed.
  for (const box of next.boxes) {
    const fits = (p: Vec) => {
      if (!fitsDoorways(next.rooms[box.room]!, p, box.size)) return false;
      for (let x = 0; x < box.size; x++)
        for (let y = 0; y < box.size; y++)
          for (let z = 0; z < box.size; z++) {
            const cell: Vec = [p[0] + x, p[1] + y, p[2] + z];
            if (
              !within(next.rooms[box.room]!, cell) ||
              solid(next, box.room, cell, box.id)
            )
              return false;
          }
      return true;
    };
    if (!fits(box.pos)) box.pos = nearest(next.rooms[box.room]!, box.pos, fits);
    if (!box.fixed)
      while (box.pos[1] > 0 && fits([box.pos[0], box.pos[1] - 1, box.pos[2]]))
        box.pos[1]--;
  }
  if (
    solid(next, next.player.room, next.player.pos) ||
    wallBlocksTop(next.rooms[next.player.room]!, next.player.pos)
  )
    next.player.pos = nearest(
      next.rooms[next.player.room]!,
      next.player.pos,
      (p) =>
        !solid(next, next.player.room, p) &&
        !wallBlocksTop(next.rooms[next.player.room]!, p),
    );
  while (
    next.player.pos[1] > 0 &&
    !solid(next, next.player.room, [
      next.player.pos[0],
      next.player.pos[1] - 1,
      next.player.pos[2],
    ])
  )
    next.player.pos[1]--;
  next.rulesRevision = 4;
  next.message =
    '已保留旅程：窄门阻挡箱子，宽门可运输箱子，R 可重玩当前小世界。';
  return next;
}
/** Update authored mechanisms without resetting completed levels or transported crates. */
export function upgradeState(saved: State): State {
  const fresh = createGame();
  if ((saved.rulesRevision ?? 1) >= fresh.rulesRevision!) return saved;
  const next = clone(upgradeLegacyState(saved));
  // Add the museum graph without resetting any existing room or transported object.
  for (const [id, room] of Object.entries(fresh.rooms))
    if (!next.rooms[id]) next.rooms[id] = clone(room);
  for (const box of fresh.boxes)
    if (box.id.startsWith('pp-') && !next.boxes.some((b) => b.id === box.id)) next.boxes.push(clone(box));
  for (const [id, room] of Object.entries(next.rooms)) {
    const definition = fresh.rooms[id];
    if (!definition) continue;
    if (definition.decorations) room.decorations = clone(definition.decorations);
    else delete room.decorations;
    if (definition.floorTiles) room.floorTiles = clone(definition.floorTiles);
  }
  const world = next.rooms.world!;
  world.buttons = clone(fresh.rooms.world!.buttons!);
  world.gates = clone(fresh.rooms.world!.gates!);
  world.hint = fresh.rooms.world!.hint;
  // Move only the untouched tutorial weight; preserve crates the player already moved.
  const weight = next.boxes.find((b) => b.id === 'island-weight');
  if ((saved.rulesRevision ?? 1) < 6 && weight?.room === 'world' && weight.pos.every((v, i) => v === [7, 0, 13][i]))
    weight.pos = [7, 0, 14];
  // Older journeys may have exported crates here. Keep them and their routes.
  for (const w of fresh.rooms.world!.walls)
    if (!world.walls.some((p) => p.every((v, i) => v === w[i])))
      world.walls.push([...w]);
  world.barriers = clone(world.walls);
  for (const b of next.boxes) {
    const room = next.rooms[b.room]!;
    const fits = (p: Vec) => {
      if (b.pos[1] === 0 && p[1] !== 0) return false;
      for (let x = 0; x < b.size; x++)
        for (let y = 0; y < b.size; y++)
          for (let z = 0; z < b.size; z++) {
            const at: Vec = [p[0] + x, p[1] + y, p[2] + z];
            if (
              !within(room, at) ||
              solid(next, b.room, at, b.id) ||
              (next.player.room === b.room &&
                at.every((v, i) => v === next.player.pos[i]))
            )
              return false;
          }
      return true;
    };
    if (!fits(b.pos)) b.pos = nearest(room, b.pos, fits);
  }
  const playerRoom = next.rooms[next.player.room]!;
  if (solid(next, playerRoom.id, next.player.pos) ||
    wallBlocksTop(playerRoom, next.player.pos) || decorationBlocksTop(playerRoom, next.player.pos))
    next.player.pos = nearest(
      playerRoom, next.player.pos,
      (p) => (next.player.pos[1] !== 0 || p[1] === 0) &&
        !solid(next, playerRoom.id, p) && !wallBlocksTop(playerRoom, p) &&
        !decorationBlocksTop(playerRoom, p),
    );
  if (!next.boxes.some((b) => b.id === 'island-weight')) {
    const weight = clone(fresh.boxes.find((b) => b.id === 'island-weight')!);
    weight.pos = nearest(
      world,
      weight.pos,
      (p) =>
        p[1] === 0 &&
        !solid(next, 'world', p) &&
        !(
          next.player.room === 'world' &&
          p.every((v, i) => v === next.player.pos[i])
        ),
    );
    next.boxes.push(weight);
  }
  next.rulesRevision = fresh.rulesRevision!;
  next.message = '旅程已保留：北侧新增 Patrick’s Parabox 致敬馆，红方和前十个小世界正在等你。';
  return next;
}
function nearest(room: Room, origin: Vec, free: (p: Vec) => boolean): Vec {
  const points: Vec[] = [];
  for (let x = 0; x < room.size; x++)
    for (let z = 0; z < room.size; z++)
      for (let y = 0; y < room.size; y++) points.push([x, y, z]);
  points.sort(
    (a, b) =>
      a.reduce((n, v, i) => n + Math.abs(v - origin[i]!), 0) -
      b.reduce((n, v, i) => n + Math.abs(v - origin[i]!), 0),
  );
  const found = points.find(free);
  if (!found)
    throw new Error('旧存档没有可安全放置角色或箱子的位置，原存档已保留。');
  return found;
}
export function resetLevel(state: State): State {
  const level = state.rooms[state.player.room]!.level;
  if (!level) return state;
  const initial = createGame(),
    next = copyState(state),
    ids: string[] = [];
  const visit = (id: string) => {
    if (ids.includes(id) || initial.rooms[id]?.level !== level) return;
    ids.push(id);
    for (const b of initial.boxes)
      if (b.room === id && b.inside) visit(b.inside);
  };
  const gatewayIndex = state.player.route.findLastIndex((f) => {
    const b = initial.boxes.find((b) => b.id === f.box);
    return b?.portal && initial.rooms[b.inside!]?.level === level;
  });
  const root = gatewayIndex < 0 ? state.player.room : initial.boxes.find((b) => b.id === state.player.route[gatewayIndex]!.box)!.inside!;
  visit(root);
  // Restore objects by identity too: exported objects may currently live outside their original room.
  const original = initial.boxes.filter((b) => ids.includes(b.room));
  const names = new Set(original.map((b) => b.id));
  next.boxes = next.boxes
    .filter((b) => !names.has(b.id))
    .concat(clone(original));
  // A foreign crate imported for a hidden puzzle must never disappear on reset.
  for (const foreign of next.boxes.filter(
    (b) => ids.includes(b.room) && !names.has(b.id),
  )) {
    const free = (p: Vec) => {
      if (!fitsDoorways(next.rooms[foreign.room]!, p, foreign.size))
        return false;
      for (let x = 0; x < foreign.size; x++)
        for (let y = 0; y < foreign.size; y++)
          for (let z = 0; z < foreign.size; z++) {
            const v: Vec = [p[0] + x, p[1] + y, p[2] + z];
            if (
              !within(next.rooms[foreign.room]!, v) ||
              solid(next, foreign.room, v, foreign.id)
            )
              return false;
          }
      return true;
    };
    if (!free(foreign.pos))
      foreign.pos = nearest(next.rooms[foreign.room]!, foreign.pos, free);
  }
  const room = next.rooms[root]!;
  next.player = {
    ...clone(state.player),
    room: root,
    route: gatewayIndex < 0 ? clone(state.player.route) : clone(state.player.route.slice(0, gatewayIndex + 1)),
    pos: room.spawn ? [...room.spawn] : [Math.floor(room.size / 2), 0, room.size - 2],
    facing: [0, 0, -1],
  };
  next.completed = next.completed.filter((n) => n !== level);
  if (
    solid(next, next.player.room, next.player.pos) ||
    wallBlocksTop(next.rooms[next.player.room]!, next.player.pos)
  )
    next.player.pos = nearest(
      next.rooms[next.player.room]!,
      next.player.pos,
      (p) =>
        !solid(next, next.player.room, p) &&
        !wallBlocksTop(next.rooms[next.player.room]!, p),
    );
  next.message = `「${room.name}」已重新开始，可再次完成挑战。`;
  next.paradox = 'none';
  return next;
}
