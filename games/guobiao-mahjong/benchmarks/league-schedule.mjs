/** Deterministic PFSP weighting with a probability floor and explicit historical/style coverage. */
export function leagueWeight(member,statistics){const s=statistics[member.key];const wins=s?.wins??0,games=s?.games??0,p=(wins+1)/(games+2);return .05+(1-p)**2;}
export function scheduleLeague(config,generation,statistics={}){
  const seeds=config.trainingSeeds[generation];if(!Array.isArray(seeds)||seeds.length<2||new Set(seeds).size!==seeds.length)throw Error('Invalid league seeds');
  const pool=[{key:'kd-s0',id:'kd-s0'},{key:'original',id:'kd-value-v1'}];for(let g=0;g<=generation;g++)for(const style of ['balanced','attack','defense'])pool.push({key:`g${g}-${style}`,id:'joint-g'+g,style,temperature:.5});
  let state=(config.seed+generation)>>>0;const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296},mandatory=[...pool];for(let i=mandatory.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[mandatory[i],mandatory[j]]=[mandatory[j],mandatory[i]];}
  let cursor=0;const jobs=[];
  for(const seed of seeds){const opponents=[];while(opponents.length<3){let member=mandatory[cursor++];if(!member){const choices=pool.filter(p=>!opponents.some(o=>o.key===p.key)),weights=choices.map(p=>leagueWeight(p,statistics));let draw=random()*weights.reduce((a,b)=>a+b,0);for(let i=0;i<choices.length;i++){draw-=weights[i];if(draw<=0){member=choices[i];break;}}member??=choices.at(-1);}if(!opponents.some(o=>o.key===member.key))opponents.push(member);}
    const base=[{key:'learner',id:'joint-g'+generation,learner:true,temperature:1,style:'balanced',mode:'explore'},...opponents];for(let rotation=0;rotation<4;rotation++)jobs.push({suite:'league-g'+generation,seed,rotation,training:true,capturePerHand:config.capturePerHand,captureMode:config.captureMode??'uniform',anchorOriginal:config.anchorOriginal??false,fold:seed===seeds.at(-1)?'calibration':'train',policies:Array.from({length:4},(_,i)=>base[(i+rotation)%4])});
  }return {jobs,pool,weights:Object.fromEntries(pool.map(p=>[p.key,leagueWeight(p,statistics)]))};
}
export function updateLeagueStatistics(statistics,matches){
  const result=structuredClone(statistics);for(const g of matches){const learner=g.policies.findIndex(p=>p.learner);if(learner<0)throw Error('Missing league learner');const me=g.seats[learner];for(let i=0;i<4;i++)if(i!==learner){const key=g.policies[i].key,other=g.seats[i],won=me.fan>other.fan||me.fan===other.fan&&me.score>other.score,draw=me.fan===other.fan&&me.score===other.score,row=result[key]??={wins:0,games:0};row.games++;row.wins+=won?1:draw?.5:0;}}return result;
}
