import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='./sounds'&&c.parentURL?.includes('/whale-maker/audio/')?'./sounds.ts':s,c);}});
const {SOUNDS,SOUND_IDS,MUSIC,soundPath}=await import('./sounds.ts');
const {SAMPLE_RATE,synthesizeSound,synthesizeMusic,encodeWav}=await import('./synthesis.ts');
const root=new URL('../',import.meta.url),out=new URL('../assets/audio/',import.meta.url);mkdirSync(out,{recursive:true});
const assets=[];
for(const id of [...SOUND_IDS,MUSIC.id]){
 const samples=id===MUSIC.id?synthesizeMusic():synthesizeSound(id),bytes=encodeWav(samples);let peak=0,energy=0,maxJump=0;
 for(let n=0;n<samples.length;n++){const s=samples[n];peak=Math.max(peak,Math.abs(s));energy+=s*s;if(n)maxJump=Math.max(maxJump,Math.abs(s-samples[n-1]));}
 writeFileSync(new URL(soundPath(id),root),bytes);assets.push({id,file:`${id}.wav`,seconds:samples.length/SAMPLE_RATE,bytes:bytes.length,peak,rms:Math.sqrt(energy/samples.length),maxSampleJump:maxJump,seamJump:Math.abs(samples[0]-samples.at(-1)),sha256:createHash('sha256').update(bytes).digest('hex')});
}
writeFileSync(new URL('generation.json',out),JSON.stringify({generator:'node --experimental-strip-types games/whale-maker/audio/generate.mjs',method:'Original score and deterministic offline additive/FM synthesis, filtered seeded percussion; no external recording, sample or borrowed melody.',music:{...MUSIC,title:'Pearl Breeze / 珍珠海风',meter:'4/4',instruments:['marimba','ukulele-like plucks','soft bass','light kick/rim/shaker'],loop:'Exactly 32 bars; circular note and echo tails wrap over the seam without a silence or fade.'},sampleRate:SAMPLE_RATE,channels:1,bits:16,assets},null,2)+'\n');
console.log(JSON.stringify({assets:assets.length,seconds:MUSIC.seconds,bytes:assets.reduce((sum,a)=>sum+a.bytes,0)}));
