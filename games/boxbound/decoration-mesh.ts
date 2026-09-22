import {DecorationType,type DecorationKind} from './decorations';
import type {Vec} from './model';
export interface DecorationPart {offset:Vec;size:Vec;color:string;radius:number;shape:boolean|'cone';}
const p=(offset:Vec,size:Vec,color:string,radius=.08,shape:boolean|'cone'=false):DecorationPart=>({offset,size,color,radius,shape});
/** Shared by full-size and child-room views. One bevel step / eight-sided trunks. */
export const DECORATION_BEVEL_SEGMENTS=1;
export const DECORATION_RADIAL_SEGMENTS=8;
const meshes:Record<DecorationKind,DecorationPart[]>={
 [DecorationType.Rock]:[p([0,.29,0],[.78,.58,.68],'stoneTop',.18)],
 [DecorationType.Shrub]:[p([0,.3,0],[.7,.6,.68],'leaf',.23),p([.18,.58,.06],[.43,.43,.45],'mint',.2)],
 [DecorationType.RoundTree]:[p([0,.42,0],[.24,.84,.24],'wood',.025,true),p([-.08,1.19,0],[.86,.98,.85],'leaf',.36),p([.18,1.55,.04],[.58,.65,.65],'mint',.28),p([-.25,1.28,.31],[.12,.13,.12],'gold',.05)],
 [DecorationType.PineTree]:[p([0,.42,0],[.24,.84,.24],'wood',.025,true),p([0,.91,0],[.92,.91,.92],'leaf',0,'cone'),p([0,1.36,0],[.73,.86,.73],'mint',0,'cone'),p([0,1.76,0],[.5,.76,.5],'leaf',0,'cone')],
 [DecorationType.RedFriend]:[p([0,.44,0],[.76,.8,.76],'redFriend',.1),...[-.18,.18].flatMap(x=>[p([x,.54,.386],[.075,.1,.026],'ink',.018),p([x,.54,-.386],[.075,.1,.026],'ink',.018)]),p([0,.34,.39],[.14,.035,.025],'ink',.012)],
};
export const decorationParts=(kind:DecorationKind):readonly DecorationPart[]=>meshes[kind];
