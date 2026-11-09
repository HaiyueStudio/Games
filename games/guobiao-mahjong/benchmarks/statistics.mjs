export function validateComparison(config){
  if(config.schemaVersion!==1||!Array.isArray(config.seeds)||!config.seeds.length||new Set(config.seeds).size!==config.seeds.length||config.seeds.some(n=>!Number.isSafeInteger(n)||n<0||n>0xffffffff))throw Error('Expected unique uint32 seeds.');
  if(!Number.isInteger(config.concurrency)||config.concurrency<1||config.concurrency>4||typeof config.rotateSeats!=='boolean')throw Error('Invalid concurrency/rotation.');
  if(!Array.isArray(config.suites)||!config.suites.length||new Set(config.suites.map(s=>s.id)).size!==config.suites.length)throw Error('Expected distinct suites.');
  const allowed=['v1','v2','builtin-reference','builtin-v3','builtin-tactical','builtin-no-replacement','builtin-no-rob-kong','builtin-no-eight-fan','kd-s0','kd-s1','kd-s2','kdens3','kd-safe','kd-ready','kd-search','kd-learned','kd-value','kd-value-v1','kd-distilled','kd-teacher','kd-student-fp32','kd-student-fp16'];
  for(const s of config.suites)if(!/^[a-z0-9-]+$/.test(s.id)||!Array.isArray(s.agents)||s.agents.length!==4||s.agents.some(a=>!allowed.includes(a)))throw Error('Invalid suite/agent.');
  if(config.baseline!==undefined&&(!allowed.includes(config.baseline)||config.suites.some(s=>!s.agents.includes(config.baseline))))throw Error('Baseline must appear in every suite.');
  if(config.parallelProcesses!==undefined&&typeof config.parallelProcesses!=='boolean'||config.enhancedMetrics!==undefined&&typeof config.enhancedMetrics!=='boolean'||config.renderTable!==undefined&&typeof config.renderTable!=='boolean')throw Error('Invalid comparison switches.');
  if(config.depth!==undefined&&![1,2].includes(config.depth))throw Error('Depth must be 1 or 2.');
  if(config.batchMatches!==undefined&&(!Number.isInteger(config.batchMatches)||config.batchMatches<1||config.batchMatches>8||config.concurrency!==1||config.suites.some(s=>s.agents.some(p=>!['kd-s0','kd-safe','kd-learned','kd-value','kd-value-v1','kd-distilled','kd-teacher','kd-student-fp32','kd-student-fp16'].includes(p)))))throw Error('Invalid batched match configuration.');
}
function aggregateReasons(seats){const result={};for(const s of seats)for(const[k,v]of Object.entries(s.reasonCounts??{}))result[k]=(result[k]??0)+v;return Object.fromEntries(Object.entries(result).sort(([a],[b])=>a.localeCompare(b)))}
export const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
export function percentile(values,q){if(!values.length)return 0;const s=[...values].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor(q*s.length))]}
/** Resample whole seed blocks: seats and the sixteen dependent hands never inflate the sample size. */
export function seedInterval(values,draws=10000){
  if(values.length<2)return null;let state=0x51a7c0de;const samples=[];
  for(let i=0;i<draws;i++){let sum=0;for(let j=0;j<values.length;j++){state^=state<<13;state^=state>>>17;state^=state<<5;sum+=values[(state>>>0)%values.length]}samples.push(sum/values.length)}
  return {low:percentile(samples,.025),high:percentile(samples,.975),method:'seed-block bootstrap',blocks:values.length,draws};
}
export function summarizeComparison(records,config){
  return config.suites.map(suite=>{
    const games=records.filter(r=>r.suite===suite.id),policies=[...new Set(suite.agents)],rows=policies.map(policy=>{
      const seats=games.flatMap(g=>g.seats.filter(s=>s.policy===policy).map(s=>({...s,seed:g.seed}))),hands=seats.reduce((n,s)=>n+s.hands,0),latency=seats.flatMap(s=>s.latencyMs);
      return {policy,seatGames:seats.length,hands,firstPlaceCredit:mean(seats.map(s=>s.firstPlaceCredit??(s.place===1?1:0))),placeDistribution:[1,2,3,4].map(rank=>mean(seats.map(s=>s.placeDistribution?.[rank-1]??+(s.place===rank)))),fan:seats.reduce((n,s)=>n+s.fan,0),fanPerHand:seats.reduce((n,s)=>n+s.fan,0)/Math.max(1,hands),scorePerHand:seats.reduce((n,s)=>n+s.score,0)/Math.max(1,hands),winRate:seats.reduce((n,s)=>n+s.wins,0)/Math.max(1,hands),dealInRate:seats.reduce((n,s)=>n+s.dealIns,0)/Math.max(1,hands),averagePlace:mean(seats.map(s=>s.place)),decisions:latency.length,choiceMsP50:percentile(latency,.5),choiceMsP95:percentile(latency,.95),forced:seats.reduce((n,s)=>n+s.forced,0),missedHu:seats.reduce((n,s)=>n+s.missedHu,0),unqualifiedReady:seats.reduce((n,s)=>n+s.unqualifiedReady,0),faults:seats.reduce((n,s)=>n+s.faults,0),...(config.enhancedMetrics?{enhancements:seats.reduce((n,s)=>n+(s.enhancements??0),0),reasonCounts:aggregateReasons(seats)}:{})};
    });
    const baseline=config.baseline??'v1',paired=policies.filter(p=>p!==baseline).map(policy=>{
      const deltas=config.seeds.flatMap(seed=>{const group=games.filter(g=>g.seed===seed),target=group.flatMap(g=>g.seats.filter(s=>s.policy===policy)),base=group.flatMap(g=>g.seats.filter(s=>s.policy===baseline));if(!target.length||!base.length)return [];return [{seed,firstPlace:mean(target.map(s=>s.firstPlaceCredit??+(s.place===1)))-mean(base.map(s=>s.firstPlaceCredit??+(s.place===1))),place:mean(target.map(s=>s.place))-mean(base.map(s=>s.place)),fan:mean(target.map(s=>s.fan/s.hands))-mean(base.map(s=>s.fan/s.hands)),score:mean(target.map(s=>s.score/s.hands))-mean(base.map(s=>s.score/s.hands))}]});
      return {policy,baseline,firstPlaceDelta:mean(deltas.map(d=>d.firstPlace)),firstPlaceDelta95:seedInterval(deltas.map(d=>d.firstPlace)),averagePlaceDelta:mean(deltas.map(d=>d.place)),averagePlaceDelta95:seedInterval(deltas.map(d=>d.place)),fanDeltaPerHand:mean(deltas.map(d=>d.fan)),fanDelta95:seedInterval(deltas.map(d=>d.fan)),scoreDeltaPerHand:mean(deltas.map(d=>d.score)),scoreDelta95:seedInterval(deltas.map(d=>d.score)),seedDeltas:deltas};
    });
    return {id:suite.id,complete:games.length===config.seeds.length*(config.rotateSeats?4:1),matches:games.length,hands:games.length*16,drawRate:games.reduce((n,g)=>n+g.draws,0)/Math.max(1,games.length*16),rows,paired};
  });
}
