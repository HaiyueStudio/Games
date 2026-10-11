import type { Geometry3DOptions } from '@haiyue/engine/geometry';
import type { MapObject, Vec3 } from './model';

export const WATER_STYLE_DEFAULTS={facetSize:.8,contrast:.7} as const;
export const WATER_PALETTES=[
  {name:'碧海',base:'#439dac',light:'#b1ded5',dark:'#235a78'},
  {name:'落日',base:'#38899d',light:'#e7b4b7',dark:'#244e72'},
  {name:'暮紫',base:'#777eab',light:'#d9cbe1',dark:'#414d79'},
] as const;
const rgb=(hex:string):Vec3=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255) as Vec3;
const mix=(a:Vec3,b:Vec3,t:number):Vec3=>a.map((v,i)=>v+(b[i]!-v)*t) as Vec3;
const hex=(rgb:Vec3)=>'#'+rgb.map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('');
export function seaColors(o:MapObject):{base:string;light:string;dark:string} {
  const base=rgb(o.colors.surface);return {base:o.colors.surface,light:o.water.lightColor??hex(mix(base,[1,1,1],.5)),dark:o.water.darkColor??hex(mix(base,[0,0,0],.45))};
}
export function seaPalette(o:MapObject):Vec3[] {
  const colors=seaColors(o),base=rgb(colors.base),light=rgb(colors.light),dark=rgb(colors.dark),contrast=o.water.contrast??WATER_STYLE_DEFAULTS.contrast;
  return Array.from({length:16},(_,i)=>{const t=(i/15*2-1)*contrast;return mix(base,t<0?dark:light,Math.abs(t));});
}
/** Repeatable jitter makes facets irregular without changing them on edits or import. */
const noise=(x:number,z:number,salt:number)=>{let n=Math.imul(x+salt,374761393)^Math.imul(z+17,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
const MAX_CELLS=2304;
export function seaMeshData(o:MapObject):Geometry3DOptions {
  const size=o.water.facetSize??WATER_STYLE_DEFAULTS.facetSize;
  let columns=Math.min(96,Math.max(1,Math.ceil(o.length/size))),rows=Math.min(96,Math.max(1,Math.ceil(o.width/(size*.5))));
  const budget=Math.min(1,Math.sqrt(MAX_CELLS/(columns*rows)));columns=Math.max(1,Math.floor(columns*budget));rows=Math.max(1,Math.floor(rows*budget));
  const points:Vec3[]=[],heights:number[][]=[],k=2*Math.PI/o.water.wavelength;
  for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++){
    const x=((col+(col===0||col===columns?0:(noise(col,row,5)-.5)*.44))/columns-.5)*o.length;
    const z=((row+(row===0||row===rows?0:(noise(col,row,11)-.5)*.44))/rows-.5)*o.width;
    points.push([x,0,z]);heights.push(Array.from({length:4},(_,j)=>{const a=k*(j<2?x+.45*z:.6*x-.8*z),amplitude=o.water.amplitude*(j<2?.65:.35);return amplitude*(j%2?Math.cos(a):Math.sin(a));}));
  }
  const triangles:number[][]=[];
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const a=row*(columns+1)+col,b=a+1,c=a+columns+1,d=c+1;
    triangles.push(...(noise(col,row,23)>.5?[[a,c,b],[b,c,d]]:[[a,c,d],[a,d,b]]));
  }
  const positions=new Float32Array(triangles.length*9),normals=new Float32Array(positions.length),uv=new Float32Array(triangles.length*6);
  const targets=Array.from({length:4},()=>({positions:new Float32Array(positions.length),normals:new Float32Array(positions.length)}));
  triangles.forEach((ids,face)=>{
    const [a,b,c]=ids.map(i=>points[i]!) as [Vec3,Vec3,Vec3],dx=b[0]-a[0],dz=b[2]-a[2],ex=c[0]-a[0],ez=c[2]-a[2],det=dx*ez-ex*dz;
    const variation=noise(face,triangles.length,31)*2-1;
    const tone=Math.min(15,Math.floor((.5+.5*Math.sign(variation)*Math.abs(variation)**1.6)*16));
    for(let vertex=0;vertex<3;vertex++){
      const offset=face*9+vertex*3;positions.set(points[ids[vertex]!]!,offset);normals.set([0,1,0],offset);uv.set([(tone+.5)/16,.5],face*6+vertex*2);
    }
    // With fixed X/Z and Y-only waves, (-dh/dx, 1, -dh/dz) is linear in the
    // four wave weights. Identical normals on each triangle remain truly flat at every phase.
    for(let j=0;j<4;j++){
      const da=heights[ids[0]!]![j]!,db=heights[ids[1]!]![j]!-da,dc=heights[ids[2]!]![j]!-da,n:Vec3=[-(db*ez-dc*dz)/det,0,-(dx*dc-ex*db)/det];
      for(let vertex=0;vertex<3;vertex++){const offset=face*9+vertex*3;targets[j]!.positions[offset+1]=heights[ids[vertex]!]![j]!;targets[j]!.normals.set(n,offset);}
    }
  });
  return {positions,normals,textureCoordinates:[{set:0,data:uv}],morphTargets:targets,morphWeights:[1,0,1,0],morphUseGpu:true,boundsMode:'manual',localBounds:{center:[0,0,0],radius:Math.hypot(o.length/2,o.width/2,o.water.amplitude)},cullMode:'none'};
}

