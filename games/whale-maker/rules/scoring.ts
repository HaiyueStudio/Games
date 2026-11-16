import {coinMilestone, lifeReward, MAX_LIVES} from './p2-progress';
import { spawnContent } from './containers';
import type { Body, Defeated, Enemy, State } from './model';
import { rulesFor } from './profile';

export interface ScoreState {stomp:number;star:number}
export interface ScorePop {x:number;y:number;age:number;points:number;chain:number;oneUp?:boolean}
const STEPS=[100,200,400,800,1000,2000,4000,8000] as const;
export const initialScore=():ScoreState=>({stomp:0,star:0});
export function collectToken(s:State,count=1):void {s.coins+=count;coinMilestone(s);if(rulesFor(s.level).rewards==='score')s.score+=100*count;}
export function actionScore(s:State,cause:Defeated['cause']|'stomp-contact',x:number,y:number,source?:Body):void {
    const awardsScore=rulesFor(s.level).rewards==='score',livesEnabled=s.level.progress?.lives;
    if(!awardsScore&&!livesEnabled)return;
    let chain=1;
    if(cause==='stomp')chain=++s.scoreChain.stomp;
    else if(cause==='star'&&s.starTime>0)chain=++s.scoreChain.star;
    else if(cause==='shell'&&source)chain=source.attackChain=(source.attackChain??0)+1;
    const launchedShell=cause==='shell'&&source&&'kind'in source&&source.kind==='shell'&&
        'playerLaunchedShell'in source&&source.playerLaunchedShell===true&&
        !('frozen'in source&&source.frozen)&&!('held'in source&&source.held);
    const oneUp=chain>STEPS.length&&livesEnabled&&s.lives<MAX_LIVES&&s.phase==='playing'&&
        (cause==='stomp'||cause==='star'||launchedShell);
    if(oneUp)lifeReward(s);
    if(oneUp||awardsScore){
        const points=oneUp?0:STEPS[Math.min(STEPS.length-1,chain-1)]!;
        s.score+=points;s.scorePops.push({x,y,age:0,points,chain,...(oneUp?{oneUp:true}:{})});
        if(s.scorePops.length>12)s.scorePops.shift();
    }
}
/** Called after alive is cleared, so repeated contacts cannot re-issue a drop. */
export function defeatReward(s:State,e:Enemy,cause:Defeated['cause'],source?:Body):void {
    if(rulesFor(s.level).rewards==='legacy-coins')s.coins+=cause==='shell'?2:1;
    actionScore(s,cause,e.x+e.w/2,e.y,source);
    if(e.drop){
        const drop=spawnContent(s,e.drop,e.x+e.w/2-.4,e.y);if(drop){drop.vy=-3;if('cooldown'in drop)drop.cooldown=.2;}
        delete e.drop;
    }
}

