import type { State, Level, Tile } from '../rules/model';
import { tile } from '../rules/model';
import type { WhaleScene2D } from './WhaleScene2D';

export function drawFortressTile(scene:WhaleScene2D,s:State,l:Level,t:Tile,x:number,y:number,px:number,py:number,z:number,time:number,editing:boolean):boolean {
    if(t==='boss-body')return true;
    if(t==='turtle-boss'){if(editing)scene.actor('reef-boss',Math.floor(time*7)%4,px+z,py+2*z,2.5*z,false,0);return true;}
    if(t==='moving-platform'){if(editing)for(let n=0;n<(l.properties?.[y*l.width+x]?.length??3);n++)scene.sprite('reef-bridge',0,px+n*z,py,z,.3*z,n%2===1);return true;}
    if(t==='bridge'){
        scene.sprite('reef-bridge',0,px,py,z,.3*z,x%2===1);
        // Side ropes stay above the deck, so the deck's visual top agrees with collision.
        scene.fill({x:px,y:py-.65*z,width:z,height:.035*z},[.15,.65,.66,1]);
        if(editing&&(tile(l,x-1,y)!=='bridge'||tile(l,x+1,y)!=='bridge'))scene.actor('reef-bridge',1,px+z*.5,py+.3*z,z*.95);
        return true;
    }
    if(t==='bridge-bell'){const active=!editing&&!!s.releasedBells[y*l.width+x];scene.actor('reef-bridge',2,px+z*.5,py+z,z*1.2,false,2,active?Math.sin(s.time*18)*.17:Math.sin(time*3)*.035);return true;}
    if(t==='lava'||editing&&t==='fire-jumper'&&[tile(l,x-1,y),tile(l,x+1,y)].includes('lava')){
        const frame=Math.floor(time*6)%4,mirrorY=y%2!==0;
        scene.sprite('lava',4+frame,px,py,z,z,(x%2!==0)!==mirrorY,mirrorY?Math.PI:0);
        if(tile(l,x,y-1)!=='lava')scene.sprite('lava',frame,px,py-.24*z,z,1.24*z,x%2!==0);
        return t==='lava';
    }
    return false;
}
export function drawFortress(scene:WhaleScene2D,s:State,cam:number,cy:number,z:number,v:{x:number;y:number}):void {
    for(const a of s.bridgeAnchors)scene.actor('reef-bridge',1,v.x+(a.x-cam)*z,v.y+(a.y-cy)*z,z*.95);
    for(const p of s.platforms)for(let n=0;n<p.w;n++)scene.sprite('reef-bridge',0,v.x+(p.x+n-cam)*z,v.y+(p.y-cy)*z,Math.min(1,p.w-n)*z,.3*z,n%2===1);
    for(const d of s.bridgeDebris)scene.sprite('reef-bridge',0,v.x+(d.x-cam)*z,v.y+(d.y-cy)*z,z,.3*z,false,d.age*2,Math.min(1,(1.5-d.age)*2));
    for(const b of s.bosses){
        if(b.phase==='gone'||b.brain)continue;
        const frame=b.phase==='fall'?(b.age<.4?9:b.age<.8?10:11):b.hurt>0?8:b.phase==='breath'?4+Math.min(3,Math.floor((b.cycle-(b.fireAt-.65))/.65*4)):Math.floor(b.age*7)%4;
        scene.actor('reef-boss',frame,v.x+(b.x+1-cam)*z,v.y+(b.y+2-cy)*z,2.5*z,b.facing>0,0,b.phase==='fall'?b.age*.8:0,b.hurt>0&&Math.floor(b.hurt*30)%2?.55:1);
        if(b.health>0){const width=1.4*z;scene.fill({x:v.x+(b.x+1-cam)*z-width/2,y:v.y+(b.y-cy)*z-.28*z,width,height:.1*z},[.1,.15,.3,.9]);scene.fill({x:v.x+(b.x+1-cam)*z-width/2,y:v.y+(b.y-cy)*z-.28*z,width:width*b.health/5,height:.1*z},[1,.45,.32,1]);}
    }
    for(const f of s.bossFire)scene.centeredActor('reef-bridge',3,v.x+(f.x+.5-cam)*z,v.y+(f.y+f.h/2-cy)*z,1.25*z,3,Math.sin(f.age*18)*.07,1,f.vx>0);
}
