import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
registerHooks({
  resolve(specifier, context, next) {
    return next(
      specifier.startsWith('./') && !/\.[a-z]+$/i.test(specifier)
        ? `${specifier}.ts`
        : specifier,
      context,
    );
  },
});
const { installWorldMap, parseWorldMap, loadWorldMap } = await import('../boxbound/world-map.ts');
const authoredMap = await loadWorldMap(new URL('../boxbound/levels/index.json', import.meta.url), async url => JSON.parse(readFileSync(url, 'utf8')));
installWorldMap(authoredMap);
const { createGame, resetLevel, advanceGame, resetInterior } = await import('../boxbound/levels.ts');
const { transition, clone, validState, goalsSatisfied, classifyScaleCycle, reverseTransfers } =
  await import('../boxbound/model.ts');
const { platePressed, gatePowered, gateOpen, gateBlocks } =
  await import('../boxbound/model.ts');
const { BoxboundSaves } = await import('../boxbound/saves.ts');
const {
  movementPose,
  movementDuration,
  wallPieces,
  boxTravel,
  boxTravelPose,
  BOX_TRANSFER_MS,
} = await import('../boxbound/visuals.ts');
const { MemorySaveBackend } = await import('@haiyue/engine/save');
const dirs = { w: [0, 0, -1], s: [0, 0, 1], a: [-1, 0, 0], d: [1, 0, 0] };
test('up/down motion clears the full body around ledges in all directions, including late airborne steering', () => {
  for (const d of Object.values(dirs))
    for (const initialLift of [0, 0.25, 0.7, 0.99]) {
      const from = [0, initialLift, 0],
        top = [d[0], 1, d[2]];
      for (const descending of [false, true]) {
        const start = descending ? top : from,
          end = descending ? [0, 0, 0] : top;
        const duration = movementDuration(start, end, !descending);
        for (let ms = 0; ms <= duration; ms++) {
          const pose = movementPose(start, end, ms, !descending);
          const p = pose.position,
            half = 0.41 * (1 + pose.squash);
          const intersectsXZ =
            Math.abs(p[0] - top[0]) < half + 0.5 &&
            Math.abs(p[2] - top[2]) < half + 0.5;
          const feet = p[1] + 0.08 * (1 - pose.squash);
          assert.ok(
            !intersectsXZ || feet >= 1.045,
            `body penetrated ledge at ${ms}ms: ${p}`,
          );
          assert.ok(p[1] >= Math.min(start[1], end[1]));
        }
        assert.deepEqual(
          movementPose(start, end, duration, !descending).position,
          end,
        );
      }
    }
});
test('movement endpoints and phase joins are continuous, with bounded landing and falling crates', () => {
  for (const [from, to, jump] of [
    [[0, 0, 0], [1, 1, 0], true],
    [[0, 3, 0], [1, 0, 0], false],
    [[0, 0.9, 0], [1, 0, 0], true],
  ]) {
    const duration = movementDuration(from, to, jump);
    assert.deepEqual(movementPose(from, to, 0, jump).position, from);
    let last = from;
    for (let ms = 1; ms <= duration; ms++) {
      const p = movementPose(from, to, ms, jump).position;
      assert.ok(Math.hypot(...p.map((v, i) => v - last[i])) < 0.04);
      last = p;
    }
    assert.deepEqual(last, to);
    assert.equal(movementPose(from, to, duration, jump).active, false);
  }
  const box = movementPose([0, 1, 0], [1, 0, 0], 250, false, false, 420);
  assert.equal(box.position[0], 1);
  assert.ok(box.position[1] < 1);
  assert.equal(box.squash, 0);
});
function level(n) {
  const s = createGame();
  s.player = {
    room: `level-${n}`,
    pos: [3, 0, 6],
    facing: [0, 0, -1],
    route: [{ box: `gate-${n}`, from: 'world', entry: [0, 0, 0] }],
  };
  return s;
}
function play(s, path) {
  for (const c of path.split(' ')) {
    const action =
      c === 'k'
        ? { type: 'dive' }
        : c === 'e'
          ? { type: 'leave' }
          : {
              type: 'move',
              dir: dirs[c.toLowerCase()],
              jump: c === c.toUpperCase(),
            };
    const result = transition(s, action);
    assert.equal(
      result.changed,
      true,
      `blocked ${c} at ${s.player.room} ${s.player.pos}: ${result.state.message}`,
    );
    s = result.state;
    assert.ok(validState(s), `invalid after ${c}`);
  }
  return s;
}
const solutions = {
  1: 'w w a w d s d',
  2: 'w w w a w d s d w a',
  3: 'w a w W d s D',
  4: 'w w W k a w d e d',
  5: 'w w a w d k d d e',
  6: 'w w w w a w d s d d d e e d',
  7: 'w w w w d w d e d',
  8: 'w w a a w d d e a',
  9: 'w w a w d s d',
  10: 'w w w w a w d e a w w D d s s',
};
for (const [n, path] of Object.entries(solutions))
  test(`Boxbound level ${n}: authored solution completes both crate and player goals`, () => {
    const s = play(level(Number(n)), path);
    assert.ok(
      s.completed.includes(Number(n)),
      JSON.stringify({
        player: s.player,
        boxes: s.boxes.filter((b) => s.rooms[b.room].level === Number(n)),
      }),
    );
  });
test('Boxbound graph is valid and all rooms are cubic with ten independent world gates', () => {
  const s = createGame();
  assert.ok(validState(s));
  assert.equal(
    s.boxes.filter((b) => b.room === 'world' && b.inside && !b.portal).length,
    10,
  );
  assert.equal(Object.values(s.rooms).filter((r) => r.level === 0).length, 10);
});
test('failed pushes are atomic and leave initial state untouched', () => {
  const s = level(1);
  s.player.pos = [3, 0, 3];
  s.boxes.find((b) => b.id === 'crate-1').pos = [4, 0, 3];
  s.rooms['level-1'].walls.push([5, 0, 3]);
  const before = clone(s);
  const result = transition(s, { type: 'move', dir: dirs.d });
  assert.equal(result.changed, false);
  assert.deepEqual(s, before);
  assert.deepEqual(result.state.boxes, before.boxes);
});
test('a box on target alone cannot complete the level', () => {
  const s = level(1);
  s.boxes.find((b) => b.id === 'crate-1').pos = [4, 0, 3];
  assert.ok(goalsSatisfied(s, 1));
  assert.deepEqual(s.completed, []);
});
test('jump is exactly one voxel and ceilings block it', () => {
  let s = level(3);
  s.player.pos = [2, 0, 4];
  assert.equal(transition(s, { type: 'move', dir: dirs.w }).changed, false);
  let t = transition(s, { type: 'move', dir: dirs.w, jump: true });
  assert.deepEqual(t.state.player.pos, [2, 1, 3]);
  s.rooms['level-3'].walls.push([2, 1, 4]);
  assert.equal(
    transition(s, { type: 'move', dir: dirs.w, jump: true }).changed,
    false,
  );
});
test('self references remain finite data and signal contraction / expansion', () => {
  let s = level(9);
  s.player.pos = [1, 0, 2];
  s.player.facing = dirs.w;
  const count = Object.keys(s.rooms).length;
  s = transition(s, { type: 'dive' }).state;
  assert.equal(s.paradox, 'infinitesimal');
  assert.equal(s.player.route.length, 2);
  assert.equal(Object.keys(s.rooms).length, count);
  s = transition(s, { type: 'leave' }).state;
  assert.equal(s.paradox, 'infinite');
  assert.equal(s.player.route.length, 1);
  assert.ok(validState(s));
});
test('reset restores exported boxes and all nested rooms without affecting other levels', () => {
  let s = play(level(7), 'w w w w d w d');
  assert.equal(s.boxes.find((b) => b.id === 'gift-7').room, 'level-7');
  s = resetLevel(s);
  assert.equal(s.boxes.find((b) => b.id === 'gift-7').room, 'inner-7');
  assert.ok(validState(s));
  assert.deepEqual(
    s.boxes.filter((b) => b.room === 'level-2'),
    createGame().boxes.filter((b) => b.room === 'level-2'),
  );
});
test('five engine save slots round-trip independently and reject malformed state', async () => {
  const saves = new BoxboundSaves(new MemorySaveBackend());
  for (let i = 1; i <= 5; i++) {
    const s = level(i);
    s.moves = i;
    await saves.save(i, s);
  }
  assert.equal((await saves.summaries()).length, 5);
  for (let i = 1; i <= 5; i++) assert.equal((await saves.load(i)).moves, i);
  await assert.rejects(saves.save(6, createGame()));
  const invalid = createGame();
  invalid.player.room = 'missing';
  assert.equal(validState(invalid), false);
  await assert.rejects(saves.save(1, invalid));
  assert.equal((await saves.load(1)).moves, 1);
  await saves.service.dispose();
});
test('save validation rejects broken references, coordinates and corrupt routes', () => {
  for (const mutate of [
    (s) => (s.boxes[0].inside = 'missing'),
    (s) => (s.player.pos = [NaN, 0, 0]),
    (s) =>
      (s.player.route = [{ box: 'missing', from: 'world', entry: [0, 0, 0] }]),
    (s) => (s.boxes[0].size = -1),
    (s) => (s.rooms.world.goals = null),
  ]) {
    const s = createGame();
    mutate(s);
    assert.equal(validState(s), false);
  }
});

test('cycle scaling distinguishes contraction, expansion and neutral fixed points', () => {
  assert.equal(classifyScaleCycle([1 / 7, 1 / 5]), 'infinitesimal');
  assert.equal(classifyScaleCycle([4, 1 / 2]), 'infinite');
  assert.equal(classifyScaleCycle([2, 1 / 2]), 'cycle');
  assert.equal(classifyScaleCycle(Array(3000).fill(0.1)), 'infinitesimal');
  assert.throws(() => classifyScaleCycle([0]));
});
test('large cubes collide across their complete footprint, and push occupied leading faces', () => {
  const s = createGame();
  s.boxes = [];
  s.player.pos = [1, 0, 5];
  s.rooms.world.walls = [];
  s.boxes.push({
    id: 'large',
    room: 'world',
    pos: [2, 0, 5],
    size: 2,
    inside: null,
    fixed: false,
    required: false,
  });
  s.boxes.push({
    id: 'small',
    room: 'world',
    pos: [4, 0, 6],
    size: 1,
    inside: null,
    fixed: false,
    required: false,
  });
  const result = transition(s, { type: 'move', dir: dirs.d });
  assert.ok(result.changed);
  assert.deepEqual(
    result.state.boxes.map((b) => b.pos),
    [
      [3, 0, 5],
      [5, 0, 6],
    ],
  );
  s.rooms.world.walls.push([4, 1, 6]);
  const blocked = transition(s, { type: 'move', dir: dirs.d });
  assert.equal(blocked.changed, false);
  assert.deepEqual(blocked.state.boxes, s.boxes);
});
test('corrupt nested save values never throw in the validator', () => {
  for (const mutate of [
    (s) => (s.boxes = [null]),
    (s) => (s.rooms = null),
    (s) => (s.player.route = [null]),
    (s) => (s.completed = null),
  ]) {
    const s = createGame();
    mutate(s);
    assert.equal(validState(s), false);
  }
});

const { entrances, goalMatches, solid, canJump } =
  await import('../boxbound/model.ts');
