import type { SkyStrikeBattleLayer } from './battleLayer';
import { armSocket, type MiningShip, type SkyStrikeAsteroids } from './asteroids';

/** Four two-link hydraulic arms share existing GPU masks; no dynamic texture uploads. */
export function drawMiningArms(r: SkyStrikeBattleLayer, field: SkyStrikeAsteroids, boss: MiningShip): void {
  for (const arm of field.arms) {
    const socket=armSocket(boss,arm.index), side=arm.index%2?1:-1;
    const dx=arm.x-socket.x,dy=arm.y-socket.y,length=Math.max(1,Math.hypot(dx,dy));
    const bend=Math.min(45,length*0.36);
    const elbow={x:(socket.x+arm.x)/2+dy/length*bend*side,y:(socket.y+arm.y)/2-dx/length*bend*side};
    for (const [a,b] of [[socket,elbow],[elbow,arm]]) {
      r.line(a!.x,a!.y,b!.x,b!.y,17,'#111921');
      r.line(a!.x,a!.y,b!.x,b!.y,11,'#6c7378');
      r.line(a!.x-2,a!.y,b!.x-2,b!.y,3,'#d3a04b');
    }
    for (const p of [socket,elbow]) { r.disc(p.x,p.y,11,'#162028');r.ring(p.x,p.y,10,'#d7a34c',0.85);r.disc(p.x,p.y,4,'#7ed9e8'); }
    const a=Math.atan2(arm.y-elbow.y,arm.x-elbow.x),opening=arm.phase==='windup'?0.32:0.82;
    for (const s of [-1,1]) {
      const joint={x:arm.x+Math.cos(a+s*1.15)*17,y:arm.y+Math.sin(a+s*1.15)*17};
      const tip={x:arm.x+Math.cos(a+s*opening)*29,y:arm.y+Math.sin(a+s*opening)*29};
      r.line(arm.x,arm.y,joint.x,joint.y,8,'#b17d39');r.line(joint.x,joint.y,tip.x,tip.y,6,'#e3bd72');
    }
    r.disc(arm.x,arm.y,8,'#24333f');
    if (arm.phase==='windup') {
      r.beam(arm.x,arm.y,arm.aimX,arm.aimY,2,'#ffb84e',true);
      r.ring(arm.aimX,arm.aimY,24,'#ffb84e',0.45+arm.ageMs/1100);
    }
  }
}
export function drawAsteroids(r: SkyStrikeBattleLayer, field: SkyStrikeAsteroids): void {
  for (const rock of field.rocks) {
    if (rock.thrown) {
      const speed=Math.max(1,Math.hypot(rock.vx,rock.vy));
      const x=rock.x-rock.vx/speed*rock.size*0.5,y=rock.y-rock.vy/speed*rock.size*0.5;
      r.sprite('assets/fx-flame.png',x,y,rock.size*0.6,rock.size*1.8,Math.atan2(rock.vy,rock.vx)+Math.PI/2,0.75,'#ffc17c',true);
      r.glow(rock.x,rock.y,rock.size*0.65,'#fba555',0.38);
    }
    r.sprite(`assets/${rock.sprite}.png`,rock.x,rock.y,rock.size,rock.size,rock.rotation);
    if (rock.flashMs>0) r.sprite(`assets/${rock.sprite}.png`,rock.x,rock.y,rock.size,rock.size,rock.rotation,rock.flashMs/190,'#ffbb71',true);
    if (rock.health<rock.maxHealth*0.4) r.glow(rock.x,rock.y,rock.size*0.25,'#ff773b',0.35);
    if (rock.heldBy!==null) r.ring(rock.x,rock.y,rock.radius+5,'#ffbe54',0.55);
  }
}
