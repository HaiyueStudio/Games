import type {Action,Observation,Seat,Tile} from '../../rules/types';
import type {TargetRoute} from '../candidates/targets';
export interface CoachOptions {samples:number;horizon:number}
export const DEFAULT_COACH_OPTIONS:CoachOptions={samples:64,horizon:6};
export interface Interval {low:number;high:number}
export interface Forecast {
  method:'exact-waits'|'sampling';samples:number;wins:number;probability:number;interval:Interval|null;horizon:number;
  improved:number;improvementProbability:number;fans:Array<{name:string;fan:number;hits:number;probability:number}>;
}
export interface OpponentRead {seat:Seat;wind:string;pressure:number;level:'低'|'中'|'高';evidence:string[];patterns:Array<{name:string;confidence:'弱'|'中'|'强';reason:string}>;watch:Tile[];knownFan:string[]}
export interface TileDanger {tile:Tile;score:number;opponents:Array<{seat:Seat;score:number;reasons:string[]}>}
export interface CoachWait {tile:Tile;copies:number;selfFan:number|null;ronFan:number|null;fans:string[]}
export interface CoachCandidate {action:Action;followUpDiscard:Tile|null;shanten:number;ukeire:number;effective:Tile[];waits:CoachWait[];risk:number;value:number;reasons:string[];forecast:Forecast|null}
export interface FanRoute {name:string;fan:number;fit:'优先'|'备选';evidence:string;needs:Tile[];keyRequired:number;keyProbability:number|null;score:number}
export interface CoachReport {
  protocol:'haiyue.mcr.coach/1';key:string;revision:number;handIndex:number;roundWind:number;seat:Seat;stage:'基础'|'完成';
  mode:'进攻'|'攻守平衡'|'防守';summary:string;recommendation:Action|null;candidates:CoachCandidate[];routes:FanRoute[];
  opponents:OpponentRead[];danger:TileDanger[];assumptions:string[];horizon:number;samples:number;elapsedMs:number;
  learnedDanger?:Array<{tile:Tile;opponents:Array<{seat:Seat;probability:number;conditionalFan:number}>}>;targetRoutes?:TargetRoute[];targetHorizon?:number;
}
export interface CoachLog {id:number;handIndex:number;roundWind:number;revision:number;seat:Seat;kind:'建议'|'路线'|'防守'|'对手'|'试算'|'系统';text:string}
export type CoachJob={id:number;kind:'init';bytes:ArrayBuffer}|{id:number;kind:'analyze';observation:Observation;options:CoachOptions}|{id:number;kind:'cancel'};
export type CoachReply={id:number;kind:'ready'}|{id:number;kind:'report';report:CoachReport}|{id:number;kind:'progress';done:number;total:number}|{id:number;kind:'error';error:string};
