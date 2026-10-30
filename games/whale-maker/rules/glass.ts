import { rulesFor } from './profile';
import type { Level, State, Input, Tile, Body } from './model';
import { emit } from './events';
import { setCell } from './terrain';
import { switchObstacles } from './switches';
export type Point=[number,number];
export const GLASS_RADIUS=2.4;
export const GLASS_DIAMETER=1.6;
export const DEFAULT_GLASS_PATH:Point[]=[[0,0],[0,3],[8,3],[8,0]];
export const isGlass=(t:string)=>['glass-pipe','glass-body','glass-right','glass-left-shaft','glass-right-shaft'].includes(t);
const direction=(a:Point,b:Point):Point=>[Math.sign(b[0]-a[0]),Math.sign(b[1]-a[1])];
const distance=(a:Point,b:Point)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
export function compactGlassPath(points:Point[]):Point[]{
    const out:Point[]=[];
    for(const p of points){if(out.length&&distance(out.at(-1)!,p)<.00001)continue;out.push([...p]);while(out.length>=3){const [a,b,c]=out.slice(-3) as [Point,Point,Point],u=direction(a,b),v=direction(b,c);if(u[0]!==v[0]||u[1]!==v[1])break;out.splice(-2,1);}}
    return out;
}
export function glassCells(l:Pick<Level,'width'|'height'>,anchor:number,path:Point[]):number[]{
    const ax=anchor%l.width,ay=Math.floor(anchor/l.width),ids=new Set<number>([anchor]);
    for(let n=1;n<path.length;n++){
        const a=path[n-1]!,b=path[n]!;
        for(let y=ay+Math.min(a[1],b[1]);y<=ay+Math.max(a[1],b[1])+1;y++)for(let x=ax+Math.min(a[0],b[0]);x<=ax+Math.max(a[0],b[0])+1;x++){
            if(x<0||y<0||x>=l.width||y>=l.height)return [];ids.add(y*l.width+x);
        }
    }return [...ids];
}
export function validGlassPath(l:Level,anchor:number,value:unknown):value is Point[]{
    if(!Array.isArray(value)||value.length<2||value.length>64||!value.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isInteger))||value[0][0]!==0||value[0][1]!==0)return false;
    const p=compactGlassPath(value as Point[]);let length=0;
    for(let n=1;n<p.length;n++){
        const a=p[n-1]!,b=p[n]!,d=distance(a,b);length+=d;
        if(a[0]!==b[0]&&a[1]!==b[1]||d<(n===1||n===p.length-1?3:5))return false;
        if(n>1){const u=direction(p[n-2]!,a),v=direction(a,b);if(u[0]===-v[0]&&u[1]===-v[1])return false;}
        for(let j=1;j<n-1;j++){
            const c=p[j-1]!,e=p[j]!;
            const dx=Math.max(0,Math.min(a[0],b[0])-Math.max(c[0],e[0]),Math.min(c[0],e[0])-Math.max(a[0],b[0])),dy=Math.max(0,Math.min(a[1],b[1])-Math.max(c[1],e[1]),Math.min(c[1],e[1])-Math.max(a[1],b[1]));
            if(Math.hypot(dx,dy)<GLASS_DIAMETER)return false;
        }
    }return length<=480&&glassCells(l,anchor,p).length>0;
}
export function glassRoutes(l:Level):{anchor:number;path:Point[]}[]{
    return Object.entries(l.properties??{}).flatMap(([key,p])=>l.cells[Number(key)]==='glass-pipe'&&p.path?[{anchor:Number(key),path:p.path}]:[]);
}
export function glassAt(l:Level,id:number):{anchor:number;path:Point[]}|undefined{
    return glassRoutes(l).find(r=>glassCells(l,r.anchor,r.path).includes(id));
}
export function placeGlassPipe(l:Level,anchor:number,path:Point[]=DEFAULT_GLASS_PATH):boolean{
    path=compactGlassPath(path);if(!validGlassPath(l,anchor,path))return false;
    const old=l.properties?.[anchor]?.path,props=l.properties?.[anchor]??{};
    if(old)for(const id of glassCells(l,anchor,old))if(isGlass(l.cells[id]!))l.cells[id]='.';
    for(const id of glassCells(l,anchor,path)){setCell(l,id,id===anchor?'glass-pipe':'glass-body');if(l.contents)delete l.contents[id];if(l.properties)delete l.properties[id];}
    (l.properties??={})[anchor]={...props,path:structuredClone(path)};return true;
}
/** Old linked mouths acquire a real connecting tube when a saved map is played. */
export function upgradeGlassPipes(l:Level):void{
    const mouths=l.cells.flatMap((t,id)=>t==='glass-pipe'&&!l.properties?.[id]?.path?[id]:[]),used=new Set<number>();
    for(const id of mouths){
        if(used.has(id))continue;const x=id%l.width,y=Math.floor(id/l.width),props=l.properties?.[id]??{},link=props.link??1;
        const other=mouths.find(n=>n!==id&&!used.has(n)&&(l.properties?.[n]?.link??1)===link&&Math.abs(n%l.width-x)>=6);
        if(other===undefined)continue;
        const bx=other%l.width,by=Math.floor(other/l.width),bottom=Math.max(y,by)+3;
        const path:Point[]=[[0,0],[0,bottom-y],[bx-x,bottom-y],[bx-x,by-y]];
        if(!validGlassPath(l,id,path))continue;
        const endPlant=l.properties?.[other]?.plant;
        for(const mouth of [id,other]){let row=Math.floor(mouth/l.width),col=mouth%l.width;do{for(const dx of [0,1]){const n=row*l.width+col+dx;if(isGlass(l.cells[n]!))l.cells[n]='.';if(l.properties)delete l.properties[n];}row++;}while(l.cells[row*l.width+col]==='glass-left-shaft');}
        (l.properties??={})[id]={...props,...(endPlant?{endPlant:true}:{}),path};placeGlassPipe(l,id,path);used.add(id);used.add(other);
    }
}
export function worldGlassPath(l:Level,anchor:number,path:Point[]):Point[]{const x=anchor%l.width+1,y=Math.floor(anchor/l.width)+1;return path.map(p=>[x+p[0],y+p[1]]);}
export function glassMouths(points:Point[]):{point:Point;normal:Point}[]{
    const a=points[0]!,b=points.at(-1)!,u=direction(points[1]!,a),v=direction(points.at(-2)!,b);
    return [{point:[a[0]+u[0],a[1]+u[1]],normal:u},{point:[b[0]+v[0],b[1]+v[1]],normal:v}];
}
export function roundedGlassPath(points:Point[]):Point[]{
    const p=compactGlassPath(points),out:Point[]=[[...p[0]!]];
    for(let n=1;n<p.length-1;n++){
        const c=p[n]!,u=direction(p[n-1]!,c),v=direction(c,p[n+1]!),r=GLASS_RADIUS,a:Point=[c[0]-u[0]*r,c[1]-u[1]*r],b:Point=[c[0]+v[0]*r,c[1]+v[1]*r];out.push(a);
        const center:Point=[c[0]-u[0]*r+v[0]*r,c[1]-u[1]*r+v[1]*r],start=Math.atan2(a[1]-center[1],a[0]-center[0]),turn=u[0]*v[1]-u[1]*v[0];
        for(let k=1;k<=24;k++){const angle=start+turn*Math.PI/2*k/24;out.push([center[0]+Math.cos(angle)*r,center[1]+Math.sin(angle)*r]);}
    }out.push([...p.at(-1)!]);return out;
}