const { upgradeState } = await import('../boxbound/levels.ts');
const {
  wallRuns,
  portalPose,
  PORTAL_MS,
  jumpPose,
  JUMP_MS,
  celebrationPose,
  CELEBRATION_MS,
} = await import('../boxbound/visuals.ts');
test('colors are actual goal constraints: swapping blue and coral cannot finish level 2', () => {
  const s = level(2),
    r = s.rooms['level-2'],
    a = s.boxes.find((b) => b.id === 'crate-2a'),
    b = s.boxes.find((b) => b.id === 'crate-2b');
  a.pos = [4, 0, 1];
  b.pos = [2, 0, 1];
  assert.equal(goalsSatisfied(s, 2), false);
  assert.equal(goalMatches(s, r, 0), false);
  a.pos = [2, 0, 1];
  b.pos = [4, 0, 1];
  assert.equal(goalsSatisfied(s, 2), true);
  b.fixed = true;
  assert.equal(goalsSatisfied(s, 2), false);
});
test('one-high walls have flat narrow doors that admit players but block whole crates', () => {
  for (let n = 1; n <= 10; n++) {
    const s = level(n),
      r = s.rooms[`level-${n}`];
    assert.deepEqual(
      entrances(r).map((e) => e.height),
      [0, 0, 0, 0],
    );
    assert.ok(r.walls.every((p) => p[1] === 0));
    s.boxes = s.boxes.filter((b) => !b.required);
    s.player.pos = [3, 0, 4];
    s.boxes.push({
      id: 'test-crate',
      room: r.id,
      pos: [3, 0, 5],
      size: 1,
      fixed: false,
      required: false,
      inside: null,
    });
    const a = transition(s, { type: 'move', dir: dirs.s });
    assert.equal(a.changed, false);
    assert.deepEqual(a.state.boxes.at(-1).pos, [3, 0, 5]);
    assert.deepEqual(
      entrances(r).map((e) => e.width),
      [0.82, 0.82, 0.82, 0.82],
    );
    s.boxes.pop();
    s.player.pos = [3, 0, 5];
    const walk = transition(s, { type: 'move', dir: dirs.s });
    assert.deepEqual(walk.state.player.pos, [3, 0, 6]);
    assert.equal(
      transition(walk.state, { type: 'move', dir: dirs.s }).state.player.room,
      'world',
    );
  }
});
test('studded wall tops reject jumping and same-height approach from a crate', () => {
  const s = level(1);
  s.player.pos = [1, 0, 1];
  assert.equal(
    transition(s, { type: 'move', dir: dirs.a, jump: true }).changed,
    false,
  );
  s.boxes.find((b) => b.id === 'crate-1').pos = [1, 0, 1];
  s.player.pos = [1, 1, 1];
  assert.equal(transition(s, { type: 'move', dir: dirs.a }).changed, false);
  assert.equal(
    transition(s, { type: 'move', dir: dirs.a, jump: true }).changed,
    false,
  );
});
test('in-place jump requires headroom and leaves deterministic state untouched', () => {
  const s = level(1),
    before = clone(s);
  assert.equal(canJump(s), true);
  assert.deepEqual(s, before);
  s.rooms['level-1'].walls.push([3, 1, 6]);
  assert.equal(canJump(s), false);
  const pose = jumpPose(JUMP_MS / 2);
  assert.equal(pose.lift, 1);
  assert.ok(pose.active);
  assert.equal(jumpPose(JUMP_MS).active, false);
  assert.ok(jumpPose(JUMP_MS).lift < 1e-10);
});
test('authored open passages still allow cross-level crate transport for hidden puzzles', () => {
  const s = level(1),
    r = s.rooms['level-1'];
  r.doorWidths[2] = 1;
  s.player.pos = [3, 0, 4];
  s.boxes.find((b) => b.id === 'crate-1').pos = [3, 0, 5];
  const a = transition(s, { type: 'move', dir: dirs.s });
  const b = transition(a.state, { type: 'move', dir: dirs.s });
  assert.equal(b.changed, true);
  assert.equal(b.state.boxes.find((b) => b.id === 'crate-1').room, 'world');
  assert.ok(validState(b.state));
});
test('connected wall runs exactly cover collision voxels without holes, overlaps or bridging openings', () => {
  for (const room of Object.values(createGame().rooms)) {
    const seen = new Set();
    for (const run of wallRuns(room))
      for (let x = run.min[0] + 0.5; x < run.max[0]; x++)
        for (let y = run.min[1]; y < run.max[1]; y++)
          for (let z = run.min[2] + 0.5; z < run.max[2]; z++) {
            const key = [x, y, z].join();
            assert.ok(!seen.has(key));
            seen.add(key);
          }
    assert.deepEqual(seen, new Set(room.walls.map((p) => p.join())));
  }
});
test('portal zoom stays visible and advances monotonically without a mid-transition scene fade', () => {
  const start = portalPose(0),
    before = portalPose(PORTAL_MS * 0.3),
    middle = portalPose(PORTAL_MS / 2),
    end = portalPose(PORTAL_MS);
  assert.equal(start.opacity, 1);
  assert.equal(start.phase, 0);
  assert.equal(before.switched, false);
  assert.ok(before.phase > 0 && before.phase < 0.5);
  assert.equal(middle.opacity, 1);
  assert.equal(middle.switched, true);
  assert.equal(end.opacity, 1);
  assert.equal(end.active, false);
  assert.equal(end.phase, 1);
});
test('celebration has lift, a full spin, laughter and a bounded return to rest', () => {
  const air = celebrationPose(600);
  assert.ok(air.active && air.laugh && air.lift > 1 && air.yaw > 0);
  const end = celebrationPose(CELEBRATION_MS);
  assert.equal(end.active, false);
  assert.equal(end.lift, 0);
  assert.equal(end.yaw, Math.PI * 2);
  assert.equal(end.laugh, false);
});
test('old five-slot journeys migrate geometry and colors without resetting progress or exported crates', async () => {
  let old = level(7);
  old.boxes = old.boxes.filter(b => !b.id.startsWith('pp-'));
  for (const id of Object.keys(old.rooms)) if (id.startsWith('pp-')) delete old.rooms[id];
  delete old.rulesRevision;
  old.completed = [1, 2];
  old.moves = 42;
  for (const r of Object.values(old.rooms)) {
    delete r.goalColors;
    const n = r.size,
      m = Math.floor(n / 2);
    r.walls = r.walls.filter(
      (p) =>
        !(
          (p[0] === m && (p[2] === 0 || p[2] === n - 1)) ||
          (p[2] === m && (p[0] === 0 || p[0] === n - 1))
        ),
    );
  }
  for (const b of old.boxes) delete b.color;
  old.player.pos = [3, 0, 6];
  const gift = old.boxes.find((b) => b.id === 'gift-7');
  gift.room = 'world';
  gift.pos = [0, 0, 0];
  const migrated = upgradeState(old);
  assert.ok(validState(migrated));
  assert.deepEqual(migrated.completed, [1, 2]);
  assert.equal(migrated.moves, 42);
  assert.equal(migrated.boxes.find((b) => b.id === 'gift-7').room, 'world');
  assert.equal(migrated.boxes.find((b) => b.id === 'gift-7').color, 'gold');
  assert.ok(!solid(migrated, migrated.player.room, migrated.player.pos));
  assert.equal(old.rulesRevision, undefined);
  assert.deepEqual(upgradeState(migrated), migrated);
  const saves = new BoxboundSaves(new MemorySaveBackend());
  await saves.save(1, old);
  assert.equal((await saves.load(1)).rulesRevision, 13);
  await saves.service.dispose();
});

test('reset never deletes foreign crates imported from another level', () => {
  const s = level(1),
    foreign = s.boxes.find((b) => b.id === 'crate-2a');
  foreign.room = 'level-1';
  foreign.pos = [3, 0, 3];
  s.boxes.find((b) => b.id === 'crate-1').pos = [4, 0, 3];
  const next = resetLevel(s),
    kept = next.boxes.find((b) => b.id === foreign.id);
  assert.ok(kept);
  assert.equal(kept.room, 'level-1');
  assert.equal(next.boxes.length, s.boxes.length);
  assert.notDeepEqual(kept.pos, next.boxes.find((b) => b.id === 'crate-1').pos);
  assert.ok(validState(next));
});
test('door geometry directions and traversal both respect a closed side', () => {
  const s = createGame(),
    room = s.rooms['level-1'];
  room.walls.push([3, 0, 6]);
  assert.equal(
    entrances(room).some((e) => e.direction[2] === 1),
    false,
  );
  s.player.pos = [2, 0, 6];
  s.player.facing = [0, 0, -1];
  const before = clone(s);
  const result = transition(s, { type: 'dive' });
  assert.equal(result.changed, false);
  assert.deepEqual(result.state.player.room, before.player.room);
});

test('revision 2 migration removes tall walls and sills and settles unsupported actors', () => {
  const old = level(1);
  old.rulesRevision = 2;
  old.rooms['level-1'].walls.push([0, 1, 0], [0, 2, 0], [3, 0, 6]);
  old.player.pos = [3, 1, 6];
  const migrated = upgradeState(old);
  assert.deepEqual(migrated.player.pos, [3, 0, 6]);
  assert.equal(
    migrated.rooms['level-1'].walls.every((p) => p[1] === 0),
    true,
  );
  assert.equal(migrated.rooms['level-1'].barriers.length, 20);
  assert.ok(validState(migrated));
  assert.deepEqual(old.player.pos, [3, 1, 6]);
});

test('all four doorway widths gate crate export atomically; full-width permits transport', () => {
  const dirs = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  for (let i = 0; i < 4; i++) {
    const d = dirs[i],
      s = level(1),
      r = s.rooms['level-1'];
    s.player.pos = [3 + d[0], 0, 3 + d[2]];
    const crate = s.boxes.find((b) => b.id === 'crate-1');
    crate.pos = [3 + 2 * d[0], 0, 3 + 2 * d[2]];
    const before = clone(s);
    assert.equal(transition(s, { type: 'move', dir: d }).changed, false);
    assert.deepEqual(s, before);
    r.doorWidths[i] = 1;
    const step = transition(s, { type: 'move', dir: d });
    assert.ok(step.changed);
    const out = transition(step.state, { type: 'move', dir: d });
    assert.ok(out.changed);
    assert.equal(out.state.boxes.find((b) => b.id === crate.id).room, 'world');
    assert.ok(validState(out.state));
  }
});
test('a narrow receiving room rejects incoming crates while its character entrance remains open', () => {
  const s = level(8);
  s.player.pos = [1, 0, 3];
  s.rooms['inner-8'].doorWidths[1] = 0.82;
  const blocked = transition(s, { type: 'move', dir: dirs.d });
  assert.equal(blocked.changed, false);
  assert.deepEqual(blocked.state.boxes, s.boxes);
  s.rooms['inner-8'].doorWidths[1] = 1;
  assert.equal(
    transition(s, { type: 'move', dir: dirs.d }).state.boxes.find(
      (b) => b.id === 'crate-8',
    ).room,
    'inner-8',
  );
});
test('R inside a nested room stays there and preserves the parent layout and other completed levels', () => {
  const s = play(level(6), 'w w w w');
  assert.equal(s.player.room, 'inner-6');
  s.boxes.find((b) => b.id === 'gift-6').pos = [1, 0, 1];
  const parent = s.boxes.filter((b) => b.room === 'level-6');
  const route = clone(s.player.route);
  s.completed = [1, 6];
  const reset = resetLevel(s);
  assert.equal(reset.player.room, 'inner-6');
  assert.deepEqual(reset.player.route, route);
  assert.deepEqual(
    reset.boxes.filter((b) => b.room === 'level-6'),
    parent,
  );
  assert.deepEqual(reset.completed, [1]);
  assert.deepEqual(reset.boxes.find((b) => b.id === 'gift-6').pos, [2, 0, 2]);
  assert.ok(validState(reset));
});
test('every completed independent level can be replayed and completed again after R', () => {
  for (const [n, path] of Object.entries(solutions)) {
    const done = play(level(Number(n)), path);
    const reset = resetLevel(done);
    assert.equal(reset.completed.includes(Number(n)), false);
    assert.equal(reset.player.room, `level-${n}`);
    assert.ok(
      play(reset, path.split(' ').slice(1).join(' ')).completed.includes(
        Number(n),
      ),
    );
  }
});
test('revision 3 migrates narrow door geometry without losing a crate resting in an old opening', () => {
  const s = level(1);
  s.rulesRevision = 3;
  s.boxes.find((b) => b.id === 'crate-1').pos = [3, 0, 6];
  s.player.pos = [3, 0, 5];
  const next = upgradeState(s);
  assert.equal(next.rulesRevision, 13);
  assert.equal(next.boxes.length, s.boxes.length);
  assert.notDeepEqual(
    next.boxes.find((b) => b.id === 'crate-1').pos,
    [3, 0, 6],
  );
  assert.ok(validState(next));
});

test('after exporting a crate the player can push it again while walking out through any side', () => {
  for (const d of Object.values(dirs)) {
    const s = level(1),
      r = s.rooms['level-1'];
    r.doorWidths = [1, 1, 1, 1];
    const owner = s.boxes.find((b) => b.id === 'gate-1');
    owner.pos = [8, 0, 8];
    s.boxes = s.boxes.filter((b) => b.room !== 'world' || b.id === owner.id);
    const crate = s.boxes.find((b) => b.id === 'crate-1');
    crate.pos = [3 + 3 * d[0], 0, 3 + 3 * d[2]];
    s.player.pos = [3 + 2 * d[0], 0, 3 + 2 * d[2]];
    const original = clone(s);
    const out = transition(s, { type: 'move', dir: d });
    assert.ok(out.changed);
    assert.equal(out.transfers.length, 1);
    assert.equal(out.transfers[0].entering, false);
    const again = transition(out.state, { type: 'move', dir: d });
    assert.ok(again.changed);
    assert.equal(again.state.player.room, 'world');
    assert.deepEqual(again.state.player.pos, [8 + d[0], 0, 8 + d[2]]);
    assert.deepEqual(again.state.boxes.find((b) => b.id === crate.id).pos, [
      8 + 2 * d[0],
      0,
      8 + 2 * d[2],
    ]);
    assert.ok(validState(again.state));
    assert.deepEqual(s, original);
  }
});

test('exit pushes exterior chains atomically and blocked exits preserve all boxes and transfers', () => {
  for (const block of ['none', 'wall', 'fixed']) {
    const s = level(1),
      owner = s.boxes.find((b) => b.id === 'gate-1');
    s.rooms['level-1'].doorWidths = [1, 1, 1, 1];
    owner.pos = [8, 0, 8];
    s.boxes = s.boxes.filter((b) => b.room !== 'world' || b.id === owner.id);
    s.player.pos = [6, 0, 3];
    for (let i = 1; i <= 2; i++)
      s.boxes.push({
        id: 'outside-' + i,
        room: 'world',
        pos: [8 + i, 0, 8],
        size: 1,
        inside: null,
        fixed: block === 'fixed' && i === 2,
        required: false,
      });
    if (block === 'wall') s.rooms.world.walls.push([11, 0, 8]);
    const before = clone(s),
      result = transition(s, { type: 'move', dir: dirs.d });
    assert.equal(result.changed, block === 'none');
    if (block === 'none') {
      assert.deepEqual(
        result.state.boxes.find((b) => b.id === 'outside-1').pos,
        [10, 0, 8],
      );
      assert.deepEqual(
        result.state.boxes.find((b) => b.id === 'outside-2').pos,
        [11, 0, 8],
      );
      assert.ok(validState(result.state));
    } else {
      assert.deepEqual(result.state.boxes, before.boxes);
      assert.deepEqual(result.state.player.pos, before.player.pos);
      assert.deepEqual(result.transfers, []);
    }
    assert.deepEqual(s, before);
  }
});

test('export can advance an exterior crate and transfer events have exact room endpoints', () => {
  const s = level(7);
  s.player = {
    room: 'inner-7',
    pos: [3, 0, 2],
    facing: dirs.d,
    route: [
      ...s.player.route,
      { box: 'room-7', from: 'level-7', entry: [3, 0, 4] },
    ],
  };
  s.boxes.push({
    id: 'outside',
    room: 'level-7',
    pos: [4, 0, 3],
    size: 1,
    inside: null,
    fixed: false,
    required: false,
  });
  const result = transition(s, { type: 'move', dir: dirs.d });
  assert.ok(result.changed);
  assert.deepEqual(
    result.state.boxes.find((b) => b.id === 'outside').pos,
    [5, 0, 3],
  );
  assert.deepEqual(result.transfers[0], {
    box: 'gift-7',
    container: 'room-7',
    fromRoom: 'inner-7',
    toRoom: 'level-7',
    from: [4, 0, 2],
    to: [4, 0, 3],
    direction: dirs.d,
    entering: false,
  });
  assert.ok(validState(result.state));
});

