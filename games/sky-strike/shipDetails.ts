import type { SkyStrikeBattleLayer } from './battleLayer';
import { CARRIER_DEPLOY_INTERVAL_MS, type EnemyDefinition } from './rules';
interface ShipPose { definition: EnemyDefinition; x:number; y:number; rotation:number; ageMs:number; fireCooldownMs:number; lastShotAgeMs?:number; laserCooldownMs:number; charging:boolean; hitPoints?:number }
type Motion = 'cannon'|'ion'|'blades'|'hangars'|'iris'|'serpent'|'gyro'|'gear'|'capacitors'|'petals'|'shells'|'none';
interface Layout { engines:number[]; rear:number; color:string; motion:Motion; part?:string }
/** Art and motion are specific to each hull; the twin pair deliberately shares a chassis. */
const layouts: Record<string,Layout> = {
  'quantum-dreadnought':{engines:[-.22,.22],rear:-.34,color:'#6edbff',motion:'none'},
  dreadnought:{engines:[-.23,.23],rear:-.35,color:'#ff6655',motion:'cannon',part:'dread-gun'},
  'ion-seraph':{engines:[-.28,.28],rear:-.31,color:'#68cdff',motion:'ion',part:'ion-impeller'},
  'void-mantis':{engines:[-.16,.16],rear:-.32,color:'#c575ff',motion:'blades',part:'mantis-blade'},
  'star-carrier':{engines:[-.3,.3],rear:-.3,color:'#72dfff',motion:'hangars',part:'carrier-door'},
  'helios-prism':{engines:[-.22,.22],rear:-.3,color:'#6feaff',motion:'iris',part:'prism-iris'},
  'iron-serpent':{engines:[-.21,.21],rear:-.3,color:'#60f0af',motion:'serpent',part:'serpent-gun'},
  'twin-red':{engines:[-.22,.22],rear:-.3,color:'#ff415e',motion:'gyro',part:'twin-gyro'},
  'twin-blue':{engines:[-.22,.22],rear:-.3,color:'#48a7ff',motion:'gyro',part:'twin-gyro'},
  'ore-reaper':{engines:[-.23,.23],rear:-.31,color:'#ffb456',motion:'gear',part:'mining-cog'},
  'crimson-lance':{engines:[-.2,.2],rear:-.3,color:'#ff6175',motion:'cannon',part:'crimson-rail'},
  'violet-fortress':{engines:[-.25,.25],rear:-.3,color:'#b374ff',motion:'capacitors',part:'violet-capacitor'},
  'prism-lancer':{engines:[-.2,.2],rear:-.3,color:'#b875ff',motion:'petals',part:'lancer-petal'},
  'fission-elite':{engines:[-.25,.25],rear:-.3,color:'#bd78ff',motion:'shells',part:'fission-shell'},
};
export const SHIP_DETAIL_ASSETS=[...new Set([...Object.values(layouts).flatMap(l=>l.part?[`assets/part-${l.part}.png`]:[]),'assets/part-serpent-body.png','assets/part-serpent-joint.png'])];
export function drawShipDetails(r:SkyStrikeBattleLayer,e:ShipPose,target:{x:number;y:number},behind:boolean):void {
  const layout=layouts[e.definition.id]; if(!layout)return;
  const w=e.definition.size,h=w*(e.definition.renderAspect??(e.definition.tier==='boss'?1.18:1.3)),a=e.rotation,t=e.ageMs;
  const point=(x:number,y:number)=>({x:e.x+Math.cos(a)*x-Math.sin(a)*y,y:e.y+Math.sin(a)*x+Math.cos(a)*y});
  const pulse=.5+.5*Math.sin(t*.004),health=Math.max(0,Math.min(1,(e.hitPoints??e.definition.hitPoints)/e.definition.hitPoints));
  const part=(x:number,y:number,width:number,height:number,angle=a,opacity=1,color='#ffffff')=>{const p=point(x,y);r.sprite(`assets/part-${layout.part}.png`,p.x,p.y,width,height,angle,opacity,color);};
  if(behind){
    for(const x of layout.engines){const length=w*(e.charging?.5:.25)*(1+.13*Math.sin(t*.027)),p=point(x*w,layout.rear*h-length*.4);
      r.sprite('assets/fx-flame.png',p.x,p.y,w*.16,length,a+Math.PI,.8,layout.color,true);}
    return;
  }
  switch(layout.motion){
    case 'cannon': {
      // The generated barrel tips sit 40% of image height ahead of its center.
      const muzzle={x:e.x,y:e.y+w*.25},angle=Math.atan2(target.y-muzzle.y,target.x-muzzle.x),size=w*.27;
      const recoil=Math.max(0,1-(t-(e.lastShotAgeMs??-1000))/120)*Math.min(3,w*.015),d=size*.4+recoil;
      r.sprite(`assets/part-${layout.part}.png`,muzzle.x-Math.cos(angle)*d,muzzle.y-Math.sin(angle)*d,size,size,angle+Math.PI/2);
      for(const side of [-1,1]){const p=point(side*w*.23,-h*.10);r.glow(p.x,p.y,w*.07,layout.color,.18+pulse*.16);}
      break;
    }
    case 'ion':
      for(const side of [-1,1]){part(side*w*.245,-h*.08,w*.24,w*.24,a+t*.0022*side);const p=point(side*w*.245,-h*.08);r.glow(p.x,p.y,w*.065,layout.color,.25+pulse*.2);}
      break;
    case 'blades':
      for(const side of [-1,1])part(side*w*.28,-h*.035,w*.36,w*.36,a+(side<0?-Math.PI/2:0)+side*(.13+Math.sin(t*.0025)*.19));
      break;
    case 'hangars': {
      const since=CARRIER_DEPLOY_INTERVAL_MS-e.laserCooldownMs;
      const open=since<700?Math.max(0,Math.min(1,since/180)):Math.max(0,1-(since-700)/350);
      for(const x of [-.20,.20])for(const y of [-.105,.22]){
        const p=point(x*w,y*h);r.rect(p.x,p.y,w*.19,h*.20,'#030912',1,a);r.glow(p.x,p.y,w*.10,layout.color,open*.55);
        for(const side of [-1,1])part((x+side*(.039+open*.061))*w,y*h,w*.12,h*.215,a+(side>0?Math.PI:0));
      }
      break;
    }
    case 'iris': {
      part(0,-h*.07,w*.28,w*.28,a+Math.sin(t*.0011)*.4);const p=point(0,-h*.07);r.glow(p.x,p.y,w*.065,layout.color,.25+pulse*.4);break;
    }
    case 'serpent': {
      // This is an iris on the existing head; the articulated body carries the guns.
      const p=point(0,-h*.28);r.ring(p.x,p.y,w*.08,'#ff6050',.25+pulse*.35);break;
    }
    case 'gyro': {
      part(0,-h*.08,w*.28,w*.28,a+t*.0015*(e.definition.id==='twin-blue'?-1:1),1,layout.color);
      const p=point(0,-h*.08);r.glow(p.x,p.y,w*.05,layout.color,.2+pulse*.25);break;
    }
    case 'gear': part(0,-h*.08,w*.25,w*.25,a+t*.0027);break;
    case 'capacitors':
      for(const side of [-1,1]){part(side*w*.18,-h*.06+Math.sin(t*.003+side)*2,w*.25,h*.31);const p=point(side*w*.18,-h*.06);r.glow(p.x,p.y,w*.045,layout.color,.2+pulse*.4);}
      break;
    case 'petals': {
      const open=.5+.5*Math.sin(t*.0028);
      for(const side of [-1,1])part(side*w*(.07+.04*open),h*.01,w*.25,h*.36,a+side*(.12+open*.24));
      const p=point(0,h*.09);r.glow(p.x,p.y,w*.06,'#80e8ff',.3+open*.3);break;
    }
    case 'shells':
      for(let i=0;i<3;i++){const angle=i*Math.PI*2/3-Math.PI/2,d=w*(.13+.025*pulse+(1-health)*.06);part(Math.cos(angle)*d,Math.sin(angle)*d,w*.39,w*.39,a+angle+Math.PI/2+Math.sin(t*.002+i)*.05);}
      break;
    case 'none': break;
  }
}
/** Independent armored vertebrae follow the existing damage/collision bodies. */
export function drawSerpentSegment(r:SkyStrikeBattleLayer,e:ShipPose&{segmentOrder:number},previous:{x:number;y:number},target:{x:number;y:number}):void {
  const w=e.definition.size,heading=Math.atan2(previous.y-e.y,previous.x-e.x)+Math.PI/2;
  const taper=Math.max(.8,1-(e.segmentOrder-1)*.025),pulse=.5+.5*Math.sin(e.ageMs*.005-e.segmentOrder*.7);
  r.glow(e.x,e.y,w*.65,'#25b98f',.22);
  r.sprite('assets/part-serpent-body.png',e.x,e.y,w*1.38*taper,w*1.15,heading);
  const angle=Math.atan2(target.y-e.y,target.x-e.x),size=w*.71,recoil=Math.max(0,1-(e.ageMs-(e.lastShotAgeMs??-1000))/120)*2;
  r.sprite('assets/part-serpent-gun.png',e.x-Math.cos(angle)*recoil,e.y-Math.sin(angle)*recoil,size,size,angle+Math.PI/2);
  for(const side of [-1,1]){const x=e.x+Math.cos(heading)*w*.45*side,y=e.y+Math.sin(heading)*w*.45*side;r.glow(x,y,w*.12,'#ff5142',.2+pulse*.3);}
  r.ring(e.x,e.y,w*.28,'#ffc06a',Math.max(.12,(e.hitPoints??0)/e.definition.hitPoints)*.5);
}
