import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {SOUNDS,SOUND_IDS,MUSIC,AUDIO_IDS,soundPath}=await import('../whale-maker/audio/sounds.ts');
const {WhaleAudio}=await import('../whale-maker/audio/WhaleAudio.ts');
const {emit}=await import('../whale-maker/rules/events.ts');
const {create,demo,step,EMPTY_INPUT,respawn}=await import('../whale-maker/rules/model.ts');
const {makeItem,triggerP,triggerPow}=await import('../whale-maker/rules/expansion.ts');
const {toggleColor}=await import('../whale-maker/rules/advanced.ts');
const tick=(s,i={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...i});};
function flat(){const l=demo();l.cells.fill('.');l.properties={};l.contents={};l.spawn=[2,14.2];for(let y=15;y<l.height;y++)for(let x=0;x<l.width;x++)l.cells[y*l.width+x]='#';l.cells[14*l.width+200]='E';const s=create(l);tick(s);return s;}
const scene={paused:false,editing:false,hidden:false,sessionPaused:false};
function fixture(){
 const played=[],stopped=[],volumes=[];let state='locked',disposed=0;
 const backend={unlock(){state='running';},suspend(){state='suspended';},play(id,o){if(state!=='running')return false;played.push({id,...o});return true;},stop(channel){stopped.push(channel);},stopEffects(){stopped.push('effects');},musicVolume(gain){volumes.push(gain);},dispose(){disposed++;state='closed';},snapshot(){return {state};}};
 const audio=new WhaleAudio(backend),s=flat();audio.update(s,scene,.016);
 return {audio,s,played,stopped,volumes,get disposed(){return disposed;}};
}

test('all original audio files decode as finite, nonclipping PCM with valid metadata and explicit manifest assets',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url))).entries.find(e=>e.id==='whale-maker');
 const meta=JSON.parse(readFileSync(new URL('../whale-maker/assets/audio/generation.json',import.meta.url)));const hashes=new Set();let bytes=0;
 assert.ok(manifest.capabilities.includes('audio'));assert.equal(meta.assets.length,38);
 for(const id of AUDIO_IDS){
  const data=readFileSync(new URL('../whale-maker/'+soundPath(id),import.meta.url)),m=meta.assets.find(a=>a.id===id);bytes+=data.length;
  assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WAVE');assert.equal(data.readUInt16LE(22),1);assert.equal(data.readUInt32LE(24),44100);assert.equal(data.readUInt16LE(34),16);
  const count=data.readUInt32LE(40)/2;assert.equal(count,Math.round((id===MUSIC.id?MUSIC.seconds:SOUNDS[id].seconds)*44100));
  let max=0,energy=0;for(let n=0;n<count;n++){const x=data.readInt16LE(44+n*2)/32767;max=Math.max(max,Math.abs(x));energy+=x*x;}
  assert.ok(max>.5&&max<.8,id);assert.ok(Math.sqrt(energy/count)>.015,id);if(id!==MUSIC.id){assert.equal(data.readInt16LE(44),0);assert.equal(data.readInt16LE(data.length-2),0);}
  const hash=createHash('sha256').update(data).digest('hex');hashes.add(hash);assert.equal(hash,m.sha256);assert.ok(manifest.assets.includes('whale-maker/'+soundPath(id)));
 }
 assert.equal(hashes.size,38);assert.ok(bytes<7000000);
});

test('the upbeat score has exactly 32 bars at 128 bpm, audible material across the seam and no padded silence',()=>{
 const data=readFileSync(new URL('../whale-maker/'+soundPath(MUSIC.id),import.meta.url)),count=data.readUInt32LE(40)/2;
 assert.equal(count/44100,MUSIC.bars*4*60/MUSIC.bpm);assert.ok(Math.abs(data.readInt16LE(44)-data.readInt16LE(data.length-2))/32767<.015);
 for(let at=0;at<count;at+=4410){let energy=0;const size=Math.min(4410,count-at);for(let n=0;n<size;n++)energy+=(data.readInt16LE(44+(at+n)*2)/32767)**2;assert.ok(Math.sqrt(energy/size)>.004,`silent music window ${at/44100}`);}
});

test('actual successful jumps and pickups emit once; blocked or repeated midair input does not fabricate a cue',()=>{
 const s=flat();tick(s,{jump:true},20);assert.equal(s.events.filter(e=>e.kind==='jump').length,1);tick(s);tick(s,{jump:true},10);assert.equal(s.events.filter(e=>e.kind==='jump').length,1);
 const c=flat();c.level.cells[14*c.level.width+4]='o';c.player.x=4;tick(c,{},20);assert.equal(c.events.filter(e=>e.kind==='coin').length,1);
 const brick=flat();brick.level.cells[12*brick.level.width+5]='B';Object.assign(brick.player,{x:5.1,y:13.05,vy:-8});tick(brick,{},4);assert.equal(brick.events.filter(e=>e.kind==='bump').length,1);
 const spring=flat(),item=makeItem('spring-v',8,14);item.cooldown=0;spring.items=[item];Object.assign(spring.player,{x:8.1,y:13.1,vy:7});spring.grounded=false;tick(spring,{},15);assert.ok(spring.events.some(e=>e.kind==='spring'));
});

