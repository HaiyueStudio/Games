import { OwnerSafeAudioMixer } from '@haiyue/engine/experimental/audio';
import { sessionAudio } from '../../session/audio';
import { AUDIO_IDS,soundPath,type AudioId } from './sounds';

export interface PlayOptions {channel:string;gain:number;pan:number;priority:number;loop:boolean;rate:number}
export interface AudioBackend {
    unlock():void;suspend():void;play(id:AudioId,options:PlayOptions):boolean;
    stop(channel?:string):void;stopEffects():void;musicVolume(gain:number):void;
    dispose():void;snapshot():{state:string;error?:string|null;voices?:number;[key:string]:unknown};
}
/** All voice/node ownership, decoding and context teardown belong to the Engine. */
export class WhaleBrowserAudio implements AudioBackend {
    private readonly mixer=new OwnerSafeAudioMixer({contextFactory:()=>sessionAudio(new AudioContext({latencyHint:'interactive'})),maxVoicesTotal:16,maxVoicesPerOwner:16});
    private disposed=false;
    private desired=false;
    private job:Promise<void>|null=null;
    private error:string|null=null;
    private readonly channels=new Set<string>();
    constructor(){this.mixer.setMasterVolume(.66);}
    async load(signal:AbortSignal):Promise<void>{
        const results=await Promise.allSettled(AUDIO_IDS.map(async id=>{
            const response=await fetch(`./${soundPath(id)}`,{signal});if(!response.ok)throw Error(`Whale audio ${id}: HTTP ${response.status}`);
            const bytes=await response.arrayBuffer();if(!this.disposed&&!signal.aborted)await this.mixer.decodeAndInstall(id,bytes);
        }));
        const failed=results.find(r=>r.status==='rejected');if(!this.disposed&&!signal.aborted&&failed?.status==='rejected')this.error=String(failed.reason);
    }
    private settle():void{
        if(this.disposed||this.error||this.job)return;
        if(this.desired&&this.mixer.stats.state==='running'||!this.desired&&this.mixer.stats.state!=='running')return;
        this.job=(async()=>{
            let desired:boolean;do{desired=this.desired;if(desired)await this.mixer.unlock();else await this.mixer.suspend();}while(!this.disposed&&desired!==this.desired);
        })().catch(e=>{if(!this.disposed)this.error=String(e);}).finally(()=>{this.job=null;});
    }
    unlock():void{this.desired=true;this.settle();}
    suspend():void{this.desired=false;this.settle();}
    play(id:AudioId,o:PlayOptions):boolean{
        if(this.disposed||this.error||!this.desired||this.mixer.stats.state!=='running')return false;
        try{
            const voice=this.mixer.play({eventId:id,bufferId:id,owner:'whale-maker',channel:o.channel,bus:o.loop?'music':id==='click'||id==='edit'?'ui':'sfx',volume:o.gain,pan:o.pan,priority:o.priority,loop:o.loop,frequency:o.rate,replaceChannel:true,startTick:0});
            if(voice)this.channels.add(o.channel);return !!voice;
        }catch(e){if(e instanceof RangeError&&e.message.includes('voice budget'))return false;this.error=String(e);this.stop();return false;}
    }
    stop(channel?:string):void{if(this.disposed)return;this.mixer.stop('whale-maker',channel);if(channel)this.channels.delete(channel);else this.channels.clear();}
    stopEffects():void{for(const channel of [...this.channels])if(channel!=='music')this.stop(channel);}
    musicVolume(gain:number):void{if(!this.disposed)this.mixer.setBusVolume('music',gain);}
    snapshot(){return {kind:'engine-audio',error:this.error,...this.mixer.stats};}
    dispose():void{if(this.disposed)return;this.desired=false;this.channels.clear();this.disposed=true;this.mixer.dispose();}
}
