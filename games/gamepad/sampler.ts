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
  constructor(getGamepads=()=>navigator.getGamepads(),target:EventTarget=window,visibility:EventTarget & {hidden?:boolean}=document){
    this.input=new BrowserMultiplayerInput({players:Array.from({length:4},(_,i)=>({id:`P${i+1}`,gamepadIndex:i,bindings})),getGamepads,eventTarget:target,visibilityTarget:visibility,actionThreshold:.25});
  }
  sample():PadFrame[]{return this.input.sample(this.input.tick+1).players.map((p,index)=>({index,values:Object.fromEntries(p.actions.map(a=>[a.action,a.value])),pressed:new Set(p.actions.filter(a=>a.pressed).map(a=>a.action)),held:new Set(p.actions.filter(a=>a.held).map(a=>a.action))}));}
  dispose():void{this.input.dispose();}
}

