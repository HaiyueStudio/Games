import { belongsToGroup, clearPathMarker, pathMarker, detachPillar, emptyPoses, groupMatrix, identityMatrix, inverseMatrix, matrixPoint, multiplyMatrix, pointMatrix, worldSample, type MapGroup, type MapObject, type ValleyMap, type Vec3 } from '../../../games/valley-of-light/map/model';
export type MapNode=MapObject|MapGroup;
export const findNode=(map:ValleyMap,id:string):MapNode|undefined=>map.groups.find(g=>g.id===id)??map.objects.find(o=>o.id===id);
export const isGroup=(n:MapNode):n is MapGroup=>!('type' in n);
export const parentId=(n:MapNode):string|null=>isGroup(n)?n.parentId??null:n.attachment?.pathId??n.groupId;
export function subtree(map:ValleyMap,ids:readonly string[]):Set<string>{const set=new Set(ids);let changed=true;while(changed){changed=false;for(const n of [...map.groups,...map.objects])if(!set.has(n.id)&&set.has(parentId(n)??'')){set.add(n.id);changed=true;}}return set;}
export function roots(map:ValleyMap,ids:readonly string[]):string[]{const set=new Set(ids);return [...set].filter(id=>{let n=findNode(map,id);if(!n)return false;while(n&&parentId(n)){if(set.has(parentId(n)!))return false;n=findNode(map,parentId(n)!);}return true;});}
export function uniqueId(map:ValleyMap,kind='object'):string{let i=1;while(findNode(map,`${kind}-${i}`))i++;return `${kind}-${i}`;}
export function nodeOrigin(map:ValleyMap,n:MapNode):Vec3{return isGroup(n)?matrixPoint(groupMatrix(map,n.id),[0,0,0]):worldSample(map,n,{point:[0,0,0],up:[0,1,0],roll:0},emptyPoses()).point;}
/** Offset matrices retain even shear from a rotated child under a nonuniformly scaled parent. */
function setBasis(n:MapNode,m:number[]):void{
  const identity=identityMatrix();
  if(m.every((v,i)=>[12,13,14].includes(i)||Math.abs(v-identity[i]!)<1e-8)){n.position=matrixPoint(m,n.position??[0,0,0]);delete n.basis;}
  else n.basis=m.map(v=>Math.abs(v)<1e-12?0:v);
}
export function reparentNode(map:ValleyMap,id:string,target:string|null):void{
  const n=findNode(map,id);if(!n)throw new Error('节点不存在。');
  if(target&&!map.groups.some(g=>g.id===target))throw new Error('请放入父节点，普通构件不能作为容器。');
  if(isGroup(n)&&target&&belongsToGroup(map,target,id))throw new Error('不能把父节点放入自身或子节点。');
  if(!isGroup(n)&&n.attachment)throw new Error('角点立柱随依附路径归组，请移动它依附的路径。');
  const previous=parentId(n);if(previous===target)return;
  const m=multiplyMatrix(inverseMatrix(groupMatrix(map,target)),multiplyMatrix(groupMatrix(map,previous),n.basis??identityMatrix()));
  if(isGroup(n))n.parentId=target;else n.groupId=target;setBasis(n,m);
}
export function translateNode(map:ValleyMap,id:string,delta:Vec3):void{
  const n=findNode(map,id);if(!n||(!isGroup(n)&&n.attachment))return;
  const parent=groupMatrix(map,parentId(n)),world=multiplyMatrix(parent,n.basis??identityMatrix());for(let i=0;i<3;i++)world[12+i]!+=delta[i]!;setBasis(n,multiplyMatrix(inverseMatrix(parent),world));
}
export function removeNodes(map:ValleyMap,ids:readonly string[]):void{
  const all=subtree(map,ids);map.objects=map.objects.filter(o=>!all.has(o.id));map.groups=map.groups.filter(g=>!all.has(g.id));map.opticalLinks=map.opticalLinks.filter(l=>!all.has(l.a)&&!all.has(l.b));
  for(const o of map.objects){if(o.motion.targetGroup&&all.has(o.motion.targetGroup))o.motion.targetGroup=null;o.trigger.actions=o.trigger.actions.filter(a=>!all.has(a.groupId));}
}
export function copyNodes(source:ValleyMap,destination:ValleyMap,ids:readonly string[],target:string|null,offset:Vec3=[0,0,0]):string[]{
  if(target&&!destination.groups.some(g=>g.id===target))throw new Error('目标父节点不存在。');
  const top=roots(source,ids),all=subtree(source,top),remap=new Map<string,string>();
  // Reserve IDs before remapping references between the copied objects and groups.
  for(const n of [...source.groups,...source.objects].filter(n=>all.has(n.id))){const kind=isGroup(n)?'group':'object';let i=1;while(findNode(destination,`${kind}-${i}`)||[...remap.values()].includes(`${kind}-${i}`))i++;remap.set(n.id,`${kind}-${i}`);}
  for(const original of [...source.groups,...source.objects].filter(n=>all.has(n.id))){const n=structuredClone(original);n.id=remap.get(original.id)!;if(top.includes(original.id))n.name=n.name.slice(0,96)+' 副本';
    if(isGroup(n)){n.parentId=n.parentId?remap.get(n.parentId)??n.parentId:null;destination.groups.push(n);}
    else{if(pathMarker(n)?.kind==='spawn'&&destination.objects.some(o=>pathMarker(o)?.kind==='spawn'))clearPathMarker(n);if(n.attachment){if(remap.has(n.attachment.pathId))n.attachment.pathId=remap.get(n.attachment.pathId)!;else detachPillar(source,n);}n.groupId=n.groupId?remap.get(n.groupId)??n.groupId:null;if(n.motion.targetGroup)n.motion.targetGroup=remap.get(n.motion.targetGroup)??(destination.groups.some(g=>g.id===n.motion.targetGroup)?n.motion.targetGroup:null);n.trigger.actions=n.trigger.actions.flatMap(a=>{const id=remap.get(a.groupId)??(destination.groups.some(g=>g.id===a.groupId)?a.groupId:null);return id?[{...a,groupId:id}]:[];});destination.objects.push(n);}
    if(top.includes(original.id)){
      // Use the snapshot's parent transform, so copy/paste is stable after the source moves.
      let basis=!isGroup(original)&&original.attachment?identityMatrix():multiplyMatrix(groupMatrix(source,parentId(original)),original.basis??identityMatrix());
      if(!isGroup(original)&&original.attachment){basis=pointMatrix(p=>worldSample(source,original,{point:p,up:[0,1,0],roll:0},emptyPoses()).point);n.position=[0,0,0];n.rotation=[0,0,0];}
      for(let i=0;i<3;i++)basis[12+i]!+=offset[i]!;
      if(isGroup(n))n.parentId=target;else{n.groupId=target;n.attachment=null;}
      setBasis(n,multiplyMatrix(inverseMatrix(groupMatrix(destination,target)),basis));
    }
  }
  for(const l of source.opticalLinks)if(all.has(l.a)&&all.has(l.b))destination.opticalLinks.push({...l,a:remap.get(l.a)!,b:remap.get(l.b)!});
  return top.map(id=>remap.get(id)!);
}
