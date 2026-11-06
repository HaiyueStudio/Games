import { CHEER_DURATION, FLAG_WOBBLE_DURATION, DUST_DURATION } from '../rules/model';

export interface Size { width: number; height: number }
export const ENEMY_SIZE = { duck: 46, turtle: 58, shell: 44,plant:60,fish:42,squid:76,spiky:58,ghost:48,'iron-turtle':58,cannonball:40,'fire-jumper':48,bomb:48,'hammer-otter':70,cactus:48,ant:46,'spike-ant':48,'jump-mouse':48,'spike-mouse':48,'creeper-plant':48,'dry-turtle':58,fishbone:44,'fire-plant':60,'fire-brother':64,'ball-thrower':64,'snow-cactus':48,bee:48,'spring-enemy':52,'ring-ghost':48,bully:56,'giant-fish':100,'lava-dragon':105,magikoopa:66,'homing-bill':44,'giant-bill':144,'cat-bill':52 } as const;
/** One uniform scale; the anchor stays at the center of the actor's feet. */
export function actorRect(source: Size, reference: Size, centerX: number, feetY: number, size: number) {
    const scale = size / Math.max(reference.width, reference.height);
    const width = source.width * scale, height = source.height * scale;
    return { x: centerX - width / 2, y: feetY - height, width, height };
}
export function walkFrame(time: number, moving: boolean, offset = 0): number { return moving ? Math.floor(time * 8 + offset) % 4 : 0; }
export function dustPose(age:number) {
    const t=Math.max(0,Math.min(1,age/DUST_DURATION));
    return {spread:t,scale:.4+.65*Math.sin(t*Math.PI),opacity:1-t**1.5,lift:t*.35};
}
/** Right, front, left, back; one full turn every quarter second. */
export function spinFrame(age: number, character = 0): number { return character * 4 + Math.floor(Math.max(0, age) * 16) % 4; }
/** Anticipation, release, recovery; release matches the projectile windup. */
export function shootFrame(age: number, character = 0): number { return 8 + character * 4 + (age < .05 ? 0 : age < .13 ? 1 : 2); }
/** Twelve painted views cover half a turn; identical Token faces make it loop. */
export function coinFrame(time: number, offset = 0): number { return (Math.floor(Math.max(0, time) * 24) + offset) % 12; }
export function eatFrame(age: number, character = 0): number { return character * 4 + Math.min(3,Math.floor(Math.max(0,age)/.14)); }
export function biteFlight(start: {x:number;y:number}, mouth: {x:number;y:number}, age: number) {
    const t=Math.max(0,Math.min(1,age/.32)),ease=1-(1-t)**3;
    return {x:start.x+(mouth.x-start.x)*ease,y:start.y+(mouth.y-start.y)*ease-Math.sin(t*Math.PI)*.25,
        size:1-.94*t,opacity:Math.max(0,1-Math.max(0,(t-.7)/.3))};
}
export function checkpointFrame(time: number, lit: boolean): number {
    return (lit ? 8 : 0) + Math.floor(Math.max(0, time) * 12) % 8;
}
export function flagWobble(age: number, direction: number): number {
    if (age < 0 || age >= FLAG_WOBBLE_DURATION) return 0;
    const t = age / FLAG_WOBBLE_DURATION;
    return direction * .22 * Math.sin(t * Math.PI * 6) * (1 - t) ** 2;
}
/** Offset the center so rotation keeps the pole's foot fixed to the ground. */
export function checkpointRect(source: Size, baseX: number, feetY: number, height: number, rotation: number) {
    const width = height * source.width / source.height, dx = width * .22, dy = -height / 2;
    const centerX = baseX + dx * Math.cos(rotation) - dy * Math.sin(rotation);
    const centerY = feetY + dx * Math.sin(rotation) + dy * Math.cos(rotation);
    return { x: centerX - width / 2, y: centerY - height / 2, width, height };
}
export function cheerFrame(age: number, character = 0): number {
    return character * 4 + Math.min(3, Math.floor(Math.max(0, age) / (CHEER_DURATION / 4)));
}
export function cheerOffset(age: number): number {
    const t = (age - .12) / .56;
    return t > 0 && t < 1 ? -Math.sin(t * Math.PI) * 10 : 0;
}
