import type { State } from '../rules/model';
import type { GameEvent } from '../rules/events';
import type { AudioBackend } from './BrowserAudio';
import { SOUNDS,MUSIC,type Sound } from './sounds';

export interface AudioScene {paused:boolean;editing:boolean;hidden:boolean;sessionPaused:boolean}
type Pending={id:Sound;pan:number;rate:number;expires:number};
/** Playback policy consumes semantic events without changing the simulation. */
export class WhaleAudio {
    musicEnabled=true;
    effectsEnabled=true;
    private disposed=false;
    private unlocked=false;
    private active=false;
    private music=false;
    private state:State|null=null;
    private cursor=0;
    private clock=0;
    private musicWanted=false;
    private pending:Pending[]=[];
    private readonly last=new Map<Sound,number>();
    private readonly played:Partial<Record<Sound,number>>={};
    private voiceIndex=0;
    private musicStarts=0;
    private readonly backend:AudioBackend;
    constructor(backend:AudioBackend){this.backend=backend;}
    unlock():void{if(this.disposed)return;this.unlocked=true;this.backend.unlock();}
    reset(s:State,preserveMusic=false):void{
        if(this.disposed)return;if(preserveMusic)this.backend.stopEffects();else{this.backend.stop();this.music=false;}this.state=s;this.cursor=s.eventSerial;this.pending=[];this.last.clear();
    }
    update(s:State,scene:AudioScene,dt:number):void{
        if(this.disposed)return;this.clock+=Math.max(0,Math.min(.1,dt));
        if(s!==this.state||s.eventSerial<this.cursor)this.reset(s);
        if(scene.paused||scene.hidden||scene.sessionPaused){this.suspend();this.cursor=s.eventSerial;return;}
        this.active=true;this.musicWanted=scene.editing||s.phase==='playing';
        if(this.unlocked)this.backend.unlock();
        this.backend.musicVolume(scene.editing?.6:1);
        this.syncMusic();this.events(s);this.flush();
    }
    events(s:State):void{
        if(this.disposed)return;
        if(s!==this.state||s.eventSerial<this.cursor){this.reset(s);return;}
        if(s.eventSerial===this.cursor){this.flush();return;}
        const events=s.events.filter(e=>e.serial>this.cursor);this.cursor=s.eventSerial;
        if(!this.active||!this.unlocked)return;
        const kinds=new Set(events.map(e=>e.kind));
        for(const event of events){
            if(kinds.has('death')&&event.kind!=='death')continue;
            if(kinds.has('pow')&&event.kind==='defeat'||kinds.has('break')&&event.kind==='bump')continue;
            if(event.kind==='death'||event.kind==='goal'){this.musicWanted=false;this.stopMusic();}
            if(event.kind==='victory')this.stopMusic();
            this.enqueue(event,s);
        }
        this.flush();
    }
    private enqueue(event:GameEvent,s:State):void{
        const global=['power','star','checkpoint','key','hurt','death','goal','victory'].includes(event.kind),center=s.view.x+s.view.w/2;
        if(!global&&Math.abs(event.x-center)>s.view.w/2+4)return;
        this.queue(event.kind,global?0:Math.max(-.65,Math.min(.65,(event.x-center)/(s.view.w/2))),['step','stomp','defeat','coin'].includes(event.kind)?1+(event.serial%3-1)*.025:1);
    }
    click():void{if(!this.disposed){this.unlock();this.queue('click',0,1);if(this.active)this.flush();}}
    edit():void{if(!this.disposed)this.queue('edit',0,1);}
    private queue(id:Sound,pan:number,rate:number):void{
        if(!this.effectsEnabled||!this.unlocked||this.clock-(this.last.get(id)??-Infinity)<SOUNDS[id].cooldown||this.pending.some(p=>p.id===id))return;
        this.pending.push({id,pan,rate,expires:this.clock+.2});this.pending=this.pending.slice(-24);
    }
    private flush():void{
        if(!this.pending.length)return;
        if(!this.active||!this.effectsEnabled){this.pending=[];return;}
        const waiting:Pending[]=[];
        for(const p of this.pending){
            if(this.clock>p.expires)continue;
            const def=SOUNDS[p.id],channel=p.id==='click'||p.id==='edit'?'ui':p.id==='death'||p.id==='victory'||p.id==='goal'?'jingle':`fx-${this.voiceIndex%12}`;
            if(this.backend.play(p.id,{channel,gain:def.gain,pan:p.pan,priority:def.priority,loop:false,rate:p.rate})){
                this.last.set(p.id,this.clock);this.played[p.id]=(this.played[p.id]??0)+1;this.voiceIndex++;
            }else waiting.push(p);
        }
        this.pending=waiting;
    }
    private syncMusic():void{
        if(!this.musicEnabled||!this.musicWanted){this.stopMusic();return;}
        if(!this.music&&this.active&&this.unlocked&&this.backend.play(MUSIC.id,{channel:'music',gain:MUSIC.gain,pan:0,priority:100,loop:true,rate:1})){
            this.music=true;this.musicStarts++;
        }
    }
    private stopMusic():void{if(this.music){this.backend.stop('music');this.music=false;}}
    toggleMusic():void{if(this.disposed)return;this.musicEnabled=!this.musicEnabled;this.syncMusic();}
    toggleEffects():void{if(this.disposed)return;this.effectsEnabled=!this.effectsEnabled;if(!this.effectsEnabled){this.pending=[];this.backend.stopEffects();}}
    suspend():void{if(this.disposed)return;this.active=false;this.pending=[];this.backend.stopEffects();this.backend.suspend();}
    snapshot(){const backend=this.backend.snapshot();return {active:this.active,unlocked:this.unlocked,musicEnabled:this.musicEnabled,effectsEnabled:this.effectsEnabled,musicVoice:this.music,musicPlaying:this.music&&this.active&&backend.state==='running',musicStarts:this.musicStarts,played:{...this.played},pending:this.pending.length,backend};}
    dispose():void{if(this.disposed)return;this.suspend();this.disposed=true;this.music=false;this.backend.dispose();}
}
