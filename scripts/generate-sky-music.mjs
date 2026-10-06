import {writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {renderOrbitalDrift,MUSIC_SECONDS,RATE} from './sky-music-score.mjs';
import {encodeSkyWav} from '../games/sky-strike/audio/synthesis.ts';
const root=new URL('../games/sky-strike/assets/audio/',import.meta.url);mkdirSync(root,{recursive:true});
const pcm=renderOrbitalDrift(),wav=encodeSkyWav(pcm);
writeFileSync(new URL('orbital-drift.wav',root),wav);
let peak=0,energy=0;for(const s of pcm){peak=Math.max(peak,Math.abs(s));energy+=s*s;}
const report={title:'Orbital Drift',composer:'Original procedural composition for Sky Strike',seconds:MUSIC_SECONDS,bpm:96,bars:16,key:'D minor',sampleRate:RATE,channels:1,bytes:wav.length,peak,rms:Math.sqrt(energy/pcm.length),seamDelta:Math.abs(pcm[0]-pcm.at(-1)),sha256:createHash('sha256').update(wav).digest('hex'),source:'scripts/sky-music-score.mjs',loop:'Circular note tails and tempo-synchronised delay; no silent padding'};
writeFileSync(new URL('orbital-drift.json',root),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
