import type { IndexedSpritePlaneDescriptor } from '@haiyue/extensions/experimental/indexed-sprite';
import type { Level } from '../rules/model';
import { windVelocity } from '../rules/wind';
import type { WhaleScene2D } from './WhaleScene2D';

export const TORNADO_FRAMES=12;
const TAU=Math.PI*2;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));

/** One continuous tapered volume, with animated near/far helical ribbons. */
export function tornadoPlanes():IndexedSpritePlaneDescriptor[] {
    const width=112,height=224,planes:IndexedSpritePlaneDescriptor[]=[];
    for(let frame=0;frame<TORNADO_FRAMES;frame++){
        const pixels=new Uint8Array(width*height*4),phase=frame/TORNADO_FRAMES*TAU;
        for(let y=0;y<height;y++)for(let x=0;x<width;x++){
            const v=(y+.5)/height,u=(x+.5)/width*2-1;
            const radius=.1+.85*(1-v)**.72;
            const center=.035*Math.sin(v*TAU*1.4-phase)*(1-v);
            const q=(u-center)/radius,edge=clamp((1-Math.abs(q))*width*.28);
            if(!edge)continue;
            const angle=v*TAU*3-phase;
            const ribbon=Math.exp(-(((q-Math.sin(angle))/.19)**2));
            const back=Math.exp(-(((q+Math.sin(angle))/.14)**2));
            const front=.5+.5*Math.cos(angle),body=.3+.18*(1-q*q);
            const rimY=.035+.025*Math.sqrt(Math.max(0,1-q*q));
            const rim=Math.exp(-(((v-rimY)/.009)**2));
            const highlight=clamp(ribbon*(.35+.6*front)+back*(.1+.18*(1-front))+rim*.8);
            const alpha=edge*clamp(body+highlight*.65)*clamp((1-v)*80)*clamp(v*80);
            const at=(y*width+x)*4,light=clamp(highlight+.1*(1-Math.abs(q)));
            pixels[at]=Math.round(92+155*light);pixels[at+1]=Math.round(157+96*light);pixels[at+2]=Math.round(201+54*light);pixels[at+3]=Math.round(alpha*255);
        }
        planes.push({id:`tornado:${frame}`,width,height,format:'rgba8',pixels});
    }
    return planes;
}

export function drawTornado(scene:WhaleScene2D,x:number,y:number,width:number,height:number,time:number):void {
    const frame=Math.floor(time*12)%TORNADO_FRAMES;
    scene.sprite('tornado',frame,x,y,width,height,false,Math.sin(time*2)*.018,.95);
    // Small orbiting droplets and ground dust accent the volume, not stacked rings.
    for(let n=0;n<7;n++){
        const v=(n/7+time*.18)%1,angle=n*2.4+time*6,radius=width*(.08+.39*(1-v)**.72);
        const px=x+width/2+Math.sin(angle)*radius,py=y+v*height;
        scene.dustParticle(px,py,Math.max(1,width*.017),.25+.45*(.5+.5*Math.cos(angle)),[.73,.94,1,1]);
    }
}

/** Fixed-count wind trails; no retained particles, timers or world entities. */
export function drawEnvironmentWind(scene:WhaleScene2D,level:Level,time:number,cam:number,cy:number,z:number,view:{x:number;y:number;w:number;h:number}):void {
    const velocity=windVelocity(level.wind,time),intensity=Math.abs(velocity)/6;
    if(intensity<.005)return;
    const sign=Math.sign(velocity),span=view.w+140,opacity=.12+.38*intensity;
    for(let n=0;n<22;n++){
        const travel=n*167.3+time*(100+Math.abs(velocity)*55)*sign-cam*z*.45;
        const x=view.x-70+((travel%span)+span)%span;
        const y=view.y+(((n*97.7-cy*z*.3)%view.h)+view.h)%view.h;
        const length=18+24*intensity+(n%3)*5;
        for(let k=0;k<4;k++){
            const a=k/4,b=(k+1)/4,ax=x+sign*length*a,bx=x+sign*length*b;
            const ay=y+Math.sin(a*Math.PI*1.4+n)*3,by=y+Math.sin(b*Math.PI*1.4+n)*3;
            scene.fill({x:(ax+bx)/2-length/8,y:(ay+by)/2,width:Math.hypot(bx-ax,by-ay)+.4,height:1.2},[.86,.98,1,opacity],Math.atan2(by-ay,bx-ax));
        }
        if(n%4===0)scene.dustParticle(x,y,1.3,opacity,[.44,.83,.75,1]);
    }
}
