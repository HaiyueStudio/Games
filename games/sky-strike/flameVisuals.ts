import type {SkyStrikeBattleLayer} from './battleLayer';
import type {FlameCone,IgnitedHull} from './flames';
/** Shared geometry for visible sectors and collision; static sprites only. */
export function drawFlames(r:SkyStrikeBattleLayer,cones:readonly FlameCone[],charges:readonly IgnitedHull<unknown>[],player:{x:number;y:number},burnMs:number,time:number):void {
 for(const c of cones){
  const point=(a:number,d:number)=>({x:c.x+Math.cos(a)*d,y:c.y+Math.sin(a)*d});
  if(c.warning){
   for(const side of [-1,1]){const p=point(c.angle+side*c.halfAngle,c.range);r.beam(c.x,c.y,p.x,p.y,2,'#ffae48',true);}
   let prev=point(c.angle-c.halfAngle,c.range);
   for(let i=1;i<=20;i++){const p=point(c.angle-c.halfAngle+2*c.halfAngle*i/20,c.range);r.line(prev.x,prev.y,p.x,p.y,2,'#ffaf55',.45);prev=p;}
   r.glow(c.x,c.y,20,'#ff7b22',.4+.2*Math.sin(time*.018));continue;
  }
  // Coherent outward tongues with a sharply bounded silhouette; no per-frame image uploads.
  for(let lane=0;lane<13;lane++){
   const a=c.angle+(lane/12*2-1)*c.halfAngle;
   for(let i=0;i<7;i++){
    const t=((time*.0015+i/7+lane*.047)%1),d=8+t*(c.range-8),p=point(a,d),size=6+Math.sin(t*Math.PI)*(c.boss?23:18);
    r.sprite('fx:glow',p.x,p.y,size*2,size*2,0,(1-t)*.42,'#ff4c0a',true);
    r.sprite('assets/fx-inferno.png',p.x,p.y,size*1.8,Math.min(105,c.range*.24),a+Math.PI/2,(1-t)*.92,'#ffffff',true);
   }
  }
  r.glow(c.x,c.y,22,'#ffcd6e',.8);
 }
 for(const c of charges){const pulse=.5+.5*Math.sin(time*(.012+(1-c.remainingMs/3000)*.025));
  r.ring(c.x,c.y,c.radius,'#ff652d',.17+pulse*.16);r.ring(c.x,c.y,16+20*c.remainingMs/3000,'#ffb75c',.8);
  r.glow(c.x,c.y,25,'#ff581c',.6+pulse*.3);
  r.sprite('assets/fx-inferno.png',c.x,c.y-14,26,52,0,.9,'#ffffff',true);
 }
 if(burnMs>0){r.ring(player.x,player.y,27,'#ff7025',.45);for(const side of [-1,1])r.sprite('assets/fx-inferno.png',player.x+side*13,player.y+16,16,38,0,.7,'#ffffff',true);}
}
