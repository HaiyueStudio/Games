import type {HaiyueEngine, Scene} from '@haiyue/engine';
import type {HyaPlayer} from '@haiyue/extensions/hya-player';

/** Optional completion artwork. Existing Chinese GUI and game rules remain authoritative. */
export class HyaVictory {
 private lifetime:AbortController|undefined;
 private player:HyaPlayer|undefined;
 private sequence=0;
 private disposed=false;
 constructor(private readonly engine:HaiyueEngine,private readonly scene:Scene){
  scene.world.addRuntimeIntegration({onDetach:()=>this.dispose()});
 }
 async show(level:number):Promise<void>{
  this.hide();if(this.disposed)return;
  const lifetime=this.lifetime=new AbortController();
  try{
   const [module,response]=await Promise.all([import('@haiyue/extensions/hya-player'),fetch('./assets/hya-victory.json',{signal:lifetime.signal})]);
   if(!response.ok)throw Error('Completion artwork is unavailable');
   const source:unknown=await response.json();if(lifetime.signal.aborted)return;
   const player=await module.createHyaPlayer(source,{mode:'render',scene:this.scene,viewport:this.viewport(),dpr:this.dpr(),signal:lifetime.signal,host:{
    capabilities:new Set(['org.haiyue.data-binding@1','org.haiyue.layout-2d@1']),invalidate(){},
    resources:{async acquire(request){
     if(request.kind!=='font'||request.asset!=='font'||request.integrity!=='sha256-9ipJd+MNkryPnaPv8nB3VtPXa8AL4OVJ52xDyj76QE8=')throw Error('Undeclared completion resource');
     const response=await fetch('./assets/hya-victory.otf',{signal:request.signal});if(!response.ok)throw Error('Completion font is unavailable');
     const bytes=new Uint8Array(await response.arrayBuffer());return {value:bytes,generation:1,bytes:bytes.byteLength,release(){}};
    }}
   }});
   if(lifetime.signal.aborted){player.dispose();return;}
   this.player=player;this.sequence=0;if(!player.data)throw Error('Completion data model is absent');player.data.run(write=>write.set({part:'data',id:'root'},['label'],'LEVEL '+level+' COMPLETE'));
   player.pause();this.engine.on('update',this.update);this.update();
  }catch(error){if(!lifetime.signal.aborted){this.hide();console.error('HYA completion artwork failed',error);}}
 }
 hide():void{this.lifetime?.abort();this.lifetime=undefined;this.engine.off('update',this.update);this.player?.dispose();this.player=undefined;}
 dispose():void{if(this.disposed)return;this.disposed=true;this.hide();}
 private viewport():readonly[number,number]{return [this.engine.displayWidth,this.engine.displayHeight];}
 private dpr():number{const value=this.engine.devicePixelRatio;return typeof value==='function'?value():value;}
 private readonly update=():void=>{if(!this.player)return;try{this.player.advance({sequence:++this.sequence,deltaSeconds:0,viewport:this.viewport(),dpr:this.dpr()});}catch(error){this.hide();console.error('HYA completion frame failed',error);}};
}
