import type { Body, Input, Level, State, Tile } from './model';
import { setCell } from './terrain';
import { emit } from './events';

export type PipeRotation=0|90|180|270;
export const isPipe=(t:Tile|undefined)=>t==='P'||t==='Q'||t==='p'||t==='q';
export interface PipeShape { anchor:number;x:number;y:number;length:number;width:number;height:number;rotation:PipeRotation;normal:[number,number];mouth:[number,number];cells:number[] }

/** P stays at the bounding rectangle's upper-left corner in every orientation. */
export function pipeShape(l:Pick<Level,'width'|'height'|'cells'|'properties'>,id:number,rotation?:PipeRotation):PipeShape|null {
    if(l.cells[id]!=='P')return null;
    const x=id%l.width,y=Math.floor(id/l.width),props=l.properties?.[id];
    let length=props?.length??1;
    if(props?.length===undefined)while(y+length<l.height&&l.cells[id+length*l.width]==='p'&&l.cells[id+length*l.width+1]==='q')length++;
    const angle=rotation??props?.rotation??0,horizontal=angle===90||angle===270,width=horizontal?length:2,height=horizontal?2:length;
    const normal=([ [0,-1],[1,0],[0,1],[-1,0] ] as [number,number][])[angle/90]!;
    const cells:number[]=[];
    for(let dy=0;dy<height;dy++)for(let dx=0;dx<width;dx++)cells.push((y+dy)*l.width+x+dx);
    return {anchor:id,x,y,length,width,height,rotation:angle,normal,mouth:[x+width/2+normal[0]*length/2,y+height/2+normal[1]*length/2],cells};
}
export function pipeAt(l:Level,id:number):PipeShape|null {
    if(!isPipe(l.cells[id]))return null;
    if(l.cells[id]==='P')return pipeShape(l,id);
    const x=id%l.width,y=Math.floor(id/l.width);
    // Only anchors above or to the left can own this cell. Legacy tall pipes
    // remain supported without imposing a new size limit on saved levels.
    for(let ay=y;ay>=0;ay--)for(let ax=x;ax>=Math.max(0,x-1);ax--){const p=pipeShape(l,ay*l.width+ax);if(p&&p.cells.includes(id))return p;}
    for(let ax=x-2;ax>=0;ax--)for(let ay=Math.max(0,y-1);ay<=y;ay++){const p=pipeShape(l,ay*l.width+ax);if(p&&(p.rotation===90||p.rotation===270)&&p.cells.includes(id))return p;}
    return null;
}
export function writePipe(l:Pick<Level,'width'|'height'|'cells'> & Partial<Pick<Level,'properties'>>,x:number,y:number,length=3,rotation:PipeRotation=0):boolean {
    const horizontal=rotation===90||rotation===270,w=horizontal?length:2,h=horizontal?2:length;
    if(x<0||y<0||x+w>l.width||y+h>l.height)return false;
    for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++)setCell(l,(y+dy)*l.width+x+dx,dy===0&&dx===0?'P':dy===0&&dx===1?'Q':dx%2?'q':'p');
    if(rotation!==0||l.properties)(l.properties??={})[y*l.width+x]={...l.properties?.[y*l.width+x],length,rotation};
    return true;
}
/** A blocked rotation leaves the map and all object properties untouched. */
export function rotatePipe(l:Level,id:number):boolean {
    const old=pipeShape(l,id);if(!old)return false;
    const next=pipeShape(l,id,((old.rotation+90)%360) as PipeRotation)!;
    if(next.x+next.width>l.width||next.y+next.height>l.height||next.cells.some(n=>!old.cells.includes(n)&&l.cells[n]!=='.'))return false;
    for(const n of old.cells)if(n!==id){setCell(l,n,'.');if(l.properties)delete l.properties[n];if(l.contents)delete l.contents[n];}
    const props={...l.properties?.[id],length:old.length,rotation:next.rotation};
    writePipe(l,old.x,old.y,old.length,next.rotation);(l.properties??={})[id]=props;return true;
}
function outside(p:PipeShape,b:Body):[number,number]{
    return [p.mouth[0]+p.normal[0]*(b.w/2+.002)-b.w/2,p.mouth[1]+p.normal[1]*(b.h/2+.002)-b.h/2];
}
export function enterOrdinaryPipe(s:State,i:Input):boolean {
    if(s.pipeWait>0||s.pipe||!i.down&&!i.interact&&!i.axis)return false;
    const b=s.player,cx=b.x+b.w/2,cy=b.y+b.h/2;
    const linked=Object.keys(s.level.properties??{}).map(Number).filter(id=>s.level.cells[id]==='P'&&s.level.properties![id]!.link!==undefined);
    const anchors=new Set([...(s.level.warps??[]).map(w=>w.from[1]*s.level.width+w.from[0]),...linked]);
    for(const id of anchors){
        if(s.level.cells[id]!=='P')continue;
        const pipe=pipeShape(s.level,id)!,n=pipe.normal;
        const pressing=n[0]===1?i.axis<0:n[0]===-1?i.axis>0:n[1]===-1?i.down:!!i.interact;
        if(!pressing)continue;
        const tangent=n[0]?Math.abs(cy-pipe.mouth[1]):Math.abs(cx-pipe.mouth[0]);
        const separation=(cx-pipe.mouth[0])*n[0]+(cy-pipe.mouth[1])*n[1]-(n[0]?b.w:b.h)/2;
        if(tangent>.55||separation<-.04||separation>.1)continue;
        const warp=s.level.warps?.find(w=>w.from[0]===pipe.x&&w.from[1]===pipe.y);
        const link=s.level.properties?.[id]?.link;
        const exit=link===undefined?undefined:linked.find(n=>n!==id&&s.level.properties![n]!.link===link);
        if(!warp&&(exit===undefined||exit<0))continue;
        const target=!warp&&exit!==undefined?pipeShape(s.level,exit):null;
        const to=target?outside(target,b):[warp!.to[0]-b.w/2,warp!.to[1]-b.h] as [number,number];
        s.pipe={age:0,from:[b.x,b.y],to,entryDirection:[-n[0],-n[1]],exitDirection:target?.normal??[0,-1]};
        emit(s,'pipe');s.running=s.skidding=s.turning=false;s.pendingShot=false;s.spinning=false;s.spinAge=0;s.jumpSustain=false;s.jumpCut=false;s.grounded=false;s.notice='正在穿过管道';return true;
    }
    return false;
}
export function advanceOrdinaryPipe(s:State,dt:number):void {
    const pipe=s.pipe!;pipe.age+=dt;s.player.vx=s.player.vy=0;
    const distance=pipe.entryDirection?Math.max(s.player.w,s.player.h)+.5:1.5;
    const exit:[number,number]=pipe.entryDirection?pipe.to:[pipe.to[0]-s.player.w/2,pipe.to[1]-s.player.h];
    const entering=pipe.age<.45,t=entering?pipe.age/.45:1-Math.min(1,(pipe.age-.45)/.45),base=entering?pipe.from:exit;
    const dir:[number,number]=entering?pipe.entryDirection??[0,1]:pipe.exitDirection??[0,-1];
    s.player.x=base[0]+dir[0]*distance*t*(entering?1:-1);s.player.y=base[1]+dir[1]*distance*t*(entering?1:-1);
    if(pipe.age>=.9){s.pipe=null;s.pipeWait=.7;s.invincible=Math.max(s.invincible,1);s.notice='穿出管道';}
}
