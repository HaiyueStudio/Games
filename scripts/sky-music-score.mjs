/** Original score: Orbital Drift. 96 BPM, 16 bars, D minor; rendered offline only.
 * Event tails and tempo delays wrap into the next cycle rather than fading to silence.
 */
export const MUSIC_SECONDS=40, RATE=44100;
export function renderOrbitalDrift(){
 const n=RATE*MUSIC_SECONDS, beat=60/96, tau=Math.PI*2;
 const dry=new Float64Array(n), space=new Float64Array(n);
 let seed=0x51ace;const noise=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/2147483648-1;};
 const hz=note=>440*2**((note-69)/12);
 function event(at,duration,fn,wet=.3){
  const start=Math.round(at*RATE),count=Math.round(duration*RATE);
  for(let i=0;i<count;i++){const t=i/RATE,edge=Math.min(1,i/100,(count-1-i)/220),s=fn(t)*Math.max(0,edge),j=((start+i)%n+n)%n;dry[j]+=s;space[j]+=s*wet;}
 }
 const chords=[[50,57,60,64,69],[46,53,57,60,65],[53,60,64,67,72],[48,55,58,62,67],
               [50,57,60,64,69],[46,53,57,60,65],[55,62,65,69,74],[45,52,57,59,64]];
 const pattern=[0,2,1,3,2,4,1,3,0,2,4,3,1,2,3,4];
 for(let bar=0;bar<16;bar++){
  const at=bar*4*beat,c=chords[Math.floor(bar/2)],root=c[0]-12;
  if(bar%2===0)for(let v=0;v<c.length;v++){
   const f=hz(c[v]),phase=v*.73;
   event(at-.24,6.4,t=>{
    const env=Math.min(1,t/.8)*Math.min(1,(6.4-t)/1.3);
    const breath=.8+.2*Math.sin(tau*.17*t+phase);
    return env*breath*.028*(Math.sin(tau*f*t+phase)+.48*Math.sin(tau*f*1.0023*t+phase)+.16*Math.sin(tau*f*2*t));
   },.65);
  }
  for(let step=0;step<8;step++){
   const note=c[pattern[(bar%2)*8+step]]+12,f=hz(note),accent=step%3===0?1:.7;
   event(at+step*beat/2,1.3,t=>.075*accent*(1-Math.exp(-t*180))*Math.exp(-t*6)*
    (Math.sin(tau*f*t+.8*Math.sin(tau*f*2*t)*Math.exp(-t*9))+.18*Math.sin(tau*f*3*t)),.75);
  }
  for(const b of [0,1.5,2,3.5]){
   const f=hz(root+(b===3.5?12:0));
   event(at+b*beat,.5,t=>.13*(1-Math.exp(-t*100))*Math.exp(-t*5)*(Math.sin(tau*f*t)+.2*Math.sin(tau*2*f*t)),.04);
  }
  for(const b of (bar%4===3?[0,2,3.5]:[0,2]))event(at+b*beat,.42,t=>.26*Math.sin(tau*(46*t+55*.026*(1-Math.exp(-t/.026))))*Math.exp(-t*11),.02);
  for(const b of [1,3]){let low=0;event(at+b*beat,.22,t=>{const r=noise();low=low*.65+r*.35;return .077*(r-low)*Math.exp(-t*20)+.038*Math.sin(tau*175*t)*Math.exp(-t*30);},.4);}
  for(let s=0;s<8;s++){let prev=0;event(at+(s*.5+.015*(s%2))*beat,.09,t=>{const r=noise(),high=r-prev;prev=r;return high*.019*(s%2?1:.6)*Math.exp(-t*60);},.18);}
 }
 // A spacious, recurring answering melody rather than a continuous solo.
 const motifs=[[[0,81],[1.5,76],[3,77],[5.5,74]],[[.5,77],[2,79],[4,76],[6,72]],
               [[0,81],[1.5,84],[3.5,81],[5,79]],[[0,77],[2,76],[4.5,73],[6.5,76]]];
 for(let m=0;m<4;m++)for(const [b,note] of motifs[m]){
  const f=hz(note);event((m*16+8+b)*beat,2.3,t=>.052*(1-Math.exp(-t*28))*Math.exp(-t*2.2)*
   (Math.sin(tau*f*t+.009*Math.sin(tau*5*t))+.22*Math.sin(tau*2*f*t)*Math.exp(-t*3)),.9);
 }
 // Circular delay/reverb taps preserve notes crossing the exact 40-second boundary.
 const mix=dry.slice();
 for(const [seconds,gain] of [[beat*.75,.33],[beat*1.5,.23],[beat*2.25,.15],[beat*3,.09],[.137,.10],[.293,.09],[.719,.075],[1.139,.06],[1.733,.04]]){
  const offset=Math.round(seconds*RATE);for(let i=0;i<n;i++)mix[(i+offset)%n]+=space[i]*gain;
 }
 let mean=0;for(const s of mix)mean+=s/n;
 let peak=0,energy=0;for(let i=0;i<n;i++){mix[i]=Math.tanh((mix[i]-mean)*1.35);peak=Math.max(peak,Math.abs(mix[i]));energy+=mix[i]**2;}
 const gain=Math.min(.76/peak,.17/Math.sqrt(energy/n));
 return Float32Array.from(mix,s=>s*gain);
}
