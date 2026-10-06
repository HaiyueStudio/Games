import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {musicScore,renderMusic} from './neon-music-score.mjs';
import {parseMidi} from '../games/piano/midi.ts';
import {NEON_SOUNDS,NEON_SOUND_IDS} from '../games/neon-circuit/audio/Sounds.ts';
const directory=new URL('../games/neon-circuit/assets/audio/',import.meta.url);
mkdirSync(directory,{recursive:true});
// Notes are MIDI number, onset seconds, duration seconds, and velocity.
const scores={
 record:[[31,0,.10,127],[54,.012,.14,90],[78,.08,.12,72],[85,.15,.23,65]],
 lap:[[76,0,.13,96],[83,.10,.15,96],[88,.22,.28,88]],
 brake:[[62,0,.28,94],[50,.05,.26,78]],
 'count-3':[[76,0,.09,108]],'count-2':[[79,0,.09,108]],'count-1':[[83,0,.09,108]],
 go:[[88,0,.22,100],[95,.02,.28,85]],music:musicScore(),
 click:[[88,0,.055,100],[95,.055,.09,75]],
 course:[[64,0,.10,85],[71,.075,.12,90],[83,.16,.18,72]],
 rail:[[33,0,.19,120],[42,.012,.22,108],[78,.025,.10,76],[85,.068,.09,58]],
 boost:[[45,0,.20,88],[57,.06,.22,90],[64,.14,.25,98],[76,.27,.29,93],[88,.44,.35,70]],
 'engine-low':[[33,0,1,100]],'engine-high':[[57,0,1,100]],
};
const vlq=value=>{let v=value>>>0,bytes=[v&127];while(v>>=7)bytes.unshift((v&127)|128);return bytes;};
function midi(id){
 const events=[{tick:0,data:[0xff,0x51,3,7,0xa1,0x20]},{tick:0,data:[0xc0,103]}];
 for(const [note,start,length,velocity] of scores[id]) {
  events.push({tick:Math.round(start*960),data:[0x90,note,velocity]});
  events.push({tick:Math.round((start+length)*960),data:[0x80,note,0]});
 }
 events.sort((a,b)=>a.tick-b.tick);let previous=0,body=[];
 for(const e of events){body.push(...vlq(e.tick-previous),...e.data);previous=e.tick;}
 body.push(0,0xff,0x2f,0);const head=Buffer.alloc(22);
 head.write('MThd');head.writeUInt32BE(6,4);head.writeUInt16BE(0,8);head.writeUInt16BE(1,10);head.writeUInt16BE(480,12);
 head.write('MTrk',14);head.writeUInt32BE(body.length,18);return Buffer.concat([head,Buffer.from(body)]);
}
const rate=44100,tau=Math.PI*2,manifest=[];
for(const id of NEON_SOUND_IDS){
 const midiBytes=midi(id);writeFileSync(new URL(`${id}.mid`,directory),midiBytes);
 // Render the serialized MIDI itself, rather than a parallel copy of the score.
 const parsed=parseMidi(midiBytes),length=Math.round(NEON_SOUNDS[id].seconds*rate),pcm=new Float32Array(length);
 const loop=id.startsWith('engine');let seed=7319;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
 if(id==='music') pcm.set(renderMusic(parsed.notes,rate,length));
 else for(const note of parsed.notes){
  const start=note.startMs/1000,duration=note.durationMs/1000,frequency=440*2**((note.midi-69)/12),velocity=note.velocity/127;
  for(let i=Math.round(start*rate);i<length;i++){
   const t=i/rate-start;if(t<0||t>duration+(loop?0:.12))continue;
   const env=loop?1:Math.min(1,t/.003)*Math.exp(-t/(id==='rail'?.085:duration*.55))*Math.max(0,Math.min(1,(duration+.12-t)/.08));
   let sample;
   if(loop){const f=Math.round(frequency),phase=tau*f*t;
    sample=(Math.sin(phase+1.1*Math.sin(phase*2)+.5*Math.sin(tau*6*t))*.55+Math.sin(phase*3+.35*Math.sin(phase*4))*.12+Math.sin(tau*(id==='engine-low'?28:72)*t)*.20)*(0.82+.18*Math.cos(tau*12*t));
   }else if(id==='record')sample=Math.sin(tau*frequency*t+4*Math.exp(-t*25)*Math.sin(tau*frequency*2.1*t))*.8+random()*.22*Math.exp(-t*30);
   else if(id==='brake')sample=Math.sin(tau*frequency*(1-Math.exp(-t*4))/4+2*Math.sin(tau*frequency*1.4*t))*.56+random()*.20;
   else if(id==='rail')sample=Math.sin(tau*frequency*t+5*Math.exp(-t*22)*Math.sin(tau*frequency*2.73*t))*.45+random()*.65;
   else {const sweep=id==='boost'?t*t*frequency*.18:0;sample=Math.sin(tau*(frequency*t+sweep)+Math.exp(-t*10)*1.8*Math.sin(tau*frequency*2*t))*.72+Math.sin(tau*frequency*1.5*t)*.16;}
   pcm[i]+=sample*env*velocity;
  }
 }
 let peak=0;for(const value of pcm)peak=Math.max(peak,Math.abs(value));const scale=(loop?.58:id==='music'?.76:.80)/Math.max(peak,.001);
 const wav=Buffer.alloc(44+length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(length*2,40);
 let energy=0;for(let i=0;i<length;i++){const value=pcm[i]*scale;energy+=value*value;wav.writeInt16LE(Math.round(value*32767),44+i*2);}
 writeFileSync(new URL(`${id}.wav`,directory),wav);
 manifest.push({id,seconds:NEON_SOUNDS[id].seconds,loop:loop||id==='music',midi:`${id}.mid`,wav:`${id}.wav`,notes:parsed.notes.length,peak:peak*scale,rms:Math.sqrt(energy/length),sha256:createHash('sha256').update(wav).digest('hex')});
}
writeFileSync(new URL('generation.json',directory),JSON.stringify({generator:'node --experimental-strip-types scripts/generate-neon-audio.mjs',method:'Original MIDI format-0 scores, decoded then rendered with deterministic FM synthesis; seeded noise adds impact texture. No external samples or SoundFont.',music:{seconds:30,bpm:128,bars:16,meter:'4/4',arrangement:'Electronic drums, syncopated FM bass, chord pads and evolving arpeggios; delay tails wrap into the next loop.'},sampleRate:rate,channels:1,bits:16,effects:manifest},null,2)+'\n');
console.log(`Generated ${manifest.length} MIDI scores and matching PCM WAV effects.`);