test('mechanisms and endings emit bounded events, survive deterministic simulation and reset cleanly',()=>{
 const s=flat();triggerP(s);toggleColor(s);triggerPow(s,{defeat(){},solid(){return false;}});assert.equal(s.events.filter(e=>e.kind==='switch').length,2);assert.equal(s.events.filter(e=>e.kind==='pow').length,1);
 for(let n=0;n<100;n++)emit(s,'coin',n);assert.equal(s.events.length,64);assert.equal(new Set(s.events.map(e=>e.serial)).size,64);
 const d=flat();d.player.y=d.level.height+3;tick(d,{},12);assert.equal(d.events.filter(e=>e.kind==='death').length,1);respawn(d);assert.equal(d.eventSerial,0);assert.deepEqual(d.events,[]);
 const w=flat();w.player.x=200;w.player.y=6;w.grounded=false;tick(w,{},600);assert.equal(w.events.filter(e=>e.kind==='goal').length,1);assert.equal(w.events.filter(e=>e.kind==='victory').length,1);
 const a=flat(),b=flat();tick(a,{axis:1,jump:true},120);tick(b,{axis:1,jump:true},120);assert.deepEqual(a.events,b.events);
});

test('music requires a gesture, starts one loop, keeps its voice across pause and editor transitions and restarts once per life',()=>{
 const {audio,s,played,volumes}=fixture();audio.update(s,scene,.016);assert.equal(played.length,0);
 audio.unlock();audio.update(s,scene,.016);for(let n=0;n<100;n++)audio.update(s,scene,.016);assert.equal(played.filter(p=>p.loop).length,1);assert.equal(played[0].id,MUSIC.id);assert.equal(played[0].rate,1);
 audio.update(s,{...scene,paused:true},.016);assert.equal(audio.snapshot().backend.state,'suspended');assert.equal(audio.snapshot().musicPlaying,false);audio.update(s,scene,.016);assert.equal(audio.snapshot().musicStarts,1);assert.equal(audio.snapshot().musicPlaying,true);
 audio.reset(s,true);audio.update(s,{...scene,editing:true},.016);assert.equal(audio.snapshot().musicStarts,1);assert.equal(volumes.at(-1),.6);
 audio.reset(s);audio.update(s,scene,.016);assert.equal(audio.snapshot().musicStarts,2);
});

test('music/effect switches are independent and pause, hidden pages and session suspension discard stale effects',()=>{
 const {audio,s,played,stopped}=fixture();audio.unlock();audio.update(s,scene,.016);audio.toggleMusic();assert.equal(audio.snapshot().musicVoice,false);emit(s,'coin');audio.events(s);assert.equal(played.at(-1).id,'coin');
 audio.toggleMusic();assert.equal(audio.snapshot().musicVoice,true);audio.toggleEffects();const count=played.length;emit(s,'jump');audio.events(s);assert.equal(played.length,count);assert.ok(stopped.includes('effects'));
 audio.toggleEffects();for(const flag of ['paused','hidden','sessionPaused']){audio.update(s,{...scene,[flag]:true},.016);emit(s,'coin');audio.events(s);const before=played.length;audio.update(s,scene,.016);assert.equal(played.length,before);}
 audio.dispose();audio.dispose();const before=played.length;audio.click();audio.update(s,scene,1);emit(s,'jump');audio.events(s);assert.equal(played.length,before);
});

test('same-frame crowds do not multiply loudness; nearby effects pan and endings replace the music once',()=>{
 const {audio,s,played}=fixture();audio.unlock();audio.update(s,scene,.016);
 for(let n=0;n<30;n++)emit(s,'defeat',12);emit(s,'pow',12);audio.events(s);assert.equal(played.filter(p=>p.id==='pow').length,1);assert.equal(played.filter(p=>p.id==='defeat').length,0);
 emit(s,'coin',1);audio.events(s);assert.ok(played.at(-1).pan<0);for(let n=0;n<10;n++)emit(s,'coin',1);audio.events(s);assert.equal(played.filter(p=>p.id==='coin').length,1);
 s.phase='dead';emit(s,'death');audio.events(s);audio.update(s,scene,.016);assert.equal(audio.snapshot().musicVoice,false);assert.equal(played.filter(p=>p.id==='death').length,1);audio.events(s);assert.equal(played.filter(p=>p.id==='death').length,1);
});

test('an idle event cursor still retries pending audio once the backend is ready',()=>{
 const s=flat();let ready=false,attempts=0;const backend={unlock(){},suspend(){},stop(){},stopEffects(){},musicVolume(){},dispose(){},snapshot(){return {state:'running'};},play(id){if(id===MUSIC.id)return true;attempts++;return ready;}};
 const audio=new WhaleAudio(backend);audio.unlock();audio.update(s,scene,.016);emit(s,'coin');audio.events(s);assert.equal(attempts,1);assert.equal(audio.snapshot().pending,1);
 ready=true;audio.events(s);assert.equal(attempts,2);assert.equal(audio.snapshot().played.coin,1);assert.equal(audio.snapshot().pending,0);audio.events(s);assert.equal(attempts,2);
});