test('crate crossings shrink before entry and emerge before growth in either visible room', () => {
  const incoming = level(8);
  incoming.player.pos = [1, 0, 3];
  const outgoing = level(7);
  outgoing.player = {
    room: 'inner-7',
    pos: [3, 0, 2],
    facing: dirs.d,
    route: [
      ...outgoing.player.route,
      { box: 'room-7', from: 'level-7', entry: [3, 0, 4] },
    ],
  };
  for (const state of [incoming, outgoing]) {
    const result = transition(state, { type: 'move', dir: dirs.d });
    assert.ok(result.changed);
    assert.equal(result.transfers.length, 1);
    const transfer = result.transfers[0];
    for (const room of [transfer.fromRoom, transfer.toRoom]) {
      const travel = boxTravel(transfer, room, state, result.state);
      const start = boxTravelPose(travel, 0),
        end = boxTravelPose(travel, BOX_TRANSFER_MS);
      assert.deepEqual(start.position, travel.from);
      assert.deepEqual(end.position, travel.to);
      assert.equal(end.scale, travel.endScale);
      assert.equal(end.opacity, 1);
      const early = boxTravelPose(travel, BOX_TRANSFER_MS * 0.3);
      if (transfer.entering) {
        assert.deepEqual(early.position, travel.from);
        assert.ok(early.scale < start.scale);
      } else {
        assert.equal(early.scale, start.scale);
        assert.notDeepEqual(early.position, start.position);
      }
      for (let t = 0; t <= BOX_TRANSFER_MS; t++) {
        const pose = boxTravelPose(travel, t);
        assert.ok(
          Number.isFinite(pose.scale) && pose.scale > 0 && pose.scale <= Math.max(travel.startScale, travel.endScale),
        );
        assert.ok(pose.opacity >= 0 && pose.opacity <= 1);
      }
    }
  }
});

test('rounded wall join fillers keep straight, L and T intersections flat without bridging empty cells', () => {
  for (const walls of [
    [
      [0, 0, 0],
      [1, 0, 0],
    ],
    [
      [0, 0, 0],
      [1, 0, 0],
      [0, 0, 1],
    ],
    [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [1, 0, 1],
    ],
  ]) {
    const room = {
      ...createGame().rooms['level-1'],
      size: 7,
      walls,
      doorWidths: [1, 1, 1, 1],
    };
    const pieces = wallPieces(room);
    const inside = (p) =>
      pieces.some(({ min, max }) => {
        const radius = Math.min(0.08, ...min.map((v, i) => (max[i] - v) / 2));
        return (
          Math.hypot(
            ...p.map((v, i) =>
              Math.max(min[i] + radius - v, 0, v - (max[i] - radius)),
            ),
          ) <=
          radius + 1e-9
        );
      });
    for (const a of walls)
      for (const b of walls) {
        if (Math.abs(a[0] - b[0]) + Math.abs(a[2] - b[2]) !== 1) continue;
        assert.ok(
          inside([(a[0] + b[0]) / 2, 1, (a[2] + b[2]) / 2]),
          'join top must remain flat',
        );
      }
    for (let x = 0; x < 4; x++)
      for (let z = 0; z < 4; z++)
        assert.equal(
          inside([x, 0.5, z]),
          walls.some((w) => w[0] === x && w[2] === z),
        );
  }
});

test('pressure plate opens for a player and closes immediately after departure; closed bars cannot be walked or jumped through', () => {
  const start = createGame(),
    gate = start.rooms.world.gates[0],
    plate = start.rooms.world.buttons[0];
  assert.ok(!gateOpen(start, 'world', gate));
  const pressed = play(start, 'w');
  assert.ok(
    platePressed(pressed, 'world', plate) &&
      gatePowered(pressed, 'world', gate),
  );
  const released = play(pressed, 's');
  assert.ok(!gateOpen(released, 'world', gate));
  released.player.pos = [8, 0, 11];
  for (const jump of [false, true]) {
    const result = transition(released, { type: 'move', dir: dirs.s, jump });
    assert.equal(result.changed, false);
    assert.deepEqual(result.state.player.pos, released.player.pos);
  }
});
test('a crate holds a button, the player can replace its weight, and a large crate presses with its base footprint only', () => {
  const start = createGame(),
    plate = start.rooms.world.buttons[0],
    gate = start.rooms.world.gates[0];
  const held = play(start, 'a a w d');
  assert.ok(
    platePressed(held, 'world', plate) && gateOpen(held, 'world', gate),
  );
  assert.notDeepEqual(held.player.pos, plate.pos);
  const replaced = play(held, 'd');
  assert.ok(gatePowered(replaced, 'world', gate));
  const released = play(replaced, 's');
  assert.ok(!gateOpen(released, 'world', gate));
  const big = clone(start);
  big.rooms.world.walls = [];
  big.rooms.world.barriers = [];
  const box = big.boxes.find((b) => b.id === 'island-weight');
  box.size = 2;
  box.pos = [7, 0, 13];
  assert.ok(platePressed(big, 'world', plate));
  box.pos[1] = 1;
  assert.ok(!platePressed(big, 'world', plate));
});
test('an unpowered gate waits for a player or box in its doorway and closes when the cell clears', () => {
  const start = createGame(),
    gate = start.rooms.world.gates[0];
  const inside = clone(start);
  inside.player.pos = [...gate.pos];
  assert.ok(
    !gatePowered(inside, 'world', gate) && gateOpen(inside, 'world', gate),
  );
  assert.ok(validState(inside));
  const beyond = play(inside, 's');
  assert.ok(!gateOpen(beyond, 'world', gate));
  const blocked = transition(beyond, { type: 'move', dir: dirs.w });
  assert.equal(blocked.changed, false);
  const box = start.boxes.find((b) => b.id === 'island-weight');
  box.pos = [8, 0, 12];
  start.player.pos = [8, 0, 13];
  assert.ok(
    !gatePowered(start, 'world', gate) && gateOpen(start, 'world', gate),
  );
  const pushed = play(start, 'w s a');
  assert.ok(
    !gatePowered(pushed, 'world', gate) && !gateOpen(pushed, 'world', gate),
  );
});
test('gate channels are local to their room and any linked button can hold them open', () => {
  const s = createGame(),
    room = s.rooms.world,
    gate = room.gates[0];
  room.buttons.push({ id: 'second', pos: [2, 0, 2], channel: 'island' });
  s.player.pos = [2, 0, 2];
  assert.ok(gateOpen(s, 'world', gate));
  room.buttons[1].channel = 'different';
  assert.ok(!gateOpen(s, 'world', gate));
  s.rooms['level-1'].buttons = [
    { id: 'foreign', pos: [2, 0, 2], channel: 'island' },
  ];
  s.player.room = 'level-1';
  assert.ok(!gateOpen(s, 'world', gate));
});
test('closed gates block full crate collisions and failed pushes preserve the mechanism', () => {
  const s = createGame();
  s.player.pos = [8, 0, 10];
  const box = s.boxes.find((b) => b.id === 'island-weight');
  box.pos = [8, 0, 11];
  const before = clone(s),
    result = transition(s, { type: 'move', dir: dirs.s });
  assert.equal(result.changed, false);
  assert.deepEqual(result.state.boxes, before.boxes);
  assert.ok(gateBlocks(result.state, 'world', [8, 0, 12]));
  assert.deepEqual(s, before);
});
test('pressure mechanisms survive five-slot saves and revision 4 upgrades preserve progress and exported crates', async () => {
  const saves = new BoxboundSaves(new MemorySaveBackend()),
    held = play(createGame(), 'a a w d');
  for (let slot = 1; slot <= 5; slot++) {
    await saves.save(slot, held);
    const loaded = await saves.load(slot);
    assert.ok(gatePowered(loaded, 'world', loaded.rooms.world.gates[0]));
    assert.deepEqual(loaded.boxes, held.boxes);
  }
  const old = createGame();
  old.rulesRevision = 4;
  old.rooms.world.walls = [];
  old.rooms.world.barriers = [];
  delete old.rooms.world.buttons;
  delete old.rooms.world.gates;
  old.boxes = old.boxes.filter((b) => b.id !== 'island-weight');
  const exported = old.boxes.find((b) => b.id === 'crate-1');
  exported.room = 'world';
  exported.pos = [7, 0, 12];
  old.completed = [2, 4];
  old.moves = 38;
  old.player.pos = [6, 0, 12];
  const snapshot = clone(old),
    next = upgradeState(old);
  assert.ok(validState(next));
  assert.equal(next.rulesRevision, 13);
  assert.equal(next.moves, 38);
  assert.deepEqual(next.completed, [2, 4]);
  assert.deepEqual(old, snapshot);
  const kept = next.boxes.find((b) => b.id === exported.id);
  assert.equal(kept.room, 'world');
  assert.equal(kept.pos[1], 0);
  assert.ok(!solid(next, 'world', kept.pos, kept.id));
  assert.ok(!solid(next, 'world', next.player.pos));
  assert.deepEqual(upgradeState(next), next);
});
test('malformed mechanism positions, channels, IDs and wall overlaps are rejected in saves', () => {
  for (const edit of [
    (s) => (s.rooms.world.gates[0].channel = 'missing'),
    (s) => (s.rooms.world.buttons[0].pos = [8, 0, 99]),
    (s) => (s.rooms.world.gates[0].axis = 'y'),
    (s) => s.rooms.world.buttons.push(clone(s.rooms.world.buttons[0])),
    (s) => (s.rooms.world.buttons[0].pos = [7, 0, 12]),
  ]) {
    const s = createGame();
    edit(s);
    assert.equal(validState(s), false);
  }
});

test('exterior wall previews match blocked exits in all four directions without mutating the inner map', async () => {
  const { outerExitBarriers, outerExitPosition } =
    await import('../boxbound/model.ts');
  for (const direction of Object.values(dirs)) {
    const s = level(1),
      owner = s.boxes.find((b) => b.id === 'gate-1');
    const outside = outerExitPosition(owner, direction);
    s.rooms.world.walls.push(outside);
    const inner = clone(s.rooms['level-1']);
    s.player.pos = [3 + 3 * direction[0], 0, 3 + 3 * direction[2]];
    const barriers = outerExitBarriers(s);
    assert.ok(
      barriers.some(
        (b) =>
          b.kind === 'wall' && b.direction.every((v, i) => v === direction[i]),
      ),
    );
    assert.equal(
      transition(s, { type: 'move', dir: direction }).changed,
      false,
    );
    assert.deepEqual(s.rooms['level-1'], inner);
  }
});
test('exterior previews follow the actual route owner and its current position for shared and recursive spaces', async () => {
  const { outerExitBarriers } = await import('../boxbound/model.ts');
  const s = level(1),
    owner = s.boxes.find((b) => b.id === 'gate-1');
  owner.pos = [3, 0, 3];
  s.rooms.world.walls.push([4, 0, 3]);
  s.boxes.push({ ...clone(owner), id: 'other-occurrence', pos: [12, 0, 4] });
  assert.equal(outerExitBarriers(s).length, 1);
  s.player.route[0].box = 'other-occurrence';
  assert.deepEqual(outerExitBarriers(s), []);
  s.player.route[0].box = owner.id;
  owner.pos = [3, 0, 7];
  assert.deepEqual(outerExitBarriers(s), []);
  s.player.room = 'world';
  s.player.route = [];
  assert.deepEqual(outerExitBarriers(s), []);
  const cycle = level(9);
  cycle.player.route.push({
    box: 'recursive-9',
    from: 'level-9',
    entry: [2, 0, 1],
  });
  assert.ok(outerExitBarriers(cycle).length >= 1);
});
test('exterior gates disappear when powered and movable crates are not drawn as walls', async () => {
  const { outerExitBarriers } = await import('../boxbound/model.ts');
  const s = level(1),
    owner = s.boxes.find((b) => b.id === 'gate-1');
  owner.pos = [8, 0, 11];
  assert.ok(
    outerExitBarriers(s).some((b) => b.kind === 'gate' && b.direction[2] === 1),
  );
  const weight = s.boxes.find((b) => b.id === 'island-weight');
  weight.pos = [8, 0, 14];
  assert.ok(!outerExitBarriers(s).some((b) => b.kind === 'gate'));
  weight.pos = [9, 0, 11];
  assert.ok(!outerExitBarriers(s).some((b) => b.direction[0] === 1));
});
test('reversing recorded box transfers restores both endpoints, direction and scaling semantics without mutating history', async () => {
  const { reverseTransfers } = await import('../boxbound/model.ts');
  const s = level(8);
  s.player.pos = [1, 0, 3];
  const forward = transition(s, { type: 'move', dir: dirs.d });
  const saved = clone(forward.transfers),
    reverse = reverseTransfers(saved);
  assert.deepEqual(reverseTransfers(reverse), saved);
  assert.deepEqual(saved, forward.transfers);
  assert.equal(reverse[0].entering, false);
  assert.deepEqual(reverse[0].direction, dirs.a);
  for (const room of [reverse[0].fromRoom, reverse[0].toRoom]) {
    const travel = boxTravel(reverse[0], room, forward.state, s);
    const start = boxTravelPose(travel, 0),
      end = boxTravelPose(travel, BOX_TRANSFER_MS);
    assert.deepEqual(start.position, travel.from);
    assert.deepEqual(end.position, travel.to);
    assert.equal(end.scale, travel.endScale);
  }
});

