import { cross, dot, mixAxes, type RaceTrack, type RacePose, type TrackVector } from './RaceRules';

/** A bounding sphere preserves height and uses one scale through every orientation. */
export function hudMapProjection(track: RaceTrack) {
  const center = ['x','y','z'].map(axis => {
    const values=track.samples.map(p=>p[axis as 'x'|'y'|'z']);
    return (Math.min(...values)+Math.max(...values))/2;
  }) as [number,number,number];
  const radius=Math.max(1,...track.samples.map(p=>Math.hypot(p.x-center[0],p.y-center[1],p.z-center[2])));
  return {center,scale:.33/radius};
}
/** Full attitude, with a fixed oblique viewing angle in vehicle space. No Euler
 * bearing extraction, pole threshold or sign flip at inverted road sections. */
export function hudMapBasis(pose: RacePose) {
  const h=pose.heading,p=pose.pitch,b=pose.bank;
  const f=pose.frame?.forward ?? [Math.sin(h)*Math.cos(p),Math.sin(p),Math.cos(h)*Math.cos(p)] as TrackVector;
  const baseRight:TrackVector=[Math.cos(h),0,-Math.sin(h)];
  const r=pose.frame?.right ?? mixAxes(baseRight,cross(f,baseRight),Math.cos(b),Math.sin(b));
  const u=pose.frame?.up ?? cross(f,r);
  return {right:mixAxes(r,r,-1,0),up:mixAxes(f,u,.866025403784,.5),depth:mixAxes(u,f,.866025403784,-.5)};
}
export function hudMapPoint(projection: ReturnType<typeof hudMapProjection>, point: {x:number;y:number;z:number}, basis:ReturnType<typeof hudMapBasis>) {
  const d:TrackVector=[point.x-projection.center[0],point.y-projection.center[1],point.z-projection.center[2]];
  return {x:.5+dot(d,basis.right)*projection.scale,y:.5-dot(d,basis.up)*projection.scale,depth:dot(d,basis.depth)*projection.scale};
}

export interface HudRect { x: number; y: number; width: number; height: number }
export function raceHudLayout(view: HudRect, mobile: boolean) {
  const base = (view.width < 760 ? 144 : view.height < 550 ? 174 : 232) * .8;
  const size = Math.min(base, view.width < 600 ? (view.width - 154.667) / (1831 / 859) : Infinity);
  // Native safe-area padding leaves room for the requested 25-point move.
  const x = mobile ? Math.max(-view.x, -25) : 0;
  const y = (view.width < 600 ? 34 : 0) + (mobile ? 5 : 0);
  const compassHeight = view.width < 600 ? Math.max(110, size * .8) : size;
  const compassWidth = compassHeight * 4 / 3;
  return {
    dial: { x, y, width: size, height: size },
    instruments: { x, y, width: size * 1831 / 859, height: size * 1831 / 859 / 2 },
    stats: { x: x + size * 1.02, y: y + size * .19, width: size * 1.00, height: size * .40 },
    compass: { x: view.width - compassWidth, y: 0, width: compassWidth, height: compassHeight },
  };
}
