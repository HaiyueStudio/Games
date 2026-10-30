import {cellAt as tile} from './terrain';
import type {PlayerPower} from './player-body';
import type {Services} from './services';
import {hurtPlayer as hurt,killPlayer,SHOT_DURATION,EAT_DURATION,CHEER_DURATION} from './player-damage';
export {SHOT_DURATION,EAT_DURATION,CHEER_DURATION} from './player-damage';
import {playerDimensions} from './player-body';
export {overlaps} from './geometry';
import {overlaps} from './geometry';
import {SHELL_TOOLS,SHELL_NAMES,hasHelmet,ridingBoneShell} from './player-equipment';
import {shellInput,floatShell,boneRest} from './shell-equipment';
import {progressStep,progressReward,finishProgress} from './p2-progress';
import {areaTravel,respawnP2} from './p2-areas';
import {advanceP2Camera,cameraCrush} from './p2-camera';
import {advanceLiquid} from './p2-liquid';
import {initP2Mechanisms,advanceP2Mechanisms} from './p2-mechanisms';
import {driveCar,seatPlayer} from './p2-vehicle';
import {initP2Bosses,updateP2Bosses} from './p2-bosses';
import { bullyContact, advanceMagic } from './p2-enemies';
import { initP2, type P2State } from './p2';
import { P2_ENEMIES, P2_NAMES, WEARABLES, P2_PROPERTY_KEYS, validP2Property, p2Issues, isWearable } from './p2-schema';
import { equipWearable, wearCeiling, wearTimers, wearableInput, wearMotion, afterWearMove, advanceCannonShots } from './p2-wearables';
import { initP1, p1Timers, conditionProgress } from './p1';
import { advanceDevices, oneWayDevices, triggerExtension, treeContact, warpBoxes } from './p1-mechanisms';
import { prepareMotion, applyMotion } from './p1-motion';
import { abilities } from './p1-abilities';
import { modifyEnemy, advanceEnemyProjectiles } from './p1-enemies';
import { advancePipeObjects } from './pipe-objects';
import { collectKey } from './adventure';
import type { P1State } from './p1';
import { P1_ENEMIES, P1_NAMES, CONTAINER_TILES, PATH_TILES, P1_PROPERTIES, validP1Property, levelIssues } from './p1-schema';
/** Deterministic 120 Hz platformer. Coordinates are tiles, y points down. */
import { coastOneOne, mechanismCoast, secretGarden, advancedCoast } from './levels';
import { EXTRA_TOOLS, EXTRA_NAMES, ITEM_KINDS, EXTRA_ENEMIES, type ExtraTile, type ItemKind, type ElementProperties } from './catalog';
import { initExpansion, makeItem, makeEnemy, expansionTimers, inWater, resolveSlope, slopeIntersects, pressPSwitch, doorStep, updateItems, updateSpecialEnemy, detonatePow } from './expansion';
import { curvedGlassCell, glassIntersects, resolveGlassAxis, validGlassPath, glassCells, upgradeGlassPipes, enterGlassPipe, advanceGlassPipe, type Point } from './glass';
import { resolveEnemyContacts } from './enemy-contacts';
import { switchObstacles } from './switches';
import { updateBraking, brakingVelocity, WALK_RELEASE_DECEL, WALK_CROUCH_DECEL, RUN_CROUCH_DECEL, REVERSE_DECEL } from './inertia';
import { drownEnemies } from './hazards';
import { initWorkshop, advanceWorkshop, surface, isBrick, bombContact, breakCrate, type WorkshopState } from './workshop';
import { validSnakePath } from './snake-path';
import { initFlowers, freezeEnemy, thawEnemy, updateFrozen, interactFrozen, frostEffect, advanceFrost, shatterFrozen } from './frost';
import { setCell } from './terrain';
import { initAdventure, advanceAdventure, updateStones, vineStep, bonkStone, type Stone, type FollowingKey } from './adventure';
import { initAdvanced, advancedTimers, effect, toggleColor, meltIce, updateTurrets, bonkTurret, ironWake, heldAction, ridingStep, placeRiding, type AdvancedState } from './advanced';
import { updateGoal, goalAt, goalPoints, GOAL_HEIGHT, poleHeight } from './goal';
import { bumpContents, type BrickBump } from './brick-reactions';
import { bounceHorizontalSpring, bounceVerticalSpring, standOnHorizontalSpring, updateSpringLaunch } from './springs';
import { pipeShape, enterOrdinaryPipe, advanceOrdinaryPipe } from './pipes';
import { defeatEnemy as defeat, bonkWithHelmet, crushPlayer } from './combat';
import { grantPower } from './power';
import { validRules, rulesFor, type RuleOptions } from './profile';
import { attackResult, bossAttackResult, mechanismResult, ENEMY_TRAITS } from './interactions';
import { initialScore, collectToken, actionScore, type ScoreState } from './scoring';
import { emit, type GameEvent } from './events';
import { sandJump, resolveSand, heldSnowContact, hitCactus, cactusCells } from './desert';
import { initFortress, advancePlatforms, updateFortress, damageBoss, releaseBridge, type FortressState } from './fortress';
export type Tile = '.' | '#' | 'B' | '?' | '=' | '^' | 'o' | 'G' | 'F' | 'C' | 'E' | 'T' | 'J' | 'P' | 'Q' | 'p' | 'q' | 'U' | ExtraTile;
export const TOOLS: Tile[] = ['#', 'B', '?', '=', '^', 'o', 'G', 'F', 'C', 'E', 'T', 'J', 'P', '.', ...EXTRA_TOOLS];
export const NAMES = ['珊瑚地面', '贝壳砖', '宝物方块', '单向云台', '尖刺', 'Token金币', '成长珍珠', '火珊瑚', '检查点', '终点', '龟龟', '咕咕嘎嘎', '管道', '橡皮擦', ...EXTRA_NAMES];
export const CONTENTS = ['auto', 'coin', 'growth', 'fire', 'duck', 'turtle', 'empty','spring-v','basin','pow','p-switch','star','plant','fish','squid','spiky','key','cannonball','iron-turtle','ghost','giant-pearl','ice-flower','fire-jumper','wood-crate','bomb','hammer-otter','spring-h','snowball','cactus','cat-bell','boomerang-flower','hammer-suit','red-pow','snowball-large',...P1_ENEMIES,...WEARABLES,...P2_ENEMIES,'one-up','coin-10','coin-30','coin-50',...SHELL_TOOLS] as const;
export type BlockContent = typeof CONTENTS[number];
export const CONTENT_NAMES = ['自动成长', 'Token金币', '成长珍珠', '火珊瑚', '咕咕嘎嘎', '龟龟', '空方块','纵向弹簧','铁盆','POW块','P开关','无敌星','食人花','鱼','鱿鱼','尖刺龟','钥匙','可爱炮弹','铁壳龟','害羞幽灵','巨型珍珠','冰花','跳跃火焰','木箱','炸弹小怪','投锤海獭','横向弹簧','雪球','仙人球','猫铃铛','回旋镖花','建造锤','红POW','大雪球',...P1_NAMES.slice(24,35),...P2_NAMES.slice(0,15),'生命珍珠','十枚金币','三十金币','五十金币',...SHELL_NAMES];
export interface Warp { from: [number, number]; to: [number, number] }
export interface Level {
    areas?:Record<string,import('./p2-schema').SubArea>;
    orientation?:'horizontal'|'vertical';
    progress?:import('./p2-schema').ProgressOptions;
    cameraRules?:import('./p2-schema').CameraOptions;
    liquid?:import('./p2-schema').LiquidOptions;
    liquidSurface?:number;
    theme?:import('./p1-schema').Theme;
    condition?:import('./p1-schema').Condition;
    version: 1;
    rules?:RuleOptions;
    name: string;
    backdrop?: 'coast'|'castle'|'mountains'|'plains'|'night'|'desert';
    classicStage?:number;
    finish?:'flag'|'castle';
    playHeight?:number;
    rooms?:{x:number;y:number;w:number;h:number}[];
    width: number;
    height: number;
    spawn: [
        number,
        number
    ];
    cells: Tile[];
    warps?: Warp[];
    /** Question-block contents keyed by decimal cell index; missing means auto. */
    contents?: Record<string, BlockContent>;
    properties?: Record<string, ElementProperties>;
}
export interface Body {
    bounceWait?:number;generatorId?:number;
    x: number;
    y: number;
    w: number;
    h: number;
    vx: number;
    vy: number;
    sandSurface?:number;
    sandDepth?:number;
    sandJumping?:boolean;
    pushVx?:number;
    attackChain?:number;
    transit?:import('./pipe-objects').ObjectTransit;
    transitWait?:number;
}
export interface Enemy extends Body {
    kind: 'turtle' | 'duck' | 'shell' | 'plant' | 'fish' | 'squid' | 'spiky' | 'cannonball' | 'iron-turtle' | 'ghost' | 'fire-jumper' | 'bomb' | 'hammer-otter' | 'cactus' | import('./p1-schema').P1EnemyKind | import('./p2-schema').P2EnemyKind;
    alive: boolean;
    held: boolean;
    cooldown: number;
    origin?: [number,number];
    plantMouth?:[number,number];
    plantDirection?:[number,number];
    mode?: 'pipe'|'fixed';
    age?: number;
    grounded?: boolean;
    turnWait?: number;
    iron?:boolean;
    inverted?:boolean;ballistic?:boolean;projectileAge?:number;
    baseKind?:Enemy['kind'];
    shellAge?:number;
    shy?:boolean;
    springWait?:number;
    springLaunch?:number;
    springPace?:number;
    springAir?:boolean;
    cactusSegments?:number;
    cactusDrop?:number;
    squidPhase?:'rise'|'sink';
    squidPeak?:number;
    squidRiseAge?:number;
    squidRiseStart?:[number,number];
    squidDrift?:number;
    frozen?:import('./frost').FrozenState;
    drop?:'coin'|'key';
    flamePhase?:'wait'|'flight';
    flameWait?:number;
    jumpHeight?:number;
    period?:number;
    bombFuse?:number;
    bombThrown?:boolean;
    bombFlight?:'stomp'|'kick'|'throw';
    bombBounces?:number;
    hammerWait?:number;
    hammerPoseAge?:number;
    hammerJumpWait?:number;
    hammerDropRow?:number;
    hammerJumps?:number;
    hammerFacing?:number;
    smart?:boolean;
    flight?:[number,number];
    modifiers?:import('./catalog').ElementProperties;
    ai?:{phase:string;age:number;home:[number,number];direction:number;lastJump:number;wait:number;distance?:number;revives?:number};
    downAge?:number;
    removedWings?:boolean;health?:number;magicCount?:number;
}
export interface Item extends Body { kind:ItemKind; alive:boolean; held:boolean; cooldown:number; age:number; thrown:boolean; spent:boolean; springBounces?:number; compression?:number; pressedAge?:number;bumpUntil?:number;content?:BlockContent|undefined;released?:boolean;rotation?:number|undefined;large?:boolean|undefined;construction?:number;health?:number }
export interface Input {
    axis: number;
    jump: boolean;
    spin: boolean;
    down: boolean;
    grab: boolean;
    fire: boolean;
    interact?: boolean;
    special?:boolean;
    build?:boolean;
}
export interface Reward extends Body { kind: Exclude<BlockContent, 'auto' | 'empty'>; age: number; originY: number;bumpUntil?:number;persistent?:boolean;charges?:number }
export interface Defeated extends Body { kind: Enemy['kind']; cause: 'stomp' | 'shot' | 'shell' | 'block' | 'pow' | 'star' | 'slide' | 'pound' | 'lava' | 'sand' | 'claw' | 'boomerang' | 'hammer'; lavaY?:number;bombFuse?:number; age: number; angle: number }
export interface State extends AdvancedState, FortressState, WorkshopState, P1State, P2State {
    events:GameEvent[];
    eventSerial:number;
    level: Level;
    /** Untouched level blueprint used to reconstruct each life. */
    startLevel: Level;
    player: Body;
    enemies: Enemy[];
    shots: (Body&{kind?:'fire'|'ice';bounces?:number})[];
    scoreChain:ScoreState;
    scorePops:{x:number;y:number;age:number;points:number;chain:number}[];
    rewards: Reward[];
    coinPops:{x:number;y:number;age:number}[];
    defeated: Defeated[];
    power: PlayerPower;
    fallPeak:number;
    giantBounce:boolean;
    facing: number;
    grounded: boolean;
    crouching: boolean;
    crouchAge: number;
    running: boolean;
    skidding: boolean;
    skidDecel:number;
    turning:boolean;
    turnAge:number;
    springDrift:boolean;
    stride: number;
    dust: { x:number;y:number;age:number;direction:number;size:number }[];
    dustWait: number;
    wall: number;
    wallGrace: number;
    wallDirection: number;
    wallKick: number;
    bufferedSpin: boolean;
    coyote: number;
    buffer: number;
    spinning: boolean;
    spinAge: number;
    jumpSustain: boolean;
    jumpCut: boolean;
    held: Enemy | Item | null;
    items: Item[];
    stones:Stone[];
    keys:FollowingKey[];
    keyTrail:{x:number;y:number}[];
    unlockedDoors:Record<string,true>;
    climbing:boolean;
    climbAge:number;
    climbWait:number;
    starTime:number;
    helmet:boolean;
    pTime:number;
    pConversions:Record<string,{from:Tile;to:Tile}>;
    springEffects:{x:number;y:number;age:number;kind:'spring-h'|'spring-v'}[];
    swimming:boolean;
    swimAge:number;
    sliding:boolean;
    slope:number;
    slideTime:number;
    shake:number;
    powFlash:number;
    door:null|{age:number;from:[number,number];to:[number,number];source:number;target:number};
    doorWait:number;
    view:{x:number;y:number;w:number;h:number};
    invincible: number;
    fireWait: number;
    shootAge: number;
    shootFacing: number;
    pendingShot: boolean;
    eatAge: number;
    eatFacing: number;
    bites: { x: number; y: number; age: number }[];
    coins: number;
    deaths: number;
    time: number;
    phase: 'playing' | 'dead' | 'won';
    checkpoint: [
        number,
        number
    ];
    litCheckpoints: Record<string, true>;
    flagWaves: { x: number; y: number; age: number; direction: number }[];
    cheerAge: number;
    cheerFacing: number;
    previous: Input;
    notice: string;
    deathAge: number;
    victory: { age: number; baseY: number; settleAge: number; ready: boolean; stage:'slide'|'approach'|'cheer'|'walk'|'done';poleX:number;castleX:number;points:number;startY?:number;flagTarget?:number;flagProgress?:number;autoCastle?:boolean } | null;
    bumps: BrickBump[];
    fragments: (Body & { age: number; angle: number })[];
    pipeWait: number;
    pipe: { age: number; from: [number, number]; to: [number, number]; glass?:boolean; path?:Point[];travel?:number;angle?:number;flip?:boolean;exitDirection?:Point;entryDirection?:Point;glassCore?:Point[];glassFrom?:{point:Point;normal:Point};glassTo?:{point:Point;normal:Point};glassExiting?:boolean;glassReturns?:number } | null;
}
export const EMPTY_INPUT: Input = { axis: 0, jump: false, spin: false, down: false, grab: false, fire: false };
export const JUMP_SPEED = 13.5;
export const FIREBALL_SPEED = 11;
export const SHOT_WINDUP = .05;


