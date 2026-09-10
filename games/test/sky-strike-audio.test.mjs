import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {SKY_SOUNDS,SKY_SOUND_IDS,SKY_SAMPLE_RATE,soundPath,synthesizeSkySound,encodeSkyWav} from '../sky-strike/audio/synthesis.ts';
const source=stripTypeScriptTypes(readFileSync(new URL('../sky-strike/audio/SkyStrikeAudio.ts',import.meta.url),'utf8'),{mode:'transform'}).replace("'./synthesis'",JSON.stringify(new URL('../sky-strike/audio/synthesis.ts',import.meta.url).href));
const {SkyStrikeAudio,SKY_AUDIO_SETTINGS_KEY}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
function fixture(storage){const played=[],stopped=[];const backend={unlocks:0,suspended:0,disposed:0,volume:1,unlock(){this.unlocks++;},play(id,options){played.push({id,...options});return true;},stop(channel){stopped.push(channel);},setVolume(v){this.volume=v;},suspend(){this.suspended++;},dispose(){this.disposed++;},snapshot(){return{};}};return {audio:new SkyStrikeAudio(backend,storage),backend,played,stopped};}
test('all 13 shipped sound files are reproducible bounded PCM with valid lengths, decay and seamless loop periods',()=>{
 let bytes=0;const manifest=JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url),'utf8')).entries.find(e=>e.id==='sky-strike');
 for(const id of SKY_SOUND_IDS){const pcm=synthesizeSkySound(id),wav=encodeSkyWav(pcm),shipped=readFileSync(new URL('../sky-strike/'+soundPath(id),import.meta.url));
 assert.deepEqual(Buffer.from(wav),shipped,id);assert.equal(pcm.length,Math.round(SKY_SOUNDS[id].seconds*SKY_SAMPLE_RATE));
 let peak=0,energy=0;for(const n of pcm){assert.ok(Number.isFinite(n));peak=Math.max(peak,Math.abs(n));energy+=n*n;}assert.ok(peak>.1&&peak<.83,id);assert.ok(energy/pcm.length>.001,id);
 assert.equal(shipped.toString('ascii',0,4),'RIFF');assert.equal(shipped.readUInt32LE(24),44100);assert.equal(shipped.readUInt16LE(22),1);assert.equal(shipped.readUInt16LE(34),16);assert.equal(shipped.readUInt32LE(40),pcm.length*2);
 assert.equal(Math.abs(pcm[0]),0);if(id==='laser-loop'||id==='laser-enemy'){const last=pcm.length-1;assert.ok(Math.abs(pcm[last]+pcm[1])<.001);assert.ok(Math.abs((pcm[1]-pcm[0])-(pcm[0]-pcm[last]))<.001);}else assert.equal(Math.abs(pcm.at(-1)),0);
 assert.ok(JSON.stringify(manifest).includes('sky-strike/'+soundPath(id)));bytes+=wav.length;
 }assert.equal(SKY_SOUND_IDS.length,13);assert.ok(bytes<450000);
});
test('volley cooldown, pan bounds and high priority explosions do not depend on projectile count',()=>{
 const {audio,played}=fixture();audio.play('bomb');assert.equal(played.length,0);audio.resume();for(let i=0;i<20;i++)audio.play('shot-basic',-200);assert.equal(played.length,1);assert.equal(played[0].pan,-.65);
 audio.update(64);audio.play('shot-basic');assert.equal(played.length,1);audio.update(1);audio.play('shot-basic',900);assert.equal(played.length,2);assert.equal(played[1].pan,.65);audio.play('bomb');assert.equal(played[2].priority,5);
});
test('continuous lasers are owned once, stop on release/mute/pause and never outlive disposal',()=>{
 const {audio,played,stopped,backend}=fixture();audio.resume();for(let i=0;i<40;i++)audio.lasers(true,true);assert.deepEqual(played.map(p=>p.id),['laser-start','laser-loop','laser-enemy']);assert.equal(played[1].priority,100);
 audio.lasers(false,true);assert.equal(played.at(-1).id,'laser-end');assert.ok(stopped.includes('player-laser'));audio.pause();const count=played.length;audio.lasers(true,true);audio.play('bomb');assert.equal(played.length,count);assert.equal(audio.snapshot().loops,0);assert.equal(backend.suspended,1);
 audio.resume();audio.lasers(true,true);audio.settings(false);assert.equal(audio.snapshot().loops,0);assert.equal(backend.volume,0);audio.settings(true,0);audio.play('bomb');assert.equal(audio.snapshot().loops,0);
 audio.dispose();audio.dispose();audio.resume();audio.settings(true,1);audio.lasers(true,true);audio.play('bomb');assert.equal(backend.disposed,1);assert.equal(audio.snapshot().active,false);assert.equal(audio.volume,0);
});
test('sound preferences persist separately, clamp inputs and survive unavailable storage',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};const {audio}=fixture(storage);assert.equal(audio.volume,.65);let changes=0;const off=audio.subscribe(()=>changes++);audio.settings(false,.4);assert.equal(changes,1);off();audio.settings(false,.3);assert.equal(changes,1);const restored=fixture(storage).audio;assert.equal(restored.enabled,false);assert.equal(restored.volume,.3);
 audio.settings(true,2);assert.equal(audio.volume,1);audio.settings(true,NaN);assert.equal(audio.volume,1);audio.settings(true,-2);assert.equal(audio.volume,0);
 data.set(SKY_AUDIO_SETTINGS_KEY,'{"enabled":true,"volume":9}');assert.equal(fixture(storage).audio.volume,.65);
 const denied=fixture({getItem(){throw Error('denied');},setItem(){throw Error('denied');}}).audio;denied.settings(false,.2);assert.equal(denied.saveFailed,true);assert.equal(denied.volume,.2);
});
