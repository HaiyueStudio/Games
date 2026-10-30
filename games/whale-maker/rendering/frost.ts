import type { Enemy, State } from '../rules/model';
import type { WhaleScene2D } from './WhaleScene2D';
import { enemyArt } from './expansion';

export function drawFrozenEnemy(scene:WhaleScene2D,e:Enemy,x:number,feet:number,z:number):void {
    const art=enemyArt(e,0),width=e.w*z,height=e.h*z;
    const remaining=e.frozen?.remaining??Infinity;
    if(remaining<1.2){x+=Math.sin(remaining*48)*z*.035;scene.fill({x:x-width/2,y:feet-height,width,height},[.9,1,1,.16+.1*Math.sin(remaining*30)]);}
    scene.fill({x:x-width/2,y:feet-height,width,height},[.4,.84,1,.22]);
    scene.fitActor(art.atlas,art.frame,x,feet-height*.06,width*.86,height*.86,e.vx<0,art.reference);
    scene.sprite('frost',10,x-width/2-z*.04,feet-height-z*.04,width+z*.08,height+z*.08);
}
export function drawFrostEffects(scene:WhaleScene2D,s:State,cam:number,cy:number,z:number,v:{x:number;y:number}):void {
    for(const fx of s.effects)if(fx.kind==='frost'){
        const t=Math.min(1,fx.age/.4);scene.centeredActor('frost',t<.4?9:11,v.x+(fx.x-cam)*z,v.y+(fx.y-cy)*z,z*(.4+t),9,t*.7,1-t);
    }
}