export const FLAG_WOBBLE_DURATION = 1.1;

export const WALK_SPEED = 5.5;
export const RUN_SPEED = 8.5;
export const WALK_ACCELERATION = 30;
export const SKID_DECELERATION = 12;
export const DUST_DURATION = .48;
export function demo(index = 0): Level {
    if(index===4)return advancedCoast();
    if(index===3)return secretGarden();
    if(index===2)return mechanismCoast();
    if (index === 0) return coastOneOne();
    const width = 100, height = 18, cells: Tile[] = Array(width * height).fill('.');
    const put = (x: number, y: number, t: Tile) => { cells[y * width + x] = t; };
    for (let x = 0; x < width; x++)
        for (let y = 15; y < 18; y++)
            if (!((x >= 22 && x <= 24) || (x >= 48 && x <= 51) || (x >= 75 && x <= 78)))
                put(x, y, '#');
    for (const [x, y, n] of [[7, 11, 6], [18, 10, 5], [25, 12, 5], [35, 9, 6], [45, 11, 8], [58, 11, 5], [68, 10, 7], [77, 12, 5], [87, 10, 6]])
        for (let k = 0; k < n!; k++)
            put(x! + k, y!, '=');
    for (const x of [9, 14, 31, 55, 64, 84])
        put(x, 11, '?');
    for (const x of [11, 12, 32, 33, 56, 57])
        put(x, 11, 'B');
    for (const x of [16, 29, 42, 60, 70, 86])
        put(x, 14, 'T');
    for (const x of [20, 38, 54, 66, 89])
        put(x, 14, 'J');
    for (const x of [36, 37, 72, 73])
        put(x, 14, '^');
    for (let x = 5; x < 95; x += 3)
        put(x, x % 2 ? 8 : 13, 'o');
    put(5, 14, 'G');
    put(17, 9, 'F');
    put(44, 14, 'C');
    put(95, 14, 'E');
    if (index === 1) {
        for (let y = 8; y < 15; y++) {
            put(80, y, 'B');
            put(84, y, 'B');
        }
        put(82, 7, 'o');
    }
    return { version: 1, name: index ? '02 · 反墙星湾' : '01 · 珍珠海岸', width, height, spawn: [2, 13], cells };
}
export function validate(value: unknown,child=false,main?:Level): Level {
    const l = value as Level;
    if(l?.rules!==undefined&&!validRules(l.rules))throw Error('关卡规则配置无效');
    if(l?.backdrop!==undefined&&!['coast','castle','mountains','plains','night','desert'].includes(l.backdrop))throw Error('远景配置无效');
    if(l?.classicStage!==undefined&&(!Number.isInteger(l.classicStage)||l.classicStage<1||l.classicStage>4))throw Error('闯关编号无效');
    if(l?.finish!==undefined&&!['flag','castle'].includes(l.finish))throw Error('终点配置无效');
    if(l?.playHeight!==undefined&&(!Number.isInteger(l.playHeight)||l.playHeight<10||l.playHeight>l.height))throw Error('主场景高度无效');
    if(l?.rooms!==undefined&&(!Array.isArray(l.rooms)||l.rooms.length>16||!l.rooms.every(r=>r&&[r.x,r.y,r.w,r.h].every(Number.isInteger)&&r.x>=0&&r.y>=0&&r.w>=1&&r.h>=1&&r.x+r.w<=l.width&&r.y+r.h<=l.height)))throw Error('房间配置无效');
    if (!l || l.version !== 1 || !Number.isInteger(l.width) || l.width < 20 || l.width > 240 || !Number.isInteger(l.height) || l.height < 10 || l.height > 256 || !Array.isArray(l.cells) || l.cells.length !== l.width * l.height || !l.cells.every(c => TOOLS.includes(c) || ['Q','p','q','U','glass-right','glass-left-shaft','glass-right-shaft','glass-body','stone-body','cannon-body','boss-body','cactus-body','gentle-up-body','gentle-down-body'].includes(c)) || !Array.isArray(l.spawn) || l.spawn.length !== 2 || !l.spawn.every(Number.isFinite) || l.spawn[0] < 0 || l.spawn[0] >= l.width || l.spawn[1] < 0 || l.spawn[1] >= l.height || typeof l.name !== 'string')
        throw Error('关卡格式无效（20–240 列，10–256 行（坐标0–255））');
    if (l.warps !== undefined && (!Array.isArray(l.warps) || l.warps.length > 32 || !l.warps.every(w => w && [w.from,w.to].every(v => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) && v[0] >= 0 && v[0] < l.width && v[1] >= 0 && v[1] < l.height)))) throw Error('管道出口格式无效');
    if (l.contents !== undefined && (!l.contents || typeof l.contents !== 'object' || Array.isArray(l.contents) || !Object.entries(l.contents).every(([key, value]) => /^(0|[1-9]\d*)$/.test(key) && Number(key) < l.cells.length && CONTAINER_TILES.has(l.cells[Number(key)]!) && CONTENTS.includes(value)))) throw Error('宝物方块内容无效');
    if(l.properties!==undefined&&(!l.properties||typeof l.properties!=='object'||Array.isArray(l.properties)||!Object.entries(l.properties).every(([key,p])=>/^(0|[1-9]\d*)$/.test(key)&&Number(key)<l.cells.length&&l.cells[Number(key)]!=='.'&&p&&typeof p==='object'&&!Array.isArray(p)&&Object.entries(p).every(([k,v])=>P2_PROPERTY_KEYS.has(k)?validP2Property(k,v):P1_PROPERTIES.has(k)?validP1Property(k,v):k==='drop'?['coin','key'].includes(String(v))&&(l.cells[Number(key)]==='J'||l.cells[Number(key)]==='T'||EXTRA_ENEMIES.includes(l.cells[Number(key)]!)):k==='link'?Number.isInteger(v)&&Number(v)>=1&&Number(v)<=99:k==='length'?Number.isInteger(v)&&Number(v)>=1&&Number(v)<=16:k==='speed'?typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=6:k==='rotation'?[0,90,180,270].includes(Number(v))&&typeof v==='number':k==='phase'?typeof v==='number'&&Number.isFinite(v):k==='mode'?v==='fixed'||v==='pipe':k==='jumpHeight'?typeof v==='number'&&Number.isFinite(v)&&v>=1&&v<=16:k==='period'?typeof v==='number'&&Number.isFinite(v)&&v>=.25&&v<=30:k==='axis'?v==='x'||v==='y':k==='range'||k==='flight'?Array.isArray(v)&&v.length===2&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=(k==='flight'||p.axis==='y'?l.height:l.width))&&v[0]<v[1]:k==='slippery'?typeof v==='boolean':k==='loop'||k==='smart'?typeof v==='boolean':k==='plant'||k==='endPlant'?typeof v==='boolean':k==='height'?Number.isInteger(v)&&Number(v)>=1&&Number(v)<=8:k==='direction'?['left','right','down'].includes(String(v)):k==='path'?(PATH_TILES.has(l.cells[Number(key)]!)?validSnakePath(l,Number(key),v):l.cells[Number(key)]==='glass-pipe'&&validGlassPath(l,Number(key),v)):false))))throw Error('机关配置无效');
    const cannonOwned=new Set<number>();
    l.cells.forEach((t,id)=>{if(t!=='cannon')return;const h=l.properties?.[id]?.height??2;if(Math.floor(id/l.width)-h+1<0)throw Error('炮塔高度超出地图');for(let n=0;n<h;n++){const cell=id-n*l.width;if(l.cells[cell]!== (n?'cannon-body':'cannon')||cannonOwned.has(cell))throw Error('炮塔需要完整的空间');cannonOwned.add(cell);}});
    if(l.cells.some((t,id)=>t==='cannon-body'&&!cannonOwned.has(id)))throw Error('炮塔需要完整的空间');
    if(l.cells.some((t,id)=>t==='giant-pearl'&&(id%l.width+1>=l.width||Math.floor(id/l.width)<1)))throw Error('巨型珍珠需要完整的2×2空间');
    const stoneOwned=new Set<number>();
    l.cells.forEach((t,id)=>{if(t!=='stone')return;if(id%l.width+2>l.width||Math.floor(id/l.width)+2>l.height||[id+1,id+l.width,id+l.width+1].some(n=>l.cells[n]!=='stone-body'||stoneOwned.has(n)))throw Error('石头需要完整的2×2空间');for(const n of [id,id+1,id+l.width,id+l.width+1])stoneOwned.add(n);});
    if(l.cells.some((t,id)=>t==='stone-body'&&!stoneOwned.has(id)))throw Error('石头需要完整的2×2空间');
    const bossOwned=new Set<number>();
    l.cells.forEach((t,id)=>{if(t!=='turtle-boss')return;if(id%l.width+2>l.width||Math.floor(id/l.width)+2>l.height||[id+1,id+l.width,id+l.width+1].some(n=>l.cells[n]!=='boss-body'||bossOwned.has(n)))throw Error('首领需要完整的2×2空间');for(const n of [id,id+1,id+l.width,id+l.width+1])bossOwned.add(n);});
    if(l.cells.some((t,id)=>t==='boss-body'&&!bossOwned.has(id)))throw Error('首领需要完整的2×2空间');
    for(const [key,p]of Object.entries(l.properties??{}))if(l.cells[Number(key)]==='P'&&p.rotation!==undefined){const pipe=pipeShape(l,Number(key))!;if(pipe.x+pipe.width>l.width||pipe.y+pipe.height>l.height||pipe.cells.some(n=>!['P','Q','p','q'].includes(l.cells[n]!)||(n!==Number(key)&&l.cells[n]==='P')))throw Error('管道需要完整的空间');}
    const cactusOwned=new Set<number>();
    l.cells.forEach((t,id)=>{if(t!=='cactus')return;const cells=cactusCells(l,id);if(Math.floor(id/l.width)-cells.length+1<0||cells.some((n,i)=>l.cells[n]!== (i?'cactus-body':'cactus')||cactusOwned.has(n)))throw Error('仙人球需要完整的叠层空间');for(const n of cells)cactusOwned.add(n);});
    if(l.cells.some((t,id)=>t==='cactus-body'&&!cactusOwned.has(id)))throw Error('仙人球叠层不完整');
    const glassOwned=new Set<number>();
    for(const [key,p]of Object.entries(l.properties??{}))if(p.path&&l.cells[Number(key)]==='glass-pipe')for(const id of glassCells(l,Number(key),p.path)){if(l.cells[id]!== (id===Number(key)?'glass-pipe':'glass-body'))throw Error('透明管道路径格式无效');glassOwned.add(id);}
    if(l.cells.some((t,id)=>t==='glass-body'&&!glassOwned.has(id)))throw Error('透明管道路径格式无效');
    if (!l.cells.includes('E')&&!child)
        throw Error('请放置至少一个终点');
    const issues=[...levelIssues(l),...p2Issues(l,main??l)];if(issues.length)throw Error(issues[0]!.message);
    if(!child&&l.areas)for(const [id,area]of Object.entries(l.areas)){if((area as Level)?.areas)throw Error('副区域不能嵌套');try{validate({...area,areas:l.areas},true,l);}catch(e){throw Error(`副区 ${id}：${(e as Error).message}`);}}
    return structuredClone(l);
}
export function create(level: Level): State {
    const copy = structuredClone(level), enemies: Enemy[] = [],initialBody=playerDimensions({power:0,riding:null,crouching:false});
    upgradeGlassPipes(copy);
    const advanced=initAdvanced(copy);
    const {extraEnemies,...extra}=initExpansion(copy);enemies.push(...extraEnemies);
    const adventure=initAdventure(copy);
    const fortress=initFortress(copy);fortress.bosses.push(...initP2Bosses(copy));
    const flowers=initFlowers(copy);
    const workshop=initWorkshop(copy),p1=initP1(copy),p2=initP2(level);p2.p2Mechanisms=initP2Mechanisms(copy);
    copy.cells.forEach((t, i) => { if (t === 'T' || t === 'J') {
        const props=copy.properties?.[i];
        enemies.push(modifyEnemy({ x: i % copy.width + .1, y: Math.floor(i / copy.width) + .2, w: .8, h: .8, vx: -1.5, vy: 0, kind: t === 'T' ? 'turtle' : 'duck', alive: true, held: false, cooldown: 0,...(props?.drop?{drop:props.drop}:{}),...(props?.smart!==undefined?{smart:props.smart}:{}),...(props?.flight?{flight:props.flight}:{}) },props,copy.theme));
        const x=i%copy.width;copy.cells[i]=props?.liquid??((x>0&&copy.cells[i-1]==='lava'||x+1<copy.width&&copy.cells[i+1]==='lava')?'lava':'.');
    } });
    for(const e of enemies)if(e.grounded===undefined)e.grounded=solid(tile(copy,e.x+e.w/2,e.y+e.h+.03),0,true);
    return { ...p2, ...advanced, ...extra, ...adventure,...fortress,...workshop,...p1,scoreChain:initialScore(),scorePops:[],events:[],eventSerial:0, level: copy, startLevel: structuredClone(level), player: { x: level.spawn[0], y: level.spawn[1], ...initialBody, vx: 0, vy: 0 }, enemies, shots: [], rewards: flowers, coinPops:[],defeated: [], power: 0, fallPeak:level.spawn[1]+initialBody.h,giantBounce:false, facing: 1, grounded: false, crouching: false, crouchAge: 0, running: false, skidding: false, skidDecel:WALK_CROUCH_DECEL,turning:false,turnAge:0,springDrift:false, stride: 0, dust: [], dustWait: 0, wall: 0, wallGrace: 0, wallDirection: 0, wallKick: 0, bufferedSpin: false, coyote: 0, buffer: 0, spinning: false, spinAge: 0, jumpSustain: false, jumpCut: false, held: null, invincible: 0, fireWait: 0, shootAge: SHOT_DURATION, shootFacing: 1, pendingShot: false, eatAge: EAT_DURATION, eatFacing: 1, bites: [], coins: 0, deaths: 0, time: 0, phase: 'playing', checkpoint: [...level.spawn], litCheckpoints: {}, flagWaves: [], cheerAge: CHEER_DURATION, cheerFacing: 1, previous: { ...EMPTY_INPUT }, notice: '顶宝物块获得成长珍珠 · 发光管道上按下进入', deathAge: 0, victory: null, bumps: [], fragments: [], pipeWait: 0, pipe: null };
}
export {cellAt as tile} from './terrain';


