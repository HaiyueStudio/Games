import type { Camera3D, HaiyueEngine, World } from '@haiyue/engine';

/** Keep a board's horizontal framing when a perspective viewport becomes narrow. */
export function fitPerspectiveCamera(engine: HaiyueEngine, world: World, camera: Camera3D, referenceAspect = 1.5): void {
  const baseFov = camera.fov;
  const resize = () => {
    const aspect = engine.displayWidth / Math.max(1, engine.displayHeight);
    camera.fov = 2 * Math.atan(Math.tan(baseFov / 2) * Math.max(1, referenceAspect / aspect));
  };
  engine.on('resize', resize); resize();
  world.addRuntimeIntegration({ onDetach: () => { engine.off('resize', resize); } });
}
