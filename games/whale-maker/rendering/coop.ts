import type {WhaleScene2D} from './WhaleScene2D';
import type {IndexedSpritePlaneDescriptor} from '@haiyue/extensions/experimental/indexed-sprite';

const digits=['010110010010111','111001111100111','111001111001111','101101111001001'];
const colors=[[.36,.83,1,1],[1,.53,.67,1],[.62,.94,.56,1],[1,.8,.35,1]] as const;

export function rescueBubblePlane():IndexedSpritePlaneDescriptor {
    const side=64,pixels=new Uint8Array(side*side*4);
    for(let y=0;y<side;y++)for(let x=0;x<side;x++){
        const u=(x+.5)/side*2-1,v=(y+.5)/side*2-1,r=Math.hypot(u,v),i=(y*side+x)*4;
        if(r>=1)continue;
        const rim=Math.exp(-((r-.92)**2)/.003),light=Math.exp(-(((u+.4)/.19)**2+((v+.5)/.11)**2));
        const highlight=Math.min(1,rim*.78+light);
        pixels[i]=Math.round(74+171*highlight);
        pixels[i+1]=Math.round(186+67*highlight);
        pixels[i+2]=255;
        pixels[i+3]=Math.round((.12+highlight*.76)*Math.min(1,(1-r)*32)*255);
    }
    return {id:'rescue-bubble',width:side,height:side,format:'rgba8',pixels};
}

/** Player numbers are world-space sprites so movement does not invalidate the GUI. */
export function drawPlayerNumber(scene:WhaleScene2D,index:number,x:number,y:number,arrived:boolean):void {
    const color=colors[index]!,glyph=digits[index]!;
    scene.fill({x:x-8,y:y-15,width:16,height:16},[.04,.16,.23,.93]);
    scene.fill({x:x-8,y:y-15,width:16,height:2},arrived?[1,.89,.53,1]:color);
    for(let i=0;i<glyph.length;i++)if(glyph[i]==='1')scene.fill({x:x-3+i%3*2,y:y-11+Math.floor(i/3)*2,width:2,height:2},color);
}
