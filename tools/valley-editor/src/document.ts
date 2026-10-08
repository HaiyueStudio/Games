import { copyNodes, findNode, isGroup, nodeOrigin, parentId, reparentNode, removeNodes, roots, subtree, translateNode, uniqueId } from './hierarchy';
import { PathPlacement } from './placement';
import { EditorPlatform } from '@haiyue/editor-platform';
import { BrowserEditorShell } from '@haiyue/editor-shell';
import { defineEditorPlugin, defineEditorProduct, type EditorDocumentAdapter, type EditorDisposable } from '@haiyue/editor-plugin-sdk';
import { canAttachPillar, cloneMap, createObject, defaultPillarOffset, groupMatrix, inverseMatrix, matrixPoint, parseMap, serializeMap, serializeCompactMap, snapPosition, splitCube, switchGarden, type MapGroup, type MapObject, type CornerId, type TypeId, type ValleyMap, type Vec3 } from '../../../games/valley-of-light/map/model';

export class ValleyDocument implements EditorDocumentAdapter<ValleyMap> {
  map:ValleyMap;revision=0;savedRevision=0;private listeners=new Set<()=>void>();private savedText:string;
  constructor(map=switchGarden()){this.map=parseMap(map);this.savedText=serializeMap(this.map);}
  get identity(){return {id:'valley-map-document',kind:'valley-map',name:this.map.name};}
  serialize():ValleyMap{return cloneMap(this.map);}
  apply(map:ValleyMap):void{this.map=parseMap(map);this.revision++;if(serializeMap(this.map)===this.savedText)this.savedRevision=this.revision;this.emit();}
  markSaved():void{this.savedText=serializeMap(this.map);this.savedRevision=this.revision;this.emit();}
  subscribe(listener:()=>void):EditorDisposable{this.listeners.add(listener);return {dispose:()=>{this.listeners.delete(listener);}};}
  private emit():void{for(const listener of this.listeners)listener();}
  dispose():void{this.listeners.clear();}
}
export class ValleyAuthoring {
  readonly platform=new EditorPlatform({history:{maxEntries:80,byteBudget:16*1024*1024}});
  readonly shell=new BrowserEditorShell(this.platform.contributions);
  readonly document:ValleyDocument;
  readonly placement=new PathPlacement(()=>this.map);
  private clipboard:{map:ValleyMap;ids:string[];cut:boolean}|null=null;
  constructor(map=switchGarden()) {this.document=new ValleyDocument(map);this.platform.documents.attach(this.document);this.platform.selection.registerResolver('valley-object','valley.authoring',r=>findNode(this.map,r.id));}
  async start():Promise<void>{
    const plugin=defineEditorPlugin({id:'valley.authoring',version:'1.0.0',apiVersion:'1',provides:['valley.map'],activate:context=>{
      for(const [id,title] of [['palette','标准物体'],['hierarchy','地图层级'],['inspector','物体属性'],['groups','物体组与动作']] as const)
        context.scope.own(context.contributions.register({kind:'panel',id:`valley.${id}`,ownerId:context.pluginId,value:{title,hostId:id}}));
      context.scope.own(context.contributions.register({kind:'importer',id:'valley.json.import',ownerId:context.pluginId,value:{extension:'.json',parse:parseMap}}));
      context.scope.own(context.contributions.register({kind:'exporter',id:'valley.json.export',ownerId:context.pluginId,value:{extension:'.json',serialize:serializeMap}}));
    }});
    await this.platform.start(defineEditorProduct({schemaVersion:1,id:'valley-editor',version:'0.1.0',displayName:'谷外之光地图工坊',requiredPlugins:[plugin]}));
    this.shell.activatePanel('valley.inspector');
  }
  get map():ValleyMap{return this.document.map;}
  get selected():string[]{return this.platform.selection.snapshot().items.map(x=>x.id);}
  get selectedObjects():string[]{const all=subtree(this.map,this.selected);return this.map.objects.filter(o=>all.has(o.id)).map(o=>o.id);}
  get canPaste():boolean{return !!this.clipboard;}
  get cutIds():string[]{return this.clipboard?.cut?this.clipboard.ids:[];}
  get insertionParent():string|null{const n=this.selected.length===1?findNode(this.map,this.selected[0]!):undefined;return n?(isGroup(n)?n.id:n.attachment?this.map.objects.find(o=>o.id===n.attachment!.pathId)?.groupId??null:n.groupId):null;}
  select(ids:string[]):void{this.platform.selection.set(ids.filter(id=>findNode(this.map,id)).map(id=>({kind:'valley-object',id,documentId:this.document.identity.id})));}
  change(label:string,mutation:(map:ValleyMap)=>void,selection?:string[]):void{const next=cloneMap(this.map);mutation(next);this.replace(label,next,selection);}
  replace(label:string,next:ValleyMap,selection=this.selected):void{
    const before=this.document.serialize(),after=parseMap(next);if(serializeMap(before)===serializeMap(after))return;
    if(this.clipboard?.cut&&before.id!==after.id)this.clipboard=null;
    const beforeSelection=this.selected;const apply=(map:ValleyMap,ids:string[])=>{this.document.apply(map);this.select(ids);};
    this.platform.history.execute({label,estimatedBytes:(serializeMap(before).length+serializeMap(after).length)*2,execute:()=>apply(after,selection),undo:()=>apply(before,beforeSelection)});
  }
  placementObstacle(type:TypeId,position:Vec3):MapObject|undefined {
    // A normal path must not duplicate an existing solid platform at the same anchor.
    return type===1?this.map.objects.find(o=>[1,3,4,8,9,10].includes(o.type)&&nodeOrigin(this.map,o).every((v,i)=>Math.abs(v-position[i]!)<1e-6)):undefined;
  }
  add(type:TypeId,position:Vec3,rotation:Vec3=[0,0,0]):string{const occupied=this.placementObstacle(type,position);if(occupied)throw new Error(`此处已有${occupied.name}，请放在相邻空格。`);const o=createObject(type,uniqueId(this.map),position);o.rotation=[...rotation];const parent=this.insertionParent;this.change(`放置 ${o.name}`,map=>{map.objects.push(o);reparentNode(map,o.id,parent);},[o.id]);return o.id;}
  removeSelected():void{if(!this.selected.length)return;this.change('删除节点',map=>removeNodes(map,this.selected),[]);}
  addPillar(pathId:string,corner:CornerId):string {
    const existing=this.map.objects.find(o=>o.attachment?.pathId===pathId&&o.attachment.corner===corner);if(existing){this.select([existing.id]);return existing.id;}
    const host=this.map.objects.find(o=>o.id===pathId);if(!host||!canAttachPillar(host.type))throw new Error('请点击普通路径或出生平台的四个角之一。');
    const o=createObject(12,uniqueId(this.map),defaultPillarOffset(host,corner));o.attachment={pathId,corner};
    this.change('放置角点立柱',map=>map.objects.push(o),[o.id]);return o.id;
  }
  copy(cut=false):void{if(!this.selected.length)return;this.clipboard={map:cloneMap(this.map),ids:roots(this.map,this.selected),cut};}
  paste(target=this.insertionParent):void{
    const clip=this.clipboard;if(!clip)return;
    if(clip.cut){if(clip.ids.some(id=>!findNode(this.map,id)))throw new Error('剪切来源已移除，请重新剪切。');this.reparent(clip.ids,target);this.select(clip.ids);this.clipboard=null;}
    else{const next=cloneMap(this.map),ids=copyNodes(clip.map,next,clip.ids,target);this.replace('粘贴节点',next,ids);}
  }
  duplicate():void{const next=cloneMap(this.map),ids=copyNodes(this.map,next,this.selected,this.insertionParentForSiblings(),[1,0,1]);this.replace('复制副本',next,ids);}
  private insertionParentForSiblings():string|null{const ids=roots(this.map,this.selected),parents=ids.map(id=>{const n=findNode(this.map,id)!;return !isGroup(n)&&n.attachment?this.map.objects.find(o=>o.id===n.attachment!.pathId)?.groupId??null:parentId(n);});return parents.every(p=>p===parents[0])?parents[0]??null:null;}
  reparent(ids:string[],target:string|null):void{const top=roots(this.map,ids);this.change('移动层级',map=>{for(const id of top)reparentNode(map,id,target);},top);}
  reorder(ids:string[],parent:string|null,target:string|null,position:'before'|'after'|'inside'):void{
    const top=roots(this.map,ids);if(target&&top.includes(target))return;
    this.change('调整地图层级',map=>{for(const id of top)reparentNode(map,id,parent);const siblings=[...map.groups,...map.objects].filter(n=>parentId(n)===parent&&!top.includes(n.id)).sort((a,b)=>(a.order??1e6)-(b.order??1e6));let index=position==='inside'?siblings.length:siblings.findIndex(n=>n.id===target)+(position==='after'?1:0);if(index<0)index=siblings.length;siblings.splice(index,0,...top.map(id=>findNode(map,id)!));siblings.forEach((n,i)=>n.order=i);},top);
  }
  alignSelected(step:number):void{if(!Number.isFinite(step)||step<=0)throw new Error('网格间距必须大于零。');this.change('对齐网格',map=>{for(const id of roots(map,this.selected)){const p=nodeOrigin(map,findNode(map,id)!),target=snapPosition(p,step);translateNode(map,id,target.map((v,i)=>v-p[i]!) as Vec3);}});}
  movePreview(before:ValleyMap,anchorId:string,delta:Vec3,step:number):ValleyMap {
    const next=cloneMap(before),anchor=findNode(before,anchorId);if(!anchor||(!isGroup(anchor)&&anchor.attachment))return next;
    const p=nodeOrigin(before,anchor),target=snapPosition(p.map((v,i)=>v+delta[i]!) as Vec3,step),shift:Vec3=[target[0]-p[0],0,target[2]-p[2]];
    for(const id of roots(next,this.selected))translateNode(next,id,shift);return next;
  }
  update(id:string,mutation:(o:MapObject)=>void):void{this.change('修改物体属性',map=>{const o=map.objects.find(o=>o.id===id);if(o)mutation(o);});}
  splitSelected(depth:number):void {
    if(this.selected.length!==1)throw new Error('请先选择一个普通方块。');
    const id=this.selected[0]!,other=uniqueId(this.map);
    this.change('拆分为两个三棱柱',map=>splitCube(map,id,other,depth),[id,other]);
  }
  updateGroup(id:string,mutation:(g:MapGroup)=>void):void{this.change('修改父节点',map=>{const g=map.groups.find(g=>g.id===id);if(g)mutation(g);});}
  createEmpty(parent=this.insertionParent):string{const id=uniqueId(this.map,'group');this.change('创建空节点',map=>map.groups.push({id,name:'空节点',parentId:parent,pivot:[0,0,0],position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}),[id]);return id;}
  groupSelected():string{
    const ids=roots(this.map,this.selected);if(!ids.length)return this.createEmpty(null);
    if(ids.some(id=>this.map.objects.find(o=>o.id===id)?.attachment))throw new Error('立柱随路径归组，请选择它依附的路径。');
    const parent=this.insertionParentForSiblings(),id=uniqueId(this.map,'group'),center:Vec3=[0,0,0];for(const selected of ids)nodeOrigin(this.map,findNode(this.map,selected)!).forEach((v,i)=>center[i]!+=v/ids.length);
    const position=matrixPoint(inverseMatrix(groupMatrix(this.map,parent)),center);
    this.change('创建父节点并编组',map=>{map.groups.push({id,name:'物体组 '+id.slice(6),parentId:parent,pivot:[0,0,0],position,rotation:[0,0,0],scale:[1,1,1]});for(const selected of ids)reparentNode(map,selected,id);},[id]);return id;
  }
  importJSON(text:string):void{this.replace('导入 JSON',parseMap(JSON.parse(text)),[]);this.clipboard=null;}
  exportJSON(compact=false):string{return compact?serializeCompactMap(this.map):serializeMap(this.map);}
  async dispose():Promise<void>{this.shell.dispose();await this.platform.dispose();}
}
