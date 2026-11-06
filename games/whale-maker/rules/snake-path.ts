import type { Level, Body } from './model';
export type SnakePoint=[number,number];
export const DEFAULT_SNAKE_PATH:SnakePoint[]=[[0,0],[4,0],[4,-3],[8,-3]];
export function snakePath(l:Level,id:number):SnakePoint[]{return l.properties?.[id]?.path??[[0,0],[id%l.width+4<l.width?4:-4,0]];}
export function pathLength(path:readonly SnakePoint[]):number{return path.slice(1).reduce((sum,p,n)=>sum+Math.hypot(p[0]-path[n]![0],p[1]-path[n]![1]),0);}
export function pathPoint(path:readonly SnakePoint[],distance:number):SnakePoint{
    let rest=Math.max(0,distance);
    for(let n=1;n<path.length;n++){const a=path[n-1]!,b=path[n]!,length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(rest<=length)return [a[0]+(b[0]-a[0])*rest/length,a[1]+(b[1]-a[1])*rest/length];rest-=length;}
    return [...path.at(-1)!];
}
export function validSnakePath(l:Level,id:number,value:unknown):value is SnakePoint[]{
    if(!Array.isArray(value)||value.length<2||value.length>128)return false;
    const path=value as SnakePoint[],x=id%l.width,y=Math.floor(id/l.width);
    if(!path.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isInteger)&&x+p[0]>=0&&x+p[0]<l.width&&y+p[1]>=0&&y+p[1]<l.height)||path[0]![0]!==0||path[0]![1]!==0)return false;
    const occupied=new Set<string>(['0,0']);
    for(let n=1;n<path.length;n++){const a=path[n-1]!,b=path[n]!,dx=b[0]-a[0],dy=b[1]-a[1],length=Math.abs(dx)+Math.abs(dy);if(length===0||dx!==0&&dy!==0)return false;for(let k=1;k<=length;k++){const key=[a[0]+Math.sign(dx)*k,a[1]+Math.sign(dy)*k].join(',');if(occupied.has(key))return false;occupied.add(key);}}
    return pathLength(path)<=256;
}
export function initialSnake(l:Level,id:number):Body[]{
    const path=snakePath(l,id),length=Math.min(l.properties?.[id]?.length??4,Math.floor(pathLength(path))+1);
    return Array.from({length},(_,n)=>{const [x,y]=pathPoint(path,n);return {x:id%l.width+x,y:Math.floor(id/l.width)+y,w:1,h:1,vx:0,vy:0};});
}
export function editSnakeEnd(l:Level,id:number,dx:number,dy:number,remove=false):boolean{
    const path=structuredClone(snakePath(l,id));
    if(remove){const b=path.at(-1)!,a=path.at(-2)!,length=Math.abs(b[0]-a[0])+Math.abs(b[1]-a[1]);if(pathLength(path)<=1)return false;if(length===1)path.pop();else{b[0]-=Math.sign(b[0]-a[0]);b[1]-=Math.sign(b[1]-a[1]);}}
    else{const b=path.at(-1)!,a=path.at(-2)!,next:SnakePoint=[b[0]+dx,b[1]+dy];if(Math.sign(b[0]-a[0])===dx&&Math.sign(b[1]-a[1])===dy)path[path.length-1]=next;else path.push(next);}
    if(!validSnakePath(l,id,path))return false;(l.properties??={})[id]={...l.properties?.[id],path};return true;
}
