import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const hook = registerHooks({ resolve(s,c,n) { return n(/^\.{1,2}\//.test(s) && !/\.[a-z0-9]+$/i.test(s) ? `${s}.ts` : s,c); } });
const { LifeRun, INITIAL_LIVES, isLifeRecord, lifeSegment } = await import('../entanglement-path/game/LifeRun.ts');
const { cellKey, VERSUS_DIRECTIONS } = await import('../entanglement-path/game/VersusRules.ts');
const { createBoardShape } = await import('../entanglement-path/game/boardShapes.ts');
hook.deregister();
const pairs = [[7,0],[1,2],[3,4],[5,6],[8,9],[10,11]];
function level(radius=4) {
  const cells=[], wallKeys=new Set(['0,0']);
  for(let q=-radius;q<=radius;q++) for(let r=-radius;r<=radius;r++) {
    const d=Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r)); if(d>radius) continue;
    cells.push({q,r}); if(d===radius) wallKeys.add(`${q},${r}`);
  }
  return {cells,wallKeys,start:{q:0,r:0},entry:7,startWall:true,randomStartExit:true,tileLibrary:[pairs]};
}
const choice = {swap:false,rotation:0};

test('life mode starts with six lives, a six-route central tile and six fixed landmarks', () => {
  const run=new LifeRun(level(),3);
  assert.equal(INITIAL_LIVES,6); assert.equal(run.lives,6); assert.equal(run.human.score,0);
  assert.equal(run.moves.length,0); assert.equal(run.human.placed.size,7); assert.equal(run.fixed.size,7);
  assert.equal(run.special.length,6); assert.equal(new Set(run.special.map(cellKey)).size,6);
  assert.ok(!run.level.wallKeys.has('0,0')); assert.ok(!run.human.ended);
  for(const [id,tile] of run.human.placed) {
    assert.equal(tile.order,0); assert.equal(tile.tile.pairs.length,6);
    assert.equal(new Set(tile.tile.pairs.flat()).size,12); assert.ok(run.fixed.has(id));
  }
  assert.equal(run.claimed.size,1,'initial departure is already used and gives no free life');
});

test('a placement spends one life, then a fresh special segment restores two and scores both new segments', () => {
  const run=new LifeRun(level(),0);
  assert.deepEqual(run.human.current,{q:1,r:0}); assert.ok(run.fixed.has('2,0'));
  run.play('human',choice);
  assert.equal(run.lives,7); assert.equal(run.human.score,3);
  assert.deepEqual(run.lastBonuses,[{cell:'2,0',count:2}]); assert.equal(run.remaining('2,0'),5);
  assert.ok(run.claimed.has(lifeSegment('2,0',7,0)));
  assert.deepEqual(run.human.current,{q:3,r:0});
});

test('returning to the center rewards each new channel, rather than rewarding the whole tile only once', () => {
  const run=new LifeRun(level(),0);
  run.play('human',{swap:false,rotation:4});
  assert.deepEqual(run.lastBonuses,[{cell:'0,0',count:1}]);
  assert.ok(run.claimed.has(lifeSegment('0,0',1,2))); assert.equal(run.remaining('0,0'),4);
  assert.deepEqual(run.human.current,{q:0,r:1}); assert.equal(run.lives,6);
  run.play('human',choice);
  assert.deepEqual(run.lastBonuses,[{cell:'0,0',count:1}]);
  assert.ok(run.claimed.has(lifeSegment('0,0',3,4))); assert.equal(run.remaining('0,0'),3);
  assert.equal(run.lives,6); assert.equal(run.human.score,6);
});

test('the last life can be rescued by a bonus in the same move; old channels cannot grant twice', () => {
  const run=new LifeRun(level(),0); run.lives=1;
  run.play('human',choice); assert.equal(run.lives,2); assert.equal(run.winner,null);
  const claimed=[...run.claimed];
  run.play('human',choice);
  assert.equal(run.lives,1); assert.equal(run.winner,null);
  assert.deepEqual([...run.claimed],claimed); assert.deepEqual(run.lastBonuses,[]);
  run.play('human',choice);
  assert.equal(run.lives,0); assert.equal(run.endReason,'life'); assert.equal(run.winner,'ended');
  assert.deepEqual([...run.claimed],claimed); assert.deepEqual(run.lastBonuses,[]);
  assert.throws(()=>run.play('human',choice),/accept/);
});

test('zero life also ends an otherwise open path; invalid input never spends a life', () => {
  const run=new LifeRun(level(),0), record=run.record();
  assert.throws(()=>run.play('human',{swap:false,rotation:6}),/Invalid/);
  assert.throws(()=>run.play('machine',choice),/accept/);
  assert.equal(run.lives,6); assert.deepEqual(run.record(),record);
  // This turn bends into an ordinary empty cell instead of the fixed landmark.
  run.lives=1; run.play('human',{swap:false,rotation:1});
  assert.equal(run.lives,0); assert.equal(run.winner,'ended'); assert.equal(run.endReason,'life');
  assert.deepEqual(run.lastBonuses,[]);
});

test('crossing the old board edge extends the mist instead of hitting a wall', () => {
  const run=new LifeRun(level(),0), original=run.level.cells.length;
  for(let n=0;n<3;n++) run.play('human',choice);
  assert.deepEqual(run.human.current,{q:5,r:0}); assert.equal(run.winner,null);
  assert.equal(run.lives,5); assert.equal(run.level.wallKeys.size,0); assert.equal(run.level.unbounded,true);
  assert.ok(run.level.cells.length>original); assert.ok(run.level.cells.some(c=>c.q===6&&c.r===0));
  assert.deepEqual(LifeRun.restore(level(),run.record()).human,run.human);
});

test('a closed loop still ends a run with life remaining, without any outer wall', () => {
  const run=new LifeRun(level(),0);
  for(const rotation of [5,5,1,1]) run.play('human',{swap:false,rotation});
  assert.equal(run.lives,5); assert.equal(run.endReason,'blocked'); assert.equal(run.winner,'ended');
  assert.equal(run.human.score,10); assert.equal(run.level.wallKeys.size,0);
});

test('life has one independent layout, and seeded runs restore life, used routes and score exactly', () => {
  const base=level();
  const shapes=[base,level(3),...['trident','blossom'].map(shape=>{
    const {cells,walls}=createBoardShape(shape); return {...base,cells,wallKeys:new Set([...walls.map(cellKey),'0,0'])};
  })];
  for(const l of shapes) for(const seed of [0,7,177]) {
    const random=Math.random; Math.random=()=>{throw Error('life mode must be seeded');};
    let run; try {run=new LifeRun(l,seed);} finally {Math.random=random;}
    assert.deepEqual(run.level,new LifeRun(base,seed).level,'bounded map selection never changes the life map');
    for(const cell of run.special) {
      assert.ok(l.cells.some(c=>cellKey(c)===cellKey(cell))); assert.ok(!run.level.wallKeys.has(cellKey(cell)));
      assert.ok(Math.max(Math.abs(cell.q),Math.abs(cell.r),Math.abs(cell.q+cell.r))>=2);
    }
    const inputWalls=[...l.wallKeys];
    for(let n=0;!run.winner&&n<100;n++) run.play('human',{swap:n%3===0,rotation:n%6});
    assert.ok(run.winner); assert.ok(run.claimed.size<=42); assert.ok(run.lives>=0);
    const restored=LifeRun.restore(l,run.record());
    assert.equal(restored.lives,run.lives); assert.equal(restored.human.score,run.human.score);
    assert.deepEqual(restored.human,run.human); assert.deepEqual([...restored.claimed],[...run.claimed]);
    assert.equal(restored.endReason,run.endReason); assert.deepEqual([...l.wallKeys],inputWalls);
    assert.deepEqual(new LifeRun(l,seed).record(),{version:2,mode:'life',seed,moves:[]});
    assert.ok(run.level.cells.length<250,'life budget bounds the materialized mist fringe');
  }
});

test('life records reject invalid modes, seeds, rotations and non-human turns', () => {
  for(const r of [null,{}, {version:1,mode:'life',seed:-1,moves:[]},
    {version:1,mode:'life',seed:0,moves:[{player:'machine',swap:false,rotation:0}]},
    {version:1,mode:'life',seed:0,moves:[{player:'human',swap:false,rotation:6}]}]) assert.equal(isLifeRecord(r),false);
  assert.throws(()=>new LifeRun(level(),2**32),/uint32/);
  assert.throws(()=>LifeRun.restore(level(),{version:1,mode:'life',seed:0,moves:[]}),/fresh run/);
  const run=new LifeRun(level(),0); for(const direction of VERSUS_DIRECTIONS) assert.ok(run.level.cells.some(c=>c.q===direction.q&&c.r===direction.r));
});