test('gameplay and undo share read-only rooms but isolate every mutable state field', async () => {
  const { copyState } = await import('../boxbound/model.ts');
  const { remember } = await import('../boxbound/history.ts');
  const before = createGame();
  const original = clone(before);
  const history = [];
  remember(history, before);
  const next = transition(before, { type: 'move', dir: [0, 0, -1] }).state;
  assert.equal(next.rooms, before.rooms);
  assert.equal(history[0].state.rooms, before.rooms);
  assert.deepEqual(before, original);
  const copy = copyState(next);
  copy.player.pos[0]++;
  copy.player.route.push({ box: 'gate-1', from: 'world', entry: [1, 0, 1] });
  copy.boxes[0].pos[0]++;
  copy.completed.push(10);
  assert.notDeepEqual(copy.player, next.player);
  assert.notDeepEqual(copy.boxes, next.boxes);
  assert.deepEqual(before, original);
  assert.deepEqual(history[0].state, original);
});

test('repeated reset and movement use the same 300-entry history bound and isolated transfer records', async () => {
  const { remember, HISTORY_LIMIT } = await import('../boxbound/history.ts');
  const state = createGame();
  state.player.room = 'level-1';
  state.player.pos = [3, 0, 5];
  state.player.route = [{ box: 'gate-1', from: 'world', entry: [0, 0, 0] }];
  const history = [];
  for (let i = 0; i < 650; i++) {
    state.moves = i;
    remember(history, state, false, [], true);
    assert.ok(history.length <= HISTORY_LIMIT);
  }
  assert.equal(history.length, 300);
  assert.equal(history[0].state.moves, 350);
  assert.equal(history.at(-1).state.moves, 649);
  assert.equal(new Set(history.map((h) => h.state.rooms)).size, 1);
  const reset = resetLevel(state);
  assert.equal(reset.rooms, state.rooms);
  const transfers = [{ box: 'crate-8', container: 'room-8', fromRoom: 'level-8', toRoom: 'inner-8', from: [2, 0, 3], to: [0, 0, 2], direction: [1, 0, 0], entering: true }];
  remember(history, reset, true, transfers);
  transfers[0].from[0] = 99;
  assert.equal(history.length, 300);
  assert.equal(history.at(-1).transfers[0].from[0], 2);
  assert.equal(history.at(-1).jump, true);
});

test('all authored rooms separate every pressure plate from gates, including diagonal adjacency', () => {
  for (const room of Object.values(createGame().rooms))
    for (const button of room.buttons ?? [])
      for (const gate of room.gates ?? [])
        assert.ok(
          Math.max(...button.pos.map((v, i) => Math.abs(v - gate.pos[i]))) >= 2,
          `${room.id}: ${button.id} must leave a clear cell before ${gate.id}`,
        );
});

test('the spaced island gate rejects walking or jumping off the plate but has a crate-held solution', () => {
  const start = createGame();
  const alone = play(start, 'w w');
  assert.deepEqual(alone.player.pos, [8, 0, 13]);
  assert.ok(!gateOpen(alone, 'world', alone.rooms.world.gates[0]));
  for (const jump of [false, true]) {
    const blocked = transition(alone, { type: 'move', dir: dirs.w, jump });
    assert.equal(blocked.changed, false);
    assert.deepEqual(blocked.state.player.pos, alone.player.pos);
  }
  const crossed = play(start, 'a a w d w d w w');
  assert.deepEqual(crossed.player.pos, [8, 0, 11]);
  assert.ok(gatePowered(crossed, 'world', crossed.rooms.world.gates[0]));
  assert.ok(validState(crossed));
});

test('revision 5 spacing migration preserves progress, moved weights and occupied destinations', () => {
  for (const kind of ['untouched', 'moved', 'occupied']) {
    const old = createGame();
    old.rulesRevision = 5;
    old.rooms.world.buttons[0].pos = [8, 0, 13];
    old.player.pos = [8, 0, 14];
    const weight = old.boxes.find((b) => b.id === 'island-weight');
    weight.pos = kind === 'moved' ? [4, 0, 13] : [7, 0, 13];
    const exported = old.boxes.find((b) => b.id === 'crate-1');
    exported.room = 'world';
    exported.pos = kind === 'occupied' ? [7, 0, 14] : [3, 0, 14];
    old.completed = [2, 4];
    old.moves = 123;
    const original = clone(old), next = upgradeState(old);
    assert.ok(validState(next), kind);
    assert.equal(next.rulesRevision, 13);
    assert.deepEqual(old, original);
    assert.deepEqual(next.completed, old.completed);
    assert.equal(next.moves, old.moves);
    assert.deepEqual(next.player, old.player);
    assert.deepEqual(next.rooms['level-1'], old.rooms['level-1']);
    assert.deepEqual(next.boxes.find((b) => b.id === exported.id), exported);
    const migratedWeight = next.boxes.find((b) => b.id === weight.id);
    if (kind === 'untouched') assert.deepEqual(migratedWeight.pos, [7, 0, 14]);
    if (kind === 'moved') assert.deepEqual(migratedWeight.pos, weight.pos);
    assert.equal(next.boxes.length, old.boxes.length);
    assert.deepEqual(upgradeState(next), next);
  }
});

test('JSON authors the entire finite world graph, including nested and self-referencing rooms', () => {
  const s = parseWorldMap(authoredMap);
  assert.equal(Object.keys(s.rooms).length, 255);
  assert.equal(s.boxes.length, 452);
  assert.ok(s.boxes.some((b) => b.inside === b.room));
  assert.deepEqual(new Set(s.rooms.world.decorations.map((d) => d.type)), new Set([1, 2, 3, 4]));
  assert.equal(s.rooms.world.decorations.length, 20);
  const changed = clone(authoredMap);
  changed.rooms[0].decorations[0].type = 3;
  assert.equal(parseWorldMap(changed).rooms.world.decorations[0].type, 3);
  s.rooms.world.decorations[0].pos[0] = 99;
  assert.notEqual(createGame().rooms.world.decorations[0].pos[0], 99);
});

test('map loading rejects invalid references, decorations, overlaps and adjacent mechanisms', () => {
  for (const mutate of [
    (m) => { m.schemaVersion = 2; },
    (m) => { m.rooms[0].decorations[0].type = 99; },
    (m) => { m.rooms[0].decorations[0].pos = [-1, 0, 1]; },
    (m) => { m.rooms[0].decorations[0].pos = m.spawn.pos; },
    (m) => { m.rooms[0].boxes[0].inside = 'missing'; },
    (m) => { m.rooms[0].boxes[1].id = m.rooms[0].boxes[0].id; },
    (m) => { m.rooms.push(clone(m.rooms[0])); },
    (m) => { m.rooms[0].buttons[0].pos = [8, 0, 13]; },
    (m) => { m.rooms[0].boxes[1].pos = m.rooms[0].boxes[0].pos; },
    (m) => { m.rooms.push({ ...clone(m.rooms[1]), id: 'unreachable', boxes: [] }); },
  ]) {
    const map = clone(authoredMap);
    mutate(map);
    assert.throws(() => parseWorldMap(map));
  }
});

test('all decoration types block walking, jumping and pushing without changing the source state', () => {
  for (const type of [1, 2, 3, 4]) {
    const s = level(1);
    s.rooms['level-1'].decorations = [{ id: 'obstacle', type, pos: [3, 0, 5] }];
    s.player.pos = [3, 0, 6];
    for (const jump of [false, true]) {
      const before = clone(s);
      const result = transition(s, { type: 'move', dir: dirs.w, jump });
      assert.equal(result.changed, false);
      assert.deepEqual(s, before);
    }
    const b = s.boxes.find((b) => b.id === 'crate-1');
    b.pos = [3, 0, 6];
    s.player.pos = [3, 0, 7];
    const pushed = transition(s, { type: 'move', dir: dirs.w });
    assert.equal(pushed.changed, false);
    assert.deepEqual(pushed.state.boxes, s.boxes);
  }
});

test('world decoration obstacles leave ground routes to all ten level entrances', async () => {
  const { solid, within } = await import('../boxbound/model.ts');
  const s = createGame(), room = s.rooms.world;
  const seen = new Set(), pending = [s.player.pos];
  while (pending.length) {
    const p = pending.pop(), key = p.join(',');
    if (seen.has(key) || !within(room, p) || solid(s, 'world', p)) continue;
    seen.add(key);
    for (const d of Object.values(dirs)) pending.push(p.map((v, i) => v + d[i]));
  }
  for (const box of s.boxes.filter((b) => b.id.startsWith('gate-')))
    assert.ok(seen.has([box.pos[0], 0, box.pos[2] + 1].join(',')), box.id);
});

test('outside decorations appear at the matching inner exit and prevent leaving through them', async () => {
  const { outerExitBarriers } = await import('../boxbound/model.ts');
  const s = level(1), owner = s.boxes.find((b) => b.id === 'gate-1');
  s.rooms.world.decorations.push({ id: 'exit-rock', type: 1, pos: [owner.pos[0], 0, owner.pos[2] + 1] });
  s.player.pos = [3, 0, 6];
  assert.ok(outerExitBarriers(s).some((b) => b.kind === 'decoration' && b.decorationType === 1 && b.direction[2] === 1));
  const result = transition(s, { type: 'move', dir: dirs.s });
  assert.equal(result.changed, false);
  assert.equal(result.state.player.room, 'level-1');
});

test('revision 6 decoration migration safely moves obstructed actors and preserves progress', () => {
  const old = createGame();
  old.rulesRevision = 6;
  delete old.rooms.world.decorations;
  old.player.pos = [1, 0, 3];
  old.completed = [2, 4];
  old.moves = 170;
  const exported = old.boxes.find((b) => b.id === 'crate-1');
  exported.room = 'world';
  exported.pos = [5, 0, 1];
  const before = clone(old), next = upgradeState(old);
  assert.ok(validState(next));
  assert.deepEqual(old, before);
  assert.deepEqual(next.completed, old.completed);
  assert.equal(next.moves, 170);
  assert.equal(next.boxes.length, old.boxes.length);
  assert.notDeepEqual(next.player.pos, old.player.pos);
  const moved = next.boxes.find((b) => b.id === exported.id);
  assert.equal(moved.room, 'world');
  assert.equal(moved.pos[1], 0);
  assert.notDeepEqual(moved.pos, exported.pos);
  assert.deepEqual(upgradeState(next), next);
});

test('unpowered gates eject the player after a crate is pushed clear in all four directions', () => {
  for (const dir of Object.values(dirs)) {
    const s = createGame(), room = s.rooms.world, gate = room.gates[0];
    room.walls = []; room.barriers = []; room.decorations = [];
    gate.pos = [8, 0, 8]; room.buttons[0].pos = [1, 0, 1];
    const box = s.boxes.find((b) => b.id === 'island-weight');
    box.pos = [...gate.pos];
    s.player.pos = gate.pos.map((v, i) => v - dir[i]);
    const before = clone(s), result = transition(s, { type: 'move', dir });
    assert.equal(result.changed, true);
    assert.deepEqual(result.state.player.pos, before.player.pos);
    assert.deepEqual(result.state.boxes.find((b) => b.id === box.id).pos, gate.pos.map((v, i) => v + dir[i]));
    assert.equal(result.recoil.gate, gate.id);
    assert.ok(!gateOpen(result.state, 'world', gate));
    assert.ok(validState(result.state));
    assert.deepEqual(s, before);
    assert.equal(result.state.moves, before.moves + 1);
    assert.equal(transition(result.state, { type: 'move', dir }).changed, false);
  }
});

test('powered gates permit pushing through and a large crate keeps covering the gate until fully clear', () => {
  const s = createGame(), room = s.rooms.world, gate = room.gates[0];
  room.walls = []; room.barriers = []; room.decorations = [];
  gate.pos = [8, 0, 8]; room.buttons[0].pos = [1, 0, 1];
  const box = s.boxes.find((b) => b.id === 'island-weight');
  box.pos = [8, 0, 8]; s.player.pos = [8, 0, 9];
  const weight = s.boxes.find((b) => b.id === 'crate-1');
  weight.room = 'world'; weight.pos = [1, 0, 1];
  const powered = transition(s, { type: 'move', dir: dirs.w });
  assert.equal(powered.recoil, undefined);
  assert.deepEqual(powered.state.player.pos, gate.pos);
  assert.ok(gatePowered(powered.state, 'world', gate));
  weight.pos = [2, 0, 1];
  s.boxes = [box, weight];
  box.size = 2; box.pos = [8, 0, 7]; s.player.pos = [8, 0, 6];
  const covered = transition(s, { type: 'move', dir: dirs.s });
  assert.equal(covered.recoil, undefined);
  assert.ok(gateOpen(covered.state, 'world', gate));
  const clear = transition(covered.state, { type: 'move', dir: dirs.s });
  assert.ok(clear.recoil);
  assert.ok(!gateOpen(clear.state, 'world', gate));
});

test('blocked gate pushes are atomic and recoil can be undone as one move', async () => {
  const { remember } = await import('../boxbound/history.ts');
  const s = createGame(), gate = s.rooms.world.gates[0];
  const box = s.boxes.find((b) => b.id === 'island-weight');
  box.pos = [...gate.pos]; s.player.pos = [8, 0, 13];
  s.rooms.world.walls.push([8, 0, 11]);
  const blocked = transition(s, { type: 'move', dir: dirs.w });
  assert.equal(blocked.changed, false);
  assert.equal(blocked.recoil, undefined);
  assert.deepEqual(blocked.state.boxes, s.boxes);
  s.rooms.world.walls.pop();
  const history = []; remember(history, s);
  const pushed = transition(s, { type: 'move', dir: dirs.w });
  assert.ok(pushed.recoil);
  const undo = history.pop().state;
  assert.deepEqual(undo, s);
  assert.ok(gateOpen(undo, 'world', gate));
});

