import type { Level } from '../rules/model';
import type { WhaleScene2D } from './WhaleScene2D';

/** Authoring keeps stored cells visible, but marks the part outside the course. */
export function drawCourseEdge(scene:WhaleScene2D,l:Level,right:number,cam:number,z:number,view:{x:number;y:number;w:number;h:number},editing:boolean):void {
    const x=view.x+(right-cam)*z;
    if(x<view.x+view.w){const start=Math.max(view.x,x);scene.fill({x:start,y:view.y,width:view.x+view.w-start,height:view.h},[.025,.075,.12,editing?.58:1]);}
    if(x>=view.x&&x<=view.x+view.w){
        for(let y=view.y;y<view.y+view.h;y+=18)scene.fill({x:x-2,y,width:4,height:Math.min(11,view.y+view.h-y)},[1,.82,.38,.9]);
        if(editing)for(let y=view.y+10;y<view.y+view.h;y+=36)scene.fill({x:x+6,y,width:13,height:2},[1,.82,.38,.7],Math.PI/4);
    }
    if(editing&&l.endZone&&l.width<right){const start=Math.max(view.x,view.x+(l.width-cam)*z),end=Math.min(view.x+view.w,x);if(end>start)scene.fill({x:start,y:view.y,width:end-start,height:view.h},[1,.82,.38,.09]);}
}
