import type { WhaleScene2D } from './WhaleScene2D';
import type { Enemy } from '../rules/model';
import type { PipeShape } from '../rules/pipes';
import type { ElementProperties } from '../rules/catalog';

/** Rotate each repeated section about the pipe centre, preserving texel scale. */
export function drawPipe(scene:WhaleScene2D,p:PipeShape,x:number,y:number,z:number,capRatio:number,color?:ElementProperties['color']):void {
    const angle=p.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),cx=x+p.width*z/2,cy=y+p.height*z/2;
    const section=(frame:number,ly:number,w:number,h:number,flip=false,extra=0)=>{
        const ox=-ly*s*z,oy=ly*c*z;
        const tint:readonly[number,number,number,number]|undefined=color==='green'?[.6,1,.55,1]:color==='red'?[1,.55,.55,1]:color==='yellow'?[1,.9,.5,1]:color==='blue'?[.55,.75,1,1]:undefined;
        scene.sprite('mechanics',frame,cx+ox-w*z/2,cy+oy-h*z/2,w*z,h*z,flip,angle+extra,1,tint);
    };
    for(let n=0;n<p.length;n++)section(13,-p.length/2+n+.5,1.84,1,n%2!==0,n%2?Math.PI:0);
    const h=2*capRatio;section(12,-p.length/2-.23+h/2,2,h);
}
export function drawPipePlant(scene:WhaleScene2D,e:Enemy,x:number,y:number,z:number,time:number):void {
    const n=e.plantDirection!;if((n[0]?e.w:e.h)<.08)return;
    const length=n[0]?e.w:e.h,angle=Math.atan2(n[0],-n[1]);
    scene.centeredActor('creatures',Math.floor(time*5)%4,x+n[0]*(length-.625)*z,y+n[1]*(length-.625)*z,1.25*z,0,angle);
}
