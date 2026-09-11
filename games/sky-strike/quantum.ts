/** Quantum echoes have no independent health, reward or targetable collision body. */
export interface QuantumPose {x:number;y:number;rotation:number}
export function quantumPose(body:QuantumPose,centerX=240):QuantumPose {
  return {x:2*centerX-body.x,y:body.y,rotation:-body.rotation};
}
export function quantumPoint(point:{x:number;y:number},centerX=240):{x:number;y:number} {
  return {x:2*centerX-point.x,y:point.y};
}
export const QUANTUM_GUN_MOUNTS=[[-.246,-.21],[.246,-.21],[-.251,-.069],[.251,-.069],[-.255,.062],[.255,.062]] as const;
export function quantumHardpoint(body:QuantumPose,size:number,dx:number,dy:number):{x:number;y:number} {
  const c=Math.cos(body.rotation),s=Math.sin(body.rotation);
  return {x:body.x+(c*dx-s*dy)*size,y:body.y+(s*dx+c*dy)*size};
}
/** A seeded-time, bounded scan pulse; no per-frame texture allocation or random state. */
export function quantumGlitch(ageMs:number,phase=0):{offset:number;opacity:number;scan:number} {
  const tick=Math.floor(ageMs/80+phase*17),burst=tick%19<3;
  return {offset:burst?Math.sin(tick*13.7)*8:0,opacity:burst?.27:.43+.05*Math.sin(ageMs*.004+phase),scan:((ageMs*.00035+phase)%1+1)%1};
}

/** Mounts follow the echo's counter-rotating hull, rather than sliding across its sprite. */
export function quantumAttachment(body:QuantumPose,point:{x:number;y:number},centerX=240):{x:number;y:number} {
  const dx=point.x-body.x,dy=point.y-body.y,c=Math.cos(body.rotation),s=Math.sin(body.rotation);
  return quantumHardpoint(quantumPose(body,centerX),1,-c*dx-s*dy,-s*dx+c*dy);
}
export function quantumVelocity(vx:number,vy:number):{x:number;y:number} {
  return {x:-vx,y:vy};
}
/** Sweep across both halves in 12.6 seconds, easing at each edge of the visible field. */
export function quantumBossX(centerX:number,ageMs:number,visibleWidth=480):number {
  const reach=Math.max(0,Math.min(140,visibleWidth*.29));
  return centerX-Math.cos(ageMs*.0005)*reach;
}

/** Cached holographic material pixels, preserving the source silhouette and armor lighting. */
export function quantumPixels(source:Uint8Array):Uint8Array {
  const pixels=new Uint8Array(source.length);
  for(let i=0;i<source.length;i+=4){
    const light=Math.min(255,45+Math.max(source[i]!,source[i+1]!,source[i+2]!)*.85);
    pixels[i]=Math.round(light*.22);pixels[i+1]=Math.round(light*.66);pixels[i+2]=Math.round(light);pixels[i+3]=source[i+3]!;
  }
  return pixels;
}

export const QUANTUM_TURRET_SPRITE='assets/fx-quantum-turret.png';
/** Atlas measurements: head pivot is at (50%,60%), barrel tips at 3% height. */
export function quantumTurretPose(body:QuantumPose,size:number,index:number,angle:number,recoil=0) {
  const mount=QUANTUM_GUN_MOUNTS[index]!;
  const pivot=quantumHardpoint(body,size,mount[0],mount[1]);
  const drawSize=size*.158,dx=Math.cos(angle),dy=Math.sin(angle);
  return {pivot,angle,drawSize,center:{x:pivot.x+dx*(drawSize*.1-recoil),y:pivot.y+dy*(drawSize*.1-recoil)},
    muzzle:{x:pivot.x+dx*(drawSize*.57-recoil),y:pivot.y+dy*(drawSize*.57-recoil)}};
}
export function quantumCoreState(ageMs:number,health:number,maxHealth:number) {
  const critical=health/Math.max(1,maxHealth)<.35,periodMs=critical?420:2200;
  const pulse=.5-.5*Math.cos(Math.max(0,ageMs)/periodMs*Math.PI*2);
  return {critical,periodMs,intensity:.22+.78*pulse,color:critical?'#ff3538':'#ffd052'};
}
