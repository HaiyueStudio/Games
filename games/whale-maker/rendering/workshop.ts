import type { State, Level, Tile, Enemy } from '../rules/model';
import type { WhaleScene2D } from './WhaleScene2D';
import { snakePath, initialSnake } from '../rules/snake-path';
export function drawWorkshopTile(scene:WhaleScene2D,l:Level,t:Tile,x:number,y:number,px:number,py:number,z:number,time:number,editing:boolean):boolean{
    if(t==='speed-belt'){
        scene.fill({x:px,y:py+z*.35,width:z,height:z*.65},[.04,.27,.31,1]);
        scene.sprite('workshop',Math.floor(time*10)%4,px,py,z,z*.65);return true;
    }
    if((t==='snake-block'||t==='snake-fast')&&editing){
        const id=y*l.width+x,path=snakePath(l,id);
        for(let n=1;n<path.length;n++){const a=path[n-1]!,b=path[n]!,dx=(b[0]-a[0])*z,dy=(b[1]-a[1])*z,length=Math.hypot(dx,dy);scene.fill({x:px+(a[0]+.5)*z+dx/2-length/2,y:py+(a[1]+.5)*z+dy/2-1.5,width:length,height:3},[.19,.9,.31,.7],Math.atan2(dy,dx));}
        for(const block of initialSnake(l,id))scene.sprite('workshop',4,px+(block.x-x)*z,py+(block.y-y)*z,z,z);
        for(const p of path)scene.fill({x:px+(p[0]+.4)*z,y:py+(p[1]+.4)*z,width:z*.2,height:z*.2},[.95,1,.45,.9]);return true;
    }
    return false;
}
export function drawWorkshopEnemy(scene:WhaleScene2D,e:Enemy,x:number,feet:number,z:number,time:number):boolean{
    if(e.kind==='bomb'){
        const armed=e.bombFuse!==undefined,frame=armed?12+Math.floor(time*(e.bombFuse!<1?24:10))%4:8+(Math.abs(e.vx)>.1?Math.floor((e.age??0)*9)%4:0);
        scene.actor('workshop',frame,x,feet,z,e.vx<0,8);return true;
    }
    if(e.kind==='hammer-otter'){
        const frame=(e.hammerPoseAge??1)<.28?6:(e.hammerWait??1)<.32?4+Math.floor((e.hammerWait??0)*12)%2:!e.grounded?(e.vy<0?3:7):Math.abs(e.vx)>.1?1+Math.floor((e.age??0)*8)%2:0;
        scene.actor('hammer-otter',frame,x,feet,1.46*z,(e.hammerFacing??-1)>0,0);return true;
    }
    return false;
}
export function drawWorkshop(scene:WhaleScene2D,s:State,cam:number,cy:number,z:number,v:{x:number;y:number}):void{
    for(const route of s.snakes)for(const b of route.blocks)scene.sprite(route.kind==='snake-fast'?'p1-icons':'workshop',route.kind==='snake-fast'?6:4,v.x+(b.x-cam)*z,v.y+(b.y-cy)*z,z,z);
    for(const h of s.hammers)scene.centeredActor('workshop',7,v.x+(h.x+h.w/2-cam)*z,v.y+(h.y+h.h/2-cy)*z,z*.5,7,h.angle);
}
export function drawWorkshopEffect(scene:WhaleScene2D,fx:State['effects'][number],x:number,y:number,z:number):boolean{
    if(fx.kind==='wood'){scene.centeredActor('workshop',6,x,y,z*(.8+fx.age*2),6,fx.age*.4,Math.max(0,1-fx.age/.4));return true;}
    if(fx.kind==='blast'){scene.centeredActor('mechanics',6+Math.min(3,Math.floor(fx.age*10)),x,y,z*3,6,0,Math.max(0,1-fx.age/.4));return true;}
    return false;
}
