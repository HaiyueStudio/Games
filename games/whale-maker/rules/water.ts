import type {Body,Level} from './model';
/** Sample the torso, so merely touching the surface does not count as swimming. */
export function inWater(l:Level,b:Body):boolean {
    return [b.y+b.h*.3,b.y+b.h*.75].some(y=>{
        const x=b.x+b.w/2;
        if(l.liquid?.kind==='water'&&l.liquidSurface!==undefined&&x>=(l.liquid.x??0)&&x<(l.liquid.x??0)+(l.liquid.width??l.width))return y>=l.liquidSurface;
        return l.cells[Math.floor(y)*l.width+Math.floor(x)]==='water';
    });
}
