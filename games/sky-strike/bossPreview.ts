import type {SkyStrikeBattleLayer} from './battleLayer';
import {drawShipDetails,drawSerpentSegment} from './shipDetails';
import {drawMiningArms} from './asteroidVisuals';
import {armSocket,type MiningArm} from './asteroids';
import {ENEMY_DEFINITIONS,SERPENT_SEGMENT_COUNT,CARRIER_DEPLOY_INTERVAL_MS,type EnemyDefinition} from './rules';

/** Preview uses the same hull-specific moving-part renderer at a quiet, deterministic pose. */
export function bossPreview(r:SkyStrikeBattleLayer,definition:EnemyDefinition) {
  if(['inferno-ark','black-hole','crystal-prism','quantum-dreadnought'].includes(definition.id)){
    const id=definition.id==='quantum-dreadnought'?'assets/fx-quantum-preview.png':definition.sprite;
    return {source:r.guiImage(id),sourceKey:id,aspect:definition.renderAspect??1.18};
  }
  return r.guiComposition(`preview:${definition.id}`,layer=>{
    const e={definition,x:240,y:240,rotation:0,ageMs:0,fireCooldownMs:1000,laserCooldownMs:CARRIER_DEPLOY_INTERVAL_MS,charging:false,hitPoints:definition.hitPoints,entered:true};
    const target={x:240,y:900};
    if(definition.id==='ore-reaper'){
      const arms:MiningArm[]=Array.from({length:4},(_,index)=>{const p=armSocket(e,index),x=p.x+(index%2?1:-1)*52,y=p.y+72;
        return {index,x,y,startX:x,startY:y,aimX:x,aimY:y,phase:'idle',ageMs:0,rock:null};});
      drawMiningArms(layer,{arms},e);
    }
    if(definition.id==='iron-serpent'){
      const body=ENEMY_DEFINITIONS.find(d=>d.id==='iron-serpent-turret')!;
      let previous={x:e.x,y:e.y};
      const segments=Array.from({length:SERPENT_SEGMENT_COUNT},(_,i)=>{
        const a=i*.34,x=240+Math.sin(a)*125,y=150-i*38;
        const segment={...e,definition:body,x,y,segmentOrder:i+1};const link={segment,previous};previous=segment;return link;});
      for(const {segment,previous} of [...segments].reverse()){
        layer.sprite('assets/part-serpent-joint.png',(segment.x+previous.x)/2,(segment.y+previous.y)/2,segment.definition.size*.55,Math.hypot(segment.x-previous.x,segment.y-previous.y)+12,Math.atan2(segment.y-previous.y,segment.x-previous.x)-Math.PI/2);
        drawSerpentSegment(layer,segment,previous,target);
      }
    }
    const w=definition.size,h=w*(definition.renderAspect??1.18);
    layer.sprite(definition.sprite,e.x,e.y,w,h);
    drawShipDetails(layer,e,target,false);
  });
}
