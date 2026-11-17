import { PbrMaterial, type World } from '@haiyue/engine';
import { directionMarkers, compassRects } from '../ui/tablePresentation';
import { WINDS, type Observation, type Seat } from '../rules/types';
import { loadTextureImage } from '../ui/TileAtlas';
import { dealerPosition } from './tableModel';
import { TableBatch } from './TableBatch';

export const WIND_BEASTS=['青龙','朱雀','白虎','玄武'] as const;
export interface TableArt {cloth:HTMLImageElement;beasts:HTMLImageElement}
export async function loadTableArt(signal:AbortSignal):Promise<TableArt>{
  const [cloth,beasts]=await Promise.all([loadTextureImage('./assets/tablecloth-emerald-v1.png',signal),loadTextureImage('./assets/wind-beasts-v1.png',signal)]);
  return {cloth,beasts};
}
const SIZE=2048,CELL=256;
const uv=(x:number,y:number,w:number,h:number):[number,number,number,number]=>[(x+.5)/SIZE,(y+.5)/SIZE,(w-1)/SIZE,(h-1)/SIZE];
function bakeSurfaceAtlas(art:TableArt):HTMLCanvasElement{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Table texture canvas unavailable');
  ctx.drawImage(art.cloth,0,0,1024,1024);
  for(let wind=0;wind<4;wind++){
    const x=wind%2,y=Math.floor(wind/2),sw=art.beasts.naturalWidth/2,sh=art.beasts.naturalHeight/2;
    ctx.drawImage(art.beasts,x*sw,y*sh,sw,sh,1024+x*512,y*512,512,512);
  }
  const glyph=(text:string,x:number,y:number,active:boolean)=>{
    ctx.save();ctx.translate(x+CELL/2,y+CELL/2);
    ctx.beginPath();ctx.arc(0,0,105,0,Math.PI*2);
    ctx.fillStyle=active?'#e5be70':'#104a38';ctx.fill();ctx.strokeStyle=active?'#ffe2a0':'#b89552';ctx.lineWidth=active?8:3;ctx.stroke();
    ctx.fillStyle=active?'#173c2e':'#d9c68e';ctx.font='600 143px "STKaiti", "Songti SC", serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,0,8);
    ctx.restore();
  };
  for(let wind=0;wind<4;wind++){glyph(WINDS[wind]!,wind*CELL,1024,false);glyph(WINDS[wind]!,wind*CELL,1280,true);}
  glyph('庄',1024,1024,true);
  return canvas;
}

/** All central graphics and the dealer seal are surface geometry in a single immutable texture atlas. */
export class TableSurface {
  readonly atlas:HTMLCanvasElement;
  readonly batch:TableBatch;
  private key='';
  private wind=0;
  private active:Seat|null=null;
  private dealer=0;
  constructor(world:World,art:TableArt){
    this.atlas=bakeSurfaceAtlas(art);
    const material=new PbrMaterial({baseColorTexture:this.atlas,baseColor:[1,1,1,1],metallic:0,roughness:.96,doubleSided:true,alphaMode:'mask',alphaCutoff:.12,
      samplers:{baseColor:{minFilter:'linear',magFilter:'linear',mipmapFilter:'linear',maxAnisotropy:8}}});
    this.batch=new TableBatch(world,'Printed felt and celestial wind circle',material,128,true);
  }
  sync(o:Observation,view:Seat){
    const active=o.phase==='turn'?o.turn:null,key=`${o.roundWind}:${o.dealer}:${view}:${active}`;
    if(this.key===key)return;this.key=key;this.wind=o.roundWind;this.active=active;this.dealer=(o.dealer-view+4)%4;
    const b=this.batch;b.clear();
    b.roundedFace({x:0,y:0,z:0},936,936,.35,27,uv(0,0,1024,1024));
    b.face({x:0,y:0,z:0},192,192,.65,uv(1024+o.roundWind%2*512,Math.floor(o.roundWind/2)*512,512,512));
    const c=compassRects({x:500,y:500},{x:0,y:0,width:1000,height:1000});
    for(const marker of directionMarkers(o,view)){
      const r=c.markers[marker.position];
      b.face({x:r.x+r.width/2-500,y:0,z:r.y+r.height/2-500},r.width,r.height,.65,uv(marker.wind*CELL,marker.active?1280:1024,CELL,CELL));
    }
    const d=dealerPosition(this.dealer);
    b.face({x:d.x+d.width/2-500,y:0,z:d.y+d.height/2-500},d.width,d.height,.65,uv(1024,1024,CELL,CELL));b.commit();
  }
  snapshot(){return {renderer:'printed-cloth-atlas',atlas:'mahjong:table-surface:v1',wind:this.wind,beast:WIND_BEASTS[this.wind],activeSeat:this.active,dealerRelative:this.dealer,textureBakes:1,geometryUpdates:this.batch.commits,draws:1};}
}
