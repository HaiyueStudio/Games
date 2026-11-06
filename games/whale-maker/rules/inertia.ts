import type { State, Input } from './model';
export const WALK_RELEASE_DECEL=5.5**2/(2*1.5);
export const WALK_CROUCH_DECEL=5.5**2/(2*.5);
export const RUN_CROUCH_DECEL=12;
export const REVERSE_DECEL=8.5**2/(2*.6);
/** Exact integral for a constant braking force, including the final partial step. */
export function brakingVelocity(before:number,after:number,acceleration:number,dt:number):number{
    return (before+after)/2*Math.min(dt,Math.abs(before)/acceleration)/dt;
}
export function updateBraking(s:State,i:Input,dt:number):void{
    const p=s.player;
    const turning=s.grounded&&!s.swimming&&!i.down&&i.axis*p.vx<0&&(s.turning||Math.abs(p.vx)>5.65);
    if(turning&&!s.turning)s.turnAge=0;
    s.turning=turning;s.turnAge=turning?s.turnAge+dt:0;
    if(s.springDrift&&(i.axis!==0&&s.wallKick===0||Math.abs(p.vx)<.001))s.springDrift=false;
}
