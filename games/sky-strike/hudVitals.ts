import { GuiElement, GuiImage, GuiLabel } from '@haiyue/engine/gui';
import { PLAYER_MAX_LIVES, requiredEnemyDefinition } from './rules';
import type { SkyStrikeHud } from './presentation';
import type { SkyStrikeLocale } from './i18n';
import type { SkyStrikeGuiImage } from './guiSkins';

/** Compact game-specific composition of existing Engine GUI shapes, images and labels. */
function healthRing(parent: GuiElement, id: string) {
  const root = parent.add(new GuiElement({ id, width: 60, height: 60, disabled: true }));
  root.add(new GuiElement({ x: 2, y: 2, width: 56, height: 56, style: { radius: 28, backgroundColor: '#18303e' } }));
  root.add(new GuiElement({ x: 6, y: 6, width: 48, height: 48, style: { radius: 24, backgroundColor: '#091321' } }));
  // Overlapping round GUI primitives form a smooth clockwise arc, with a fractional end cap.
  // Fixed children and no raster texture changes; only changed colors invalidate the GUI batch.
  const dots = Array.from({length:96},(_,i)=> {
    const angle=(i+0.5)/96*Math.PI*2-Math.PI/2;
    return root.add(new GuiElement({ x:30+Math.cos(angle)*26-2,y:30+Math.sin(angle)*26-2,width:4,height:4, style:{radius:2,backgroundColor:'#65edc4'} }));
  });
  let previousRatio=-1,previousColor='';
  return { root, set(value:number,color:string) {
    const ratio=Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
    if(ratio===previousRatio && color===previousColor)return;
    previousRatio=ratio;previousColor=color;
    for(const [i,dot] of dots.entries()) {
      const opacity=Math.max(0,Math.min(1,ratio*96-i));
      const rgba=color+Math.round(opacity*255).toString(16).padStart(2,'0');
      if(dot.style.backgroundColor!==rgba)dot.setStyle({backgroundColor:rgba});
    }
  } };
}
export class SkyStrikeVitals {
  private readonly hull: ReturnType<typeof healthRing>;
  private readonly boss: ReturnType<typeof healthRing>;
  private readonly portrait: GuiImage;
  private readonly lives: GuiImage[];
  private readonly score: GuiLabel;
  private readonly best: GuiLabel;
  private bossId='';
  constructor(parent:GuiElement,private readonly image:SkyStrikeGuiImage,private readonly locale:SkyStrikeLocale,top:number) {
    const panel=parent.add(new GuiElement({id:'sky-vitals',y:top,width:'100%',height:90,style:{backgroundColor:'rgba(3,8,18,0.76)'}}));
    this.hull=healthRing(panel,'sky-hull-ring');
    this.hull.root.layout=rect=> { this.hull.root.rect={x:rect.x+10,y:rect.y+4,width:60,height:60};for(const child of this.hull.root.children)child.layout(this.hull.root.rect); };
    this.hull.root.add(new GuiImage({x:12,y:12,width:36,height:36,source:image('assets/gui-shield.png'),sourceKey:'assets/gui-shield.png',disabled:true}));
    this.lives=Array.from({length:PLAYER_MAX_LIVES},(_,i)=>panel.add(new GuiImage({id:`sky-life-${i}`,x:14+i*18,y:67,width:16,height:16,source:image('assets/gui-life.png'),sourceKey:'assets/gui-life.png',disabled:true})));
    this.score=panel.add(new GuiLabel({id:'sky-score',textAlign:'center',fontSize:21,style:{color:'#effbff'}}));
    this.best=panel.add(new GuiLabel({id:'sky-best',textAlign:'center',fontSize:12,style:{color:'#9db5cc'}}));
    for(const [label,y,height] of [[this.score,12,28],[this.best,43,20]] as const) {
      label.layout=rect=> { label.rect={x:rect.x+80,y:rect.y+y,width:Math.max(1,rect.width-160),height};
        const textUnits=[...label.text].reduce((n,c)=>n+(c.charCodeAt(0)>255?1:0.62),0);
        label.setFontSize(Math.min(label===this.score?21:12,(label.rect.width-4)/Math.max(1,textUnits)));
      };
    }
    this.boss=healthRing(panel,'sky-boss-ring');this.boss.root.setVisible(false);
    this.boss.root.layout=rect=> {this.boss.root.rect={x:rect.x+rect.width-70,y:rect.y+4,width:60,height:60};for(const child of this.boss.root.children)child.layout(this.boss.root.rect);};
    this.portrait=this.boss.root.add(new GuiImage({x:15,y:12,width:30,height:36,uv:[0.2,0.2,0.6,0.6],disabled:true}));
  }
  update(hud:SkyStrikeHud):void {
    this.score.setText(`${this.locale.text('score')} ${hud.score}`);this.best.setText(`${this.locale.text('best')} ${hud.highScore}`);
    for(const label of [this.score,this.best]) { if(label.rect.width>0) { const units=[...label.text].reduce((n,c)=>n+(c.charCodeAt(0)>255?1:0.62),0);label.setFontSize(Math.min(label===this.score?21:12,(label.rect.width-4)/Math.max(1,units))); } }
    this.hull.set(hud.health/100,hud.health<=25?'#ff6b85':hud.health<=50?'#ffc46b':'#65edc4');
    for(const [i,icon] of this.lives.entries())icon.setVisible(i<hud.lives);
    this.boss.root.setVisible(!!hud.bossName);
    if(hud.bossName) {
      this.boss.set(hud.bossHealth,'#ff708e');
      if(this.bossId!==hud.bossName) {
        this.bossId=hud.bossName;
        const definition=requiredEnemyDefinition(hud.bossName);
        this.portrait.setSource(this.image(definition.sprite),definition.sprite);
      }
    }
  }
}
