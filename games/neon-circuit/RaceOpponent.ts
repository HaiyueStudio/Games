import { BOOST_PADS, BOOST_PAD_LENGTH, CRUISE_MAX_SPEED, BOOST_MAX_SPEED, TOTAL_LAPS, sampleTrack, frameTurn, steeringYawRate,
  type RaceTrack, type RaceState, type RaceControls } from './RaceRules';
import type { FallingFireball } from './VolcanicHazards';

export type RaceMode = 'time-trial' | 'duel';
export type AiDifficulty = 'easy' | 'normal' | 'hard';
export type RaceWinner = 'player' | 'opponent' | 'tie' | null;
export const AI_DIFFICULTIES: readonly AiDifficulty[] = ['easy','normal','hard'];
export function raceProgress(state: RaceState, track: RaceTrack): number {
  return state.finished ? track.length * TOTAL_LAPS : (state.lap - 1) * track.length + state.distance;
}
/** Resolve the sub-step finish order from the portion of this step needed to cross the line. */
export function raceWinner(track: RaceTrack, before: RaceState, player: RaceState, oldBot: RaceState, bot: RaceState): RaceWinner {
  if (!player.finished && !bot.finished) return null;
  if (!bot.finished) return 'player';
  if (!player.finished) return 'opponent';
  const fraction = (a: RaceState, b: RaceState): number => (track.length-a.distance) / Math.max(.00001,track.length-a.distance+b.distance);
  const delta=fraction(before,player)-fraction(oldBot,bot);
  return Math.abs(delta)<1e-7 ? 'tie' : delta<0 ? 'player' : 'opponent';
}
const clamp=(v:number,a:number,b:number):number=>Math.max(a,Math.min(b,v));
const CONFIG = {
  easy: { reaction:.12, preview:1.3, padLook:1.15, laneRate:.15, tracking:.5, corner:.73, error:.78, period:5, steering:3.5 },
  normal: { reaction:.06, preview:1.8, padLook:1.65, laneRate:.17, tracking:.42, corner:.78, error:.48, period:10, steering:4.5 },
  hard: { reaction:1/60, preview:2.4, padLook:2.2, laneRate:.19, tracking:.32, corner:.82, error:0, period:20, steering:6 },
} as const;
/** Preview driver in the road's 3D frame. It can only operate the same three
 * inputs as the player; stepRace owns speed, movement, boosts and collisions.
 * Difficulty changes perception, planning and mistakes, never engine power. */
