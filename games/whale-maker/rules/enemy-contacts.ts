import type { Body, Enemy, State } from './model';
import type { Services } from './expansion';

const exposed=(e:Enemy)=>e.alive&&!e.held&&!e.transit&&e.downAge===undefined&&(!['ghost','ring-ghost','lava-dragon'].includes(e.kind)||!!e.frozen)&&e.kind!=='fire-jumper'&&(e.kind!=='plant'||Math.min(e.w,e.h)>=.08);
const overlap=(a:Body,b:Body)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const weapon=(e:Enemy)=>(e.kind==='shell'||e.frozen?.thrown||e.kind==='bomb'&&e.bombThrown)&&Math.abs(e.vx)>5;
const movable=(e:Enemy,axis:'x'|'y')=>(e.frozen?(axis==='x'?Math.abs(e.vx)>.01:!e.grounded):e.kind!=='plant'||axis==='y'&&e.mode!=='pipe'&&!e.plantMouth)&&(axis==='x'?e.kind!=='shell'||Math.abs(e.vx)>.01:!e.grounded);

/** Enemy contact responses are separate from player stomps and damage. */
export function resolveEnemyContacts(s:State,previous:ReadonlyMap<Enemy,Body>,svc:Services):void {
    const bodies=s.enemies.filter(e=>exposed(e)&&e.x>s.player.x-34&&e.x<s.player.x+30);
    const translate=(e:Enemy,axis:'x'|'y',distance:number)=>{
        if(Math.abs(distance)<1e-8)return;
        // Resolve separation against the level too: a crowd cannot push through
        // a brick, a slope, a pipe, or the edge of the level.
        const body={...e,vx:axis==='x'?distance:0,vy:axis==='y'?distance:0};
        const hit=svc.move(s,body,1);e.x=body.x;e.y=body.y;if(hit.floor)e.grounded=true;
    };
    for(let pass=0;pass<4;pass++){
        bodies.sort((a,b)=>a.x-b.x||a.y-b.y||a.kind.localeCompare(b.kind)||a.vx-b.vx);
        let contacts=0;
        for(let i=0;i<bodies.length;i++){
            const a=bodies[i]!;if(!exposed(a))continue;
            for(let j=i+1;j<bodies.length;j++){
                const b=bodies[j]!;if(b.x>=a.x+a.w)break;
                if(a.kind==='cannonball'&&b.kind==='cannonball')continue;
                if(!exposed(b)||!previous.has(a)&&!previous.has(b)||!overlap(a,b))continue;
                const shotA=weapon(a),shotB=weapon(b);
                if(shotA||shotB){if(shotA)svc.defeat(s,b,'shell',a);if(shotB)svc.defeat(s,a,'shell',b);if(!a.alive)break;continue;}
                const oldA=previous.get(a)??a,oldB=previous.get(b)??b;
                const verticalA=oldA.y+oldA.h<=oldB.y+.005,verticalB=oldB.y+oldB.h<=oldA.y+.005;
                const horizontalA=oldA.x+oldA.w<=oldB.x+.005,horizontalB=oldB.x+oldB.w<=oldA.x+.005;
                const dx=Math.min(a.x+a.w-b.x,b.x+b.w-a.x),dy=Math.min(a.y+a.h-b.y,b.y+b.h-a.y);
                const axis:'x'|'y'=(verticalA||verticalB)&&(!(horizontalA||horizontalB)||dy<dx)?'y':'x';
                const first=axis==='x'?(oldA.x+oldA.w/2<=oldB.x+oldB.w/2?a:b):(oldA.y+oldA.h/2<=oldB.y+oldB.h/2?a:b),second=first===a?b:a;
                const extent=axis==='x'?'w':'h',penetration=first[axis]+first[extent]-second[axis];
                const firstMoves=movable(first,axis)?1:0,secondMoves=movable(second,axis)?1:0,total=firstMoves+secondMoves;
                if(total===0)continue;
                translate(first,axis,-penetration*firstMoves/total);translate(second,axis,penetration*secondMoves/total);
                let remaining=first[axis]+first[extent]-second[axis];
                if(remaining>1e-7&&secondMoves)translate(second,axis,remaining);
                remaining=first[axis]+first[extent]-second[axis];
                if(remaining>1e-7&&firstMoves)translate(first,axis,-remaining);
                if(axis==='x'){
                    if(first.kind!=='plant'&&first.vx>0){first.vx=-first.vx;first.turnWait=.18;}
                    if(second.kind!=='plant'&&second.vx<0){second.vx=-second.vx;second.turnWait=.18;}
                }else{
                    if(first.vy>0)first.vy=0;if(second.vy<0)second.vy=0;
                    first.grounded=true;
                }
                contacts++;
            }
        }
        if(contacts===0)break;
    }
}