export function solid(t: Tile,pTime=0,redOn=true) { return ['hard-block','conveyor','dash-block','spike-switch'].includes(t) || t==='speed-belt' || t==='firebar' || t==='bridge' || t==='red-block'&&redOn || t==='blue-block'&&!redOn || t==='toggle-switch' || (t==='ice'||t==='ice-solid') || t === '^' || t === 'E' || t === 'spike-all' || t === '#' || t === 'B' || t === '?' || t === 'U' || t === 'P' || t === 'Q' || t === 'p' || t === 'q' || ['glass-pipe','glass-right','glass-left-shaft','glass-right-shaft','glass-body'].includes(t) || t==='p-on'&&pTime>0 || t==='p-off'&&pTime===0; }
export function blockOffset(age: number): number { return age >= 0 && age < .24 ? -Math.sin(age / .24 * Math.PI) * .22 : 0; }
/** Two cheerful hops with a short windup and an exact return to the floor. */
export function victoryOffset(age: number): number {
    const hop = (start: number, duration: number, height: number) => {
        const t = (age - start) / duration;
        return t > 0 && t < 1 ? -4 * height * t * (1 - t) : 0;
    };
    return hop(.14, .7, 1.6) + hop(.96, .44, .55);
}
function fitsHeight(s: State, height: number, width=s.player.w): boolean {
    const p = s.player, feet = p.y + p.h;
    const body={...p,x:p.x+(p.w-width)/2,y:feet-height,h:height,w:width};
    if(glassIntersects(s.level,body))return false;
    if(switchObstacles(s,p,true,body.x,body.x+body.w).some(item=>overlaps(body,item)))return false;
    for (let y = Math.floor(feet - height); y <= Math.floor(feet - .001); y++)
        for (let x = Math.floor(body.x); x <= Math.floor(body.x + body.w - .001); x++)
            if (solid(tile(s.level, x, y),s.pTime,s.redOn)&&!curvedGlassCell(s.level,x,y)||slopeIntersects(tile(s.level,x,y),x,y,body)) return false;
    return true;
}
function positionHeld(s:State):void {
    placeRiding(s);
    if(!s.held)return;
    const p=s.player;
    if(s.pipe?.glass&&s.pipe.path){const angle=s.pipe.angle??0,reach=s.power?.65:.45;s.held.x=p.x+p.w/2+Math.cos(angle)*reach-s.held.w/2;s.held.y=p.y+p.h/2+Math.sin(angle)*reach-s.held.h/2;return;}
    s.held.x=p.x+p.w/2+s.facing*.6-s.held.w/2;
    s.held.y=Math.min(p.y+p.h-s.held.h-.03,p.y+p.h-(s.power?.8:.45)-s.held.h/2);
}
function finish(s: State,x:number,y:number,autoCastle=false) {
    finishProgress(s,y*s.level.width+x);emit(s,'goal',x+.5);
    const points=s.level.finish==='castle'?100:goalPoints(s,y);s.score+=points;
    s.phase = 'won';
    s.victory = { age:0,baseY:y-s.player.h,settleAge:0,ready:false,stage:'slide',poleX:x+.5,castleX:Math.min(s.level.width-s.player.w-.01,x+4),points,startY:s.player.y,flagTarget:Math.max(y-poleHeight(s,x,y),Math.min(y-1,s.player.y)),flagProgress:0 };
    if(s.level.finish==='castle'){s.victory.stage='cheer';s.victory.ready=true;s.victory.baseY=y+1-s.player.h;s.victory.castleX=x+.5-s.player.w/2;if(autoCastle){s.victory.stage='approach';s.victory.ready=false;s.victory.baseY=s.player.y;s.victory.autoCastle=true;}else{s.player.y=s.victory.baseY;emit(s,'victory');}}
    s.player.vx = 0; s.player.vy = 0;
    s.spinning = false; s.crouching = false; s.crouchAge = 0;s.climbing=false;
    s.running = s.skidding = s.turning = false;s.springDrift=false; s.dust = []; s.dustWait = 0;
    s.spinAge = 0; s.jumpSustain = false; s.jumpCut = false; s.pendingShot = false; s.shootAge = SHOT_DURATION;
    s.bites = []; s.eatAge = EAT_DURATION;
    s.flagWaves = []; s.cheerAge = CHEER_DURATION;
    s.invincible = 0; s.buffer = 0; s.wallKick = 0;
    if (s.held) { s.held.held = false; s.held.vx = 0; s.held = null; }
    s.notice = '抵达星海！编辑自己的冒险吧';
}
function breakBrick(s: State, x: number, y: number, giant=false): void {
    if (tile(s.level, x, y) !== 'B'&&!(giant&&tile(s.level,x,y)==='#')) return;
    emit(s,'break',x+.5);
    setCell(s.level,y * s.level.width + x,'.');
    for (let n = 0; n < 4; n++) s.fragments.push({ x: x + (n % 2) * .5, y: y + Math.floor(n / 2) * .5, w: .35, h: .35, vx: n % 2 ? 3 : -3, vy: -6 - Math.floor(n / 2) * 2, age: 0, angle: n });
    s.fragments = s.fragments.slice(-48);
}
function hitBlock(s: State, x: number, y: number, t: Tile,down=false): void {
    if(triggerExtension(s,x,y,down,services))return;
    if(t==='toggle-switch'&&mechanismResult(t,down?'pound':'head')==='trigger'){toggleColor(s);return;}
    if (t !== 'B' && t !== '?' && t !== 'hidden-block') return;
    emit(s,'bump',x+.5);
    s.bumps = s.bumps.filter(b => b.x !== x || b.y !== y);
    const bump={x,y,age:0,down,strikerX:s.player.x+s.player.w/2};s.bumps.push(bump);bumpContents(s,bump,y,services);
    // Check support before a powered head hit removes the brick.
    for(const e of s.enemies)if(e.alive&&!e.held&&e.vy>=0&&
        !(e.kind==='plant'&&Math.min(e.w,e.h)<.08)&&Math.abs(e.y+e.h-y)<=.04&&
        e.x<x+1-.001&&e.x+e.w>x+.001)defeat(s,e,'block');
    if (t === 'B' && (s.power > 0 || hasHelmet(s))) breakBrick(s, x, y);
    if (t === '?' || t === 'hidden-block') {
        s.level.cells[y * s.level.width + x] = 'U';
        const id = y * s.level.width + x;
        const content = s.level.contents?.[id] ?? 'auto';
        if (s.level.contents) delete s.level.contents[id];
        const kind = content === 'auto' ? (s.power === 0 ? 'growth' : 'fire') : content;
        if (kind !== 'empty') {const giant=kind==='giant-pearl';s.rewards.push({ kind, x: giant?x-.5:x+.1, y: giant?y:y+.1, originY:giant?y:y+.1, w:giant?2:.8, h:giant?2:.8, vx:kind==='growth'?2:0,vy:0,age:0 });}
        if(kind!=='empty')emit(s,'reward',x+.5);
        s.rewards = s.rewards.slice(-64);
        s.notice = '宝物出现了！';
    }
}
function move(s: State,b:Body,dt:number,player=false,breakSideBricks=false){
    if(b.transit)return {floor:false,wall:0,slope:0};
    if((b.sandDepth??0)>0&&rulesFor(s.level).rewards==='score')b.vx*=Math.exp(-4*dt);
    if(s.enemies.includes(b as Enemy)&&(b as Enemy).modifiers?.parachute&&!(b as Enemy).frozen&&b.vy>2)b.vy=2;
    const oldX=b.x,oldFeet=b.y+b.h;if(!s.shots.includes(b))sandJump(b);
    const result=moveBody(s,b,dt,player,breakSideBricks);
    if(!s.shots.includes(b)&&resolveSand(s,b,oldX,oldFeet,dt,result.floor))result.floor=true;
    if((b.sandDepth??0)>=b.h-.001&&b.h>0){
        if(player&&s.phase==='playing'){crush(s);s.notice='被流沙吞没 · 按 R 重试';}
        else if(s.enemies.includes(b as Enemy))defeat(s,b as Enemy,'sand');
        else if('alive'in b)(b as Item).alive=false;
        else if(s.rewards.includes(b as Reward))b.w=0;
    }
    if(result.floor&&s.enemies.includes(b as Enemy)&&(b as Enemy).modifiers?.parachute)(b as Enemy).modifiers!.parachute=false;
    return result;
}
function bonkCeiling(s:State,b:Body,ceiling:number):void {
    for(const stone of s.stones)if(Math.abs(stone.y+stone.h-ceiling)<.001&&b.x<stone.x+stone.w&&b.x+b.w>stone.x)bonkStone(s,stone);
    for(const cannon of s.turrets)if(Math.abs(cannon.y+cannon.h-ceiling)<.001&&b.x<cannon.x+cannon.w&&b.x+b.w>cannon.x)bonkTurret(s,cannon);
}
function moveBody(s: State, b: Body, dt: number, player = false, breakSideBricks = false) {
    const oldY = b.y,oldX=b.x;
    const velocityX=b.vx,endX=oldX+velocityX*dt,clampedX=Math.max(0,Math.min(s.level.width-b.w,endX));
    // Include the full motion, map-edge clamping and up to one body width plus
    // a tile of horizontal terrain separation. Vertical movement keeps this x.
    const minX=Math.min(oldX,endX,clampedX)-b.w-1,maxX=Math.max(oldX,endX,clampedX)+2*b.w+1;
    const obstacles=s.phase==='won'&&s.victory?.autoCastle?[]:switchObstacles(s,b,player,minX,maxX);
    let floor = false, wall = 0;
    const belt=!player&&s.enemies.includes(b as Enemy)&&b.vy>=0?surface(s,b).boost:1;
    b.x += b.vx * dt * belt;
    // Follow the surface before testing the solid fill under the next ramp.
    let slope=resolveSlope(s,b,oldY,oldX,dt,(t,time)=>solid(t,time,s.redOn));
    if(slope!==null)floor=true;
    for (let y = Math.floor(b.y); y <= Math.floor(b.y + b.h - .001); y++)
        for (let x = Math.floor(b.x); x <= Math.floor(b.x + b.w - .001); x++)
            if (solid(tile(s.level, x, y),s.pTime,s.redOn)&&!curvedGlassCell(s.level,x,y)||slopeIntersects(tile(s.level,x,y),x,y,b)) {
                const t=tile(s.level,x,y),depth=Math.max(0,Math.min(1,b.y+b.h-y));
                if (breakSideBricks && b.vx !== 0)
                    for (let row = Math.floor(b.y); row <= Math.floor(b.y + b.h - .001); row++) {breakBrick(s, x, row);if(tile(s.level,x,row)==='toggle-switch')hitBlock(s,x,row,'toggle-switch');}
                if (b.vx > 0) {
                    b.x = x+(t==='slope-up'?1-depth:0)-b.w;
                    wall = 1;
                }
                else if (b.vx < 0) {
                    b.x = x+(t==='slope-down'?depth:1);
                    wall = -1;
                }
                if(player&&t==='spike-all')hurt(s,'side');
                b.vx = 0;
            }
    for(const obstacle of obstacles.sort((a,c)=>velocityX>=0?a.x-c.x:c.x+c.w-a.x-a.w))if(overlaps(b,obstacle)){
        if(velocityX>0&&oldX+b.w<=obstacle.x+.025){b.x=obstacle.x-b.w;b.vx=0;wall=1;}
        else if(velocityX<0&&oldX>=obstacle.x+obstacle.w-.025){b.x=obstacle.x+obstacle.w;b.vx=0;wall=-1;}
    }
    if(resolveGlassAxis(s.level,b,'x',oldX)){wall=Math.sign(velocityX);b.vx=0;}
    b.x = Math.max(0, Math.min(s.level.width - b.w, b.x));
    b.y += b.vy * dt;
    if(player&&b.y<0){b.y=0;b.vy=Math.max(0,b.vy);}
    if(resolveGlassAxis(s.level,b,'y',oldY)){floor=b.vy>0;b.vy=0;return {floor,wall,slope:0};}
    if (b.vy < 0) {
        let ceiling:number|undefined;
        for(const obstacle of obstacles)if(overlaps(b,obstacle)&&oldY>=obstacle.y+obstacle.h-.025)ceiling=Math.max(ceiling??-Infinity,obstacle.y+obstacle.h);
        const top = Math.floor(b.y), bottom = Math.floor(b.y + b.h - .001);
        const left = Math.floor(b.x), right = Math.floor(b.x + b.w - .001);
        // Gather the entire contacted underside before resolving velocity or changing tiles.
        for (let y = bottom; y >= top; y--) {
            const contacts: { x: number; t: Tile }[] = [];
            for (let x = left; x <= right; x++) {
                const t = tile(s.level, x, y);
                if (solid(t,s.pTime,s.redOn)&&!curvedGlassCell(s.level,x,y)&&!((b as Enemy).kind==='hammer-otter'&&!(b as Enemy).frozen&&isBrick(t))||player&&t==='hidden-block'&&oldY>=y+1-.025||slopeIntersects(t,x,y,b)) contacts.push({ x, t });
            }
            if (!contacts.length) continue;
            if(ceiling!==undefined&&ceiling>y+1){if(player){wearCeiling(s,services);bonkCeiling(s,b,ceiling);}b.y=ceiling;b.vy=0;return {floor,wall,slope:0};}
            b.y = y + 1; b.vy = 0;
            if(player)wearCeiling(s,services);
            if (player) for (const { x, t } of contacts) {hitBlock(s, x, y, t);if(t==='spike-all')hurt(s,'top');}
            break;
        }
        if(b.vy<0&&ceiling!==undefined){if(player)wearCeiling(s,services);if(player)for(const d of s.devices)if(d.kind==='extend-block'&&Math.abs(d.y+1-ceiling)<.01&&b.x<d.x+1&&b.x+b.w>d.x)triggerExtension(s,...d.home,false,services);b.y=ceiling;b.vy=0;if(player)bonkCeiling(s,b,ceiling);}
        return { floor, wall, slope:0 };
    }
    // Resolve the first contacted layer as a group before removing any support.
    // The rebound ends this move so a giant cannot drill through multiple rows.
    if(player&&s.power===3&&b.vy>0&&b.y+b.h-s.fallPeak>=2-.001){
        for(let y=Math.floor(oldY+b.h-.001);y<=Math.floor(b.y+b.h-.001);y++){
            const contacts=[];
            for(let x=Math.floor(b.x);x<=Math.floor(b.x+b.w-.001);x++)if(['#','B'].includes(tile(s.level,x,y))&&oldY+b.h<=y+.025)contacts.push(x);
            if(!contacts.length)continue;
            for(const x of contacts)breakBrick(s,x,y,true);
            b.y=y-b.h;b.vy=-Math.sqrt(15);s.fallPeak=y;s.giantBounce=true;s.pound='none';s.jumpSustain=s.jumpCut=false;
            return {floor:false,wall,slope:0};
        }
    }
    for (let y = Math.floor(b.y); y <= Math.floor(b.y + b.h - .001); y++)
        for (let x = Math.floor(b.x); x <= Math.floor(b.x + b.w - .001); x++) {
            const t = tile(s.level, x, y);
            if ((b as Enemy).kind==='hammer-otter'&&!(b as Enemy).frozen&&(b as Enemy).hammerDropRow===y&&isBrick(t))continue;
            if ((!solid(t,s.pTime,s.redOn)||curvedGlassCell(s.level,x,y)) && !(t === '=' && b.vy >= 0 && oldY + b.h <= y + .02))
                continue;
            if (b.vy > 0) {
                b.y = y - b.h;
                floor = true;
                if(player&&s.pound==='fall')hitBlock(s,x,y,t,true);
            }
            b.vy = 0;
            if(player&&(t==='^'||t==='spike-all'))hurt(s,'bottom');
        }
    for(const obstacle of obstacles)if(overlaps(b,obstacle)&&oldY+b.h<=obstacle.y+.025){
        b.y=obstacle.y-b.h;
        if(player&&s.pound==='fall'&&(obstacle as Enemy).frozen){shatterFrozen(s,obstacle as Enemy,services);b.vy=-5;s.pound='none';s.coyote=0;floor=false;}
        else if(player&&s.pound==='fall'&&s.items.includes(obstacle as Item)&&(obstacle as Item).kind==='wood-crate'){breakCrate(s,obstacle as Item);b.vy=-5;s.pound='none';s.coyote=0;floor=false;}
        else if(player&&s.pound==='fall'&&s.items.includes(obstacle as Item)&&((obstacle as Item).kind==='pow'||(obstacle as Item).kind==='red-pow')){
            detonatePow(s,obstacle as Item,services);b.vy=-5;s.pound='none';s.coyote=0;floor=false;
        }else{if(player&&s.pound==='fall')for(const d of s.devices)if(d.kind==='extend-block'&&d.blocks.includes(obstacle))triggerExtension(s,...d.home,true,services);b.vy=0;floor=true;}
    }
    if(b.vy>=0)for(const platform of [...s.platforms,...oneWayDevices(s)])if(b.x<platform.x+platform.w&&b.x+b.w>platform.x&&oldY+b.h<=platform.y+.06&&b.y+b.h>=platform.y&&(!floor||platform.y<=b.y+b.h)){b.y=platform.y-b.h;b.vy=0;floor=true;}
    if(standOnHorizontalSpring(s,b,oldY))floor=true;
    const landed=resolveSlope(s,b,oldY,oldX,dt,(t,time)=>solid(t,time,s.redOn));
    if(landed!==null){floor=true;slope=landed;}
    return { floor, wall, slope:slope??0 };
}
export function respawn(s: State) {
    if(respawnP2(s,create))return;
    const checkpoint: [number,number] = [...s.checkpoint], deaths = s.deaths, litCheckpoints = { ...s.litCheckpoints };
    Object.assign(s,create(s.startLevel));
    s.checkpoint = checkpoint; s.player.x = checkpoint[0]; s.player.y = checkpoint[1];
    s.litCheckpoints = litCheckpoints;
    s.deaths = deaths; s.invincible = 2; s.notice = '重新出发！';
}
function collectCoin(s: State,x: number,y: number,count=1) {
    if(s.phase!=='playing') return;
    emit(s,'coin',x);
    collectToken(s,count); s.eatAge = 0; s.eatFacing = s.facing;
    s.bites.push({x,y,age:0}); s.bites = s.bites.slice(-16);
}
function activateCheckpoint(s: State, x: number, y: number) {
    const id = y * s.level.width + x;
    if (s.litCheckpoints[id] || s.phase !== 'playing') return;
    s.litCheckpoints[id] = true; s.checkpoint = [x, y - 1];
    s.flagWaves.push({ x, y, age: 0, direction: Math.sign(s.player.vx) || s.facing });
    s.flagWaves = s.flagWaves.slice(-32);
    s.cheerAge = 0; s.cheerFacing = s.facing;
    s.checkpointArea=s.currentArea;s.checkpointMemory[s.currentArea]={...s.litCheckpoints};const power=s.level.properties?.[id]?.checkpointPower;if(power!==undefined)grantPower(s,power as State['power']);
    emit(s,'checkpoint',x+.5);
    s.notice = '检查点已点亮！';
}
export function step(s: State, i: Input, dt = 1 / 120) {
    const physicalInput=i;
    advancedTimers(s,dt);p1Timers(s,dt);wearTimers(s,dt);progressStep(s,dt,services);
    for(const pop of s.scorePops)pop.age+=dt;s.scorePops=s.scorePops.filter(p=>p.age<1);
    for(const puff of s.dust)puff.age+=dt;
    s.dust=s.dust.filter(puff=>puff.age<DUST_DURATION);
    s.dustWait=Math.max(0,s.dustWait-dt);
    s.eatAge = Math.min(EAT_DURATION,s.eatAge+dt);
    s.cheerAge = Math.min(CHEER_DURATION, s.cheerAge + dt);
    for (const wave of s.flagWaves) wave.age += dt;
    s.flagWaves = s.flagWaves.filter(wave => wave.age < FLAG_WOBBLE_DURATION);
    for(const bite of s.bites) bite.age += dt;
    s.bites = s.bites.filter(b=>b.age<.38);
    for (const e of s.defeated) {
        e.age += dt;
        if(e.cause==='lava'||e.cause==='sand'){e.y+=dt*(e.h+.35)/.65;e.angle=0;}
        else if (e.cause !== 'stomp') { e.vy += 25 * dt; e.x += e.vx * dt; e.y += e.vy * dt; e.angle += e.vx * dt; }
    }
    s.defeated = s.defeated.filter(e => e.age < .75);
    for(const pop of s.coinPops)pop.age+=dt;s.coinPops=s.coinPops.filter(pop=>pop.age<.65);
    for (const b of s.bumps) {b.age+=dt;if(s.phase==='playing')bumpContents(s,b,b.y+blockOffset(b.age),services);}
    s.bumps = s.bumps.filter(b => b.age < .24);
    for (const f of s.fragments) { f.age += dt; f.vy += 24 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.angle += f.vx * dt; }
    s.fragments = s.fragments.filter(f => f.age < .8);
    if (s.phase === 'dead') {
        s.deathAge += dt;
        if (s.deathAge > .18 && s.deathAge < 1.6) { s.player.vy += 23 * dt; s.player.y += s.player.vy * dt; }
        s.previous = { ...i }; return;
    }
    if(s.phase==='won'&&s.victory){updateFortress(s,dt,services);updateGoal(s,dt,move);s.previous={...i};return;}
    if (s.phase !== 'playing') {
        s.previous = { ...i };
        return;
    }
    if(s.stun>0)i={...i,axis:0,jump:false,spin:false,down:false,fire:false,special:false,build:false,interact:false};
    i=shellInput(s,i);
    const p = s.player;
    expansionTimers(s,dt,services);
    advanceAdventure(s,dt);
    s.time += dt;advanceP2Camera(s,dt);advanceLiquid(s,dt);cameraCrush(s,services);
    if(areaTravel(s,i,dt,create)){positionHeld(s);s.previous={...i};return;}
    advanceWorkshop(s,dt,services);
    advanceFrost(s,dt);advanceP2Mechanisms(s,dt,services);driveCar(s,i,dt,services);advanceDevices(s,dt,services);advancePipeObjects(s,dt,services);advanceEnemyProjectiles(s,dt,services);advanceCannonShots(s,dt,services);advanceMagic(s,dt,services);for(const hit of s.pipeHits)freezeEnemy(s,hit.enemy);s.pipeHits=[];warpBoxes(s,i);
    advancePlatforms(s,dt,services);
    updateFortress(s,dt,services);updateP2Bosses(s,dt,services);
    if(s.level.finish==='castle'&&s.bridgeCollapse&&s.bridgeCollapse.removed===s.bridgeCollapse.cells.length&&s.bosses.length>0&&s.bosses.every(b=>b.health<=0)){const id=s.level.cells.indexOf('E');if(id>=0){finish(s,id%s.level.width,Math.floor(id/s.level.width),true);s.previous={...i};return;}}
    if(doorStep(s,i,dt)){s.running=s.skidding=s.turning=false;positionHeld(s);s.previous={...i};return;}
    s.pipeWait = Math.max(0, s.pipeWait - dt);
    if (s.pipe) {
        s.running=s.skidding=s.turning=false;
        if(s.pipe.glass&&s.pipe.path){advanceGlassPipe(s,dt,(t,time)=>solid(t,time,s.redOn),()=>crush(s));positionHeld(s);worldEnemies(s,dt);updateTurrets(s,dt,services);updateItems(s,{...EMPTY_INPUT},dt,-Infinity,services);updateFireballs(s,dt);s.previous={...i};return;}
        advanceOrdinaryPipe(s,dt);
        positionHeld(s);
        s.previous = { ...physicalInput }; return;
    }
    if(enterGlassPipe(s,i,(t,time)=>solid(t,time,s.redOn))){s.running=s.skidding=s.turning=false;positionHeld(s);s.previous={...i};return;}
    if(enterOrdinaryPipe(s,i)){s.shootAge=SHOT_DURATION;s.cheerAge=CHEER_DURATION;positionHeld(s);s.previous={...i};return;}
    updateStones(s,dt,services);
    updateTurrets(s,dt,services);
    if(s.phase!=='playing'){s.previous={...i};return;}
    s.invincible = Math.max(0, s.invincible - dt);
    s.fireWait -= dt;
    s.shootAge = Math.min(SHOT_DURATION, s.shootAge + dt);
    if (s.spinning) s.spinAge += dt;
    i=wearableInput(s,i,dt);
    const preparedMotion=prepareMotion(s,i,dt);
    const jump = (i.jump && !s.previous.jump) || (i.spin && !s.previous.spin);
    const riding=ridingStep(s,i,jump);
    const climbing=treeContact(s,i,jump,dt)||vineStep(s,i,jump,dt);
    const wasSwimming=s.swimming,wasSkidding=s.skidding||s.sliding;
    s.swimming=!ridingBoneShell(s)&&inWater(s.level,p);s.swimAge=s.swimming?s.swimAge+dt:0;
    if(s.swimming!==wasSwimming)emit(s,'splash');
    s.sliding=!s.swimming&&i.down&&s.grounded&&(s.slope!==0||s.slideTime>0&&Math.abs(p.vx)>3);
    if(s.sliding&&s.slope)s.slideTime=.35;
    s.skidding=!s.swimming&&!s.sliding&&s.grounded&&i.down&&
        (s.skidding||!s.previous.down&&Math.abs(p.vx)>.1);
    if(s.skidding&&!wasSkidding)s.skidDecel=Math.abs(p.vx)>WALK_SPEED+.25?RUN_CROUCH_DECEL:WALK_CROUCH_DECEL;
    const wasTurning=s.turning;updateBraking(s,i,dt);
    if(!wasSkidding&&(s.skidding||s.sliding)||s.turning&&!wasTurning)emit(s,'skid');
    const {h:standingHeight,w:standingWidth}=playerDimensions(s,false);
    const wantsCrouch = !riding&&!climbing&&!s.swimming&&i.down && (s.grounded || s.crouching);
    const desired = wantsCrouch ? playerDimensions(s,true).h : standingHeight;
    if (desired < p.h || (desired > p.h && fitsHeight(s, desired))) { p.y += p.h - desired; p.h = desired; }
    if(standingWidth<p.w||standingWidth>p.w&&fitsHeight(s,p.h,standingWidth)){p.x+=(p.w-standingWidth)/2;p.w=standingWidth;}
    s.crouching = wantsCrouch || p.h < standingHeight - .01;
    s.crouchAge = Math.max(0, Math.min(.12, s.crouchAge + (s.crouching ? dt : -dt)));
    if (jump) s.bufferedSpin = i.spin;
    s.buffer = jump ? .13 : Math.max(0, s.buffer - dt);
    s.coyote = s.grounded ? .1 : Math.max(0, s.coyote - dt);
    if (s.wall) { s.wallDirection = s.wall; s.wallGrace = .1; }
    else s.wallGrace = Math.max(0, s.wallGrace - dt);
    s.wallKick = Math.max(0, s.wallKick - dt);
    const slideDirection=s.slope||Math.sign(p.vx)||s.facing;
    const ground= s.grounded?surface(s,p):{boost:1,grip:1,brake:1};
    const target = s.skidding||s.turning?0:s.sliding?slideDirection*Math.min(11,Math.max(4,Math.abs(p.vx)+18*dt)):i.axis*(riding?3:s.swimming?3:s.crouching&&s.grounded?1.6:i.grab?RUN_SPEED*(s.runCharge>2&&rulesFor(s.level).rewards==='score'?1.18:1):WALK_SPEED)*ground.boost;
    // Reach an exact rest on ground; retain some horizontal momentum in air.
    const acceleration = s.turning?REVERSE_DECEL:s.skidding?s.skidDecel:s.sliding?35:s.swimming?18:s.grounded ? (i.axis===0?(s.springDrift?90:WALK_RELEASE_DECEL):s.crouching?90:p.vx*i.axis<0?70: i.grab?34:WALK_ACCELERATION) : (i.axis === 0 ? 6 : 32);
    const horizontalBefore=p.vx,braking=s.grounded&&!s.sliding&&!s.swimming&&!climbing&&s.wallKick===0&&!s.springDrift&&(s.skidding||s.turning||i.axis===0);
    const traction=braking||p.vx!==0&&(target*p.vx<=0||Math.abs(target)<Math.abs(p.vx))?ground.brake:ground.grip;
    if (!climbing&&s.wallKick === 0) p.vx += Math.sign(target - p.vx) * Math.min(Math.abs(target - p.vx), acceleration * traction * dt);
    if(Math.abs(p.vx)<1e-9)p.vx=0;
    if (i.axis && s.wallKick === 0 && !s.skidding)
        s.facing = Math.sign(i.axis);
    if(s.sliding||s.skidding)s.facing=slideDirection;
    if(s.swimming&&jump){emit(s,'swim');s.swimKickAge=0;p.vy=-6.5*Math.sqrt(.4);s.buffer=0;s.spinning=false;s.jumpSustain=false;s.jumpCut=false;s.grounded=false;}
    if (!riding&&!climbing&&!s.swimming&&s.buffer > 0 && (s.coyote > 0 || s.wallGrace > 0)) {
        const chaining=s.grounded&&Math.abs(p.vx)>=WALK_SPEED-.25&&i.axis!==0;
        s.jumpChain=chaining?(s.chainWindow>0&&s.jumpChain<3?s.jumpChain+1:1):0;s.chainWindow=0;
        p.vy = s.jumpChain===3?-Math.sqrt(JUMP_SPEED**2+80):-JUMP_SPEED;
        if (s.coyote === 0 && s.wallGrace > 0) {
            p.vx = -s.wallDirection * 8;
            s.facing = -s.wallDirection;
            s.wallKick = .16;
            s.wallGrace = 0;
            s.wall = 0;
        }
        s.spinning = s.bufferedSpin;
        emit(s,s.spinning?'spin':'jump');
        s.spinAge = 0; s.jumpSustain = true; s.jumpCut = false;
        s.buffer = 0;
        s.coyote = 0;
        s.grounded = false;s.jumpSerial++;
    }
    // Release changes ascent gravity rather than snapping to a fixed velocity.
    // The release moment therefore produces a continuous range of jump heights.
    if (s.jumpSustain && !i.jump && !i.spin) { s.jumpSustain = false; s.jumpCut = p.vy < 0; }
    if((!riding||ridingBoneShell(s))&&!climbing&&!s.swimming&&i.down&&!s.previous.down&&!s.grounded&&!s.crouching&&s.pound==='none'){emit(s,'spin');s.pound='flip';s.bonePound=ridingBoneShell(s);s.poundAge=0;s.spinning=false;p.vy=0;}
    if(s.pound!=='none'){s.poundAge+=dt;if(s.pound==='flip'&&s.poundAge>=.22)s.pound='fall';p.vy=s.pound==='flip'?0:23;}
    if(jump&&s.springWindow>0&&!s.springBoosted&&p.vy<0){p.vy=-Math.sqrt(40*(p.vy*p.vy/60+JUMP_SPEED*JUMP_SPEED/40));s.springBoosted=true;s.jumpSustain=true;s.jumpCut=false;s.buffer=0;}
    const fastFall = s.pound==='fall';
    const gravity = s.motion==='long'?14:s.swimming?(i.down?12:5):s.giantBounce?30:fastFall ? 65 : p.vy < 0 ? (s.jumpSustain ? 20 : s.jumpCut ? 65 : 30) : 30;
    if(!climbing&&s.pound!=='flip')p.vy = Math.min(s.swimming?3:fastFall ? 23 : 18, p.vy + gravity * dt);
    if(s.swimming&&i.interact)p.vy=Math.min(p.vy,-2.5);
    if (s.wall && i.axis === s.wall && s.wallKick === 0 && p.vy > 4) p.vy = 4;
    s.fallPeak=s.grounded||s.power!==3?p.y+p.h:Math.min(s.fallPeak,p.y+p.h);
    if(p.vy>=0)s.giantBounce=false;
    applyMotion(s,i,dt,preparedMotion);wearMotion(s,physicalInput,dt);
    if(s.boneTime>0)p.vx=0;
    const intendedVx=p.vx;p.pushVx=intendedVx;
    if(braking)p.vx=brakingVelocity(horizontalBefore,p.vx,acceleration*traction,dt);
    const wasGrounded=s.grounded,playerPrevious={...p},before = p.y + p.h,oldX=p.x,result = move(s, p, dt, true);afterWearMove(s,result.wall);seatPlayer(s);
    if(braking&&!result.wall)p.vx=intendedVx;
    if(ridingBoneShell(s)&&floatShell(s,p,before,.15))result.floor=true;
    s.grounded = result.floor;
    if(s.grounded&&s.bonePound)boneRest(s);
    if(s.grounded)s.scoreChain.stomp=0;
    if(s.grounded&&!wasGrounded)emit(s,'land');
    if(pressPSwitch(s,p,playerPrevious)){s.grounded=false;s.coyote=0;}
    if(s.grounded&&!wasGrounded&&s.jumpChain)s.chainWindow=.28;
    if(s.grounded&&s.chainWindow===0)s.jumpChain=0;
    if(s.grounded)s.pound='none';
    placeRiding(s);
    s.slope=result.slope;
    s.wall = result.wall;
    const distance=Math.abs(p.x-oldX),speed=Math.abs(p.vx);
    s.skidding=s.skidding&&s.grounded&&!s.wall;
    s.running=s.grounded&&!s.swimming&&!s.crouching&&i.grab&&speed>WALK_SPEED+.15;
    const oldStride=s.stride;
    if(s.grounded&&distance>0)s.stride+=distance*1.7;else if(s.grounded)s.stride=0;
    if(s.grounded&&!s.swimming&&!s.skidding&&!s.sliding&&Math.floor(s.stride/1.8)>Math.floor(oldStride/1.8))emit(s,'step');
    if(s.grounded&&!s.swimming&&distance>.001&&speed>.8&&s.dustWait===0){
        const braking=s.skidding||s.sliding||s.turning,direction=Math.sign(p.vx)||s.facing;
        s.dust.push({x:p.x+p.w/2-direction*.26,y:p.y+p.h+.025,age:0,direction,size:(braking?.8:s.running?.6:.36)*(s.power?1.2:1)});
        s.dust=s.dust.slice(-24);s.dustWait=braking?.055:s.running?.1:.22;
    }
    if (s.grounded) { s.spinning = false; s.spinAge = 0; }
    if (p.vy >= 0) { s.jumpSustain = false; s.jumpCut = false; }
    for (let y = Math.floor(p.y); y <= Math.floor(p.y + p.h); y++)
        for (let x = Math.floor(p.x); x <= Math.floor(p.x + p.w); x++) {
            const t = tile(s.level, x, y), id = y * s.level.width + x;
            if (t === 'o') {
                collectCoin(s,x+.5,y+.6);
                s.level.cells[id] = '.';
            }
            if (t === 'G' || t === 'F') {
                grantPower(s,t==='G'?(s.power||1):2);
                s.level.cells[id] = '.';
                s.notice = t === 'G' ? '成长珍珠！体型变大' : '火珊瑚！J 发射火球';
            }
            if(t==='pink-coin'){s.level.cells[id]='.';s.pinkCollected++;emit(s,'coin',x);if(s.pinkCollected===s.pinkTotal&&s.pinkTotal>0)collectKey(s,p.x,p.y);}
            if(t==='lava'&&!(s.level.liquid?.kind==='lava'&&s.level.liquidSurface!==undefined&&p.y+p.h<s.level.liquidSurface))crush(s);
            if(t==='bridge-bell')releaseBridge(s,y*s.level.width+x);
            if(t==='spike-all')hurt(s,y+.5<p.y+.2?'top':'side');
            if (t === 'C') {
                activateCheckpoint(s, x, y);
            }
        }
    const goal=goalAt(s);if(goal&&!conditionProgress(s).done)s.notice='尚未满足通关条件：'+conditionProgress(s).text;
    if(goal&&!(s.power===5&&i.interact&&s.catStamina>0&&p.y+p.h>Math.max(0,goal.y-poleHeight(s,goal.x,goal.y))+.25)&&conditionProgress(s).done&&s.phase==='playing'&&(s.level.finish!=='castle'||!s.bosses.some(b=>b.health>0))){finish(s,goal.x,goal.y);s.previous={...i};return;}
    // Contents emerge harmlessly from behind the used block before activation.
    for (const reward of s.rewards) {
        if(reward.transit)continue;
        reward.age += dt;
        if (reward.age < .4) { reward.y = reward.originY - (reward.kind==='giant-pearl'?2:1)*Math.min(1, reward.age / .4); continue; }
        if (reward.kind === 'coin') {
            reward.y = reward.originY - 1 - Math.sin(Math.min(1, (reward.age - .4) / .35) * Math.PI) * .7;
            if (reward.age >= .75) { collectCoin(s,reward.x+reward.w/2,reward.y+reward.h/2); reward.w = 0; }
        } else if(ITEM_KINDS.includes(reward.kind)){
            const item=makeItem(reward.kind as ItemKind,reward.x,reward.y);item.y=reward.y;item.cooldown=.2;s.items.push(item);reward.w=0;
        } else if(EXTRA_ENEMIES.includes(reward.kind)){
            s.enemies.push(makeEnemy(reward.kind as Enemy['kind'],reward.x,reward.y));reward.w=0;
        } else if (reward.kind === 'duck' || reward.kind === 'turtle') {
            s.enemies.push({ ...reward, kind: reward.kind, vx: -1.5, vy: 0, alive: true, held: false, cooldown: .35 });
            reward.w = 0;
        } else {
            reward.vy = Math.min(18, reward.vy + 26 * dt);
            const old={...reward},vx = reward.vx, r = move(s, reward, dt);if(reward.w<=0)continue;
            if (r.wall) reward.vx = -vx;
            bounceVerticalSpring(s,reward,old);bounceHorizontalSpring(s,reward,old);if(reward.kind==='growth')pressPSwitch(s,reward,old);
            if(overlaps(p,reward)&&progressReward(s,reward,services))continue;
            if (overlaps(p, reward)&&isWearable(reward.kind)){equipWearable(s,reward.kind,reward.charges??3);reward.w=0;continue;}
            if (overlaps(p, reward)) { grantPower(s,reward.kind==='cat-bell'?5:reward.kind==='boomerang-flower'?6:reward.kind==='hammer-suit'?7:reward.kind==='ice-flower'?4:reward.kind==='fire'?2:s.power||1); reward.w = 0; s.notice = reward.kind==='cat-bell'?'猫铃铛！J 爪击，空中 K 扑击，贴墙 ↑ 攀爬':reward.kind==='boomerang-flower'?'回旋镖花！J 投出并接回':reward.kind==='hammer-suit'?'建造锤！J 锤击，L 造箱，最多五个':reward.kind==='ice-flower'?'冰花！按 J 发射冰弹':reward.kind === 'fire' ? '火珊瑚！按 J 发射火球' : '成长！现在能撞碎贝壳砖'; }
        }
    }
    s.rewards = s.rewards.filter(r => r.w > 0 && (r.persistent||r.age < 60) && r.y < s.level.height + 2);
    positionHeld(s);
    const usedThrow=heldAction(s,i);
    if(!usedThrow)abilities(s,i,dt,services);updateItems(s,i,dt,before,services);
    if (!usedThrow&&!s.held&&i.fire && !s.previous.fire && (s.power===2||s.power===4) && s.fireWait <= 0 && s.shots.length < 12) {
        s.shootAge = 0; s.shootFacing = s.facing; s.pendingShot = true;
        s.fireWait = SHOT_DURATION;
    }
    if (s.pendingShot && s.shootAge >= SHOT_WINDUP) {
        if ((s.power===2||s.power===4) && s.shots.length < 12) {emit(s,'fire');s.shots.push({
            x: p.x + p.w / 2 + s.shootFacing * .62 - .14, y: p.y + p.h - (s.crouching ? .3 : .6) - .14,
            kind:s.power===4?'ice':'fire',w: .28, h: .28, vx: s.shootFacing * (s.power===4&&rulesFor(s.level).freezing==='timed'?8:FIREBALL_SPEED), vy: s.power===4&&rulesFor(s.level).freezing==='timed'?-4.8:-3.9,
        });}
        s.pendingShot = false;
    }
    const enemyPrevious=worldEnemies(s,dt);
    let stomped = false;
    for(const e of s.enemies){
        if(!enemyPrevious.has(e))continue;
        if(!e.alive||e.transit||e.downAge!==undefined||e.kind==='plant'&&Math.min(e.w,e.h)<.08&&!e.frozen||e.kind==='fire-jumper'&&e.flamePhase==='wait')continue;
        if(bonkWithHelmet(s,e,playerPrevious,enemyPrevious.get(e)!))continue;
        if(heldSnowContact(s,e,services))continue;
        if(interactFrozen(s,e,i))continue;
        if(bombContact(s,e,i,before,services))continue;
        const heldShell=s.held;
        if(heldShell?.kind==='shell'&&!heldShell.frozen&&heldShell.alive&&
            (e.x+e.w/2-p.x-p.w/2)*s.facing>0&&overlaps(heldShell,e)){
            // The shell meets the enemy before resolving contact with the body.
            defeat(s,e,'shell',heldShell);defeat(s,heldShell,'shell');continue;
        }
        if (!overlaps(p, e) || e.cooldown > 0 && !(s.pound==='fall'&&e.kind==='shell') || stomped)
            continue;
        if(e.kind==='fire-jumper'){if(s.starTime>0)defeat(s,e,'star');else hurt(s);continue;}
        if(s.pound==='fall'&&attackResult(e,'pound')==='defeat'&&p.vy>=0&&before<=e.y+.3){defeat(s,e,'pound');p.vy=-5;s.pound='none';s.grounded=false;stomped=true;continue;}
        if(s.starTime>0){defeat(s,e,'star');continue;}
        if(e.kind==='bully'&&!e.frozen){bullyContact(s,e,before,services);continue;}
        if(e.kind==='creeper-plant'&&p.vy>=0&&before<=e.y+.3){defeat(s,e,'stomp');p.y=e.y-p.h;p.vy=i.jump?-13.5:-9;s.grounded=false;s.coyote=0;stomped=true;continue;}
        if(e.kind==='ant'&&p.vy>=0&&before<=e.y+.3){p.y=e.y-p.h;p.vy=i.jump?-13.5:-9;s.grounded=false;s.coyote=0;stomped=true;emit(s,'stomp',e.x);continue;}
        if(e.kind==='ghost'){hurt(s);continue;}
        if(s.sliding&&!ENEMY_TRAITS[e.kind].spiked&&ENEMY_TRAITS[e.kind].body==='solid'){defeat(s,e,'slide');continue;}
        if(attackResult(e,'spin')==='rebound'&&p.vy>=0&&before<=e.y+.3){
            if(s.spinning){emit(s,'stomp',e.x);p.y=e.y-p.h;p.vy=i.spin||i.jump?-13.5:-10;s.grounded=false;s.jumpSustain=!!(i.spin||i.jump);s.jumpCut=false;s.spinAge=0;e.cooldown=.12;stomped=true;}else hurt(s,'bottom');continue;
        }
        if (!s.swimming&&p.vy >= 0 && before <= e.y + .25) {
            const poweredBounce = s.buffer > 0 || i.jump || i.spin;
            p.y = e.y - p.h; p.vy = poweredBounce ? -JUMP_SPEED : s.spinning ? -10 : -7;
            s.grounded = false; s.jumpSustain = poweredBounce; s.jumpCut = false;
            if (s.buffer > 0) s.spinning = s.bufferedSpin;
            s.spinAge = 0; s.coyote = poweredBounce ? 0 : .12; s.buffer = 0;
            stomped = true;
            if(e.kind==='turtle'||e.kind==='iron-turtle'||e.kind==='shell'&&!s.spinning)emit(s,'stomp',e.x);
            if(e.modifiers?.winged&&!e.removedWings||e.modifiers?.large){defeat(s,e,'stomp');}
            else if (e.kind === 'turtle'||e.kind==='iron-turtle') {
                actionScore(s,'stomp',e.x+e.w/2,e.y);
                delete e.flight;
                if(e.kind==='iron-turtle'){e.iron=true;e.shellAge=0;}
                e.kind = 'shell';
                e.h = .5;
                e.y += .3;
                e.vx = 0;
                e.cooldown = .2;
            }
            else if (e.kind !== 'shell' || s.spinning) {
                defeat(s, e, 'stomp');
            }
            else {
                e.vx = Math.abs(e.vx) > 1 ? 0 : s.facing * 12;e.attackChain=0;
                emit(s,'kick',e.x);
                e.cooldown = .25;
            }
        }
        else if (e.kind === 'shell' && Math.abs(e.vx) < 1) {
            if (i.grab && !s.held) {
                s.held = e;
                emit(s,'grab',e.x);
                e.held = true;
            }
            else {
                e.vx = s.facing * 12;e.attackChain=0;
                emit(s,'kick',e.x);
                e.cooldown = .3;
            }
        }
        else
            hurt(s,e.y+e.h<p.y+.3?'top':'side');
    }
    updateFireballs(s,dt);
    const room=s.level.rooms?.find(r=>p.x+p.w>r.x&&p.x<r.x+r.w&&p.y>=r.y);
    if (s.boneTime===0&&p.y > (room?room.y+room.h:s.level.playHeight??s.level.height) + 2) {
        killPlayer(s,'fall');
    }
    s.previous = { ...physicalInput };
}
const crush=crushPlayer;
export const services:Services={move,hurt,defeat,solid,crush,coin:collectCoin,hitBlock,activatePow:(state,item)=>detonatePow(state,item,services)};

