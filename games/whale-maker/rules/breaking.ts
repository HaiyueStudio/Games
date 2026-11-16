import type {State} from './model';
import {setCell} from './terrain';
import {emit} from './events';

/** Shared debris and content teardown for destructive attacks. */
export function shatterTile(s:State,x:number,y:number):void {
    const id=y*s.level.width+x;if(x<0||x>=s.level.width||y<0||y>=s.level.height)return;
    setCell(s.level,id,'.');if(s.level.contents)delete s.level.contents[id];
    emit(s,'break',x+.5);
    for(let n=0;n<4;n++)s.fragments.push({x:x+n%2*.5,y:y+Math.floor(n/2)*.5,w:.35,h:.35,vx:n%2?3:-3,vy:-6-Math.floor(n/2)*2,age:0,angle:n});
    s.fragments=s.fragments.slice(-48);
}
