import type { Level, Tile } from './model';

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
