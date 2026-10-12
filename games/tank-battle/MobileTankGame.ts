import { Entity, World, type HaiyueEngine } from '@haiyue/engine';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { GuiRoot, GuiElement, GuiImage, GuiLabel, GuiButton, GuiSystem, type GuiImageSource, type GuiFontOptions, type GuiRect } from '@haiyue/engine/gui';
import { createGame, stepGame, isGameState, STEP, SIZE, GRID, type GameState } from './rules';
import { SPRITE_INDEX, SPRITES, ATLAS_COLUMNS } from './sprites';
import { MobileControls, type Pad } from './mobileControls';

export interface MobileSave { read(): unknown; write(state: GameState): void }
export interface MobileAudio { unlock(): void; play(sound: GameState['sounds'][number]): void; stop(): void }
const TEXT = '铁甲前线单人出击继续作战暂停重新开始保护基地左侧摇杆移动右侧按住开火生命敌军分数胜利基地失守作战结束区域肃清下一关存档失败';
const chars = [...new Set(TEXT + Array.from({ length: 95 }, (_, i) => String.fromCharCode(i + 32)).join(''))].join('');
const rect = (x: number, y: number, width: number, height: number): GuiRect => ({ x, y, width, height });
/** Portable single-player scene: all battlefield sprites and HUD use public Engine GUI. */
export class MobileTankGame {
  readonly world = new World('Tank Battle Mobile');
  readonly controls = new MobileControls();
  private readonly root = new GuiRoot({ theme: { fontFamily: 'sans-serif', fontSize: 14 } });
  private readonly battle = new GuiElement();
  private readonly sprites: GuiImage[] = [];
  private readonly labels = new Map<string, GuiLabel>();
  private readonly buttons = new Map<string, GuiButton>();
  private readonly system: GuiSystem;
  private state = createGame(1);
  private started = false;
  private menu = true;
  private accumulator = 0;
  private elapsedSave = 0;
  private width = 0; private height = 0;
  private board = rect(0, 0, SIZE, SIZE);
  private stick: Pad = { x: 80, y: 600, radius: 66 };
  private fire: Pad = { x: 310, y: 600, radius: 55 };
  private readonly padImages: GuiImage[] = [];
  private readonly modal = new GuiElement({ style: { backgroundColor: '#182516' } });
  private readonly removers: Array<() => void> = [];
  private disposed = false;
  private saveFailed = false;
  constructor(private readonly engine: HaiyueEngine, private readonly atlas: GuiImageSource,
    controlsImage: GuiImageSource, private readonly save: MobileSave, font: Partial<GuiFontOptions> = {}, private readonly audio?: MobileAudio) {
    const entity = new Entity('Mobile tank GUI'); entity.addComponent(this.root); this.world.addEntity(entity);
    this.root.root.add(this.battle);
    this.system = new GuiSystem(engine, { loadOp: 'clear', font: { chars, fontSize: 26, atlasSize: 2048, fontFamily: 'sans-serif', ...font } });
    this.world.addSystem(this.system);
    const integration = new RenderIntegration(engine, { label: 'TankBattle.mobile.gui' });
    this.world.addRuntimeIntegration(integration); integration.registerAll(this.world, () => ({ pass: 'shared' }));
    this.label('title', '铁甲前线  /  1P', 19);
    this.label('status', '', 12); this.label('hint', '左侧摇杆移动 / 右侧按住开火', 11);
    this.button('pause', '暂停', () => this.pause());
    for (let i = 0; i < 3; i++) this.padImages.push(this.root.root.add(new GuiImage({ source: controlsImage, sourceKey: 'tank-controls', uv: i === 0 ? [0,0,.5,.5] : i === 1 ? [.5,0,.5,.5] : [0,.5,.5,.5] })));
    this.root.root.add(this.modal);
    this.label('heading', '铁甲前线', 24, this.modal);
    this.label('description', '保护基地', 14, this.modal);
    this.button('resume', '继续作战', () => this.resume(), this.modal);
    this.button('solo', '单人出击', () => this.start(), this.modal);
    try { const saved = save.read(); if (isGameState(saved) && saved.mode === 1) { this.state = saved; this.started = true; if (this.state.phase === 'playing') this.state.phase = 'paused'; } } catch { this.saveFailed = true; }
    const surface = engine.canvas!;
    const listen = (name: string, callback: (e: PointerEvent) => void) => {
      surface.addEventListener(name, callback as EventListener);
      this.removers.push(() => surface.removeEventListener(name, callback as EventListener));
    };
    const point = (e: PointerEvent) => { const r = surface.getBoundingClientRect(); return { x: (e.clientX-r.left)*this.width/r.width, y: (e.clientY-r.top)*this.height/r.height }; };
    listen('pointerdown', e => {
      this.audio?.unlock();
      if (this.menu || this.state.phase !== 'playing') return;
      const p = point(e);
      if (this.controls.down(e.pointerId, p.x, p.y, this.stick, this.fire)) { e.preventDefault(); surface.setPointerCapture?.(e.pointerId); }
    });
    listen('pointermove', e => { const p = point(e); this.controls.move(e.pointerId, p.x, p.y, this.stick); });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(name, e => this.controls.up(e.pointerId));
    this.update(0, 0);
  }
  private place(element: GuiElement, area: GuiRect): void {
    if (element.rect.x === area.x && element.rect.y === area.y && element.rect.width === area.width && element.rect.height === area.height) return;
    element.layout = () => { Object.assign(element.rect, area); for (const child of element.children) child.layout(area); };
    Object.assign(element.rect, area); element.markDirty();
  }
  private label(id: string, text: string, fontSize: number, parent = this.root.root): void {
    const element = parent.add(new GuiLabel({ id, text, fontSize, style: { color: '#e4c477' } })); this.labels.set(id, element);
  }
  private button(id: string, text: string, click: () => void, parent = this.root.root): void {
    const element = parent.add(new GuiButton({ id, text, style: { backgroundColor: '#35462b', color: '#f1dfaa', borderColor: '#8e9759', padding: 8 }, onClick: () => { click(); this.system.focus.blur(); } })); this.buttons.set(id, element);
  }
  private layout(): void {
    const w = this.engine.displayWidth, h = this.engine.displayHeight;
    if (w === this.width && h === this.height) return;
    this.width = w; this.height = h; this.controls.clear();
    const landscape = w > h * 1.15;
    const size = Math.max(100, Math.min(landscape ? w - 270 : w - 20, h - (landscape ? 85 : 240)));
    this.board = rect((w-size)/2, 64, size, size);
    const radius = Math.min(70, w*.19, (h-size-92)/2);
    this.stick = { x: landscape ? 72 : 83, y: landscape ? h*.63 : Math.max(size+76+radius,h-120), radius: landscape ? 64 : radius };
    this.fire = { x: landscape ? w-72 : w-78, y: this.stick.y, radius: this.stick.radius*.83 };
    this.place(this.labels.get('title')!, rect(12,8,w-100,28));
    this.place(this.labels.get('status')!, rect(12,37,w-24,23));
    this.place(this.buttons.get('pause')!, rect(w-82,8,70,32));
    this.place(this.labels.get('hint')!, rect(16,h-27,w-32,22));
    this.place(this.modal, rect(w/2-Math.min(160,size/2),64+size*.12,Math.min(320,size),size*.76));
    const m=this.modal.rect;
    this.place(this.labels.get('heading')!,rect(m.x+16,m.y+15,m.width-32,36));
    this.place(this.labels.get('description')!,rect(m.x+16,m.y+57,m.width-32,28));
    this.place(this.buttons.get('resume')!,rect(m.x+16,m.y+m.height-108,m.width-32,42));
    this.place(this.buttons.get('solo')!,rect(m.x+16,m.y+m.height-57,m.width-32,42));
  }
  private persist(): void { if (!this.started) return; try { this.save.write(this.state); this.saveFailed = false; } catch { this.saveFailed = true; } }
  start(): void { this.state=createGame(1); this.started=true; this.menu=false; this.controls.clear(); this.accumulator=0; this.persist(); }
  resume(): void { if (!this.started || ['gameover','victory'].includes(this.state.phase)) return; if(this.state.phase==='paused')this.state.phase='playing'; this.menu=false; this.controls.clear(); }
  pause(): void { this.controls.clear(); this.audio?.stop(); this.accumulator=0; if(this.state.phase==='playing'&&this.started)this.state.phase='paused'; this.menu=true; this.persist(); }
  update(time: number, deltaMs: number): void {
    if(this.disposed)return;
    this.layout();
    if(!this.menu && (this.state.phase==='playing'||this.state.phase==='cleared')) {
      this.accumulator+=Math.min(.1,Math.max(0,deltaMs/1000));
      while(this.accumulator>=STEP){this.accumulator-=STEP;stepGame(this.state,[this.controls.input()]);for(const sound of new Set(this.state.sounds))this.audio?.play(sound);}
      this.elapsedSave+=deltaMs;
      if(this.elapsedSave>=5000){this.elapsedSave=0;this.persist();}
    }
    if(['gameover','victory'].includes(this.state.phase)&&!this.menu){this.menu=true;this.controls.clear();this.persist();}
    this.draw(); this.world.update(time,deltaMs);
  }
  private draw(): void {
    let count=0; const rows=Math.ceil(SPRITES.length/ATLAS_COLUMNS), scale=this.board.width/SIZE;
    const sprite=(name:string,x:number,y:number,size=16,direction=0)=>{
      const index=SPRITE_INDEX[name]; if(index===undefined)return;
      const image=this.sprites[count]??this.battle.add(new GuiImage({source:this.atlas,sourceKey:'mobile-atlas'}));
      this.sprites[count++]=image; image.setVisible(true);
      image.setUv([index%ATLAS_COLUMNS/ATLAS_COLUMNS,(Math.floor(index/ATLAS_COLUMNS)+direction*rows)/(rows*4),1/ATLAS_COLUMNS,1/(rows*4)]);
      this.place(image,rect(this.board.x+(x-size/2)*scale,this.board.y+(y-size/2)*scale,size*scale,size*scale));
    };
    const s=this.state;
    s.tiles.forEach((tile,i)=>sprite(tile==='forest'?'ground':tile==='water'?`water-${Math.floor(s.tick/30)%2}`:tile,i%GRID*16+8,Math.floor(i/GRID)*16+8));
    sprite(s.baseAlive?'base':'base-destroyed',208,400,32);
    for(const t of s.tanks){const flash=t.carrier&&Math.floor(s.tick/10)%2===0; const team=flash?'flash':t.player?'p1':t.kind;
      sprite(`${team}-${t.player&&!flash?t.level:0}-${t.moving?Math.floor(s.tick/5)%2:0}`,t.x,t.y,28,t.direction);
      if(t.shield>0&&Math.floor(s.tick/5)%2===0)sprite('item-shield',t.x,t.y-20,10);
    }
    for(const b of s.bullets)sprite('item-star',b.x,b.y,5);
    s.tiles.forEach((tile,i)=>{if(tile==='forest')sprite('forest',i%GRID*16+8,Math.floor(i/GRID)*16+8);});
    for(const p of s.pickups)if(p.ttl>180||Math.floor(s.tick/8)%2===0)sprite(`item-${p.kind}`,p.x,p.y,28);
    for(const e of s.effects)sprite(e.kind==='spawn'?'item-shield':'item-bomb',e.x,e.y,e.kind==='spark'?8:12+(25-e.ttl)*.6);
    for(let i=count;i<this.sprites.length;i++)this.sprites[i]!.setVisible(false);
    const p=s.players[0]!;
    this.labels.get('status')!.setText(`1P  生命 ${p.lives}   分数 ${p.score}   敌军 ${s.total-s.killed}   ${s.stage}/5`);
    this.labels.get('hint')!.setText(this.saveFailed?'存档失败':s.phase==='cleared'?'区域肃清 / 下一关':'左侧摇杆移动 / 右侧按住开火');
    this.modal.setVisible(this.menu);
    this.labels.get('heading')!.setText(s.phase==='victory'?'胜利':s.phase==='gameover'?'作战结束':this.started?'暂停':'铁甲前线');
    this.labels.get('description')!.setText(!s.baseAlive?'基地失守':'保护基地 / 1P');
    this.buttons.get('resume')!.setVisible(this.started&&!['victory','gameover'].includes(s.phase));
    this.buttons.get('solo')!.setText(this.started?'重新开始':'单人出击');
    const pad=this.stick, fire=this.fire;
    this.place(this.padImages[0]!,rect(pad.x-pad.radius,pad.y-pad.radius,pad.radius*2,pad.radius*2));
    this.place(this.padImages[1]!,rect(pad.x+this.controls.x-pad.radius*.52,pad.y+this.controls.y-pad.radius*.52,pad.radius*1.04,pad.radius*1.04));
    this.place(this.padImages[2]!,rect(fire.x-fire.radius,fire.y-fire.radius,fire.radius*2,fire.radius*2));
    this.padImages[2]!.setUv(this.controls.trigger===null?[0,.5,.5,.5]:[.5,.5,.5,.5]);
    this.root.layout(this.width,this.height);
  }
  snapshot(){return {state:JSON.parse(JSON.stringify(this.state)),renderer:'engine-gui',mobile:true,
    viewport:{width:this.width,height:this.height,cssWidth:this.engine.displayWidth,cssHeight:this.engine.displayHeight},
    missingGlyphs:[...new Set([...this.labels.values()].flatMap(l=>[...l.text].filter(c=>!chars.includes(c))))],
    stick:{...this.stick},fire:{...this.fire},controls:this.controls.input(),buttons:Object.fromEntries([...this.buttons].map(([id,b])=>[id,{...b.rect,visible:b.visible}]))};}
  dispose(): void { if(this.disposed)return; this.pause();this.disposed=true;for(const remove of this.removers)remove();this.world.destroy(); }
}
