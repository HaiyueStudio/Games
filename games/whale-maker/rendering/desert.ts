import type { Body, Enemy, Item, Level, State } from '../rules/model';
import type { WhaleScene2D } from './WhaleScene2D';
type Color=readonly[number,number,number,number];
const circle=(s:WhaleScene2D,x:number,y:number,r:number,c:Color)=>s.dustParticle(x,y,r,1,c);
const visible=(s:WhaleScene2D,x:number,y:number,w:number,h:number)=>x+w>s.board.x&&x<s.board.x+s.board.width&&y+h>s.board.y&&y<s.board.y+s.board.height;
function pyramid(s:WhaleScene2D,x:number,y:number,w:number,h:number):void {
    s.triangle({x:x-w/2,y:y-h,width:w,height:h},[.77,.57,.35,1]);
    s.triangle({x,y:y-h,width:w/2,height:h},[.65,.46,.29,1],true);
    for(let n=1;n<7;n++){const t=n/7;s.fill({x:x-w*t*.48,y:y-h+h*t,width:w*t*.47,height:1},[.83,.65,.43,.65]);}
}
export function drawDesertBackground(s:WhaleScene2D,cam:number,cy:number,z:number,v:{x:number;y:number;w:number;h:number},ground:number):void {
    for(let n=0;n<24;n++){const t=n/23;s.fill({x:v.x,y:v.y+n*v.h/24,width:v.w,height:v.h/24+1},[.74+t*.24,.88-t*.07,.86-t*.22,1]);}
    const horizon=v.y+(ground-cy-1)*z,offset=((cam*z*.07)%1800+1800)%1800;
    const sunY=Math.max(v.y+1.4*z,Math.min(v.y+v.h*.25,horizon-5.8*z));
    circle(s,v.x+v.w*.8-offset*.08,sunY,1.1*z,[1,.93,.67,1]);circle(s,v.x+v.w*.8-offset*.08,sunY,.91*z,[1,.96,.77,1]);
    for(let n=-1;n<3;n++){const x=v.x+n*900-offset;for(const [cx,base,w,h]of [[x+420,horizon,5.3*z,4.1*z],[x+660,horizon+.15*z,3.3*z,2.6*z]])if(cx!+w!/2>v.x&&cx!-w!/2<v.x+v.w)pyramid(s,cx!,base!,w!,h!);}
    for(const [layer,color]of [[0,[.91,.73,.47,1]],[1,[.96,.80,.54,1]],[2,[.98,.85,.63,1]]] as const)
        for(let n=0;n<48;n++){const w=v.w/48+1,x=v.x+n*v.w/48,y=horizon+(layer*.55-.25+Math.sin(n*.12+cam*.015+layer*2)*.38)*z;s.fill({x,y,width:w,height:Math.max(1,v.y+v.h-y)},color);}
}
export function drawCactus(s:WhaleScene2D,e:Body & Partial<Enemy>,x:number,feet:number,z:number,time:number,opacity=1):void {
    if(!visible(s,x-z*.65,feet-(e.h+1)*z,z*1.3,(e.h+1.2)*z))return;
    const count=Math.max(1,Math.round(e.h)),frame=Math.floor(time*8)%4,turn=(e.vx??-1)<0?-1:1;
    for(let n=count-1;n>=0;n--){const head=n===0,cx=x+Math.sin((frame+n)*Math.PI/2)*z*.018,cy=feet-(count-n-.5)*z-(head?(e.cactusDrop??0)/.15*z:0),r=z*.43;
        for(let k=0;k<8;k++){const a=k*Math.PI/4;s.fill({x:cx+Math.cos(a)*r-z*.08,y:cy+Math.sin(a)*r-z*.015,width:z*.16,height:z*.03},[.56,.4,.25,opacity],a);}
        circle(s,cx,cy,r,[.12,.35,.28,opacity]);circle(s,cx-z*.015,cy-z*.015,r-z*.035,[.3,.65,.4,opacity]);circle(s,cx-z*.09,cy-z*.1,r*.7,[.54,.8,.48,opacity]);
        for(const dx of [-.18,0,.18])s.fill({x:cx+dx*z,y:cy-z*.26,width:z*.025,height:z*.5},[.24,.57,.34,.5*opacity]);
        if(head){
            for(const dx of [-.13,.13]){circle(s,cx+(dx+turn*.025)*z,cy-z*.02,z*.045,[.07,.22,.2,opacity]);circle(s,cx+(dx+turn*.025-.012)*z,cy-z*.035,z*.014,[1,1,.94,opacity]);}
            for(const dx of [-.23,.23])circle(s,cx+dx*z,cy+z*.105,z*.055,[.96,.53,.5,.7*opacity]);
            s.fill({x:cx-z*.07,y:cy+z*.14,width:z*.14,height:z*.025},[.13,.28,.2,opacity]);
            for(let k=0;k<5;k++){const a=k*Math.PI*2/5;circle(s,cx+z*.12*Math.cos(a),cy-z*.4+z*.10*Math.sin(a),z*.075,[.99,.6,.65,opacity]);}circle(s,cx,cy-z*.4,z*.052,[1,.88,.45,opacity]);
        }
    }
    for(const dir of [-1,1])circle(s,x+dir*z*.2,feet-z*(.04+(dir===1?frame%2:1-frame%2)*.045),z*.085,[.44,.39,.25,opacity]);
}
export function drawSnowball(s:WhaleScene2D,item:Body & Partial<Item>,x:number,feet:number,z:number):void {
    if(!visible(s,x-z*.55,feet-z*1.05,z*1.1,z*1.1))return;
    const y=feet-z*.5,r=z*.48;circle(s,x,y,r,[.34,.62,.72,1]);circle(s,x-z*.014,y-z*.02,r-z*.035,[.8,.94,.98,1]);circle(s,x-z*.06,y-z*.08,r*.8,[.97,1,1,1]);
    const angle=(item.age??0)*(item.vx??0)*1.8;
    for(const a of [angle,angle+2.5,angle+4.6]){const cx=x+Math.cos(a)*z*.27,cy=y+Math.sin(a)*z*.27;s.fill({x:cx-z*.05,y:cy-z*.012,width:z*.1,height:z*.024},[.55,.78,.87,.85],a+.6);}
    circle(s,x-z*.15,y-z*.2,z*.07,[1,1,1,.8]);
}
/** Opaque foreground hides exactly the submerged portion of every actor. */
export function drawQuicksand(s:WhaleScene2D,l:Level,cam:number,cy:number,z:number,v:{x:number;y:number;w:number;h:number},time:number):void {
    const x0=Math.max(0,Math.floor(cam)),x1=Math.min(l.width,Math.ceil(cam+v.w/z)),y0=Math.max(0,Math.floor(cy)),y1=Math.min(l.height,Math.ceil(cy+v.h/z));
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;){if(l.cells[y*l.width+x]!=='quicksand'){x++;continue;}const begin=x;while(x<x1&&l.cells[y*l.width+x]==='quicksand')x++;const px=v.x+(begin-cam)*z,py=v.y+(y-cy)*z;s.fill({x:px,y:py,width:(x-begin)*z,height:z+.5},[.85,.65,.36,1]);
        for(let n=begin;n<x;n++){const xx=v.x+(n-cam)*z,surface=y===0||l.cells[(y-1)*l.width+n]!=='quicksand';if(surface){s.fill({x:xx,y:py,width:z,height:z*.12},[.99,.85,.56,1]);s.fill({x:xx+z*.08,y:py+z*.15,width:z*.68,height:z*.025},[.69,.49,.25,.6]);}
            const phase=Math.floor(time*8)%8/8;for(let k=0;k<2;k++){const u=(n*.37+k*.45+phase*.24)%1;s.fill({x:xx+u*z,y:py+(.35+k*.36)*z,width:z*.23,height:z*.025},[.96,.77,.46,.6]);}}
    }
}
export function drawDesertEffects(s:WhaleScene2D,state:State,cam:number,cy:number,z:number,v:{x:number;y:number}):void {
    for(const fx of state.effects)if(fx.kind==='snow'||fx.kind==='cactus'){
        if(!visible(s,v.x+(fx.x-cam-1)*z,v.y+(fx.y-cy-1)*z,z*2,z*2))continue;
        const t=fx.age/.4;for(let n=0;n<8;n++){const a=n*Math.PI/4,x=v.x+(fx.x-cam+Math.cos(a)*t*.8)*z,y=v.y+(fx.y-cy+Math.sin(a)*t*.6-t*.3)*z;circle(s,x,y,z*.1*(1-t),fx.kind==='snow'?[.89,.98,1,1-t]:[.45,.74,.38,1-t]);}
    }
}
