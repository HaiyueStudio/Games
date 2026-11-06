import { classicData } from '../levels/classic-data';
import { create, type Level, type State } from './model';
import { grantPower } from './power';

const stages=classicData;
export function classicLevel(index=0):Level { return structuredClone(stages[Math.max(0,Math.min(3,index))]) as Level; }
/** Advance only after the complete flag/celebration/castle sequence. */
export function nextClassic(s:State):State|null {
    const stage=s.startLevel.classicStage;
    if(!stage||stage>=4||s.phase!=='won'||s.victory?.stage!=='done'||s.victory.age<2)return null;
    const next=create({...classicLevel(stage),...(s.level.rules?{rules:{...s.level.rules}}:{})});next.coins=s.coins;next.score=s.score;next.deaths=s.deaths;
    // Preserve the current form with its feet placed on the new spawn floor.
    grantPower(next,s.power);next.events=[];next.eventSerial=s.eventSerial;
    next.notice=`进入 ${next.level.name}`;return next;
}