/** Waterfalls reuse the flat facets and GPU waves, folded down from their top anchor. */
export function flowStyle(o:MapObject):MapObject {
  return {...o,width:o.type===22?o.rise:o.width,water:{...o.water,amplitude:Math.min(.04,o.water.amplitude),facetSize:o.water.facetSize??.55,lightColor:o.colors.hub,darkColor:o.colors.base}};
}
export function flowMeshData(o:MapObject):Geometry3DOptions {
  const data=seaMeshData(flowStyle(o));
  if(o.type===21){for(let i=1;i<data.positions.length;i+=3)data.positions[i]!+=.015;return data;}
  const turn=(p:Float32Array,base=false)=>{for(let i=0;i<p.length;i+=3){const y=p[i+1]!,z=p[i+2]!;p[i+1]=-z-(base?o.rise/2:0);p[i+2]=y;}};
  turn(data.positions,true);turn(data.normals!);
  for(const target of data.morphTargets!){turn(target.positions!);turn(target.normals!);}
  data.localBounds={center:[0,-o.rise/2,0],radius:Math.hypot(o.length/2,o.rise/2,.4)};return data;
}
export const FLOW_STREAKS=24;
/** All flow streaks and splash diamonds share one reusable vertex buffer and one draw. */
export function flowStreakPositions(o:MapObject,time:number,positions:Float32Array=new Float32Array((FLOW_STREAKS+(o.type===22?12:0))*18)):Float32Array {
  const t=time*o.water.speed,span=o.type===22?o.rise:o.length;let cursor=0;
  const diamond=(center:Vec3,a:Vec3,b:Vec3)=>{const p=[center.map((v,i)=>v-a[i]!),center.map((v,i)=>v+b[i]!),center.map((v,i)=>v+a[i]!),center.map((v,i)=>v-b[i]!)];for(const i of [0,1,2,0,2,3]){positions.set(p[i]!,cursor);cursor+=3;}};
  for(let i=0;i<FLOW_STREAKS;i++){
    const phase=((t*(o.type===22?1.7:.8)/span+i*.61803398875)%1+1)%1;
    const fade=Math.min(1,phase*12,(1-phase)*12),size=Math.min(.24,span*.12)*fade,across=((i*7%23)/23-.5)*.86;
    if(o.type===22)diamond([across*o.length,-phase*o.rise,.055],[0,size,0],[Math.min(.035,o.length*.025)*fade,0,0]);
    else diamond([(phase-.5)*o.length,.07,across*o.width],[size,0,0],[0,0,Math.min(.03,o.width*.03)*fade]);
  }
  if(o.type===22)for(let i=0;i<12;i++){
    const pulse=.65+.35*Math.sin(t*3+i*2.4),x=(i/11-.5)*o.length,z=.09+((i*3)%7)*.045;
    diamond([x,-o.rise+.015,z],[Math.min(.13,o.length*.07)*pulse,0,0],[0,0,.13*pulse]);
  }
  return positions;
}
export function flowBounds(o:MapObject):Vec3[] {
  return [-o.length/2,o.length/2].flatMap(x=>(o.type===22?[-o.rise,0]:[-.05,.08]).flatMap(y=>(o.type===22?[-.1,.5]:[-o.width/2,o.width/2]).map(z=>[x,y,z] as Vec3)));
}
