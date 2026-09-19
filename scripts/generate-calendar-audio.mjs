import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseMidi } from '../games/piano/midi.ts';
import { CALENDAR_SOUNDS, CALENDAR_SOUND_IDS } from '../games/calendar-puzzle/audio/Sounds.ts';
const folder = new URL('../games/calendar-puzzle/assets/audio/', import.meta.url);
mkdirSync(folder, { recursive: true });
// Original pentatonic mallet phrases, MIDI note / onset / gate / velocity.
const scores = {
 date: [[79,0,.09,90],[86,.075,.12,72]], place: [[60,0,.08,105],[72,.015,.07,58]],
 rotate: [[72,0,.075,75],[76,.06,.08,84],[79,.12,.09,72]],
 flip: [[79,0,.095,80],[67,.10,.13,90]],
 shuffle: [[60,0,.07,65],[67,.055,.07,70],[74,.12,.07,68],[64,.185,.07,78],[79,.25,.13,76]],
 win: [[72,0,.15,80],[76,.14,.15,82],[79,.28,.17,84],[84,.46,.50,90],[76,.48,.48,47],[79,.48,.48,48]],
 settings: [[81,0,.085,75]], back: [[76,0,.065,68],[67,.075,.09,68]],
};
const vlq = n => {const b=[n&127];while(n>>=7)b.unshift((n&127)|128);return b;};
function midi(notes) {
 const events=[{t:0,b:[0xff,0x51,3,7,0xa1,0x20]},{t:0,b:[0xc0,11]}];
 for(const [note,start,duration,velocity] of notes){events.push({t:Math.round(start*960),b:[0x90,note,velocity]},{t:Math.round((start+duration)*960),b:[0x80,note,0]});}
 events.sort((a,b)=>a.t-b.t);let previous=0,body=[];
 for(const e of events){body.push(...vlq(e.t-previous),...e.b);previous=e.t;}
 body.push(0,0xff,0x2f,0);const header=Buffer.alloc(22);header.write('MThd');header.writeUInt32BE(6,4);header.writeUInt16BE(1,10);header.writeUInt16BE(480,12);header.write('MTrk',14);header.writeUInt32BE(body.length,18);
 return Buffer.concat([header,Buffer.from(body)]);
}
const rate=44100,manifest=[];
for(const id of CALENDAR_SOUND_IDS){
 const bytes=midi(scores[id]);writeFileSync(new URL(id+'.mid',folder),bytes);
 const pcm=new Float64Array(Math.round(CALENDAR_SOUNDS[id].seconds*rate));
 for(const note of parseMidi(bytes).notes){
  const start=note.startMs/1000,gate=note.durationMs/1000,f=440*2**((note.midi-69)/12);
  for(let i=Math.round(start*rate);i<pcm.length;i++){
   const t=i/rate-start;if(t<0||t>gate+.22)continue;
   const attack=1-Math.exp(-t/0.0025),decay=Math.exp(-t/(id==='win'?.19:.052));
   const release=Math.max(0,1-Math.max(0,t-gate)/.22),phase=2*Math.PI*f*t;
   // Warm struck-wood fundamental with a soft bell overtone; no external samples.
   pcm[i]+=note.velocity/127*attack*decay*release*(Math.sin(phase)+.22*Math.sin(phase*2)*Math.exp(-t/.04)+.10*Math.sin(phase*3.98)*Math.exp(-t/.023));
  }
 }
 // Fixed master headroom and 12 ms end taper prevent clicks and stacked-cue clipping.
 const wav=Buffer.alloc(44+pcm.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length*2,40);
 let peak=0;
 for(let i=0;i<pcm.length;i++){const v=Math.tanh(pcm[i]*.48)*Math.min(1,(pcm.length-1-i)/(rate*.012));peak=Math.max(peak,Math.abs(v));wav.writeInt16LE(Math.round(v*32767),44+i*2);}
 writeFileSync(new URL(id+'.wav',folder),wav);manifest.push({id,seconds:pcm.length/rate,peak,sha256:createHash('sha256').update(wav).digest('hex')});
}
writeFileSync(new URL('generation.json',folder),JSON.stringify({generator:'node --experimental-strip-types scripts/generate-calendar-audio.mjs',license:'Original project-owned MIDI composition and procedural synthesis; no third-party samples',sampleRate:rate,channels:1,sounds:manifest},null,2)+'\n');
console.log('Generated',manifest.length,'calendar cues');
