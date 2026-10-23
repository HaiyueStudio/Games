/** The installed GUI queues native events until the next render. Touch pointers may
 * already have ended by then; guard only stale capture calls on this owned canvas.
 * Real live pointers still use native capture, including simultaneous touch input. */
export function guardQueuedPointerCapture(canvas: HTMLCanvasElement): () => void {
  const active = new Set<number>();
  const abort = new AbortController();
  const descriptors = new Map(['setPointerCapture', 'releasePointerCapture'].map(key => [key, Object.getOwnPropertyDescriptor(canvas, key)]));
  const capture = canvas.setPointerCapture.bind(canvas);
  const release = canvas.releasePointerCapture.bind(canvas);
  canvas.addEventListener('pointerdown', e => active.add(e.pointerId), { signal: abort.signal, capture: true });
  const end = (e: PointerEvent) => { active.delete(e.pointerId); };
  canvas.addEventListener('pointerup', end, { signal: abort.signal, capture: true });
  canvas.addEventListener('pointercancel', end, { signal: abort.signal, capture: true });
  // Also observe releases outside the canvas when an empty GUI region did not capture.
  canvas.ownerDocument?.addEventListener('pointerup', end, { signal: abort.signal, capture: true });
  canvas.ownerDocument?.addEventListener('pointercancel', end, { signal: abort.signal, capture: true });
  canvas.setPointerCapture = id => { if (active.has(id)) capture(id); };
  // A queued pointerup must not release a newer gesture reusing the same ID.
  canvas.releasePointerCapture = id => { if (!active.has(id) && canvas.hasPointerCapture(id)) release(id); };
  return () => {
    for (const id of active) if (canvas.hasPointerCapture(id)) release(id);
    abort.abort(); active.clear();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(canvas, key, descriptor); else Reflect.deleteProperty(canvas, key);
    }
  };
}
