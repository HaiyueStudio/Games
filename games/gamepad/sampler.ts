// Deliberately isolated local candidate: experimental public input API, no renderer coupling.
import { BrowserMultiplayerInput, type InputActionMapDescriptor } from '@haiyue/engine-gamepad/experimental/simulation';
export interface PadFrame { index:number; values:Readonly<Record<string,number>>; pressed:ReadonlySet<string>; held:ReadonlySet<string> }
/** A held control may never cross connection, focus, or scene boundaries. */
export class NeutralGate {
  private ready = new Set<number>();
  reset(): void { this.ready.clear(); }
  filter(frames: readonly PadFrame[]): PadFrame[] {
    for (const index of this.ready) if (!frames.some(p => p.index === index)) this.ready.delete(index);
    return frames.filter(p => {
      if (!this.ready.has(p.index) && Object.values(p.values).every(v => Math.abs(v) < .25)) this.ready.add(p.index);
      return this.ready.has(p.index);
    });
  }
}
const bindings:InputActionMapDescriptor={
  x:{gamepadAxes:[{axis:0,direction:'both',deadZone:.2}]},y:{gamepadAxes:[{axis:1,direction:'both',deadZone:.2}]},
  rx:{gamepadAxes:[{axis:2,direction:'both',deadZone:.2}]},ry:{gamepadAxes:[{axis:3,direction:'both',deadZone:.2}]},
  ...Object.fromEntries(Array.from({length:17},(_,i)=>[`b${i}`,{gamepadButtons:[i]}])),
};
export class GamepadSampler {
  private readonly input:BrowserMultiplayerInput;
  private devices: ReturnType<Navigator['getGamepads']> = [];
  private sampling = false;
  private readonly getGamepads:()=>ReturnType<Navigator['getGamepads']>;
  constructor(getGamepads=()=>navigator.getGamepads(),target:EventTarget=window,visibility:EventTarget & {hidden?:boolean}=document){
    this.getGamepads=getGamepads;
    this.input=new BrowserMultiplayerInput({players:Array.from({length:4},(_,i)=>({id:`P${i+1}`,gamepadIndex:i,bindings})),getGamepads:()=>this.devices,eventTarget:target,visibilityTarget:visibility,actionThreshold:.25});
  }
  sample(devices=this.getGamepads()):PadFrame[]{
    if(this.input.disposed)throw new Error('Gamepad sampler has been disposed.');
    this.devices=devices;
    if(this.input.suspended||!devices.some((p,i)=>i<4&&p?.connected)){
      // No keyboard/pointer bindings exist here. Keep polling for hot-plugging, but avoid
      // constructing and hashing four neutral simulation snapshots on every idle frame.
      if(this.sampling){this.input.reset();this.sampling=false;}
      return [];
    }
    this.sampling=true;
    return this.input.sample(this.input.tick+1).players.map((p,index)=>({index,values:Object.fromEntries(p.actions.map(a=>[a.action,a.value])),pressed:new Set(p.actions.filter(a=>a.pressed).map(a=>a.action)),held:new Set(p.actions.filter(a=>a.held).map(a=>a.action))}));
  }
  dispose():void{this.input.dispose();}
}

