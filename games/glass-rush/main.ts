import { World } from '@haiyue/engine';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { GuiLabel, GuiButton } from '@haiyue/engine/gui';
import { GameEngine } from '../session/GameEngine';
import { GameHud } from '../shared/ui/GameHud';
import { SingleSlotGameSave } from '../save/SingleSlotGameSave';
import { advance, createRound, isRecords, rank, speed, type Records } from './rules/model';
import { Tunnel } from './rendering/Tunnel';
import { installGamepad } from '../gamepad/runtime';
import { guardQueuedPointerCapture } from '../shared/input/pointerCapture';

const canvas = document.querySelector('canvas')!;
const restoreCapture = guardQueuedPointerCapture(canvas);
const disposeGamepad = installGamepad('glass-rush');
const engine = new GameEngine({ canvas, msaaSamples: 4, devicePixelRatio: () => Math.min(devicePixelRatio || 1, 1.5) });
const world = new World('Glass Rush');
const save = new SingleSlotGameSave<Records>({ gameId: 'glass-rush', name: 'Glass Rush TOP 5', validateData: isRecords });
const lifetime = new AbortController();
let round = createRound(), records: number[] = [], last: number | null = null, recorded = false, disposed = false;
const keys = new Set<string>(), pointers = new Map<number, number>();
const clear = () => { keys.clear(); pointers.clear(); };
function action(): void {
  clear();last = null;
  if(round.phase === 'playing') round.phase = 'paused';
  else if(round.phase === 'paused') round.phase = 'playing';
  else { round = createRound(Number(new URLSearchParams(location.search).get('seed') ?? Date.now())); round.phase = 'playing'; recorded = false; }
}
async function boot(): Promise<void> {
  const [, saved] = await Promise.all([engine.init(), save.load()]);if(disposed)return;records = saved?.times ?? [];
  const tunnel = new Tunnel(engine);await tunnel.init();if(disposed){tunnel.destroy();return;}world.addSystem(tunnel);
  const chars='玻璃疾驰生存时间速度撞击承受三次第四次碎裂按住左半屏右半屏旋转方向键躲避障碍开始挑战继续再来一次暂停已最佳纪录本机排行暂无秒保存失败仅本次有效、，·';
  const hud = new GameHud(engine, world, chars, 1000, 700);
  const add = (text:string,x:number,y:number,w:number,h:number,size:number,color='#d8faff') => hud.place(new GuiLabel({text,fontSize:size,disabled:true,textAlign:'center',style:{color,padding:0}}),{x,y,width:w,height:h},size);
  add('GLASS / RUSH',24,20,250,40,25);
  const timer=add('',350,20,300,45,32), damage=add('',720,28,260,35,18,'#ffafbc');
  const velocity=add('',350,65,300,28,15);
  add('方向键 / 按住左半屏、右半屏旋转',140,655,720,28,16);
  const title=add('玻璃疾驰',100,168,800,70,52);
  const subtitle=add('',100,250,800,38,18);
  const board=Array.from({length:5},(_,i)=>add('',260,345+i*36,480,30,18));
  const ranking=add('本机排行 / TOP 5',250,305,500,32,18,'#ad9eff');
  const start=hud.place(new GuiButton({text:'开始挑战',onClick:action,style:{backgroundColor:'#7455dc',color:'#ffffff',radius:16}}),{x:350,y:552,width:300,height:56},20);
  const pause=hud.place(new GuiButton({text:'暂停',onClick:action,style:{backgroundColor:'#17344a',color:'#d8faff',radius:8}}),{x:855,y:82,width:120,height:40},16);
  // Keep play information at the physical edges on tall phones as well as desktops.
  for (const node of hud.root.root.children) {
    const layout=node.layout.bind(node);
    node.layout=parent=>{layout(parent);const s=Math.min(parent.width/1000,parent.height/700),margin=(parent.height-700*s)/2;
      if([timer,damage,velocity,pause,hud.root.root.children[0]].includes(node as GuiLabel))node.rect.y-=margin;
      else if(node===hud.root.root.children[4])node.rect.y+=margin;
      if(node instanceof GuiButton){node.rect.height=Math.max(36,node.rect.height);}
      if(parent.width<600){hud.root.theme.fontSize=14;if(node instanceof GuiLabel)node.setFontSize(node===timer?22:node===title?26:12);}
    };
  }
  engine.resizeToDisplaySize();
  const resize = new ResizeObserver(() => engine.resizeToDisplaySize());resize.observe(canvas);world.addRuntimeIntegration({onDetach:()=>resize.disconnect()});
  const integration = new RenderIntegration(engine,{label:'Glass Rush shader + engine GUI'});world.addRuntimeIntegration(integration);integration.registerAll(world,system=>system===tunnel?{pass:'isolated',loadOp:'clear',depth:false,sort:0}:{pass:'isolated',loadOp:'load',depth:true,sort:10});
  window.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','KeyP','Escape'].includes(e.code))e.preventDefault();if(e.repeat)return;if(e.code==='Space'||e.code==='Enter')action();else if(e.code==='KeyP'||e.code==='Escape'){if(round.phase==='playing'||round.phase==='paused')action();}else keys.add(e.code);},{signal:lifetime.signal});
  window.addEventListener('keyup',e=>keys.delete(e.code),{signal:lifetime.signal});
  canvas.addEventListener('pointerdown',e=>{if(round.phase!=='playing'||hud.hit(e.clientX,e.clientY,canvas))return;const rect=canvas.getBoundingClientRect();pointers.set(e.pointerId,e.clientX<rect.left+rect.width/2?-1:1);canvas.setPointerCapture(e.pointerId);},{signal:lifetime.signal});
  canvas.addEventListener('pointermove',e=>{if(pointers.has(e.pointerId)){const rect=canvas.getBoundingClientRect();pointers.set(e.pointerId,e.clientX<rect.left+rect.width/2?-1:1);}},{signal:lifetime.signal});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>pointers.delete((e as PointerEvent).pointerId),{signal:lifetime.signal});
  const suspend=()=>{clear();last=null;if(round.phase==='playing')round.phase='paused';};
  window.addEventListener('blur',suspend,{signal:lifetime.signal});document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();},{signal:lifetime.signal});
  engine.on('update',event=>{
    const now=event.detail.time,dt=last===null?0:Math.min(.1,Math.max(0,(now-last)/1000));last=now;
    let direction=Number(keys.has('ArrowRight')||keys.has('ArrowDown'))-Number(keys.has('ArrowLeft')||keys.has('ArrowUp'));
    for(const side of pointers.values())direction+=side;
    advance(round,dt,Math.sign(direction));
    if(round.phase==='over'&&!recorded){recorded=true;records=rank(records,round.time);save.save({times:records});}
    tunnel.sync(round);timer.setText(`${round.time.toFixed(2)} s`);velocity.setText(`${speed(round).toFixed(1)} m/s`);damage.setText(`撞击 ${Math.min(round.hits,4)} / 3`);
    const overlay=round.phase!=='playing';for(const node of [title,subtitle,ranking,start,...board])node.setVisible(overlay);
    title.setText(round.phase==='over'?'玻璃已碎裂':round.phase==='paused'?'已暂停':'玻璃疾驰');
    subtitle.setText(round.phase==='over'?`生存 ${round.time.toFixed(2)} 秒 · 最佳 ${records[0]?.toFixed(2) ?? '0.00'} 秒`:'承受三次撞击，第四次碎裂');
    start.setText(round.phase==='paused'?'继续':round.phase==='over'?'再来一次':'开始挑战');pause.setVisible(round.phase==='playing');
    board.forEach((node,i)=>node.setText(`${String(i+1).padStart(2,'0')}     ${records[i]===undefined?'--':records[i]!.toFixed(2)+' s'}`));
    hud.root.root.markDirty();world.update(now,dt*1000);
  });
  if(new URLSearchParams(location.search).has('verify'))Object.defineProperty(window,'__glassRush',{configurable:true,get:()=>({round:structuredClone(round),records:[...records],hud:hud.snapshot()})});
  engine.run();document.body.dataset.renderStatus='ready';
}
window.addEventListener('pagehide',event=>{if(event.persisted)return;disposed=true;lifetime.abort();clear();disposeGamepad();world.destroy();engine.destroy();restoreCapture();});
void boot().catch(error=>{world.destroy();engine.destroy();document.body.dataset.renderStatus='failed';const status=document.getElementById('status')!;status.hidden=false;status.textContent=`启动失败：${String(error)}`;console.error(error);});
