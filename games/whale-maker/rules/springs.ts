import {overlaps as overlap} from './geometry';
import type { Body, Enemy, State, Item } from './model';
import { emit } from './events';

export const HORIZONTAL_SPRING_SPEED=9.6;
// The low, wide sprite occupies two fifths of a tile above its foot anchor.
export const HORIZONTAL_SPRING_HEIGHT=.4;
// Includes braking distance: on flat ground a neutral-input rebound travels
// 60% of the former 16 tiles/s, 0.35 second launch.
export const HORIZONTAL_SPRING_HOLD=.3814444444444445;

export const VERTICAL_SPRING_SPEED=Math.sqrt(60*(16**2/60-2));

export function compressSpring(s:State,item:Item):void {
    item.compression=.16;emit(s,'spring',item.x+.4);
    s.springEffects=s.springEffects.filter(f=>f.x!==item.x||f.y!==item.y);
    s.springEffects.push({x:item.x,y:item.y,age:0,kind:item.kind as 'spring-v'|'spring-h'});
    s.springEffects=s.springEffects.slice(-32);
}

/** A downward sweep catches fast falling bodies as well as resting contacts. */
export function bounceVerticalSpring(s:State,b:Body,previous:Body):boolean {
    if(previous.vy<0||b.y+b.h<previous.y+previous.h-.001)return false;
    const spring=s.items.filter(item=>item!==b&&item.kind==='spring-v'&&item.alive&&!item.held&&
        b.x<item.x+item.w-.001&&b.x+b.w>item.x+.001&&previous.y+previous.h<=item.y+.03&&b.y+b.h>=item.y-.015)
        .sort((a,b)=>a.y-b.y)[0];
    if(!spring)return false;
    b.y=spring.y-b.h;b.vy=-VERTICAL_SPRING_SPEED;
    if('grounded'in b)(b as Enemy).grounded=false;
    compressSpring(s,spring);return true;
}

function horizontalSprings(s:State,b:Body):{body:Body;x:number;y:number;item?:Item}[]{
    const springs:{body:Body;x:number;y:number;item?:Item}[]=s.items.filter(item=>item!==b&&item.alive&&!item.held&&item.kind==='spring-h').map(item=>({body:item,x:item.x,y:item.y,item}));
    for(let y=Math.max(0,Math.floor(b.y)-1);y<=Math.min(s.level.height-1,Math.floor(b.y+b.h));y++)
        for(let x=Math.max(0,Math.floor(b.x)-1);x<=Math.min(s.level.width-1,Math.floor(b.x+b.w)+1);x++){
            if(s.level.cells[y*s.level.width+x]==='spring-h')springs.push({body:{x:x+.1,y:y+1-HORIZONTAL_SPRING_HEIGHT,w:.8,h:HORIZONTAL_SPRING_HEIGHT,vx:0,vy:0},x,y});
        }
    return springs;
}

/** The upper face supports a landing; only the lateral faces launch actors. */
export function standOnHorizontalSpring(s:State,b:Body,previousY:number):boolean {
    if(b.vy<0||s.shots.includes(b))return false;
    let top=Infinity;
    for(const {body}of horizontalSprings(s,b))if(b.x<body.x+body.w-.001&&b.x+b.w>body.x+.001&&
        previousY+b.h<=body.y+.025&&b.y+b.h>=body.y&&body.y<top)top=body.y;
    if(top===Infinity)return false;
    b.y=top-b.h;b.vy=0;return true;
}

/** A cooldown belongs to each actor; the visible compression never blocks another actor. */
export function bounceHorizontalSpring(s:State,b:Body,previous:Body,enemy?:Enemy):boolean {
    if(enemy&&(enemy.held||!enemy.alive||enemy.kind==='plant'||(enemy.springWait??0)>0))return false;
    if(b===s.player&&s.wallKick>0)return false;
    for(const spring of horizontalSprings(s,b)){
            const {body,x,y,item}=spring;if(b===item||!overlap(b,body))continue;
            if(previous.y+previous.h<=body.y+.025||previous.y>=body.y+body.h-.025)continue;
            const direction=previous.x+previous.w/2<body.x+body.w/2?-1:1;
            b.x=direction<0?body.x-b.w:body.x+body.w;
            if(enemy){enemy.springPace=Math.abs(enemy.vx)>5&&enemy.kind!=='shell'?1.5:Math.max(enemy.kind==='shell'?12:1.5,Math.abs(enemy.vx));enemy.springLaunch=.22;enemy.springWait=.34;enemy.turnWait=.55;}
            b.vx=direction*HORIZONTAL_SPRING_SPEED;
            emit(s,'spring',x+.5);
            if(b===s.player){s.facing=direction;s.wallKick=HORIZONTAL_SPRING_HOLD;s.springDrift=true;}
            if(item)item.compression=.16;
            s.springEffects=s.springEffects.filter(f=>f.x!==x||f.y!==y);
            s.springEffects.push({x,y,age:0,kind:'spring-h'});s.springEffects=s.springEffects.slice(-32);
            return true;
        }
    return false;
}
export function updateSpringLaunch(e:Enemy,dt:number):void {
    e.springWait=Math.max(0,(e.springWait??0)-dt);
    if((e.springLaunch??0)<=0)return;
    e.springLaunch=Math.max(0,e.springLaunch!-dt);
    if(e.springLaunch===0)e.vx=Math.sign(e.vx)*(e.springPace??1.5);
}
