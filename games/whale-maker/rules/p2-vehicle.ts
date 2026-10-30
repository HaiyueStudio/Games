import type { Input, State } from './model';
import type { Services } from './expansion';
import { emit } from './events';
export function driveCar(s:State,i:Input,dt:number,svc:Services):void {
    for(const car of s.items)if(car.alive&&car.kind==='koopa-car'&&car!==s.vehicle){car.age+=dt;car.vy=Math.min(18,car.vy+26*dt);svc.move(s,car,dt);car.vx*=Math.exp(-7*dt);if(car.y>s.level.height+2)car.alive=false;
        if(!s.vehicle&&!s.held&&!s.riding&&!s.pipe&&!s.door&&i.interact&&!s.previous.interact&&Math.abs(s.player.x+s.player.w/2-car.x-car.w/2)<1.4&&Math.abs(s.player.y+s.player.h-car.y-car.h)<2){s.vehicle=car;s.wearable&&(s.wearable.active=false);emit(s,'grab',car.x);}}
    const car=s.vehicle;if(!car)return;if(!car.alive||s.pipe||s.door||i.interact&&!s.previous.interact&&i.grab){s.vehicle=null;car.vx=0;s.player.vy=-8;emit(s,'jump',car.x);return;}
    const wasGrounded=Math.abs(car.vy)<.01;car.vx+=(i.axis*10-car.vx)*Math.min(1,dt*5);if(i.axis)s.facing=i.axis;if(i.jump&&!s.previous.jump&&wasGrounded){car.vy=-12;emit(s,'jump',car.x);}car.vy=Math.min(18,car.vy+26*dt);svc.move(s,car,dt);if(car.y>s.level.height+2){car.alive=false;s.vehicle=null;svc.crush(s);return;}
    for(const e of s.enemies)if(e.alive&&!e.transit&&!e.held&&e.kind!=='ghost'&&e.kind!=='ring-ghost'&&car.x<e.x+e.w&&car.x+car.w>e.x&&car.y<e.y+e.h&&car.y+car.h>e.y&&Math.abs(car.vx)>3){svc.defeat(s,e,'shell',car);car.vx*=.8;}
}
export function seatPlayer(s:State):void {const car=s.vehicle;if(!car)return;s.player.x=car.x+car.w/2-s.player.w/2;s.player.y=car.y+.35-s.player.h;s.player.vx=car.vx;s.player.vy=car.vy;s.grounded=Math.abs(car.vy)<.001;s.pound='none';s.crouching=false;s.spinning=false;}
