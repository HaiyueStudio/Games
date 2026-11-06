import {validate,type Level} from '../rules/model';
export const MAX_LEVEL_HEIGHT=256;
/** Extension never moves existing terrain. Shrinking must not discard content. */
export function resizeLevelHeight(level:Level,height:number,main?:Level):Level|null{
    if(!Number.isInteger(height)||height<10||height>MAX_LEVEL_HEIGHT)return null;
    if(height<level.height&&level.cells.slice(height*level.width).some(t=>t!=='.'))return null;
    const next=structuredClone(level);next.height=height;next.cells=Array.from({length:height*level.width},(_,n)=>level.cells[n]??'.');
    if(next.playHeight!==undefined)next.playHeight=height;
    try{return validate(next,main!==undefined,main);}catch{return null;}
}
