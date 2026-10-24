import { GuiElement, GuiImage, GuiLabel, GuiRoot } from '@haiyue/engine/gui';

type Rect = { x:number; y:number; width:number; height:number };
const transparent = (color:string) => color==='transparent'||color==='rgba(0, 0, 0, 0)';
function intersect(a:Rect,b:Rect):Rect { const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y);return {x,y,width:Math.max(0,Math.min(a.x+a.width,b.x+b.width)-x),height:Math.max(0,Math.min(a.y+a.height,b.y+b.height)-y)}; }
const icons:Record<string,string>={'icon-library':'▦','icon-clock':'◷','icon-heart':'♡','icon-search':'⌕','icon-pad':'＋','icon-arrow':'→','icon-external':'↗'};

/** DOM supplies accessible input and responsive layout; Engine GUI owns every visible pixel.
 * Images are retained by URL so filtering never creates an unbounded GPU texture cache. */
export class DesktopGui {
  readonly backdrop = new GuiRoot();
  readonly covers = new GuiRoot();
  readonly root = new GuiRoot({theme:{fontFamily:'Microsoft YaHei, Segoe UI, sans-serif',fontSize:14}});
  private readonly images = new Map<string,HTMLImageElement>();
  private readonly measure = document.createElement('canvas').getContext('2d')!;
  private readonly styleCache = new Map<Element,CSSStyleDeclaration>();
  nodes = 0;
  constructor(private readonly invalidate:()=>void) {}
  private place<T extends GuiElement>(node:T,rect:Rect,root=this.root):T { node.layout=()=>Object.assign(node.rect,rect);root.add(node);return node; }
  private shape(rect:Rect,color:string,border='transparent',radius=0,root=this.root):void {
    if(rect.width<=0||rect.height<=0)return;
    this.place(new GuiElement({disabled:true,style:{backgroundColor:color,borderColor:border,radius,padding:0}}),rect,root);
  }
  private label(text:string,rect:Rect,size:number,color:string,align:'left'|'center'='left'):void {
    if(!text.trim()||rect.width<=0||rect.height<=0)return;
    this.place(new GuiLabel({text,fontSize:size,disabled:true,textAlign:align,style:{color,padding:0}}),rect);
  }
  private style(element:Element):CSSStyleDeclaration { let style=this.styleCache.get(element);if(!style){style=getComputedStyle(element);this.styleCache.set(element,style);}return style; }
  private image(element:HTMLImageElement,rect:Rect,clip:Rect):void {
    if(!element.src)return;
    let source=this.images.get(element.src);
    if(!source){source=new Image();source.decoding='async';source.onload=this.invalidate;source.onerror=this.invalidate;source.src=element.src;this.images.set(element.src,source);}
    if(!source.complete||!source.naturalWidth)return;
    const target=intersect(rect,clip);if(target.width<=0||target.height<=0)return;
    const ratio=source.naturalWidth/source.naturalHeight,aspect=rect.width/rect.height;
    const uw=Math.min(1,aspect/ratio),vh=Math.min(1,ratio/aspect);
    const u=(1-uw)/2+(target.x-rect.x)/rect.width*uw,v=(1-vh)/2+(target.y-rect.y)/rect.height*vh;
    this.place(new GuiImage({source,uv:[u,v,target.width/rect.width*uw,target.height/rect.height*vh],disabled:true}),target,this.covers);
  }
  private text(node:Text,parent:Element,clip:Rect):void {
    const text=node.textContent?.replace(/\s+/g,' ').trim();if(!text)return;
    const style=this.style(parent),size=parseFloat(style.fontSize),range=document.createRange();range.selectNodeContents(node);
    const rects=[...range.getClientRects()];let remaining=text;
    this.measure.font=`${style.fontWeight} ${size}px ${style.fontFamily}`;
    for(const line of rects){
      const box=intersect(line,clip);if(box.height<line.height-1||box.width<2)continue;
      let count=remaining.length;
      if(rects.length>1){count=0;for(const char of remaining){if(this.measure.measureText(remaining.slice(0,count)+char).width>line.width+2)break;count+=char.length;}count=Math.max(1,count);}
      let value=remaining.slice(0,count).trim();remaining=remaining.slice(count).trimStart();
      if(box.width<line.width-2)while(value.length>1&&this.measure.measureText(value).width>box.width+2)value=value.slice(0,-1);
      this.label(value,{x:box.x,y:box.y-1,width:box.width+2,height:Math.max(line.height,size*1.4)},size,style.color);
      if(!remaining)break;
    }
  }
  private walk(element:Element,clip:Rect):void {
    if(element.matches('.sr-only,.icon-definitions,[hidden],script,style'))return;
    const style=this.style(element);if(style.display==='none'||style.visibility==='hidden')return;
    const raw=element.getBoundingClientRect(),rect={x:raw.x,y:raw.y,width:raw.width,height:raw.height},visible=intersect(rect,clip);
    if(!visible.width||!visible.height)return;
    if(!transparent(style.backgroundColor)||parseFloat(style.borderTopWidth)>0||parseFloat(style.borderBottomWidth)>0)
      this.shape(visible,style.backgroundColor,parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth)>0?style.borderBottomColor:'transparent',parseFloat(style.borderRadius)||0,element.matches('.spotlight,.card-visual')?this.backdrop:this.root);
    if(element instanceof HTMLImageElement){this.image(element,rect,clip);return;}
    if(element.matches('.spotlight-shade')){
      for(let i=0;i<32;i++){const x=rect.x+i*rect.width/32;this.shape(intersect({x,y:rect.y,width:rect.width/32+1,height:rect.height},clip),`rgba(7,18,31,${.97*(1-i/32)**1.6})`);}return;
    }
    if(element instanceof SVGElement){
      const id=element.querySelector('use')?.getAttribute('href')?.slice(1);if(id)this.label(icons[id]??'◇',visible,Math.min(24,rect.height),style.color,'center');return;
    }
    if(element instanceof HTMLInputElement){const editing=document.activeElement===element;this.label((element.value||(editing?'':element.placeholder??''))+(editing?'|':''),visible,parseFloat(style.fontSize),element.value?style.color:'#8199ad');return;}
    const childClip=/(hidden|auto|scroll)/.test(style.overflow+style.overflowY+style.overflowX)?visible:clip;
    for(const child of element.childNodes){if(child instanceof Text)this.text(child,element,childClip);else if(child instanceof Element)this.walk(child,childClip);}
    if(element.matches('.card-visual.selected,.card-visual.gamepad-selected')||element.matches(':focus-visible')) {
      const x=rect.x-3,y=rect.y-3,w=rect.width+6,h=rect.height+6;
      for(const edge of [{x,y,width:w,height:2},{x,y:y+h-2,width:w,height:2},{x,y,width:2,height:h},{x:x+w-2,y,width:2,height:h}])this.shape(intersect(edge,clip),'#bdf5aa');
    }
    if(element.matches('.game-grid')&&element.scrollHeight>element.clientHeight){
      const height=Math.max(24,rect.height*element.clientHeight/element.scrollHeight);
      const y=rect.y+(rect.height-height)*element.scrollTop/(element.scrollHeight-element.clientHeight);
      this.shape(intersect({x:rect.x+rect.width-3,y,width:2,height},clip),'rgba(169,202,220,.6)','transparent',1);
    }
  }
  sync(width:number,height:number):void {
    for(const root of [this.backdrop,this.covers,this.root])for(const node of [...root.root.children])root.remove(node);
    this.styleCache.clear();const clip={x:0,y:0,width,height};
    for(const selector of ['.system-bar','.desktop','.command-bar']){const element=document.querySelector(selector);if(element)this.walk(element,clip);}
    this.nodes=[this.backdrop,this.covers,this.root].reduce((sum,root)=>sum+root.root.children.length,0);
    for(const root of [this.backdrop,this.covers,this.root])root.root.markDirty();
  }
  snapshot(){return {renderer:'engine-gui',nodes:this.nodes,images:this.images.size};}
  destroy():void { for(const image of this.images.values()){image.onload=null;image.onerror=null;}this.images.clear(); }
}
