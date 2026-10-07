import { HaiyueEngine } from '@haiyue/engine';
import { guardDeferredPointerCapture } from '../../../games/valley-of-light/canvasInput';
import { MapView } from '../../../games/valley-of-light/map/view';
import { CATALOG, PORT_NAMES, WHEEL_PALETTES, MapRuntime, catalogGarden, centerIndex, cloneMap, connections, emptyMap, emptyPoses, pathPorts, playIssues, snapPosition, splitGarden, switchGarden, worldSamples, type Action, type Axis, type MapObject, type PortId, type TypeId, type ValleyMap, type Vec3 } from '../../../games/valley-of-light/map/model';
import { ValleyAuthoring } from './document';

const $=<T extends HTMLElement=HTMLElement>(id:string):T=>document.getElementById(id) as T;
const button=(text:string,action:()=>void):HTMLButtonElement=>{const b=document.createElement('button');b.textContent=text;b.onclick=action;return b;};
const node=(tag:string,text='',className=''):HTMLElement=>{const n=document.createElement(tag);n.textContent=text;n.className=className;return n;};
class ValleyEditor {
  readonly author=new ValleyAuthoring(new URLSearchParams(location.search).get('demo')==='split'?splitGarden():switchGarden());private abort=new AbortController();private engine!:HaiyueEngine;private view!:MapView;
  private splitDepth=3;
  private orbitMode=false;private cameraKey='';
  private runtime:MapRuntime|null=null;private tool:TypeId|null=null;private revision=-1;
  private drag:{id:number;start:[number,number];last:[number,number];kind:'pan'|'edit'|'play'|'click';hit:string|null;before:ValleyMap;preview:ValleyMap;value:number;moved:boolean}|null=null;
  private readonly canvas=$<HTMLCanvasElement>('canvas');private issues:string[]=[];
  private releaseCapture:(id:number)=>void=()=>{};
  async init():Promise<void>{
    await this.author.start();
    for(const contribution of this.author.shell.list<{title:string;hostId:string}>('panel'))$(contribution.value.hostId).dataset.editorContribution=contribution.id;
    this.releaseCapture=guardDeferredPointerCapture(this.canvas,this.abort.signal);
    this.engine=new HaiyueEngine({canvas:this.canvas,msaaSamples:4,devicePixelRatio:()=>Math.min(devicePixelRatio,1.75)});await this.engine.init();
    this.view=new MapView(this.engine,new URL('../../games/valley-of-light/assets/traveler.gltf',location.href).href);
    this.resize();this.view.setMap(this.author.map,true);
    this.engine.device.addEventListener('uncapturederror',e=>{this.issues.push(e.error.message);this.status(e.error.message);},{signal:this.abort.signal});
    this.buildCatalog();this.bind();this.refresh();
    this.author.document.subscribe(()=>this.refresh());this.author.platform.selection.subscribe(()=>this.refreshSelection());this.author.platform.history.subscribe(()=>this.history());
    this.engine.on('update',({detail:{delta}})=>{this.resize();const dt=Math.min(delta/1000,.05);this.runtime?.tick(dt);this.view.tick(dt,this.runtime);this.view.setOrbitEnabled(this.canvas,this.orbitMode&&!this.runtime?.walking&&!this.runtime?.busy);if(this.runtime)$('runtime-message').textContent=this.runtime.message;const key=[this.view.orbitTransform.theta,this.view.orbitTransform.phi].join(':');if(key!==this.cameraKey){this.cameraKey=key;this.connectionCount();}this.labels();});
    this.engine.switchScene(this.view.scene);this.engine.run();$('loading').hidden=true;
    window.addEventListener('pagehide',()=>{this.abort.abort();this.view.dispose();this.engine.destroy();void this.author.dispose();},{once:true});
    window.addEventListener('beforeunload',e=>{if(this.author.document.revision!==this.author.document.savedRevision){e.preventDefault();e.returnValue='';}},{signal:this.abort.signal});
    if(new URLSearchParams(location.search).has('verify'))Object.defineProperty(window,'__valleyEditor',{value:{snapshot:()=>this.snapshot()}});
    $('result').dataset.status='passed';$('result').textContent=JSON.stringify({status:'passed',suite:'valley-editor'});
  }
  private resize():void{const r=this.canvas.getBoundingClientRect();if(this.view&&(r.width!==this.view.width||r.height!==this.view.height))this.cancel();this.view?.resize(r.width,r.height);}
  private status(text:string):void{$('status').textContent=text;}
  private safe(action:()=>void):void{try{action();}catch(e){this.status(String(e));}}
  private buildCatalog():void{
    for(const c of CATALOG){const b=button('',()=>{if(this.runtime)return;this.orbitMode=false;this.tool=c.type;this.updateTool();this.status(`点击画布放置 ${c.type} · ${c.name}`);});b.className='catalog-item';b.dataset.type=String(c.type);
      b.append(node('span',String(c.type).padStart(2,'0'),'number'),node('span',c.icon,'icon'));const t=node('div',c.name,'text');t.append(node('small',c.description));b.append(t);$('catalog').append(b);}
  }
  private updateTool():void{$('select-tool').classList.toggle('active',this.tool===null&&!this.orbitMode);$('orbit-tool').classList.toggle('active',this.orbitMode);$('orbit-tool').setAttribute('aria-pressed',String(this.orbitMode));document.querySelectorAll<HTMLElement>('.catalog-item').forEach(b=>b.classList.toggle('selected',Number(b.dataset.type)===this.tool));this.canvas.style.cursor=this.orbitMode?'grab':this.tool?'crosshair':'default';$('mode').textContent=this.orbitMode?'旋转视角':this.runtime?'试玩模式':this.tool?`放置 ${CATALOG.find(c=>c.type===this.tool)!.name}`:'编辑模式';this.view.setOrbitEnabled(this.canvas,this.orbitMode&&!this.runtime?.walking&&!this.runtime?.busy);}
  private connectionCount():void{$('connections').textContent=`${connections(this.author.map,emptyPoses(),this.view.project).length} 处已连接端口`;}
  private refresh():void{
    if(!this.view)return;if(this.revision!==this.author.document.revision){this.revision=this.author.document.revision;this.view.setMap(this.author.map);}
    $<HTMLInputElement>('map-name').value=this.author.map.name;$('dirty').textContent=this.author.document.revision===this.author.document.savedRevision?'已导出':'● 未导出';
    $('object-count').textContent=String(this.author.map.objects.length);$('object-list').replaceChildren();
    for(const o of this.author.map.objects){const b=button('',()=>this.author.select([o.id]));b.onclick=e=>this.select(o.id,e.shiftKey);b.className='object-row';b.dataset.object=o.id;b.append(node('span',`${String(o.type).padStart(2,'0')}  ${o.name}`),node('small',o.groupId?'组':''));$('object-list').append(b);}
    this.connectionCount();
    this.groups();this.links();this.refreshSelection();this.history();
  }
  private history():void{$<HTMLButtonElement>('undo').disabled=!!this.runtime||!this.author.platform.history.canUndo;$<HTMLButtonElement>('redo').disabled=!!this.runtime||!this.author.platform.history.canRedo;}
  private select(id:string,append=false):void{if(this.runtime)return;const current=this.author.selected;this.author.select(append?(current.includes(id)?current.filter(x=>x!==id):[...current,id]):[id]);}
  private refreshSelection():void{
    const ids=this.author.selected;document.querySelectorAll<HTMLElement>('.object-row').forEach(b=>b.classList.toggle('selected',ids.includes(b.dataset.object!)));
    if(!this.runtime)this.view.sync(this.author.map,emptyPoses(),ids);this.properties();this.labels();
    for(const [i,id] of ['port-a','port-b'].entries()) {
      const select=$<HTMLSelectElement>(id),o=this.author.map.objects.find(o=>o.id===ids[i]),previous=select.value;select.replaceChildren();
      if(o)for(const p of pathPorts(o)){const option=document.createElement('option');option.value=String(p.port);option.textContent=`${i?'B':'A'} ${PORT_NAMES[p.port]}`;select.append(option);}
      select.value=Array.from(select.options).some(o=>o.value===previous)?previous:o?.type===5?'4':select.options[0]?.value??'';
    }
  }
  private field(host:HTMLElement,label:string,child:HTMLElement):void{const wrap=node('label','','field');wrap.append(node('span',label),child);host.append(wrap);}
  private input(value:string|number,change:(value:string)=>void,type='text',id?:string):HTMLInputElement{
    const input=document.createElement('input');input.type=type;input.value=String(value);if(id)input.id=id;input.disabled=!!this.runtime;
    if(type==='number')input.step='.1';input.onchange=()=>{if(this.runtime)return;this.safe(()=>change(input.value));};return input;
  }
  private selectInput(options:Array<[string,string]>,value:string,change:(value:string)=>void,id?:string):HTMLSelectElement{
    const s=document.createElement('select');if(id)s.id=id;for(const [v,text] of options){const o=document.createElement('option');o.value=v;o.textContent=text;s.append(o);}s.value=value;s.disabled=!!this.runtime;s.onchange=()=>{if(!this.runtime)this.safe(()=>change(s.value));};return s;
  }
  private vector(host:HTMLElement,label:string,value:Vec3,change:(v:Vec3)=>void,id:string):void{
    const row=node('div','','triple');for(let i=0;i<3;i++){const l=node('label',['X','Y','Z'][i]!);l.append(this.input(value[i]!,v=>{const next:[number,number,number]=[...value];next[i]=Number(v);change(next);},'number',`${id}-${i}`));row.append(l);}this.field(host,label,row);
  }
  private properties():void{
    const host=$('properties');host.replaceChildren();const selected=this.author.map.objects.filter(o=>this.author.selected.includes(o.id));$('selection-count').textContent=selected.length?`${selected.length} 个物体`:'未选择';
    if(selected.length!==1){host.append(node('p',selected.length?'多选后可拖动、复制、删除或创建物体组。':'选择地图中的物体，或从左侧目录放置构件。','muted'));return;}
    const o=selected[0]!,update=(mutation:(obj:MapObject)=>void)=>{if(!this.runtime)this.author.update(o.id,mutation);};
    host.append(node('div',`TYPE ${String(o.type).padStart(2,'0')}  /  ${o.id}`,'badge'));
    this.field(host,'物体名称',this.input(o.name,v=>update(x=>x.name=v),'text','object-name'));
    this.vector(host,'位置（格坐标 / 路径锚点）',o.position,v=>update(x=>x.position=v),'position');this.vector(host,'旋转（度，Y-X-Z 顺序）',o.rotation,v=>update(x=>x.rotation=v),'rotation');
    this.field(host,'所属物体组',this.selectInput([['','未分组'],...this.author.map.groups.map(g=>[g.id,g.name] as [string,string])],o.groupId??'',v=>update(x=>x.groupId=v||null),'object-group'));
    const grid=node('div','','grid2');host.append(grid);for(const [key,label] of [['length','长度'],['width','宽度'],['thickness','厚度']] as const)this.field(grid,label,this.input(o[key],v=>update(x=>x[key]=Number(v)),'number',`param-${key}`));
    host.append(node('div',o.type===3?'手轮配色':'构件配色','subheading'));
    if(o.type===3){const presets=node('div','','palette-presets');WHEEL_PALETTES.forEach((p,i)=>{const b=button(p.name,()=>update(x=>x.colors={...p.colors}));b.id=`palette-${i}`;presets.append(b);});host.append(presets);}
    for(const [key,label] of [['surface','路径主体'],...(o.type===3?[['hub','中空轮毂'],['spokes','方杆与转轴'],['tips','末端方块'],['base','墙面轴座']]:[])] as Array<[keyof MapObject['colors'],string]>){const row=node('div','','color-row'),change=(v:string)=>update(x=>x.colors[key]=v);row.append(this.input(o.colors[key],change,'color',`swatch-${key}`),this.input(o.colors[key],change,'text',`color-${key}`));this.field(host,label,row);}
    if(o.type===1){
      host.append(node('div','拆分一格方块','subheading'),node('p','A、B 是同一方块的互补三棱柱。B 沿默认等轴视线偏移 X / Y / Z，复位视角后拼成完整方块。','muted'));
      this.field(host,'B 半块的深度间隔（格）',this.input(this.splitDepth,v=>{this.splitDepth=Number(v);},'number','split-depth'));
      const split=button('拆为 A / B 三棱柱',()=>this.safe(()=>{this.author.splitSelected(this.splitDepth);this.status('已生成两个可独立定位的半块，并连接对角切面。撤销可恢复完整方块。');}));split.id='split-cube';split.className='wide';host.append(split);
    }
    if(o.type===5){this.field(host,'方块的哪一半',this.selectInput([['a','A：X− / Z+ 半块'],['b','B：X+ / Z− 半块']],o.prismHalf,v=>update(x=>x.prismHalf=v as 'a'|'b'),'prism-half'));host.append(node('p','沿顶面 X = Z 对角线竖直切开；A 与 B 各占方块体积的一半。两者可分别移动，切面端口用于错觉连接。','muted'));}
    const special:oKeys[]=o.type===2?['rise','steps']:o.type===6?['twist']:o.type===7?['radius','arc']:[];
    for(const key of special)this.field(grid,({rise:'升高',steps:'台阶数',twist:'扭转角度',radius:'圆弧半径',arc:'圆弧角度'})[key],this.input(o[key],v=>update(x=>x[key]=Number(v)),'number',`param-${key}`));
    if(o.type===3||o.type===4){host.append(node('div','拖拽机关','subheading'));
      this.field(host,'运动轴',this.selectInput(['x','y','z'].map(a=>[a,a.toUpperCase()]),o.motion.axis,v=>update(x=>x.motion.axis=v as Axis),'motion-axis'));
      this.field(host,'驱动物体组（空为自身）',this.selectInput([['','仅自身'],...this.author.map.groups.map(g=>[g.id,g.name] as [string,string])],o.motion.targetGroup??'',v=>update(x=>x.motion.targetGroup=v||null),'motion-group'));
      for(const [key,label] of [['min','最小值'],['max','最大值'],['step','松手吸附间隔']] as const)this.field(host,label,this.input(o.motion[key],v=>update(x=>x.motion[key]=Number(v)),'number',`motion-${key}`));
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
  private groups():void{
    const host=$('group-list');host.replaceChildren();for(const g of this.author.map.groups){const card=node('div','','group-card'),row=node('div','','row');row.append(node('strong',g.id),node('span',`${this.author.map.objects.filter(o=>o.groupId===g.id).length} 个物体`));card.append(row);
      this.field(card,'组名称',this.input(g.name,v=>this.author.change('修改组名称',m=>m.groups.find(x=>x.id===g.id)!.name=v)));
      this.vector(card,'旋转轴心（世界坐标）',g.pivot,v=>this.author.change('修改组轴心',m=>m.groups.find(x=>x.id===g.id)!.pivot=v),`group-${g.id}-pivot`);
      card.append(button('选择此组',()=>this.author.select(this.author.map.objects.filter(o=>o.groupId===g.id).map(o=>o.id))));host.append(card);
    }
  }
  private links():void{$('link-list').replaceChildren();this.author.map.opticalLinks.forEach((l,i)=>{const card=node('div',`${l.a}:${l.aEnd} ↔ ${l.b}:${l.bEnd}`,'link-card');card.append(button('×',()=>this.author.change('删除错觉接缝',m=>m.opticalLinks.splice(i,1))));$('link-list').append(card);});}
  private labels():void{
    if(!this.view||this.runtime)return;const host=$('labels'),map=this.drag?.kind==='edit'?this.drag.preview:this.author.map;
    if(host.childElementCount!==map.objects.length)host.replaceChildren(...map.objects.map(()=>node('span','','object-label')));
    map.objects.forEach((o,i)=>{const s=worldSamples(map,o,emptyPoses()),p=this.view.screen(s[centerIndex(o)]!.point),label=host.children[i] as HTMLElement;label.textContent=o.type===5?`5 · ${o.prismHalf.toUpperCase()} 半块`:`${o.type} · ${o.name}`;label.style.left=`${p[0]+(o.type===5?(o.prismHalf==='a'?-18:18):0)}px`;label.style.top=`${p[1]+18}px`;label.classList.toggle('selected',this.author.selected.includes(o.id));});
  }
  private play():void{
    this.cancel();if(this.runtime){this.runtime=null;this.view.setMap(this.author.map);$('play').textContent='▶ 试玩地图';$('runtime-message').hidden=true;document.body.classList.remove('playing');this.refreshSelection();}
    else{const issues=playIssues(this.author.map);if(issues.length){this.status(issues.join(' '));return;}this.runtime=new MapRuntime(cloneMap(this.author.map),this.view.project);this.tool=null;this.orbitMode=false;this.view.setMap(this.runtime.map);$('play').textContent='■ 停止试玩';$('runtime-message').hidden=false;document.body.classList.add('playing');this.status('试玩：点击道路行走，拖动手轮转动机关；视角改变后，错觉接缝需重新对齐。');}
    this.updateTool();this.history();for(const id of ['import','new','demo-switch','demo-catalog','demo-split','map-name'])($<HTMLButtonElement>(id)).disabled=!!this.runtime;
  }
  private showJSON():void{$<HTMLTextAreaElement>('json-text').value=this.author.exportJSON();$<HTMLDialogElement>('json-dialog').showModal();}
  private export():void{const blob=new Blob([this.author.exportJSON()],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${this.author.map.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.author.document.markSaved();this.status('地图 JSON 已导出。可在游戏中通过「载入地图」打开。');}
  private bind():void{
    const signal=this.abort.signal;
    const on=(id:string,fn:()=>void)=>$(id).addEventListener('click',()=>this.safe(fn),{signal});
    on('select-tool',()=>{this.orbitMode=false;this.tool=null;this.updateTool();});on('orbit-tool',()=>{this.cancel();this.tool=null;this.orbitMode=!this.orbitMode;this.updateTool();this.status('旋转视角：左键拖动。角色行走与机关动画期间暂停视角旋转。');});on('reset-view',()=>{if(this.runtime?.walking||this.runtime?.busy){this.status('请等角色和机关停下后再复位视角。');return;}this.cancel();this.view.resetAngle();});on('align-grid',()=>{if(!this.runtime)this.author.alignSelected(Number($<HTMLSelectElement>('snap').value));});on('fit',()=>this.view.fit());on('undo',()=>{if(!this.runtime)this.author.platform.history.undo();});on('redo',()=>{if(!this.runtime)this.author.platform.history.redo();});
    on('play',()=>this.play());on('duplicate',()=>this.author.duplicate());on('delete',()=>this.author.removeSelected());on('group',()=>this.author.groupSelected());on('new-group',()=>this.author.groupSelected());
    on('demo-switch',()=>{this.author.replace('打开开关花园',switchGarden());this.view.fit();});on('demo-catalog',()=>{this.author.replace('打开物体目录',catalogGarden());this.view.fit();});on('new',()=>{this.author.replace('新建地图',emptyMap());this.view.fit();});
    on('demo-split',()=>{this.author.replace('打开分体方块',splitGarden());this.view.fit();});
    on('json',()=>this.showJSON());on('close-json',()=>$<HTMLDialogElement>('json-dialog').close());on('export',()=>this.export());on('download-json',()=>this.export());
    on('apply-json',()=>{if(this.runtime)throw new Error('请先停止试玩。');this.author.importJSON($<HTMLTextAreaElement>('json-text').value);this.view.fit();$<HTMLDialogElement>('json-dialog').close();this.status('JSON 已通过校验并应用，可撤销。');});
    on('import',()=>$<HTMLInputElement>('file').click());$<HTMLInputElement>('file').addEventListener('change',async e=>{const input=e.target as HTMLInputElement,file=input.files?.[0];if(!file)return;if(file.size>2_000_000){this.status('地图文件不能超过 2 MB。');return;}try{this.author.importJSON(await file.text());this.view.fit();this.status('地图已导入。');}catch(e){this.status(String(e));}input.value='';},{signal});
    $<HTMLInputElement>('map-name').addEventListener('change',e=>this.safe(()=>this.author.change('修改地图名称',m=>m.name=(e.target as HTMLInputElement).value)),{signal});
    on('link',()=>{const [a,b]=this.author.selected;if(!a||!b||this.author.selected.length!==2){this.status('先按住 Shift 选择两个物体。');return;}this.author.change('添加错觉接缝',m=>m.opticalLinks.push({a,b,aEnd:Number($<HTMLSelectElement>('port-a').value) as PortId,bEnd:Number($<HTMLSelectElement>('port-b').value) as PortId}));});
    const when=()=>!this.runtime&&!this.drag&&!$<HTMLDialogElement>('json-dialog').open&&!(document.activeElement instanceof HTMLInputElement||document.activeElement instanceof HTMLTextAreaElement||document.activeElement instanceof HTMLSelectElement);
    for(const [id,chord,fn] of [['undo','Mod+Z',()=>this.author.platform.history.undo()],['redo','Mod+Shift+Z',()=>this.author.platform.history.redo()],['delete','Delete',()=>this.author.removeSelected()],['copy','Mod+D',()=>this.author.duplicate()]] as const)this.author.shell.shortcuts.register({id:`valley.${id}`,ownerId:'valley.authoring',chord,when,handler:()=>{fn();}});
    this.author.shell.shortcuts.attach(window);
    window.addEventListener('keydown',e=>{if(e.key==='Escape'){this.cancel();this.orbitMode=false;this.tool=null;this.updateTool();}},{signal});
    const local=(e:PointerEvent):[number,number]=>{const r=this.canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];};
    this.canvas.addEventListener('contextmenu',e=>e.preventDefault(),{signal});
    this.canvas.addEventListener('pointerdown',e=>{
      if(this.drag||e.button>2)return;const p=local(e);this.canvas.focus();e.preventDefault();
      if(this.orbitMode&&e.button===0)return;
      if(!this.runtime&&this.tool&&e.button===0){const v=this.snap(this.view.ground(...p,Number($<HTMLInputElement>('layer').value)||0));this.safe(()=>this.author.add(this.tool!,v));return;}
      const hit=this.view.pick(...p,this.runtime?.poses),kind=e.button===2||e.button===1?'pan':this.runtime?'play':hit?'edit':'click';
      if(kind==='edit'&&hit){if(e.shiftKey)this.select(hit,true);else if(!this.author.selected.includes(hit))this.select(hit);}
      if(kind==='click'&&!e.shiftKey)this.author.select([]);
      this.drag={id:e.pointerId,start:p,last:p,kind,hit,before:cloneMap(this.author.map),preview:cloneMap(this.author.map),value:hit?this.runtime?.poses.mechanisms[hit]??0:0,moved:false};this.canvas.setPointerCapture(e.pointerId);
    },{signal});
    this.canvas.addEventListener('pointermove',e=>{
      const p=local(e),world=this.snap(this.view.ground(...p,Number($<HTMLInputElement>('layer').value)||0));$('coords').textContent=`X ${world[0].toFixed(1)} · Y ${world[1].toFixed(1)} · Z ${world[2].toFixed(1)}`;
      const d=this.drag;if(!d||d.id!==e.pointerId)return;const dx=p[0]-d.start[0],dy=p[1]-d.start[1];if(Math.hypot(dx,dy)>5)d.moved=true;
      if(d.kind==='pan')this.view.pan(p[0]-d.last[0],p[1]-d.last[1]);
      else if(d.kind==='edit'&&d.moved&&d.hit){const a=this.view.ground(...d.start,0),b=this.view.ground(...p,0);d.preview=this.author.movePreview(d.before,d.hit,[b[0]-a[0],0,b[2]-a[2]],Number($<HTMLSelectElement>('snap').value));this.view.sync(d.preview,emptyPoses(),this.author.selected);}
      else if(d.kind==='play'&&d.hit&&d.moved&&this.runtime){const o=this.runtime.map.objects.find(o=>o.id===d.hit)!;const delta=o.type===3?(dx-dy)*.75:this.view.axisDelta(dx,dy,o.motion.axis);this.runtime.dragTo(o.id,d.value+delta);}
      d.last=p;
    },{signal});
    this.canvas.addEventListener('pointerup',e=>{const d=this.drag;if(!d||d.id!==e.pointerId)return;this.drag=null;if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);
      if(d.kind==='edit'&&d.moved)this.safe(()=>this.author.replace('拖动物体',d.preview));
      if(d.kind==='play'&&d.hit&&this.runtime){if(d.moved)this.runtime.dragTo(d.hit,this.runtime.poses.mechanisms[d.hit]??d.value,true);else this.runtime.walkTo(d.hit);}
    },{signal});
    this.canvas.addEventListener('pointercancel',()=>this.cancel(),{signal});
    this.canvas.addEventListener('lostpointercapture',e=>{if(!this.canvas.hasPointerCapture(e.pointerId))this.cancel();},{signal});window.addEventListener('blur',()=>this.cancel(),{signal});
    this.canvas.addEventListener('wheel',e=>{e.preventDefault();const r=this.canvas.getBoundingClientRect();this.view.zoom(Math.exp(-e.deltaY*.001),e.clientX-r.left,e.clientY-r.top);},{passive:false,signal});
  }
  private snap(p:Vec3):Vec3{return snapPosition(p,Number($<HTMLSelectElement>('snap').value));}
  private cancel():void{this.view?.setOrbitEnabled(this.canvas,false);const d=this.drag;if(!d)return;this.drag=null;this.releaseCapture(d.id);if(d.kind==='play'&&d.hit&&this.runtime)this.runtime.dragTo(d.hit,d.value);else this.view.sync(this.author.map,emptyPoses(),this.author.selected);}
  private snapshot():unknown{return {camera:{theta:this.view.orbitTransform.theta,phi:this.view.orbitTransform.phi,orbit:this.orbitMode},connections:connections(this.author.map,emptyPoses(),this.view.project),wheels:Object.fromEntries(this.author.map.objects.filter(o=>o.type===3).map(o=>[o.id,this.view.screen(this.view.wheelCenter(o,this.runtime?.poses??emptyPoses()))])),map:this.author.document.serialize(),json:this.author.exportJSON(),selected:this.author.selected,history:this.author.platform.history.snapshot(),platform:this.author.platform.snapshot(),shell:this.author.shell.snapshot(),playing:!!this.runtime,runtime:this.runtime?{at:this.runtime.at,position:this.runtime.position,busy:this.runtime.busy,walking:this.runtime.walking,completed:this.runtime.completed,fired:[...this.runtime.fired],poses:this.runtime.poses}:null,model:this.view.model.status,errors:this.issues,targets:Object.fromEntries(this.author.map.objects.map(o=>{const s=worldSamples(this.runtime?.map??this.author.map,o,this.runtime?.poses??emptyPoses());return [o.id,this.view.screen(s[centerIndex(o)]!.point)];})),canvas:{x:this.canvas.getBoundingClientRect().x,y:this.canvas.getBoundingClientRect().y,width:this.view.width,height:this.view.height}};}
}
type oKeys='rise'|'steps'|'twist'|'radius'|'arc';
void new ValleyEditor().init().catch(e=>{$('loading').textContent=String(e);$('result').dataset.status='failed';$('result').textContent=JSON.stringify({status:'failed',error:String(e)});console.error(e);});
