import type { HostedEngine } from './types';

export function presentGameFrame(engine: HostedEngine, texture: GPUTexture): HTMLCanvasElement {
  const canvas = engine.canvas;
  if (!canvas) throw new Error('The game has no presentation canvas.');
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('The game has no WebGPU presentation context.');
  let target = context.getCurrentTexture();
  if (!(target.usage & GPUTextureUsage.COPY_DST)) {
    context.configure({ device: engine.device, format: texture.format, alphaMode: 'premultiplied', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST });
    target = context.getCurrentTexture();
  }
  const encoder = engine.device.createCommandEncoder({ label: 'Game RTT presentation bridge' });
  encoder.copyTextureToTexture({ texture }, { texture: target }, [Math.min(texture.width, target.width), Math.min(texture.height, target.height)]);
  engine.device.queue.submit([encoder.finish()]);
  return canvas;
}
