import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { RiverFlow, riverCurve, riverPointAt, riverCrossings } = await import('../entanglement-path/art/riverFlow.ts');
const { scoreFlightFrame, scorePathPoint, displayedScore, SCORE_RISE_MS, SCORE_FLY_MS, SCORE_FLIGHT_MS } = await import('../entanglement-path/art/InkScoreFlight.ts');
hook.deregister();

test('each fresh water crossing emits its own increasing score at the corresponding cell and water-exit time', () => {
  const flow=new RiverFlow(),old={cell:'source',entry:0,exit:6};
  assert.deepEqual(flow.connect([old],0,true),[],'restore and initial sources never replay score');
  const routes=[old,{cell:'new',entry:0,exit:6},{cell:'source',entry:2,exit:7},{cell:'next',entry:1,exit:5},{cell:'new',entry:6,exit:0}];
  const steps=flow.connect(routes,1000);
  assert.deepEqual(steps.map(s=>[s.cell,s.gain]),[['new',1],['source',2],['next',3]]);
  assert.equal(steps.reduce((n,s)=>n+s.gain,0),6);
  assert.ok(steps[0].at()>1000&&steps[0].at()<steps[1].at()&&steps[1].at()<steps[2].at());
  for(const step of steps) {
    const wet=flow.wetness(step.cell,step.at()).find(w=>w.entry===step.entry&&w.exit===step.exit);
    assert.ok(Math.abs(wet.progress-1)<1e-9,'score is scheduled when water finishes this channel');
  }
  assert.deepEqual(flow.connect(routes,3000),[],'old paths do not emit again');
});

test('the visible total grows receipt by receipt, smoothly counts larger gains, and settles exactly', () => {
  const receipts=[{gain:1,start:1000},{gain:2,start:1600},{gain:3,start:2200}],actual=6;
  assert.equal(displayedScore(actual,receipts,0),0);
  assert.equal(displayedScore(actual,receipts,2800),1);
  assert.equal(displayedScore(actual,receipts,3400),3);
  assert.equal(displayedScore(actual,receipts,4000),6);
  let previous=0;const seen=new Set();
  for(let time=0;time<=4200;time+=10) {const n=displayedScore(actual,receipts,time);assert.ok(n>=previous&&n<=actual);seen.add(n);previous=n;}
  assert.deepEqual([...seen],[0,1,2,3,4,5,6]);
  assert.equal(displayedScore(317,[],0),317,'restored games show their saved total immediately');
  assert.equal(actual,6,'presentation never rewrites the rule score');
});

test('earned score fades in while rising, dissolves into flight, then reaches the score before cleanup', () => {
  const layout={from:{x:400,y:460},to:{x:1020,y:175},height:38};
  const first=scoreFlightFrame(0,layout),rising=scoreFlightFrame(120,layout),lifted=scoreFlightFrame(SCORE_RISE_MS,layout);
  assert.equal(first.alpha,0);assert.deepEqual(first.point,layout.from);
  assert.ok(rising.alpha>0&&rising.alpha<1&&rising.point.y<layout.from.y);
  assert.equal(lifted.alpha,1);assert.ok(lifted.point.y<rising.point.y);assert.equal(lifted.stage,'flight');
  assert.ok(Math.hypot(lifted.point.x-scorePathPoint(layout,0).x,lifted.point.y-scorePathPoint(layout,0).y)<1e-9);
  const flowing=scoreFlightFrame(SCORE_RISE_MS+SCORE_FLY_MS*.6,layout);
  assert.equal(flowing.alpha,0);assert.equal(flowing.dissolve,1);assert.ok(flowing.point.x>layout.from.x&&flowing.point.x<layout.to.x);
  const arrived=scoreFlightFrame(SCORE_RISE_MS+SCORE_FLY_MS,layout);
  assert.equal(arrived.stage,'land');assert.deepEqual(arrived.point,layout.to);
  assert.equal(scoreFlightFrame(SCORE_FLIGHT_MS,layout).stage,'done');
});

