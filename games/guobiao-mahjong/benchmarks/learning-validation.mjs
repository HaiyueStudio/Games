import {validateComparison} from './statistics.mjs';
/** Pure checks shared by training evidence and promotion decisions. */
export function validateLearningSplit(folds){
  const all=[];for(const name of ['train','calibration','test']){const values=folds?.[name];if(!Array.isArray(values)||!values.length||values.some(v=>!Number.isSafeInteger(v)||v<0||v>0xffffffff))throw Error('Invalid learning seed split');all.push(...values);}
  if(new Set(all).size!==all.length)throw Error('Learning seed leakage');return new Set(all);
}
export function binaryMetrics(probabilities,labels){
  if(probabilities.length!==labels.length||!labels.length||labels.some(v=>v!==0&&v!==1)||probabilities.some(p=>!Number.isFinite(p)||p<0||p>1))throw Error('Invalid risk metrics');
  let brier=0,loss=0,positives=0;for(let i=0;i<labels.length;i++){const p=Math.max(1e-8,Math.min(1-1e-8,probabilities[i])),y=labels[i];brier+=(p-y)**2;loss-=y*Math.log(p)+(1-y)*Math.log(1-p);positives+=y;}
  const order=probabilities.map((p,i)=>({p,y:labels[i]})).sort((a,b)=>a.p-b.p);let positiveRanks=0;for(let i=0;i<order.length;){let end=i+1;while(end<order.length&&order[end].p===order[i].p)end++;const rank=(i+1+end)/2;for(let j=i;j<end;j++)positiveRanks+=rank*order[j].y;i=end;}
  const negatives=labels.length-positives;return {rows:labels.length,positives,rate:positives/labels.length,brier:brier/labels.length,logLoss:loss/labels.length,auc:positives&&negatives?(positiveRanks-positives*(positives+1)/2)/(positives*negatives):null};
}
export function assessPromotion(report,trainingFolds,targetPolicy='kd-learned'){
  if(!['kd-learned','kd-value'].includes(targetPolicy))throw Error('Unknown learned promotion target');
  validateComparison(report.config);const used=validateLearningSplit(trainingFolds),reasons=[],expected=report.config.suites.length*report.config.seeds.length*(report.config.rotateSeats?4:1);
  if(report.schemaVersion!==1||report.expected!==expected||report.config.baseline!=='kd-safe'||!Array.isArray(report.summary)||report.summary.length!==report.config.suites.length)reasons.push('评测结构或基线不匹配');
  if(report.config.seeds.some(s=>used.has(s)))reasons.push('牌山与训练、校准或离线测试集重叠');
  if(report.config.seeds.length<4||!report.config.rotateSeats)reasons.push('独立牌山或换座样本不足');
  if(report.completed!==report.expected||!report.strict)reasons.push('评测未完整完成或不是严格模式');
  for(const suite of report.summary??[]){const p=suite.paired.find(p=>p.policy===targetPolicy),target=suite.rows.find(p=>p.policy===targetPolicy),base=suite.rows.find(p=>p.policy==='kd-safe');
    if(!suite.complete)reasons.push('子评测未完整完成');
    if(!p||!target||!base||suite.rows.some(p=>p.faults))reasons.push('缺少对照数据或存在算法故障');
    else{if(p.baseline!=='kd-safe'||!p.fanDelta95||!Number.isFinite(p.fanDelta95.low)||!Number.isFinite(p.fanDelta95.high)||p.fanDelta95.low<=0||p.fanDelta95.high<p.fanDelta95.low)reasons.push('累计番数改善区间未完全高于零');if(!Number.isFinite(target.averagePlace)||!Number.isFinite(base.averagePlace)||target.averagePlace>base.averagePlace)reasons.push('平均比赛名次变差');}
  }
  return {promote:reasons.length===0,reasons:[...new Set(reasons)]};
}