function worldEnemies(s:State,dt:number){const p=s.player;
    // Contact at the start of a rising movement still counts as touching lava.
    drownEnemies(s);
    for(const e of s.enemies)ironWake(s,e,dt);
    const enemyPrevious=new Map<Enemy,Body>();
    for (const e of s.enemies) {
        if (!e.alive || e.held || e.transit || (e.x > p.x + 28 || e.x < p.x - 32)&&!(e.kind==='bomb'&&e.bombFuse!==undefined))
            continue;
        enemyPrevious.set(e,{...e});
        updateSpringLaunch(e,dt);
        e.turnWait=Math.max(0,(e.turnWait??0)-dt);
        e.cooldown = Math.max(0, e.cooldown - dt);
        const vx = e.vx;
        if(e.frozen){updateFrozen(s,e,dt,services);if(!e.alive)continue;}
        else if(e.springAir){e.vy=Math.min(18,e.vy+26*dt);const r=move(s,e,dt);e.grounded=r.floor;if(r.wall)e.vx=-vx;if(r.floor||e.vy>0&&(e.kind==='fish'||e.kind==='squid')&&inWater(s.level,e))e.springAir=false;}
        else if(e.flight){const [top,bottom]=e.flight;e.age=(e.age??0)+dt;e.vx=0;e.vy=0;e.y=top+(bottom-top)*(.5+.5*Math.sin(e.age*2));}
        else if(!updateSpecialEnemy(s,e,dt,services)){
            e.vy = Math.min(18, e.vy + 26 * dt);
            const r = move(s, e, dt, false, e.kind === 'shell' && Math.abs(vx) > 5);
            if(e.smart&&r.floor&&e.kind==='turtle'){const edge=vx>0?e.x+e.w+.15:e.x-.15,under=tile(s.level,edge,e.y+e.h+.15);if(!solid(under,s.pTime,s.redOn)&&under!=='=')e.vx=-vx;}
            e.grounded=r.floor;if(r.wall){if(e.kind==='shell'&&Math.abs(vx)>5)emit(s,'kick',e.x);e.vx=-vx;}
            if(e.kind==='shell'&&Math.abs(vx)>5){
                const old=enemyPrevious.get(e)!;
                for(const pow of s.items)if(pow.kind==='pow'&&pow.alive&&!pow.held){
                    const acrossY=e.y<pow.y+pow.h-.001&&e.y+e.h>pow.y+.001,acrossX=e.x<pow.x+pow.w-.001&&e.x+e.w>pow.x+.001;
                    const side=acrossY&&(vx>0&&old.x+old.w<=pow.x+.025&&Math.abs(e.x+e.w-pow.x)<.03||vx<0&&old.x>=pow.x+pow.w-.025&&Math.abs(e.x-pow.x-pow.w)<.03);
                    const vertical=acrossX&&(old.vy>=0&&old.y+old.h<=pow.y+.025&&Math.abs(e.y+e.h-pow.y)<.03||old.vy<0&&old.y>=pow.y+pow.h-.025&&Math.abs(e.y-pow.y-pow.h)<.03);
                    if(side||vertical)detonatePow(s,pow,services);
                }
            }
        }
        if(!e.alive)continue;
        if((e.kind==='fire-brother'||e.kind==='hammer-otter')&&(e.modifiers?.shockwave??e.modifiers?.large)&&e.grounded&&!(enemyPrevious.get(e) as Enemy).grounded&&enemyPrevious.get(e)!.vy>2){s.shake=Math.max(s.shake,.3);emit(s,'stone',e.x);if(s.grounded&&!s.starTime&&Math.abs(s.player.x-e.x)<12)s.stun=Math.max(s.stun,.5);}
        if((e.frozen||e.kind!=='plant'&&e.kind!=='fire-jumper'&&e.kind!=='ghost')&&!e.flight){
            if(bounceVerticalSpring(s,e,enemyPrevious.get(e)!)&&['fish','squid','cannonball'].includes(e.kind)){
                e.springAir=true;
                if(e.kind==='squid'){e.squidPhase='rise';delete e.squidRiseStart;e.squidDrift=0;}
            }
            pressPSwitch(s,e,enemyPrevious.get(e)!);
        }
        bounceHorizontalSpring(s,e,enemyPrevious.get(e)!,e);
        if (e.kind!=='fire-jumper'&&e.y > s.level.height + 2)
            e.alive = false;
    }
    drownEnemies(s);
    resolveEnemyContacts(s,enemyPrevious,services);
    return enemyPrevious;
}

