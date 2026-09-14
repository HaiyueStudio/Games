import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderOrbitalDrift} from '../../scripts/sky-music-score.mjs';
import {encodeSkyWav,SKY_MUSIC,SKY_AUDIO_ASSETS,soundPath} from '../sky-strike/audio/synthesis.ts';
test('original music is reproducible 40-second PCM, bounded, active across seam and packaged for web and native',()=>{
 const pcm=renderOrbitalDrift(),wav=readFileSync(new URL('../sky-strike/'+soundPath(SKY_MUSIC.id),import.meta.url));
 assert.equal(pcm.length,40*44100);assert.deepEqual(wav,Buffer.from(encodeSkyWav(pcm)));
 let peak=0,energy=0;for(const s of pcm){assert.ok(Number.isFinite(s));peak=Math.max(peak,Math.abs(s));energy+=s*s;}
 assert.ok(peak<.8&&peak>.4);assert.ok(Math.sqrt(energy/pcm.length)>.08);
 assert.ok(Math.abs(pcm[0]-pcm.at(-1))<.01,'no discontinuity at wrap');
 for(let sec=0;sec<40;sec++){let e=0;for(let i=sec*44100;i<(sec+1)*44100;i++)e+=pcm[i]**2;assert.ok(Math.sqrt(e/44100)>.04,'no silent bar '+sec);}
 assert.equal(wav.readUInt16LE(22),1);assert.equal(wav.readUInt32LE(24),44100);assert.equal(wav.readUInt32LE(40),40*44100*2);
 assert.equal(SKY_AUDIO_ASSETS.find(a=>a.id===SKY_MUSIC.id).seconds,40);
 const entry=JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url))).entries.find(e=>e.id==='sky-strike');assert.ok(JSON.stringify(entry).includes('sky-strike/'+soundPath(SKY_MUSIC.id)));
 const sync=readFileSync(new URL('../../../Native/examples/sky-strike/scripts/sync-game-assets.mjs',import.meta.url),'utf8');assert.ok(sync.includes("'orbital-drift'"));
});
