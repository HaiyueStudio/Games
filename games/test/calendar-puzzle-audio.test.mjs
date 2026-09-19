import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='./Sounds'&&c.parentURL?.includes('/calendar-puzzle/audio/')?'./Sounds.ts':s,c);}});
const {CalendarAudio}=await import('../calendar-puzzle/audio/CalendarAudio.ts');
const {CALENDAR_SOUNDS,CALENDAR_SOUND_IDS}=await import('../calendar-puzzle/audio/Sounds.ts');
const fake=()=>({ready:true,played:[],unlock(){},play(id,o){if(!this.ready)return false;this.played.push({id,...o});return true;},suspend(){this.suspended=true;},dispose(){this.disposed=true;},snapshot(){return {};}});
test('calendar sound cues are bounded and repeated actions are rate limited',()=>{
 const b=fake(),a=new CalendarAudio(b);a.cue('rotate',0);a.cue('rotate',20);a.cue('flip',30);a.cue('rotate',100);
 assert.deepEqual(b.played.map(p=>p.id),['rotate','flip','rotate']);assert.ok(b.played.every(p=>!p.loop&&p.gain<1));
 a.cue('win',120);assert.equal(b.played.at(-1).priority,100);
});
test('gesture unlock may defer briefly but stale cues never play after suspend or dispose',()=>{
 const b=fake(),a=new CalendarAudio(b);b.ready=false;a.cue('date',0);assert.equal(a.snapshot().pending,1);
 b.ready=true;a.update(100);assert.equal(b.played[0].id,'date');
 b.ready=false;a.cue('shuffle',200);b.ready=true;a.update(451);assert.equal(b.played.length,1);
 b.ready=false;a.cue('back',500);a.suspend();b.ready=true;a.update(520);assert.equal(b.played.length,1);
 a.dispose();a.cue('settings',600);assert.equal(b.played.length,1);assert.ok(b.disposed);
});
test('all eight shipped WAVs match native mono PCM constraints and avoid clipped or discontinuous edges',()=>{
 for(const id of CALENDAR_SOUND_IDS){
  const wav=readFileSync(new URL(`../calendar-puzzle/assets/audio/${id}.wav`,import.meta.url));
  assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt16LE(20),1);assert.equal(wav.readUInt16LE(22),1);
  assert.equal(wav.readUInt32LE(24),44100);assert.equal(wav.readUInt16LE(34),16);assert.equal((wav.length-44)/88200,CALENDAR_SOUNDS[id].seconds);
  let peak=0;for(let i=44;i<wav.length;i+=2)peak=Math.max(peak,Math.abs(wav.readInt16LE(i)));
  assert.ok(peak>1000&&peak<24000,id);assert.equal(wav.readInt16LE(44),0);assert.equal(wav.readInt16LE(wav.length-2),0);
 }
});
