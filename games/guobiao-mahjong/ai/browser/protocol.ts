import type {JointGuardDiagnostic} from '../joint/model';
import type {Action,Observation} from '../../rules/types';
import type {BrowserBackend,BrowserParameters} from './catalog';
import type {HybridProfile} from '../hybrid';
export interface BrowserInfo {
  requestedBackend:BrowserBackend;actualBackend:BrowserBackend|null;fallback:boolean;state:'idle'|'loading'|'ready'|'running'|'failed';
  message:string;loadedModels:number[];inferenceMs:number|null;networkBytes:number;cacheHits:number;numTensors:number;tensorBytes:number;
  enhancement:HybridProfile|null;enhancementChanged:boolean;decisionReason:string|null;analysisCalls:number;searchMs:number|null;originalValueLoaded:boolean;jointModelLoaded:boolean;jointModelBytes:number;jointGuard:JointGuardDiagnostic|null;
}
export interface BrowserJob {id:number;kind:'prepare'|'decide'|'policies';backend:BrowserBackend;models:string[];observation?:Observation;observations?:Observation[];parameters?:BrowserParameters;enhancement?:HybridProfile;includePolicy?:boolean;policyContext?:string}
export interface PolicyRow {action:Action;revision:number;probabilities:number[]}
export interface BrowserReply {id:number;kind:'progress'|'result'|'error';info:BrowserInfo;action?:Action;revision?:number;error?:string;policy?:number[];priorPolicy?:number[];rows?:PolicyRow[]}
export function initialBrowserInfo(backend:BrowserBackend):BrowserInfo{return {requestedBackend:backend,actualBackend:null,fallback:false,state:'idle',message:'浏览器模型就绪，按需加载',loadedModels:[],inferenceMs:null,networkBytes:0,cacheHits:0,numTensors:0,tensorBytes:0,enhancement:null,enhancementChanged:false,decisionReason:null,analysisCalls:0,searchMs:null,originalValueLoaded:false,jointModelLoaded:false,jointModelBytes:0,jointGuard:null};}