test('recoil animation keeps the full player body clear of raised bars and returns to rest', async () => {
  const { recoilPose, RECOIL_MS, GATE_RECOIL_DELAY_MS } = await import('../boxbound/visuals.ts');
  for (const dir of Object.values(dirs)) {
    const gate = [0, 0, 0], from = dir.map((v) => -v);
    let previous = from;
    for (let ms = 0; ms <= RECOIL_MS; ms++) {
      const pose = recoilPose(from, gate, from, ms);
      assert.ok(Math.hypot(...pose.position.map((v, i) => v - previous[i])) < .025);
      if (ms >= GATE_RECOIL_DELAY_MS)
        assert.ok(Math.hypot(pose.position[0], pose.position[2]) > .41 * (1 + pose.squash) + .055);
      previous = pose.position;
    }
    assert.deepEqual(recoilPose(from, gate, from, RECOIL_MS).position, from);
    assert.equal(recoilPose(from, gate, from, RECOIL_MS).active, false);
  }
});

test('sound events distinguish steps, pushes, jumps, landings, buttons and both gate directions', async () => {
  const { soundCues } = await import('../boxbound/sound-events.ts');
  const s = createGame();
  const step = transition(s, { type: 'move', dir: dirs.a });
  assert.ok(soundCues(s, step.state, { type: 'move', dir: dirs.a }).some((c) => c.name === 'step'));
  const press = transition(s, { type: 'move', dir: dirs.w });
  const pressed = soundCues(s, press.state, { type: 'move', dir: dirs.w }).map((c) => c.name);
  assert.ok(pressed.includes('button') && pressed.includes('gate-down'));
  assert.ok(soundCues(press.state, s).some((c) => c.name === 'gate-up'));
  const box = s.boxes.find((b) => b.id === 'island-weight');
  box.pos = [8, 0, 12]; s.player.pos = [8, 0, 13];
  const push = transition(s, { type: 'move', dir: dirs.w });
  const cues = soundCues(s, push.state, { type: 'move', dir: dirs.w }, push.recoil);
  assert.deepEqual(cues.map((c) => c.name), ['push', 'gate-up', 'recoil']);
  assert.equal(cues.find((c) => c.name === 'gate-up').delay, 200);
  const high = clone(s); high.player.pos = [3, 1, 3];
  const low = clone(high); low.player.pos = [3, 0, 4];
  assert.deepEqual(soundCues(high, low, { type: 'move', dir: dirs.s }).find((c) => c.name === 'land'), { name: 'land', delay: 420 });
  assert.ok(soundCues(s, step.state, { type: 'move', dir: dirs.a, jump: true }).some((c) => c.name === 'jump'));
  assert.ok(!soundCues(s, step.state, { type: 'move', dir: dirs.a, jump: true }, undefined, true).some((c) => c.name === 'jump'));
});

test('MIDI source files and rendered sound cues are distinct, bounded and non-silent', () => {
  const names = ['step', 'jump', 'push', 'gate-up', 'gate-down', 'button', 'land', 'recoil', 'complete', 'enter', 'exit'];
  const fingerprints = new Set();
  for (const name of names) {
    const base = new URL(`../boxbound/assets/audio/${name}`, import.meta.url);
    const midi = readFileSync(new URL(base.href + '.mid'));
    assert.equal(midi.toString('ascii', 0, 4), 'MThd');
    assert.equal(midi.readUInt16BE(10), 1);
    const wav = readFileSync(new URL(base.href + '.wav'));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.readUInt32LE(24), 22050);
    assert.ok(wav.length > 2000 && wav.length < 44144);
    let energy = 0, peak = 0;
    for (let i = 44; i < wav.length; i += 2) { const v = wav.readInt16LE(i); energy += v * v; peak = Math.max(peak, Math.abs(v)); }
    assert.ok(energy > 1000000 && peak < 31000);
    fingerprints.add(wav.toString('base64'));
  }
  assert.equal(fingerprints.size, names.length);
});

const paraboxPaths = JSON.parse(readFileSync(new URL('../boxbound/parabox-solutions.json', import.meta.url), 'utf8'));
function museumLevel(n) {
  const s = createGame(), gate = s.boxes.find(b => b.id === `pp-gateway-${n}`), r = s.rooms[gate.inside];
  s.player = { room:r.id, pos:[...r.spawn], facing:[0,0,-1], route:[
    {box:'pp-museum',from:'world',entry:[8,0,3]},
    {box:'pp-chapter-'+(n<=9?'intro':n<=27?'enter':'empty'),from:'pp-hub',entry:[3,0,6]},
    {box:gate.id,from:gate.room,entry:[gate.pos[0],0,gate.pos[2]+1]},
  ]};
  return s;
}
for (const [n,path] of Object.entries(paraboxPaths)) test(`Parabox ${n}: complete original layout with ground movement and valid nested graph at every step`,()=>{
  let s=museumLevel(Number(n));
  for(const c of path){
    const result=transition(s,{type:'move',dir:dirs[c]});
    assert.ok(result.changed,`${n}: blocked ${c}`);s=result.state;
    assert.ok(validState(s),`${n}: invalid graph after ${c}`);
    assert.equal(s.player.pos[1],0);
  }
  assert.ok(s.completed.includes(Number(n)+10));
  assert.ok(goalsSatisfied(s,Number(n)+10));
  assert.deepEqual(s.player.pos,s.rooms[s.player.room].home);
  const reset=resetLevel(s), original=museumLevel(Number(n));
  assert.ok(validState(reset)); assert.deepEqual(reset.player,original.player);
  assert.deepEqual(reset.boxes.filter(b=>b.id.startsWith(`pp-${n==='10'?'enter1':`intro${n}`}-`)).sort((a,b)=>a.id.localeCompare(b.id)),original.boxes.filter(b=>b.id.startsWith(`pp-${n==='10'?'enter1':`intro${n}`}-`)).sort((a,b)=>a.id.localeCompare(b.id)));
  assert.ok(!reset.completed.includes(Number(n)+10));
  const left=transition(s,{type:'leave'});assert.ok(left.changed);assert.equal(left.state.player.room,s.boxes.find(b=>b.id===`pp-gateway-${n}`).room);assert.ok(validState(left.state));
});
test('museum has eight chapter gateways, a red friend and 116 unique completion IDs',async()=>{
  const {levelIds}=await import('../boxbound/model.ts');const s=createGame();
  assert.equal(levelIds(s).length,116);assert.equal(s.boxes.filter(b=>b.room==='pp-hub'&&b.portal).length,8);
  s.player={room:'world',pos:[8,0,3],facing:[0,0,-1],route:[]};
  const entered=transition(s,{type:'move',dir:dirs.w});assert.equal(entered.state.player.room,'pp-hub');
  const walk=transition(entered.state,{type:'move',dir:dirs.w});
  const greet=transition(walk.state,{type:'move',dir:dirs.w});assert.equal(greet.changed,false);assert.match(greet.state.message,/红方/);
  assert.deepEqual(greet.state.player.pos,[6,0,10]);
  let puzzle=museumLevel(1);puzzle.player.pos=[4,0,3];
  const jumped=transition(puzzle,{type:'move',dir:dirs.d,jump:true});assert.equal(jumped.state.player.pos[1],0);
  puzzle.completed=[20];assert.ok(validState(puzzle));puzzle.completed=[117];assert.equal(validState(puzzle),false);
});
test('revision 7 journeys in all five slots add museum without losing moved crates or progress',async()=>{
  const saves=new BoxboundSaves(new MemorySaveBackend());
  try{for(let slot=1;slot<=5;slot++){
    const s=createGame();s.rulesRevision=7;s.boxes=s.boxes.filter(b=>!b.id.startsWith('pp-'));
    for(const id of Object.keys(s.rooms))if(id.startsWith('pp-'))delete s.rooms[id];
    s.completed=[1,3];s.moves=slot*9;
    const gift=s.boxes.find(b=>b.id==='gift-7');gift.room='world';gift.pos=[8,0,2];
    await saves.save(slot,s);const loaded=await saves.load(slot);
    assert.ok(validState(loaded));assert.equal(loaded.rulesRevision,13);assert.equal(loaded.moves,slot*9);assert.deepEqual(loaded.completed,[1,3]);
    assert.ok(loaded.boxes.some(b=>b.id==='pp-museum'));assert.equal(loaded.boxes.find(b=>b.id==='gift-7').room,'world');
    assert.equal(loaded.boxes.length,s.boxes.length+420);
    assert.deepEqual(upgradeState(loaded),loaded);
  }}finally{await saves.service.dispose();}
});
test('community first-eight-chapters transcription maps every wall, goal, actor and inner reference with the authored Eat 8 correction',()=>{
  const source=JSON.parse(readFileSync(new URL('../boxbound/parabox-source.json',import.meta.url),'utf8'));
  const s=createGame();assert.equal(Object.keys(source.levels).length,106);
  for(const [name,code] of Object.entries(source.levels))for(const chunk of code.split('|').slice(1)){
    if (!chunk.includes(':')) continue;
    const aliases=Object.fromEntries(code.split('|').filter(c=>!c.includes(':')).map(c=>{const [id,ref]=c.split(';');return [id,ref.split(',')[1]];}));
    const [spec,lookup,rle,targets='']=chunk.split(':'),[id,dimensions]=spec.split(';');
    const size=Number(dimensions.split(',')[0]),prefix=`pp-${name.toLowerCase()}`,r=s.rooms[`${prefix}-${id.toLowerCase()}`];
    const symbols=Object.fromEntries(lookup.split(';').map(x=>x.split(',')));
    const cells=rle.split(';').flatMap(x=>{const [symbol,count]=x.split(',');return Array(Number(count)).fill(symbols[symbol]);});
    assert.equal(r.size,size);assert.equal(cells.length,size*size);assert.equal(!!r.void,spec.split(';').includes('V'));
    const walls=[];const crates=[];
    cells.forEach((symbol,i)=>{const p=[i%size,0,Math.floor(i/size)];if(symbol==='#')walls.push(p);else if(symbol==='p0')assert.deepEqual(r.spawn,p);else if(symbol==='+'||symbol.startsWith('L')||aliases[symbol])crates.push({pos:p,inside:symbol==='+'?null:`${prefix}-${(aliases[symbol]??symbol).toLowerCase()}`});});
    // Authored correction requested by the player: cyan Eat 8 box is one row lower.
    if(r.id==='pp-eat8-la'){const cyan=crates.find(b=>b.inside==='pp-eat8-lb');assert.deepEqual(cyan.pos,[2,0,3]);cyan.pos=[2,0,4];}
    assert.deepEqual(r.walls,walls);assert.deepEqual(r.barriers,walls);
    assert.deepEqual(s.boxes.filter(b=>b.room===r.id).map(b=>({pos:b.pos,inside:b.inside})),crates);
    const goals=[];let home=null;for(const target of targets.split(';').filter(Boolean)){const [type,row,col]=target.split(',');const p=[Number(col),0,Number(row)];if(type==='P')home=p;else goals.push(p);}
    assert.deepEqual(r.goals,goals);assert.deepEqual(r.home,home);
  }
});
test('classic K cannot bypass pushing a movable nested box and directional J cannot climb it',()=>{
  const s=museumLevel(5),b=s.boxes.find(b=>b.room===s.player.room&&b.inside);
  s.player.pos=[b.pos[0]+1,0,b.pos[2]];s.player.facing=[-1,0,0];
  const walk=transition(s,{type:'move',dir:s.player.facing});
  assert.deepEqual(transition(s,{type:'dive'}),walk);
  assert.deepEqual(transition(s,{type:'move',dir:s.player.facing,jump:true}),walk);
});

