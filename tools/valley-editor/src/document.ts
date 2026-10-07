import { EditorPlatform } from '@haiyue/editor-platform';
import { BrowserEditorShell } from '@haiyue/editor-shell';
import { defineEditorPlugin, defineEditorProduct, type EditorDocumentAdapter, type EditorDisposable } from '@haiyue/editor-plugin-sdk';
import { cloneMap, createObject, parseMap, serializeMap, splitCube, switchGarden, type MapObject, type TypeId, type ValleyMap, type Vec3 } from '../../../games/valley-of-light/map/model';

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
  constructor(map=switchGarden()) {this.document=new ValleyDocument(map);this.platform.documents.attach(this.document);this.platform.selection.registerResolver('valley-object','valley.authoring',r=>this.map.objects.find(o=>o.id===r.id));}
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
  select(ids:string[]):void{this.platform.selection.set(ids.filter(id=>this.map.objects.some(o=>o.id===id)).map(id=>({kind:'valley-object',id,documentId:this.document.identity.id})));}
  change(label:string,mutation:(map:ValleyMap)=>void):void{const next=cloneMap(this.map);mutation(next);this.replace(label,next);}
  replace(label:string,next:ValleyMap):void{
    const before=this.document.serialize(),after=parseMap(next);if(serializeMap(before)===serializeMap(after))return;
    const apply=(map:ValleyMap)=>{this.document.apply(map);this.select(this.selected);};
    this.platform.history.execute({label,estimatedBytes:(serializeMap(before).length+serializeMap(after).length)*2,execute:()=>apply(after),undo:()=>apply(before)});
  }
  add(type:TypeId,position:Vec3):string{let n=1;while(this.map.objects.some(o=>o.id===`object-${n}`))n++;const o=createObject(type,`object-${n}`,position);this.change(`放置 ${o.name}`,map=>map.objects.push(o));this.select([o.id]);return o.id;}
  removeSelected():void{const ids=new Set(this.selected);if(!ids.size)return;this.change('删除物体',map=>{map.objects=map.objects.filter(o=>!ids.has(o.id));map.opticalLinks=map.opticalLinks.filter(l=>!ids.has(l.a)&&!ids.has(l.b));});this.select([]);}
  duplicate():void{const originals=this.map.objects.filter(o=>this.selected.includes(o.id)),ids:string[]=[];
    this.change('复制物体',map=>{for(const source of originals){let n=1;while(map.objects.some(o=>o.id===`object-${n}`))n++;const copy=structuredClone(source);copy.id=`object-${n}`;copy.position[0]+=.5;copy.position[2]+=.5;copy.name+=' 副本';map.objects.push(copy);ids.push(copy.id);}});this.select(ids);
  }
  update(id:string,mutation:(o:MapObject)=>void):void{this.change('修改物体属性',map=>{const o=map.objects.find(o=>o.id===id);if(o)mutation(o);});}
  splitSelected(depth:number):void {
    if(this.selected.length!==1)throw new Error('请先选择一个普通方块。');
    const id=this.selected[0]!;let n=1;while(this.map.objects.some(o=>o.id===`object-${n}`))n++;const other=`object-${n}`;
    this.change('拆分为两个三棱柱',map=>splitCube(map,id,other,depth));this.select([id,other]);
  }
  groupSelected():string{
    let n=1;while(this.map.groups.some(g=>g.id===`group-${n}`))n++;const id=`group-${n}`,selected=this.map.objects.filter(o=>this.selected.includes(o.id));
    const pivot:Vec3=[0,0,0];for(const o of selected)o.position.forEach((x,i)=>pivot[i]!+=x/selected.length);
    this.change('创建物体组',map=>{map.groups.push({id,name:`物体组 ${n}`,pivot});for(const o of map.objects)if(this.selected.includes(o.id))o.groupId=id;});return id;
  }
  importJSON(text:string):void{this.replace('导入 JSON',parseMap(JSON.parse(text)));this.select([]);}
  exportJSON():string{return serializeMap(this.map);}
  async dispose():Promise<void>{this.shell.dispose();await this.platform.dispose();}
}
