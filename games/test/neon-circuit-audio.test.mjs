import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {NEON_SOUND_IDS,NEON_SOUNDS} from '../neon-circuit/audio/Sounds.ts';
import {parseMidi} from '../piano/midi.ts';
// Native and browser share this policy; replace only its asset-definition import for Node.
const source=readFileSync(new URL('../neon-circuit/audio/NeonAudio.ts',import.meta.url),'utf8').replace("from './Sounds'",`from '${new URL('../neon-circuit/audio/Sounds.ts',import.meta.url).href}'`);
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {NeonAudio}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
function fixture(){const voices=new Map(),played=[];let running=false,disposed=false;
 const backend={unlock(){running=true;},play(id,o){if(!running||disposed)return false;voices.set(o.channel,{id,...o});played.push(id);return true;},setChannelGain(id,gain){if(voices.has(id))voices.get(id).gain=gain;},stop(id){if(id)voices.delete(id);else voices.clear();},setVolume(){},suspend(){running=false;voices.clear();},dispose(){disposed=true;voices.clear();},snapshot(){return{running,disposed,voices:voices.size};}};
 return {audio:new NeonAudio(backend),voices,played,backend};}
test('actual MIDI sources and PCM assets are audible, unclipped, bounded and loop-safe',()=>{
 for(const id of NEON_SOUND_IDS){const midi=readFileSync(new URL(`../neon-circuit/assets/audio/${id}.mid`,import.meta.url));assert.ok(parseMidi(midi).notes.length>0);
  const wav=readFileSync(new URL(`../neon-circuit/assets/audio/${id}.wav`,import.meta.url));assert.equal(wav.toString('ascii',8,12),'WAVE');assert.equal(wav.readUInt16LE(22),1);assert.equal(wav.readUInt32LE(24),44100);assert.equal(wav.length,44+Math.round(NEON_SOUNDS[id].seconds*44100)*2);
  const values=Array.from({length:(wav.length-44)/2},(_,i)=>wav.readInt16LE(44+i*2)/32768);assert.ok(values.reduce((peak,v)=>Math.max(peak,Math.abs(v)),0)<.85);assert.ok(values.reduce((s,v)=>s+v*v,0)/values.length>.001);
  if(id.startsWith('engine')||id==='music')assert.ok(Math.abs(values[0]-values.at(-1))<.065,'periodic engine boundary has no large step');
  else assert.ok(Math.abs(values[0])<.001 && Math.abs(values.at(-1))<.001,'one shots fade to silence');
 }
});
test('engine starts only with racing throttle, crossfades with speed and fades after release without accumulating loops',()=>{
 const f=fixture();f.audio.unlock();f.audio.update(.05,false,true,1);assert.equal(f.voices.size,0);
 for(let i=0;i<80;i++)f.audio.update(.05,true,true,0);assert.equal(f.voices.size,3);assert.equal(f.played.length,3);assert.equal(f.voices.get('music').loop,true);
 const low=f.voices.get('engine-low').gain;f.audio.update(.05,true,true,1);assert.ok(f.voices.get('engine-low').gain<low*.01);assert.ok(f.voices.get('engine-high').gain>.3);
 f.audio.update(.05,true,false,1);assert.ok(f.audio.snapshot().engineLevel>.5 && f.audio.snapshot().engineLevel<1);
 for(let i=0;i<30;i++)f.audio.update(.05,true,false,1);assert.equal(f.voices.size,1);assert.ok(f.voices.has('music'));
});
test('wall spam is throttled, UI works in menus, and interruption/disposal cannot replay old effects',()=>{
 const f=fixture();f.audio.click();f.audio.update(.01,false,false,0);assert.deepEqual(f.played,['click']);
 for(let i=0;i<20;i++){f.audio.cue('rail');f.audio.update(.01,true,false,0);}assert.ok(f.played.filter(x=>x==='rail').length<=2);
 f.audio.cue('boost');f.audio.suspend();f.audio.unlock();f.audio.update(.05,true,false,0);assert.ok(!f.played.includes('boost'));
 f.audio.dispose();f.audio.click();f.audio.update(.05,true,true,1);assert.equal(f.voices.size,0);assert.equal(f.backend.snapshot().disposed,true);
});

test('countdown is edge-triggered, brake is gated by movement, and music does not restart while coasting',()=>{
 const f=fixture();f.audio.unlock();f.audio.beginRace();
 for(const digit of ['3','3','2','2','1','GO']){f.audio.countdown(digit);f.audio.update(.05,false,false,0);}
 assert.deepEqual(f.played,['count-3','count-2','count-1','go']);
 f.audio.update(.05,true,false,0,true);assert.ok(!f.played.includes('brake'));
 for(let i=0;i<800;i++)f.audio.update(.05,true,false,.5,true);
 assert.equal(f.played.filter(id=>id==='music').length,1);assert.equal(f.played.filter(id=>id==='brake').length,1);
 f.audio.stopDrive();assert.equal(f.voices.has('music'),false);assert.equal(f.audio.snapshot().musicPlaying,false);
 f.audio.update(.05,true,false,.5,false);assert.equal(f.played.filter(id=>id==='music').length,2);
 f.audio.beginRace();f.audio.countdown('3');f.audio.update(.05,false,false,0);assert.equal(f.played.filter(id=>id==='count-3').length,2);
});
test('music is exactly 30 seconds and all 16 bars retain audible rhythmic content',()=>{
 const b=readFileSync(new URL('../neon-circuit/assets/audio/music.wav',import.meta.url));assert.equal((b.length-44)/2/44100,30);
 const barFrames=30/16*44100;
 for(let bar=0;bar<16;bar++){let energy=0,count=0;for(let i=Math.floor(bar*barFrames);i<Math.floor((bar+1)*barFrames);i++){const v=b.readInt16LE(44+i*2)/32768;energy+=v*v;count++;}assert.ok(energy/count>.003);}
});

test('an immediate race restart can replay its first countdown tone',()=>{const f=fixture();f.audio.unlock();for(let i=0;i<2;i++){f.audio.beginRace();f.audio.countdown('3');f.audio.update(.01,false,false,0);}assert.equal(f.played.filter(id=>id==='count-3').length,2);});
