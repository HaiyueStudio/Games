import {OwnerSafeAudioMixer} from '@haiyue/engine/experimental/audio';
import {NEON_SOUND_IDS,soundPath,type NeonSound} from './Sounds';
import type {NeonAudioBackend,NeonAudioPlay} from './NeonAudio';
/** Public experimental Engine mixer; two owned buses crossfade the engine registers. */
export class NeonBrowserAudio implements NeonAudioBackend {
  private readonly mixer=new OwnerSafeAudioMixer({maxVoicesTotal:10,maxVoicesPerOwner:10});
  private error:string|null=null;
  private disposed=false;
  private active=false;
  private job:Promise<void>|null=null;
  async load():Promise<void>{try{await Promise.all(NEON_SOUND_IDS.map(async id=>{
    const response=await fetch(`./${soundPath(id)}`);if(!response.ok)throw new Error(`Missing sound ${id}`);
    await this.mixer.decodeAndInstall(id,await response.arrayBuffer());
  }));}catch(e){this.error=String(e);}}
  unlock():void{
    if(this.disposed||this.error)return;this.active=true;if(this.job)return;
    this.job=this.mixer.unlock().catch(e=>{this.error=String(e);}).finally(()=>{this.job=null;if(!this.active&&!this.disposed)void this.mixer.suspend().catch(()=>{});});
  }
  play(id:NeonSound,o:NeonAudioPlay):boolean{
    if(this.disposed||this.error||this.mixer.stats.state!=='running')return false;
    const bus=id==='engine-low'?'music':id==='engine-high'?'ui':'sfx';
    const engine=id.startsWith('engine-');
    try{if(engine)this.setChannelGain(o.channel,o.gain);
      return !!this.mixer.play({eventId:o.channel,bufferId:id,owner:'neon-circuit',channel:o.channel,bus,priority:o.priority,
        loop:o.loop,volume:engine?1:o.gain,pan:o.pan,replaceChannel:true,startTick:0});
    }catch(e){if(e instanceof RangeError&&e.message.includes('voice budget'))return false;this.error=String(e);return false;}
  }
  setChannelGain(channel:string,gain:number):void {if(!this.disposed)this.mixer.setBusVolume(channel==='engine-low'?'music':'ui',gain);}
  stop(channel?:string):void {if(!this.disposed)this.mixer.stop('neon-circuit',channel);}
  setVolume(gain:number):void {this.mixer.setMasterVolume(gain*.6);}
  suspend():void {this.active=false;this.stop();if(!this.disposed)void this.mixer.suspend().then(()=>{if(this.active&&!this.disposed)this.unlock();}).catch(e=>{this.error=String(e);});}
  dispose():void {if(this.disposed)return;this.active=false;this.disposed=true;this.mixer.dispose();}
  snapshot(){return {kind:'web-audio',error:this.error,...this.mixer.stats};}
}
