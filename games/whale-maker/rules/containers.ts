import type { BlockContent, Body, Enemy, Item, State } from './model';
import { makeEnemy, makeItem, modifyEnemy } from './body-factory';
import { ITEM_KINDS, EXTRA_ENEMIES } from './catalog';

/** One bounded spawn path shared by boxes, trees, pipes, cannons and drops. */
export function spawnContent(s:State,kind:BlockContent,x:number,y:number,direction=0):Body|undefined {
    if(kind==='empty')return;
    if(kind==='auto')kind=s.power?'fire':'growth';
    if(kind==='coin'||ITEM_KINDS.includes(kind)){
        if(s.items.length>=128)return;const item=makeItem(kind as Item['kind'],x,y);Object.assign(item,{x,y,vx:direction*4,vy:direction?-3:0,cooldown:.15});s.items.push(item);return item;
    }else if(kind==='duck'||kind==='turtle'||EXTRA_ENEMIES.includes(kind)){
        if(s.enemies.filter(e=>e.alive).length>=256)return;const e=modifyEnemy(makeEnemy(kind as Enemy['kind'],x,y),{},s.level.theme);Object.assign(e,{x,y,vx:direction*(kind==='cannonball'?5:2)||e.vx,cooldown:kind==='cannonball'?0:.15});s.enemies.push(e);s.enemies=s.enemies.filter(e=>e.alive);return e;
    }else if(s.rewards.length<64){const reward={kind,x,y,w:.8,h:.8,vx:direction*3,vy:0,age:.4,originY:y+1,persistent:true};s.rewards.push(reward);return reward;}
}
export function releaseContent(s:State,container:Body&{content?:BlockContent|undefined;released?:boolean},direction=0):void {
    if(container.released)return;container.released=true;
    if(container.content)spawnContent(s,container.content,container.x+container.w/2-.4,container.y-.75,direction);
}
