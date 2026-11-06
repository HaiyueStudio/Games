import type { State } from '../rules/model';
import type { WhaleScene2D } from './WhaleScene2D';
import { GOAL_HEIGHT, poleHeight } from '../rules/goal';

export function drawGoal(scene:WhaleScene2D,s:State,x:number,y:number,px:number,py:number,z:number,time:number,editing:boolean):void {
    const height=poleHeight(s,x,y);
    const victory=!editing&&s.victory?.poleX===x+.5?s.victory:null;
    const flagY=y-1+((victory?.flagTarget??y-1)-(y-1))*(victory?.flagProgress??0);
    scene.fill({x:px+.4*z,y:py-height*z,width:.2*z,height:height*z},[.93,.83,.48,1]);
    scene.fill({x:px+.43*z,y:py-height*z,width:.045*z,height:height*z},[1,.97,.79,1]);
    scene.dustParticle(px+.5*z,py-height*z,.16*z,1,[.93,.78,.35,1]);
    scene.dustParticle(px+.455*z,py-height*z-.045*z,.055*z,1,[1,.99,.85,1]);
    scene.sprite('goal-flags',Math.floor(time*8)%4,px+.6*z,py+(flagY-y)*z,z,z);
    scene.sprite('world',1,px,py,z,z);
}
