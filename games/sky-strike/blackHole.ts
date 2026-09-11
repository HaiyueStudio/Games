/** Game-scale singularity simulation. Values are tuned for play, not physical SI units. */
export const BLACK_HOLE_CAPACITY=360;
export const BLACK_HOLE_WARNING_MS=2000;
export const BLACK_HOLE_WAVE_MS=3200;
export const BLACK_HOLE_ABSORPTION_SCALE=.3;
export const BLACK_HOLE_GROWTH_PER_SECOND=18;
export const BLACK_HOLE_BLAST_RADIUS=960*.5;
export const BLACK_HOLE_MAX_Y=960*.4;
export const PLAYER_DRAG_MAX_SPEED=480;
export type HolePhase='inactive'|'feeding'|'warning'|'wave'|'spent';
export interface HoleBody {x:number;y:number;radius:number;previousX?:number;previousY?:number}
export class SkyStrikeBlackHole {
  phase:HolePhase='inactive'; x=240;y=180;mass=0;ageMs=0;phaseMs=0;
  private absorbedMass=0;
  reset(active=false):void {this.phase=active?'feeding':'inactive';this.x=240;this.y=180;this.mass=0;this.absorbedMass=0;this.ageMs=0;this.phaseMs=0;}
  get feeding():boolean{return this.phase==='feeding'||this.phase==='warning';}
  get radius():number{return 22+76*this.progress;}
  get influence():number{return 160+350*Math.min(1,this.mass/BLACK_HOLE_CAPACITY);}
  get progress():number{return Math.min(1,this.mass/BLACK_HOLE_CAPACITY);}
  absorb(mass:number):void {
    if(this.phase!=='feeding'||!Number.isFinite(mass)||mass<=0)return;
    // Queue absorbed matter so a large body cannot instantly change size or gravity.
    this.absorbedMass=Math.min(BLACK_HOLE_CAPACITY,this.absorbedMass+mass*BLACK_HOLE_ABSORPTION_SCALE);
  }
  update(deltaMs:number):boolean {
    if(this.phase==='inactive'||this.phase==='spent')return false;
    const dt=Math.max(0,Math.min(34,deltaMs));this.ageMs+=dt;
    if(this.phase==='feeding'){
      this.x=240+Math.sin(this.ageMs*.00031)*92;this.y=Math.min(BLACK_HOLE_MAX_Y,180+Math.sin(this.ageMs*.00023)*48);
      this.mass=Math.min(this.absorbedMass,this.mass+BLACK_HOLE_GROWTH_PER_SECOND*dt/1000);
      if(this.mass>=BLACK_HOLE_CAPACITY){this.phase='warning';this.phaseMs=0;}
    }else {
      this.phaseMs+=dt;
      if(this.phase==='warning'&&this.phaseMs>=BLACK_HOLE_WARNING_MS){this.phase='wave';this.phaseMs=0;return true;}
      if(this.phase==='wave'&&this.phaseMs>=BLACK_HOLE_WAVE_MS)this.phase='spent';
    }
    return false;
  }
  inBlast(body:{x:number;y:number}):boolean{return Math.hypot(body.x-this.x,body.y-this.y)<=BLACK_HOLE_BLAST_RADIUS;}
  force(x:number,y:number):{x:number;y:number} {
    if(!this.feeding)return{x:0,y:0};
    const dx=this.x-x,dy=this.y-y,d=Math.max(1,Math.hypot(dx,dy));
    const falloff=Math.max(0,1-d/this.influence),speed=(100+210*this.progress)*falloff;
    return{x:dx/d*speed,y:dy/d*speed};
  }
  contains(body:HoleBody):boolean {
    return this.feeding && Math.hypot(body.x-this.x,body.y-this.y)<this.radius+body.radius*.35;
  }
  bend(b:{x:number;y:number;vx:number;vy:number},deltaMs:number):void {
    if(!this.feeding)return;
    const dx=b.x-this.x,dy=b.y-this.y,d=Math.max(1,Math.hypot(dx,dy));if(d>this.influence)return;
    const blend=Math.min(1,deltaMs*.001*(2+7*(1-d/this.influence)));
    const inward=110+180*this.progress,swirl=190+220*this.progress;
    const vx=-dx/d*inward-dy/d*swirl,vy=-dy/d*inward+dx/d*swirl;
    b.vx+=(vx-b.vx)*blend;b.vy+=(vy-b.vy)*blend;
    // Close orbits must keep spiralling inward instead of storing bullets indefinitely.
    if(d<this.radius*3){
      const radial=(b.vx*dx+b.vy*dy)/d,pull=(40+60*this.progress)*(1-d/(this.radius*3));
      if(radial>-pull){b.vx-=dx/d*(radial+pull);b.vy-=dy/d*(radial+pull);}
    }
  }
  snapshot(){return{phase:this.phase,x:this.x,y:this.y,radius:this.radius,influence:this.influence,mass:this.mass,absorbedMass:this.absorbedMass,progress:this.progress,ageMs:this.ageMs,phaseMs:this.phaseMs};}
}
/** Smooth bounded tracking; gravity is applied to velocity so moving away costs speed. */
export function advancePlayer(position:{x:number;y:number}, target:{x:number;y:number}|null, keyboard:{x:number;y:number}, force:{x:number;y:number},deltaMs:number):{x:number;y:number} {
  const seconds=Math.max(0,Math.min(34,deltaMs))/1000;
  let vx=keyboard.x*330,vy=keyboard.y*330;
  if(target){const dx=target.x-position.x,dy=target.y-position.y,d=Math.hypot(dx,dy);const speed=Math.min(360,d*12);vx=d>0?dx/d*speed:0;vy=d>0?dy/d*speed:0;}
  vx+=force.x;vy+=force.y;
  const speed=Math.hypot(vx,vy);if(speed>PLAYER_DRAG_MAX_SPEED){vx*=PLAYER_DRAG_MAX_SPEED/speed;vy*=PLAYER_DRAG_MAX_SPEED/speed;}
  return{x:position.x+vx*seconds,y:position.y+vy*seconds};
}
