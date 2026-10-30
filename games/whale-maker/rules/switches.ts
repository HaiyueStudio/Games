import { deviceSolids } from './device-solids';
import type { Body, Item, State } from './model';

export const solidPSwitch=(item:Item)=>item.kind==='p-switch'&&item.alive&&!item.held&&!item.spent;

/** Switches are solid while available; a short release grace protects the thrower. */
export function switchObstacles(s:State,body:Body,player=false,minX=-Infinity,maxX=Infinity):Body[]{
    const obstacles:Body[]=deviceSolids(s).filter(b=>b!==body&&b.x<maxX&&b.x+b.w>minX);
    // Collect in the same stable item/stone/turret/enemy order. All eligibility
    // flags and positions are live, including changes earlier in this very step.
    for(const item of s.items)if(item!==body&&item.x<maxX&&item.x+item.w>minX&&
        (!(player&&s.vehicle===item))&&(solidPSwitch(item)||(item.kind==='basin'||item.kind==='bone-shell'||item.kind==='pow'||item.kind==='red-pow'||item.kind==='wood-crate'||item.kind==='snowball'||item.kind==='snowball-large'||item.kind==='koopa-car')&&item.alive&&!item.held)&&
        !(player&&item.thrown&&item.cooldown>0))obstacles.push(item);
    for(const route of s.snakes)for(const block of route.blocks)if(block!==body&&block.x<maxX&&block.x+block.w>minX)obstacles.push(block);
    for(const stone of s.stones)if(stone!==body&&stone.x<maxX&&stone.x+stone.w>minX)obstacles.push(stone);
    for(const turret of s.turrets)if(turret!==body&&turret.x<maxX&&turret.x+turret.w>minX)obstacles.push(turret);
    if(!s.shots.includes(body))for(const e of s.enemies)if(e!==body&&e.frozen&&e.alive&&!e.held&&e.x<maxX&&e.x+e.w>minX&&!(player&&e.frozen.thrown&&e.cooldown>0))obstacles.push(e);
    const moving=body as Partial<Item>;
    if(moving.kind!=='p-switch'&&(moving.kind!=='pow'||moving.thrown))return obstacles;
    for(const e of s.enemies)if(!e.frozen&&e.x<maxX&&e.x+e.w>minX&&e.alive&&!e.held&&(e.kind!=='plant'||Math.min(e.w,e.h)>=.08))obstacles.push(e);
    if(!(moving.thrown&&(moving.cooldown??0)>0)&&s.player.x<maxX&&s.player.x+s.player.w>minX)obstacles.push(s.player);
    return obstacles;
}

/** Picking up and stomping must also work at the boundary of a solid switch. */
export function touchingSwitch(a:Body,b:Body):boolean {
    const gap=.025;
    return a.x<b.x+b.w+gap&&a.x+a.w>b.x-gap&&a.y<b.y+b.h+gap&&a.y+a.h>b.y-gap;
}
