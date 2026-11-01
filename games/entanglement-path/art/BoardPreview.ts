import { InkArt } from './InkArt';
import { BoardPainter } from './BoardPainter';
import { boardCenter, boardAngle, hexPlaneSize, boardPlaneSize } from './hexGeometry';
import { collapseTerrain, extendTerrainSites, openTerrain } from './terrainWfc';
import { LifeRun } from '../game/LifeRun';
import { VersusMatch, greedyChoice, seededTile, cellKey } from '../game/VersusRules';
import type { DrawingLevel } from '../game/VersusView';

/** A separate worker/art instance protects the live board while a different scroll is previewed. */
export class BoardPreview {
  private art: InkArt | null=null;
  private loading: Promise<InkArt> | null=null;
  private queue: Promise<unknown>=Promise.resolve();
  private readonly jobs=new Map<string,Promise<HTMLCanvasElement|null>>();
  private readonly cache=new Map<string,HTMLCanvasElement>();
  private disposed=false;
  key(level: DrawingLevel, seed: number, life: boolean): string { return `${life?'life':level.id}:${seed}`; }
  get(level: DrawingLevel, seed: number, life: boolean): HTMLCanvasElement | undefined { return this.cache.get(this.key(level,seed,life)); }
  request(source: DrawingLevel, seed: number, life: boolean): Promise<HTMLCanvasElement|null> {
    const key=this.key(source,seed,life),cached=this.cache.get(key);if(cached)return Promise.resolve(cached);
    const pending=this.jobs.get(key);if(pending)return pending;
    const job=this.queue.then(async()=>{
      if(this.disposed)return null;
      this.loading??=InkArt.load();const art=await this.loading;this.art=art;
      if(this.disposed){art.connected.dispose();return null;}
      const run=life?new LifeRun(source,seed):new VersusMatch(source,seed,'shared');
      for(let i=0;i<(life?4:8)&&!run.winner;i++)run.play(run.turn,greedyChoice(run.level,seed,run.human));
      const level:DrawingLevel={...source,...run.level,...(life?{orientation:'pointy' as const,hexScreen:40}: {})};
      const world=life?openTerrain(level.cells,seed):collapseTerrain(extendTerrainSites(level.cells.map(c=>({...c,
        kind:level.wallKeys.has(cellKey(c))&&!(level.startWall&&cellKey(c)===cellKey(level.start))?'wall' as const:'play' as const}))),seed);
      if(!await art.connected.configure(world)||this.disposed)return null;
      const canvas=document.createElement('canvas');canvas.width=720;canvas.height=560;const ctx=canvas.getContext('2d')!,painter=new BoardPainter(art);
      const points=level.cells.map(c=>boardCenter(c.q,c.r,level.hexScreen,level.orientation)),size=boardPlaneSize(level.hexScreen,level.orientation);
      const xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs)-size.width/2,right=Math.max(...xs)+size.width/2,top=Math.min(...ys)-size.height/2,bottom=Math.max(...ys)+size.height/2;
      const scale=Math.min(664/(right-left),510/(bottom-top)),tileSize=hexPlaneSize(level.hexScreen);
      ctx.translate(360,280);ctx.scale(scale,scale);ctx.translate(-(left+right)/2,-(top+bottom)/2);
      const draw=(image:HTMLCanvasElement,x:number,y:number)=>{ctx.save();ctx.translate(x,y);ctx.rotate(boardAngle(level.orientation));ctx.drawImage(image,-tileSize.width/2,-tileSize.height/2,tileSize.width,tileSize.height);ctx.restore();};
      for(const [i,c] of level.cells.entries()) {
        const id=cellKey(c),point=points[i]!,node=world.nodes.get(id)!;
        if(level.startWall&&id===cellKey(level.start)){draw(painter.source(node,run.human.sourceExit),point.x,point.y);continue;}
        if(level.wallKeys.has(id)){draw(art.connected.base(node),point.x,point.y);continue;}
        const placed=run.human.placed.get(id),tile=placed?.tile??seededTile(level,seed,100+i),rotation=placed?.rotation??0;
        const accent=run.mode==='life'&&run.fixed.has(id)?id==='0,0'?'center':'special':undefined;
        if(placed)draw(painter.placed(node,tile,rotation,run.human.routes.filter(r=>r.cell===id).map(r=>({...r,progress:1,bank:1})),0,0,undefined,{},accent),point.x,point.y);
        else draw(painter.terrain(node,tile,rotation),point.x,point.y);
        if(run.mode==='life'&&run.fixed.has(id)) {
          const marker=painter.lifeMark(id==='0,0',6,run.remaining(id)),w=Math.min(size.width,size.height);ctx.drawImage(marker,point.x-w/2,point.y-w/2,w,w);
        }
      }
      if(this.cache.size>=8)this.cache.delete(this.cache.keys().next().value!);this.cache.set(key,canvas);return canvas;
    }).finally(()=>this.jobs.delete(key));
    this.jobs.set(key,job);this.queue=job.catch(()=>null);return job;
  }
  dispose(): void {this.disposed=true;this.art?.connected.dispose();this.cache.clear();this.jobs.clear();}
}
