import {p2Art} from './p2';
import { p1Art } from './p1';
import type { Enemy, State, Level, Tile, Item } from '../rules/model';
import { tile } from '../rules/model';
import { GADGET_ART, CREATURE_ART, ENVIRONMENT_ART } from '../rules/catalog';
import { firebarPoints, P_SWITCH_VANISH_TIME } from '../rules/expansion';
import type { WhaleScene2D } from './WhaleScene2D';
import { ENEMY_SIZE, coinFrame } from './poses';
import { drawSnowball } from './desert';

const ADVENTURE_ART:Record<string,number>={key:0,'locked-door':1,stone:3,vine:6,'spike-all':7};
const MECHANISM_ART:Record<string,number>={'toggle-switch':0,'red-block':2,'blue-block':3};
export function extraArt(t:string,time=0):{atlas:string;frame:number}|null {
    const p2=p2Art(t,time);if(p2)return p2;const p1=p1Art(t,time);if(p1)return p1;
    if(t==='coin')return {atlas:'tokens',frame:coinFrame(time)};
    if(t==='ice-solid')return {atlas:'devices',frame:11};
    if(t==='quicksand'||t==='cactus'||t==='snowball')return {atlas:'desert-icons',frame:t==='quicksand'?0:t==='cactus'?1:2};
    if(t==='smile-cloud')return {atlas:'world',frame:14};
    if(t==='speed-belt'||t==='snake-block'||t==='wood-crate'||t==='bomb')return {atlas:'workshop',frame:t==='speed-belt'?Math.floor(time*10)%4:t==='snake-block'?4:t==='wood-crate'?5:8+Math.floor(time*9)%4};
    if(t==='hammer-otter')return {atlas:'hammer-otter',frame:0};
    if(t==='ice-flower')return {atlas:'frost',frame:Math.floor(time*7)%4};
    if(t==='fire-jumper')return {atlas:'frost',frame:4+Math.floor(time*10)%4};
    if(t==='firebar')return {atlas:'firebar-anchor',frame:0};
    if(t==='turtle-boss')return {atlas:'reef-boss',frame:Math.floor(time*7)%4};
    if(t==='bridge'||t==='moving-platform')return {atlas:'reef-bridge',frame:0};
    if(t==='bridge-bell')return {atlas:'reef-bridge',frame:2};
    if(t==='lava')return {atlas:'lava',frame:Math.floor(time*6)%4};
    if(t==='G'||t==='growth'||t==='giant-pearl')return {atlas:'pearls',frame:t==='giant-pearl'?1:0};
    if(ADVENTURE_ART[t]!==undefined)return {atlas:'adventure',frame:ADVENTURE_ART[t]!};
    if(t==='hidden-block')return {atlas:'world',frame:1};
    if(MECHANISM_ART[t]!==undefined)return {atlas:'mechanics',frame:MECHANISM_ART[t]!};
    if(t==='ghost')return {atlas:'devices',frame:4};if(t==='cannonball')return {atlas:'devices',frame:2};if(t==='iron-turtle')return {atlas:'devices',frame:8};if(t==='ice')return {atlas:'devices',frame:11};if(t==='cannon')return {atlas:'devices',frame:0};
    if(t==='glass-pipe')return {atlas:'clear',frame:2};
    if(t==='squid')return {atlas:'squid2',frame:Math.floor(time*8)%4};
    if(t==='star')return {atlas:'environment',frame:12+Math.floor(time*8)%4};
    if(CREATURE_ART[t]!==undefined)return {atlas:'creatures',frame:CREATURE_ART[t]!};
    if(GADGET_ART[t]!==undefined)return {atlas:'gadgets',frame:GADGET_ART[t]!};
    if(ENVIRONMENT_ART[t]!==undefined)return {atlas:'environment',frame:ENVIRONMENT_ART[t]!};return null;
}
export function enemyArt(e:Pick<Enemy,'kind'|'vx'|'h'> & Partial<Pick<Enemy,'held'|'mode'|'iron'|'shy'|'vy'>>,time:number,index=0):{atlas:string;frame:number;reference:number;size:number} {
    const p2=p2Art(e.kind,time);if(p2)return {...p2,reference:p2.frame-p2.frame%(p2.atlas==='p2-bills'?4:8),size:ENEMY_SIZE[e.kind]};
    const p1=p1Art(e.kind,time);if(p1)return {...p1,reference:p1.frame-p1.frame%8,size:ENEMY_SIZE[e.kind]};
    if(e.kind==='cactus')return {atlas:'desert-icons',frame:1,reference:1,size:48};
    if(e.kind==='bomb')return {atlas:'workshop',frame:8+Math.floor(time*9)%4,reference:8,size:48};
    if(e.kind==='hammer-otter')return {atlas:'hammer-otter',frame:1+Math.floor(time*8)%2,reference:0,size:70};
    if(e.kind==='fire-jumper')return {atlas:'frost',frame:4+((e.vy??0)<0?Math.floor(time*12)%2:2+Math.floor(time*10)%2),reference:4,size:48};
    if(e.kind==='ghost'||e.kind==='cannonball'){const ghost=e.kind==='ghost';return {atlas:'devices',frame:ghost?4+(e.shy?2:0)+Math.floor(time*6)%2:2+Math.floor(time*8)%2,reference:ghost?4:2,size:ENEMY_SIZE[e.kind]};}
    if(e.kind==='iron-turtle'||e.kind==='shell'&&e.iron)return {atlas:'devices',frame:e.kind==='shell'?10:8+Math.floor(time*8)%2,reference:e.kind==='shell'?10:8,size:ENEMY_SIZE[e.kind]};
    if(e.kind==='squid')return {atlas:'squid2',frame:Math.floor(time*8)%4,reference:0,size:76};
    if(e.kind==='shell')return {atlas:'shell',frame:0,reference:0,size:ENEMY_SIZE.shell};
    const extra=CREATURE_ART[e.kind];
    if(extra!==undefined){let frame=extra+Math.floor(time*8+index)%4;if(e.kind==='plant'&&e.mode==='pipe')frame=16+frame*8+Math.max(0,Math.min(7,Math.ceil(e.h/1.15*8)-1));return {atlas:'creatures',frame,reference:extra,size:ENEMY_SIZE[e.kind]};}
    const reference=e.kind==='turtle'?4:0,walking=!e.held&&Math.abs(e.vx)>.1;return {atlas:'expansion',frame:reference+(walking?Math.floor(time*8+index)%4:0),reference,size:ENEMY_SIZE[e.kind]};
}
/** A hollow dashed arch, recorded in the same ordinary 2D pass as the door. */
export function drawInactivePDoor(scene:WhaleScene2D,centerX:number,feetY:number,z:number):void {
    const tint=[.06,.4,.57,.95] as const;
    const stroke=(points:readonly (readonly [number,number])[],dash=.16,gap=.12,width=.055)=>{
        let distance=0;
        for(let n=1;n<points.length;n++){
            const a=points[n-1]!,b=points[n]!,dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length===0)continue;
            for(let at=0;at<length;){
                const phase=(distance+at)%(dash+gap),paint=phase<dash,span=Math.min(length-at,(paint?dash:dash+gap)-phase);
                if(span<1e-8){at+=1e-8;continue;}
                if(paint){const mid=(at+span/2)/length;scene.fill({x:centerX+(a[0]+dx*mid-span/2)*z,y:feetY+(a[1]+dy*mid-width/2)*z,width:span*z,height:width*z},tint,Math.atan2(dy,dx));}
                at+=span;
            }
            distance+=length;
        }
    };
    const arch:[number,number][]=[[-.78,0],[-.78,-1.13]];
    for(let n=1;n<=24;n++){const angle=Math.PI+n*Math.PI/24;arch.push([Math.cos(angle)*.78,-1.13+Math.sin(angle)*.78]);}
    arch.push([.78,0],[-.78,0]);stroke(arch);
    // The P marker remains hollow, with no inactive door panel behind it.
    stroke([[-.19,-.48],[-.19,-1.12],[.09,-1.12],[.23,-1.02],[.23,-.84],[.09,-.75],[-.19,-.75]],.12,.075,.06);
}
export function drawExtraTile(scene:WhaleScene2D,s:State,l:Level,t:Tile,x:number,y:number,px:number,py:number,z:number,time:number,editing:boolean):boolean {
    if(t==='hidden-block'){if(editing){scene.sprite('world',1,px,py,z,z,false,0,.4);scene.fill({x:px+z*.15,y:py+z*.15,width:z*.7,height:2},[1,1,1,.8]);}return true;}
    if(t==='stone-body')return true;
    if(t==='stone'){if(editing)scene.sprite('adventure',3,px-.1*z,py-.2*z,2.2*z,2.2*z);return true;}
    if(t==='vine'){scene.sprite('adventure',6,px+z*.25,py,z*.5,z);return true;}
    if(t==='spike-all'){scene.sprite('adventure',7,px,py,z,z);return true;}
    if(t==='water'){
        // Mirror interior samples at each edge to keep water continuous and
        // retain the shape of the caustics and bubbles at any pool depth.
        const mirrorY=y%2!==0;
        scene.sprite('environment',16+Math.floor(time*6)%4,px,py,z,z,(x%2!==0)!==mirrorY,mirrorY?Math.PI:0);
        if(tile(l,x,y-1)!=='water')scene.sprite('environment',Math.floor(time*8)%4,px,py-z*.08,z,z*.4);
        return true;
    }
    if(t==='glass-pipe'){if(l.properties?.[y*l.width+x]?.path)return true;let h=1;while(tile(l,x,y+h)==='glass-left-shaft')h++;scene.sprite('gadgets',17,px+.12*z,py+.5*z,1.76*z,(h-.5)*z,false,0,.6);scene.sprite('gadgets',16,px,py,2*z,z*.78,false,0,.75);return true;}
    if(['glass-right','glass-left-shaft','glass-right-shaft','glass-body'].includes(t))return true;
    if(t==='p-on'||t==='p-off'){const active=t==='p-on'?s.pTime>0:s.pTime===0;scene.sprite('environment',active?10:11,px,py,z,z);return true;}
    if(t==='door'||t==='p-door'||t==='locked-door'){
        const id=y*l.width+x,open=!!s.door&&(s.door.source===id||s.door.target===id);
        if(t==='p-door'&&(editing||s.pTime===0))drawInactivePDoor(scene,px+z/2,py+z,z);
        else if(t==='locked-door')scene.actor('adventure',open||!editing&&s.unlockedDoors[id]?2:1,px+z/2,py+z+(open?.1*z:0),2*z,false,1);
        else scene.actor('gadgets',(t==='door'?11:13)+(open?1:0),px+z/2,py+z+(open?.1*z:0),2*z,false,t==='door'?11:13);
        return true;
    }
    if(t==='firebar'){scene.sprite('firebar-anchor',0,px,py,z,z);scene.actor('gadgets',15,px+z/2,py+z*.75,z*.5);for(const point of firebarPoints(l,x,y,time))scene.actor('gadgets',15,px+(point.x-x)*z,py+(point.y-y)*z+z*.22,z*.44,false,15,time*2);return true;}
    if(t==='spring-h'){const compressed=s.springEffects.some(f=>f.kind==='spring-h'&&f.x===x&&f.y===y&&f.age<.16);scene.actor('gadgets',compressed?5:4,px+z/2,py+z,44*z/48,false,4);return true;}
    if(t==='G'){scene.actor('pearls',0,px+z/2,py+z,z);return true;}
    if(editing&&t==='giant-pearl'){scene.actor('pearls',1,px+z,py+z,2*z);return true;}
    if(editing&&t==='pow'){scene.sprite('gadgets',10,px,py,z,z);return true;}
    if(editing){const art=extraArt(t,time);if(art){scene.actor(art.atlas,art.frame,px+z/2,py+z,t==='plant'?1.25*z:z*.9);return true;}}return false;
}
export function drawItem(scene:WhaleScene2D,s:State,item:Item,x:number,feet:number,z:number):void {
    if(item.kind==='koopa-car')return;
    if(item.kind==='coin'){scene.actor('tokens',coinFrame(s.time),x,feet,40*z/48,false,0);return;}
    if(item.kind==='snowball'||item.kind==='snowball-large'){drawSnowball(scene,item,x,feet,z*(item.kind==='snowball-large'?2:1));return;}
    const art=extraArt(item.kind,s.time)!;let frame=art.frame;
    if(item.kind==='p-switch'&&item.spent)frame=9;
    if(item.kind==='spring-h'&&(item.compression??0)>0)frame=5;
    if(item.kind==='spring-v'&&((item.compression??0)>0||s.springEffects.some(f=>f.kind==='spring-v'&&Math.abs(f.x-item.x)<.2&&f.age<.16)))frame=3;
    const opacity=item.kind==='p-switch'&&item.spent?Math.max(0,Math.min(1,(P_SWITCH_VANISH_TIME-(item.pressedAge??0))/.18)):1;
    if(item.kind==='red-pow'){scene.sprite('p1-icons',4,x-z/2,feet-z,z,z);return;}
    if(item.kind==='pow'||item.kind==='wood-crate')scene.sprite(art.atlas,frame,x-z/2,feet-z,z,z);
    else scene.actor(art.atlas,frame,x,feet,item.kind==='giant-pearl'?2*z:(item.kind==='spring-v'?44:item.kind==='basin'?44:40)*z/48,item.vx<0,art.frame,(item.rotation??0)*Math.PI/180,opacity);
}
