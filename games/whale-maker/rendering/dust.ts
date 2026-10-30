import type { State } from '../rules/model';
import { dustPose } from './poses';
import type { WhaleScene2D } from './WhaleScene2D';

/** World-space dust remains behind the feet as the player moves away. */
export function drawDust(scene:WhaleScene2D,dust:State['dust'],cameraX:number,cameraY:number,z:number,view:{x:number;y:number}):void {
    const lobes=[[-.24,.01,.18],[0,-.1,.24],[.25,.02,.16],[-.42,-.17,.09],[.35,-.3,.07]] as const;
    for(const puff of dust){
        const pose=dustPose(puff.age),size=puff.size*z;
        const x=view.x+(puff.x-cameraX)*z-puff.direction*pose.spread*size*.35;
        const feet=view.y+(puff.y-cameraY)*z-pose.lift*size;
        for(const [dx,dy,r]of lobes){
            const cx=x+dx*size*(.6+pose.spread),cy=feet+dy*size*(.5+pose.spread),radius=r*size*pose.scale;
            scene.dustParticle(cx,cy,radius+1,pose.opacity*.45,[.53,.68,.68,.8]);
            scene.dustParticle(cx,cy-.5,radius,pose.opacity,[1,.96,.84,.9]);
        }
    }
}
