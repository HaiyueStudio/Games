import {GuiButton,GuiElement,GuiImage,GuiLabel,GuiModal,type GuiRoot} from '@haiyue/engine/gui';
import {actionKey,type Action,type Observation} from '../rules/types';
import type {MatchController} from '../app/MatchController';
import {tileUv,type TileAtlas} from './TileAtlas';
import {panelSkin,type UiArt} from './UiArt';
import {CLAIM_FAMILIES as FAMILIES,CLAIM_LABELS as LABELS,claimGroups,choiceTiles,type ClaimFamily} from './claimPresentation';
export class ClaimControls{
  private readonly buttons:GuiButton[];
  private readonly pass:GuiButton;
  private readonly modal:GuiModal;
  private readonly rows:Array<{button:GuiButton;action:Action;tiles:Array<{node:GuiImage;frame:GuiElement;tile:number;called:boolean}>}>=[];
  private readonly note:GuiLabel;
  private observation:Observation|null=null;
  private groups:ReturnType<typeof claimGroups>=[];
  private key='';private preview:string|null=null;private epoch=-1;private revision=-1;private resume=false;
  constructor(private readonly root:GuiRoot,private readonly canvas:HTMLCanvasElement,private readonly game:MatchController,private readonly atlas:TileAtlas,art:UiArt){
    this.buttons=FAMILIES.map(kind=>root.add(new GuiButton({id:'claim-'+kind,text:LABELS[kind],visible:false,style:{backgroundColor:'#082c22e8',hoverBackgroundColor:'#215e42',borderColor:kind==='hu'?'#ffe19d':'#b69a60',color:kind==='hu'?'#ffe7a0':'#e9c882',fontSize:46,radius:38,padding:0},onClick:()=>this.choose(kind)})));
    this.pass=root.add(new GuiButton({id:'claim-pass',text:'过',visible:false,style:{backgroundColor:'#08251edb',hoverBackgroundColor:'#2d4d3f',borderColor:'#708c76',color:'#c1d0bd',fontSize:25,radius:32,padding:0},onClick:()=>this.act(this.observation?.legalActions.find(a=>a.type==='pass'))}));
    const layout=()=>{const w=canvas.clientWidth,h=canvas.clientHeight,visible=[...this.buttons.filter(b=>b.visible),...(this.pass.visible?[this.pass]:[])],cell=Math.min(82,(w-24)/Math.max(1,visible.length)),size=Math.min(72,cell-8),y=Math.min(h-190,h*.65);visible.forEach((b,i)=>this.place(b,(w-visible.length*cell)/2+i*cell+(cell-size)/2,y,size,size,b===this.pass?24:w<600?37:46))};
    for(const button of [...this.buttons,this.pass])button.layout=layout;
    this.modal=root.add(new GuiModal({id:'claim-choice',visible:false,title:'选择吃牌组合',message:'',showCloseButton:false,showConfirmButton:false,showCancelButton:true,cancelText:'返回',closeOnBackdrop:true,backdropColor:'#020d09b8',style:panelSkin(art),onClose:()=>this.finish()}));
    this.modal.titleLabel.setTextAlign('center');
    this.note=this.modal.add(new GuiLabel({text:'金色边框为吃入的牌 · 点击整组确认',pointerFilter:'ignore',style:{color:'#c6b88e',padding:0}}));
    this.modal.layout=p=>{
      Object.assign(this.modal.rect,p);const w=canvas.clientWidth,h=canvas.clientHeight,width=Math.min(570,w-28),tileW=w<500?41:50,tileH=tileW*1.375,rowH=tileH+22,height=Math.min(h-40,142+this.rows.length*(rowH+9));
      this.dialog(width,height);this.place(this.modal.titleLabel,18,17,width-36,34,w<500?22:25,true);this.place(this.modal.messageLabel,-2000,0,1,1,12,true);
      this.rows.forEach((r,i)=>{const y=64+i*(rowH+9);this.place(r.button,20,y,width-40,rowH,13,true);const total=r.tiles.length*(tileW+9)-9,left=(width-total)/2;r.tiles.forEach((t,j)=>{this.place(t.frame,left+j*(tileW+9)-3,y+8-3,tileW+6,tileH+6,12,true);this.place(t.node,left+j*(tileW+9),y+8,tileW,tileH,12,true)})});
      this.place(this.note,12,height-66,width-24,20,w<500?10:12,true);this.place(this.modal.cancelButton,(width-92)/2,height-38,92,28,12,true);
    };
  }
  private dialog(width:number,height:number){const p=this.root.viewport,s=p.width/Math.max(1,this.canvas.clientWidth);Object.assign(this.modal.dialogRect,{x:p.x+(this.canvas.clientWidth-width)/2*s,y:p.y+(this.canvas.clientHeight-height)/2*s,width:width*s,height:height*s})}
  private place(node:GuiElement,x:number,y:number,width:number,height:number,font:number,dialog=false){const p=dialog?this.modal.dialogRect:this.root.viewport,s=this.root.viewport.width/Math.max(1,this.canvas.clientWidth);Object.assign(node.rect,{x:p.x+x*s,y:p.y+y*s,width:width*s,height:height*s});if(node instanceof GuiLabel)node.setFontSize(font*s);else if(node.style.fontSize!==font*s)node.setStyle({fontSize:font*s})}
  sync(o:Observation,blocked:boolean,disabled:boolean){
    this.observation=o;const key=`${o.revision}:${this.game.human}:${this.game.presentationEpoch}:${this.game.started}`;
    if(key!==this.key){this.key=key;this.groups=this.game.started&&this.game.human===o.seat?claimGroups(o.legalActions):[];if(this.modal.visible&&(this.revision!==o.revision||this.epoch!==this.game.presentationEpoch))this.close()}
    const show=!blocked&&!this.modal.visible&&this.groups.length>0;
    this.buttons.forEach((b,i)=>{b.setVisible(show&&this.groups.some(g=>g.kind===FAMILIES[i]));b.setDisabled(disabled)});
    this.pass.setVisible(show&&o.legalActions.some(a=>a.type==='pass'));this.pass.setDisabled(disabled);
    if(show)for(const b of [...this.buttons,this.pass])if(b.visible)b.layout(this.root.viewport);
  }
  private choose(kind:ClaimFamily){const group=this.groups.find(g=>g.kind===kind);if(!group)return;if(kind!=='chow'&&group.options.length===1){this.act(group.options[0]);return}
    for(const r of this.rows){this.modal.remove(r.button);for(const t of r.tiles){this.modal.remove(t.frame);this.modal.remove(t.node)}}this.rows.length=0;
    this.epoch=this.game.presentationEpoch;this.revision=this.game.revision;this.resume=this.game.started&&!this.game.paused;this.game.pause(true);this.preview=actionKey(group.options[0]!);
    this.modal.setTitle(kind==='chow'?'选择吃牌组合':'选择杠牌组合');this.note.setText(kind==='chow'?'金色边框为吃入的牌 · 点击整组确认':'点击牌面选择这组杠牌');
    const expectedRevision=this.revision,expectedEpoch=this.epoch;
    group.options.forEach((action,i)=>{const b=this.modal.add(new GuiButton({id:'claim-choice-'+i,text:'',style:{backgroundColor:'#183c2ccf',hoverBackgroundColor:'#2c6245',borderColor:'#776f48',radius:12,padding:0},onPointerEnter:()=>{this.preview=actionKey(action)},onClick:()=>{if(this.modal.visible&&expectedRevision===this.game.revision&&expectedEpoch===this.game.presentationEpoch)this.act(action)}}));
      const tiles=choiceTiles(action).map(t=>{const frame=this.modal.add(new GuiElement({pointerFilter:'ignore',style:{backgroundColor:t.called?'#ffd474':'#49614d',borderColor:t.called?'#ffe6aa':'#49614d',radius:5}}));const node=this.modal.add(new GuiImage({source:this.atlas.source,sourceKey:this.atlas.sourceKey,uv:tileUv(t.tile),pointerFilter:'ignore'}));return {...t,frame,node}});this.rows.push({button:b,action,tiles});});
    this.modal.show();
  }
  private act(action:Action|undefined){const o=this.observation;if(!action||!o||this.game.revision!==o.revision)return;if(this.modal.visible&&(this.game.presentationEpoch!==this.epoch||o.revision!==this.revision)){this.close();return}this.game.act(action,o.revision);this.close()}
  private finish(){this.preview=null;if(this.resume&&this.epoch===this.game.presentationEpoch)this.game.pause(false);this.resume=false}
  close(){if(this.modal.visible)this.modal.close();else this.preview=null}
  get visible(){return this.modal.visible}
  get previewKey(){return this.preview}
  snapshot(){return {renderer:'engine-gui-claims',buttons:this.buttons.filter(b=>b.visible).map(b=>({id:b.id,text:b.text,rect:{...b.rect},disabled:b.disabled})),pass:this.pass.visible?{text:this.pass.text,rect:{...this.pass.rect}}:null,choice:this.visible?{rect:{...this.modal.dialogRect},closeRect:{...this.modal.cancelButton.rect},revision:this.revision,options:this.rows.map(r=>({action:r.action,rect:{...r.button.rect},tiles:r.tiles.map(t=>({tile:t.tile,called:t.called,rect:{...t.node.rect}}))}))}:null}}
}
