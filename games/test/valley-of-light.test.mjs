import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { canManipulate, clampOffset, distance, initialState, isPuzzleState, joins, midpoint, paths, project, route, snapAngle, snapOffset } from '../valley-of-light/rules.ts';

test('unsolved bridges block exit; either mechanism alone is insufficient', () => {
  const state = initialState();
  assert.equal(route(state,'gate'),null);
  assert.equal(route({...state,angle:0},'gate'),null);
  assert.equal(route({...state,offset:0},'gate'),null);
  assert.ok(route({...state,angle:0,offset:0},'gate'));
  assert.ok(route({...state,angle:Math.PI,offset:0},'gate'), 'reversed bridge also connects');
});
test('two physically separated joins coincide in orthographic projection', () => {
  const state = {...initialState(),angle:0,offset:0};
  const optical = joins(state).filter(j=>j.illusion);
  assert.equal(optical.length,2);
  for (const join of optical) {
    assert.ok(distance(join.a,join.b)>3);
    assert.deepEqual(project(join.a),project(join.b));
  }
  assert.equal(joins(state).length,4);
});
test('routes visit endpoint seams in order in either direction', () => {
  const state = {...initialState(),angle:0,offset:0};
  const forward = route(state,'gate');
  assert.equal(forward.length,9);
  assert.deepEqual(forward.at(-1),midpoint(paths(state).at(-1)));
  const reverse = route({...state,at:'gate'},'home');
  assert.deepEqual(reverse.slice(0,-1),forward.slice(0,-1).reverse());
  assert.deepEqual(reverse.at(-1),midpoint(paths(state)[0]));
});
test('screen intersections and near misses do not create walkable shortcuts', () => {
  for (const angle of [.05,.3,Math.PI/2,Math.PI*1.5]) assert.equal(route({...initialState(),angle,offset:0},'gate'),null);
  for (const offset of [-2,-1,-.5,.5,1,2]) assert.equal(route({...initialState(),angle:0,offset},'gate'),null);
});
test('drag constraints, snapped save validation and bridge occupancy', () => {
  assert.equal(snapAngle(-Math.PI/2),Math.PI*1.5);
  assert.equal(snapAngle(Math.PI*2+.1),0);
  assert.equal(clampOffset(20),2); assert.equal(snapOffset(-.7),-.5);
  assert.ok(isPuzzleState(initialState()));
  assert.equal(isPuzzleState({...initialState(),angle:.1}),false);
  assert.equal(isPuzzleState({...initialState(),offset:Infinity}),false);
  assert.equal(isPuzzleState({...initialState(),at:'unknown'}),false);
  assert.equal(isPuzzleState({...initialState(),completed:true}),false);
  assert.equal(canManipulate({...initialState(),at:'turn'},'turn',false),false);
  assert.equal(canManipulate(initialState(),'turn',true),false);
  assert.equal(canManipulate(initialState(),'turn',false),true);
});
test('traveler ships self-contained glTF with valid Idle and Walk channels', () => {
  const model=JSON.parse(readFileSync(new URL('../valley-of-light/assets/traveler.gltf',import.meta.url),'utf8'));
  assert.equal(model.asset.version,'2.0');
  const buffer=Buffer.from(model.buffers[0].uri.split(',')[1],'base64');
  assert.equal(buffer.byteLength,model.buffers[0].byteLength);
  assert.deepEqual(model.animations.map(a=>a.name),['Idle','Walk']);
  for (const view of model.bufferViews) assert.ok(view.byteOffset+view.byteLength<=buffer.byteLength);
  for (const animation of model.animations) {
    assert.equal(animation.channels.length,5);
    for (const channel of animation.channels) {
      assert.ok(model.nodes[channel.target.node]);
      const sampler=animation.samplers[channel.sampler];
      assert.equal(model.accessors[sampler.input].count,model.accessors[sampler.output].count);
    }
  }
});
