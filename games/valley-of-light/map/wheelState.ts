/** Local presentation state; availability is supplied by MapRuntime.canDrag. */
export const WHEEL_FOLD_DURATION=.36;
export interface WheelState {disabled:boolean;open:number;from:number;elapsed:number}
export const createWheelState=():WheelState=>({disabled:false,open:1,from:1,elapsed:WHEEL_FOLD_DURATION});
export function advanceWheelState(state:WheelState,disabled:boolean,delta:number):boolean {
  if(state.disabled!==disabled){state.disabled=disabled;state.from=state.open;state.elapsed=0;}
  const before=state.open;
  state.elapsed=Math.min(WHEEL_FOLD_DURATION,state.elapsed+(Number.isFinite(delta)?Math.max(0,delta):0));
  const t=state.elapsed/WHEEL_FOLD_DURATION,ease=t*t*(3-2*t),target=disabled?0:1;
  state.open=state.elapsed===WHEEL_FOLD_DURATION?target:state.from+(target-state.from)*ease;
  return state.open!==before;
}
export function wheelShape(open:number):{spokeLength:number;spokeCenter:number;gripCenter:number;gripSize:number} {
  const t=Math.max(0,Math.min(1,open)),spokeLength=.02+.38*t;
  return {spokeLength,spokeCenter:.27+spokeLength/2,gripCenter:.26+.5*t,gripSize:.1+.14*t};
}
