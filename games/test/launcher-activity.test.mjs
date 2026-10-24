import test from 'node:test';
import assert from 'node:assert/strict';
import { LauncherActivity } from '../launcher/activity.ts';

test('launcher stops before entering games and resumes exactly once on return',()=>{
  const calls=[];const state=new LauncherActivity({start:()=>calls.push('run'),stop:()=>calls.push('stop')});
  state.update({ready:true});state.update({playing:true});state.update({playing:true});
  assert.equal(state.running,false);assert.deepEqual(calls,['run','stop']);
  state.update({playing:false});state.update({playing:false});assert.deepEqual(calls,['run','stop','run']);
});
test('direct game links cannot start the launcher during asynchronous initialization',()=>{
  const calls=[];const state=new LauncherActivity({start:()=>calls.push('run'),stop:()=>calls.push('stop')});
  state.update({playing:true});state.update({ready:true});assert.deepEqual(calls,[]);
  state.update({playing:false});assert.deepEqual(calls,['run']);
});
test('hidden tabs and bfcache suspension compose with games and permanent disposal',()=>{
  let starts=0,stops=0;const state=new LauncherActivity({start:()=>starts++,stop:()=>stops++});
  state.update({ready:true});state.update({hidden:true});state.update({playing:true});state.update({hidden:false});assert.equal(starts,1);
  state.update({playing:false});state.update({suspended:true});state.update({hidden:true});state.update({suspended:false});assert.equal(starts,2);
  state.update({hidden:false});state.destroy();state.update({hidden:false,playing:false,ready:true});assert.equal(starts,3);assert.equal(stops,3);assert.equal(state.running,false);
});
