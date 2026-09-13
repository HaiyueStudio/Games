import type {SkyStrikeBattleLayer} from './battleLayer';
import type {FlameCone,IgnitedHull} from './flames';
/** Residual hull burning and fuse indicators; live jets use the custom noise pass. */
export function drawFlames(r:SkyStrikeBattleLayer,cones:readonly FlameCone[],charges:readonly IgnitedHull<unknown>[],player:{x:number;y:number},burnMs:number,time:number):void {
 for(const c of charges){const pulse=.5+.5*Math.sin(time*(.012+(1-c.remainingMs/3000)*.025));
  r.ring(c.x,c.y,c.radius,'#ff652d',.17+pulse*.16);r.ring(c.x,c.y,16+20*c.remainingMs/3000,'#ffb75c',.8);
  r.glow(c.x,c.y,25,'#ff581c',.6+pulse*.3);
  r.sprite('assets/fx-inferno.png',c.x,c.y-14,26,52,0,.9,'#ffffff',true);
 }
 if(burnMs>0){r.ring(player.x,player.y,27,'#ff7025',.45);for(const side of [-1,1])r.sprite('assets/fx-inferno.png',player.x+side*13,player.y+16,16,38,0,.7,'#ffffff',true);}
}
