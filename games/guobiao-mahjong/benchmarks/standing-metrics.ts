/** Tied players share each occupied rank and first-place credit; average place stays unchanged. */
export function standingMetrics(players:readonly {fan:number;score:number}[],seat:number){
  const me=players[seat]!,better=players.filter(p=>p.fan>me.fan||p.fan===me.fan&&p.score>me.score).length,tied=players.filter(p=>p.fan===me.fan&&p.score===me.score).length;
  const placeDistribution=[0,0,0,0];for(let i=better;i<better+tied;i++)placeDistribution[i]=1/tied;
  return {place:1+better+(tied-1)/2,placeDistribution,firstPlaceCredit:placeDistribution[0]!};
}