interface Bounds {left:number;right:number;top:number;bottom:number}
export interface GlassRouteGeometry extends Bounds {
    anchor:number;path:Point[];world:Point[];mouths:ReturnType<typeof glassMouths>;points:Point[];
    segments:({a:Point;b:Point;normal?:Point}&Bounds)[];
}
const geometry=new WeakMap<Level,{width:number;height:number;routes:GlassRouteGeometry[];cells:Set<number>}>();
function glassGeometry(l:Level){
    const cached=geometry.get(l);
    if(cached&&cached.width===l.width&&cached.height===l.height){
        // Validate mutable editor data without allocating Object.values/filter arrays
        // for each body axis. Coordinate checks also catch in-place path edits.
        let count=0,valid=true;
        for(const key in l.properties){const path=l.properties[key]!.path;if(!path||l.cells[Number(key)]!=='glass-pipe')continue;
            const route=cached.routes[count++],anchor=Number(key),x=anchor%l.width+1,y=Math.floor(anchor/l.width)+1;
            if(!route||route.anchor!==anchor||route.path!==path||route.world.length!==path.length){valid=false;break;}
            for(let n=0;n<path.length;n++)if(route.world[n]![0]!==x+path[n]![0]||route.world[n]![1]!==y+path[n]![1]){valid=false;break;}
            if(!valid)break;
        }
        if(valid&&count===cached.routes.length)return cached;
    }
    const routes=glassRoutes(l).map(({anchor,path}):GlassRouteGeometry=>{
        const world=worldGlassPath(l,anchor,path),mouths=glassMouths(world),points=roundedGlassPath([mouths[0]!.point,...world,mouths[1]!.point]);
        const segments:GlassRouteGeometry['segments']=[];
        let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
        for(let n=1;n<points.length;n++){
            const a=points[n-1]!,b=points[n]!,bounds={left:Math.min(a[0],b[0])-.8,right:Math.max(a[0],b[0])+.8,top:Math.min(a[1],b[1])-.8,bottom:Math.max(a[1],b[1])+.8};
            left=Math.min(left,bounds.left);right=Math.max(right,bounds.right);top=Math.min(top,bounds.top);bottom=Math.max(bottom,bounds.bottom);
            segments.push({a,b,...bounds,...(n===1||n===points.length-1?{normal:n===1?direction(a,b):direction(b,a)}:{})});
        }
        return {anchor,path,world,mouths,points,segments,left,right,top,bottom};
    });
    const value={width:l.width,height:l.height,routes,cells:new Set(routes.flatMap(r=>glassCells(l,r.anchor,r.path)))};geometry.set(l,value);return value;
}
/** Shared prepared tube data; path replacement, deletion and edits are checked. */
export function glassRouteGeometry(l:Level):readonly GlassRouteGeometry[]{return glassGeometry(l).routes;}
export function curvedGlassCell(l:Level,x:number,y:number):boolean {
    const id=y*l.width+x,t=l.cells[id];
    // Most solid contacts are ordinary ground, which never needs a pipe lookup.
    return (t==='glass-body'||t==='glass-pipe')&&glassGeometry(l).cells.has(id);
}
function pointRect(p:Point,b:Body):number{return Math.max(b.x-p[0],0,p[0]-b.x-b.w)**2+Math.max(b.y-p[1],0,p[1]-b.y-b.h)**2;}
function pointSegment(x:number,y:number,a:Point,b:Point):number {const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));return (x-a[0]-t*dx)**2+(y-a[1]-t*dy)**2;}
function segmentRect(a:Point,b:Point,box:Body):number {
    let lo=0,hi=1;
    for(let axis=0;axis<2;axis++){
        const start=a[axis]!,delta=b[axis]!-start,min=axis?box.y:box.x,max=min+(axis?box.h:box.w);
        if(Math.abs(delta)<1e-9){if(start<min||start>max)hi=-1;}
        else{const p=(min-start)/delta,q=(max-start)/delta;lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));}
    }
    if(lo<=hi)return 0;
    return Math.min(pointRect(a,box),pointRect(b,box),pointSegment(box.x,box.y,a,b),pointSegment(box.x+box.w,box.y,a,b),pointSegment(box.x,box.y+box.h,a,b),pointSegment(box.x+box.w,box.y+box.h,a,b));
}
/** The visible tube's circular bends and 1.6-tile bore define its solid exterior. */
export function glassIntersects(l:Level,body:Body):boolean {
    return intersectsRoutes(glassRouteGeometry(l),body);
}
function outside(bounds:Bounds,body:Body):boolean{return body.x+body.w<bounds.left||body.x>bounds.right||body.y+body.h<bounds.top||body.y>bounds.bottom;}
function trimAtMouth(box:Body,p:Point,u:Point):void {
    if(u[0]>0){const right=box.x+box.w;box.x=Math.max(box.x,p[0]);box.w=right-box.x;}
    if(u[0]<0)box.w=Math.min(box.x+box.w,p[0])-box.x;
    if(u[1]>0){const bottom=box.y+box.h;box.y=Math.max(box.y,p[1]);box.h=bottom-box.y;}
    if(u[1]<0)box.h=Math.min(box.y+box.h,p[1])-box.y;
}
function intersectsRoutes(routes:readonly GlassRouteGeometry[],body:Body):boolean {
    for(const route of routes){
        if(outside(route,body))continue;
        for(const segment of route.segments){
        if(outside(segment,body))continue;const {a,b,normal:u}=segment,box=u?{...body}:body;
        // Terminal mouths have a flat rim rather than an invisible round cap.
        if(u){if(segment===route.segments[0])trimAtMouth(box,a,direction(a,b));if(segment===route.segments.at(-1))trimAtMouth(box,b,direction(b,a));}
        if(box.w>0&&box.h>0&&segmentRect(a,b,box)<(GLASS_DIAMETER/2-.002)**2)return true;
    }}return false;
}
export function resolveGlassAxis(l:Level,body:Body,axis:'x'|'y',before:number):boolean {
    const routes=glassRouteGeometry(l);
    if(!intersectsRoutes(routes,body))return false;
    const after=body[axis];body[axis]=before;
    if(intersectsRoutes(routes,body)){body[axis]=after;return false;}
    let lo=0,hi=1;for(let n=0;n<16;n++){const t=(lo+hi)/2;body[axis]=before+(after-before)*t;if(intersectsRoutes(routes,body))hi=t;else lo=t;}
    body[axis]=before+(after-before)*lo;return true;
}
export function sampleGlassPath(points:Point[],travel:number):{point:Point;angle:number;done:boolean}{
    for(let n=1;n<points.length;n++){const a=points[n-1]!,b=points[n]!,len=distance(a,b);if(travel<=len||n===points.length-1){const t=Math.min(1,len>0?travel/len:1);return {point:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],angle:Math.atan2(b[1]-a[1],b[0]-a[0]),done:n===points.length-1&&travel>=len};}travel-=len;}
    return {point:points[0]!,angle:0,done:true};
}
type Mouth={point:Point;normal:Point};
function outsideMouth(m:Mouth,p:Body):Point {
    const n=m.normal,extent=n[0]?p.w/2:p.h/2;
    return [m.point[0]+n[0]*(extent+.003),m.point[1]+n[1]*(extent+.003)];
}
function insideMouth(m:Mouth,p:Body):Point {
    const n=m.normal,extent=n[0]?p.w/2:p.h/2;
    return [m.point[0]-n[0]*(extent+.003),m.point[1]-n[1]*(extent+.003)];
}
function mouthClear(s:State,m:Mouth,isSolid:(t:Tile,pTime?:number)=>boolean):boolean {
    const p=s.player,target=outsideMouth(m,p),box:Body={x:target[0]-p.w/2,y:target[1]-p.h/2,w:p.w,h:p.h,vx:0,vy:0};
    for(let y=Math.floor(box.y+.005);y<=Math.floor(box.y+box.h-.005);y++)for(let x=Math.floor(box.x+.005);x<=Math.floor(box.x+box.w-.005);x++)
        if(x<0||y<0||x>=s.level.width||y>=s.level.height||!isGlass(s.level.cells[y*s.level.width+x]!)&&isSolid(s.level.cells[y*s.level.width+x]!,s.pTime))return false;
    // Pipe occupancy cells cover the round rim's bounding box. Test their
    // actual shape so the pipe itself never falsely blocks its own side mouth.
    if(glassIntersects(s.level,box))return false;
    return !switchObstacles(s,box,false,box.x,box.x+box.w).some(b=>box.x<b.x+b.w-.005&&box.x+box.w>b.x+.005&&box.y<b.y+b.h-.005&&box.y+box.h>b.y+.005);
}
export function enterGlassPipe(s:State,i:Input,isSolid:(t:Tile,pTime?:number)=>boolean):boolean{
    if(s.player.w>GLASS_DIAMETER)return false;
    if(rulesFor(s.level).pipes==='reference'&&s.held&&Math.max(s.held.w,s.held.h)>GLASS_DIAMETER){s.notice='拿着的物体太大，无法进入透明管道';return false;}
    if(s.pipeWait>0||s.pipe)return false;const p=s.player,c:Point=[p.x+p.w/2,p.y+p.h/2];
    if(!i.down&&!i.interact&&!i.axis)return false;
    for(const {world,mouths}of glassRouteGeometry(s.level)){
        for(let end=0;end<2;end++){
            const m=mouths[end]!,n=m.normal,extent=n[0]?p.w/2:p.h/2,external:Point=[m.point[0]+n[0]*(extent+.003),m.point[1]+n[1]*(extent+.003)];
            if(n[0]&&!s.grounded&&rulesFor(s.level).pipes==='reference')continue;
            const into=n[1]<0?i.down:n[1]>0?i.interact:n[0]<0?i.axis>0:i.axis<0;
            if(!into||Math.abs((c[0]-external[0])*n[0]+(c[1]-external[1])*n[1])>.18||Math.abs((c[0]-external[0])*n[1]-(c[1]-external[1])*n[0])>.6)continue;
            if(!mouthClear(s,m,isSolid)){s.notice='透明管道入口被挡住了';return false;}
            const exit=mouths[1-end]!,e=exit.normal,target=outsideMouth(exit,p);
            const spine=end?[...world].reverse():world,core=roundedGlassPath([insideMouth(m,p),...spine,insideMouth(exit,p)]),points:Point[]=[c,...core];
            emit(s,'pipe');s.pipe={age:0,from:[p.x,p.y],to:[target[0],target[1]+p.h/2],glass:true,path:points,glassCore:core,glassFrom:m,glassTo:exit,travel:0,angle:sampleGlassPath(points,0).angle,flip:target[0]<external[0],exitDirection:e};
            p.vx=p.vy=0;s.grounded=false;s.crouching=false;s.crouchAge=0;s.spinning=false;s.spinAge=0;s.jumpSustain=false;s.jumpCut=false;s.pendingShot=false;s.shootAge=.24;s.eatAge=.56;s.bites=[];s.cheerAge=.8;s.notice='正在透明管道内穿梭';return true;
        }
    }return false;
}
export function advanceGlassPipe(s:State,dt:number,isSolid:(t:Tile,pTime?:number)=>boolean,trapped?:()=>void):void{
    const pipe=s.pipe!;pipe.age+=dt;pipe.travel=(pipe.travel??0)+6*dt;const at=sampleGlassPath(pipe.path!,pipe.travel);pipe.angle=at.angle;if(Math.abs(Math.cos(at.angle))>.15)pipe.flip=Math.cos(at.angle)<0;s.player.x=at.point[0]-s.player.w/2;s.player.y=at.point[1]-s.player.h/2;s.player.vx=s.player.vy=0;
    if(at.done){
        if(pipe.glassTo&&!pipe.glassExiting){
            if(mouthClear(s,pipe.glassTo,isSolid)){
                const target=outsideMouth(pipe.glassTo,s.player);pipe.path=[at.point,target];pipe.to=[target[0],target[1]+s.player.h/2];pipe.glassExiting=true;
            }else{
                const from=pipe.glassFrom!;if(rulesFor(s.level).pipes==='reference'&&!mouthClear(s,from,isSolid)){s.pipe=null;trapped?.();s.notice='透明管道两端封闭，受困失败';return;}pipe.glassFrom=pipe.glassTo;pipe.glassTo=from;pipe.glassCore=[...pipe.glassCore!].reverse();pipe.path=pipe.glassCore;pipe.glassReturns=(pipe.glassReturns??0)+1;
                const target=outsideMouth(from,s.player);pipe.to=[target[0],target[1]+s.player.h/2];pipe.exitDirection=from.normal;emit(s,'pipe');s.notice='透明管道出口被挡住了，正在原路返回';
            }
            pipe.travel=0;pipe.angle=sampleGlassPath(pipe.path,0).angle;if(Math.abs(Math.cos(pipe.angle))>.15)pipe.flip=Math.cos(pipe.angle)<0;return;
        }
        const exit=pipe.exitDirection!;s.pipe=null;s.pipeWait=.7;s.invincible=Math.max(s.invincible,.8);s.player.vx=exit[0]*3;s.player.vy=exit[1]<0?-5:exit[1]*3;s.notice='穿出透明管道';
    }
}
export function editGlassEnd(l:Level,anchor:number,dx:number,dy:number,remove=false):boolean{
    const source=l.properties?.[anchor]?.path;if(!source)return false;const p=structuredClone(source),last=p.at(-1)!,prev=p.at(-2)!;
    if(remove){if(p.length<=2)return false;p.pop();}
    else{const u=direction(prev,last);if(dx===-u[0]&&dy===-u[1]){if(distance(prev,last)>4){last[0]+=dx*2;last[1]+=dy*2;}else if(p.length>2)p.pop();else return false;}
        else if(dx===u[0]&&dy===u[1]){last[0]+=dx*2;last[1]+=dy*2;}
        else{const len=distance(prev,last);if(len<5){last[0]+=u[0]*(5-len);last[1]+=u[1]*(5-len);}p.push([last[0]+dx*3,last[1]+dy*3]);}}
    if(!validGlassPath(l,anchor,p))return false;
    const old=new Set(glassCells(l,anchor,source));if(glassCells(l,anchor,p).some(id=>!old.has(id)&&!['.','#','B','water'].includes(l.cells[id]!)))return false;
    return placeGlassPipe(l,anchor,p);
}
