import { SKY_SOUNDS, type SkySound } from './synthesis';
export interface SkyAudioPlay { channel: string; loop: boolean; gain: number; pan: number; priority: number }
export interface SkyAudioBackend {
  unlock(): void;
  play(id: SkySound, options: SkyAudioPlay): boolean;
  stop(channel?: string): void;
  setVolume(volume: number): void;
  suspend(): void;
  dispose(): void;
  snapshot(): unknown;
}
export interface AudioSettingsStorage {getItem(key:string):string|null;setItem(key:string,value:string):void}
export const SKY_AUDIO_SETTINGS_KEY='sky-strike.audio.v1';
/** Shared event policy, preferences and voice ownership. No audio side effects in combat rules. */
export class SkyStrikeAudio {
  enabled=true;
  volume=0.65;
  saveFailed=false;
  private active=false;
  private disposed=false;
  private clock=0;
  private sequence=0;
  private pendingClickUntil=-Infinity;
  private uiClicks=0;
  private clickSound: SkySound = 'ui-click';
  private readonly last=new Map<SkySound,number>();
  private readonly loops=new Set<string>();
  private readonly listeners=new Set<()=>void>();
  constructor(private readonly backend:SkyAudioBackend,private readonly storage?:AudioSettingsStorage) {
    try{const data=JSON.parse(storage?.getItem(SKY_AUDIO_SETTINGS_KEY)??'null');
      if(data&&typeof data.enabled==='boolean'&&Number.isFinite(data.volume)&&data.volume>=0&&data.volume<=1){this.enabled=data.enabled;this.volume=data.volume;}
    }catch{/* Optional settings cannot prevent startup. */}
    backend.setVolume(this.enabled?this.volume:0);
  }
  subscribe(listener:()=>void):()=>void {this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  settings(enabled:boolean,volume=this.volume):void {
    if(this.disposed)return;
    this.enabled=enabled;this.volume=Math.round(Math.max(0,Math.min(1,Number.isFinite(volume)?volume:this.volume))*100)/100;
    this.backend.setVolume(enabled?this.volume:0);if(!enabled||this.volume===0)this.stop();
    this.saveFailed=false;try{this.storage?.setItem(SKY_AUDIO_SETTINGS_KEY,JSON.stringify({enabled,volume:this.volume}));}catch{this.saveFailed=true;}
    for(const listener of this.listeners)listener();
  }
  unlock():void {if(!this.disposed)this.backend.unlock();}
  resume():void {if(this.disposed)return;this.active=true;this.last.clear();this.backend.unlock();}
  /** Explicit GUI activation works in menus/paused screens, never enables combat audio. */
  click(kind: 'forward' | 'back' = 'forward'):void {
    if(this.disposed||!this.enabled||this.volume===0)return;
    this.clickSound=kind==='back'?'ui-back':'ui-click';
    this.backend.unlock();this.pendingClickUntil=this.clock+160;
  }
  update(delta:number):void {
    if(Number.isFinite(delta))this.clock+=Math.max(0,delta);
    if(this.disposed||!this.enabled||this.volume===0||this.clock>this.pendingClickUntil)return;
    const definition=SKY_SOUNDS[this.clickSound];
    if(this.clock-(this.last.get('ui-click')??-Infinity)<definition.cooldown){this.pendingClickUntil=-Infinity;return;}
    if(this.backend.play(this.clickSound,{channel:'ui-click',loop:false,gain:definition.gain,pan:0,priority:definition.priority})){
      this.pendingClickUntil=-Infinity;this.last.set('ui-click',this.clock);this.uiClicks++;
    }
  }
  play(id:SkySound,x=240):void {
    if(!this.active||!this.enabled||this.volume===0||this.disposed)return;
    const definition=SKY_SOUNDS[id];if(this.clock-(this.last.get(id)??-Infinity)<definition.cooldown)return;
    if(this.backend.play(id,{channel:`sfx-${this.sequence++}`,loop:false,gain:definition.gain,pan:Math.max(-.65,Math.min(.65,(x-240)/370)),priority:definition.priority}))this.last.set(id,this.clock);
  }
  lasers(player:boolean,enemy:boolean,x=240):void {
    this.loop('player-laser','laser-loop',player,x,true);this.loop('enemy-laser','laser-enemy',enemy,240,false);
  }
  private loop(channel:string,id:SkySound,wanted:boolean,x:number,transients:boolean):void {
    const on=wanted&&this.active&&this.enabled&&this.volume>0&&!this.disposed;
    if(on&&!this.loops.has(channel)) {
      if(transients)this.play('laser-start',x);
      const definition=SKY_SOUNDS[id];
      if(this.backend.play(id,{channel,loop:true,gain:definition.gain,pan:Math.max(-.5,Math.min(.5,(x-240)/480)),priority:100}))this.loops.add(channel);
    }else if(!on&&this.loops.delete(channel)){this.backend.stop(channel);if(transients&&this.active)this.play('laser-end',x);}
  }
  stopLasers():void {for(const channel of this.loops)this.backend.stop(channel);this.loops.clear();}
  stop():void {this.pendingClickUntil=-Infinity;this.backend.stop();this.loops.clear();this.last.clear();}
  pause():void {this.active=false;this.stop();this.backend.suspend();}
  dispose():void {if(this.disposed)return;this.pause();this.disposed=true;this.listeners.clear();this.backend.dispose();}
  snapshot(){return {uiClicks:this.uiClicks,enabled:this.enabled,volume:this.volume,active:this.active,loops:this.loops.size,saveFailed:this.saveFailed,backend:this.backend.snapshot()};}
}
