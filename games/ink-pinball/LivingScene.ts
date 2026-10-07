import { Entity, Transform2D, World } from '@haiyue/engine';
import { Physics2DBody, Physics2DSystem } from '@haiyue/engine/physics';
import { DRAGON, KOI_DURATION, advanceDragon, koiPose, newDragon, toadJump } from './sceneRules';
import type { WaterSource } from './waterModel';

type Ball={entity:Entity;body:Physics2DBody;transform:Transform2D};
export class LivingScene {
 private dragon=newDragon();
 private readonly sensor:Entity;
 private readonly root:HTMLDivElement;
 private readonly jaw:HTMLImageElement;
 private readonly fish:HTMLImageElement[]=[];
 private readonly shooter:HTMLImageElement;
 private fishStart=[-100,-100];private fishLanding=[true,true];private drains=0;private landings=0;private launchTime=-100;private time=0;
 constructor(world:World,private readonly physics:Physics2DSystem,layer:HTMLElement,private readonly impact:(x:number,y:number,strength?:number)=>void,private readonly ripple:(x:number,y:number)=>void,private readonly splash:(x:number,y:number,strength:number,source:WaterSource,time:number)=>void){
  this.sensor=new Entity('Dragon mouth');this.sensor.addComponent(new Transform2D({x:DRAGON.x,y:DRAGON.y}));
  this.sensor.addComponent(new Physics2DBody({type:'static',shape:'circle',radius:DRAGON.radius,isSensor:true,categoryBits:8,maskBits:1}));world.addEntity(this.sensor);
  this.root=document.createElement('div');this.root.className='dragon';
  const body=new Image();body.src='./assets/dragon.png';body.alt='';body.className='dragon-body';this.root.append(body);
  this.jaw=new Image();this.jaw.src='./assets/dragon.png';this.jaw.alt='';this.jaw.className='dragon-jaw';this.root.append(this.jaw);layer.append(this.root);
  for(let i=0;i<2;i++){const f=new Image();f.src='./assets/koi.png';f.alt='';f.className=`koi koi-${i}`;layer.append(f);this.fish.push(f);}
  const pad=new Image();pad.src='./assets/lily-pad.png';pad.alt='';pad.className='lily-pad shooter-pad';layer.append(pad);
  this.shooter=new Image();this.shooter.src='./assets/toad.png';this.shooter.className='shooter-toad';this.shooter.alt='';layer.append(this.shooter);
 }
 get holding():boolean{return this.dragon.phase==='holding';}
 beforeStep(ball:Ball):void{if(this.holding)this.hold(ball);}
 private hold(ball:Ball):void{this.physics.teleportBody(ball.body,DRAGON.x,DRAGON.y,0);this.physics.setLinearVelocity(ball.body,0,0);this.physics.setAngularVelocity(ball.body,0);}
 afterStep(ball:Ball,time:number,playing:boolean):'capture'|'spit'|null{
  const touching=playing&&this.physics.events().some(e=>e.phase!=='exit'&&((e.entityA===this.sensor&&e.entityB===ball.entity)||(e.entityB===this.sensor&&e.entityA===ball.entity)));
  const action=advanceDragon(this.dragon,time,touching);
  if(action==='capture'){this.hold(ball);this.impact(DRAGON.x,DRAGON.y,.7);}
  if(this.holding)this.hold(ball);
  if(action==='spit'){
   // Release outside the mouth sensor toward the middle of the table.
   this.physics.teleportBody(ball.body,DRAGON.x+38,DRAGON.y-35,0);
   this.physics.setLinearVelocity(ball.body,8.5,-10.5);this.impact(DRAGON.x+28,DRAGON.y-25,1.4);
  }
  return action;
 }
 launch(time:number):void{this.launchTime=time;this.ripple(235,-360);}
 drain(time:number):void{const i=this.drains++%2;this.fishStart[i]=time;this.fishLanding[i]=false;this.splash((i?65:-80)+Math.sin(time*.45+i*3)*12,-370+Math.sin(time*.6+i)*4,.65,'leap',time);}
 sync(time:number):void{
  this.time=time;const elapsed=time-this.dragon.since;
  const bite=this.holding?Math.min(1,elapsed/.12):Math.max(0,1-elapsed/.18)*(this.dragon.phase==='cooldown'?1:0);
  this.root.style.transform=`translate(${this.dragon.phase==='cooldown'?Math.max(0,1-elapsed/.3)*-2:0}%,${Math.sin(time*.8)*1.1}%) scale(${1-bite*.035},${1+bite*.025})`;
  this.root.dataset.phase=this.dragon.phase;
  this.jaw.style.transform=`rotate(${this.holding?-15:Math.max(0,1-elapsed/.3)*9}deg)`;
  this.fish.forEach((node,i)=>{
   const p=(time-this.fishStart[i]!)/KOI_DURATION,air=p>=0&&p<1;const pose=koiPose(p);
   const x=(i?65:-80)+Math.sin(time*.45+i*3)*12+(air?pose.travel*(i?-1:1):0);
   const y=-370+Math.sin(time*.6+i)*4+(air?pose.lift:0);
   node.style.left=`${(x+300)/6}%`;node.style.top=`${(450-y)/9}%`;
   node.style.transform=`translate(-50%,-50%) rotate(${air?pose.rotation*(i?-1:1):Math.sin(time*.5)*6}deg) scaleX(${i?-1:1})`;
   node.style.opacity=String(air?pose.opacity:.58);node.dataset.phase=air?'leaping':'swimming';
   if(!air&&!this.fishLanding[i]){this.fishLanding[i]=true;this.landings++;this.splash(x,y,1.25,'fish',time);}
  });
  this.shooter.style.transform=`translate(-50%,calc(-50% - ${toadJump(time-this.launchTime)/55*100}%))`;
 }
 reset():void{this.dragon=newDragon();this.fishStart.fill(-100);this.fishLanding.fill(true);this.drains=0;this.landings=0;this.launchTime=-100;this.sync(0);}
 snapshot(){return{dragon:{...this.dragon},koi:this.fishStart.map(start=>({progress:(this.time-start)/KOI_DURATION,airborne:this.time>=start&&this.time-start<KOI_DURATION})),drains:this.drains,landings:this.landings};}
}
