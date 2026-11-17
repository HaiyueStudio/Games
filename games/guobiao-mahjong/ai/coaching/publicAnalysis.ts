import {actionKey,seat,TILE_NAMES,WINDS,type Action,type Meld,type Observation,type Scorer,type Tile} from '../../rules/types';
import {formedFans} from '../../rules/handAnalysis';
import {decide} from '../strategy';
import {lastTileAlternative,guaranteedSafe} from '../lastTileDefense';
import {predictDiscardRisk} from '../candidates/learned';
import {searchTargets} from '../candidates/targets';
import type {CoachCandidate,CoachOptions,CoachReport,FanRoute,OpponentRead,TileDanger} from './types';

/** Whitelist one seat's observation. Spectator faces, wall order and past private hands never cross this boundary. */
export function coachingObservation(o:Observation):Observation {
  if(o.protocol!=='haiyue.mcr/1'||o.players.length!==4||!Number.isInteger(o.seat)||o.seat<0||o.seat>3)throw Error('分析观测无效');
  if(!o.hand.length||o.hand.length>14||o.hand.some(t=>!Number.isInteger(t)||t<0||t>33)||o.players[o.seat]!.melds.some(m=>m.tiles.some(t=>t===null||!Number.isInteger(t)||t<0||t>33)))throw Error('分析手牌无效');
  return {protocol:o.protocol,revision:o.revision,seat:o.seat,handIndex:o.handIndex,roundWind:o.roundWind,dealer:o.dealer,turn:o.turn,phase:o.phase,wallRemaining:o.wallRemaining,
    hand:[...o.hand],drawn:o.drawn,replacement:o.replacement,last:o.last?{seat:o.last.seat,tile:o.last.tile,robKong:o.last.robKong}:null,
    legalActions:o.legalActions.map(a=>({type:a.type,...(a.tile===undefined?{}:{tile:a.tile}),...(a.tiles?{tiles:[...a.tiles]}:{})})),
    players:o.players.map((p,i)=>({name:p.name,handCount:p.handCount,flowers:[...p.flowers],river:[...p.river],score:p.score,fan:p.fan,wins:p.wins,
      melds:p.melds.map(m=>({kind:m.kind,from:m.from,concealed:m.concealed,promoted:m.promoted,tiles:i!==o.seat&&m.concealed?m.tiles.map(()=>null):[...m.tiles]}))})),
    events:o.events.map(e=>{const hidden=e.seat!==o.seat&&['concealed-kong','draw'].includes(e.type);return {index:e.index,hand:e.hand,type:e.type,seat:e.seat,text:hidden?(e.type==='draw'?'摸牌':'暗杠'):e.text,...(e.tile===undefined||hidden?{}:{tile:e.tile}),...(e.tiles&&!hidden?{tiles:[...e.tiles]}:{})}}),
    results:o.results.map(r=>({hand:r.hand,winner:r.winner,from:r.from,selfDrawn:r.selfDrawn,deltas:[...r.deltas],hands:[],melds:[],win:r.win?{fan:r.win.fan,flowers:r.win.flowers,total:r.win.total,items:r.win.items.map(f=>({id:f.id,name:f.name,value:f.value,count:f.count}))}:null}))};
}
export function positionKey(o:Observation):string {
  return JSON.stringify([o.seat,o.handIndex,o.roundWind,o.dealer,o.phase,o.turn,o.wallRemaining,o.hand,o.drawn,o.replacement,o.last,
    o.legalActions.map(actionKey).sort(),o.players.map(p=>[p.handCount,p.melds.map(m=>[m.kind,m.concealed,m.promoted,m.concealed&&p!==o.players[o.seat]?null:m.tiles]),p.river,p.flowers.length])]);
}
export function visibleCounts(o:Observation):number[]{
  const known=Array<number>(34).fill(0);for(const t of o.hand)known[t]!++;
  o.players.forEach((p,i)=>{for(const t of p.river)known[t]!++;for(const m of p.melds)if(i===o.seat||!m.concealed)for(const t of m.tiles)if(t!==null)known[t]!++;});
  if(known.some(n=>n>4||n<0))throw Error('公开牌张数不守恒');return known;
}
export function publicCounts(o:Observation):number[]{
  const counts=Array<number>(34).fill(0);for(const p of o.players){for(const t of p.river)counts[t]!++;for(const m of p.melds)if(!m.concealed)for(const t of m.tiles)if(t!==null)counts[t]!++;}return counts;
}
/** Transfer a called discard into the new meld once, then expose the planned discard. */
export function actionPublicCounts(o:Observation,action:Action,melds:Meld[],followUpDiscard:Tile|null):number[]{
  const counts=publicCounts(o);
  for(const m of o.players[o.seat]!.melds)if(!m.concealed)for(const t of m.tiles)if(t!==null)counts[t]!--;
  for(const m of melds)if(!m.concealed)for(const t of m.tiles)counts[t]!++;
  if(['chow','pung','kong'].includes(action.type))counts[action.tile!]!--;
  const discard=action.type==='discard'?action.tile!:followUpDiscard;if(discard!==null)counts[discard]!++;
  return counts;
}
export function forecastFlags(o:Observation,tile:Tile,self:boolean,kong=false,exposed=publicCounts(o)):number{
  return +self|(exposed[tile]===3?2:0)|(kong&&self?4:0);
}
export function forecastHorizon(o:Observation,action:Action|null,limit:number):number{
  const wall=Math.max(0,o.wallRemaining);let count:number;
  if(action?.type.includes('kong'))count=wall?1+Math.floor((wall-1)/4):0;
  else if(action&&['discard','chow','pung'].includes(action.type))count=Math.floor(wall/4);
  else {const next=o.phase==='response'&&o.last?(o.last.robKong?o.last.seat:seat(o.last.seat+1)):seat(o.turn+1),distance=seat(o.seat-next);count=wall>distance?1+Math.floor((wall-distance-1)/4):0;}
  return Math.max(0,Math.min(limit,count));
}
const clamp=(n:number)=>Math.max(0,Math.min(100,Math.round(n)));
export function readOpponents(o:Observation,known=visibleCounts(o)):OpponentRead[]{
  return o.players.flatMap((p,i)=>{
    if(i===o.seat)return [];
    const who=i as OpponentRead['seat'],exposed=p.melds.filter(m=>!m.concealed),tiles=exposed.flatMap(m=>m.tiles.filter((t):t is number=>t!==null)),suits=[...new Set(tiles.filter(t=>t<27).map(t=>Math.floor(t/9)))],chows=exposed.filter(m=>m.kind==='chow'),pungs=exposed.filter(m=>m.kind!=='chow');
    const patterns:OpponentRead['patterns']=[],evidence:string[]=[],knownFan:string[]=[];
    if(exposed.length)evidence.push(`${exposed.length}组明副露，暗手${p.handCount}张`);else evidence.push('未见明副露，暗手牌型尚不明确');
    if(p.melds.length===4)evidence.push('四组面子已公开结构；若够番，可能单钓');
    if(suits.length===1&&exposed.length>=2){const honor=tiles.some(t=>t>=27),name=honor?'混一色':'清一色 / 混一色';patterns.push({name,confidence:exposed.length>=3?'强':'中',reason:`明副露的数牌均为${['万','条','筒'][suits[0]!]}`});}
    if(!chows.length&&pungs.length>=2)patterns.push({name:'碰碰和',confidence:pungs.length>=3?'强':'中',reason:`已有${pungs.length}组明刻或杠；仍需看其余面子和番数`});
    if(chows.length)evidence.push('已有顺子，排除碰碰和、七对等路线');
    for(const m of pungs){const t=m.tiles[0];if(t===null||t===undefined)continue;if(t>=31)knownFan.push(`箭刻 ${TILE_NAMES[t]}`);if(t===27+o.roundWind)knownFan.push('圈风刻');if(t===27+seat(i-o.dealer))knownFan.push('门风刻');}
    for(let rank=0;rank<7;rank++)if([0,1,2].every(suit=>chows.some(m=>m.tiles[0]===suit*9+rank)))knownFan.push('三色三同顺 8番');
    for(let suit=0;suit<3;suit++)if([0,3,6].every(rank=>chows.some(m=>m.tiles[0]===suit*9+rank)))knownFan.push('清龙 16番');
    const history=o.events.filter(e=>e.type==='discard'&&e.seat===i).map(e=>e.tile!).filter(t=>t!==undefined);
    if(!p.melds.length&&history.length>=7&&history.filter(t=>t<27&&t%9>0&&t%9<8).length/history.length>=.85)patterns.push({name:'幺九类和型',confidence:'弱',reason:'多次舍出中张，需留意幺九和字牌；也可能只是普通拆牌'});
    if(!exposed.length&&history.length>=6){const discardedSuits=[0,1,2].map(s=>history.filter(t=>t<27&&Math.floor(t/9)===s).length),max=Math.max(...discardedSuits);if(max/history.length>=.65)patterns.push({name:'缺一门倾向',confidence:'弱',reason:`舍牌集中于${['万','条','筒'][discardedSuits.indexOf(max)]}，仅是整理花色的弱信号`});}
    if(!patterns.length)patterns.push({name:!p.melds.length?'门清手 / 七对等尚难区分':'尚难定位',confidence:'弱',reason:'弃牌只能提供倾向，无法据此确定暗手或听牌'});
    const dragonTypes=new Set(pungs.map(m=>m.tiles[0]).filter(t=>t!==null&&t!==undefined&&t>=31)),windTypes=new Set(pungs.map(m=>m.tiles[0]).filter(t=>t!==null&&t!==undefined&&t>=27&&t<=30));
    if(dragonTypes.size===3){for(let n=knownFan.length-1;n>=0;n--)if(knownFan[n]!.includes('箭刻'))knownFan.splice(n,1);knownFan.push('大三元 88番');}
    if(windTypes.size===4){for(let n=knownFan.length-1;n>=0;n--)if(['圈风刻','门风刻'].includes(knownFan[n]!))knownFan.splice(n,1);knownFan.push('大四喜 88番');}

    const recent=o.events.filter(e=>e.type==='discard'&&e.seat===i).slice(-4).map(e=>e.tile!);
    if(recent.length>=3&&recent.every(t=>t>=27))evidence.push('最近主要舍出字牌，可能整理数牌面子');
    const pressure=clamp(12+p.melds.length*13+Math.min(16,p.river.length*.8)+Math.max(0,65-o.wallRemaining)*.3+(knownFan.some(f=>f.includes('8番')||f.includes('16番')||f.includes('88番'))?12:0));
    const read:OpponentRead={seat:who,wind:WINDS[seat(i-o.dealer)]!,pressure,level:pressure>=62?'高':pressure>=37?'中':'低',evidence,patterns,watch:[],knownFan};
    read.watch=Array.from({length:34},(_,tile)=>({tile,score:dangerAgainst(o,tile,read,known).score})).sort((a,b)=>b.score-a.score||a.tile-b.tile).slice(0,4).map(v=>v.tile);return [read];
  });
}
function dangerAgainst(o:Observation,tile:Tile,read:OpponentRead,known:number[]){
  const p=o.players[read.seat]!,unseen=known.map(n=>Math.max(0,4-n)),reasons:string[]=[];
  let shapes=unseen[tile]!>=2?.35:unseen[tile]!>=1?.18:.08;
  if(tile<27){let sequences=0;for(let start=Math.max(0,tile%9-2);start<=Math.min(6,tile%9);start++){const others=[0,1,2].map(d=>Math.floor(tile/9)*9+start+d).filter(t=>t!==tile);if(others.every(t=>unseen[t]!>0))sequences++;}shapes+=sequences*.24;if(!sequences)reasons.push('相关顺子搭子受可见牌限制');}
  let value=(18+read.pressure*.75)*Math.min(1.35,shapes+.2);
  const exposed=p.melds.filter(m=>!m.concealed).flatMap(m=>m.tiles.filter((t):t is number=>t!==null)),suits=[...new Set(exposed.filter(t=>t<27).map(t=>Math.floor(t/9)))];
  if(suits.length===1&&p.melds.filter(m=>!m.concealed).length>=2){if(tile>=27||Math.floor(tile/9)===suits[0]){value*=1.5;reasons.push('符合其同花副露或字牌路线');}else{value*=.72;reasons.push('与其明示花色不一致，仅降低相对风险');}}
  if(tile>=27&&(tile>=31||tile===27+o.roundWind||tile===27+seat(read.seat-o.dealer))&&unseen[tile]!>=1){value*=1.18;reasons.push('可能补足箭刻或风刻番数');}
  if(read.patterns.some(r=>r.name==='幺九类和型')&&(tile>=27||tile%9===0||tile%9===8)){value*=1.18;reasons.push('连续舍中张可能保留幺九字牌，但信号较弱');}
  if(p.river.includes(tile)){value*=.8;reasons.push('其弃过此牌仅为弱信号；国标没有振听保护');}
  if(tile<27&&unseen[tile]===0)reasons.push('同牌虽已见全，仍可能被用作顺子和张');
  if(!reasons.length)reasons.push(tile<27?'中张搭子较灵活，结合副露和局面判断':'字牌风险取决于其对子及特殊和型');
  return {seat:read.seat,score:Math.max(1,clamp(value)),reasons};
}
export function tileDanger(o:Observation,tile:Tile,opponents=readOpponents(o),known=visibleCounts(o)):TileDanger{
  const reads=opponents.map(r=>dangerAgainst(o,tile,r,known)).sort((a,b)=>b.score-a.score||a.seat-b.seat);
  return {tile,score:clamp((reads[0]?.score??0)+(reads[1]?.score??0)*.2+(reads[2]?.score??0)*.1),opponents:reads};
}
function remove(hand:Tile[],tile:Tile){const i=hand.indexOf(tile);if(i<0)throw Error('分析动作缺少手牌');hand.splice(i,1);}
/** Counterfactual state after the action and, for chow/pung, its best follow-up discard. */
export function prepareAction(o:Observation,a:Action,scorer:Scorer){
  const hand=[...o.hand],melds=structuredClone(o.players[o.seat]!.melds) as Meld[];let followUpDiscard:Tile|null=null;
  if(a.type==='discard')remove(hand,a.tile!);
  else if(a.type==='chow'||a.type==='pung'||a.type==='kong'){
    const tiles=a.tiles?[...a.tiles]:Array(a.type==='kong'?4:3).fill(a.tile!) as Tile[],need=[...tiles];remove(need,a.tile!);need.forEach(t=>remove(hand,t));melds.push({kind:a.type,tiles,from:o.last!.seat,concealed:false,promoted:false});
  }else if(a.type==='concealed-kong'){for(let i=0;i<4;i++)remove(hand,a.tile!);melds.push({kind:'kong',tiles:Array(4).fill(a.tile!),from:o.seat,concealed:true,promoted:false});}
  else if(a.type==='add-kong'){remove(hand,a.tile!);const m=melds.find(m=>m.kind==='pung'&&m.tiles[0]===a.tile);if(!m)throw Error('分析加杠缺少碰牌');m.kind='kong';m.tiles.push(a.tile!);m.promoted=true;}
  if(hand.length%3===2){let best=Infinity;for(const t of [...new Set(hand)]){const h=[...hand];remove(h,t);const n=scorer.shanten(h);if(n<best){best=n;followUpDiscard=t}}if(followUpDiscard!==null)remove(hand,followUpDiscard);}
  return {hand:hand.sort((a,b)=>a-b),melds,followUpDiscard};
}
export function fanRoutes(hand:Tile[],melds:Meld[],o:Observation,known:number[],scorer:Scorer):FanRoute[]{
  const counts=Array<number>(34).fill(0);hand.forEach(t=>counts[t]!++);const all=[...hand,...melds.flatMap(m=>m.tiles)],openSuits=new Set(melds.flatMap(m=>m.tiles).filter(t=>t<27).map(t=>Math.floor(t/9))),routes:FanRoute[]=[];
  const add=(name:string,score:number,evidence:string,needs:Tile[]=[],keyRequired=needs.length)=>{const f=scorer.catalog.find(f=>f.name===name);if(f&&score>=35&&needs.filter(t=>known[t]!<4).length>=keyRequired)routes.push({name,fan:f.value,fit:score>=68?'优先':'备选',score:clamp(score),evidence,needs:[...new Set(needs)],keyRequired,keyProbability:null})};
  const closed=melds.every(m=>m.concealed),pairCount=counts.reduce((n,c)=>n+Math.floor(c/2),0);
  if(!melds.length&&pairCount>=3)add('七对',34+pairCount*8,`已有${pairCount}对，保持不副露；七对为24番`,counts.flatMap((c,t)=>c%2===1?[t]:[]),7-pairCount);
  for(let suit=0;suit<3;suit++){
    if([...openSuits].some(s=>s!==suit))continue;const suited=all.filter(t=>t<27&&Math.floor(t/9)===suit).length,honors=all.filter(t=>t>=27).length;
    if(!melds.some(m=>m.tiles.some(t=>t>=27)))add('清一色',suited*6-7*(all.length-suited),`${suited}张${['万','条','筒'][suit]}；成和后清一色24番，先看进张是否足够`);
    if(honors)add('混一色',(suited+honors)*5-7*(all.length-suited-honors),`${suited}张同花数牌、${honors}张字牌；混一色6番${closed?'可结合门前清2番':'需另补风刻、箭刻等番数'}`);
  }
  if(!melds.some(m=>m.kind==='chow')){const pungs=melds.length+counts.filter(c=>c>=3).length;if(pungs>=1||pairCount>=3)add('碰碰和',30+pungs*13+pairCount*5,`已有${pungs}组刻杠结构、${pairCount}对；碰碰和6番${closed?'可保门清补番':'本身不足8番，须保留补番条件'}`);}
  const sequenceRoute=(name:string,groups:number[][])=>{
    const matched=new Set<number>();melds.forEach(m=>{const i=groups.findIndex(g=>m.kind==='chow'&&g.join()===m.tiles.join());if(i>=0)matched.add(i)});
    if(groups.length-matched.size>4-melds.length)return;
    const need=groups.flatMap((g,i)=>matched.has(i)?[]:g.filter(t=>counts[t]===0)),have=9-need.length;
    add(name,have*10-need.length*6,`已有${have}/9种关键牌${need.length?'，待补'+need.slice(0,4).map(t=>TILE_NAMES[t]).join('、'):'，尽量保留对应顺子'}；最终仍须完整成和`,need);
  };
  for(let start=0;start<7;start++)sequenceRoute('三色三同顺',[0,1,2].map(s=>[s*9+start,s*9+start+1,s*9+start+2]));
  for(let suit=0;suit<3;suit++)sequenceRoute('清龙',[0,3,6].map(n=>[suit*9+n,suit*9+n+1,suit*9+n+2]));
  const categories=new Set(all.map(t=>t<27?Math.floor(t/9):t<31?3:4));if(categories.size===5)add('五门齐',closed?78:60,`三门数牌、风牌和箭牌齐备；五门齐6番${closed?'可结合门前清2番':'仍需其他番种补足8番'}`);
  return routes.sort((a,b)=>b.score-a.score||b.fan-a.fan).filter((r,i,rs)=>rs.findIndex(v=>v.name===r.name)===i).slice(0,4);
}
export function baseReport(o:Observation,scorer:Scorer,options:CoachOptions):CoachReport{
  const start=performance.now(),key=positionKey(o),known=visibleCounts(o),opponents=readOpponents(o,known),danger=[...new Set(o.hand)].map(t=>tileDanger(o,t,opponents,known)).sort((a,b)=>b.score-a.score||a.tile-b.tile);
  const base={protocol:'haiyue.mcr.coach/1' as const,key,revision:o.revision,handIndex:o.handIndex,roundWind:o.roundWind,seat:o.seat,stage:'基础' as const,opponents,danger,horizon:forecastHorizon(o,null,options.horizon),samples:options.samples,
    assumptions:['仅使用当前座位手牌及公开信息；对手牌型为推测','风险分为相对指标，不是放铳概率；国标没有振听','未见进张包括可能在对手暗手中的牌，不代表牌墙实存','试算假设未知牌等可能，忽略对手抢先和、后续吃碰和补花；不是整局胜率']};
  const handBase=o.hand.length%3===1?o.hand:prepareAction(o,{type:'pass'},scorer).hand,baseShanten=scorer.shanten(handBase),maxPressure=Math.max(...opponents.map(p=>p.pressure));
  let mode:CoachReport['mode']=maxPressure>=62&&baseShanten>=2?'防守':maxPressure>=40?'攻守平衡':'进攻';
  if(o.phase.endsWith('over'))return {...base,stage:'完成',mode,summary:'本局结束；可查看本局分析日志复盘',recommendation:null,candidates:[],routes:[],elapsedMs:performance.now()-start};
  if(o.legalActions.some(a=>a.type==='hu'))return {...base,stage:'完成',mode:'进攻',summary:'已有合法和牌机会，满足起胡条件，建议立即胡牌',recommendation:{type:'hu'},candidates:[],routes:[],elapsedMs:performance.now()-start};
  const active=o.legalActions.some(a=>a.type!=='pass'),decision=active?decide(o,scorer,2,128):null;
  const priorReference=formedFans(o.hand,o.players[o.seat]!.melds as Meld[],o.roundWind,seat(o.seat-o.dealer),scorer.catalog).reduce((n,f)=>n+f.value*f.count,0);
  const candidates:CoachCandidate[]=(decision?.candidates??[]).filter(c=>o.legalActions.some(a=>actionKey(a)===actionKey(c.action))).map(c=>{
    const state=prepareAction(o,c.action,scorer),a=scorer.analyze(state.hand),effective=a.effective.filter(t=>known[t]!<4),waits:CoachCandidate['waits']=[],exposed=actionPublicCounts(o,c.action,state.melds,state.followUpDiscard);
    if(a.shanten===0)for(const t of effective){const self=scorer.score(state.hand,state.melds,t,0,forecastFlags(o,t,true,false,exposed),o.roundWind,seat(o.seat-o.dealer)),ron=scorer.score(state.hand,state.melds,t,0,forecastFlags(o,t,false,false,exposed),o.roundWind,seat(o.seat-o.dealer));if(self&&self.fan>=8||ron&&ron.fan>=8)waits.push({tile:t,copies:4-known[t]!,selfFan:self&&self.fan>=8?self.fan:null,ronFan:ron&&ron.fan>=8?ron.fan:null,fans:[...new Set([...(self?.items??[]),...(ron?.items??[])].filter(f=>f.name!=='花牌').map(f=>f.name))]})}
    const eligible=a.shanten===0?waits.map(w=>w.tile):effective,ukeire=eligible.reduce((n,t)=>n+4-known[t]!,0),discard=c.action.type==='discard'?c.action.tile!:state.followUpDiscard,risk=discard===null?c.action.type==='add-kong'?tileDanger(o,c.action.tile!,opponents,known).score:0:tileDanger(o,discard,opponents,known).score;
    const reference=formedFans(state.hand,state.melds,o.roundWind,seat(o.seat-o.dealer),scorer.catalog).reduce((n,f)=>n+f.value*f.count,0);
    const reasons=[`${a.shanten===0?'听牌':a.shanten+'向听'}，未见进张${ukeire}张${a.shanten===0?'可满足起胡':'可改善牌形'}（不代表牌墙实存）`,`相对危险度${risk}/100${discard!==null?'，针对弃牌'+TILE_NAMES[discard]:''}`];
    if(reference>=8)reasons.push(`保留约${reference}番参考结构；最终成和仍须完整裁判确认`);
    else if(priorReference>=8)reasons.push('会拆掉当前起胡参考结构，后续需要重新凑番');
    if(state.followUpDiscard!==null)reasons.push(`副露后建议再打${TILE_NAMES[state.followUpDiscard]}`);
    if(['chow','pung','kong'].includes(c.action.type)&&o.players[o.seat]!.melds.every(m=>m.concealed))reasons.push('此操作会失去门前清2番，须重新检查8番来源');
    if(a.shanten===0&&!waits.length)reasons.push('牌形已听但暂无常规8番和张，不能把花牌当作起胡番数');
    return {action:c.action,followUpDiscard:state.followUpDiscard,shanten:a.shanten,ukeire,effective:eligible,waits,risk,value:c.value+(reference>=8?3:priorReference>=8?-2:0)-risk*(mode==='防守'?.22:mode==='攻守平衡'?.09:.025),reasons,forecast:null};
  }).sort((a,b)=>b.value-a.value||actionKey(a.action).localeCompare(actionKey(b.action)));
  const safe=candidates[0]?lastTileAlternative(o,candidates[0].action,candidates.map(c=>c.action)):null;
  if(safe){const index=candidates.findIndex(c=>actionKey(c.action)===actionKey(safe));candidates.unshift(...candidates.splice(index,1));}
  if(o.wallRemaining===0&&o.phase==='turn'&&o.turn===o.seat&&candidates[0]?.action.type==='discard'&&guaranteedSafe(o,candidates[0].action.tile!)){
    mode='防守';const best=candidates[0],reason='公开牌已排除所有对手的成和牌形';best.risk=0;best.reasons[1]=reason;best.reasons.unshift('牌墙已空且不能胡牌；仅凭公开牌可确认此牌不会放铳，不再为后续进张冒险');
    const safeDanger=danger.find(d=>d.tile===best.action.tile);if(safeDanger){safeDanger.score=0;for(const p of safeDanger.opponents){p.score=0;p.reasons=[reason];}}
    danger.sort((a,b)=>b.score-a.score||a.tile-b.tile);
  }
  candidates.splice(3);
  const best=candidates[0],state=best?prepareAction(o,best.action,scorer):{hand:handBase,melds:o.players[o.seat]!.melds as Meld[]};
  const label=best?best.action.type==='discard'?'打'+TILE_NAMES[best.action.tile!]:best.action.type==='pass'?'过':best.action.type==='chow'?'吃':best.action.type==='pung'?'碰':'杠':null;
  const summary=best?`${mode}：建议${label}。${best.reasons[0]}；危险度${best.risk}/100。`:`等待轮到你；当前${baseShanten===0?'牌形已听':baseShanten+'向听'}，持续关注对手副露和弃牌。`;
  if(best&&candidates[1]){const other=candidates[1];best.reasons.push(best.shanten<other.shanten?'相比备选，优先降低向听':best.ukeire>other.ukeire?`相比备选多${best.ukeire-other.ukeire}张进张`:best.risk<other.risk?`相比备选降低${other.risk-best.risk}点相对风险`:'综合进张、起胡番数和风险取舍；评分并非胜率')}
  const learnedDanger=candidates.filter(c=>c.action.type==='discard').map(c=>({tile:c.action.tile!,opponents:predictDiscardRisk(o,c.action.tile!).opponents})),targetRoutes=best?.action.type==='discard'&&o.phase==='turn'&&o.turn===o.seat?searchTargets(o,best.action.tile!,scorer).routes.slice(0,3):[];
  return {...base,horizon:forecastHorizon(o,best?.action??null,options.horizon),mode,summary,recommendation:best?.action??null,candidates,routes:fanRoutes(state.hand,state.melds,o,known,scorer),learnedDanger,targetRoutes,targetHorizon:Math.min(8,Math.floor(o.wallRemaining/4)),elapsedMs:performance.now()-start};
}
