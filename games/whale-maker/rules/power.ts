import type { State } from './model';
import { emit } from './events';

/** Preserve feet and horizontal centre when a power changes the body size. */
export function grantPower(s:State,power:State['power']):void {
    const p=s.player,feet=p.y+p.h,center=p.x+p.w/2;
    if(power>0&&(s.power===0||power===2&&s.power!==2||power===3&&s.power!==3||power===4&&s.power!==4||power>=5&&s.power!==power))emit(s,'power');
    s.power=power;p.w=power===3?1.9:.9;
    p.h=s.riding?.55:s.crouching?(power?.8:.55):power?2:.8;
    p.x=Math.max(0,Math.min(s.level.width-p.w,center-p.w/2));p.y=feet-p.h;
    s.fallPeak=feet;s.giantBounce=false;
}
