/**
 * Compatibility boundary for the installed Haiyue 0.1 GUI: it drains native
 * events on the next frame, when a touch pointer may no longer be active.
 * Keep browser capture calls valid on this canvas only. Remove with the host.
 */
export function guardDeferredPointerCapture(canvas: HTMLCanvasElement, signal: AbortSignal): void {
  const active = new Set<number>();
  const set = canvas.setPointerCapture.bind(canvas), release = canvas.releasePointerCapture.bind(canvas);
  const previousSet = Object.getOwnPropertyDescriptor(canvas,'setPointerCapture');
  const previousRelease = Object.getOwnPropertyDescriptor(canvas,'releasePointerCapture');
  canvas.addEventListener('pointerdown',e=>active.add(e.pointerId),{capture:true,signal});
  for (const type of ['pointerup','pointercancel'] as const) {
    canvas.addEventListener(type,e=>active.delete(e.pointerId),{capture:true,signal});
  }
  Object.defineProperty(canvas,'setPointerCapture',{configurable:true,value:(id:number)=>{
    if (active.has(id)) set(id);
  }});
  Object.defineProperty(canvas,'releasePointerCapture',{configurable:true,value:(id:number)=>{
    if (canvas.hasPointerCapture(id)) release(id);
  }});
  signal.addEventListener('abort',()=>{
    for (const id of active) if (canvas.hasPointerCapture(id)) release(id);
    active.clear();
    if (previousSet) Object.defineProperty(canvas,'setPointerCapture',previousSet);
    else Reflect.deleteProperty(canvas,'setPointerCapture');
    if (previousRelease) Object.defineProperty(canvas,'releasePointerCapture',previousRelease);
    else Reflect.deleteProperty(canvas,'releasePointerCapture');
  },{once:true});
}
