/** Deterministic sound design. Render offline once; gameplay never synthesizes on the audio thread. */
export const SKY_SAMPLE_RATE = 44100;
export const SKY_SOUNDS = {
  'ui-back': {seconds:0.14,gain:0.48,priority:6,cooldown:35},
  'pickup-red': { seconds: 0.32, gain: 0.52, priority: 6, cooldown: 100 },
  'pickup-blue': { seconds: 0.27, gain: 0.50, priority: 6, cooldown: 100 },
  'pickup-purple': { seconds: 0.42, gain: 0.50, priority: 6, cooldown: 100 },
  'pickup-bomb': { seconds: 0.40, gain: 0.56, priority: 6, cooldown: 100 },
  'ui-click': { seconds: 0.075, gain: 0.48, priority: 6, cooldown: 35 },
  'shot-basic': { seconds: 0.105, gain: 0.30, priority: 2, cooldown: 65 },
  'shot-red': { seconds: 0.15, gain: 0.32, priority: 2, cooldown: 85 },
  'shot-blue': { seconds: 0.08, gain: 0.27, priority: 2, cooldown: 55 },
  'shot-enemy': { seconds: 0.095, gain: 0.14, priority: 0, cooldown: 110 },
  'explosion-small': { seconds: 0.34, gain: 0.37, priority: 1, cooldown: 65 },
  'explosion-large': { seconds: 0.8, gain: 0.55, priority: 3, cooldown: 120 },
  'explosion-boss': { seconds: 1.5, gain: 0.78, priority: 5, cooldown: 200 },
  'bomb': { seconds: 1.1, gain: 0.72, priority: 5, cooldown: 250 },
  'hit': { seconds: 0.115, gain: 0.40, priority: 3, cooldown: 100 },
  'laser-start': { seconds: 0.14, gain: 0.28, priority: 3, cooldown: 160 },
  'laser-loop': { seconds: 0.2, gain: 0.23, priority: 4, cooldown: 0 },
  'laser-end': { seconds: 0.15, gain: 0.23, priority: 3, cooldown: 160 },
  'laser-enemy': { seconds: 0.2, gain: 0.17, priority: 4, cooldown: 0 },
} as const;
export type SkySound = keyof typeof SKY_SOUNDS;
export const SKY_SOUND_IDS = Object.keys(SKY_SOUNDS) as SkySound[];
export const soundPath = (id: SkySound) => `assets/audio/${id}.wav`;
export function synthesizeSkySound(id: SkySound): Float32Array {
  const seconds = SKY_SOUNDS[id].seconds, samples = new Float32Array(Math.round(seconds * SKY_SAMPLE_RATE));
  let seed = 0x591ade, phase = 0, low = 0, slow = 0;
  for (const c of id) seed = (Math.imul(seed,31)+c.charCodeAt(0))>>>0;
  const noise = () => {seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/2147483648-1;};
  for (let i=0;i<samples.length;i++) {
    const t=i/SKY_SAMPLE_RATE,p=i/(samples.length-1),n=noise();
    let value=0;
    if(id.startsWith('pickup-')) {
      const bomb=id==='pickup-bomb',red=id==='pickup-red',blue=id==='pickup-blue';
      const notes=bomb?[392,523.25,783.99]:red?[523.25,659.25,783.99]:blue?[783.99,987.77,1318.51]:[440,659.25,1108.73];
      const step=Math.min(2,Math.floor(p*3)),local=(p*3-step),hz=notes[step]!;
      phase+=2*Math.PI*hz/SKY_SAMPLE_RATE;
      const envelope=Math.min(1,local/.07)*Math.exp(-local*3);
      value=(Math.sin(phase)*.58+Math.sin(phase*2)*.14+Math.sin(phase*(bomb?.5:3))*.08)*envelope;
    } else if(id==='ui-back') {
      phase+=2*Math.PI*(1600-1000*p)/SKY_SAMPLE_RATE;value=Math.sin(phase)*.65*Math.exp(-p*4);
    } else if(id==='ui-click') {
      const hz=t<.026?1250:1800; phase+=2*Math.PI*hz/SKY_SAMPLE_RATE;
      value=(Math.sin(phase)*.62+Math.sin(phase*2)*.12)*Math.exp(-p*4);
    } else if(id==='laser-loop'||id==='laser-enemy') {
      const hz=id==='laser-loop'?440:165;
      value=(Math.sin(2*Math.PI*hz*t+1.3*Math.sin(2*Math.PI*20*t))*.56+Math.sin(2*Math.PI*hz*2*t)*.15)*(0.85+0.15*Math.cos(2*Math.PI*5*t));
    } else if(id.startsWith('shot-')) {
      const red=id==='shot-red',blue=id==='shot-blue',enemy=id==='shot-enemy';
      const hz=(red?380:blue?1850:enemy?650:1300)*Math.exp(-t*(red?18:25))+(red?60:120);
      phase+=2*Math.PI*hz/SKY_SAMPLE_RATE;low+=.22*(n-low);
      value=(Math.sin(phase+(blue?1.4:0.25)*Math.sin(phase*2.03))*.6+low*(red?.65:.18))*Math.exp(-p*5.5);
    } else if(id.startsWith('explosion')||id==='bomb') {
      const large=id!=='explosion-small',boss=id==='explosion-boss',bomb=id==='bomb';
      const cutoff=large?0.07+(1-p)*.22:0.1+(1-p)*.45;
      low+=cutoff*(n-low);slow+=.025*(n-slow);
      phase+=2*Math.PI*((boss?85:bomb?125:large?115:210)*Math.exp(-t*8)+34)/SKY_SAMPLE_RATE;
      const body=Math.sin(phase)*Math.exp(-t*(large?4:13));
      const crack=n*Math.exp(-t*75)*.30;
      const rumble=(low*.9+slow*.8)*Math.exp(-p*3.5);
      const secondary=bomb&&t>.12?Math.sin(2*Math.PI*48*(t-.12))*Math.exp(-(t-.12)*13)*.24:0;
      value=body*.45+rumble+crack+secondary;
    } else if(id==='hit') {
      low+=.4*(n-low);value=(low*.8+Math.sin(2*Math.PI*180*t)*.35)*Math.exp(-p*6);
    } else {
      const start=id==='laser-start',hz=start?260+1100*p:900*Math.exp(-p*4)+80;
      phase+=2*Math.PI*hz/SKY_SAMPLE_RATE;
      value=(Math.sin(phase+Math.sin(phase*.51))*.65+n*.05)*Math.exp(-p*(start?1.8:4));
    }
    if(id!=='laser-loop'&&id!=='laser-enemy') {
      const attack=Math.min(1,t/.0025),release=Math.min(1,(samples.length-1-i)/(SKY_SAMPLE_RATE*.012));
      value*=attack*release;
    }
    samples[i]=Math.tanh(value*1.3)*.82;
  }
  return samples;
}
export function encodeSkyWav(samples: Float32Array): Uint8Array {
  const bytes=new Uint8Array(44+samples.length*2),v=new DataView(bytes.buffer);
  const text=(o:number,s:string)=>{for(let i=0;i<s.length;i++)bytes[o+i]=s.charCodeAt(i);};
  text(0,'RIFF');v.setUint32(4,bytes.length-8,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);
  v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,SKY_SAMPLE_RATE,true);v.setUint32(28,SKY_SAMPLE_RATE*2,true);
  v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,samples.length*2,true);
  samples.forEach((sample,i)=>v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,sample))*32767),true));return bytes;
}
