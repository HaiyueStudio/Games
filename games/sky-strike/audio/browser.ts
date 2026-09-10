import {OwnerSafeAudioMixer} from '@haiyue/engine/experimental/audio';
import {SKY_SOUND_IDS,soundPath,type SkySound} from './synthesis';
import type {SkyAudioBackend,SkyAudioPlay} from './SkyStrikeAudio';
/** Uses the Engine's public mixer; context unlock happens directly in a user gesture. */
export class SkyStrikeBrowserAudio implements SkyAudioBackend {
  private readonly mixer=new OwnerSafeAudioMixer({maxVoicesTotal:12,maxVoicesPerOwner:12});
  private error:string|null=null;
  private disposed=false;
  private wantsRunning=false;
  private unlockJob:Promise<void>|null=null;
  async load(prefix=''):Promise<void> {
    try{await Promise.all(SKY_SOUND_IDS.map(async id=>{const response=await fetch(prefix+soundPath(id));if(!response.ok)throw new Error(`Missing audio: ${id}`);await this.mixer.decodeAndInstall(id,await response.arrayBuffer());}));}
    catch(error){this.error=String(error);}
  }
  unlock():void {
    if(this.disposed||this.error)return;this.wantsRunning=true;
    if(this.unlockJob)return;
    this.unlockJob=this.mixer.unlock().catch(error=>{if(!this.disposed)this.error=String(error);}).finally(()=>{
      this.unlockJob=null;if(!this.disposed&&!this.wantsRunning)void this.mixer.suspend().catch(()=>{});
    });
  }
  play(id:SkySound,options:SkyAudioPlay):boolean {
    if(this.disposed||this.error||this.mixer.stats.state!=='running')return false;
    try { return !!this.mixer.play({eventId:options.channel,bufferId:id,owner:'sky-strike',channel:options.channel,bus:'sfx',
      priority:options.priority,loop:options.loop,volume:options.gain,pan:options.pan,replaceChannel:true,startTick:0}); }
    catch(error){if(error instanceof RangeError && error.message.includes('voice budget'))return false;this.error=String(error);this.stop();return false;}
  }
  stop(channel?:string):void {if(!this.disposed)this.mixer.stop('sky-strike',channel);}
  setVolume(volume:number):void {if(!this.disposed)this.mixer.setMasterVolume(volume*0.6);}
  suspend():void {if(this.disposed)return;this.wantsRunning=false;this.stop();void this.mixer.suspend().then(()=>{if(this.wantsRunning&&!this.disposed)this.unlock();}).catch(error=>{if(!this.disposed)this.error=String(error);});}
  dispose():void {if(this.disposed)return;this.suspend();this.disposed=true;this.mixer.dispose();}
  snapshot(){return {kind:'web-audio',error:this.error,...this.mixer.stats};}
}
