import type { Enemy } from './model';

export type Attack='stomp'|'spin'|'pound'|'fire'|'ice'|'shell'|'star'|'block'|'helmet'|'claw'|'boomerang'|'hammer';
export type AttackResult='defeat'|'shell'|'rebound'|'freeze'|'thaw'|'shatter'|'segment'|'hurt'|'ignore'|'damage'|'arm'|'launch'|'collapse'|'withdraw';
export interface EnemyTraits {spiked:boolean;fireproof:boolean;freeze:'normal'|'fixed'|'none';body:'solid'|'ghost'|'flame'}
export const ENEMY_TRAITS:Readonly<Record<Enemy['kind'],Readonly<EnemyTraits>>>=Object.freeze({
    duck:{spiked:false,fireproof:false,freeze:'normal',body:'solid'},
    turtle:{spiked:false,fireproof:false,freeze:'normal',body:'solid'},
    shell:{spiked:false,fireproof:false,freeze:'normal',body:'solid'},
    plant:{spiked:true,fireproof:false,freeze:'fixed',body:'solid'},
    fish:{spiked:false,fireproof:false,freeze:'normal',body:'solid'},
    squid:{spiked:false,fireproof:false,freeze:'normal',body:'solid'},
    spiky:{spiked:true,fireproof:false,freeze:'normal',body:'solid'},
    cannonball:{spiked:false,fireproof:false,freeze:'normal',body:'solid'},
    'iron-turtle':{spiked:false,fireproof:true,freeze:'normal',body:'solid'},
    ghost:{spiked:false,fireproof:true,freeze:'normal',body:'ghost'},
    'fire-jumper':{spiked:true,fireproof:true,freeze:'none',body:'flame'},
    bomb:{spiked:false,fireproof:false,freeze:'normal',body:'solid'},
    'hammer-otter':{spiked:false,fireproof:false,freeze:'normal',body:'solid'},
    ant:{spiked:false,fireproof:false,freeze:'normal',body:'solid'},
    'spike-ant':{spiked:true,fireproof:false,freeze:'normal',body:'solid'},
    'jump-mouse':{spiked:false,fireproof:false,freeze:'normal',body:'solid'},
    'spike-mouse':{spiked:true,fireproof:false,freeze:'normal',body:'solid'},
    'creeper-plant':{spiked:true,fireproof:false,freeze:'fixed',body:'solid'},
    'dry-turtle':{spiked:false,fireproof:true,freeze:'normal',body:'solid'},
    fishbone:{spiked:false,fireproof:true,freeze:'normal',body:'solid'},
    'fire-plant':{spiked:true,fireproof:false,freeze:'fixed',body:'solid'},
    'fire-brother':{spiked:false,fireproof:false,freeze:'normal',body:'solid'},
    'ball-thrower':{spiked:false,fireproof:false,freeze:'normal',body:'solid'},
    'snow-cactus':{spiked:false,fireproof:false,freeze:'normal',body:'solid'},
    'bee':{spiked:false,fireproof:false,freeze:'normal',body:'solid' },
    'spring-enemy':{spiked:false,fireproof:false,freeze:'normal',body:'solid' },
    'ring-ghost':{spiked:false,fireproof:true,freeze:'normal',body:'ghost' },
    'bully':{spiked:false,fireproof:false,freeze:'normal',body:'solid' },
    'giant-fish':{spiked:false,fireproof:false,freeze:'normal',body:'solid' },
    'lava-dragon':{spiked:true,fireproof:true,freeze:'none',body:'flame' },
    'magikoopa':{spiked:false,fireproof:false,freeze:'normal',body:'solid' },
    'homing-bill':{spiked:false,fireproof:true,freeze:'normal',body:'solid' },
    'giant-bill':{spiked:false,fireproof:true,freeze:'none',body:'solid' },
    'cat-bill':{spiked:false,fireproof:true,freeze:'normal',body:'solid' },
    cactus:{spiked:true,fireproof:false,freeze:'normal',body:'solid'},
});
/** Results describe the contact; movement, animations and scoring apply once at the caller. */
export function attackResult(e:Pick<Enemy,'kind'|'alive'|'held'|'frozen'|'iron'|'bombFuse'>,attack:Attack):AttackResult {
    if(!e.alive||e.held)return 'ignore';
    const trait=ENEMY_TRAITS[e.kind];
    if(attack==='fire')return e.frozen?'thaw':trait.fireproof||e.iron?'ignore':e.kind==='cactus'?'segment':'defeat';
    if(attack==='ice'&&trait.freeze==='none'&&e.kind!=='fire-jumper')return 'ignore';
    if(attack==='ice')return e.frozen?'ignore':e.kind==='fire-jumper'?'defeat':e.kind==='cactus'?'segment':'freeze';
    if(e.frozen)return ['pound','helmet','shell','star','block','claw','boomerang','hammer'].includes(attack)?'shatter':'ignore';
    if(['claw','boomerang','hammer'].includes(attack)){
        if(trait.body==='flame'||e.kind==='ghost'&&attack!=='hammer')return 'ignore';
        if(attack==='hammer')return 'defeat';
        if(e.kind==='spiky'||e.kind==='shell')return 'shell';
        if(e.kind==='dry-turtle')return 'collapse';if(e.kind==='creeper-plant')return 'withdraw';return 'defeat';
    }
    if(e.kind==='ant'&&(attack==='stomp'||attack==='spin'))return 'rebound';
    if(e.kind==='dry-turtle'&&attack==='stomp')return 'collapse';
    if(e.kind==='creeper-plant'&&attack==='stomp')return 'withdraw';
    if(e.kind==='bomb'&&(attack==='stomp'||attack==='spin'))return e.bombFuse===undefined?'arm':'launch';
    if(attack==='helmet'||attack==='star'||attack==='block')return 'defeat';
    if(attack==='shell')return trait.body==='solid'?'defeat':'ignore';
    if(attack==='pound')return trait.spiked||trait.body!=='solid'?'hurt':'defeat';
    if(trait.body!=='solid')return 'hurt';
    if(trait.spiked)return attack==='spin'?'rebound':'hurt';
    return e.kind==='turtle'||e.kind==='iron-turtle'||e.kind==='shell'&&attack==='stomp'?'shell':'defeat';
}
export const bossAttackResult=(attack:Attack):AttackResult=>['fire','ice','shell','star','block','hammer','boomerang'].includes(attack)?'damage':'hurt';

export type MechanismContact='head'|'pound'|'shell'|'fire'|'ice'|'top'|'side'|'impact';
export type MechanismResult='trigger'|'rebound'|'melt'|'solid'|'ignore';
/** Context-free responses; overlap, direction and one-shot guards remain at callers. */
export function mechanismResult(kind:string,contact:MechanismContact):MechanismResult {
    if(kind==='toggle-switch')return ['head','pound','fire','ice'].includes(contact)?'trigger':'solid';
    if(kind==='pow')return ['pound','shell','head','impact'].includes(contact)?'trigger':'solid';
    if(kind==='p-switch')return contact==='top'?'trigger':'solid';
    if(kind==='spring-h')return contact==='side'?'rebound':'solid';
    if(kind==='spring-v')return contact==='top'?'rebound':'solid';
    if(kind==='ice')return contact==='fire'?'melt':'solid';
    return kind==='ice-solid'?'solid':'ignore';
}

