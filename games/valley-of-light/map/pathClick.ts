import { BasicMaterial, CartesianTransform3D, Entity, Mesh3D, createPlane3D, type Scene } from '@haiyue/engine';
import { add, centerIndex, mul, unit, worldSamples, type MapRuntime, type Vec3 } from './model';

/** One reusable surface-local pulse. It never participates in picking or map export. */
export class PathClick {
  private readonly transform=new CartesianTransform3D();
  private readonly material:BasicMaterial;
  private readonly entity:Entity;
  private target:{runtime:MapRuntime;id:string;index:number;age:number}|null=null;
  private position:Vec3=[0,0,0];
  private opacity=0;
  constructor(private readonly scene:Scene){
    const texture=document.createElement('canvas');texture.width=texture.height=64;
    const ctx=texture.getContext('2d')!,glow=ctx.createRadialGradient(32,32,0,32,32,32);
    glow.addColorStop(0,'rgba(255,255,245,1)');glow.addColorStop(.24,'rgba(255,255,230,1)');
    glow.addColorStop(.44,'rgba(255,234,147,.8)');glow.addColorStop(1,'rgba(255,218,111,0)');
    ctx.fillStyle=glow;ctx.fillRect(0,0,64,64);
    this.material=new BasicMaterial({texture,blending:'normal',depthWrite:false,cullMode:'none'});
    this.entity=new Entity('Path click glow').addComponent(this.transform).addComponent(new Mesh3D(createPlane3D({width:1,height:1,normal:'y'}),this.material));
    this.entity.disabled=true;scene.add(this.entity);
  }
  show(runtime:MapRuntime,id:string,index?:number):void{
    const o=runtime.map.objects.find(o=>o.id===id);if(!o)return;
    this.target={runtime,id,index:index??centerIndex(o),age:0};this.update(0,runtime);
  }
  clear():void{this.target=null;this.entity.disabled=true;this.opacity=0;}
  update(dt:number,runtime:MapRuntime|null):void{
    const target=this.target;if(!target)return;
    target.age+=dt;
    if(runtime!==target.runtime||target.age>=1){this.clear();return;}
    const o=runtime!.map.objects.find(o=>o.id===target.id),sample=o&&worldSamples(runtime!.map,o,runtime!.poses)[target.index];
    if(!sample){this.clear();return;}
    const y=sample.up,x=unit(Math.abs(y[0])<.9?[0,y[2],-y[1]]:[-y[2],0,y[0]]);
    const z:Vec3=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
    const t=target.age,size=.22+.14*Math.sin(Math.PI*t);
    const p=add(sample.point,mul(y,.025));this.position=sample.point;
    this.opacity=Math.min(1,(1-t)/.45);this.material.color=[1,1,1,this.opacity];
    this.transform.setMatrix(new Float32Array([...mul(x,size),0,...y,0,...mul(z,size),0,...p,1]));
    this.entity.disabled=false;
  }
  snapshot():{visible:boolean;id:string|null;index:number|null;age:number;opacity:number;position:Vec3}{
    return {visible:!this.entity.disabled,id:this.target?.id??null,index:this.target?.index??null,age:this.target?.age??0,opacity:this.opacity,position:[...this.position]};
  }
  dispose():void{this.clear();this.scene.remove(this.entity);this.entity.destroy();}
}