const { returnFromCompletedLevel, finishedLevel } = await import('../boxbound/completion.ts');
const { outerContext } = await import('../boxbound/outer-context.ts');
test('completion returns every original and tribute puzzle beyond its whole nested graph without altering crates, moves or completion',()=>{
  for (const n of Array.from({length:20},(_,i)=>i+1)) {
    let s=n<=10?play(level(n),solutions[n]):museumLevel(n-10);
    if(n>10)for(const key of paraboxPaths[n-10])s=transition(s,{type:'move',dir:dirs[key]}).state;
    assert.equal(finishedLevel(s),n);
    const before=clone(s),next=returnFromCompletedLevel(s,n);
    assert.ok(next);assert.ok(validState(next));assert.equal(next.player.room,n<=10?'world':n<=19?'pp-intro':'pp-enter');
    assert.equal(next.player.route.length,n<=10?0:2);assert.equal(next.moves,s.moves);
    assert.deepEqual(next.boxes,s.boxes);assert.deepEqual(next.completed,s.completed);assert.deepEqual(s,before);
    assert.equal(returnFromCompletedLevel(next,n),null);
  }
});
test('auto return finds a safe nearby tile behind blocked entrances and leaves fully occupied parent unchanged',()=>{
  let s=museumLevel(1);for(const c of paraboxPaths[1])s=transition(s,{type:'move',dir:dirs[c]}).state;
  const gate=s.boxes.find(b=>b.id==='pp-gateway-1');
  for(const d of Object.values(dirs))s.rooms['pp-intro'].walls.push([gate.pos[0]+d[0],0,gate.pos[2]+d[2]]);
  let next=returnFromCompletedLevel(s,11);assert.ok(next);assert.ok(validState(next));assert.ok(!solid(next,'pp-intro',next.player.pos));
  s.rooms['pp-intro'].walls=Array.from({length:17*17},(_,i)=>[i%17,0,Math.floor(i/17)]);
  assert.equal(returnFromCompletedLevel(s,11),null);
  assert.equal(returnFromCompletedLevel(museumLevel(1),11),null);
});
test('world file includes support inline groups, relative paths and one read per path; reject missing, duplicate and cyclic files',async()=>{
  const base=new URL('https://maps.test/levels/index.json'), reads=new Map();
  const header={...authoredMap};delete header.rooms;header.worlds=[{$ref:'islands/world.json'},{rooms:authoredMap.rooms.filter(r=>r.id.startsWith('pp-'))}];
  const data={
    '/levels/index.json':header,
    '/levels/islands/world.json':{worldId:'world',rooms:[authoredMap.rooms.find(r=>r.id==='world')],levels:[{$ref:'all.json'}]},
    '/levels/islands/all.json':{rooms:authoredMap.rooms.filter(r=>r.id!=='world'&&!r.id.startsWith('pp-'))},
  };
  const read=async url=>{reads.set(url.pathname,(reads.get(url.pathname)||0)+1);if(!data[url.pathname])throw Error('missing');return data[url.pathname];};
  const loaded=await loadWorldMap(base,read);assert.deepEqual(parseWorldMap(loaded),parseWorldMap(authoredMap));
  assert.ok([...reads.values()].every(n=>n===1));
  data['/levels/islands/all.json']={levels:[{$ref:'world.json'}]};await assert.rejects(loadWorldMap(base,read),/循环/);
  for(const ref of ['../../other.json','https://outside.test/x.json','missing.json']){
    data['/levels/islands/all.json']={levels:[{$ref:ref}]};await assert.rejects(loadWorldMap(base,read));
  }
  data['/levels/islands/all.json']={rooms:[authoredMap.rooms[0],authoredMap.rooms[0]]};await assert.rejects(loadWorldMap(base,read),/唯一/);
});
test('parent frame samples eight immediate neighbors using active owner occurrence, follows moved boxes and terminates self references',()=>{
  let s=museumLevel(1);let context=outerContext(s);assert.equal(context.parent,'pp-intro');assert.equal(context.owner,'pp-gateway-1');assert.equal(context.cells.length,8);
  const owner=s.boxes.find(b=>b.id==='pp-gateway-1');owner.pos=[8,0,8];
  s.rooms['pp-intro'].walls.push([9,0,8]);(s.rooms['pp-intro'].decorations??=[]).push({id:'test-tree',pos:[7,0,8],type:3});
  context=outerContext(s);assert.ok(context.cells.some(c=>c.source[0]===9&&c.source[2]===8&&c.wall));assert.ok(context.cells.some(c=>c.source[0]===7&&c.source[2]===8&&c.decoration===3));
  assert.ok(context.cells.every(c=>c.center[0]===-4||c.center[0]===10||c.center[2]===-4||c.center[2]===10));
  owner.size=2;context=outerContext(s);assert.equal(context.cells.length,12);
  owner.pos=[0,0,0];owner.size=1;context=outerContext(s);assert.equal(context.cells.length,3);
  s=createGame();assert.equal(outerContext(s),null);
  const loop=s.boxes.find(b=>b.inside===b.room);s.player={room:loop.room,pos:[1,0,1],facing:dirs.w,route:[{box:loop.id,from:loop.room,entry:[1,0,1]}]};
  assert.ok(outerContext(s));assert.ok(outerContext(s).cells.length<=36);
});
test('new musical cues distinguish victory, entering, leaving and reverse travel without false victory on undo',async()=>{
  const {soundCues,SOUND_NAMES}=await import('../boxbound/sound-events.ts');assert.equal(SOUND_NAMES.length,11);
  const s=createGame();s.player.pos=[8,0,3];const inside=transition(s,{type:'move',dir:dirs.w}).state;
  assert.ok(soundCues(s,inside).some(c=>c.name==='enter'));assert.ok(soundCues(inside,s).some(c=>c.name==='exit'));
  let puzzle=museumLevel(1),before;for(const c of paraboxPaths[1]){before=puzzle;puzzle=transition(puzzle,{type:'move',dir:dirs[c]}).state;}
  assert.ok(soundCues(before,puzzle,{type:'move',dir:dirs.a}).some(c=>c.name==='complete'));
  assert.ok(!soundCues(before,puzzle).some(c=>c.name==='complete'));
  const out=returnFromCompletedLevel(puzzle,11);assert.deepEqual(soundCues(puzzle,out,{type:'leave'}).map(c=>c.name),['exit']);
});


test('outside cells preserve containing-box scale, contiguous boundaries and square corners for all room and box sizes',()=>{
  for(const innerSize of [3,5,7,11,17]) for(const size of [1,2,3]) {
    const s=museumLevel(1),owner=s.boxes.find(b=>b.id==='pp-gateway-1');
    owner.pos=[7,0,7];owner.size=size;s.rooms[s.player.room].size=innerSize;
    const context=outerContext(s),scale=innerSize/size;
    assert.equal(context.scale,scale);
    for(const c of context.cells){
      assert.equal(c.size[0],scale);assert.equal(c.size[2],scale);
      for(const axis of [0,2])assert.ok(Math.abs(c.center[axis]+.5-(c.source[axis]-owner.pos[axis]+.5)*scale)<1e-10);
    }
    const west=context.cells.find(c=>c.source[0]===6&&c.source[2]===7);
    const east=context.cells.find(c=>c.source[0]===7+size&&c.source[2]===7);
    assert.ok(Math.abs(west.center[0]+scale/2+.5)<1e-10);
    assert.ok(Math.abs(east.center[0]-scale/2-(innerSize-.5))<1e-10);
    if(size===1)assert.equal(context.cells[0].size[0],innerSize);
  }
});

test('chapter layout has exactly 9/18/14 independent movable level boxes with entry-first defaults',()=>{
  const s=createGame();
  for(const [chapter,count] of [['intro',9],['enter',18],['empty',14]]){
    const boxes=s.boxes.filter(b=>b.room==='pp-'+chapter);
    assert.equal(boxes.length,count);
    assert.ok(boxes.every(b=>b.levelEntry && b.entryPriority==='enter' && !b.fixed && s.rooms[b.inside].level>0));
  }
});
test('entry priority is configurable and a blocked push falls back to entry; replay keeps achievements and exterior identities',()=>{
  let s=createGame(),gate=s.boxes.find(b=>b.id==='pp-gateway-1');
  s.player={room:gate.room,pos:[gate.pos[0],0,gate.pos[2]+1],facing:dirs.w,route:[]};
  const original=clone(gate);let entered=advanceGame(s,{type:'move',dir:dirs.w});
  assert.equal(entered.state.player.room,gate.inside);assert.deepEqual(entered.state.boxes.find(b=>b.id===gate.id),original);
  gate.entryPriority='push';const pushed=advanceGame(s,{type:'move',dir:dirs.w});
  assert.equal(pushed.state.player.room,gate.room);assert.equal(pushed.state.boxes.find(b=>b.id===gate.id).pos[2],gate.pos[2]-1);
  s.rooms[gate.room].walls.push([gate.pos[0],0,gate.pos[2]-1]);
  entered=advanceGame(s,{type:'move',dir:dirs.w});assert.equal(entered.state.player.room,gate.inside);
  s=createGame();gate=s.boxes.find(b=>b.id==='pp-gateway-1');s.completed=[11];
  const exported=s.boxes.find(b=>b.id==='pp-intro1-lr-1');exported.room='pp-intro';exported.pos=[14,0,14];
  const foreign=s.boxes.find(b=>b.id==='island-weight');foreign.room=gate.inside;foreign.pos=[1,0,2];
  const before=clone(s);const reset=resetInterior(s,gate);
  assert.deepEqual(reset.boxes.filter(b=>b.room!==gate.inside),before.boxes.filter(b=>b.room!==gate.inside));
  assert.equal(reset.boxes.filter(b=>b.id===exported.id).length,1);assert.deepEqual(reset.completed,[11]);assert.ok(reset.boxes.some(b=>b.id===foreign.id));assert.deepEqual(s,before);
});
test('space zoom composes route scales and round-trips positions through nested and self references',async()=>{
  const {spaceTransform,transformPoint}=await import('../boxbound/space-view.ts');
  let outer=createGame();outer.player.pos=[8,0,3];const hub=advanceGame(outer,{type:'move',dir:dirs.w}).state;
  const chapter=hub.boxes.find(b=>b.id==='pp-chapter-intro');hub.player.pos=[chapter.pos[0],0,chapter.pos[2]+1];
  const inner=advanceGame(hub,{type:'move',dir:dirs.w}).state;
  const a=spaceTransform(outer,inner),b=spaceTransform(inner,outer);
  assert.equal(a.scale,inner.rooms["pp-hub"].size*inner.rooms["pp-intro"].size);assert.ok(Math.abs(a.scale*b.scale-1)<1e-12);
  for(const p of [[0,0,0],[3,1,7],[-2,4,6]]){
    const q=transformPoint(transformPoint(p,a),b);q.forEach((v,i)=>assert.ok(Math.abs(v-p[i])<1e-10));
  }
  assert.deepEqual(spaceTransform(inner,inner),{scale:1,offset:[0,0,0]});
});
test('revision 8 saves migrate the current puzzle route into its chapter without resetting progress',()=>{
  const old=museumLevel(9);old.rulesRevision=8;old.completed=[1,11];old.moves=125;
  old.player.route.splice(1,1);old.player.route[1].from='pp-hub';
  const g=old.boxes.find(b=>b.id==='pp-gateway-9');g.room='pp-hub';g.pos=[11,0,10];
  const crate=old.boxes.find(b=>b.id==='pp-intro9-lr-1');crate.pos=[3,0,3];
  const next=upgradeState(old);assert.ok(validState(next));assert.equal(next.player.route[1].box,'pp-chapter-intro');
  assert.equal(next.player.route[2].from,'pp-intro');assert.deepEqual(next.boxes.find(b=>b.id===crate.id),crate);
  assert.deepEqual(next.completed,[1,11]);assert.equal(next.moves,125);
});

const chapterPaths=JSON.parse(readFileSync(new URL('../boxbound/parabox-chapter-solutions.json',import.meta.url),'utf8'));
test('solution fixtures cover all forty-one chapter puzzles',()=>assert.equal(Object.keys(chapterPaths).length,41));
const advancedPaths=JSON.parse(readFileSync(new URL('../boxbound/parabox-advanced-solutions.json',import.meta.url),'utf8'));
for(const [n,path] of Object.entries({...chapterPaths,...advancedPaths}))test(`chapter puzzle ${n}: replay authored start, solve, return, reset only interior and replay achievement`,()=>{
  let s=createGame();const gate=s.boxes.find(b=>b.id===`pp-gateway-${n}`),chapter=s.boxes.find(b=>b.inside===gate.room),level=Number(n)+10;
  s.player={room:gate.room,pos:[gate.pos[0],0,gate.pos[2]+1],facing:dirs.w,route:[
    {box:'pp-museum',from:'world',entry:[8,0,3]},
    {box:chapter.id,from:'pp-hub',entry:[chapter.pos[0],0,chapter.pos[2]+1]},
  ]};
  s=advanceGame(s,{type:'move',dir:dirs.w}).state;const original=clone(s);
  for(const c of path){const next=advanceGame(s,{type:'move',dir:dirs[c]});assert.ok(next.changed,`${n}: blocked ${c}`);s=next.state;assert.ok(validState(s));}
  assert.equal(finishedLevel(s),level);assert.ok(goalsSatisfied(s,level));
  const out=returnFromCompletedLevel(s,level);assert.ok(out);assert.equal(out.player.room,gate.room);assert.equal(out.player.route.length,2);
  const outside=clone(out.boxes.filter(b=>out.rooms[b.room].level!==level));
  out.player.pos=[gate.pos[0],0,gate.pos[2]+1];
  const replay=advanceGame(out,{type:'move',dir:dirs.w}).state;
  assert.equal(replay.player.room,original.player.room);assert.deepEqual(replay.player.pos,original.player.pos);
  assert.ok(replay.completed.includes(level));assert.notEqual(finishedLevel(replay),level);
  assert.deepEqual(replay.boxes.filter(b=>replay.rooms[b.room].level!==level),outside);
  const reset=resetLevel(s);assert.deepEqual(reset.player.pos,original.player.pos);assert.equal(reset.player.room,original.player.room);
});

function boundaryChain() {
  const s = createGame();
  const room = id => ({ id, name: id, size: 5, walls: [], goals: [], home: null, level: 0, hint: '', planar: true });
  s.rooms = Object.fromEntries(['outer','middle','inner'].map(id => [id, room(id)]));
  s.boxes = [
    { id: 'parent', room: 'outer', pos: [2,0,2], size: 1, inside: 'middle', fixed: false, required: false },
    { id: 'child', room: 'middle', pos: [4,0,2], size: 1, inside: 'inner', fixed: false, required: false },
  ];
  s.player = { room: 'inner', pos: [4,0,2], facing: dirs.d, route: [
    { box: 'parent', from: 'outer', entry: [1,0,2] },
    { box: 'child', from: 'middle', entry: [3,0,2] },
  ] };
  return s;
}
test('consecutive boundary exits unwind the whole route and respect player-sized openings', () => {
  const s = boundaryChain(); s.rooms.middle.doorWidths = [.82,.82,.82,.82];
  const out = transition(s, {type:'move',dir:dirs.d});
  assert.ok(out.changed); assert.equal(out.state.player.room,'outer');
  assert.deepEqual(out.state.player.pos,[3,0,2]); assert.deepEqual(out.state.player.route,[]);
  assert.ok(validState(out.state));
  s.rooms.outer.walls.push([3,0,2]);
  const blocked=transition(s,{type:'move',dir:dirs.d});
  assert.equal(blocked.changed,false); assert.deepEqual(blocked.state.player,s.player);
});
test('crate transport crosses consecutive boundaries atomically and cannot pass a narrow parent opening', () => {
  const s=boundaryChain(); s.player.pos=[3,0,2];
  s.boxes.push({id:'cargo',room:'inner',pos:[4,0,2],size:1,inside:null,fixed:false,required:false});
  const out=transition(s,{type:'move',dir:dirs.d});
  assert.ok(out.changed); assert.equal(out.state.boxes.at(-1).room,'outer');
  assert.deepEqual(out.state.boxes.at(-1).pos,[3,0,2]);
  assert.equal(out.transfers[0].fromRoom,'inner'); assert.equal(out.transfers[0].toRoom,'outer');
  assert.ok(validState(out.state));
  s.rooms.middle.doorWidths=[.82,.82,.82,.82];
  const before=clone(s), blocked=transition(s,{type:'move',dir:dirs.d});
  assert.equal(blocked.changed,false); assert.deepEqual(blocked.state.boxes,before.boxes);
  assert.deepEqual(blocked.transfers,[]); assert.deepEqual(s,before);
});

