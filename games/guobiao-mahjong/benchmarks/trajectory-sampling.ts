import type {Observation} from '../rules/types';
export type CaptureMode='uniform'|'critical-stratified'|'complete';
export interface CaptureSampling {version:2;stratum:'critical'|'ordinary';eligible:number;retained:number;probability:number}
/** Keep opportunities to decline a claim as well as claims actually taken. */
export function criticalDecision(o:Observation){return o.legalActions.some(a=>['chow','pung','kong','concealed-kong','add-kong'].includes(a.type));}
export class HandCapture<T extends {key:number;revision:number}> {
  readonly population={critical:0,ordinary:0};
  private readonly critical:T[]=[];
  private readonly ordinary:T[]=[];
  readonly mode:CaptureMode;
  readonly ordinaryLimit:number;
  constructor(mode:CaptureMode,ordinaryLimit:number){if(!['uniform','critical-stratified','complete'].includes(mode)||!Number.isInteger(ordinaryLimit)||ordinaryLimit<1||ordinaryLimit>16)throw Error('Invalid trajectory sampling');this.mode=mode;this.ordinaryLimit=ordinaryLimit;}
  add(o:Observation,row:T){
    if(!Number.isFinite(row.key)||row.key<0||row.key>=1)throw Error('Invalid trajectory sampling key');
    const stratum=this.mode!=='uniform'&&criticalDecision(o)?'critical':'ordinary';this.population[stratum]++;
    if(stratum==='critical')this.critical.push(row);
    else{this.ordinary.push(row);this.ordinary.sort((a,b)=>a.key-b.key||a.revision-b.revision);if(this.mode!=='complete')this.ordinary.splice(this.ordinaryLimit);}
  }
  rows(){return (['critical','ordinary'] as const).flatMap(stratum=>{const rows=this[stratum],eligible=this.population[stratum],retained=rows.length,probability=retained/eligible;return rows.map(row=>({...row,sampling:{version:2 as const,stratum,eligible,retained,probability},weight:1/probability}));}).sort((a,b)=>a.revision-b.revision);}
}
