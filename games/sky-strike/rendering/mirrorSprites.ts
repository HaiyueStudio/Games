import type {IndexedSpritePlaneDescriptor} from '@haiyue/extensions/experimental/indexed-sprite';
import {mirrorVertices} from './mirrorPrism';
/** Small immutable faceted crystal masks. Rendered and collided with the same polygon. */
export function mirrorSprites():IndexedSpritePlaneDescriptor[]{
 return [[3,128,'fx:mirror-triangle'],[6,256,'fx:crystal-prism']].map(([sides,size,id])=>{
  const n=Number(size),count=Number(sides),pixels=new Uint8Array(n*n*4),vertices=mirrorVertices({x:n/2,y:n/2,radius:n*.46,rotation:0,sides:count});
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   let edge=Infinity;for(let j=0;j<count;j++){const a=vertices[j]!,b=vertices[(j+1)%count]!,dx=b.x-a.x,dy=b.y-a.y;edge=Math.min(edge,-((x+.5-a.x)*dy-(y+.5-a.y)*dx)/Math.hypot(dx,dy));}
   if(edge<-.5)continue;
   const dx=(x+.5-n/2)/n,dy=(y+.5-n/2)/n,r=Math.hypot(dx,dy),a=Math.atan2(dy,dx)+Math.PI/2,sector=((a/(Math.PI*2)*count)%1+1)%1;
   const seam=Math.exp(-Math.min(sector,1-sector)*80)*.7,outline=Math.exp(-Math.max(0,edge)/1.4),core=Math.exp(-r*18);
   const facet=(Math.floor(((a/(Math.PI*2)*count)%count+count)%count)%2)*.22;
   const shine=Math.exp(-Math.abs(dx+dy*.5-.05)*90)*.25,light=.12+facet+seam+outline*.8+core*.4+shine;
   const k=(y*n+x)*4;pixels[k]=Math.min(255,(.26+light*.85)*255);pixels[k+1]=Math.min(255,(.35+light)*255);pixels[k+2]=Math.min(255,(.58+light)*255);pixels[k+3]=Math.round(Math.min(1,edge+.5)*245);
  }
  return{id:String(id),width:n,height:n,format:'rgba8' as const,pixels};
 });
}
