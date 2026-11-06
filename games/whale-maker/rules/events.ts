import type { State } from './model';
export type GameEventKind='jump'|'spin'|'land'|'step'|'skid'|'coin'|'bump'|'break'|'reward'|'power'|'star'|'fire'|'hit'|'stomp'|'defeat'|'kick'|'grab'|'throw'|'spring'|'splash'|'swim'|'pipe'|'door'|'checkpoint'|'switch'|'key'|'metal'|'pow'|'stone'|'cannon'|'ice'|'hurt'|'death'|'goal'|'victory';
export interface GameEvent { serial:number;kind:GameEventKind;x:number;time:number }
/** Bounded semantic notifications. Rules never access a browser or audio clock. */
export function emit(s:State,kind:GameEventKind,x=s.player.x+s.player.w/2):void {
    s.events.push({serial:++s.eventSerial,kind,x,time:s.time});
    if(s.events.length>64)s.events.splice(0,s.events.length-64);
}
