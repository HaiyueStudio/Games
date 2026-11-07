import { CartesianTransform3D, ColorSRGB, Entity, type World } from '@haiyue/engine';
import { InstancedMesh3D } from '@haiyue/engine/components';
import { createRoundedBox3D } from '@haiyue/engine/geometry';
import { InstancedPbrMaterial } from '@haiyue/engine/material';
import { TILE_THICKNESS } from './tableModel';
import type { TileBatchPose } from './TableBatch';

const IVORY=ColorSRGB.fromHex('#eeeede').writeLinear(new Float32Array(4));
const JADE=ColorSRGB.fromHex('#226e51').writeLinear(new Float32Array(4));
const GOLD=ColorSRGB.fromHex('#edc57d').writeLinear(new Float32Array(4));
export const TILE_BODY_CAPACITY=(144+32)*2;
/** Static and flying two-tone tile bodies share one native PBR instanced draw. */
export class RoundedTileBodies {
  readonly material=new InstancedPbrMaterial(TILE_BODY_CAPACITY,{metallic:.015,roughness:.32});
  readonly geometry=createRoundedBox3D({width:40,height:7,depth:55,radius:2,segments:2});
  readonly entity:Entity;
  private readonly matrix=new Float32Array(16);
  private staticCount=0;
  private movingCount=0;
  writes=0;
  constructor(world:World){
    this.material.setActiveInstanceCount(0);
    this.entity=new Entity('Rounded PBR Mahjong bodies').addComponent(new CartesianTransform3D()).addComponent(new InstancedMesh3D(this.geometry,this.material));
    world.addEntity(this.entity);
  }
  beginStatic(){this.staticCount=0;}
  beginMoving(){this.movingCount=0;}
  add(pose:TileBatchPose,width:number,depth:number,accent:boolean,moving=false){
    const start=moving?this.staticCount+this.movingCount:this.staticCount;
    if(start+2>TILE_BODY_CAPACITY)throw new Error('Mahjong instance capacity exceeded');
    const ca=Math.cos(pose.angle??0),sa=Math.sin(pose.angle??0),cb=Math.cos(pose.yaw??0),sb=Math.sin(pose.yaw??0);
    const write=(index:number,w:number,d:number,base:number,height:number,color:Float32Array)=>{
      const m=this.matrix,sx=w/40,sy=height/7,sz=d/55,center=base+height/2;
      m[0]=cb*sx;m[1]=0;m[2]=-sb*sx;m[3]=0;
      m[4]=sa*sb*sy;m[5]=ca*sy;m[6]=sa*cb*sy;m[7]=0;
      m[8]=ca*sb*sz;m[9]=-sa*sz;m[10]=ca*cb*sz;m[11]=0;
      m[12]=pose.x+center*sa*sb;m[13]=pose.y+center*ca;m[14]=pose.z+center*sa*cb;m[15]=1;
      this.material.setTransform(index,m);this.material.setColor(index,color[0]!,color[1]!,color[2]!,1);this.writes++;
    };
    write(start,width+.7,depth+.7,0,TILE_THICKNESS*.3,JADE);write(start+1,width+.3,depth+.3,TILE_THICKNESS*.3,TILE_THICKNESS*.7,accent?GOLD:IVORY);
    if(moving)this.movingCount+=2;else this.staticCount+=2;
  }
  commit(){this.material.setActiveInstanceCount(this.staticCount+this.movingCount);}
  snapshot(){return {shape:'engine-rounded-box',thickness:TILE_THICKNESS,segments:2,radius:2,material:'instanced-pbr',staticInstances:this.staticCount,movingInstances:this.movingCount,activeInstances:this.material.activeInstanceCount,capacity:TILE_BODY_CAPACITY,transformWrites:this.writes,draws:1};}
}
