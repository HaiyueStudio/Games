import { BasicMaterial, CartesianTransform3D, Entity, Mesh3D } from '@haiyue/engine';
import { Geometry3D } from '@haiyue/engine/geometry';
import type { MapView } from '../../../games/valley-of-light/map/view';
import type { ValleyMap, Vec3 } from '../../../games/valley-of-light/map/model';
import { findNode, nodeOrigin, roots, subtree } from './hierarchy';

const CAPACITY=600,EDGES=[0,1,0,2,0,4,1,3,1,5,2,3,2,6,3,7,4,5,4,6,5,7,6,7];
/** Editor-only line overlay: selection never changes the object's material or picking. */
export class EditorSelection {
  private readonly root=new Entity('Editor selection bounds').addComponent(new CartesianTransform3D());
  private readonly geometry=new Geometry3D({positions:new Float32Array(CAPACITY*EDGES.length*3),topology:'line-list',cullMode:'none',boundsMode:'dynamic'});
  private map:ValleyMap|null=null;private key='';private boxes:Array<{id:string;min:Vec3;max:Vec3}>=[];
  constructor(private readonly view:MapView){
    this.root.disabled=true;this.root.addComponent(new Mesh3D(this.geometry,new BasicMaterial({color:[1,.52,.045,1],blending:'normal',depthWrite:false})));view.scene.add(this.root);
  }
  update(map:ValleyMap,selected:readonly string[],visible:boolean):void {
    if(!visible||!selected.length){this.root.disabled=true;this.map=null;this.boxes=[];return;}
    const key=selected.join(':');if(this.map===map&&this.key===key)return;this.map=map;this.key=key;
    const selectedRoots=roots(map,selected),members=selectedRoots.map(id=>({id,ids:subtree(map,[id])})),all=new Set(members.flatMap(m=>[...m.ids]));
    const bounds=this.view.objectBounds(all);this.boxes=members.map(({id,ids})=>{
      const parts=bounds.filter(b=>ids.has(b.id)),origin=nodeOrigin(map,findNode(map,id)!);
      const min=[0,1,2].map(axis=>parts.length?Math.min(...parts.map(b=>b.min[axis]!)):origin[axis]!-.12) as Vec3;
      const max=[0,1,2].map(axis=>parts.length?Math.max(...parts.map(b=>b.max[axis]!)):origin[axis]!+.12) as Vec3;return {id,min,max};
    });
    this.geometry.positions.fill(0);
    this.boxes.forEach(({min,max},i)=>{EDGES.forEach((corner,vertex)=>{for(let axis=0;axis<3;axis++)this.geometry.positions[(i*EDGES.length+vertex)*3+axis]=(corner&(1<<axis))?max[axis]!+.02:min[axis]!-.02;});});
    this.geometry.markDirty();this.root.disabled=!this.boxes.length;
  }
  snapshot():unknown{return {visible:!this.root.disabled,boxes:this.boxes};}
  dispose():void{this.view.scene.remove(this.root);this.root.destroy();}
}
