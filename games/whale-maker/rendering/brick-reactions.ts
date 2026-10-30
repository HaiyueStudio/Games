import type { State } from '../rules/model';
import type { WhaleScene2D } from './WhaleScene2D';
import { coinFrame } from './poses';

export function drawCoinPops(scene:WhaleScene2D,s:State,cam:number,cy:number,z:number,v:{x:number;y:number}):void {
    for(const pop of s.coinPops){
        const t=Math.min(1,pop.age/.38),flash=Math.max(0,(pop.age-.38)/.27),x=v.x+(pop.x-cam)*z,y=v.y+(pop.y-cy-1.5*(1-(1-t)**2))*z;
        if(flash<.65)scene.centeredActor('tokens',coinFrame(pop.age*1.5),x,y,.82*z*(1-flash*.6),0,0,1-flash);
        if(flash>0){
            const opacity=Math.sin(Math.min(1,flash)*Math.PI);
            scene.dustParticle(x,y,z*.3,opacity*.7,[1,.94,.6,1]);
            for(let n=0;n<8;n++){const a=n*Math.PI/4,r=(.08+.35*flash)*z;scene.fill({x:x+Math.cos(a)*r-z*.12,y:y+Math.sin(a)*r-z*.025,width:z*.24,height:z*.05},[1,.95,.6,opacity],a);}
        }
    }
}
