/** Deterministic mirror geometry and reflection budgets in logical playfield coordinates. */
export interface MirrorPoint {x:number;y:number}
export interface MirrorHull extends MirrorPoint {radius:number;rotation:number;sides:number}
export const REFLECTED_BULLET_DAMAGE=7;
export const PRISM_SHARD_DAMAGE=90;
export const PRISM_SHARD_STORM_MS=6500;
export function mirrorVertices(h:MirrorHull):MirrorPoint[]{
 return Array.from({length:h.sides},(_,i)=>{const a=h.rotation-Math.PI/2+i*Math.PI*2/h.sides;return{x:h.x+Math.cos(a)*h.radius,y:h.y+Math.sin(a)*h.radius};});
}
/** Clip a swept bullet/ray against the rotating convex facets (expanded by bullet radius). */
export function mirrorHit(from:MirrorPoint,to:MirrorPoint,h:MirrorHull,padding=0):{t:number;x:number;y:number;nx:number;ny:number}|null {
 const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);if(length<1e-8)return null;
 let enter=0,exit=1,nx=-dx/length,ny=-dy/length;const vertices=mirrorVertices(h);
 for(let i=0;i<vertices.length;i++){
  const a=vertices[i]!,b=vertices[(i+1)%vertices.length]!,ex=b.x-a.x,ey=b.y-a.y,size=Math.hypot(ex,ey),px=ey/size,py=-ex/size;
  const distance=(from.x-a.x)*px+(from.y-a.y)*py-Math.max(0,padding),speed=dx*px+dy*py;
  if(Math.abs(speed)<1e-9){if(distance>0)return null;continue;}
  const t=-distance/speed;
  if(speed<0){if(t>enter){enter=t;nx=px;ny=py;}}else exit=Math.min(exit,t);
  if(enter>exit+1e-9)return null;
 }
 if(enter<0||enter>1||exit<0)return null;
 return{t:enter,x:from.x+dx*enter,y:from.y+dy*enter,nx,ny};
}
export function reflectedVelocity(vx:number,vy:number,nx:number,ny:number):MirrorPoint {
 const length=Math.hypot(nx,ny);if(length<1e-8)return{x:-vx,y:-vy};nx/=length;ny/=length;
 const projection=vx*nx+vy*ny;return{x:vx-2*projection*nx,y:vy-2*projection*ny};
}
export function consumeMirrorBudget(remaining:number,damage:number):number {
 return Math.max(0,remaining-Math.max(0,Number.isFinite(damage)?damage:0));
}
export function prismShards(x:number,y:number,rotation:number){
 return Array.from({length:30},(_,i)=>{const ring=i<18?0:1,n=ring?12:18,j=ring?i-18:i,a=rotation+j*Math.PI*2/n+(ring?.13:0),speed=ring?240:310;
  return{x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,radius:7,damage:PRISM_SHARD_DAMAGE,hostile:true,color:ring?'#c4b0ff':'#7cefff',crystalShard:true,rotation:a,lifeMs:PRISM_SHARD_STORM_MS};});
}
