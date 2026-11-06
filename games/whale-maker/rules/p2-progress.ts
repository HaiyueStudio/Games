import type { Reward, State } from './model';
import type { Services } from './services';
import { emit } from './events';
export function lifeReward(s:State):void {if(s.level.progress?.lives)s.lives=Math.min(99,s.lives+1);else s.score+=1000;emit(s,'power',s.player.x);s.notice=s.level.progress?.lives?'获得一条生命！':'生命珍珠 · 得分 +1000';}
export function coinMilestone(s:State):void {if(!s.level.progress?.lives)return;while(s.coins>=s.nextLifeCoin){s.nextLifeCoin+=100;lifeReward(s);}}
export function progressReward(s:State,r:Reward,svc:Services):boolean {if(r.kind==='one-up'){lifeReward(s);r.w=0;return true;}if(r.kind==='coin-10'||r.kind==='coin-30'||r.kind==='coin-50'){svc.coin(s,r.x,r.y,Number(r.kind.slice(5)));r.w=0;return true;}return false;}
/** Called by both the next simulation step and an immediate retry. */
export function settlePlayerDeath(s:State):void {
    if(s.phase!=='dead'||!s.level.progress?.lives||s.lifeCharged)return;
    s.lifeCharged=true;s.lives=Math.max(0,s.lives-1);s.gameOver=s.lives===0;
    if(s.gameOver)s.notice='生命用尽 · 按 R 重新开始';
}
export function progressStep(s:State,dt:number,svc:Services):void {
    s.areaFade=Math.max(0,(s.areaFade??0)-dt);
    if(s.phase==='playing'&&(s.level.progress?.timeLimit??0)>0){s.timeRemaining=Math.max(0,s.timeRemaining-dt);if(s.timeRemaining===0){svc.crush(s);s.notice='时间到！';}}
    settlePlayerDeath(s);
    for(const e of s.enemies)if(['homing-bill','giant-bill','cat-bill'].includes(e.kind)&&e.alive&&!e.held&&!e.frozen){e.projectileAge=(e.projectileAge??0)+dt;if(e.projectileAge>12||e.x< -3||e.x>s.level.width+3||e.y>s.level.height+3)e.alive=false;}
}
export function finishProgress(s:State,id:number):void {if(s.timeBonus===0&&s.timeRemaining>0){s.timeBonus=Math.ceil(s.timeRemaining)*50;s.score+=s.timeBonus;s.timeRemaining=0;}const p=s.level.properties?.[id];if(p?.goalBonus==='life'&&s.player.y+s.player.h<=Math.floor(id/s.level.width)-(p.goalHeight??9)+1)lifeReward(s);}