test('Boxbound manifest ships every nested level file without stale asset references', () => {
  const entry=JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url),'utf8')).entries.find(e=>e.id==='boxbound');
  for(const asset of entry.assets) assert.ok(existsSync(new URL('../'+asset,import.meta.url)),asset);
  const maps=readdirSync(new URL('../boxbound/levels/',import.meta.url),{recursive:true}).filter(p=>p.endsWith('.json')).map(p=>'boxbound/levels/'+p).sort();
  assert.equal(maps.length,127);
  assert.deepEqual(entry.assets.filter(p=>p.startsWith('boxbound/levels/')).sort(),maps);
});

test('transport lands the original crate at its real miniature position without fading', () => {
  const s=level(8);s.player.pos=[1,0,3];
  const result=transition(s,{type:'move',dir:dirs.d}),transfer=result.transfers[0];
  const owner=s.boxes.find(b=>b.id===transfer.container),inner=s.rooms[owner.inside],ratio=owner.size/inner.size;
  const view=boxTravel(transfer,s.player.room,s,result.state);
  const end=boxTravelPose(view,BOX_TRANSFER_MS);
  assert.equal(end.opacity,1);assert.equal(end.scale,ratio);
  for(const axis of [0,2]) assert.ok(Math.abs(end.position[axis]-(owner.pos[axis]+(owner.size-1)/2+(transfer.to[axis]-(inner.size-1)/2)*ratio))<1e-10);
  assert.ok(Math.abs(end.position[1]-(owner.pos[1]+owner.size*.055+transfer.to[1]*ratio))<1e-10);
  const innerView=boxTravel(transfer,inner.id,s,result.state);
  assert.equal(innerView.startScale,1/ratio);
  assert.deepEqual(boxTravelPose(innerView,BOX_TRANSFER_MS).position,transfer.to);
});
test('character crossing scales continuously in both directions and keeps full visibility',()=>{
  for(const entering of [true,false]) {
    const travel={from:[-3,0,0],to:[0,0,0],startScale:entering?7:1/7,endScale:1,entering,departure:false};
    let prior=travel.startScale;
    for(let ms=0;ms<=BOX_TRANSFER_MS;ms++) {
      const pose=boxTravelPose(travel,ms);
      assert.equal(pose.opacity,1);
      assert.ok(entering?pose.scale<=prior:pose.scale>=prior);
      prior=pose.scale;
    }
    assert.equal(prior,1);
  }
});

const { mapCameraAngles, mapCameraRadius, MAP_PHI, MAP_THETA, MAP_TOP_PHI, MAP_FOV, occludesPoint } = await import('../boxbound/camera-view.ts');
const { containmentTransform, transformPoint, spaceTransform } = await import('../boxbound/space-view.ts');
test('Enter 18 outward self-root crossing preserves navigation but records the physical edge and inverse animation',async()=>{
  let s=museumLevel(27);
  for(const c of 'dss') s=advanceGame(s,{type:'move',dir:dirs[c]}).state;
  assert.deepEqual(s.player.pos,[4,0,8]);
  const action={type:'move',dir:dirs.s},out=advanceGame(s,action);
  assert.ok(out.changed);assert.ok(validState(out.state));
  assert.deepEqual(out.state.player.route,s.player.route);assert.equal(out.state.player.room,s.player.room);
  assert.deepEqual(out.playerCrossing,{container:'pp-enter18-la-1',entering:false});
  assert.deepEqual(out.state.player.pos,[2,0,4]);
  const mapping=spaceTransform(s,out.state,out.playerCrossing);
  assert.deepEqual(mapping,containmentTransform(s,out.playerCrossing.container));assert.equal(mapping.scale,1/9);
  const undoCrossing={...out.playerCrossing,entering:true},inverse=spaceTransform(out.state,s,undoCrossing);
  assert.equal(inverse.scale,9);
  for(const p of [[0,.44,4],[-2,.1,1]]) assert.ok(transformPoint(transformPoint(p,mapping),inverse).every((v,i)=>Math.abs(v-p[i])<1e-10));
  assert.equal(out.state.playerCrossing,undefined,'crossing is not persisted into save data');
  const {remember}=await import('../boxbound/history.ts'),history=[];
  remember(history,s,false,out.transfers,false,out.playerCrossing);
  assert.deepEqual(history[0].playerCrossing,out.playerCrossing);assert.notEqual(history[0].playerCrossing,out.playerCrossing);
  const {soundCues}=await import('../boxbound/sound-events.ts');
  assert.deepEqual(soundCues(s,out.state,action,undefined,false,out.playerCrossing).map(c=>c.name),['exit']);
  assert.deepEqual(soundCues(out.state,s,undefined,undefined,false,undoCrossing).map(c=>c.name),['enter']);
});
test('implicit root crossing is absent for normal steps, blocked exits and chapter return',()=>{
  let s=museumLevel(27);
  assert.equal(advanceGame(s,{type:'move',dir:dirs.s}).playerCrossing,undefined);
  for(const c of 'dss') s=advanceGame(s,{type:'move',dir:dirs[c]}).state;
  s.rooms[s.player.room].walls.push([2,0,4]);
  const blocked=advanceGame(s,{type:'move',dir:dirs.s});
  assert.equal(blocked.changed,false);assert.equal(blocked.playerCrossing,undefined);assert.deepEqual(blocked.state.player.pos,s.player.pos);
  const chapter=advanceGame(museumLevel(27),{type:'leave'});
  assert.equal(chapter.state.player.room,'pp-enter');assert.equal(chapter.playerCrossing,undefined);
});
test('both planar and spatial perspective views fit complete maps into 85 percent',()=>{
  assert.equal(MAP_PHI,Math.PI/4);assert.equal(MAP_THETA,Math.PI/18);
  assert.deepEqual(mapCameraAngles(true),{phi:MAP_TOP_PHI,theta:0});
  assert.deepEqual(mapCameraAngles(false),{phi:MAP_PHI,theta:MAP_THETA});
  for(const planar of [false,true]) for(const size of [3,5,7,9,13,17,32]) for(const aspect of [390/844,1,1.44,2.8]) {
    const {phi,theta}=mapCameraAngles(planar),radius=mapCameraRadius(size,aspect,phi,theta),half=(size+.3)/2;
    let extent=0;
    for(const x of [-half,half]) for(const z of [-half,half]) for(const y of [-.87,1.15]) {
      const right=x*Math.cos(theta)-z*Math.sin(theta),forward=x*Math.sin(theta)+z*Math.cos(theta);
      const up=(y-.25)*Math.sin(phi)-forward*Math.cos(phi);
      const depth=radius-((y-.25)*Math.cos(phi)+forward*Math.sin(phi));
      assert.ok(depth>.1);
      extent=Math.max(extent,Math.abs(right/(depth*Math.tan(MAP_FOV/2)*aspect)),Math.abs(up/(depth*Math.tan(MAP_FOV/2))));
    }
    assert.ok(Math.abs(extent-.85)<1e-10);
  }
});
test('explicit parent and child occurrences of a self room use inverse transforms, including larger boxes',()=>{
  const s=createGame(),room=s.rooms['pp-enter12-la'];s.player.room=room.id;
  const owner=s.boxes.find(b=>b.room===room.id&&b.inside===room.id);
  for(const size of [1,2,3]) {
    owner.size=size;owner.pos=[3,1,4];
    const child=containmentTransform(s,owner.id),parent=containmentTransform(s,owner.id,false);
    assert.equal(child.scale,size/room.size);assert.equal(parent.scale,room.size/size);
    for(const point of [[0,.44,0],[-2,1.5,3],[1,-.2,-1]]) {
      const mapped=transformPoint(transformPoint(point,child),parent);
      assert.ok(mapped.every((v,i)=>Math.abs(v-point[i])<1e-10));
    }
  }
});
test('a recursive root has the self parent before and after traversing its own container',()=>{
  const s=createGame();s.player.room='pp-enter12-la';
  const gateway=s.boxes.find(b=>b.levelEntry&&b.inside===s.player.room),self=s.boxes.find(b=>b.room===s.player.room&&b.inside===s.player.room);
  s.player.route=[{box:gateway.id,from:gateway.room,entry:[0,0,0]}];
  const first=outerContext(s);assert.equal(first.owner,self.id);assert.equal(first.parent,s.player.room);
  s.player.route.push({box:self.id,from:self.room,entry:[0,0,0]});
  assert.deepEqual(outerContext(s),first);
});

test('museum and all three chapters have walkable signed exits to their actual parent',()=>{
  for(const id of ['pp-hub','pp-intro','pp-enter','pp-empty']) {
    let s=createGame();const room=s.rooms[id],owner=s.boxes.find(b=>b.inside===id);
    const parentRoute=id==='pp-hub'?[]:[{box:'pp-museum',from:'world',entry:[8,0,3]}];
    s.player={room:id,pos:[...room.spawn],facing:dirs.s,route:[...parentRoute,{box:owner.id,from:owner.room,entry:[owner.pos[0],0,owner.pos[2]+1]}]};
    assert.ok(room.exitLabel);assert.equal(room.doorWidths[2],.82);
    assert.ok(!room.walls.some(p=>String(p)===String([room.size>>1,0,room.size-1])));
    const step=advanceGame(s,{type:'move',dir:dirs.s});assert.ok(step.changed);assert.equal(step.state.player.room,id);
    const out=advanceGame(step.state,{type:'move',dir:dirs.s});assert.ok(out.changed);
    assert.equal(out.state.player.room,owner.room);assert.equal(out.state.player.route.length,parentRoute.length);
    assert.deepEqual(out.state.player.pos,[owner.pos[0],0,owner.pos[2]+1]);assert.ok(validState(out.state));
    s.boxes.push({id:'exit-width-probe',room:id,pos:[...room.spawn],size:1,inside:null,fixed:false,required:false});
    s.player.pos=[room.spawn[0],0,room.spawn[2]-1];
    const blocked=advanceGame(s,{type:'move',dir:dirs.s});assert.equal(blocked.changed,false);
    assert.deepEqual(blocked.state.boxes,s.boxes);
  }
});
test('revision 9 saves gain the four exits without resetting position, moved boxes or progress',()=>{
  for(const id of ['pp-hub','pp-intro','pp-enter','pp-empty']) {
    const old=createGame();old.rulesRevision=9;old.completed=[1,11,20];old.moves=108;
    for(const r of Object.values(old.rooms).filter(r=>r.exitLabel)) {
      const door=[r.size>>1,0,r.size-1];r.walls.push([...door]);r.barriers.push([...door]);delete r.exitLabel;delete r.doorWidths;
    }
    const owner=old.boxes.find(b=>b.inside===id);
    old.player={room:id,pos:[...old.rooms[id].spawn],facing:dirs.s,route:[...(id==='pp-hub'?[]:[{box:'pp-museum',from:'world',entry:[8,0,3]}]),{box:owner.id,from:owner.room,entry:[owner.pos[0],0,owner.pos[2]+1]}]};
    old.boxes.find(b=>b.id==='pp-gateway-1').pos=[3,0,3];
    const before=clone(old),next=upgradeState(old);
    assert.equal(next.rulesRevision,13);assert.deepEqual(next.player,before.player);assert.deepEqual(next.boxes,before.boxes);
    assert.deepEqual(next.completed,before.completed);assert.equal(next.moves,108);assert.deepEqual(old,before);
    const step=advanceGame(next,{type:'move',dir:dirs.s});assert.ok(step.changed);
    assert.equal(advanceGame(step.state,{type:'move',dir:dirs.s}).state.player.room,owner.room);
  }
});


test('self-room crate exit has distinct departure and arrival occurrences without duplicating game state', () => {
  const s=museumLevel(27), room=s.player.room, crate=s.boxes.find(b=>b.id==='pp-enter18-la-2');
  crate.pos=[4,0,8];s.player.pos=[4,0,7];
  const out=advanceGame(s,{type:'move',dir:dirs.s}), t=out.transfers[0];
  assert.ok(out.changed);assert.ok(validState(out.state));
  assert.equal(t.fromRoom,room);assert.equal(t.toRoom,room);assert.equal(t.entering,false);
  assert.deepEqual(t.from,[4,0,8]);assert.deepEqual(t.to,[2,0,4]);
  assert.equal(out.state.boxes.length,s.boxes.length);
  const departing=boxTravel(t,room,s,out.state),arriving=boxTravel(t,room,s,out.state,'arrival');
  assert.deepEqual(departing.from,t.from);assert.deepEqual(arriving.to,t.to);
  assert.equal(departing.startScale,1);assert.equal(departing.endScale,9);
  assert.equal(arriving.startScale,1/9);assert.equal(arriving.endScale,1);
  const mapping=containmentTransform(s,t.container);
  for(let ms=0;ms<=BOX_TRANSFER_MS;ms++) {
    const a=boxTravelPose(departing,ms),b=boxTravelPose(arriving,ms);
    const projected=transformPoint(a.position.map((v,i)=>i===1?v:v-4),mapping).map((v,i)=>i===1?v:v+4);
    assert.ok(projected.every((v,i)=>Math.abs(v-b.position[i])<1e-10));
    assert.ok(Math.abs(a.scale*mapping.scale-b.scale)<1e-10);
    assert.equal(a.position[0],4,'current occurrence travels straight out, not diagonally to the inner exit');
  }
});
test('undo of self-room crate crossing reverses the same two physical endpoints',()=>{
  const s=museumLevel(27), room=s.player.room;
  s.boxes.find(b=>b.id==='pp-enter18-la-2').pos=[4,0,8];s.player.pos=[4,0,7];
  const out=advanceGame(s,{type:'move',dir:dirs.s}),t=out.transfers[0],back=reverseTransfers(out.transfers)[0];
  for(const role of ['departure','arrival']) {
    const forward=boxTravel(t,room,s,out.state,role), reverse=boxTravel(back,room,out.state,s,role==='departure'?'arrival':'departure');
    assert.deepEqual(reverse.from,forward.to);assert.deepEqual(reverse.to,forward.from);
    assert.equal(reverse.startScale,forward.endScale);assert.equal(reverse.endScale,forward.startScale);
  }
});


