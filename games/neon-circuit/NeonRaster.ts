/** Host-supplied 2D rasterization; all compositing and game rendering stay on WebGPU. */
export interface NeonRaster {
  canvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas;
  pixels(canvas: HTMLCanvasElement | OffscreenCanvas): Uint8Array;
  loadTexture(device: GPUDevice, name: string, size?: number): Promise<GPUTexture>;
}

export const browserNeonRaster: NeonRaster = {
  canvas: (width, height) => new OffscreenCanvas(width, height),
  pixels(canvas) {
    const data = (canvas.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, canvas.width, canvas.height).data;
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  },
  async loadTexture(device, name, size) {
    const response = await fetch(`./assets/${name}.png`);
    if (!response.ok) throw new Error(`Texture failed: ${name} (${response.status})`);
    const bitmap = await createImageBitmap(await response.blob(), { premultiplyAlpha: 'none', ...(size ? { resizeWidth: size, resizeHeight: size } : {}) });
    const texture = device.createTexture({ label: name, size: [bitmap.width, bitmap.height], format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    try { device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [bitmap.width, bitmap.height]); return texture; }
    catch (error) { texture.destroy(); throw error; }
    finally { bitmap.close(); }
  },
};

export function uploadNeonCanvas(device: GPUDevice, raster: NeonRaster, canvas: HTMLCanvasElement | OffscreenCanvas, texture?: GPUTexture, layer = 0): GPUTexture {
  const target = texture ?? device.createTexture({ label: 'NeonCircuit.raster', size: [canvas.width, canvas.height], format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  try {
    // Canvas 2.1.18's native binding reads named coordinates for texture origins.
    device.queue.writeTexture({ texture: target, origin: { x: 0, y: 0, z: layer } }, new Uint8Array(raster.pixels(canvas)), { bytesPerRow: canvas.width * 4 }, [canvas.width, canvas.height]);
    return target;
  } catch (error) { if (!texture) target.destroy(); throw error; }
}
