import { World } from '@haiyue/engine';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { GameEngine } from '../session/GameEngine';
import { GlassHud, loadHudAssets } from './ui/GlassHud';
import { SingleSlotGameSave } from '../save/SingleSlotGameSave';
import { advance, createRound, isRecords, rank, type Records } from './rules/model';
import { Tunnel } from './rendering/Tunnel';
import { visualFixture } from './rendering/visualFixture';
import { GlassAudio } from './audio/GlassAudio';
import { GlassBrowserAudio } from './audio/BrowserAudio';
import { installGamepad } from '../gamepad/runtime';
import { guardQueuedPointerCapture } from '../shared/input/pointerCapture';

const canvas = document.querySelector('canvas')!;
const restoreCapture = guardQueuedPointerCapture(canvas);
const disposeGamepad = installGamepad('glass-rush');
const engine = new GameEngine({ canvas, msaaSamples: 4, devicePixelRatio: () => Math.min(devicePixelRatio || 1, 1.5) });
const world = new World('Glass Rush');
const save = new SingleSlotGameSave<Records>({ gameId: 'glass-rush', name: 'Glass Rush TOP 5', validateData: isRecords });
const lifetime = new AbortController();
const audioBackend = new GlassBrowserAudio();
const audio = new GlassAudio(audioBackend);
const query = new URLSearchParams(location.search);
const fixture = query.has('verify') ? visualFixture(query.get('scene'), query.get('shape')) : null;
const animatedFixture = fixture !== null && query.get('scene') === 'rotation';
let round = fixture ?? createRound(Number(query.get('seed') ?? 2026)), records: number[] = [], last: number | null = null, recorded = false, disposed = false;
const keys = new Set<string>(), pointers = new Map<number, number>();
const clear = () => { keys.clear(); pointers.clear(); };
function action(): void {
  clear();last = null;
  if(round.phase === 'playing') round.phase = 'paused';
  else if(round.phase === 'paused') round.phase = 'playing';
  else { round = createRound(Number(new URLSearchParams(location.search).get('seed') ?? Date.now())); round.phase = 'playing'; recorded = false; }
  if (round.phase === 'playing') audio.unlock(); else audio.pause();
}
async function boot(): Promise<void> {
  const [, saved,,assets] = await Promise.all([engine.init(), save.load(), audioBackend.load(lifetime.signal),loadHudAssets()]);if(disposed)return;records = fixture&&query.get('scene')==='menu'?[96.45,83.2,71.32,58.6,42.13]:saved?.times ?? [];
  const tunnel = new Tunnel(engine);await tunnel.init();if(disposed){tunnel.destroy();return;}world.addSystem(tunnel);
  const hud = new GlassHud(engine,world,assets,{action,toggleMusic:()=>audio.toggleMusic()});
  engine.resizeToDisplaySize();
  const resize = new ResizeObserver(() => engine.resizeToDisplaySize());resize.observe(canvas);world.addRuntimeIntegration({onDetach:()=>resize.disconnect()});
  const integration = new RenderIntegration(engine,{label:'Glass Rush shader + engine GUI'});world.addRuntimeIntegration(integration);integration.registerAll(world,system=>system===tunnel?{pass:'isolated',loadOp:'clear',depth:true,sort:0}:{pass:'isolated',loadOp:'load',depth:true,sort:10});
  window.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','KeyP','KeyM','Escape'].includes(e.code))e.preventDefault();if(e.repeat)return;if(e.code==='Space'||e.code==='Enter')action();else if(e.code==='KeyM')audio.toggleMusic();else if(e.code==='KeyP'||e.code==='Escape'){if(round.phase==='playing'||round.phase==='paused')action();}else keys.add(e.code);},{signal:lifetime.signal});
  window.addEventListener('keyup',e=>keys.delete(e.code),{signal:lifetime.signal});
  canvas.addEventListener('pointerdown',e=>{if(round.phase!=='playing'||hud.hit(e.clientX,e.clientY,canvas))return;const rect=canvas.getBoundingClientRect();pointers.set(e.pointerId,e.clientX<rect.left+rect.width/2?-1:1);canvas.setPointerCapture(e.pointerId);},{signal:lifetime.signal});
  canvas.addEventListener('pointermove',e=>{if(pointers.has(e.pointerId)){const rect=canvas.getBoundingClientRect();pointers.set(e.pointerId,e.clientX<rect.left+rect.width/2?-1:1);}},{signal:lifetime.signal});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>pointers.delete((e as PointerEvent).pointerId),{signal:lifetime.signal});
  const suspend=()=>{clear();last=null;if(round.phase==='playing')round.phase='paused';audio.pause();};
  window.addEventListener('blur',suspend,{signal:lifetime.signal});document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();},{signal:lifetime.signal});
  engine.on('update',event=>{
    const now=event.detail.time,dt=last===null?0:Math.min(.1,Math.max(0,(now-last)/1000));last=now;
    let direction=Number(keys.has('ArrowRight')||keys.has('ArrowDown'))-Number(keys.has('ArrowLeft')||keys.has('ArrowUp'));
    for(const side of pointers.values())direction+=side;
    // Camera rotation is opposite to the screen-space steering gesture.
    if (!fixture || animatedFixture) advance(round,dt,-Math.sign(direction));
    if (!fixture) audio.sync(round,dt);
    if(round.phase==='over'&&!recorded&&!fixture){recorded=true;records=rank(records,round.time);save.save({times:records});}
    tunnel.sync(round);hud.sync(round,records,audio.musicMuted,!fixture||query.get('scene')==='menu');
    world.update(now,dt*1000);
  });
  if(query.has('verify'))Object.defineProperty(window,'__glassRush',{configurable:true,get:()=>({round:structuredClone(round),records:[...records],hud:hud.snapshot(),ui:hud.state,rendering:tunnel.stats,audio:audio.snapshot()})});
  engine.run();document.body.dataset.renderStatus='ready';
}
window.addEventListener('pagehide',event=>{if(event.persisted)return;disposed=true;lifetime.abort();clear();audio.dispose();disposeGamepad();world.destroy();engine.destroy();restoreCapture();});
void boot().catch(error=>{audio.dispose();world.destroy();engine.destroy();document.body.dataset.renderStatus='failed';const status=document.getElementById('status')!;status.hidden=false;status.textContent=`启动失败：${String(error)}`;console.error(error);});
