import type { SkyStrikeBattleLayer } from './battleLayer';
import { CARRIER_DEPLOY_INTERVAL_MS, type EnemyDefinition } from './rules';
interface ShipPose { definition: EnemyDefinition; x:number; y:number; rotation:number; ageMs:number; fireCooldownMs:number; lastShotAgeMs?:number; laserCooldownMs:number; charging:boolean }
/** Per-hull attachment placement, in fractions of the existing ship sprite. */
const layouts: Record<string,{ engines: number[]; rear: number; rotors: number[]; color: string }> = {
  'ore-reaper':{engines:[-0.23,0.23],rear:-0.31,rotors:[0],color:'#ffb456'},
  'twin-red':{engines:[-0.22,0.22],rear:-0.3,rotors:[0],color:'#ff415e'},
  'twin-blue':{engines:[-0.22,0.22],rear:-0.3,rotors:[0],color:'#48a7ff'},
  'fission-elite':{engines:[-0.25,0.25],rear:-0.3,rotors:[-0.22,0.22],color:'#bd78ff'},
  dreadnought:{engines:[-0.23,0.23],rear:-0.35,rotors:[-0.24,0.24],color:'#ff8655'},
  'ion-seraph':{engines:[-0.28,0.28],rear:-0.31,rotors:[-0.25,0.25],color:'#68cdff'},
  'void-mantis':{engines:[-0.16,0.16],rear:-0.32,rotors:[-0.27,0.27],color:'#c575ff'},
  'star-carrier':{engines:[-0.3,0.3],rear:-0.3,rotors:[-0.28,0.28],color:'#72dfff'},
  'helios-prism':{engines:[-0.22,0.22],rear:-0.30,rotors:[0],color:'#6feaff'},
  'iron-serpent':{engines:[-0.21,0.21],rear:-0.30,rotors:[0],color:'#60f0af'},
  'crimson-lance':{engines:[-0.2,0.2],rear:-0.3,rotors:[0],color:'#ff6175'},
  'violet-fortress':{engines:[-0.25,0.25],rear:-0.3,rotors:[-0.22,0.22],color:'#b374ff'},
  'prism-lancer':{engines:[-0.2,0.2],rear:-0.3,rotors:[0],color:'#b875ff'},
};
export function drawShipDetails(r:SkyStrikeBattleLayer,e:ShipPose,target:{x:number;y:number},behind:boolean):void {
  const layout=layouts[e.definition.id]; if(!layout)return;
  const w=e.definition.size,h=w*(e.definition.renderAspect??(e.definition.tier==='boss'?1.18:1.3)), a=e.rotation;
  const point=(x:number,y:number)=>({x:e.x+Math.cos(a)*x-Math.sin(a)*y,y:e.y+Math.sin(a)*x+Math.cos(a)*y});
  const pulse=1+0.13*Math.sin(e.ageMs*0.027);
  if(behind) {
    for(const x of layout.engines) { const length=w*(e.charging?0.5:0.25)*pulse,p=point(x*w,layout.rear*h-length*0.40);
      r.sprite('assets/fx-flame.png',p.x,p.y,w*0.16,length,a+Math.PI,0.8,layout.color,true); }
    return;
  }
  for(const [i,x] of layout.rotors.entries()) { const p=point(x*w,-h*0.08),size=w*(layout.rotors.length===1?0.17:0.14);
    r.sprite('assets/fx-rotor.png',p.x,p.y,size,size,a+e.ageMs*0.002*(i%2?-1:1)); }
  if(e.definition.bulletPattern!=='none') {
    // Barrel tips meet the exact existing projectile origin, so aiming and flashes agree.
    const muzzle={x:e.x,y:e.y+w*0.25}, angle=Math.atan2(target.y-muzzle.y,target.x-muzzle.x),size=w*0.24;
    const recoil=Math.max(0,1-(e.ageMs-(e.lastShotAgeMs??-1000))/120)*Math.min(3,w*0.015);
    const d=size*0.40+recoil;
    r.sprite('assets/fx-turret.png',muzzle.x-Math.cos(angle)*d,muzzle.y-Math.sin(angle)*d,size,size,angle+Math.PI/2);
  }
  if(e.definition.bossAttack==='carrier-deploy') {
    // Bay doors open for the deployment interval and close after the launch.
    const sinceLaunch=CARRIER_DEPLOY_INTERVAL_MS-e.laserCooldownMs;
    const openness=sinceLaunch<700 ? Math.max(0,Math.min(1,sinceLaunch/180)) : Math.max(0,1-(sinceLaunch-700)/350);
    const p=point(0,h*0.14); r.rect(p.x,p.y,w*0.20,h*0.16,'#030912',1,a);
    r.glow(p.x,p.y,w*0.12,layout.color,openness*0.65);
    for(const side of [-1,1]) { const q=point(side*w*(0.052+openness*0.055),h*0.14);
      r.sprite('assets/fx-hatch.png',q.x,q.y,w*0.215,h*0.168,a+(side>0?Math.PI:0)); }
  }
}
