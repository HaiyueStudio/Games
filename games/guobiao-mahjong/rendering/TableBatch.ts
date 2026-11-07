import { BasicMaterial, CartesianTransform3D, Entity, Geometry3D, Mesh3D, type World, type PbrMaterial } from '@haiyue/engine';
import type { BlinnPhongMaterial, RadialShadowMaterial } from '@haiyue/engine/material';

type V3 = readonly [number, number, number];
type UV = readonly [number, number, number, number];
export type TileBatchPose = { x: number; y: number; z: number; angle?: number; yaw?: number };
const D = Math.SQRT1_2;
const SIDE_NORMALS: readonly V3[] = [[0,0,-1],[D,0,-D],[1,0,0],[D,0,D],[0,0,1],[-D,0,D],[-1,0,0],[-D,0,-D]];
const FULL_UV: UV = [0,0,1,1];
/** One rotation basis per slab/face, rather than four trig calls for every vertex. */
function transformFor(pose: TileBatchPose) {
  const ca=Math.cos(pose.angle??0),sa=Math.sin(pose.angle??0),cb=Math.cos(pose.yaw??0),sb=Math.sin(pose.yaw??0);
  return (p:V3,vector=false):V3 => {
    const y=p[1]*ca-p[2]*sa,z=p[1]*sa+p[2]*ca;
    return [p[0]*cb+z*sb+(vector?0:pose.x),y+(vector?0:pose.y),-p[0]*sb+z*cb+(vector?0:pose.z)];
  };
}

