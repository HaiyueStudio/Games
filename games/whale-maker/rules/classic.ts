import { classicData } from '../levels/classic-data';
import { configureCoop, create, type Level, type State } from './model';
import {asPlayer,playerAt} from './coop-state';
import { grantPower } from './power';

const stages=classicData;
export const CLASSIC_STAGE_COUNT=stages.length;
export const classicStageName=(index:number):string=>`${Math.floor(index/4)+1}-${index%4+1}`;
export function classicLevel(index=0):Level {
    if(!Number.isInteger(index)||index<0||index>=stages.length)throw Error('初代关卡编号无效');
    const level=stages[index]!();
    return {...level,progress:{lives:true,initialLives:3,...level.progress}};
}
/** Advance only after the complete flag/celebration/castle sequence. */
export function nextClassic(s:State):State|null {
    const stage=s.startLevel.classicStage;
    if(!stage||stage>=stages.length||s.phase!=='won'||s.victory?.stage!=='done'||s.victory.age<2)return null;
    if(s.coop&&s.coop.players.some((_,i)=>playerAt(s,i).victory?.stage!=='done'))return null;
    return transferCourse(s,classicLevel(stage));
}

export function transferCourse(s:State,level:Level):State {
    const next=create({...level,...(!level.rules&&s.level.rules?{rules:{...s.level.rules}}:{})});
    next.coins=s.coins;next.score=s.score;next.deaths=s.deaths;next.lives=s.lives;next.nextLifeCoin=s.nextLifeCoin;
    // Preserve the current form with its feet placed on the new spawn floor.
    if(s.coop){
        configureCoop(next,s.coop.players.length,s.coop.viewport.w,s.coop.viewport.h);
        for(let i=0;i<s.coop.players.length;i++)asPlayer(next,i,()=>grantPower(next,playerAt(s,i).power));
    }else grantPower(next,s.power);
    next.events=[];next.eventSerial=s.eventSerial;
    next.notice=`进入 ${next.level.name}`;return next;
}

export function courseComplete(s:State):boolean {
    return s.phase==='won'&&s.victory?.stage==='done'&&s.victory.age>=2&&
        (!s.coop||s.coop.players.every((_,index)=>playerAt(s,index).victory?.stage==='done'));
}
