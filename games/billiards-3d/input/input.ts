export function projectToScreen(
  x: number,
  y: number,
  z: number,
  viewProj: Float32Array,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number; behind: boolean } {
  if (viewProj.length < 16) throw new RangeError('Billiards view projection must contain 16 values.');
  const cx = viewProj[0]! * x + viewProj[4]! * y + viewProj[8]! * z + viewProj[12]!;
  const cy = viewProj[1]! * x + viewProj[5]! * y + viewProj[9]! * z + viewProj[13]!;
  const cw = viewProj[3]! * x + viewProj[7]! * y + viewProj[11]! * z + viewProj[15]!;
  return {
    x: (cx / cw + 1) * 0.5 * viewportWidth,
    y: (1 - cy / cw) * 0.5 * viewportHeight,
    behind: cw < 0,
  };
}
