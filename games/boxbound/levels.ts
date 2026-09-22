import {
  repairPlayerRoute,
  playerMirrored,
  solid,
  transition,
  initialNestedSpawn,
  type Action,
  type Box,
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
    room.name = definition.name;
    room.hint = definition.hint;
    if (id.startsWith('pp-') && definition.doorWidths) room.doorWidths = clone(definition.doorWidths);
    if (definition.entryRoom) room.entryRoom = definition.entryRoom;
    if (definition.recursiveRoot) room.recursiveRoot = definition.recursiveRoot;
    if (definition.decorations) room.decorations = clone(definition.decorations);
    else delete room.decorations;
    if (definition.floorTiles) room.floorTiles = clone(definition.floorTiles);
  }
  if ((saved.rulesRevision ?? 1) < 9) {
    for (const id of ['pp-hub', 'pp-intro', 'pp-enter', 'pp-empty']) next.rooms[id] = clone(fresh.rooms[id]!);
    for (const box of next.boxes) {
      const definition = fresh.boxes.find((v) => v.id === box.id);
      if (!definition) continue;
      if (box.id.startsWith('pp-gateway-')) Object.assign(box, clone(definition));
      if (definition.levelEntry !== undefined) box.levelEntry = definition.levelEntry;
      if (definition.entryPriority) box.entryPriority = definition.entryPriority;
    }
    const index = next.player.route.findIndex((f) => f.box.startsWith('pp-gateway-'));
    if (index >= 0) {
      const frame = next.player.route[index]!, gate = next.boxes.find((b) => b.id === frame.box)!;
      if (frame.from !== gate.room) {
        const chapter = next.boxes.find((b) => b.inside === gate.room)!;
        next.player.route.splice(index, 0, { box: chapter.id, from: chapter.room, entry: [chapter.pos[0], 0, chapter.pos[2] + 1] });
        frame.from = gate.room; frame.entry = [gate.pos[0], 0, gate.pos[2] + 1];
      }
    }
  }
  if ((saved.rulesRevision ?? 1) < 10) {
    for (const id of ['pp-hub', 'pp-intro', 'pp-enter', 'pp-empty']) {
      const room = next.rooms[id]!, definition = fresh.rooms[id]!;
      const isExit = (p: Vec) => p[0] === Math.floor(room.size / 2) && p[1] === 0 && p[2] === room.size - 1;
      room.walls = room.walls.filter((p) => !isExit(p));
      if (room.barriers) room.barriers = room.barriers.filter((p) => !isExit(p));
      room.exitLabel = definition.exitLabel!;
      room.doorWidths = clone(definition.doorWidths!);
    }
  }
  const resizedGalleries = new Set<string>();
  if ((saved.rulesRevision ?? 1) < 15) {
    // Compact only the galleries. Puzzle interiors, completion and exported
    // objects retain their state; return bookmarks follow the relocated gates.
    const galleries = new Set(fresh.boxes.filter(b => b.levelEntry && next.rooms[b.room]!.size !== fresh.rooms[b.room]!.size).map(b => b.room));
    for (const id of galleries) { next.rooms[id] = clone(fresh.rooms[id]!); resizedGalleries.add(id); }
    for (const box of next.boxes) {
      const definition = fresh.boxes.find(b => b.id === box.id);
      if (definition?.levelEntry && galleries.has(box.room) && box.room === definition.room) box.pos = [...definition.pos];
    }
    for (const frame of next.player.route) if (galleries.has(frame.from)) {
      const gate = next.boxes.find(b => b.id === frame.box && b.room === frame.from);
      if (gate) frame.entry = [gate.pos[0], 0, gate.pos[2] + 1];
    }
  }
  const world = next.rooms.world!;
  if ((saved.rulesRevision ?? 1) < 16) {
    const oldPlate = world.buttons?.find(b=>b.id==='island-button');
    const newPlate = fresh.rooms.world!.buttons!.find(b=>b.id==='island-button')!;
    // Preserve a previously solved entrance even though its plate moves sideways.
    if (oldPlate) for (const box of next.boxes)
      if (box.room==='world' && box.size===1 && box.pos.every((v,i)=>v===oldPlate.pos[i])) box.pos=[...newPlate.pos];
    const starter=next.boxes.find(b=>b.id==='island-weight');
    if (starter?.room==='world' && starter.pos[0]===7 && starter.pos[1]===0 && [13,14].includes(starter.pos[2]))
      starter.pos=[...fresh.boxes.find(b=>b.id==='island-weight')!.pos];
    world.walls=clone(fresh.rooms.world!.walls);
  }
  world.buttons = clone(fresh.rooms.world!.buttons!);
  world.gates = clone(fresh.rooms.world!.gates!);
  world.hint = fresh.rooms.world!.hint;
  // Move only the untouched tutorial weight; preserve crates the player already moved.
  const weight = next.boxes.find((b) => b.id === 'island-weight');
  if ((saved.rulesRevision ?? 1) < 6 && weight?.room === 'world' && weight.pos.every((v, i) => v === [7, 0, 13][i]))
    weight.pos = [7, 0, 14];
  // A relocated gateway may now occupy the old player cell. Move the player
  // first so the generic collision repair cannot displace the authored layout.
  if (resizedGalleries.has(next.player.room)) {
    const room = next.rooms[next.player.room]!;
    if (!within(room, next.player.pos) || solid(next, room.id, next.player.pos) || wallBlocksTop(room, next.player.pos))
      next.player.pos = nearest(room, next.player.pos, p => p[1] === 0 && !solid(next, room.id, p) && !wallBlocksTop(room, p));
  }
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
  if (!within(playerRoom, next.player.pos) || solid(next, playerRoom.id, next.player.pos) ||
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
  repairPlayerRoute(next);
  next.rulesRevision = fresh.rulesRevision!;
  next.message = '旅程已保留，章节布局已更新。Esc 可返回关卡外层。';
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
  const initial = createGame(), next = copyState(state);
  const gatewayIndex = state.player.route.findLastIndex((f) => {
    const b = initial.boxes.find((b) => b.id === f.box);
    return b?.portal && initial.rooms[b.inside!]?.level === level;
  });
  const root = gatewayIndex < 0 ? state.player.room : initial.boxes.find((b) => b.id === state.player.route[gatewayIndex]!.box)!.inside!;
  next.boxes = resetInterior(state, { inside: root }).boxes;
  const room = next.rooms[root]!;
  next.player = {
    ...clone(state.player),
    room: root,
    mirrored: gatewayIndex < 0 ? playerMirrored(state) : (state.player.route[gatewayIndex]!.mirrored ?? false) !== !!next.boxes.find(b => b.id === state.player.route[gatewayIndex]!.box)?.flipped,
    route: gatewayIndex < 0 ? clone(state.player.route) : clone(state.player.route.slice(0, gatewayIndex + 1)),
    pos: room.spawn ? [...room.spawn] : [Math.floor(room.size / 2), 0, room.size - 2],
    facing: [0, 0, -1],
  };
  initialNestedSpawn(next, root);
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

/** Reset only authored contents still inside this puzzle. Exported objects and all
 * parent/sibling state retain identity and position; imported crates are retained. */
export function resetInterior(state: State, gateway: Pick<Box, 'inside'>): State {
  if (!gateway.inside) return state;
  const initial = createGame(), next = copyState(state);
  const level = initial.rooms[gateway.inside]!.level;
  const ids = new Set(Object.values(initial.rooms).filter((r) => r.level === level && level > 0).map((r) => r.id));
  const fresh = new Map(initial.boxes.filter((b) => ids.has(b.room)).map((b) => [b.id, b]));
  next.boxes = next.boxes.map((b) => ids.has(b.room) && fresh.has(b.id) ? clone(fresh.get(b.id)!) : b);
  for (const b of next.boxes.filter((v) => ids.has(v.room))) {
    const free = (p: Vec) => {
      for (let x = 0; x < b.size; x++) for (let y = 0; y < b.size; y++) for (let z = 0; z < b.size; z++) {
        const at: Vec = [p[0] + x, p[1] + y, p[2] + z];
        if (!within(next.rooms[b.room]!, at) || solid(next, b.room, at, b.id)) return false;
      }
      return fitsDoorways(next.rooms[b.room]!, p, b.size);
    };
    if (!free(b.pos)) b.pos = nearest(next.rooms[b.room]!, b.pos, free);
  }
  return next;
}
export function advanceGame(state: State, action: Action): ReturnType<typeof transition> {
  return transition(state, action, (draft, gateway) => {
    const reset = resetInterior(draft, gateway);
    draft.boxes = reset.boxes;
  });
}
