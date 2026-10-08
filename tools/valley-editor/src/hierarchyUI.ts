import { editingControl } from './ui';
import { defineTreeComponents, type HYTree, type HYTreeNodeData, type HYTreeDataChangeDetail, type HYTreeSelectionChangeDetail, type HYTreeNodeContextMenuDetail } from '@haiyue/ui/tree';
import { defineContextMenuComponents, type HYContextMenu, type HYContextMenuSelectDetail } from '@haiyue/ui/context-menu';
import { findNode, isGroup, parentId } from './hierarchy';
import type { ValleyAuthoring } from './document';
defineTreeComponents();defineContextMenuComponents();
export class HierarchyUI {
  private tree:HYTree;private menu:HYContextMenu;private seen=new Set<string>();
  constructor(private author:ValleyAuthoring,private allowed:()=>boolean,private status:(s:string)=>void,signal:AbortSignal){
    this.tree=document.getElementById('object-list') as HYTree;this.menu=document.getElementById('hierarchy-menu') as HYContextMenu;
    this.tree.addEventListener('selection-change',e=>{if(this.allowed())this.author.select((e as CustomEvent<HYTreeSelectionChangeDetail>).detail.selectedIds);else this.selection();},{signal});
    this.tree.addEventListener('data-change',e=>{const d=(e as CustomEvent<HYTreeDataChangeDetail>).detail;if(d.action==='drop'&&d.sourceId&&this.allowed())this.run(()=>{const source=d.sourceId!,target=d.targetId?findNode(this.author.map,d.targetId):null,inside=d.dropPosition==='inside';if(inside&&target&&!isGroup(target))throw new Error('请拖入父节点；普通构件不能容纳子节点。');this.author.reorder(this.author.selected.includes(source)?this.author.selected:[source],inside?target?.id??null:target?parentId(target):null,d.targetId??null,d.dropPosition??'inside');});this.refresh();},{signal});
    this.tree.addEventListener('node-context-menu',e=>{const d=(e as CustomEvent<HYTreeNodeContextMenuDetail>).detail;if(!this.allowed())return;this.open(d.clientX,d.clientY);},{signal});
    document.getElementById('hierarchy')!.addEventListener('contextmenu',e=>{e.preventDefault();if(!this.allowed()||e.composedPath().some(n=>n instanceof HTMLElement&&n.dataset.id))return;this.author.select([]);this.open(e.clientX,e.clientY);},{signal});
    this.menu.addEventListener('item-select',e=>{if(this.allowed())this.run(()=>this.action((e as CustomEvent<HYContextMenuSelectDetail>).detail.value));},{signal});
    // Capture editing shortcuts before HYTree's internal clipboard: the map document owns IDs, references and history.
    window.addEventListener('keydown',e=>{if(!this.allowed()||document.querySelector('hy-dialog[open]')||e.composedPath().some(editingControl))return;
      const mod=e.ctrlKey||e.metaKey,key=e.key.toLowerCase(),action=mod?({c:'copy',x:'cut',v:'paste',d:'duplicate'} as Record<string,string>)[key]:key==='delete'||key==='backspace'?'delete':null;
      if(!action||e.altKey)return;e.preventDefault();e.stopImmediatePropagation();this.run(()=>this.action(action));
    },{capture:true,signal});
  }
  private run(fn:()=>void):void{try{fn();}catch(e){this.status(String(e));}this.refresh();}
  private action(id:string):void{switch(id){case 'empty':this.author.createEmpty();break;case 'root':this.author.createEmpty(null);break;case 'group':this.author.groupSelected();break;case 'copy':this.author.copy();this.status('已复制选中节点及其子节点，选择父节点后粘贴。');break;case 'cut':this.author.copy(true);this.status('已标记剪切，选择目标父节点后粘贴。');break;case 'paste':this.author.paste();break;case 'duplicate':this.author.duplicate();break;case 'unparent':this.author.reparent(this.author.selected,null);break;case 'delete':this.author.removeSelected();break;}}
  private open(x:number,y:number):void{const selected=this.author.selected.length>0;this.menu.items=[{label:'创建空节点',value:'empty'},{label:'在根层创建空节点',value:'root'},{label:'将选中节点编组',value:'group',disabled:!selected},{separator:true},{label:'复制   Ctrl+C',value:'copy',disabled:!selected},{label:'剪切   Ctrl+X',value:'cut',disabled:!selected},{label:'粘贴   Ctrl+V',value:'paste',disabled:!this.author.canPaste},{label:'复制副本   Ctrl+D',value:'duplicate',disabled:!selected},{separator:true},{label:'移至根层',value:'unparent',disabled:!selected},{label:'删除   Delete',value:'delete',disabled:!selected}];this.menu.openAt(x,y);}
  refresh():void{const map=this.author.map,nodes=[...map.groups,...map.objects],entries=new Map<string,HYTreeNodeData>();
    for(const n of nodes){const group=isGroup(n),fresh=!this.seen.has(n.id);entries.set(n.id,{id:n.id,label:`${this.author.cutIds.includes(n.id)?'（剪切） ':''}${group?'▱':String(n.type).padStart(2,'0')}  ${n.name}`,children:[],...(fresh&&(group||nodes.some(c=>parentId(c)===n.id))?{expanded:true}:{})});this.seen.add(n.id);}
    const data:HYTreeNodeData[]=[];for(const n of [...nodes].sort((a,b)=>(a.order??1e6)-(b.order??1e6))){const entry=entries.get(n.id)!,parent=entries.get(parentId(n)??'');(parent?parent.children!:data).push(entry);}this.tree.data=data;this.selection();
  }
  selection():void{this.tree.selectedIds=this.author.selected;}
}
