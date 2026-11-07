import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(/^\.{1,2}\//.test(s)&&!/\.[a-z0-9]+$/i.test(s)?s+'.ts':s,c)}});
const game=resolve(import.meta.dirname,'..'),root=resolve(game,'../..'),output=resolve(process.argv[2]??'artifacts/guobiao-mahjong/learning/data-v1');mkdirSync(output,{recursive:true});
const{createScorer}=await import('../rules/scorer.ts'),{createMatch,observe,applyAction,nextHand,evaluateWin,remaining}=await import('../rules/match.ts'),{riskFeatures,candidateFeatures,RISK_NAMES,QUALITY_NAMES,CANDIDATE_FEATURE_VERSION}=await import('../ai/candidates/features.ts'),{handAnalysisCache}=await import('../ai/analysisCache.ts');
const hash=b=>createHash('sha256').update(b).digest('hex'),sourceFiles=['benchmarks/learning-data.mjs','ai/candidates/features.ts','ai/candidates/targets.ts','ai/lastTileDefense.ts','ai/analysisCache.ts','rules/scorer.ts','rules/match.ts','rules/types.ts','assets/mcr.wasm'],fingerprints=Object.fromEntries(sourceFiles.map(p=>[p,hash(readFileSync(resolve(game,p)))]));
const folds={train:[1101,1102,1103,2101,2102,2103,2104,3101],calibration:[1104,2105],test:[2106,2107,2108,3102]},foldFor=seed=>Object.keys(folds).find(f=>folds[f].includes(seed));
const scorer=await createScorer(readFileSync(resolve(game,'assets/mcr.wasm'))),oracle=await createScorer(readFileSync(resolve(game,'assets/mcr.wasm'))),cache=handAnalysisCache(oracle),riskRows=[],groups=[],sources={},counts={matches:0,actions:0,positions:0,positives:0};
const mix=(seed,revision)=>{let n=(seed^Math.imul(revision+1,0x9e3779b1))>>>0;n^=n>>>16;n=Math.imul(n,0x85ebca6b);return(n^(n>>>13))>>>0;};
for(const dataset of ['development','optimization','holdout','hybrid-development','hybrid-gpu-development']){
  const dir=resolve(root,'artifacts/guobiao-mahjong/strength',dataset),report=JSON.parse(readFileSync(resolve(dir,'report.json')));
  for(const p of ['rules/match.ts','rules/types.ts','rules/scorer.ts','assets/mcr.wasm'])assert.equal(hash(readFileSync(resolve(game,p))),report.fingerprints[p],p+' referee changed');
  for(const file of readdirSync(resolve(dir,'matches')).filter(f=>f.endsWith('.json')).sort()){
    const bytes=readFileSync(resolve(dir,'matches',file)),record=JSON.parse(bytes);assert.equal(record.runKey,report.runKey);sources[dataset+'/'+file]=hash(bytes);const seed=record.replay.seed,fold=foldFor(seed);assert.ok(fold,'Unassigned seed');const s=createMatch(seed,record.replay.players);counts.matches++;
    for(const r of record.replay.actions){if(r.hand>s.handIndex)nextHand(s);counts.actions++;
      if(s.phase==='turn'&&r.action.type==='discard'&&mix(seed,r.revision)%6===0){
        counts.positions++;const o=observe(s,r.seat,scorer),tiles=[...new Set(o.hand)].sort((a,b)=>a-b),start=mix(seed,r.revision+1)%tiles.length,chosen=Array.from({length:Math.min(6,tiles.length)},(_,i)=>tiles[(start+i)%tiles.length]);
        for(const tile of chosen){const players=[...s.players];players[r.seat]={...players[r.seat],river:[...players[r.seat].river,tile]};const trial={...s,players,phase:'response',last:{seat:r.seat,tile,robKong:false},drawn:null};
          for(let n=1;n<=3;n++){const who=(r.seat+n)%4,p=s.players[who],a=cache.analyze(p.hand),win=a.shanten===0&&a.effective.includes(tile)?evaluateWin(trial,who,oracle):null;const y=win?1:0;counts.positives+=y;riskRows.push([...riskFeatures(o,tile,who),y,win?Math.log1p(win.total):0,seed]);}
        }
        const policy=record.seats[r.seat].policy;
        if(['kd-s0','kd-s1','kd-s2','kdens3'].includes(policy)&&mix(seed,r.revision+2)%3===0&&!o.legalActions.some(a=>a.type!=='discard')){
          const rows=o.legalActions.map(a=>candidateFeatures(o,a.tile,scorer)),winner=record.results[r.hand].winner===r.seat,fan=winner?record.results[r.hand].win.total:0,place=record.seats[r.seat].place;
          // Fan-backward inspired weighting. This is supervised preference fitting, not a Q-value label.
          const weight=(winner?1+Math.min(fan,48)/24:.35)*(1+(4-place)/6);
          const observation={...o,results:[],events:o.events.filter(e=>e.type==='discard').map(e=>({index:e.index,hand:e.hand,type:e.type,seat:e.seat,tile:e.tile,text:''}))};
          groups.push({id:groups.length,seed,fold,policy,observation,chosen:o.legalActions.findIndex(a=>a.tile===r.action.tile),weight,fan,place,rows});
        }
      }
      applyAction(s,r.seat,r.action,scorer,r.revision);
    }assert.deepEqual(s.results,record.results);
    if(counts.matches%8===0)console.log(JSON.stringify({...counts,riskRows:riskRows.length,groups:groups.length}));
  }
}
const width=RISK_NAMES.length+3,buffer=new Float32Array(riskRows.length*width);riskRows.forEach((r,i)=>buffer.set(r,i*width));writeFileSync(resolve(output,'risk.f32'),new Uint8Array(buffer.buffer));writeFileSync(resolve(output,'groups.json'),JSON.stringify(groups));
for(const p of sourceFiles)assert.equal(hash(readFileSync(resolve(game,p))),fingerprints[p],'Source changed: '+p);
const report={schemaVersion:1,featureVersion:CANDIDATE_FEATURE_VERSION,generatedAt:new Date().toISOString(),revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),folds,privacy:'Features receive observe(); hidden hands are used only afterward to label current legal eight-fan Ron opportunities',riskNames:RISK_NAMES,qualityNames:QUALITY_NAMES,riskWidth:width,riskRows:riskRows.length,groups:groups.length,counts,sources,fingerprints,data:{'risk.f32':hash(readFileSync(resolve(output,'risk.f32'))),'groups.json':hash(readFileSync(resolve(output,'groups.json')))},status:'passed'};writeFileSync(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:'passed',...counts,riskRows:riskRows.length,groups:groups.length}));
