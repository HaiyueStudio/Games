import type { Body, State } from './model';
import type { Services } from './services';
import { pathLength,pathPoint } from './snake-path';
export function advanceP2Camera(s:State,dt:number):void {if(s.level.cameraRules?.mode==='auto'&&s.phase==='playing')s.cameraTravel+=dt*(s.level.properties?.[s.cameraRail]?.pace??s.level.cameraRules.speed??1);}
export function cameraFor(s:State,follow:{x:number;y:number},w:number,h:number):{x:number;y:number} {
    if(s.phase==='won'||s.level.cameraRules?.mode!=='auto')return stopCamera(s,follow,w,h);
    const id=s.cameraRail,path=id>=0?s.level.properties?.[id]?.path:undefined;
    const offset=path?pathPoint(path,Math.min(pathLength(path),s.cameraTravel)):s.level.cameraRules.axis==='y'?[0,s.cameraTravel]:[s.cameraTravel,0];
    const x=(id>=0?id%s.level.width:0)+offset[0]!,y=(id>=0?Math.floor(id/s.level.width):s.level.cameraRules.axis==='y'?0:follow.y)+offset[1]!;
    return stopCamera(s,{x:Math.max(0,Math.min(s.level.width-w,x)),y:Math.max(0,Math.min(s.level.height-h,y))},w,h);
}
function stopCamera(s:State,value:{x:number;y:number},w:number,h:number):{x:number;y:number} {
    const p=s.player,id=s.cameraStops.find(n=>{const x=n%s.level.width,y=Math.floor(n/s.level.width),a=s.level.properties?.[n];return p.x+p.w>x&&p.x<x+(a?.width??4)&&p.y+p.h>y&&p.y<y+(a?.depth??4);});
    if(id===undefined){s.cameraHold=null;return value;}if(!s.cameraHold)s.cameraHold={...value};return {x:Math.max(0,Math.min(s.level.width-w,s.cameraHold.x)),y:Math.max(0,Math.min(s.level.height-h,s.cameraHold.y))};
}
export function cameraCrush(s:State,svc:Services):void {if(s.level.cameraRules?.mode!=='auto'||s.phase!=='playing')return;const p=s.player,v=s.view;if(p.x+p.w<v.x-.3||p.y+p.h<v.y-.3)svc.crush(s);}
