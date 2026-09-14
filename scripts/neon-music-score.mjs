const beat=60/128,bar=beat*4;
/** A 16-bar original E-minor synth circuit; exactly 30 seconds at 128 BPM. */
export function musicScore(){
 const notes=[];
 for(let b=0;b<16;b++){
  const root=[40,36,43,38][Math.floor(b/4)],third=b<4?3:4,triad=[0,third,7,12];
  for(const pitch of [root+12,root+12+third,root+19])notes.push([pitch,b*bar,bar*.94,30]);
  for(let step=0;step<16;step++){
   const t=b*bar+step*beat/4,full=b>=4 && b!==8;
   if(step%4===0 && !(b===8&&step===8))notes.push([24,t,.24,108]);
   if(step===4||step===12)notes.push([26,t,.14,82]);
   if(step%2===0||full)notes.push([28,t,.045,step%4===2?55:step%2?23:34]);
   if(step===14 && full)notes.push([30,t,.13,31]);
   if([0,3,6,8,11,14].includes(step))notes.push([root+(step===14?12:0),t,.16,step%4===0?88:65]);
   if(step%2===0||full){const pick=(step+(b%4)*2)%triad.length;notes.push([root+24+triad[pick]+(b>=12&&step>=8?12:0),t,.11,full?43:33]);}
  }
 }
 return notes;
}
export function renderMusic(notes,rate,length){
 const out=new Float32Array(length),tau=Math.PI*2;let seed=19173;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
 const add=(i,value)=>{out[((i%length)+length)%length]+=value;};
 for(const note of notes){
  const pitch=note.midi,start=Math.round(note.startMs/1000*rate),duration=note.durationMs/1000,velocity=note.velocity/127;
  const pad=duration>1,tail=pad?.22:pitch>=60?.25:.09,f=440*2**((pitch-69)/12);
  let lastNoise=0;
  for(let j=0;j<(duration+tail)*rate;j++){
   const t=j/rate,phase=tau*f*t,release=Math.max(0,Math.min(1,(duration+tail-t)/tail));let sample;
   if(pitch===24)sample=Math.sin(tau*(42*t+110*(1-Math.exp(-t*42))/42))*Math.exp(-t*18)*1.05;
   else if(pitch===26){const noise=random();sample=((noise-lastNoise)*.42+Math.sin(tau*185*t)*.24)*Math.exp(-t*28);lastNoise=noise;}
   else if(pitch===28||pitch===30){const noise=random();sample=(noise-lastNoise)*.22*Math.exp(-t*(pitch===28?90:28));lastNoise=noise;}
   else if(pad){sample=(Math.sin(phase)+.28*Math.sin(phase*2)+.12*Math.sin(phase*3))*.22*Math.min(1,t/.05)*release;}
   else if(pitch<60)sample=Math.tanh(1.7*Math.sin(phase+.42*Math.sin(phase*2)))*.53*Math.min(1,t/.004)*Math.exp(-t*4.5)*release;
   else sample=Math.sin(phase+1.2*Math.exp(-t*13)*Math.sin(phase*2))*.38*Math.min(1,t/.003)*Math.exp(-t*12)*release;
   // Bass/pads duck around the kick; melodic delay wraps so the loop retains its tail.
   const absolute=(start+j)/rate,pump=pitch>=32?.62+.38*Math.min(1,(absolute%beat)/.13):1;
   const value=sample*velocity*pump;add(start+j,value);
   if(pitch>=60&&!pad){add(start+j+Math.round(beat*.75*rate),value*.26);add(start+j+Math.round(beat*1.5*rate),value*.11);}
  }
 }
 // A tiny equal-power seam blend removes quantization/discontinuous phase edges.
 const seam=Math.round(rate*.004),last=out[length-1],first=out[0];
 for(let i=0;i<seam;i++){const w=(1-i/seam)**2;out[i]-=(first-last)*w*.5;out[length-1-i]+=(first-last)*w*.5;}
 return out;
}
