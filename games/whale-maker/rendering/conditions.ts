import type { State } from '../rules/model';
import { conditionProgress } from '../rules/conditions';
import type { WhaleScene2D } from './WhaleScene2D';

/** World-space achievement flag; follows every body form without GUI layout. */
export function drawClearFlag(scene:WhaleScene2D,s:State,headX:number,headY:number,z:number,time:number,top:number):void {
    if(!s.level.condition||!conditionProgress(s).done||s.phase==='dead'||s.pipe||s.door||s.victory?.stage==='done')return;
    const bob=Math.sin(time*5)*.04*z,x=headX-.3*z,y=Math.max(top+.12*z,headY-.95*z+bob);
    const pulse=.55+.15*Math.sin(time*6);
    scene.dustParticle(x+.36*z,y+.3*z,.48*z,pulse,[1,.91,.44,.32]);
    scene.fill({x,y,width:.045*z,height:.72*z},[.42,.29,.08,1]);
    scene.fill({x:x+.012*z,y,width:.02*z,height:.72*z},[1,.94,.57,1]);
    scene.dustParticle(x+.022*z,y,.065*z,1,[1,.85,.27,1]);
    scene.sprite('goal-flags',Math.floor(time*8)%4,x+.045*z,y+.015*z,.67*z,.53*z);
    // Gold check beside the flag is readable at small character scale.
    const cx=x+.67*z,cy=y+.48*z;
    scene.fill({x:cx-.1*z,y:cy,width:.18*z,height:.045*z},[1,.8,.18,1],Math.PI/4);
    scene.fill({x:cx+.005*z,y:cy-.075*z,width:.28*z,height:.045*z},[1,.8,.18,1],-Math.PI/4);
}
