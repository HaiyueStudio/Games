import {WINDS,type Observation} from '../../rules/types';
import {coachingObservation,positionKey} from './publicAnalysis';
import {DEFAULT_COACH_OPTIONS,type CoachJob,type CoachReply,type CoachLog,type CoachReport,type CoachOptions} from './types';
export const COACH_LOG_LIMIT=400;
export interface CoachWorkerPort{onmessage:((e:MessageEvent<CoachReply>)=>void)|null;onerror:((e:ErrorEvent)=>void)|null;postMessage(job:CoachJob):void;terminate():void}
const percent=(n:number)=>`${(n*100).toFixed(n>0&&n<.01?1:0)}%`;
export class CoachSystem{
  private readonly bytes:ArrayBuffer;
  private readonly factory:()=>CoachWorkerPort;
  private readonly now:()=>number;
  private worker:CoachWorkerPort|null=null;private ready=false;private disposed=false;private failed=false;
  private serial=0;private initId=0;private active=0;private activeKey='';private lastKey='';private lastRevision=-1;private epoch=-1;private observed:Observation|null=null;
  private pendingObservation:Observation|null=null;private lastSent=-Infinity;private topics=new Map<string,string>();private nextLog=0;
  private options:CoachOptions={...DEFAULT_COACH_OPTIONS};private records:CoachLog[]=[];
  private current:CoachReport|null=null;private enabled=true;private _version=0;private _logVersion=0;private _busy=false;private _message='公开信息教练已开启';private starts=0;private dropped=0;
  constructor(bytes:ArrayBuffer,factory:()=>CoachWorkerPort=()=>new Worker(new URL('./ai/coach.worker.js',location.href),{type:'module',name:'mcr-coach'}),now=()=>performance.now()){this.bytes=bytes;this.factory=factory;this.now=now;}
  get version(){return this._version}get logVersion(){return this._logVersion}get busy(){return this._busy}get message(){return this._message}get automatic(){return this.enabled}get sampleCount(){return this.options.samples}get droppedEntries(){return this.dropped}
  get report(){return this.current}get logs():readonly CoachLog[]{return this.records}
  private cancel(){if(this.active)this.worker?.postMessage({id:this.active,kind:'cancel'});this.active=0;this.activeKey='';this._busy=false;this.pendingObservation=null;}
  private append(kind:CoachLog['kind'],text:string,o:Pick<Observation,'handIndex'|'roundWind'|'revision'|'seat'>,topic?:string){
    if(topic&&this.topics.get(topic)===text)return;if(topic)this.topics.set(topic,text);
    this.records.push({id:++this.nextLog,handIndex:o.handIndex,roundWind:o.roundWind,revision:o.revision,seat:o.seat,kind,text});
    if(this.records.length>COACH_LOG_LIMIT){this.dropped+=this.records.length-COACH_LOG_LIMIT;this.records.splice(0,this.records.length-COACH_LOG_LIMIT)}this._logVersion++;this._version++;
  }
  private accept(report:CoachReport){
    this.current=report;this._version++;
    this.append('建议',report.summary,report,'summary');
    if(report.candidates[0])this.append('建议',report.candidates[0].reasons.join('；'),report,'reasons');
    if(report.routes.length)this.append('路线',report.routes.slice(0,3).map(r=>`${r.fit} ${r.name}${r.fan}番：${r.evidence}${r.keyProbability===null?'':r.keyRequired===0?'；关键牌已齐，仍需完成其余面子':`；未来${report.horizon}次自摸补齐固定关键牌的条件概率 ${percent(r.keyProbability)}（不是胡牌率）`}`).join('；'),report,'routes');
    if(report.targetRoutes?.length)this.append('路线',`成牌搜索（未来${report.targetHorizon}次自摸，仅搜索有限改善路径）：`+report.targetRoutes.map(r=>`${r.fans.join('、')}；${r.selfFan===null?'自摸不足起胡':'自摸'+r.selfFan+'番'} / ${r.ronFan===null?'点和不足起胡':'点和'+r.ronFan+'番'}；待补${r.needs.map(tileName).join('、')}，收集条件概率${percent(r.collectionChance)}`).join('；')+'。各路线可重叠，不能相加；未计对手抢先和，不是实战胜率。',report,'targets');
    if(report.learnedDanger?.length)this.append('防守','模型估计的各家当前可胡机会：'+report.learnedDanger.map(d=>`打${tileName(d.tile)}：`+d.opponents.map(p=>`${report.opponents.find(o=>o.seat===p.seat)?.wind??''}家${percent(p.probability)}`).join('、')).join('；')+'。仅适用于训练牌谱分布的估计，各家相关，不能相加当作联合放铳概率。',report,'learned-risk');
    if(report.candidates.length>1)this.append('建议','备选比较：'+report.candidates.slice(1).map(c=>`${c.action.type==='discard'?'打'+tileName(c.action.tile!):c.action.type==='pass'?'过':'副露'}，${c.shanten}向听 / ${c.ukeire}张进张 / 风险${c.risk}分`).join('；'),report,'alternatives');
    for(const p of report.opponents)this.append('对手',`${p.wind}家 · 威胁${p.level}：${p.patterns.map(r=>`${r.name}（${r.confidence}信号）`).join('、')}。${[...p.evidence,...p.knownFan].join('；')}。${p.patterns.map(r=>r.reason).join('；')}。留意${p.watch.map(tileName).join('、')}，仅为公开信息推测。`,report,'opponent-'+p.seat);
    const danger=[...report.danger].sort((a,b)=>b.score-a.score),safe=[...report.danger].sort((a,b)=>a.score-b.score);
    if(danger[0])this.append('防守',`当前手牌重点慎打：${danger.slice(0,3).map(d=>`${tileName(d.tile)} ${d.score}分`).join('、')}；相对较低：${safe.slice(0,2).map(d=>`${tileName(d.tile)} ${d.score}分`).join('、')}。${danger[0].opponents[0]?.reasons.join('；')??''}。风险分不是放铳概率。`,report,'defense');
    if(report.stage==='完成'){
      const forecasts=report.candidates.filter(c=>c.forecast).map(c=>{const f=c.forecast!,name=c.action.type==='discard'?'打'+tileName(c.action.tile!):c.action.type==='pass'?'过':'副露';return `${name}：未来${f.horizon}次自摸，${f.method==='exact-waits'?'固定听口条件概率':'低向听策略抽样'} ${percent(f.probability)}${f.interval?`（95%区间 ${percent(f.interval.low)}–${percent(f.interval.high)}，${f.wins}/${f.samples}路成和）`:''}；${f.method==='sampling'?'向听改善 '+percent(f.improvementProbability)+'；':''}${f.fans.length?'成和番型 '+f.fans.map(v=>v.name+v.fan+'番（出现率'+percent(v.probability)+'）').join('、'):f.probability>0?'多种小番组合，完整番数以裁判为准':'本次未见对应成和样本，不能据此断言无机会'}`});
      if(forecasts.length)this.append('试算',forecasts.join('\n')+'\n番型出现率可重叠。仅按未知牌等可能试算，未计对手抢先和、后续吃碰与补花；不是整局胜率。',report,'forecast');
    }
  }
  /** No observe() calls or repeated work on idle frames; equivalent response passes are coalesced. */
  sync(o:Observation,epoch:number){
    if(this.disposed)return;
    if(this.epoch!==epoch||this.observed?.seat!==o.seat){this.cancel();this.epoch=epoch;this.lastKey='';this.lastRevision=-1;this.current=null;this.records=[];this.topics.clear();this.dropped=0;this._logVersion++;this._version++;}
    if(o.revision!==this.lastRevision||!this.observed){this.lastRevision=o.revision;const clean=coachingObservation(o),key=positionKey(clean);this.observed=clean;if(key!==this.lastKey){this.lastKey=key;this.current=null;this.cancel();this.pendingObservation=clean;this._message=this.enabled?'等待分析新局面':'自动分析已关闭';this._version++;}}
    if(this.enabled&&!this.failed&&this.pendingObservation&&this.now()-this.lastSent>=160)this.send();
  }
  private ensureWorker(){
    if(this.worker)return;const worker=this.worker=this.factory();this.ready=false;this.starts++;
    worker.onmessage=({data})=>{
      if(this.disposed||this.worker!==worker)return;
      if(data.kind==='ready'){this.ready=true;if(this.pendingObservation)this.send();return;}
      if(data.kind==='error'&&data.id===this.initId){this.fail(data.error);return}
      if(data.id!==this.active)return;
      if(data.kind==='error'){this.fail(data.error);return}
      if(data.kind==='progress'){this._message=`正在试算 ${data.done}/${data.total} 路`;this._version++;return;}
      if(data.kind==='report'&&data.report.key===this.activeKey){this.accept(data.report);this._message=data.report.stage==='完成'?`分析完成 · ${Math.round(data.report.elapsedMs)}毫秒`:'建议已生成，正在试算';if(data.report.stage==='完成'){this._busy=false;this.active=0}this._version++;}
    };
    worker.onerror=e=>{if(this.worker===worker)this.fail(e.message||'分析 Worker 异常')};
    this.initId=++this.serial;worker.postMessage({id:this.initId,kind:'init',bytes:this.bytes});
  }
  private send(){
    if(this.disposed||!this.pendingObservation)return;
    try{this.ensureWorker();if(!this.ready){this._busy=true;this._message='正在启动分析模块';return}
      const observation=this.pendingObservation;this.pendingObservation=null;this.lastSent=this.now();this.active=++this.serial;this.activeKey=positionKey(observation);this._busy=true;this._message='正在比较出牌、番型与风险';this._version++;
      this.worker!.postMessage({id:this.active,kind:'analyze',observation,options:{...this.options}});
    }catch(e){this.fail(String(e))}
  }
  private fail(message:string){this.cancel();this.failed=true;this._message='分析暂不可用：'+message;this._version++;if(this.observed)this.append('系统',this._message,this.observed);this.releaseWorker();}
  private releaseWorker(){const w=this.worker;this.worker=null;this.ready=false;if(w){w.onmessage=null;w.onerror=null;w.terminate()}}
  refresh(){if(this.disposed||!this.observed)return;this.cancel();this.failed=false;this.pendingObservation=coachingObservation(this.observed);this.send();}
  setEnabled(enabled:boolean){if(this.enabled===enabled)return;this.enabled=enabled;this._version++;if(!enabled){this.cancel();this.releaseWorker();this._message='自动分析已关闭'}else this.refresh();}
  setSamples(samples:number){if(!Number.isInteger(samples)||samples<16||samples>256)throw Error('分析参数无效');if(samples===this.options.samples)return;this.options={...this.options,samples};this.refresh();}
  clearLog(){this.records=[];this.dropped=0;this.topics.clear();this._logVersion++;this._version++;}
  exportLog(){return structuredClone({protocol:'haiyue.mcr.coach-log/1',perspective:this.observed?.seat??null,options:this.options,droppedEntries:this.dropped,assumptions:this.current?.assumptions??[],entries:this.records});}
  snapshot(){return {enabled:this.enabled,busy:this.busy,message:this.message,version:this.version,logVersion:this.logVersion,samples:this.options.samples,workerStarts:this.starts,liveWorkers:this.worker?1:0,droppedEntries:this.dropped,report:this.current?structuredClone(this.current):null,logs:this.records.map(v=>({...v}))};}
  dispose(){if(this.disposed)return;this.cancel();this.releaseWorker();this.disposed=true;this.records=[];this.current=null;this.observed=null;}
}
function tileName(tile:number){return tile<27?`${tile%9+1}${['万','条','筒'][Math.floor(tile/9)]}`:WINDS[tile-27]??['中','发','白'][tile-31]??'?'}
