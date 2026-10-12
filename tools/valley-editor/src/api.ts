import type {ValleyAuthoring} from './document';
import {findNode,parentId,reparentNode,removeNodes,roots} from './hierarchy';
import {CATALOG,bindPortal,cloneMap,createObject,emptyMap,parseMap,playIssues,serializeCompactMap,serializeMap,setPathMarker,type MapGroup,type MapObject,type ValleyMap,type PathMarkerKind} from '../../../games/valley-of-light/map/model';

export type ObjectPatch=Partial<Omit<MapObject,'id'|'type'|'colors'|'motion'|'water'|'trigger'|'portal'>> & {
  colors?:Partial<MapObject['colors']>;motion?:Partial<MapObject['motion']>;water?:Partial<MapObject['water']>;trigger?:Partial<MapObject['trigger']>;portal?:Partial<NonNullable<MapObject['portal']>>;
};
export type MapSettings=Pick<ValleyMap,'id'|'name'|'logic'|'stages'|'story'|'appearance'|'opticalLinks'>;
export type EditorCommand=
  |{op:'map.create';id:string;name:string}
  |{op:'map.configure';settings:Partial<MapSettings>}
  |{op:'object.create';object:{id:string;type:MapObject['type']}&ObjectPatch}
  |{op:'object.update';id:string;patch:ObjectPatch}
  |{op:'group.create';group:{id:string;name:string}&Partial<Omit<MapGroup,'id'|'name'>>}
  |{op:'group.update';id:string;patch:Partial<Omit<MapGroup,'id'>>}
  |{op:'nodes.remove';ids:string[]}
  |{op:'nodes.reparent';ids:string[];parentId:string|null}
  |{op:'marker.set';id:string;kind:PathMarkerKind|null;face?:number}
  |{op:'portal.bind';id:string;pathId:string;face?:number};