function updateFireballs(s:State,dt:number){
 for(const b of s.shots){
  if(b.transit)continue;
  const old={...b},ice=b.kind==='ice'&&rulesFor(s.level).freezing==='timed';b.vy+=(ice?26:23.4)*dt;const r=move(s,b,dt);
  const contacts:{x:number;y:number;t:Tile}[]=[];
  const sweep={...b,x:Math.min(old.x,b.x),y:Math.min(old.y,b.y),w:Math.max(old.x+old.w,b.x+b.w)-Math.min(old.x,b.x),h:Math.max(old.y+old.h,b.y+b.h)-Math.min(old.y,b.y)};
  for(let y=Math.floor(sweep.y-.02);y<=Math.floor(sweep.y+sweep.h+.02);y++)for(let x=Math.floor(sweep.x-.02);x<=Math.floor(sweep.x+sweep.w+.02);x++){const t=tile(s.level,x,y);if(['B','?','U','ice','ice-solid','toggle-switch','red-block','blue-block'].includes(t)&&solid(t,s.pTime,s.redOn))contacts.push({x,y,t});}
  const ceiling=old.vy<0&&b.vy===0;
  const faces=contacts.filter(c=>{
    const acrossX=b.x<c.x+1-.0001&&b.x+b.w>c.x+.0001,acrossY=b.y<c.y+1-.0001&&b.y+b.h>c.y+.0001;
    return acrossY&&(r.wall===1&&Math.abs(b.x+b.w-c.x)<.025||r.wall===-1&&Math.abs(b.x-c.x-1)<.025)||acrossX&&(r.floor&&Math.abs(b.y+b.h-c.y)<.025||ceiling&&Math.abs(b.y-c.y-1)<.025);
  });
  for(const c of faces){const response=mechanismResult(c.t,b.kind==='ice'?'ice':'fire');if(response==='melt')meltIce(s,c.x,c.y);if(c.t==='toggle-switch'&&response==='trigger')toggleColor(s);}
  if(r.wall)b.w=0;
  else if(r.floor){if(ice&&(b.bounces??0)>=1)b.w=0;else{b.vy=ice?-5.5:-6.5;if(ice)b.bounces=(b.bounces??0)+1;}}
  else if(ceiling)b.vy=Math.max(2.5,Math.abs(old.vy)*.7);
  for(const e of s.enemies)if(b.w>0&&e.alive&&!e.held&&!(e.kind==='fire-jumper'&&e.flamePhase==='wait')&&overlaps(b,e)){
    const response=attackResult(e,b.kind==='ice'?'ice':'fire');
    if(response==='segment')hitCactus(s,e,b,services);
    else if(response==='freeze')freezeEnemy(s,e);
    else if(response==='thaw')thawEnemy(s,e);
    else if(response==='defeat'){defeat(s,e,'shot');if(b.kind==='ice')frostEffect(s,e.x+e.w/2,e.y+e.h/2);}
    b.w=0;
  }
  for(const boss of s.bosses)if(b.w>0&&boss.health>0&&overlaps(b,boss)&&bossAttackResult(b.kind==='ice'?'ice':'fire')==='damage'){damageBoss(s,boss,b.kind==='ice'?'ice':'fire');b.w=0;}
  if(b.w===0){if(b.kind==='ice')frostEffect(s,b.x+old.w/2,b.y+b.h/2);else effect(s,'fire',b.x+old.w/2,b.y+b.h/2);}
 }
 s.shots=s.shots.filter(b=>b.w>0&&(b.transit||b.x>0&&b.x<s.level.width-b.w&&b.y<s.level.height&&Math.abs(b.x-s.player.x)<24));
}
