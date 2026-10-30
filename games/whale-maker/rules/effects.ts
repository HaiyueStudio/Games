import type {Body,State} from './model';
import {emit} from './events';

export interface Effect extends Body { kind:'fire'|'ice'|'frost'|'helmet'|'stone'|'wood'|'blast'|'snow'|'cactus';age:number;headgear?:import('./player-equipment').ShellHelmet }
export function effect(s:State,kind:Effect['kind'],x:number,y:number,vx=0,vy=0):void {
    emit(s,kind==='fire'?'hit':kind==='ice'?'ice':kind==='helmet'?'metal':'break',x);
    s.effects.push({kind,x,y,w:kind==='ice'?1:.4,h:kind==='ice'?1:.4,vx,vy,age:0});s.effects=s.effects.slice(-64);
}
