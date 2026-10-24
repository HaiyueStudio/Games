import { Entity, HaiyueEngine, World } from '@haiyue/engine';
import { GuiSystem } from '@haiyue/engine/gui';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { LauncherActivity } from './activity';
import { Aurora } from './Aurora';
import { DesktopGui } from './DesktopGui';

export class GameOS {
  private readonly engine:HaiyueEngine;
  private readonly world=new World('Game OS desktop');
  private readonly abort=new AbortController();
  private readonly activity:LauncherActivity;
  private readonly desktop=new DesktopGui(()=>this.invalidate());
  private readonly resize:ResizeObserver;
  private readonly mutation:MutationObserver;
  private readonly motion=matchMedia('(prefers-reduced-motion: reduce)');
  private dirty=true;
  private frames=0;
  private firstFrame=true;
  private aurora!:Aurora;
  private last:number|null=null;
  private disposed=false;
  constructor(private readonly canvas:HTMLCanvasElement){
    this.engine=new HaiyueEngine({canvas,msaaSamples:4,devicePixelRatio:()=>Math.min(devicePixelRatio||1,1.5)});
    this.activity=new LauncherActivity({start:()=>{this.engine.resizeToDisplaySize();this.last=null;this.engine.run();},stop:()=>{this.engine.stop();this.last=null;}});
    this.resize=new ResizeObserver(()=>{if(this.activity.running)this.engine.resizeToDisplaySize();this.invalidate();});
    this.mutation=new MutationObserver(()=>this.invalidate());
    for(const element of document.querySelectorAll('.system-bar,.desktop,.command-bar'))this.mutation.observe(element,{subtree:true,childList:true,attributes:true,characterData:true});
    const options={signal:this.abort.signal};
    for(const event of ['input','focusin','focusout','pointerover','pointerout'])document.addEventListener(event,()=>this.invalidate(),options);
    document.addEventListener('scroll',()=>this.invalidate(),{...options,capture:true,passive:true});
    document.addEventListener('load',()=>this.invalidate(),{...options,capture:true});
    document.addEventListener('visibilitychange',()=>{this.activity.update({hidden:document.hidden});this.invalidate();},options);
    this.motion.addEventListener('change',()=>this.invalidate(),options);
    window.addEventListener('pagehide',event=>{if(event.persisted)this.activity.update({suspended:true});else this.destroy();},options);
    window.addEventListener('pageshow',()=>{this.activity.update({suspended:false,hidden:document.hidden});this.invalidate();},options);
  }
  async init(catalogText=''):Promise<void>{
    await this.engine.init();if(this.disposed)return;
    this.aurora=new Aurora(this.engine);await this.aurora.init();if(this.disposed){this.aurora.destroy();return;}
    // Build one atlas covering the complete catalog, all descriptions, and input glyphs.
    const ascii=Array.from({length:95},(_,i)=>String.fromCharCode(32+i)).join('');
    const chars=[...new Set((document.body.textContent??'')+catalogText+'▦◷♡⌕＋→↗◇…'+ascii)].join('');
    const gui=new GuiSystem(this.engine,{preventDefault:false,font:{chars,fontSize:40,fontFamily:'Microsoft YaHei, Segoe UI, sans-serif',atlasSize:2048}});
    this.world.addEntity(new Entity('Desktop panels').addComponent(this.desktop.backdrop));
    this.world.addEntity(new Entity('Desktop covers').addComponent(this.desktop.covers));
    this.world.addEntity(new Entity('Desktop controls').addComponent(this.desktop.root));this.world.addSystem(this.aurora);this.world.addSystem(gui);
    const integration=new RenderIntegration(this.engine,{label:'Game OS wallpaper + GUI'});this.world.addRuntimeIntegration(integration);
    integration.registerAll(this.world,system=>system===this.aurora?{pass:'isolated',loadOp:'clear',depth:false,sort:0}:{pass:'isolated',loadOp:'load',depth:true,sort:10});
    this.engine.on('update',event=>{
      if(this.disposed||!this.activity.running)return;
      const now=event.detail.time,dt=this.last===null?0:Math.min(.1,Math.max(0,(now-this.last)/1000));this.last=now;
      this.aurora.motion=!this.motion.matches;this.aurora.time+=dt;
      if(this.dirty){this.desktop.sync(this.engine.displayWidth,this.engine.displayHeight);this.dirty=false;}
      this.world.update(now,dt*1000);this.frames++;
      if(this.firstFrame){this.firstFrame=false;document.body.dataset.osReady='true';}
    });
    this.engine.resizeToDisplaySize();this.resize.observe(this.canvas);
    this.activity.update({ready:true,hidden:document.hidden});
    if(new URLSearchParams(location.search).has('verify'))Object.defineProperty(window,'__gameOS',{configurable:true,get:()=>this.snapshot()});
  }
  setPlaying(playing:boolean):void {this.activity.update({playing});if(!playing)this.invalidate();document.body.dataset.osPaused=String(playing);}
  private invalidate():void {if(!this.disposed)this.dirty=true;}
  snapshot(){return {ready:this.activity.ready,running:this.activity.running,playing:this.activity.playing,hidden:this.activity.hidden,frames:this.frames,time:this.aurora?.time??0,...this.desktop.snapshot()};}
  destroy():void {if(this.disposed)return;this.disposed=true;this.activity.destroy();this.abort.abort();this.resize.disconnect();this.mutation.disconnect();this.desktop.destroy();this.world.destroy();this.engine.destroy();delete document.body.dataset.osReady;}
}