export class RaceOpponent {
  private wait=0;
  private controls: RaceControls={throttle:1,brake:0,steer:0};
  private intent: RaceControls={throttle:1,brake:0,steer:0};
  private seed:number;
  private errorUntil=0;
  private nextError=2;
  private error=0;
  private padIndex=-1;
  targetLane=0;
  readonly difficulty:AiDifficulty;
  constructor(difficulty:AiDifficulty, seed=0x4e4f5641) {this.seed=seed;this.difficulty=difficulty;}
  private random():number {this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/0x100000000;}
  update(track:RaceTrack,state:RaceState,dt:number,balls:readonly FallingFireball[]=[]):RaceControls {
    if(dt<=0 || !Number.isFinite(dt))return this.controls;
    const cfg=CONFIG[this.difficulty];
    this.wait-=dt;
    if(this.wait<=0) {
      this.wait=cfg.reaction;
      this.intent=this.plan(track,state,balls);
    }
    // Held inputs between decisions, with finite steering-wheel and pedal travel.
    const approach=(a:number,b:number,rate:number)=>a+clamp(b-a,-rate*dt,rate*dt);
    this.controls={throttle:approach(this.controls.throttle,this.intent.throttle,8),
      brake:approach(this.controls.brake,this.intent.brake,8),
      steer:approach(this.controls.steer,this.intent.steer,cfg.steering)};
    return this.controls;
  }
  private plan(track:RaceTrack,state:RaceState,balls:readonly FallingFireball[]):RaceControls {
    const cfg=CONFIG[this.difficulty];
    const curvatureAt=(d:number):number=>frameTurn(sampleTrack(track,d),sampleTrack(track,d+8))/8;
    const curvature=curvatureAt(state.distance);
    // Work backwards from each upcoming corner to its braking point. A distant
    // hairpin must not impose its corner speed on the whole preceding straight.
    const horizon=Math.max(650,state.speed*cfg.preview);
    const braking=state.boostRemaining>0?300:850;
    const latency=state.speed*(cfg.reaction+.16);
    let cornerSpeed=Infinity;
    for(let ahead=0;ahead<=horizon;ahead+=40) {
      const turn=Math.abs(curvatureAt(state.distance+ahead));
      const safe=cfg.corner/Math.max(.00001,turn);
      cornerSpeed=Math.min(cornerSpeed,Math.sqrt(safe*safe+2*braking*Math.max(0,ahead-latency)));
    }
    const padAhead=(index:number)=>((BOOST_PADS[index]!.progress*track.length-state.distance+BOOST_PAD_LENGTH/2+track.length)%track.length)-BOOST_PAD_LENGTH/2;
    // Commit until the rear edge, rather than abandoning the lane at pad centre.
    if(this.padIndex>=0 && (padAhead(this.padIndex)>horizon*2 || state.collisionCooldown>0))this.padIndex=-1;
    if(this.padIndex<0) {
      let nearest=Infinity;
      for(let i=0;i<BOOST_PADS.length;i++) {
        const pad=BOOST_PADS[i]!,ahead=padAhead(i);
        const travel=Math.max(250,state.speed);
        const laneTime=Math.abs(pad.lateral-state.lateral)/(travel*cfg.laneRate)+cfg.reaction+.18;
        const reachable=ahead+BOOST_PAD_LENGTH/2>=travel*laneTime;
        if(ahead<0 || ahead>=Math.max(600,state.speed*cfg.padLook) || ahead>=nearest || !reachable)continue;
        // A pad immediately before a hairpin forces an entry-speed jump. Plan
        // the boosted exit as well as the entry, instead of blindly chasing it.
        let exitTurn=0;
        for(let offset=-120;offset<=600;offset+=40)exitTurn=Math.max(exitTurn,Math.abs(curvatureAt(state.distance+ahead+offset)));
        if(exitTurn*Math.max(1000,state.speed)<cfg.corner*.9) {
          this.padIndex=i;nearest=ahead;
        }
      }
    }
    this.targetLane=this.padIndex>=0?BOOST_PADS[this.padIndex]!.lateral:0;
    for(const ball of balls) {
      const ahead=(ball.distance-state.distance+track.length)%track.length;
      const arrival=ahead/Math.max(100,state.speed);
      if(ahead<Math.max(400,state.speed*cfg.padLook) && ball.age+arrival>ball.fallTime-.2 && ball.age+arrival<ball.fallTime+.95 && Math.abs(this.targetLane-ball.lateral)<ball.radius+20) {
        this.targetLane=ball.lateral>=0?-55:55;this.padIndex=-1;
      }
    }
    if(state.elapsed>=this.nextError && Math.abs(curvature)*state.speed>.12) {
      this.errorUntil=state.elapsed+.55+this.random()*.45;
      this.error=cfg.error*(.8+this.random()*.4);
      this.nextError=state.elapsed+cfg.period*(.8+this.random()*.5);
    }
    const miss=state.elapsed<this.errorUntil?this.error:0;
    // Feed forward the turn, then correct heading and lateral drift. The drift
    // term anticipates the integrator's lateral inertia during fast lane changes.
    const desiredHeading=clamp(Math.atan2(this.targetLane-state.lateral-state.lateralSpeed*.07,Math.max(140,state.speed*cfg.tracking)),-.2,.2);
    const wantedYaw=miss>0 ? curvature*state.speed*(1-miss)-state.headingOffset*.3
      : curvature*state.speed+(desiredHeading-state.headingOffset)*5;
    const steer=clamp(wantedYaw/steeringYawRate(state.speed),-1,1);
    // All drivers use the player's full engine/boost range. Let excess boost
    // momentum decay through the shared physics; brake only for an actual corner.
    const ceiling=state.boostRemaining>0?BOOST_MAX_SPEED:CRUISE_MAX_SPEED;
    const excess=state.speed-cornerSpeed;
    const brake=excess>12?clamp(excess/95,0,1):0;
    const throttle=brake>0?0:cornerSpeed<ceiling && state.speed>cornerSpeed-25?clamp((cornerSpeed-state.speed)/25,0,1):1;
    return {throttle,brake,steer};
  }
}
