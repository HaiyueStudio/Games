import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopTankInput } from '../tank-battle/input/desktopControls.ts';

test('tank keyboard and pointer input preserve direction priority and independent players',()=>{
  const keys=new Set(['KeyW','KeyD','ArrowDown','Enter','Space']);
  assert.deepEqual(desktopTankInput(1,keys,[]),{direction:1,fire:true});
  assert.deepEqual(desktopTankInput(2,keys,[]),{direction:2,fire:true});
  assert.deepEqual(desktopTankInput(1,keys,['KeyA']),{direction:3,fire:true});
  keys.delete('KeyD');keys.add('KeyW');assert.equal(desktopTankInput(1,keys,[]).direction,0);
  assert.deepEqual(desktopTankInput(2,[],['KeyJ','KeyA']),{direction:null,fire:false});
  assert.deepEqual(desktopTankInput(1,[],[]),{direction:null,fire:false});
});
