import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InkTrail, TRAIL_LIMIT, TRAIL_LIFE } from '../ink-pinball/inkTrail.ts';
test('ink wake is continuous, bounded and expires after simulation time', () => {
  const trail = new InkTrail();
  for (let i=0;i<500;i++) trail.sample(i/1000,i*2,20,true);
  assert.equal(trail.marks.length,TRAIL_LIMIT);
  assert.equal(trail.marks.at(-1).length,2);
  assert.equal(trail.marks.at(-1).x,997);
  trail.sample(.5+TRAIL_LIFE,998,20,false);
  assert.equal(trail.marks.length,0);
});
test('teleports, launch parking and restarts never connect ink across the table', () => {
  const trail = new InkTrail();
  trail.sample(0,0,0,true); trail.sample(.01,5,0,true);
  assert.equal(trail.marks.length,1);
  trail.sample(.02,235,-321,true);
  assert.equal(trail.marks.length,1);
  trail.sample(.03,235,-321,false); trail.sample(.04,0,0,true);
  assert.equal(trail.marks.length,1);
  trail.reset(); assert.equal(trail.marks.length,0);
  trail.sample(.05,4,0,true); assert.equal(trail.marks.length,0);
});
