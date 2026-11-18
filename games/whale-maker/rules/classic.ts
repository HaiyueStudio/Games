import { classicData } from '../levels/classic-data';
import { configureCoop, create, type Level, type State } from './model';
import {asPlayer,playerAt} from './coop-state';
import { grantPower } from './power';

const stages=classicData;
export function classicLevel(index=0):Level {
    const level=structuredClone(stages[Math.max(0,Math.min(3,index))]) as Level;
    return {...level,progress:{lives:true,initialLives:3,...level.progress}};
}
/** Advance only after the complete flag/celebration/castle sequence. */
export function nextClassic(s:State):State|null {
    const stage=s.startLevel.classicStage;
    if(!stage||stage>=4||s.phase!=='won'||s.victory?.stage!=='done'||s.victory.age<2)return null;
    if(s.coop&&s.coop.players.some((_,i)=>playerAt(s,i).victory?.stage!=='done'))return null;
    const next=create({...classicLevel(stage),...(s.level.rules?{rules:{...s.level.rules}}:{}),...(s.level.progress?{progress:{...s.level.progress}}:{})});
    next.coins=s.coins;next.score=s.score;next.deaths=s.deaths;next.lives=s.lives;next.nextLifeCoin=s.nextLifeCoin;
    // Preserve the current form with its feet placed on the new spawn floor.
    if(s.coop){
        configureCoop(next,s.coop.players.length,s.coop.viewport.w,s.coop.viewport.h);
        for(let i=0;i<s.coop.players.length;i++)asPlayer(next,i,()=>grantPower(next,playerAt(s,i).power));
    }else grantPower(next,s.power);
    next.events=[];next.eventSerial=s.eventSerial;
    next.notice=`进入 ${next.level.name}`;return next;
}
