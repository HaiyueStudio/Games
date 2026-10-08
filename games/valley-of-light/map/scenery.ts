import { Geometry3D } from '@haiyue/engine/geometry';
import { type MapObject } from './model';

/** A small authored water mesh; the engine evaluates its four morph targets on GPU. */
export function seaGeometry(o:MapObject):Geometry3D {
  const n=32,count=(n+1)*(n+1),positions=new Float32Array(count*3),normals=new Float32Array(count*3),indices:number[]=[],k=2*Math.PI/o.water.wavelength;
  const targets=Array.from({length:4},()=>({positions:new Float32Array(count*3),normals:new Float32Array(count*3)}));
  for(let row=0;row<=n;row++)for(let col=0;col<=n;col++){
    const i=(row*(n+1)+col)*3,x=(col/n-.5)*o.length,z=(row/n-.5)*o.width;
    positions.set([x,0,z],i);normals[i+1]=1;
    for(let j=0;j<4;j++){const first=j<2,dx=k*(first?1:.6),dz=k*(first?.45:-.8),a=dx*x+dz*z,amplitude=o.water.amplitude*(first?.65:.35),cosine=j%2===1;
      targets[j]!.positions[i+1]=amplitude*(cosine?Math.cos(a):Math.sin(a));const derivative=amplitude*(cosine?-Math.sin(a):Math.cos(a));targets[j]!.normals.set([-derivative*dx,0,-derivative*dz],i);
    }
    if(row<n&&col<n){const a=row*(n+1)+col,b=a+1,c=a+n+1,d=c+1;indices.push(a,c,b,b,c,d);}
  }
  return new Geometry3D({positions,normals,indices:new Uint16Array(indices),morphTargets:targets,morphWeights:[1,0,1,0],morphUseGpu:true,boundsMode:'manual',localBounds:{center:[0,0,0],radius:Math.hypot(o.length/2,o.width/2,o.water.amplitude)},cullMode:'none'});
}
