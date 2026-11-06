import type { Level, State, Tile, Body, Enemy } from '../rules/model';
import type { WhaleScene2D } from './WhaleScene2D';

/** Eight equal-stride phases, preserving the original painted torso and head. */
export function ironGait(time:number,moving:boolean):{x:number;y:number}[] {
    const phase=Math.floor(Math.max(0,time)*12)%8*Math.PI/4;
    return [0,Math.PI,Math.PI,0].map(offset=>({x:moving?Math.sin(phase+offset)*2:0,y:moving?Math.max(0,Math.cos(phase+offset))*1.5:0}));
}
export function drawIronTurtle(scene:WhaleScene2D,e:Pick<Enemy,'vx'> & Partial<Pick<Enemy,'age'>>,x:number,feet:number,size:number,opacity=1,rotation=0):void {
    const scale=size/336,flip=e.vx>0,direction=flip?-1:1,gait=ironGait(e.age??0,Math.abs(e.vx)>.1),pivot=feet-147*scale;
    const part=(frame:number,cx:number,cy:number,step?:{x:number;y:number})=>{
        const dx=((cx-168)*scale+(step?.x??0)*size/58)*direction,dy=(cy-147)*scale-(step?.y??0)*size/58;
        scene.centeredActor('iron-parts',frame,x+Math.cos(rotation)*dx-Math.sin(rotation)*dy,pivot+Math.sin(rotation)*dx+Math.cos(rotation)*dy,size,0,rotation,opacity,flip);
    };
    part(4,265.5,255,gait[0]);part(2,77.5,253,gait[1]);
    part(4,289.5,264,gait[2]);part(3,191.5,234,gait[3]);
    part(0,168,111.5);part(1,264.5,233.5);
}

export function drawCannon(scene:WhaleScene2D,body:Body,x:number,y:number,z:number,left:boolean):void {
    for(let n=1;n<body.h;n++)scene.sprite('devices',1,x,y+n*z,z,z);
    scene.actor('devices',0,x+z/2,y+z+(body.h>1?.16*z:0),1.18*z,!left);
}
export function drawAnimatedEnemy(scene:WhaleScene2D,e:Pick<Enemy,'kind'> & Partial<Pick<Enemy,'shy'|'age'|'vx'>>,x:number,feet:number,size:number,opacity=1):boolean {
    if(e.kind==='iron-turtle'){drawIronTurtle(scene,{vx:e.vx??0,age:e.age??0},x,feet,size,opacity);return true;}
    if(e.kind!=='ghost'&&e.kind!=='cannonball')return false;
    const frame=e.kind==='ghost'?4+(e.shy?2:0)+Math.floor((e.age??0)*6)%2:2+Math.floor((e.age??0)*8)%2;
    scene.actor('devices',frame,x,feet,size,(e.vx??0)>0,e.kind==='ghost'?4:2,0,opacity);
    return true;
}
export function drawAdvancedTile(scene:WhaleScene2D,s:State,l:Level,t:Tile,x:number,y:number,px:number,py:number,z:number,editing:boolean,drawFrozen:(content:string)=>void):boolean {
    if(t==='cannon-body')return true;
    if(t==='cannon'){if(editing){const h=l.properties?.[y*l.width+x]?.height??2;drawCannon(scene,{x,y:y-h+1,w:1,h,vx:0,vy:0},px,py-(h-1)*z,z,true);}return true;}
    if(t==='toggle-switch'){scene.sprite('mechanics',(editing||s.redOn)?0:1,px,py,z,z);return true;}
    if(t==='red-block'||t==='blue-block'){
        const red=t==='red-block',active=red===s.redOn;
        if(active)scene.sprite('mechanics',red?2:3,px,py,z,z);
        else{const color=red?[1,.2,.24,.8] as const:[.13,.48,1,.8] as const;for(let n=0;n<4;n++){const d=n*z/4;scene.fill({x:px+d,y:py,width:z*.15,height:2},color);scene.fill({x:px+d,y:py+z-2,width:z*.15,height:2},color);scene.fill({x:px,y:py+d,width:2,height:z*.15},color);scene.fill({x:px+z-2,y:py+d,width:2,height:z*.15},color);}}
        return true;
    }
    if(t==='ice'||t==='ice-solid'){
        if(t==='ice')drawFrozen(l.contents?.[y*l.width+x]??'empty');
        scene.sprite('devices',11,px,py,z,z,false,0,t==='ice'?.6:.92);
        if(t==='ice-solid'){
            const c=[.82,.98,1,.9] as const;scene.fill({x:px+z*.18,y:py+z*.48,width:z*.64,height:z*.04},c);
            scene.fill({x:px+z*.48,y:py+z*.18,width:z*.04,height:z*.64},c);
        }return true;
    }
    return false;
}
