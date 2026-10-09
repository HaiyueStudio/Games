import { BasicMaterial, CartesianTransform3D, Entity, Mesh3D } from '@haiyue/engine';
import { Geometry3D } from '@haiyue/engine/geometry';
import { add, localSamples, markerIndex, mul, pathMarker, unit, type MapObject, type Vec3 } from './model';

/** A small surface glyph, separate from the road's render batch and collision geometry. */
export function createPathMarker(o:MapObject):Entity|null {
  const marker=pathMarker(o);if(!marker)return null;
  const positions:number[]=[],ring=(radius:number,thickness:number,sides:number)=>{
    const point=(i:number,r:number):Vec3=>[Math.cos(i*Math.PI*2/sides)*r,0,Math.sin(i*Math.PI*2/sides)*r];
    for(let i=0;i<sides;i++){const a=point(i,radius),b=point(i+1,radius),c=point(i+1,radius-thickness),d=point(i,radius-thickness);positions.push(...a,...b,...c,...a,...c,...d);}
  };
  if(marker.kind==='spawn'){ring(.2,.035,4);ring(.055,.055,16);}else{ring(.2,.028,24);ring(.12,.018,24);}
  const s=localSamples(o)[markerIndex(o)]!,y=s.up,x=unit(Math.abs(y[0])<.9?[0,y[2],-y[1]]:[-y[2],0,y[0]]),z:Vec3=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]],p=add(s.point,mul(y,.012));
  const scale=Math.min(1,o.length,o.width,o.thickness),transform=new CartesianTransform3D();
  transform.setMatrix(new Float32Array([...mul(x,scale),0,...y,0,...mul(z,scale),0,...p,1]));
  return new Entity(marker.kind==='spawn'?'Spawn glyph':'Exit glyph').addComponent(transform).addComponent(new Mesh3D(new Geometry3D({positions:new Float32Array(positions),cullMode:'none'}),new BasicMaterial({color:marker.kind==='spawn'?[.66,1,.81,1]:[1,.89,.45,1],blending:'normal',depthWrite:false,cullMode:'none'})));
}
