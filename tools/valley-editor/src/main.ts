import { seaColors, WATER_PALETTES, WATER_STYLE_DEFAULTS } from '../../../games/valley-of-light/map/water';
import { button, editingFocus, type HYInput, type HYInputType, type HYSelect, type HYDialog, type HYTabs } from './ui';
import { EditorLayout } from './layout';
import { getEngineDiagnosticsSnapshot } from '@haiyue/engine/diagnostics';
import { HierarchyUI } from './hierarchyUI';
import { belongsToGroup, canAttachPillar, defaultPillarOffset } from '../../../games/valley-of-light/map/model';
import { HaiyueEngine } from '@haiyue/engine';
import { guardDeferredPointerCapture } from '../../../games/valley-of-light/canvasInput';
import { MapView } from '../../../games/valley-of-light/map/view';
import { moveWheelDrag, type WheelDrag } from '../../../games/valley-of-light/map/wheelDrag';
import { add, rotate, CATALOG, isDecoration, decorationColorFields, decorationGarden, ladderGarden, PORT_NAMES, WHEEL_PALETTES, MapRuntime, catalogGarden, centerIndex, cloneMap, connections, emptyMap, emptyPoses, pathPorts, playIssues, snapPosition, seasideGarden, splitGarden, rotatedSeamGarden, surfaceGarden, switchGarden, worldSamples, type Action, type Axis, type MapObject, type CornerId, type PortId, type TypeId, type ValleyMap, type Vec3 } from '../../../games/valley-of-light/map/model';
import { ValleyAuthoring } from './document';
import { EditorGrid } from './grid';
import type { Placement } from './placement';

