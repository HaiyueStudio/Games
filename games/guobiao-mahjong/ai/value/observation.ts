import type {Observation} from '../../rules/types';
/** Runtime-safe public inputs. This module has no simulator or training dependencies. */
export function valueObservation(o:Observation):Observation {
  return {protocol:o.protocol,revision:o.revision,seat:o.seat,handIndex:o.handIndex,roundWind:o.roundWind,dealer:o.dealer,turn:o.turn,phase:o.phase,wallRemaining:o.wallRemaining,
    hand:[...o.hand],drawn:o.drawn,replacement:o.replacement,last:o.last?{seat:o.last.seat,tile:o.last.tile,robKong:o.last.robKong}:null,
    legalActions:o.legalActions.map(a=>({type:a.type,...(a.tile===undefined?{}:{tile:a.tile}),...(a.tiles?{tiles:[...a.tiles]}:{})})),
    players:o.players.map((p,i)=>({name:p.name,handCount:p.handCount,flowers:[...p.flowers],river:[...p.river],fan:p.fan,score:p.score,wins:p.wins,
      melds:p.melds.map(m=>({kind:m.kind,from:m.from,concealed:m.concealed,promoted:m.promoted,tiles:i!==o.seat&&m.concealed?m.tiles.map(()=>null):[...m.tiles]}))})),
    events:o.events.filter(e=>e.hand===o.handIndex).map((e,index)=>({index,hand:e.hand,type:e.type,seat:e.seat,text:'',...(e.tile===undefined||e.type==='draw'||e.type==='concealed-kong'?{}:{tile:e.tile}),...(e.tiles&&e.type!=='concealed-kong'&&e.type!=='draw'?{tiles:[...e.tiles]}:{})})),results:[]};
}
