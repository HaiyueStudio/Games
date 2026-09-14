import {NEON_SOUNDS,type NeonSound} from './Sounds';
export interface NeonAudioPlay {channel:string;loop:boolean;gain:number;pan:number;priority:number}
export interface NeonAudioBackend {
  unlock():void; play(id:NeonSound,options:NeonAudioPlay):boolean;
  setChannelGain(channel:string,gain:number):void; stop(channel?:string):void;
  setVolume(volume:number):void; suspend():void; dispose():void; snapshot():unknown;
}
/** Presentation-only event policy, shared by Web Audio and native PCM playback. */
export class NeonAudio {
  private clock=0;
  private disposed=false;
  private level=0;
  private music=false;
  private braking=false;
  private lastCountdown:string|null=null;
  private readonly loops=new Set<NeonSound>();
  private readonly last=new Map<NeonSound,number>();
  private readonly pending=new Map<NeonSound,{until:number;strength:number;pan:number}>();
  private readonly played:Partial<Record<NeonSound,number>>={};
  constructor(private readonly backend:NeonAudioBackend){backend.setVolume(.68);}
  unlock():void {if(!this.disposed)this.backend.unlock();}
  cue(id:NeonSound,strength=1,pan=0):void {
    if(this.disposed||this.clock-(this.last.get(id)??-Infinity)<NEON_SOUNDS[id].cooldown)return;
    this.pending.set(id,{until:this.clock+.2,strength:Math.max(.15,Math.min(1,strength)),pan:Math.max(-.6,Math.min(.6,pan))});
  }
  click():void {this.unlock();this.cue('click');}
  course():void {this.unlock();this.cue('course');}
  countdown(value:'3'|'2'|'1'|'GO'):void {
    if(value===this.lastCountdown)return;this.lastCountdown=value;
    this.cue(value==='GO'?'go':`count-${value}`);
  }
  beginRace():void {this.stopDrive();this.lastCountdown=null;for(const id of ['count-3','count-2','count-1','go'] as const)this.last.delete(id);}
  update(seconds:number,racing:boolean,throttle:boolean,speedRatio:number,brake=false):void {
    if(this.disposed)return;
    const dt=Number.isFinite(seconds)?Math.max(0,Math.min(.1,seconds)):0;this.clock+=dt;
    const braking=racing&&brake&&speedRatio>.025;
    if(braking&&!this.braking)this.cue('brake',Math.min(1,.4+speedRatio));
    this.braking=braking;
    for(const [id,request] of this.pending){
      if(this.clock>request.until){this.pending.delete(id);continue;}
      if(this.backend.play(id,{channel:id,loop:false,gain:NEON_SOUNDS[id].gain*request.strength,pan:request.pan,priority:id==='rail'?50:30})){
        this.pending.delete(id);this.last.set(id,this.clock);this.played[id]=(this.played[id]??0)+1;
      }
    }
    if(!racing){this.stopEngine();this.stopMusic();return;}
    if(!this.music&&this.backend.play('music',{channel:'music',loop:true,gain:NEON_SOUNDS.music.gain,pan:0,priority:100})){this.music=true;this.played.music=(this.played.music??0)+1;}
    this.level+=((throttle?1:0)-this.level)*(1-Math.exp(-dt*(throttle?9:5)));
    if(this.level<.005&&!throttle){this.stopEngine();return;}
    const ratio=Math.max(0,Math.min(1,Number.isFinite(speedRatio)?speedRatio:0));
    const blend=ratio*ratio*(3-2*ratio);
    for(const id of ['engine-low','engine-high'] as const){
      const gain=this.level*NEON_SOUNDS[id].gain*(id==='engine-low'?Math.cos(blend*Math.PI/2):Math.sin(blend*Math.PI/2));
      if(!this.loops.has(id)&&this.backend.play(id,{channel:id,loop:true,gain,pan:0,priority:100})){this.loops.add(id);this.played[id]=(this.played[id]??0)+1;}
      this.backend.setChannelGain(id,gain);
    }
  }
  private stopEngine():void {for(const id of this.loops)this.backend.stop(id);this.loops.clear();this.level=0;}
  private stopMusic():void {if(this.music)this.backend.stop('music');this.music=false;}
  stopDrive():void {this.stopEngine();this.stopMusic();this.braking=false;for(const id of ['rail','boost','brake','lap','record','count-3','count-2','count-1','go'] as const){this.pending.delete(id);this.backend.stop(id);}}
  suspend():void {this.stopDrive();this.pending.clear();this.backend.suspend();}
  dispose():void {if(this.disposed)return;this.suspend();this.disposed=true;this.backend.dispose();}
  snapshot(){return {played:{...this.played},musicPlaying:this.music,engineLevel:this.level,loops:this.loops.size,pending:this.pending.size,backend:this.backend.snapshot()};}
}
