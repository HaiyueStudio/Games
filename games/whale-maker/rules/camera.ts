import type { Body, Level } from './model';
import { courseBounds } from './course-bounds';
export function centeredCamera(l:Pick<Level,'width'|'height'> & Partial<Pick<Level,'playHeight'|'rooms'|'cells'|'endZone'|'warps'>>,p:Body,width:number,height:number):{x:number;y:number}{
    const room=l.rooms?.find(r=>p.x+p.w>r.x&&p.x<r.x+r.w&&p.y>=r.y),top=room?.y??0,bottom=room?room.y+room.h:l.playHeight??l.height;
    const {left,right}=courseBounds(l,p);
    return {x:Math.max(left,Math.min(Math.max(left,right-width),p.x+p.w/2-width/2)),y:Math.max(top,Math.min(Math.max(top,bottom-height),p.y+p.h/2-height/2))};
}