export interface EditorBatch {apiVersion:1;label:string;expectedRevision?:number;commands:EditorCommand[]}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function fields(v:unknown,allowed:readonly string[],where:string):asserts v is Record<string,unknown>{if(!record(v))throw new Error(`${where} 必须是对象。`);for(const k of Object.keys(v))if(!allowed.includes(k))throw new Error(`${where} 未知字段：${k}`);}
const objectFields=['name','position','rotation','groupId','length','width','thickness','rise','steps','radius','arc','twist','arcTwist','prismHalf','colors','motion','water','trigger','attachment','marker','checkpoint','state','portal','basis','order'];
const nested:Record<string,string[]>={colors:['surface','hub','spokes','tips','base'],motion:['axis','min','max','step','targetGroup'],water:['amplitude','speed','wavelength','facetSize','contrast','lightColor','darkColor'],trigger:['mode','actions'],portal:['pathId','face','targetId','shape'],state:['enabled','visible','walkable'],marker:['kind','face'],checkpoint:['name','face']};
function patchObject(o:MapObject,patch:unknown):void {
  fields(patch,objectFields,'物体参数');
  for(const [k,v] of Object.entries(patch)){if(nested[k]){fields(v,nested[k]!,k);(o as unknown as Record<string,unknown>)[k]={...(o as unknown as Record<string,unknown>)[k] as object,...structuredClone(v)};}else(o as unknown as Record<string,unknown>)[k]=structuredClone(v);}
}
const commandFields:Record<string,string[]>={'map.create':['id','name'],'map.configure':['settings'],'object.create':['object'],'object.update':['id','patch'],'group.create':['group'],'group.update':['id','patch'],'nodes.remove':['ids'],'nodes.reparent':['ids','parentId'],'marker.set':['id','kind','face'],'portal.bind':['id','pathId','face']};
const groupFields=['id','name','parentId','pivot','position','rotation','scale','basis','order','platform'];
/** Prepare everything before committing: a bad command cannot leave a partial scene. */
export function prepareEditorBatch(source:ValleyMap,input:unknown):{batch:EditorBatch;map:ValleyMap} {
  fields(input,['apiVersion','label','expectedRevision','commands'],'API 请求');
  if(input.apiVersion!==1||typeof input.label!=='string'||!input.label.trim()||input.label.length>100||!Array.isArray(input.commands)||input.commands.length<1||input.commands.length>1000||input.expectedRevision!==undefined&&(!Number.isSafeInteger(input.expectedRevision)||Number(input.expectedRevision)<0))throw new Error('API 版本、名称、版本号或命令数量无效。');
  if(JSON.stringify(input).length>2_000_000)throw new Error('API 请求不能超过 2 MB。');
  const batch=structuredClone(input) as unknown as EditorBatch;let map=cloneMap(source);delete map.renderPlan;
  const object=(id:string)=>{const o=map.objects.find(o=>o.id===id);if(!o)throw new Error(`物体不存在：${id}`);return o;};
  const ids=(values:unknown):string[]=>{if(!Array.isArray(values)||!values.length||values.some(id=>typeof id!=='string'||!findNode(map,id)))throw new Error('节点列表包含不存在的节点。');return values;};
  batch.commands.forEach((c,index)=>{try{
    if(!record(c)||typeof c.op!=='string'||!Object.hasOwn(commandFields,c.op))throw new Error('未知命令。');fields(c,['op',...commandFields[c.op]!],c.op);
    switch(c.op){
      case 'map.create':if(index!==0)throw new Error('map.create 必须是第一条命令。');map={...emptyMap(),id:c.id,name:c.name};break;
      case 'map.configure':fields(c.settings,['id','name','logic','stages','story','appearance','opticalLinks'],'地图设置');Object.assign(map,structuredClone(c.settings));break;
      case 'object.create':{fields(c.object,['id','type',...objectFields],'新物体');if(!CATALOG.some(x=>x.type===c.object.type))throw new Error('未知物体编号。');const {id,type,...patch}=c.object,o=createObject(type,id);patchObject(o,patch);map.objects.push(o);break;}
      case 'object.update':patchObject(object(c.id),c.patch);break;
      case 'group.create':fields(c.group,groupFields,'新父节点');map.groups.push({pivot:[0,0,0],...structuredClone(c.group)});break;
      case 'group.update':{const g=map.groups.find(g=>g.id===c.id);if(!g)throw new Error(`父节点不存在：${c.id}`);fields(c.patch,groupFields.filter(k=>k!=='id'),'父节点参数');Object.assign(g,structuredClone(c.patch));break;}
      case 'nodes.remove':removeNodes(map,ids(c.ids));break;
      case 'nodes.reparent':{
        const selected=ids(c.ids);
        // Earlier commands may still contain invalid links; never traverse a cycle.
        for(const node of [...map.groups,...map.objects]){const seen=new Set<string>();let n:ReturnType<typeof findNode>=node;while(n){if(seen.has(n.id))throw new Error('父节点存在循环引用。');seen.add(n.id);n=findNode(map,parentId(n)??'');}}
        for(const id of roots(map,selected))reparentNode(map,id,c.parentId);break;
      }
      case 'marker.set':object(c.id);if(c.kind!==null&&!['spawn','exit'].includes(c.kind))throw new Error('未知记号。');setPathMarker(map,c.id,c.kind,c.face??0);break;
      case 'portal.bind':object(c.id);object(c.pathId);bindPortal(map,c.id,c.pathId,c.face??0);break;
    }
  }catch(e){throw new Error(`命令 ${index+1}（${c?.op??'?'}）：${e instanceof Error?e.message:String(e)}`);}});
  return {batch,map:parseMap(map)};
}
export interface ApiHost {editable:()=>boolean;fit?:()=>void;play?:(enabled:boolean)=>void;runtime?:()=>unknown}
export function createValleyEditorApi(author:ValleyAuthoring,host:ApiHost={editable:()=>true}) {
  const guard=()=>{if(!host.editable())throw new Error('请先停止试玩或结束拖拽，再调用编辑 API。');};
  const status=()=>({apiVersion:1,revision:author.document.revision,mapId:author.map.id,editable:host.editable(),selection:[...author.selected],canUndo:author.platform.history.canUndo,canRedo:author.platform.history.canRedo});
  const prepare=(input:unknown)=>{const result=prepareEditorBatch(author.map,input);if(result.batch.expectedRevision!==undefined&&result.batch.expectedRevision!==author.document.revision)throw new Error('地图版本已变化，请重新读取后再提交。');return result;};
  return Object.freeze({apiVersion:1 as const,status,catalog:()=>structuredClone(CATALOG),read:()=>author.document.serialize(),
    validate:(input:unknown)=>{const {map}=prepare(input);return {id:map.id,objects:map.objects.length,groups:map.groups.length,playIssues:playIssues(map)};},
    apply:(input:unknown)=>{guard();const {batch,map}=prepare(input);author.replace(batch.label,map,batch.commands[0]?.op==='map.create'?[]:author.selected);return status();},
    select:(ids:string[])=>{guard();if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!findNode(author.map,id)))throw new Error('选中节点不存在。');author.select(ids);return status();},
    undo:()=>{guard();author.platform.history.undo();return status();},redo:()=>{guard();author.platform.history.redo();return status();},
    exportJSON:(compact=true)=>compact?serializeCompactMap(author.map):serializeMap(author.map),
    fit:()=>{guard();host.fit?.();},play:(enabled=true)=>{if(typeof enabled!=='boolean')throw new Error('play 需要布尔值。');if(!host.play)throw new Error('当前 API 没有渲染宿主。');host.play(enabled);},
    runtime:()=>structuredClone(host.runtime?.()??null)
  });
}
export type ValleyEditorApi=ReturnType<typeof createValleyEditorApi>;
