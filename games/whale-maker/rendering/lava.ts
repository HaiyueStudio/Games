import type {State} from '../rules/model';
import type {WhaleScene2D} from './WhaleScene2D';
import {enemyArt} from './expansion';
/** These draws precede the lava tiles, which naturally occlude submerged pixels. */
export function drawSinkingEnemies(scene:WhaleScene2D,s:State,cam:number,cy:number,z:number,v:{x:number;y:number}):void{
    for(const e of s.defeated)if(e.cause==='lava'){
        const art=enemyArt(e,s.time),frame=e.kind==='bomb'&&e.bombFuse!==undefined?12+Math.floor(s.time*10)%4:art.frame;
        scene.actor(art.atlas,frame,v.x+(e.x+e.w/2-cam)*z,v.y+(e.y+e.h-cy)*z,art.size,false,art.reference,0,Math.min(1,(.75-e.age)/.2),[1,1-e.age*.6,1-e.age*.8,1]);
    }
}
export function drawLavaSplashes(scene:WhaleScene2D,s:State,cam:number,cy:number,z:number,v:{x:number;y:number}):void{
    for(const e of s.defeated)if(e.cause==='lava')for(let n=0;n<5;n++){
        const t=e.age/.75,x=v.x+(e.x+e.w/2-cam+(n-2)*.12+t*(n-2)*.12)*z,y=v.y+((e.lavaY??e.y)-cy-.08-Math.sin(t*Math.PI)*(.12+n%2*.1))*z;
        scene.dustParticle(x,y,z*(.025+.035*Math.sin(t*Math.PI)),1-t,[1,.45+.1*(n%2),.08,.85]);
    }
}
