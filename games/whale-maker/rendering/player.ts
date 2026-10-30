import { p1Player } from './p1';
import type { State } from '../rules/model';
import { CHEER_DURATION, EAT_DURATION, SHOT_DURATION } from '../rules/model';
import { cheerOffset } from './poses';

/** All forms share the same painted 36-pose layout. A common reference keeps
 * crouching/carrying poses at the same head and body scale as standing. */
export function playerArt(s:State) {
    const advanced=p1Player(s);if(advanced)return advanced;
    const atlas=s.power===2?'whale-fire':s.power===4?'whale-ice':s.power===1?'whale-tall':'whale-small';
    const moving=Math.abs(s.player.vx)>1,walk=1+Math.floor(s.stride)%3;
    let frame=!s.grounded?(s.player.vy<0?6:7):moving?(s.running?4+Math.floor(s.stride)%2:walk):0;
    let flip=s.facing<0,lift=0;
    if(s.phase==='dead')frame=31;
    else if(s.phase==='won'){
        const v=s.victory;
        frame=v?.stage==='slide'?19:v?.stage==='walk'||v?.stage==='approach'?walk:v?.stage==='cheer'?(s.player.vy<0?27:28):0;
    }else if(s.pipe?.glass)frame=s.held?16:32;
    else if(s.riding||s.vehicle)frame=24;
    else if(s.pound!=='none')frame=s.pound==='flip'?25:26;
    else if(!s.grounded&&!s.swimming&&s.wall&&s.player.vy>0){frame=23;if(atlas==='whale-small')flip=s.wall>0;}
    else if(s.climbing)frame=19+Math.floor(s.climbAge*10)%2;
    else if(s.held)frame=s.crouching?34:moving?17+Math.floor(s.stride)%2:16;
    else if(s.sliding||s.turning||s.skidding&&Math.abs(s.player.vx)>.1)frame=24;
    else if(s.swimming&&!s.grounded)frame=s.swimKickAge<.4?33:21+Math.floor(s.swimAge*8)%2;
    else if(s.crouchAge>.006&&!s.spinning)frame=8;
    else if(s.shootAge<SHOT_DURATION){frame=s.shootAge<.05?13:s.shootAge<.13?14:15;flip=s.shootFacing<0;}
    else if(s.spinning){frame=9+Math.floor(s.spinAge*16)%4;if(atlas==='whale-small'&&frame===11)flip=!flip;}
    else if(s.eatAge<EAT_DURATION){frame=s.eatAge<.28?29:30;flip=s.eatFacing<0;}
    else if(s.cheerAge<CHEER_DURATION){frame=s.cheerAge<.4?27:28;flip=s.cheerFacing<0;lift=cheerOffset(s.cheerAge);}
    return {atlas,frame,reference:0,flip,lift,size:s.power?96:48};
}