const $=<T extends HTMLElement=HTMLElement>(id:string):T=>document.getElementById(id) as T;
const node=(tag:string,text='',className=''):HTMLElement=>{const n=document.createElement(tag);n.textContent=text;n.className=className;return n;};
class ValleyEditor {
  readonly author=new ValleyAuthoring(new URLSearchParams(location.search).get('demo')==='ladder'?ladderGarden():new URLSearchParams(location.search).get('demo')==='decorations'?decorationGarden():new URLSearchParams(location.search).get('demo')==='split'?splitGarden():new URLSearchParams(location.search).get('demo')==='sea'?seasideGarden():new URLSearchParams(location.search).get('demo')==='seam'?rotatedSeamGarden():new URLSearchParams(location.search).get('demo')==='surfaces'?surfaceGarden():new URLSearchParams(location.search).get('demo')==='arc'?surfaceGarden(true):switchGarden());private abort=new AbortController();private engine!:HaiyueEngine;private view!:MapView;
  private hierarchy!:HierarchyUI;private layout!:EditorLayout;private splitDepth=3;private placementPointer:[number,number]|null=null;
  private orbitMode=false;private cameraKey='';private grid!:EditorGrid;private gridVisible=true;
  private runtime:MapRuntime|null=null;private tool:TypeId|null=null;private revision=-1;
  private drag:{id:number;start:[number,number];last:[number,number];kind:'pan'|'edit'|'play'|'click'|'place';placeType?:TypeId;placeHeight?:number|undefined;hit:string|null;targetIndex?:number|undefined;before:ValleyMap;preview:ValleyMap;value:number;moved:boolean;wheel:WheelDrag|null}|null=null;
  private readonly canvas=$<HTMLCanvasElement>('canvas');private issues:string[]=[];
  private releaseCapture:(id:number)=>void=()=>{};
  async init():Promise<void>{
    this.layout=new EditorLayout(this.abort.signal);
    await this.author.start();
    for(const contribution of this.author.shell.list<{title:string;hostId:string}>('panel'))$(contribution.value.hostId).dataset.editorContribution=contribution.id;
    this.releaseCapture=guardDeferredPointerCapture(this.canvas,this.abort.signal);
    this.engine=new HaiyueEngine({canvas:this.canvas,msaaSamples:4,diagnostics:{enabled:new URLSearchParams(location.search).has('verify')},devicePixelRatio:()=>Math.min(devicePixelRatio,1.75)});await this.engine.init();
    this.view=new MapView(this.engine,new URL('../../games/valley-of-light/assets/traveler.gltf',location.href).href);
    this.resize();this.view.setMap(this.author.map,true);this.grid=new EditorGrid(this.view);
    this.engine.device.addEventListener('uncapturederror',e=>{this.issues.push(e.error.message);this.status(e.error.message);},{signal:this.abort.signal});
    this.hierarchy=new HierarchyUI(this.author,()=>!this.runtime&&!this.drag,s=>this.status(s),this.abort.signal);this.buildCatalog();this.bind();this.refresh();
    this.author.document.subscribe(()=>this.refresh());this.author.platform.selection.subscribe(()=>this.refreshSelection());this.author.platform.history.subscribe(()=>this.history());
    this.engine.on('update',({detail:{delta}})=>{this.resize();const dt=Math.min(delta/1000,.05);this.runtime?.tick(dt);if(this.drag?.wheel&&this.drag.hit&&this.runtime&&!this.runtime.canDrag(this.drag.hit))this.cancel();this.view.tick(dt,this.runtime);this.grid.update(Number($<HYInput>('layer').value)||0,Number($<HYSelect>('snap').value),this.gridVisible&&!this.runtime);this.view.setOrbitEnabled(this.canvas,this.orbitMode&&!this.runtime?.walking&&!this.runtime?.busy);if(this.runtime)$('runtime-message').textContent=this.runtime.message;const key=[this.view.orbitTransform.theta,this.view.orbitTransform.phi].join(':');if(key!==this.cameraKey){this.cameraKey=key;this.connectionCount();}this.guides();});
    this.engine.switchScene(this.view.scene);this.engine.run();$('loading').hidden=true;
    window.addEventListener('pagehide',()=>{this.abort.abort();this.grid.dispose();this.view.dispose();this.engine.destroy();void this.author.dispose();},{once:true});
    window.addEventListener('beforeunload',e=>{if(this.author.document.revision!==this.author.document.savedRevision){e.preventDefault();e.returnValue='';}},{signal:this.abort.signal});
    if(new URLSearchParams(location.search).has('verify'))Object.defineProperty(window,'__valleyEditor',{value:{snapshot:()=>this.snapshot()}});
    $('result').dataset.status='passed';$('result').textContent=JSON.stringify({status:'passed',suite:'valley-editor'});
  }
  private resize():void{const r=this.canvas.getBoundingClientRect();if(this.view&&(r.width!==this.view.width||r.height!==this.view.height))this.cancel();this.view?.resize(r.width,r.height);}
  private status(text:string):void{$('status').textContent=text;}
  private safe(action:()=>void):void{try{action();}catch(e){this.status(String(e));}}
  private buildCatalog():void{
    for(const c of CATALOG){const b=button('',()=>{if(this.runtime)return;this.orbitMode=false;this.tool=c.type;this.updateTool();this.status(c.type===12?'先选中普通路径或出生平台，再点击它的角点标记，逐个放置立柱。':c.type===11?'点击放置海面，初始高度在当前编辑层下方 2 格。':c.type===17?'点击墙面或顶面边缘挂梯，默认向下延伸 2 格；空白处以编辑高度为梯脚，可修改高度和朝向。':c.type>=13?'点击路径表面放置装饰物；空白处使用编辑高度，可在右侧修改尺寸和配色。':`点击道路顶面向上叠放、侧面向外续接；空白处按编辑高度放置 ${c.name}`);});b.className='catalog-item';b.dataset.type=String(c.type);
      const content=node('span','','catalog-content');content.append(node('span',String(c.type).padStart(2,'0'),'number'),node('span',c.icon,'icon'));const t=node('span',c.name,'text');t.append(node('small',c.description));content.append(t);b.append(content);$(isDecoration(c.type)?'catalog-decorations':'catalog-paths').append(b);}
  }
  private updateTool():void{this.placementPointer=null;$('select-tool').classList.toggle('active',this.tool===null&&!this.orbitMode);$('orbit-tool').classList.toggle('active',this.orbitMode);$('orbit-tool').setAttribute('aria-pressed',String(this.orbitMode));document.querySelectorAll<HTMLElement>('.catalog-item').forEach(b=>b.classList.toggle('selected',Number(b.dataset.type)===this.tool));this.canvas.style.cursor=this.orbitMode?'grab':this.tool?'crosshair':'default';$('mode').textContent=this.orbitMode?'旋转视角':this.runtime?'试玩模式':this.tool?`放置 ${CATALOG.find(c=>c.type===this.tool)!.name}`:'编辑模式';this.view.setOrbitEnabled(this.canvas,this.orbitMode&&!this.runtime?.walking&&!this.runtime?.busy);}
  private connectionCount():void{$('connections').textContent=`${connections(this.author.map,emptyPoses(),this.view.project).length} 处已连接端口`;}
  private refresh():void{
    if(!this.view)return;if(this.revision!==this.author.document.revision){this.revision=this.author.document.revision;this.view.setMap(this.author.map);}
    $<HYInput>('map-name').value=this.author.map.name;$('dirty').textContent=this.author.document.revision===this.author.document.savedRevision?'已导出':'● 未导出';
    $('object-count').textContent=`${this.author.map.objects.length} 构件 / ${this.author.map.groups.length} 节点`;this.hierarchy.refresh();
    this.connectionCount();
    this.groups();this.links();this.refreshSelection();this.history();this.lockAuthoring();
  }
  private history():void{$('undo').toggleAttribute('disabled',!!this.runtime||!this.author.platform.history.canUndo);$('redo').toggleAttribute('disabled',!!this.runtime||!this.author.platform.history.canRedo);}
  private select(id:string,append=false):void{if(this.runtime)return;const current=this.author.selected;this.author.select(append?(current.includes(id)?current.filter(x=>x!==id):[...current,id]):[id]);}
  private refreshSelection():void{
    const ids=this.author.selected;this.hierarchy.selection();
    if(!this.runtime)this.view.sync(this.author.map,emptyPoses(),this.author.selectedObjects);this.properties();this.guides();
    for(const [i,id] of ['port-a','port-b'].entries()) {
      const select=$<HYSelect>(id),o=this.author.map.objects.find(o=>o.id===ids[i]),previous=select.value;select.options=o?pathPorts(o).map(p=>({value:String(p.port),label:`${i?'B':'A'} ${PORT_NAMES[p.port]}`})):[];
      select.value=select.options.some(o=>o.value===previous)?previous:o?.type===5?'4':select.options[0]?.value??'';
    }
  }
  private field(host:HTMLElement,label:string,child:HTMLElement):void{const wrap=node('label','','field');if(child.matches('hy-input,hy-select'))child.setAttribute('aria-label',label);wrap.append(node('span',label),child);host.append(wrap);}
  private input(value:string|number,change:(value:string)=>void,type:HYInputType='text',id?:string):HYInput{
    const input=document.createElement('hy-input') as HYInput;input.type=type;input.value=String(value);if(id)input.id=id;input.disabled=!!this.runtime;
    if(type==='number')input.setAttribute('step','.1');input.addEventListener('value-change',()=>{if(!this.runtime)this.safe(()=>change(input.value));});return input;
  }
  private selectInput(options:Array<[string,string]>,value:string,change:(value:string)=>void,id?:string):HYSelect{
    const select=document.createElement('hy-select') as HYSelect;if(id)select.id=id;select.options=options.map(([value,label])=>({value,label}));select.value=value;select.disabled=!!this.runtime;select.addEventListener('value-change',()=>{if(!this.runtime)this.safe(()=>change(select.value));});return select;
  }
  private vector(host:HTMLElement,label:string,value:Vec3,change:(v:Vec3)=>void,id:string):void{
    const row=node('div','','triple');for(let i=0;i<3;i++){const l=node('label',['X','Y','Z'][i]!);const input=this.input(value[i]!,v=>{const next:[number,number,number]=[...value];next[i]=Number(v);change(next);},'number',`${id}-${i}`);input.setAttribute('aria-label',`${label} ${['X','Y','Z'][i]}`);l.append(input);row.append(l);}this.field(host,label,row);
  }
  private properties():void{
    const host=$('properties');host.replaceChildren();const selected=this.author.map.objects.filter(o=>this.author.selected.includes(o.id)),group=this.author.selected.length===1?this.author.map.groups.find(g=>g.id===this.author.selected[0]):undefined;$('selection-count').textContent=this.author.selected.length?`${this.author.selected.length} 个节点`:'未选择';
    if(group){host.append(node('div',`父节点 / ${group.id}`,'badge'));this.field(host,'节点名称',this.input(group.name,v=>this.author.updateGroup(group.id,g=>g.name=v),'text','group-name'));this.field(host,'父节点',this.selectInput([['','地图根层'],...this.author.map.groups.filter(g=>!belongsToGroup(this.author.map,g.id,group.id)).map(g=>[g.id,g.name] as [string,string])],group.parentId??'',v=>this.author.reparent([group.id],v||null),'group-parent'));for(const [key,label,fallback] of [['position','位置',[0,0,0]],['rotation','旋转（度）',[0,0,0]],['scale','缩放',[1,1,1]]] as const)this.vector(host,label,(group[key]??[...fallback]) as Vec3,v=>this.author.updateGroup(group.id,g=>g[key]=v),`group-${key}`);this.vector(host,'开关旋转轴心（节点内坐标）',group.pivot,v=>this.author.updateGroup(group.id,g=>g.pivot=v),'group-pivot');host.append(node('p','拖入此节点可收纳构件或其他父节点。位置、旋转和缩放会作用于所有子节点。','muted'));return;}
    if(this.author.selected.length!==1||selected.length!==1){host.append(node('p',selected.length?'多选后可拖动、复制、删除或创建物体组。':'选择地图中的物体，或从左侧目录放置构件。','muted'));return;}
    const o=selected[0]!,update=(mutation:(obj:MapObject)=>void)=>{if(!this.runtime)this.author.update(o.id,mutation);};
    host.append(node('div',`TYPE ${String(o.type).padStart(2,'0')}  /  ${o.id}`,'badge'));
    this.field(host,'物体名称',this.input(o.name,v=>update(x=>x.name=v),'text','object-name'));
    if(o.attachment)host.append(node('p',`依附 ${o.attachment.pathId} 的角 ${o.attachment.corner+1}，随路径移动；位置为角点偏移。`,'muted'));
    this.vector(host,o.type===17?'位置（梯脚 / 墙面中心）':o.type>=13?'位置（装饰物底部中心）':'位置（格坐标 / 路径锚点）',o.position,v=>update(x=>x.position=v),'position');this.vector(host,o.type===3?'机关朝向（度，绕路径块中心）':o.type===5?'旋转（度，绕所在方块中心）':'旋转（度，Y-X-Z 顺序）',o.rotation,v=>update(x=>x.rotation=v),'rotation');
    if(!o.attachment)this.field(host,'所属物体组',this.selectInput([['','未分组'],...this.author.map.groups.map(g=>[g.id,g.name] as [string,string])],o.groupId??'',v=>this.author.reparent([o.id],v||null),'object-group'));
    const grid=node('div','','grid2');host.append(grid);for(const [key,label] of (o.type===17?[['width','梯宽'],['rise','爬升高度']]:o.type>=13?[['length','长度'],['width','宽度'],['rise','高度']]:o.type===12?[['width','柱直径'],['rise','柱高']]:o.type===11?[['length','海面长度'],['width','海面宽度']]:[['length','长度'],['width','宽度'],['thickness','厚度']]) as Array<['length'|'width'|'thickness'|'rise',string]>)this.field(grid,label,this.input(o[key],v=>update(x=>x[key]=Number(v)),'number',`param-${key}`));
    host.append(node('div',o.type===3?'手轮配色':'构件配色','subheading'));
    if(o.type===3){const presets=node('div','','palette-presets');WHEEL_PALETTES.forEach((p,i)=>{const b=button(p.name,()=>update(x=>x.colors={...p.colors}));b.id=`palette-${i}`;presets.append(b);});host.append(presets);}
    for(const [key,label] of decorationColorFields[o.type]??[['surface',o.type===11?'海水主色':o.type===12?'立柱':'路径主体'],...(o.type===3?[['hub','中空轮毂'],['spokes','方杆与转轴'],['tips','末端方块'],['base','墙面轴座']]:[])] as Array<[keyof MapObject['colors'],string]>){const row=node('div','','color-row'),change=(v:string)=>update(x=>x.colors[key]=v);row.append(this.input(o.colors[key],change,'color',`swatch-${key}`),this.input(o.colors[key],change,'text',`color-${key}`));row.querySelectorAll('hy-input').forEach(input=>input.setAttribute('aria-label',label));this.field(host,label,row);}
    if(o.type===11){
      const presets=node('div','','palette-presets');WATER_PALETTES.forEach((palette,i)=>{const b=button(palette.name,()=>update(x=>{x.colors.surface=palette.base;x.water.lightColor=palette.light;x.water.darkColor=palette.dark;}));b.id=`water-palette-${i}`;presets.append(b);});host.append(presets);
      const colors=seaColors(o);for(const [key,label,value] of [['lightColor','切面亮色',colors.light],['darkColor','切面暗色',colors.dark]] as const){const row=node('div','','color-row');row.append(this.input(value,v=>update(x=>x.water[key]=v),'color',`water-swatch-${key}`),this.input(value,v=>update(x=>x.water[key]=v),'text',`water-${key}`));row.querySelectorAll('hy-input').forEach(input=>input.setAttribute('aria-label',label));this.field(host,label,row);}
      const reset=button('亮暗色跟随主色',()=>update(x=>{delete x.water.lightColor;delete x.water.darkColor;}));reset.id='water-auto-colors';reset.className='wide';host.append(reset);
      host.append(node('div','切面与波浪','subheading'));for(const [key,label,value] of [['facetSize','切面大小（格）',o.water.facetSize??WATER_STYLE_DEFAULTS.facetSize],['contrast','切面色差（0～1）',o.water.contrast??WATER_STYLE_DEFAULTS.contrast],['amplitude','起伏幅度（格）',o.water.amplitude],['speed','流动速度',o.water.speed],['wavelength','波长（格）',o.water.wavelength]] as const){const input=this.input(value,v=>update(x=>x.water[key]=Number(v)),'number',`water-${key}`);if(key==='amplitude')input.setAttribute('step','.01');this.field(host,label,input);}
      host.append(node('p','切面越大，三角形越疏。亮暗色默认跟随主色；海面只作环境，不参与道路连接。','muted'));
    }
    if(o.type===12&&o.attachment){this.field(host,'依附角点',this.selectInput([['0','角 1 · X− / Z−'],['1','角 2 · X+ / Z−'],['2','角 3 · X+ / Z+'],['3','角 4 · X− / Z+']],String(o.attachment.corner),v=>update(x=>{const host=this.author.map.objects.find(p=>p.id===x.attachment!.pathId)!,before=defaultPillarOffset(host,x.attachment!.corner),corner=Number(v) as CornerId;if(x.position.every((p,i)=>Math.abs(p-before[i]!)<1e-8))x.position=defaultPillarOffset(host,corner);x.attachment!.corner=corner;}),'pillar-corner'));}
    if(canAttachPillar(o.type)){
      host.append(node('div','四角立柱','subheading'));const corners=node('div','','grid2');for(const corner of [0,1,2,3] as CornerId[]){const existing=this.author.map.objects.find(p=>p.attachment?.pathId===o.id&&p.attachment.corner===corner),b=button(`${existing?'选择':'＋'} 角 ${corner+1} 立柱`,()=>this.safe(()=>this.author.addPillar(o.id,corner)));b.id=`add-pillar-${corner}`;corners.append(b);}host.append(corners);
    }
    if(o.type===1){
      host.append(node('div','拆分一格方块','subheading'),node('p','A、B 是同一方块的互补三棱柱。B 沿默认等轴视线偏移 X / Y / Z，复位视角后拼成完整方块。','muted'));
      this.field(host,'B 半块的深度间隔（格）',this.input(this.splitDepth,v=>{this.splitDepth=Number(v);},'number','split-depth'));
      const split=button('拆为 A / B 三棱柱',()=>this.safe(()=>{this.author.splitSelected(this.splitDepth);this.status('已生成两个可独立定位的半块，并连接对角切面。撤销可恢复完整方块。');}));split.id='split-cube';split.className='wide';host.append(split);
    }
    if(o.type===5){this.field(host,'方块的哪一半',this.selectInput([['a','A：X− / Z+ 半块'],['b','B：X+ / Z− 半块']],o.prismHalf,v=>update(x=>x.prismHalf=v as 'a'|'b'),'prism-half'));host.append(node('p','沿顶面 X = Z 对角线竖直切开；A 与 B 各占方块体积的一半。两者可分别移动，切面端口用于错觉连接。','muted'));}
    if(o.type===17){const input=this.input(o.steps,v=>update(x=>x.steps=Number(v)),'number','param-steps');input.setAttribute('step','1');this.field(grid,'横档间隔数',input);host.append(node('p','底端在梯脚向外 0.5 格，顶端在墙面上沿。角色保持面朝梯子，上下均可攀爬；Y 轴朝向用于换墙面。','muted'));}
    const special:oKeys[]=o.type===2?['rise','steps']:o.type===6?['twist']:o.type===7?['radius','arc','arcTwist']:[];
    for(const key of special)this.field(grid,({rise:'升高',steps:'台阶数',twist:'扭转角度',radius:'圆弧半径',arc:'圆弧角度',arcTwist:'沿圆弧翻面角度'})[key],this.input(o[key],v=>update(x=>x[key]=Number(v)),'number',`param-${key}`));
    if(o.type===3||o.type===4){host.append(node('div','拖拽机关','subheading'));if(o.type===3)host.append(node('p','上方 X/Y/Z 朝向会同时旋转平台、轴座和手轮；局部转轴随朝向变化，驱动物体组仍绕手轮路径块中心旋转。试玩时按住手轮，绕屏幕轮心连续转动，可正反向旋转任意圈数，松手后按间隔吸附。','muted'));
      this.field(host,o.type===3?'局部转轴（随机关朝向变化）':'运动轴',this.selectInput(['x','y','z'].map(a=>[a,a.toUpperCase()]),o.motion.axis,v=>update(x=>x.motion.axis=v as Axis),'motion-axis'));
      this.field(host,'驱动物体组（空为自身）',this.selectInput([['','仅自身'],...this.author.map.groups.map(g=>[g.id,g.name] as [string,string])],o.motion.targetGroup??'',v=>update(x=>x.motion.targetGroup=v||null),'motion-group'));
      for(const [key,label] of [['min','最小值'],['max','最大值'],['step','松手吸附间隔']] as const)if(o.type===4||key==='step')this.field(host,label,this.input(o.motion[key],v=>update(x=>x.motion[key]=Number(v)),'number',`motion-${key}`));
    }
    if(o.type===8){host.append(node('div','角色踩踏 → 物体组动作','subheading'));
      this.field(host,'触发方式',this.selectInput([['once','只触发一次'],['toggle','每次重新踩入切换']],o.trigger.mode,v=>update(x=>x.trigger.mode=v as 'once'|'toggle'),'trigger-mode'));
      o.trigger.actions.forEach((a,i)=>{const card=node('div','','action-card');host.append(card);const edit=(fn:(a:Action)=>void)=>update(x=>fn(x.trigger.actions[i]!));
        this.field(card,'目标组',this.selectInput(this.author.map.groups.map(g=>[g.id,g.name]),a.groupId,v=>edit(x=>x.groupId=v),`action-${i}-group`));
        this.vector(card,'目标位移（相对初始位置）',a.translation,v=>edit(x=>x.translation=v),`action-${i}-translation`);
        this.vector(card,'目标旋转（围绕组轴心）',a.rotation,v=>edit(x=>x.rotation=v),`action-${i}-rotation`);
        this.field(card,'动画时长（秒）',this.input(a.duration,v=>edit(x=>x.duration=Number(v)),'number',`action-${i}-duration`));
        this.field(card,'缓动',this.selectInput([['smooth','平滑起止'],['linear','匀速']],a.easing,v=>edit(x=>x.easing=v as 'linear'|'smooth')));
        card.append(button('移除此动作',()=>update(x=>x.trigger.actions.splice(i,1))));
      });
      const add=button('＋ 添加目标组动作',()=>{const g=this.author.map.groups.find(g=>!o.trigger.actions.some(a=>a.groupId===g.id));if(!g){this.status('先创建一个未被此开关控制的物体组。');return;}update(x=>x.trigger.actions.push({groupId:g.id,translation:[0,1,0],rotation:[0,0,0],duration:1.5,easing:'smooth'}));});add.id='add-action';add.className='wide';host.append(add);
    }
  }
  private groups():void{const host=$('group-list');host.replaceChildren();for(const g of this.author.map.groups){const b=button(`${g.name} · ${this.author.map.objects.filter(o=>belongsToGroup(this.author.map,o.groupId,g.id)).length} 构件`,()=>{this.author.select([g.id]);$('inspector').scrollIntoView({block:'start'});});b.className='wide';host.append(b);}}
  private links():void{$('link-list').replaceChildren();this.author.map.opticalLinks.forEach((l,i)=>{const card=node('div',`${l.a}:${l.aEnd} ↔ ${l.b}:${l.bEnd}`,'link-card');card.append(button('×',()=>this.author.change('删除错觉接缝',m=>m.opticalLinks.splice(i,1))));$('link-list').append(card);});}
  private placement(p:[number,number],type=this.tool!,heldHeight=this.drag?.placeHeight):Placement {
    return this.author.placement.resolve(type,p,{ground:height=>this.view.ground(...p,height),screen:point=>this.view.screen(point),hit:type<=10||type>=13?this.view.pickTarget(...p,emptyPoses(),false,true):null,height:Number($<HYInput>('layer').value)||0,step:Number($<HYSelect>('snap').value),heldHeight});
  }
  private placementGuide():void {
    const guide=document.querySelector<SVGSVGElement>('#placement-guide')!,p=this.placementPointer;
    const visible=this.tool===1&&!this.runtime&&!this.orbitMode&&p&&p[0]>=0&&p[1]>=0&&p[0]<=this.view.width&&p[1]<=this.view.height;
    guide.style.display=visible?'':'none';if(!visible||!p)return;
    const placement=this.placement(p),v=placement.position,blocked=placement.blocked||!!this.author.placementObstacle(1,v);
    guide.setAttribute('viewBox',`0 0 ${this.view.width} ${this.view.height}`);guide.classList.toggle('blocked',blocked);
    const [x,y]=this.view.screen(v),label=guide.querySelector('text')!;label.setAttribute('x',String(x));label.setAttribute('y',String(y-10));label.textContent=blocked?'此格已占用':`${placement.mode!=='layer'?'贴面放置':'松手放置'} · Y ${v[1]}`;
    const world=(x:number,z:number)=>this.view.screen(add(v,rotate([x,0,z],placement.rotation)));guide.querySelector('polygon')!.setAttribute('points',[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([x,z])=>world(x!,z!).join(',')).join(' '));
  }
  private guides():void{
    this.placementGuide();
    const guides=$('corner-guides');guides.replaceChildren();if(this.tool===12&&!this.runtime)for(const c of this.view.cornerPoints(this.author.selectedObjects)){const e=node('span','＋','corner-guide');e.style.left=`${c.screen[0]}px`;e.style.top=`${c.screen[1]}px`;guides.append(e);}
  }
  private play():void{
    this.cancel();if(this.runtime){this.runtime=null;this.view.setMap(this.author.map);$('play').textContent='▶ 试玩地图';$('runtime-message').hidden=true;document.body.classList.remove('playing');this.refreshSelection();}
    else{const issues=playIssues(this.author.map);if(issues.length){this.status(issues.join(' '));return;}this.runtime=new MapRuntime(cloneMap(this.author.map),this.view.project);this.tool=null;this.orbitMode=false;this.view.setMap(this.runtime.map,false,new URLSearchParams(location.search).get('batch')!=='0');$('play').textContent='■ 停止试玩';$('runtime-message').hidden=false;document.body.classList.add('playing');this.status('试玩：点击道路行走，拖动手轮转动机关；视角改变后，错觉接缝需重新对齐。');}
    this.updateTool();this.history();this.lockAuthoring();
  }
  private lockAuthoring():void{
    for(const control of document.querySelectorAll<HTMLElement>('.left hy-button,.right hy-button,.right hy-input,.right hy-select,#map-name,#import,#apply-json'))control.toggleAttribute('disabled',!!this.runtime);
    $('object-list').inert=!!this.runtime;$('catalog-tabs').inert=!!this.runtime;
  }
  private showJSON():void{$<HTMLTextAreaElement>('json-text').value=this.author.exportJSON();$<HYDialog>('json-dialog').showModal();}
  private export(compact=true):void{const blob=new Blob([this.author.exportJSON(compact)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${this.author.map.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.author.document.markSaved();this.status(compact?'精简地图已导出，包含静态路径合并计划。':'完整地图 JSON 已导出。');}
  private bind():void{
    const signal=this.abort.signal;
    const on=(id:string,fn:()=>void)=>$(id).addEventListener('click',()=>{if(!$(id).hasAttribute('disabled'))this.safe(fn);},{signal});
    $<HYTabs>('catalog-tabs').addEventListener('tab-change',()=>{if(!this.runtime){this.cancel();this.tool=null;this.updateTool();}},{signal});
    on('reset-layout',()=>{this.layout.reset();this.status('面板大小已恢复默认。');});
    on('grid-tool',()=>{this.gridVisible=!this.gridVisible;$('grid-tool').classList.toggle('active',this.gridVisible);$('grid-tool').setAttribute('aria-pressed',String(this.gridVisible));});
    on('select-tool',()=>{this.orbitMode=false;this.tool=null;this.updateTool();});on('orbit-tool',()=>{this.cancel();this.tool=null;this.orbitMode=!this.orbitMode;this.updateTool();this.status('旋转视角：左键拖动。角色行走与机关动画期间暂停视角旋转。');});on('reset-view',()=>{if(this.runtime?.walking||this.runtime?.busy){this.status('请等角色和机关停下后再复位视角。');return;}this.cancel();this.view.resetAngle();});on('align-grid',()=>{if(!this.runtime)this.author.alignSelected(Number($<HYSelect>('snap').value));});on('fit',()=>this.view.fit());on('undo',()=>{if(!this.runtime)this.author.platform.history.undo();});on('redo',()=>{if(!this.runtime)this.author.platform.history.redo();});
    on('play',()=>this.play());on('duplicate',()=>this.author.duplicate());on('delete',()=>this.author.removeSelected());on('group',()=>this.author.groupSelected());on('new-group',()=>this.author.createEmpty());
    on('demo-switch',()=>{this.author.replace('打开开关花园',switchGarden());this.view.fit();});on('demo-catalog',()=>{this.author.replace('打开物体目录',catalogGarden());this.view.fit();});on('new',()=>{this.author.replace('新建地图',emptyMap());this.view.fit();});
    on('demo-ladder',()=>{this.author.replace('打开攀光庭院',ladderGarden());this.view.fit();});
    on('demo-decorations',()=>{this.author.replace('打开花园塔影',decorationGarden());this.view.fit();});
    on('demo-sea',()=>{this.author.replace('打开潮汐回廊',seasideGarden());this.view.fit();});
    on('demo-seam',()=>{this.author.replace('打开折角回廊',rotatedSeamGarden());this.view.fit();});on('demo-surfaces',()=>{this.author.replace('打开翻面之径',surfaceGarden());this.view.fit();});on('demo-arc',()=>{this.author.replace('打开弧光之径',surfaceGarden(true));this.view.fit();});
    on('demo-split',()=>{this.author.replace('打开分体方块',splitGarden());this.view.fit();});
    on('json',()=>this.showJSON());on('close-json',()=>$<HYDialog>('json-dialog').close());on('export',()=>this.export());on('download-json',()=>this.export(false));on('download-compact',()=>this.export(true));
    on('apply-json',()=>{if(this.runtime)throw new Error('请先停止试玩。');this.author.importJSON($<HTMLTextAreaElement>('json-text').value);this.view.fit();$<HYDialog>('json-dialog').close();this.status('JSON 已通过校验并应用，可撤销。');});
    on('import',()=>$<HTMLInputElement>('file').click());$<HTMLInputElement>('file').addEventListener('change',async e=>{const input=e.target as HTMLInputElement,file=input.files?.[0];if(!file)return;if(file.size>2_000_000){this.status('地图文件不能超过 2 MB。');return;}try{this.author.importJSON(await file.text());this.view.fit();this.status('地图已导入。');}catch(e){this.status(String(e));}input.value='';},{signal});
    $<HYInput>('map-name').addEventListener('value-change',()=>{if(!this.runtime)this.safe(()=>this.author.change('修改地图名称',m=>m.name=$<HYInput>('map-name').value));},{signal});
    on('link',()=>{const [a,b]=this.author.selected;if(!a||!b||this.author.selected.length!==2){this.status('先按住 Shift 选择两个物体。');return;}this.author.change('添加错觉接缝',m=>m.opticalLinks.push({a,b,aEnd:Number($<HYSelect>('port-a').value) as PortId,bEnd:Number($<HYSelect>('port-b').value) as PortId}));});
    const when=()=>!this.runtime&&!this.drag&&!$<HYDialog>('json-dialog').open&&!editingFocus();
    for(const [id,chord,fn] of [['undo','Mod+Z',()=>this.author.platform.history.undo()],['redo','Mod+Shift+Z',()=>this.author.platform.history.redo()],] as const)this.author.shell.shortcuts.register({id:`valley.${id}`,ownerId:'valley.authoring',chord,when,handler:()=>{fn();}});
    this.author.shell.shortcuts.attach(window);
    window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$<HYDialog>('json-dialog').open&&!editingFocus()){this.cancel();this.orbitMode=false;this.tool=null;this.updateTool();}},{signal});
    const local=(e:PointerEvent):[number,number]=>{const r=this.canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];};
    this.canvas.addEventListener('contextmenu',e=>e.preventDefault(),{signal});
    this.canvas.addEventListener('pointerdown',e=>{
      if(this.drag||e.button>2)return;const p=local(e);this.placementPointer=p;this.canvas.focus();e.preventDefault();
      if(this.orbitMode&&e.button===0)return;
      if(!this.runtime&&this.tool&&e.button===0){if(this.tool===12){const corner=this.view.pickCorner(...p,this.author.selectedObjects);if(corner)this.safe(()=>this.author.addPillar(corner.pathId,corner.corner));else{const hit=this.view.pick(...p),o=this.author.map.objects.find(o=>o.id===hit);if(o&&canAttachPillar(o.type))this.author.select([o.id]);this.status('先选择普通路径或出生平台，再点击它的四个角点标记。');}return;}const placement=this.placement(p);this.drag={id:e.pointerId,start:p,last:p,kind:'place',placeType:this.tool,placeHeight:placement.sourceId?placement.height:undefined,hit:null,before:cloneMap(this.author.map),preview:cloneMap(this.author.map),value:0,moved:false,wheel:null};return;}
      const wheelHit=this.runtime?this.view.pickWheel(...p,this.runtime.poses):null,picked=wheelHit?null:this.view.pickTarget(...p,this.runtime?.poses,!this.runtime),hit=wheelHit??picked?.id??null,kind=e.button===2||e.button===1?'pan':this.runtime?'play':hit?'edit':'click';
      if(e.button===0&&wheelHit&&(!this.runtime!.canDrag(wheelHit)||!this.view.canTurnWheel(wheelHit)))return;
      if(kind==='edit'&&hit){if(e.shiftKey)this.select(hit,true);else if(!this.author.selectedObjects.includes(hit))this.select(hit);}
      if(kind==='click'&&!e.shiftKey)this.author.select([]);
      this.drag={id:e.pointerId,start:p,last:p,kind,hit,targetIndex:picked?.index,before:cloneMap(this.author.map),preview:cloneMap(this.author.map),value:hit?this.runtime?.poses.mechanisms[hit]??0:0,moved:false,wheel:wheelHit&&this.runtime?.canDrag(wheelHit)?this.view.beginWheel(wheelHit,p,this.runtime.poses):null};this.canvas.setPointerCapture(e.pointerId);
    },{signal});
    this.canvas.addEventListener('pointermove',e=>{
      const p=local(e);this.placementPointer=p;const placement=!this.runtime&&this.tool&&this.tool!==12?this.placement(p):null;if(this.drag?.kind==='place'&&placement?.sourceId)this.drag.placeHeight=placement.height;const world=placement?.position??this.snap(this.view.ground(...p,Number($<HYInput>('layer').value)||0));$('coords').textContent=`X ${world[0].toFixed(1)} · Y ${world[1].toFixed(1)} · Z ${world[2].toFixed(1)}`;
      const d=this.drag;if(!d||d.id!==e.pointerId)return;const dx=p[0]-d.start[0],dy=p[1]-d.start[1];if(Math.hypot(dx,dy)>5)d.moved=true;
      if(d.kind==='pan')this.view.pan(p[0]-d.last[0],p[1]-d.last[1]);
      else if(d.kind==='edit'&&d.moved&&d.hit){const a=this.view.ground(...d.start,0),b=this.view.ground(...p,0);d.preview=this.author.movePreview(d.before,d.hit,[b[0]-a[0],0,b[2]-a[2]],Number($<HYSelect>('snap').value));this.view.sync(d.preview,emptyPoses(),this.author.selectedObjects);}
      else if(d.kind==='play'&&d.hit&&d.moved&&this.runtime){const o=this.runtime.map.objects.find(o=>o.id===d.hit)!;if(d.wheel)this.runtime.dragTo(o.id,moveWheelDrag(d.wheel,p,this.view.screen(this.view.wheelCenter(o,this.runtime.poses))));else if(o.type===4)this.runtime.dragTo(o.id,d.value+this.view.axisDelta(dx,dy,o.motion.axis));}
      d.last=p;
    },{signal});
    this.canvas.addEventListener('pointerup',e=>{const d=this.drag;if(!d||d.id!==e.pointerId||d.kind==='place')return;this.drag=null;if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);
      if(d.kind==='edit'&&d.moved)this.safe(()=>this.author.replace('拖动物体',d.preview));
      if(d.kind==='play'&&d.hit&&this.runtime){if(d.moved&&(d.wheel||this.runtime.map.objects.find(o=>o.id===d.hit)?.type===4))this.runtime.dragTo(d.hit,this.runtime.poses.mechanisms[d.hit]??d.value,true);else if(!d.wheel&&!d.moved)this.runtime.walkTo(d.hit,d.targetIndex);}
    },{signal});
    // Placement follows release on the window, including releases outside the canvas.
    // It does not need pointer capture or a provisional object in the document.
    window.addEventListener('pointerup',e=>{const d=this.drag;if(d?.kind!=='place'||d.id!==e.pointerId)return;this.drag=null;const p=local(e);this.placementPointer=p;
      if(p[0]>=0&&p[1]>=0&&p[0]<=this.view.width&&p[1]<=this.view.height)this.safe(()=>{const placement=this.placement(p,d.placeType!,d.placeHeight);if(placement.blocked)throw new Error('目标位置已有道路，请选择其他表面或空格。');this.author.add(d.placeType!,placement.position,placement.rotation);this.status('已放置，可继续放置或按 Esc 选择物体。');});
    },{signal});
    this.canvas.addEventListener('pointerleave',()=>{this.placementPointer=null;},{signal});
    this.canvas.addEventListener('pointercancel',()=>this.cancel(),{signal});
    this.canvas.addEventListener('lostpointercapture',e=>{if(!this.canvas.hasPointerCapture(e.pointerId))this.cancel();},{signal});window.addEventListener('blur',()=>this.cancel(),{signal});
    this.canvas.addEventListener('wheel',e=>{e.preventDefault();if(this.drag)return;const r=this.canvas.getBoundingClientRect();this.view.zoom(Math.exp(-e.deltaY*.001),e.clientX-r.left,e.clientY-r.top);},{passive:false,signal});
  }
  private snap(p:Vec3):Vec3{return snapPosition(p,Number($<HYSelect>('snap').value));}
  private cancel():void{this.placementPointer=null;this.view?.setOrbitEnabled(this.canvas,false);const d=this.drag;if(!d)return;this.drag=null;this.releaseCapture(d.id);if(d.kind==='play'&&d.hit&&this.runtime)this.runtime.dragTo(d.hit,d.value);else this.view.sync(this.author.map,emptyPoses(),this.author.selectedObjects);}
  private snapshot():unknown{return {performance:this.view.performanceSnapshot(),diagnostics:getEngineDiagnosticsSnapshot(this.engine).frame,placement:this.tool&&this.placementPointer?this.placement(this.placementPointer):null,traveler:this.view.travelerSnapshot(),surfaces:this.view.surfaceTargets(this.runtime?.poses??emptyPoses()),grid:this.grid.snapshot(),water:this.view.waterSnapshot(),corners:this.view.cornerPoints(),wheelStates:this.view.wheelSnapshot(),wheelFrames:Object.fromEntries(this.author.map.objects.filter(o=>o.type===3).map(o=>[o.id,this.view.wheelProjection(o,this.runtime?.poses??emptyPoses())])),camera:{theta:this.view.orbitTransform.theta,phi:this.view.orbitTransform.phi,orbit:this.orbitMode},connections:connections(this.author.map,emptyPoses(),this.view.project),wheels:Object.fromEntries(this.author.map.objects.filter(o=>o.type===3).map(o=>[o.id,this.view.screen(this.view.wheelCenter(o,this.runtime?.poses??emptyPoses()))])),map:this.author.document.serialize(),json:this.author.exportJSON(),selected:this.author.selected,history:this.author.platform.history.snapshot(),platform:this.author.platform.snapshot(),shell:this.author.shell.snapshot(),playing:!!this.runtime,runtime:this.runtime?{at:this.runtime.at,position:this.runtime.position,up:this.runtime.up,busy:this.runtime.busy,walking:this.runtime.walking,completed:this.runtime.completed,fired:[...this.runtime.fired],poses:this.runtime.poses}:null,model:this.view.model.status,errors:this.issues,targets:Object.fromEntries(this.author.map.objects.map(o=>{const s=worldSamples(this.runtime?.map??this.author.map,o,this.runtime?.poses??emptyPoses());return [o.id,this.view.screen(s[centerIndex(o)]!.point)];})),canvas:{x:this.canvas.getBoundingClientRect().x,y:this.canvas.getBoundingClientRect().y,width:this.view.width,height:this.view.height}};}
}
type oKeys='rise'|'steps'|'twist'|'radius'|'arc'|'arcTwist';
void new ValleyEditor().init().catch(e=>{$('loading').textContent=String(e);$('result').dataset.status='failed';$('result').textContent=JSON.stringify({status:'failed',error:String(e)});console.error(e);});
