export interface WindOptions {
    mode:'constant'|'periodic';
    direction:'left'|'right';
    strength:number;
    period:number;
}

export function validWind(value:unknown):value is WindOptions {
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    const {mode,direction,strength,period}=value as Partial<WindOptions>;
    return Object.keys(value).every(key=>['mode','direction','strength','period'].includes(key))&&
        (mode==='constant'||mode==='periodic')&&(direction==='left'||direction==='right')&&
        typeof strength==='number'&&strength>=.25&&strength<=6&&
        typeof period==='number'&&period>=1&&period<=60;
}

/** A gust eases in and out for 70% of its cycle, followed by a calm interval. */
export function windVelocity(wind:WindOptions|undefined,time:number):number {
    if(!wind)return 0;
    const phase=((time%wind.period)+wind.period)%wind.period/wind.period;
    const gust=wind.mode==='constant'?1:phase<.7?Math.sin(Math.PI*phase/.7)**2:0;
    return (wind.direction==='left'?-1:1)*wind.strength*gust;
}