test('exterior occlusion uses a finite eye-to-target segment, including camera inside a large object',()=>{
  const eye=[0,5,5],point=[0,.2,0];
  assert.equal(occludesPoint(eye,point,[-1,1,1],[1,4,4]),true);
  assert.equal(occludesPoint(eye,point,[2,1,1],[3,4,4]),false);
  assert.equal(occludesPoint(eye,point,[-1,-3,-3],[1,-1,-1]),false);
  assert.equal(occludesPoint(eye,point,[-1,6,6],[1,8,8]),false);
  assert.equal(occludesPoint(eye,point,[-1,-1,-1],[1,6,6]),true);
  assert.equal(occludesPoint(eye,point,[-20,-1,-20],[20,.05,20]),false);
});

test('all 65 new chapter puzzles enter their authored spawn, preserve valid movement, reset and return', () => {
  let random = 271828;
  for (let n = 42; n <= 106; n++) {
    const initial = createGame(), gate = initial.boxes.find(b => b.id === `pp-gateway-${n}`);
    initial.player = {room: gate.room, pos: [gate.pos[0],0,gate.pos[2]+1], facing: dirs.w, route: []};
    const entered = advanceGame(initial,{type:'move',dir:dirs.w});
    assert.ok(entered.changed, `${n}: entry`); const original=entered.state; let s=original;
    assert.equal(s.rooms[s.player.room].level,n+10); assert.ok(validState(s),`${n}: spawn`);
    for(let i=0;i<16;i++) {
      random=(Math.imul(random,1664525)+1013904223)>>>0;
      s=advanceGame(s,{type:'move',dir:Object.values(dirs)[random>>>30]}).state;
      assert.ok(validState(s),`${n}: move ${i}`);
      const positions=new Set();
      for(const b of s.boxes.filter(b=>s.rooms[b.room].level===n+10)) {
        const key=`${b.room}/${b.pos}`;assert.ok(!positions.has(key),`${n}: overlapping boxes`);positions.add(key);
        assert.ok(!s.rooms[b.room].walls.some(w=>String(w)===String(b.pos)),`${n}: box inside wall`);
      }
    }
    if(s.rooms[s.player.room].level !== n+10) {
      s.player.pos=[gate.pos[0],0,gate.pos[2]+1];s=advanceGame(s,{type:'move',dir:dirs.w}).state;
    }
    const reset=resetLevel(s);assert.equal(reset.player.room,original.player.room);assert.deepEqual(reset.player.pos,original.player.pos);
    const exit=advanceGame(reset,{type:'leave'});assert.ok(exit.changed);assert.equal(exit.state.player.room,gate.room);
  }
});
test('revision 10 saves gain the five chapters without resetting existing puzzle or world state', () => {
  const fresh=createGame(), old=clone(fresh), chapters=['eat','reference','swap','center','clone'];old.rulesRevision=10;
  for(const [id,r] of Object.entries(old.rooms))if(r.level>51||chapters.includes(id.slice(3)))delete old.rooms[id];
  old.boxes=old.boxes.filter(b=>old.rooms[b.room]&&(!b.inside||old.rooms[b.inside]));
  old.completed=[1,11,40];old.moves=327;old.boxes.find(b=>b.id==='pp-chapter-intro').pos=[2,0,6];
  const previous=clone(old), next=upgradeState(old);
  assert.ok(validState(next));assert.equal(next.rulesRevision,13);assert.deepEqual(next.player,previous.player);
  assert.deepEqual(next.completed,previous.completed);assert.equal(next.moves,327);
  for(const b of previous.boxes)assert.deepEqual(next.boxes.find(v=>v.id===b.id),b);
  assert.equal(next.boxes.length,fresh.boxes.length);assert.deepEqual(old,previous);
});
test('clone interiors share the original room and physical exits emerge from the original box', () => {
  let s=museumLevel(83);const alias=s.boxes.find(b=>b.cloneOf&&b.room===s.player.room),original=s.boxes.find(b=>b.id===alias.cloneOf);
  assert.equal(alias.inside,original.inside);
  s.player.pos=[alias.pos[0],0,alias.pos[2]-1];s.player.facing=dirs.s;
  const entered=transition(s,{type:'move',dir:dirs.s});assert.ok(entered.changed);s=entered.state;
  assert.equal(s.player.room,original.inside);
  // Both copies are against the south wall. Enter through the clone's north
  // opening, then immediately exit north through the original.
  const out=transition(s,{type:'move',dir:dirs.w});assert.ok(out.changed);
  assert.equal(out.state.player.room,original.room);assert.deepEqual(out.state.player.pos,[original.pos[0],0,original.pos[2]-1]);
  assert.ok(validState(out.state));
});

test('Clone void exteriors permit pushing but prevent re-entry and boundary export; E still returns',()=>{
  let s=museumLevel(102), gate=s.boxes.find(b=>b.id==='pp-gateway-102'), root=s.rooms[gate.inside];
  assert.equal(root.void,true);const original=s.boxes.find(b=>b.room===root.id&&b.inside);
  s.player={room:root.id,pos:[3,0,2],facing:dirs.s,route:s.player.route.slice(0,3)};
  for(let i=0;i<3;i++){const r=transition(s,{type:'move',dir:dirs.s});assert.ok(r.changed);s=r.state;}
  const b=s.boxes.find(b=>b.id===original.id);assert.deepEqual(b.pos,[3,0,6]);
  const blocked=transition(s,{type:'move',dir:dirs.s});assert.equal(blocked.changed,false);assert.deepEqual(blocked.state.boxes,s.boxes);
  s.player.pos=[6,0,6];assert.equal(transition(s,{type:'move',dir:dirs.d}).changed,false);
  const exit=transition(s,{type:'leave'});assert.ok(exit.changed);assert.equal(exit.state.player.room,gate.room);
});

function referenceStart(n=54) {
  const s=createGame(),gate=s.boxes.find(b=>b.id===`pp-gateway-${n}`),chapter=s.boxes.find(b=>b.inside===gate.room);
  s.player={room:gate.room,pos:[gate.pos[0],0,gate.pos[2]+1],facing:dirs.w,route:[
    {box:'pp-museum',from:'world',entry:[8,0,3]},
    {box:chapter.id,from:'pp-hub',entry:[chapter.pos[0],0,chapter.pos[2]+1]},
  ]};
  return advanceGame(s,{type:'move',dir:dirs.w}).state;
}
function replayReferencePrefix() {
  let s=referenceStart();
  for(const c of advancedPaths[54].slice(0,29)) {
    const result=advanceGame(s,{type:'move',dir:dirs[c]});assert.ok(result.changed);s=result.state;
  }
  return s;
}
test('Reference 1 A-B-A cycle exits the actual path box and solves without escaping to the chapter',async()=>{
  const {spaceTransform,transformPoint}=await import('../boxbound/space-view.ts');
  let s=replayReferencePrefix();
  assert.equal(s.player.room,'pp-reference1-lb');
  assert.equal(s.player.route.at(-1).box,'pp-reference1-la-1');
  assert.equal(s.boxes.find(b=>b.id==='pp-reference1-la-2').room,'pp-reference1-lb');
  for(const [i,c] of [...'wwwddddwww'].entries()) {
    const before=s,result=advanceGame(s,{type:'move',dir:dirs[c]});assert.ok(result.changed);s=result.state;
    assert.equal(s.rooms[s.player.room].level,64);assert.ok(validState(s));
    if(i===2) {
      assert.equal(s.player.room,'pp-reference1-la');assert.deepEqual(s.player.pos,[1,0,4]);
      const a=spaceTransform(before,s,result.playerCrossing),b=spaceTransform(s,before,result.playerCrossing&&{...result.playerCrossing,entering:!result.playerCrossing.entering});
      const roundtrip=transformPoint(transformPoint([1,0,2],a),b);
      roundtrip.forEach((v,j)=>assert.ok(Math.abs(v-[1,0,2][j])<1e-8));
    }
  }
  assert.equal(finishedLevel(s),64);
  assert.equal(returnFromCompletedLevel(s,64).player.room,'pp-reference');
});
test('revision 11 repairs the saved Reference cycle bookmark without resetting moved boxes or progress',()=>{
  const s=replayReferencePrefix();s.rulesRevision=11;s.player.route.pop();s.completed=[11];s.moves=123;
  const next=upgradeState(s);
  assert.equal(next.rulesRevision,13);assert.equal(next.player.route.at(-1).box,'pp-reference1-la-1');
  assert.deepEqual(next.boxes,s.boxes);assert.deepEqual(next.player.pos,s.player.pos);assert.deepEqual(next.completed,[11]);assert.equal(next.moves,123);
});
test('exit-level leaves a recursive puzzle safely without resetting its interior or earning completion',()=>{
  const s=replayReferencePrefix();s.completed=[11];const gate=s.boxes.find(b=>b.id==='pp-gateway-54');
  const entry=s.player.route[2].entry;s.boxes.find(b=>b.id==='island-weight').room=gate.room;
  s.boxes.find(b=>b.id==='island-weight').pos=[...entry];
  const r=advanceGame(s,{type:'exit-level'});assert.ok(r.changed);
  assert.equal(r.state.player.room,gate.room);assert.equal(r.state.player.route.length,2);
  assert.notDeepEqual(r.state.player.pos,entry);assert.ok(validState(r.state));
  assert.deepEqual(r.state.boxes,s.boxes);assert.deepEqual(r.state.completed,[11]);
  assert.equal(advanceGame(createGame(),{type:'exit-level'}).changed,false);
});

test('authored room palettes separate every non-self nesting edge and remain deterministic',async()=>{
  const {assignRoomThemes,ROOM_THEMES}=await import('../boxbound/themes.ts');
  const s=createGame(),themes=assignRoomThemes(s.rooms,s.boxes);
  assert.equal(themes.size,Object.keys(s.rooms).length);
  for(const box of s.boxes) if(box.inside&&box.room!==box.inside)
    assert.notEqual(themes.get(box.room),themes.get(box.inside),`indistinguishable ${box.room} -> ${box.inside}`);
  const reversed=assignRoomThemes(Object.fromEntries(Object.entries(s.rooms).reverse()),s.boxes.toReversed());
  for(const [id,theme] of themes){assert.ok(ROOM_THEMES.includes(theme));assert.equal(theme,reversed.get(id));}
});
test('room theme overrides validate, and recursive/cloned occurrences keep the authored room identity',async()=>{
  const {mapRoomTheme}=await import('../boxbound/world-map.ts');
  const s=createGame(),r=s.rooms['pp-reference1-la'],theme=mapRoomTheme(r);
  s.boxes.find(b=>b.id==='pp-reference1-la-2').room='pp-reference1-lb';
  assert.equal(mapRoomTheme(r),theme);
  r.theme='rose';assert.ok(validState(s));assert.equal(mapRoomTheme(r),'rose');
  r.theme='invalid';assert.equal(validState(s),false);
});


test('compact chapter galleries keep every level in four columns with one-tile corridors',()=>{
  const s=createGame();
  for(const [chapter,count] of Object.entries({intro:9,enter:18,empty:14,eat:12,reference:10,swap:5,center:14,clone:24})){
    const id=`pp-${chapter}`,room=s.rooms[id],gates=s.boxes.filter(b=>b.room===id&&b.levelEntry);
    assert.equal(gates.length,count);assert.equal(room.size,Math.max(4,Math.ceil(count/4))*2+3);
    assert.equal(new Set(gates.map(b=>b.pos[0])).size,4);
    gates.forEach((b,i)=>{assert.equal(b.pos[0],(room.size>>1)-3+(i%4)*2);assert.equal(b.pos[2],2+Math.floor(i/4)*2);});
    assert(!solid(s,id,room.spawn));
  }
  assert(validState(s));
});
test('revision 12 compact galleries preserve puzzle state, completed levels and safe return bookmarks',()=>{
  const old=museumLevel(9);old.rulesRevision=12;old.completed=[11];old.moves=77;
  const room=old.rooms['pp-intro'];room.size=17;room.spawn=[8,0,15];
  room.walls=[];for(let x=0;x<17;x++)for(let z=0;z<17;z++)if((x===0||x===16||z===0||z===16)&&!(x===8&&z===16))room.walls.push([x,0,z]);room.barriers=clone(room.walls);
  const gates=old.boxes.filter(b=>b.room==='pp-intro'&&b.levelEntry);gates.forEach((b,i)=>b.pos=[2+i%5*3,0,2+Math.floor(i/5)*3]);
  old.player.route[2].entry=[11,0,6];const before=clone(old),inner=old.boxes.filter(b=>b.room===old.player.room);
  const next=upgradeState(old);assert(validState(next));assert.equal(next.rooms['pp-intro'].size,11);assert.deepEqual(next.player.pos,before.player.pos);
  assert.deepEqual(next.boxes.filter(b=>b.room===old.player.room),inner);assert.deepEqual(next.completed,[11]);assert.equal(next.moves,77);
  const gate=next.boxes.find(b=>b.id==='pp-gateway-9');assert.deepEqual(next.player.route[2].entry,[gate.pos[0],0,gate.pos[2]+1]);
  assert(validState(advanceGame(next,{type:'exit-level'}).state));assert.deepEqual(old,before);assert.deepEqual(upgradeState(next),next);
  old.player.room='pp-intro';old.player.pos=[14,0,15];old.player.route.pop();const migrated=upgradeState(old);assert(validState(migrated));assert(migrated.player.pos.every(v=>v<11));
});