/** Mahjong's fixed batches retain their CPU storage; only populated solid vertices are published. */
export class TableBatch {
  readonly geometry: Geometry3D;
  readonly entity: Entity;
  readonly material: BasicMaterial|BlinnPhongMaterial|RadialShadowMaterial|PbrMaterial;
  private readonly uvBuffer: Float32Array | null;
  private readonly positionBuffer: Float32Array;
  private readonly normalBuffer: Float32Array;
  private readonly indexBuffer: Uint32Array;
  private vertices=0;
  private indexCount=0;
  private publishedVertices=-1;
  private publishedIndices=-1;
  private lastUsedVertices=0;
  commits=0;
  publishedBytes=0;
  constructor(world:World,name:string,material:BasicMaterial|BlinnPhongMaterial|RadialShadowMaterial|PbrMaterial,capacity=64,textured=false) {
    this.material=material;
    this.positionBuffer=new Float32Array(capacity*3);this.normalBuffer=new Float32Array(capacity*3);
    this.uvBuffer=textured?new Float32Array(capacity*2):null;
    this.indexBuffer=new Uint32Array(Math.ceil(capacity*1.5));
    this.geometry=new Geometry3D({positions:this.positionBuffer,normals:this.normalBuffer,
      ...(this.uvBuffer?{textureCoordinates:[{set:0,data:this.uvBuffer}]}:{}),indices:new Uint32Array(0),cullMode:'none'});
    this.entity=new Entity(name).addComponent(new CartesianTransform3D()).addComponent(new Mesh3D(this.geometry,material));
    this.entity.disabled=true;world.addEntity(this.entity);
  }
  clear(){this.vertices=0;this.indexCount=0;}
  private reserve(vertices:number,indices:number){
    if((this.vertices+vertices)*3>this.positionBuffer.length||this.indexCount+indices>this.indexBuffer.length)throw new Error('Mahjong mesh capacity exceeded');
  }
  private vertex(p:V3,n:V3,u=0,v=0){
    const index=this.vertices++,offset=index*3;
    this.positionBuffer[offset]=p[0];this.positionBuffer[offset+1]=p[1];this.positionBuffer[offset+2]=p[2];
    this.normalBuffer[offset]=n[0];this.normalBuffer[offset+1]=n[1];this.normalBuffer[offset+2]=n[2];
    if(this.uvBuffer){this.uvBuffer[index*2]=u;this.uvBuffer[index*2+1]=v;}
    return index;
  }
  private triangle(a:number,b:number,c:number){
    this.indexBuffer[this.indexCount++]=a;this.indexBuffer[this.indexCount++]=b;this.indexBuffer[this.indexCount++]=c;
  }
  private quad(points:readonly V3[],normal:V3,uv:UV=FULL_UV,back=false){
    this.reserve(4,6);const [u,v,w,h]=uv;
    const a=this.vertex(points[0]!,normal,u,v),b=this.vertex(points[1]!,normal,u,v+h);
    const c=this.vertex(points[2]!,normal,u+w,v+h),d=this.vertex(points[3]!,normal,u+w,v);
    if(back){this.triangle(a,c,b);this.triangle(a,d,c);}else{this.triangle(a,b,c);this.triangle(a,c,d);}
  }
  slab(pose:TileBatchPose,width:number,depth:number,base:number,height:number,bevel=2){
    this.reserve(56,72);
    const x=width/2,z=depth/2,c=Math.min(bevel,x*.4,z*.4),transform=transformFor(pose);
    const ring:readonly (readonly [number,number])[]=[[-x+c,-z],[x-c,-z],[x,-z+c],[x,z-c],[x-c,z],[-x+c,z],[-x,z-c],[-x,-z+c]];
    const top=ring.map(([x,z])=>transform([x,base+height,z])),bottom=ring.map(([x,z])=>transform([x,base,z]));
    const center=transform([0,base+height,0]),up=transform([0,1,0],true);
    for(let i=0;i<8;i++){
      const j=(i+1)%8,normal=transform(SIDE_NORMALS[i]!,true);
      this.quad([top[i]!,bottom[i]!,bottom[j]!,top[j]!],normal);
      const a=this.vertex(center,up),b=this.vertex(top[j]!,up),d=this.vertex(top[i]!,up);this.triangle(a,b,d);
    }
  }
  face(pose:TileBatchPose,width:number,depth:number,height:number,uv?:UV,back=false){
    const transform=transformFor(pose);
    this.quad([transform([-width/2,height,-depth/2]),transform([-width/2,height,depth/2]),transform([width/2,height,depth/2]),transform([width/2,height,-depth/2])],transform([0,back?-1:1,0],true),uv,back);
  }
  roundedFace(pose:TileBatchPose,width:number,depth:number,height:number,radius:number,uv:UV=FULL_UV){
    const segments=3,points:V3[]=[],transform=transformFor(pose),normal=transform([0,1,0],true),center=transform([0,height,0]);
    for(let corner=0;corner<4;corner++){
      const cx=(corner===0||corner===3?-1:1)*(width/2-radius),cz=(corner<2?-1:1)*(depth/2-radius);
      const start=-Math.PI+corner*Math.PI/2;
      for(let step=0;step<=segments;step++){const a=start+step*Math.PI/2/segments;points.push([cx+Math.cos(a)*radius,height,cz+Math.sin(a)*radius]);}
    }
    this.reserve(points.length*3,points.length*3);
    const [u,v,w,h]=uv;
    for(let i=0;i<points.length;i++){
      const a=points[i]!,b=points[(i+1)%points.length]!;
      const c=this.vertex(center,normal,u+w/2,v+h/2),j=this.vertex(transform(b),normal,u+(b[0]/width+.5)*w,v+(b[2]/depth+.5)*h),k=this.vertex(transform(a),normal,u+(a[0]/width+.5)*w,v+(a[2]/depth+.5)*h);
      this.triangle(c,j,k);
    }
  }
  commit(){
    this.entity.disabled=this.indexCount===0;if(this.entity.disabled)return;
    // UV arrays have a fixed public semantic layout. Textured batches keep matching
    // vertex storage, while solid batches publish just their populated prefix.
    if(this.uvBuffer){
      if(this.vertices<this.lastUsedVertices)this.positionBuffer.fill(0,this.vertices*3,this.lastUsedVertices*3);
    }else if(this.vertices!==this.publishedVertices){
      this.geometry.positions=this.positionBuffer.subarray(0,this.vertices*3);
      this.geometry.normals=this.normalBuffer.subarray(0,this.vertices*3);
    }
    if(this.indexCount!==this.publishedIndices)this.geometry.indices=this.indexBuffer.subarray(0,this.indexCount);
    this.publishedVertices=this.lastUsedVertices=this.vertices;this.publishedIndices=this.indexCount;
    this.geometry.markDirty();this.commits++;
    this.publishedBytes+=this.geometry.positions.byteLength+this.geometry.normals!.byteLength+(this.uvBuffer?.byteLength??0)+this.geometry.indices!.byteLength;
  }
}
