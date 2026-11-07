import {validateComparison,summarizeComparison} from './statistics.mjs';
/** Pure evidence checks; no filesystem or process access. */
export function validateEvidence(report,records){
  validateComparison(report.config);
  const config=report.config,expected=config.suites.length*config.seeds.length*(config.rotateSeats?4:1),seen=new Set();
  if(report.schemaVersion!==1||report.strict!==true||report.skipForced!==true||records.length!==expected||report.completed!==expected||report.expected!==expected)throw Error('Incomplete or non-strict comparison.');
  for(const g of records){
    const suite=config.suites.find(s=>s.id===g.suite),key=`${g.suite}:${g.seed}:${g.rotation}`;
    if(g.runKey!==report.runKey||!suite||!config.seeds.includes(g.seed)||!Number.isInteger(g.rotation)||g.rotation<0||g.rotation>=(config.rotateSeats?4:1)||seen.has(key))throw Error('Invalid, duplicate or foreign match.');seen.add(key);
    if(g.results.length!==16||g.seats.length!==4||g.replay.seed!==g.seed||g.replay.handIndex!==15)throw Error('Incomplete sixteen-hand match.');
    for(const [i,r] of g.results.entries()){
      if(r.hand!==i||r.deltas.length!==4||r.deltas.reduce((a,b)=>a+b,0)!==0)throw Error('Invalid hand settlement.');
      if(r.winner!==null&&(!Number.isInteger(r.winner)||r.winner<0||r.winner>3||!r.win||r.win.fan<8||r.win.total!==r.win.fan+r.win.flowers))throw Error('Invalid eight-fan win.');
    }
    for(const [i,s] of g.seats.entries()){
      const wins=g.results.filter(r=>r.winner===i),score=g.results.reduce((n,r)=>n+r.deltas[i],0),actions=g.replay.actions.filter(a=>a.seat===i).length;
      if(s.policy!==suite.agents[(i+g.rotation)%4]||s.seat!==i||s.hands!==16||s.faults!==0||s.wins!==wins.length||s.fan!==wins.reduce((n,r)=>n+r.win.total,0)||s.score!==score||s.dealIns!==g.results.filter(r=>r.winner!==null&&!r.selfDrawn&&r.from===i).length)throw Error('Seat metrics disagree with settlements.');
      if(!Number.isInteger(s.forced)||s.forced<0||s.forced+s.latencyMs.length!==actions||s.latencyMs.some(t=>!Number.isFinite(t)||t<0))throw Error('Forced actions/decision timing disagree with replay.');
    }
    if(g.draws!==g.results.filter(r=>r.winner===null).length)throw Error('Draw count disagrees with settlements.');
  }
  const summary=summarizeComparison(records,config);
  if(JSON.stringify(summary)!==JSON.stringify(report.summary))throw Error('Reported summary differs from raw matches.');
  return {matches:expected,hands:expected*16,decisions:records.reduce((n,g)=>n+g.replay.actions.length,0),faults:0};
}