test('score flight stays finite and retargets the real HUD after portrait/resize layout changes', () => {
  for(const layout of [{from:{x:310,y:500},to:{x:320,y:210},height:27},{from:{x:25,y:25},to:{x:25,y:25},height:27}]) {
    for(let age=0;age<=2000;age+=7) {
      const f=scoreFlightFrame(age,layout);assert.ok(Number.isFinite(f.point.x)&&Number.isFinite(f.point.y));
      assert.ok(f.alpha>=0&&f.alpha<=1&&f.dissolve>=0&&f.dissolve<=1);
    }
    assert.deepEqual(scoreFlightFrame(SCORE_RISE_MS+SCORE_FLY_MS,layout).point,layout.to);
  }
});

test('riverheads advance by arc length, preserving exact port endpoints in both directions', () => {
  for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) {
    const curve = riverCurve(a, b), reverse = riverCurve(b, a);
    assert.ok(Math.abs(curve.length - reverse.length) < 1e-8);
    assert.deepEqual(riverPointAt(curve, -1), curve.points[0]);
    assert.deepEqual(riverPointAt(curve, 1e6), curve.points.at(-1));
    let previous = riverPointAt(curve, 0);
    for (let i = 1; i <= 200; i++) {
      const next = riverPointAt(curve, curve.length * i / 200);
      const step = Math.hypot(next.x - previous.x, next.y - previous.y);
      assert.ok(step <= curve.length / 200 + 1e-8 && step > curve.length / 200 * .94, 'near-uniform spatial speed');
      previous = next;
    }
  }
});

test('crossing geometry finds isolated bridges without turning close parallel channels into junctions', () => {
  const lower = riverCurve(0, 6), upper = riverCurve(3, 9);
  const crossings = riverCrossings(lower, upper);
  assert.ok(crossings.length > 0 && crossings.length < 4);
  assert.ok(crossings.every(d => d > 18 && d < upper.length - 18));
  assert.deepEqual(riverCrossings(riverCurve(0, 1), riverCurve(2, 3)), []);
});

test('new channels fill in traversal order with one speed, including re-entry into an existing piece', () => {
  const flow = new RiverFlow(), routes = [{ cell: 'A', entry: 0, exit: 1 }, { cell: 'B', entry: 0, exit: 6 }];
  flow.connect(routes, 1000);
  const a = riverCurve(0, 1).length, b = riverCurve(0, 6).length;
  const duration = Math.min(1200, Math.max(650, (a + b) * 3.4)), first = duration * a / (a + b);
  assert.equal(flow.wetness('B', 1000 + first - 1)[0].progress, 0);
  const speedA = flow.wetness('A', 1000 + first / 2)[0].progress * a / (first / 2);
  const speedB = flow.wetness('B', 1000 + first + 20)[0].progress * b / 20;
  assert.ok(Math.abs(speedA - speedB) < 1e-8);
  flow.connect([...routes, { cell: 'A', entry: 2, exit: 7 }], 2400);
  assert.equal(flow.size, 3, 'revisited cells can acquire a second independent river');
  assert.equal(flow.wetness('A', 2400)[0].progress, 1, 'old channel remains wet');
  assert.equal(flow.wetness('A', 2400)[1].progress, 0, 'new channel begins at its own entry');
  assert.equal(flow.wetness('A', 2400)[1].bank, 0, 'bank soaking follows the waterhead');
  flow.connect([{ cell: 'A', entry: 1, exit: 0 }], 5000);
  assert.equal(flow.size, 3, 'the same segment reversed is not replayed');
});

test('rapid moves remain bounded; reset and saved-game restore leave no stale pours', () => {
  const flow = new RiverFlow();
  for (let i = 0; i < 60; i++) flow.connect([{ cell: `${i}`, entry: 0, exit: 6 }], 1000 + i);
  assert.equal(flow.size, 60);
  assert.ok(flow.movingCells(1060).size <= 2, 'old pours settle instead of building a long queue');
  assert.equal(flow.movingCells(3000).size, 0);
  flow.clear(); assert.equal(flow.size, 0); assert.equal(flow.movingCells(3000).size, 0);
  flow.connect([{ cell: 'restored', entry: 3, exit: 8 }], 3000, true);
  assert.deepEqual(flow.wetness('restored', 3000), [{ entry: 3, exit: 8, progress: 1, bank: 1 }]);
});
