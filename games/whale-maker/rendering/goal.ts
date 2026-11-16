import type { State } from '../rules/model';
import type { WhaleScene2D } from './WhaleScene2D';
import { poleHeight } from '../rules/goal';
import {conditionProgress} from '../rules/conditions';

export function drawGoalLock(scene:WhaleScene2D,s:State,px:number,py:number,z:number,editing:boolean):void {
    if(editing||!s.level.condition||conditionProgress(s).done||s.phase==='won')return;
    const x=px+.2*z,y=py-1.5*z;
    scene.fill({x:x+.12*z,y:y-.25*z,width:.36*z,height:.4*z},[.9,.94,1,1]);
    scene.fill({x:x+.19*z,y:y-.17*z,width:.22*z,height:.27*z},[.16,.22,.3,1]);
    scene.fill({x,y,width:.6*z,height:.48*z},[.96,.66,.23,1]);
    scene.dustParticle(x+.3*z,y+.18*z,.065*z,1,[.16,.22,.3,1]);
    scene.fill({x:x+.28*z,y:y+.19*z,width:.04*z,height:.13*z},[.16,.22,.3,1]);
}

export function drawGoal(scene:WhaleScene2D,s:State,x:number,y:number,px:number,py:number,z:number,time:number,editing:boolean):void {
    const height=poleHeight(s,x,y);
    const victory=!editing&&s.victory?.poleX===x+.5?s.victory:null;
    const locked=!editing&&!!s.level.condition&&!conditionProgress(s).done&&s.phase!=='won';
    const flagY=y-1+((victory?.flagTarget??y-1)-(y-1))*(victory?.flagProgress??0);
    scene.fill({x:px+.4*z,y:py-height*z,width:.2*z,height:height*z},[.93,.83,.48,1]);
    scene.fill({x:px+.43*z,y:py-height*z,width:.045*z,height:height*z},[1,.97,.79,1]);
    scene.dustParticle(px+.5*z,py-height*z,.16*z,1,[.93,.78,.35,1]);
    scene.dustParticle(px+.455*z,py-height*z-.045*z,.055*z,1,[1,.99,.85,1]);
    scene.sprite('goal-flags',Math.floor(time*8)%4,px+.6*z,py+(flagY-y)*z,z,z,false,0,1,locked?[.48,.51,.56,1]:undefined);
    scene.sprite('world',1,px,py,z,z);
    drawGoalLock(scene,s,px,py,z,editing);
}
