function difference(before,after,region) {
  if(before.width!==after.width||before.height!==after.height)throw Error('Glass Rush reference viewports differ');
  const {cx,cy,radius,circular}=region;let changed=0,total=0,samples=0;
  for(let y=Math.max(0,Math.floor(cy-radius));y<=Math.min(before.height-1,Math.ceil(cy+radius));y++){
    for(let x=Math.max(0,Math.floor(cx-radius));x<=Math.min(before.width-1,Math.ceil(cx+radius));x++){
      if(circular&&Math.hypot(x-cx,y-cy)>radius)continue;
      const offset=(y*before.width+x)*4;let pixel=false;
      for(let c=0;c<3;c++){const delta=Math.abs(before.data[offset+c]-after.data[offset+c]);if(!Number.isFinite(delta))throw Error('Incomplete Glass Rush pixels');total+=delta;samples++;pixel ||= delta>1;}
      if(pixel)changed++;
    }
  }
  if(!samples)throw Error('Glass Rush reference region is empty');
  return {changed,mean:total/samples};
}
// Fixture: distance=0, gate depth=60; the complete far cross-section is behind the first bend.
export function verifyOpaqueBend(before,after) {
  const result=difference(before,after,{cx:before.width/2+.3307341775818553*before.height/2,cy:before.height/2-.30388468826331205*before.height/2,radius:before.height*.048,circular:false});
  if(result.changed)throw Error(`Far obstacle leaked through the opaque bend (${result.changed} pixels)`);
  return result.changed;
}
// Restrict the comparison to the sphere interior: HUD and background animation cannot pass this gate.
export function verifyBallHueShift(before,after) {
  const result=difference(before,after,{cx:before.width/2,cy:before.height*.825,radius:before.height*.025,circular:true});
  if(result.mean<25)throw Error(`Ball shader color change is too subtle (${result.mean.toFixed(2)})`);
  return result.mean;
}
