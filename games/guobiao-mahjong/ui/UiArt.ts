import {Entity,type HaiyueEngine,type World} from '@haiyue/engine';
import {GuiImage,GuiRoot,GuiSystem,type GuiStyle} from '@haiyue/engine/gui';
import {loadTextureImage} from './TileAtlas';
export const UI_ICONS=['play','pause','step','hint','menu','close'] as const;
export type UiIcon=typeof UI_ICONS[number];
export interface UiArt{backdrop:HTMLImageElement;panel:HTMLImageElement;ranking:HTMLImageElement;icons:HTMLCanvasElement}
function makeIcons(){
  const c=document.createElement('canvas');c.width=768;c.height=128;const g=c.getContext('2d')!;
  UI_ICONS.forEach((name,i)=>{g.save();g.translate(i*128,0);g.fillStyle='#fff';g.strokeStyle='#fff';g.lineWidth=8;g.lineCap='round';g.lineJoin='round';
    const line=(points:number[][])=>{g.beginPath();points.forEach(([x,y],j)=>j?g.lineTo(x!,y!):g.moveTo(x!,y!));g.stroke()};
    const triangle=(left:number,right:number)=>{g.beginPath();g.moveTo(left,31);g.lineTo(right,64);g.lineTo(left,97);g.closePath();g.fill()};
    if(name==='play')triangle(43,96);
    if(name==='pause'){g.fillRect(38,31,18,66);g.fillRect(73,31,18,66)}
    if(name==='step'){triangle(27,77);g.fillRect(87,31,12,66)}
    if(name==='menu')for(const y of [36,64,92])line([[31,y],[97,y]]);
    if(name==='close'){line([[36,36],[92,92]]);line([[92,36],[36,92]])}
    if(name==='hint'){g.beginPath();g.arc(64,52,25,0,Math.PI*2);g.stroke();line([[48,76],[49,88],[79,88],[80,76]]);line([[53,102],[75,102]]);line([[64,12],[64,5]]);line([[27,26],[21,20]]);line([[101,26],[107,20]])}
    g.restore();});return c;
}
export const iconUv=(name:UiIcon):[number,number,number,number]=>[UI_ICONS.indexOf(name)/UI_ICONS.length,0,1/UI_ICONS.length,1];
export async function loadUiArt(signal:AbortSignal):Promise<UiArt>{
  const [backdrop,panel,ranking]=await Promise.all(['ui-backdrop-v1.png','ui-drawer-v1.png','ui-ranking-v1.png'].map(n=>loadTextureImage('./assets/'+n,signal)));
  return {backdrop:backdrop!,panel:panel!,ranking:ranking!,icons:makeIcons()};
}
export function panelSkin(art:UiArt):GuiStyle{return {backgroundColor:'#08251d',borderColor:'#b39457',color:'#eff0de',radius:16,padding:0,
  nineSlice:{source:art.panel,sourceWidth:art.panel.naturalWidth,sourceHeight:art.panel.naturalHeight,cuts:[90,90,90,90],pixelRatio:2.5}}}
/** The background is native GUI, owned by a separate root and drawn before the 3D scene. */
export function installUiBackdrop(engine:HaiyueEngine,world:World,art:UiArt){
  const root=new GuiRoot({pointerFilter:'ignore'}),image=root.add(new GuiImage({source:art.backdrop,sourceKey:'mahjong:ui-backdrop:v1',pointerFilter:'ignore'}));
  image.layout=p=>{Object.assign(image.rect,p);const a=art.backdrop.naturalWidth/art.backdrop.naturalHeight,b=p.width/Math.max(1,p.height);image.setUv(a>b?[(1-b/a)/2,0,b/a,1]:[0,(1-a/b)/2,1,a/b])};
  world.addEntity(new Entity('Mahjong illustrated backdrop').addComponent(root));
  const system=new GuiSystem(engine,{roots:new Set([root]),loadOp:'clear',font:{chars:' ',fontSize:12,atlasSize:128}});system.priority=1;world.addSystem(system);
}
