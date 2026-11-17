export interface SmallNetwork {mean:number[];scale:number[];w1:number[][];b1:number[];w2:number[][];b2:number[]}
export function validateNetwork(n:SmallNetwork,input:number,output:number,maxHidden:number){
  const finite=(a:number[])=>Array.isArray(a)&&a.every(v=>Number.isFinite(v)&&Math.abs(v)<1e5),h=n.b1.length;
  if(!Number.isInteger(h)||h<1||h>maxHidden||n.mean.length!==input||n.scale.length!==input||n.w1.length!==input||n.w2.length!==h||n.b2.length!==output||!finite(n.mean)||!finite(n.scale)||n.scale.some(v=>v<1e-6)||!finite(n.b1)||!finite(n.b2)||n.w1.some(r=>r.length!==h||!finite(r))||n.w2.some(r=>r.length!==output||!finite(r)))throw Error('Invalid small network');
}
export function networkLogits(f:readonly number[],n:SmallNetwork):number[]{
  if(f.length!==n.mean.length||f.some(v=>!Number.isFinite(v)))throw Error('Invalid small-network features');
  const h=[...n.b1];for(let i=0;i<f.length;i++){const x=Math.max(-5,Math.min(5,(f[i]!-n.mean[i]!)/n.scale[i]!));for(let j=0;j<h.length;j++)h[j]!+=x*n.w1[i]![j]!;}
  const z=[...n.b2];for(let j=0;j<h.length;j++)for(let k=0;k<z.length;k++)z[k]!+=Math.max(0,h[j]!)*n.w2[j]![k]!;return z;
}
export const sigmoid=(v:number)=>1/(1+Math.exp(-Math.max(-40,Math.min(40,v))));
export const softplus=(v:number)=>Math.max(v,0)+Math.log1p(Math.exp(-Math.abs(v)));
export function softmax(z:readonly number[]):number[]{const max=Math.max(...z),p=z.map(v=>Math.exp(v-max)),sum=p.reduce((a,b)=>a+b,0);return p.map(v=>v/sum);}
