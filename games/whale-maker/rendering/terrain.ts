import type { IndexedSpritePlaneDescriptor } from '@haiyue/extensions/experimental/indexed-sprite';
import type { Level } from '../rules/model';
import { tile } from '../rules/model';
import type { WhaleScene2D } from './WhaleScene2D';

export const TERRAIN_SIZE=128;
export const isCoral=(t:string)=>t==='#'||t==='slope-up'||t==='slope-down';
export const terrainFrame=(t:string,x:number,y:number)=>(t==='slope-up'?4:t==='slope-down'?8:0)+(x&1)+2*(y&1);

/** Runtime texture sampling of the generated coral tile; source PNGs stay intact.
 * Mirrored interior samples meet on identical texels, including vertical joins.
 * The ramp mask follows the exact collision diagonal instead of the art's gutter.
 */
export function terrainPlanes(source:Pick<IndexedSpritePlaneDescriptor,'width'|'height'|'pixels'>):IndexedSpritePlaneDescriptor[]{
    const n=TERRAIN_SIZE,planes:IndexedSpritePlaneDescriptor[]=[];
    const sample=(u:number,v:number)=>4*(Math.round(v*(source.height-1))*source.width+Math.round(u*(source.width-1)));
    for(let kind=0;kind<3;kind++)for(let parity=0;parity<4;parity++){
        const pixels=new Uint8Array(n*n*4);
        for(let y=0;y<n;y++)for(let x=0;x<n;x++){
            const u=x/(n-1),v=y/(n-1),sx=parity&1?1-u:u,sy=parity&2?1-v:v;
            const from=sample(.12+sx*.76,.45+sy*.47),to=(y*n+x)*4;
            pixels.set(source.pixels.subarray(from,from+3),to);
            const edge=kind===1?x+y-(n-1):kind===2?y-x:n;
            pixels[to+3]=Math.round(Math.max(0,Math.min(1,edge/Math.SQRT2+.5))*255);
        }
        planes.push({id:`terrain:${kind*4+parity}`,width:n,height:n,format:'rgba8',pixels});
    }
    const height=40,pixels=new Uint8Array(n*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<n;x++){
        const from=sample(.08+x/(n-1)*.84,.1+y/(height-1)*.32);
        pixels.set(source.pixels.subarray(from,from+4),(y*n+x)*4);
    }
    planes.push({id:'terrain:12',width:n,height,format:'rgba8',pixels});
    return planes;
}

/** Soil first, then the continuous exposed grass, in both play and the editor. */
export function drawTerrain(scene:WhaleScene2D,l:Level,cameraX:number,cameraY:number,z:number,view:{x:number;y:number;w:number;h:number},bonusRoom=false):void{
    const surfaces:{x:number;y:number;grade:number}[]=[];
    for(let y=Math.max(0,Math.floor(cameraY)-1);y<Math.min(l.height,Math.ceil(cameraY+view.h/z)+1);y++)
        for(let x=Math.max(bonusRoom?221:0,Math.floor(cameraX)-1);x<Math.min(l.width,Math.ceil(cameraX+view.w/z)+1);x++){
            const t=tile(l,x,y);if(!isCoral(t))continue;
            const px=view.x+(x-cameraX)*z,py=view.y+(y-cameraY)*z;
            scene.sprite('terrain',terrainFrame(t,x,y),px,py,z,z);
            if(t!=='#'||!isCoral(tile(l,x,y-1)))surfaces.push({x,y,grade:t==='slope-up'?-1:t==='slope-down'?1:0});
        }
    for(const {x,y,grade}of surfaces){
        const angle=Math.atan(grade),length=z*Math.hypot(1,grade)+.8,thickness=.3*z;
        const surfaceY=y+(grade?.5:0),offset=.09*z;
        const cx=view.x+(x+.5-cameraX)*z-Math.sin(angle)*offset,cy=view.y+(surfaceY-cameraY)*z+Math.cos(angle)*offset;
        scene.sprite('terrain',12,cx-length/2,cy-thickness/2,length,thickness,(x&1)!==0,angle);
    }
}
