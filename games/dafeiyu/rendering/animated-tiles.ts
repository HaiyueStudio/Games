import type { IndexedSpritePlaneDescriptor } from '@haiyue/extensions/experimental/indexed-sprite';

export const ambientFrames = 8;
export const ambientFrameTime = 135;
export const animatedTiles = new Set(['water', 'flag', 'island/swell']);
export const waterNeighbors = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
const tau = 2 * Math.PI;

export function ambientFrameId(id: string, frame: number): string {
  return frame ? `${id}/${frame}` : id;
}

export function canvas(width: number, height: number): CanvasRenderingContext2D {
  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  const ctx = surface.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw Error('Canvas 2D is unavailable');
  return ctx;
}

export function plane(id: string, ctx: CanvasRenderingContext2D): IndexedSpritePlaneDescriptor {
  const { width, height } = ctx.canvas;
  return { id, width, height, format: 'rgba8', pixels: new Uint8Array(ctx.getImageData(0, 0, width, height).data) };
}

function waterSurface(ctx: CanvasRenderingContext2D, phase: number): void {
  const size = ctx.canvas.width;
  const pixels = ctx.createImageData(size, size);
  // Integer spatial frequencies make opposite edges continue into the next square.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) * tau / size, v = (y + .5) * tau / size;
    const swell = .5 + .5 * Math.sin(u - v - phase);
    const ripple = .5 + .5 * Math.cos(2 * v + .65 * Math.sin(u - phase) + .38 * Math.sin(2 * u + v + phase));
    const reflected = .5 + .5 * Math.sin(2 * u - v + phase);
    const foam = ripple ** 6 * (.32 + .68 * reflected);
    const i = 4 * (y * size + x);
    pixels.data[i] = 13 + 11 * swell + 57 * foam;
    pixels.data[i + 1] = 83 + 22 * swell + 69 * foam;
    pixels.data[i + 2] = 125 + 18 * swell + 65 * foam;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
}

function waterRims(): IndexedSpritePlaneDescriptor[] {
  const size = 64;
  const ctx = canvas(size, size);
  const edge = (side: number, offset: number, thickness: number) => {
    if (side === 0) ctx.fillRect(0, offset, size, thickness);
    else if (side === 1) ctx.fillRect(size - offset - thickness, 0, thickness, size);
    else if (side === 2) ctx.fillRect(0, size - offset - thickness, size, thickness);
    else ctx.fillRect(offset, 0, thickness, size);
  };
  return Array.from({ length: 15 }, (_, index) => {
    const mask = index + 1;
    ctx.clearRect(0, 0, size, size);
    for (const side of waterNeighbors.keys()) if (mask & (1 << side)) {
      ctx.fillStyle = '#07374dd8';
      edge(side, 0, 2);
      ctx.fillStyle = side === 0 || side === 3 ? '#87dff29c' : '#61c6e56e';
      edge(side, 2, 2);
    }
    return plane(`water/rim/${mask}`, ctx);
  });
}

export function animatedTileArt(flag: IndexedSpritePlaneDescriptor): IndexedSpritePlaneDescriptor[] {
  const source = canvas(flag.width, flag.height);
  const pixels = source.createImageData(flag.width, flag.height);
  pixels.data.set(flag.pixels);
  source.putImageData(pixels, 0, 0);
  const waving = canvas(flag.width, flag.height);
  const water = canvas(96, 96);
  const sea = canvas(64, 32);
  const art = waterRims();

  for (let frame = 0; frame < ambientFrames; frame++) {
    const phase = frame * tau / ambientFrames;
    waterSurface(water, phase);
    art.push(plane(ambientFrameId('water', frame), water));
    waving.clearRect(0, 0, flag.width, flag.height);
    for (let x = 0; x < flag.width; x++) {
      // The pole and stand keep the original anchor while the cloth tip follows the wave.
      const cloth = Math.max(0, (x / flag.width - .40) / .60);
      const dy = Math.sin(phase - cloth * 4) * cloth * flag.height * .09;
      waving.drawImage(source.canvas, x, 0, 1, flag.height, x, dy, 1, flag.height);
    }
    art.push(plane(ambientFrameId('flag', frame), waving));
    sea.clearRect(0, 0, 64, 32);
    const wave = Math.sin(phase) * 3;
    sea.beginPath(); sea.moveTo(6, 15 + wave);
    sea.quadraticCurveTo(14, 8 - wave, 24, 15);
    sea.quadraticCurveTo(32, 21 + wave, 42, 14);
    sea.quadraticCurveTo(50, 8 - wave, 58, 13 + wave);
    sea.strokeStyle = '#fff'; sea.lineWidth = 3; sea.lineCap = 'round'; sea.stroke();
    art.push(plane(ambientFrameId('island/swell', frame), sea));
  }
  return art;
}
