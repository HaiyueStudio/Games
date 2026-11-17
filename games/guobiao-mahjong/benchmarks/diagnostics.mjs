import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const output=resolve(process.argv[2]??'artifacts/guobiao-mahjong/strength/development'),report=JSON.parse(readFileSync(resolve(output,'report.json')));
const rows=[];
for(const suite of report.config.suites){
  const byPolicy=new Map();
  for(const file of readdirSync(resolve(output,'matches')).filter(f=>f.endsWith('.json'))){
    const game=JSON.parse(readFileSync(resolve(output,'matches',file)));if(game.suite!==suite.id)continue;
    if(game.runKey!==report.runKey)throw Error('Mixed evidence run keys.');
    for(const [seat,player] of game.seats.entries()){
      const p=byPolicy.get(player.policy)??{policy:player.policy,seatGames:0,hands:0,wins:0,fan:0,selfDrawWins:0,closedWins:0,winningDiscardTurns:[],actions:{},fans:{}};byPolicy.set(player.policy,p);p.seatGames++;p.hands+=16;p.fan+=player.fan;
      for(const a of game.replay.actions)if(a.seat===seat)p.actions[a.action.type]=(p.actions[a.action.type]??0)+1;
      for(const result of game.results)if(result.winner===seat){p.wins++;if(result.selfDrawn)p.selfDrawWins++;if(result.melds[seat].every(m=>m.concealed))p.closedWins++;p.winningDiscardTurns.push(game.replay.actions.filter(a=>a.hand===result.hand&&a.seat===seat&&a.action.type==='discard').length);for(const fan of result.win.items)if(fan.name!=='花牌')p.fans[fan.name]=(p.fans[fan.name]??0)+1;}
    }
  }
  rows.push({suite:suite.id,policies:[...byPolicy.values()].map(p=>({...p,fanPerWin:p.fan/Math.max(1,p.wins),closedWinFraction:p.closedWins/Math.max(1,p.wins),meanOwnDiscardsBeforeWin:p.winningDiscardTurns.reduce((a,b)=>a+b,0)/Math.max(1,p.wins),callsPerHand:Object.entries(p.actions).filter(([type])=>['chow','pung','kong','concealed-kong','add-kong'].includes(type)).reduce((n,[,count])=>n+count,0)/Math.max(1,p.hands),fans:Object.entries(p.fans).sort((a,b)=>b[1]-a[1])}))});
}
const result={generatedAt:new Date().toISOString(),runKey:report.runKey,completed:report.completed,expected:report.expected,rows};writeFileSync(resolve(output,'diagnostics.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
