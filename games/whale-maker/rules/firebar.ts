import type {Level} from './model';

export function firebarPoints(l:Level,x:number,y:number,time:number):{x:number;y:number}[] {
    const props=l.properties?.[y*l.width+x]??{},n=props.length??4,angle=(props.phase??0)+time*(props.speed??1.5);
    return Array.from({length:n},(_,j)=>({x:x+.5+Math.cos(angle)*(j+1)*.55,y:y+.5+Math.sin(angle)*(j+1)*.55}));
}
