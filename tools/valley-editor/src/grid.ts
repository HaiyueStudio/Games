import { BasicMaterial, CartesianTransform3D, Entity, Mesh3D } from '@haiyue/engine';
import { Geometry3D } from '@haiyue/engine/geometry';
import type { MapView } from '../../../games/valley-of-light/map/view';

/** An editor-only work plane, drawn and depth-tested by the engine. */
export class EditorGrid {
  private readonly root=new Entity('Editor work grid');
  private readonly transform=new CartesianTransform3D();
  private readonly batches:Array<{entity:Entity;geometry:Geometry3D}>=[];
  private key='';private height=0;private spacing=1;private lines=0;
  constructor(private readonly view:MapView){
    this.root.addComponent(this.transform);view.scene.add(this.root);
    for(const [name,color] of [['Minor grid',[.4,.53,.49,.22]],['Major grid',[.36,.48,.45,.38]],['X axis',[.67,.35,.28,.65]],['Z axis',[.3,.46,.65,.65]]] as const){
      // Keep every vertex stream at a stable capacity as the visible grid changes.
      const geometry=new Geometry3D({positions:new Float32Array(512*6),topology:'line-list',cullMode:'none',boundsMode:'dynamic'});
      const entity=new Entity(name).addComponent(new Mesh3D(geometry,new BasicMaterial({color,blending:'normal',depthWrite:false})));
      this.root.addChild(entity);this.batches.push({entity,geometry});
    }
  }
  update(height:number,step:number,visible:boolean):void {
    this.root.disabled=!visible||!Number.isFinite(height)||!Number.isFinite(step)||step<=0;if(this.root.disabled)return;
    const v=this.view,points=[[0,0],[v.width,0],[v.width,v.height],[0,v.height]].map(([x,y])=>v.ground(x!,y!,height));
    const minX=Math.min(...points.map(p=>p[0]))-1,maxX=Math.max(...points.map(p=>p[0]))+1,minZ=Math.min(...points.map(p=>p[2]))-1,maxZ=Math.max(...points.map(p=>p[2]))+1;
    let spacing=step;while(spacing*v.scale*.5<8||(maxX-minX+maxZ-minZ)/spacing>400)spacing*=2;
    const x0=Math.floor(minX/spacing),x1=Math.ceil(maxX/spacing),z0=Math.floor(minZ/spacing),z1=Math.ceil(maxZ/spacing),key=[height,spacing,x0,x1,z0,z1].join(':');
    if(key===this.key)return;this.key=key;this.height=height;this.spacing=spacing;this.transform.setPosition(0,height+.004,0);
    const streams:number[][]=[[],[],[],[]],major=Math.max(1,spacing*5),isMajor=(n:number)=>Math.abs(n/major-Math.round(n/major))<1e-6;
    for(let i=x0;i<=x1;i++){const x=i*spacing,batch=Math.abs(x)<1e-6?3:isMajor(x)?1:0;streams[batch]!.push(x,0,z0*spacing,x,0,z1*spacing);}
    for(let i=z0;i<=z1;i++){const z=i*spacing,batch=Math.abs(z)<1e-6?2:isMajor(z)?1:0;streams[batch]!.push(x0*spacing,0,z,x1*spacing,0,z);}
    this.lines=streams.reduce((n,s)=>n+s.length/6,0);
    for(let i=0;i<4;i++){const b=this.batches[i]!,data=streams[i]!;b.entity.disabled=!data.length;b.geometry.positions.fill(0);b.geometry.positions.set(data);b.geometry.markDirty();}
  }
  snapshot():unknown{return {visible:!this.root.disabled,height:this.height,spacing:this.spacing,lines:this.lines,origin:this.view.screen([0,this.height,0])};}
  dispose():void{this.view.scene.remove(this.root);this.root.destroy();}
}
