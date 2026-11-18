import type { Level, Tile } from './model';
import { virtualEndGround } from './course-bounds';
import type { Bounds } from './geometry';

const horizons=new WeakMap<Tile[],{width:number;height:number;row:number}>();
const land=(t:Tile|undefined)=>t==='#'||t==='quicksand';

/** Existing maps are mutated through this helper so terrain analyses stay fresh.
 * New/loaded/undo maps have their own cell arrays and need no retained revision. */
export function setCell(l:Pick<Level,'cells'>,id:number,value:Tile):void {
    if(land(l.cells[id])!==land(value))horizons.delete(l.cells);
    l.cells[id]=value;
}

/** Exposed coral and sand surfaces anchor scenery above the playable ground. */
export function backdropGround(l:Level):number {
    const cached=horizons.get(l.cells);
    if(cached&&cached.width===l.width&&cached.height===l.height)return cached.row;
    let ground=15,best=0;
    for(let row=1;row<l.height;row++){
        let count=0;
        for(let col=0;col<l.width;col++){
            const id=row*l.width+col;
            if(land(l.cells[id])&&!land(l.cells[id-l.width]))count++;
        }
        if(count>best){ground=row;best=count;}
    }
    horizons.set(l.cells,{width:l.width,height:l.height,row:ground});return ground;
}

/** Out-of-bounds sampling has one policy for rules, geometry and generators. */
export const cellAt=(l:Pick<Level,'cells'|'width'|'height'> & Partial<Pick<Level,'endZone'>>,x:number,y:number):Tile=>
    x<0||y<0||y>=l.height?'.':x>=l.width?(virtualEndGround(l,x,Math.floor(y))?'hard-block':'.'):l.cells[Math.floor(y)*l.width+Math.floor(x)]!;

export function slopeAt(l:Level,x:number,y:number):{height:number;grade:number}|null {
    const t=cellAt(l,x,y),row=Math.floor(y),u=x-Math.floor(x);
    if(String(t).startsWith('gentle-')){const second=String(t).endsWith('-body'),up=String(t).startsWith('gentle-up'),v=(u+(second?1:0))/2;return {height:row+(up?1-v:v),grade:up?-.5:.5};}
    return t==='slope-up'?{height:row+1-u,grade:-1}:t==='slope-down'?{height:row+u,grade:1}:null;
}

/** Test the filled triangle, leaving the air above the diagonal traversable. */
export function slopeIntersects(t:Tile,x:number,y:number,b:Bounds):boolean {
    if(t!=='slope-up'&&t!=='slope-down'&&!String(t).startsWith('gentle-'))return false;
    const left=Math.max(x,b.x),right=Math.min(x+1,b.x+b.w);
    if(right-left<.00001||b.y>=y+1-.00001||b.y+b.h<=y+.00001)return false;
    const gentle=String(t).startsWith('gentle-'),up=t==='slope-up'||String(t).startsWith('gentle-up'),offset=String(t).endsWith('-body')?1:0;
    const surface=gentle?y+(up?1-((right-x)+offset)/2:((left-x)+offset)/2):up?y+1-(right-x):y+(left-x);
    // Surface movement samples just inside the feet. Use the same contact tolerance here.
    return b.y+b.h>surface+.003;
}
