import assert from 'node:assert/strict';import{readFileSync,readdirSync,writeFileSync,mkdirSync}from'node:fs';import{resolve}from'node:path';import{createHash}from'node:crypto';import{registerHooks}from'node:module';
registerHooks({resolve(s,c,next){return next(/^\.{1,2}\//.test(s)&&!/\.[a-z0-9]+$/i.test(s)?s+'.ts':s,c)}});
const game=resolve(import.meta.dirname,'..'),root=resolve(game,'../..'),hash=data=>createHash('sha256').update(data).digest('hex');
const{createScorer}=await import('../rules/scorer.ts'),{createMatch,observe,applyAction,nextHand,evaluateWin,remaining}=await import('../rules/match.ts'),{lastTileAlternative}=await import('../ai/lastTileDefense.ts');
const scorer=await createScorer(readFileSync(resolve(game,'assets/mcr.wasm'))),datasets=process.argv.slice(2).length?process.argv.slice(2):['development','optimization','holdout'],stats={},examples=[],sources={};let actions=0,matches=0;
for(const dataset of datasets){
  const dir=resolve(root,'artifacts/guobiao-mahjong/strength',dataset),report=JSON.parse(readFileSync(resolve(dir,'report.json')));
  for(const file of ['rules/match.ts','rules/types.ts','rules/scorer.ts','assets/mcr.wasm'])assert.equal(hash(readFileSync(resolve(game,file))),report.fingerprints[file],file+' differs from recorded referee');
  for(const file of readdirSync(resolve(dir,'matches')).filter(f=>f.endsWith('.json')).sort()){
    const bytes=readFileSync(resolve(dir,'matches',file)),record=JSON.parse(bytes);assert.equal(record.runKey,report.runKey);sources[dataset+'/'+file]=hash(bytes);matches++;
    const s=createMatch(record.replay.seed,record.replay.players);
    for(const r of record.replay.actions){if(r.hand>s.handIndex)nextHand(s);
      if(s.phase==='turn'&&remaining(s)===0&&r.action.type==='discard'){
        const policy=record.seats[r.seat].policy,st=stats[policy]??={lastDiscards:0,substitutions:0,ronOpportunitiesRemoved:0,actualWinsPrevented:0,scoreLossPrevented:0,opponentFanPrevented:0};st.lastDiscards++;
        // Only the redacted observation is passed to the proposed online decision.
        const observation=observe(s,r.seat,scorer),alternative=lastTileAlternative(observation,r.action);
        if(alternative){
          st.substitutions++;
          const evaluate=action=>{const trial=structuredClone(s);applyAction(trial,r.seat,action,scorer,r.revision);return [1,2,3].map(n=>(r.seat+n)%4).map(seat=>({seat,win:evaluateWin(trial,seat,scorer)})).filter(v=>v.win)};
          // Hidden state is used AFTER the decision, solely as an evaluation oracle.
          const old=evaluate(r.action),replacement=evaluate(alternative);assert.equal(replacement.length,0,'A certified safe discard allowed Hu');
          if(old.length){st.ronOpportunitiesRemoved++;const result=record.results[r.hand],actual=result.winner===old[0].seat&&result.from===r.seat;
            if(actual){st.actualWinsPrevented++;st.scoreLossPrevented-=result.deltas[r.seat];st.opponentFanPrevented+=result.win.total;}
            if(examples.length<30)examples.push({dataset,file,policy,hand:r.hand,revision:r.revision,observation,original:r.action,replacement:alternative,oracle:{canHuOriginal:old.map(v=>({seat:v.seat,fan:v.win.fan})),canHuReplacement:[],actualWinPrevented:actual}});
          }
        }
      }
      applyAction(s,r.seat,r.action,scorer,r.revision);actions++;
    }
    assert.deepEqual(s.results,record.results);
  }
}
const output=resolve(root,'artifacts/guobiao-mahjong/strength/last-tile-proof');mkdirSync(output,{recursive:true});
const fingerprints=Object.fromEntries(['ai/lastTileDefense.ts','benchmarks/last-tile-check.mjs','rules/match.ts','rules/scorer.ts','assets/mcr.wasm'].map(p=>[p,hash(readFileSync(resolve(game,p)))]));
const result={schemaVersion:1,generatedAt:new Date().toISOString(),method:'Pointwise last-discard counterfactual, not a general win-rate estimate',privacy:'Decision receives observe(); hidden referee state is used only afterward to verify outcomes',matches,actions,stats,examples,sources,fingerprints,status:'passed'};writeFileSync(resolve(output,'report.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({matches,actions,stats,status:'passed'},null,2));
