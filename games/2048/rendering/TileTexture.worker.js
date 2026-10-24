// Game-specific raster baker. The upper atlas half is numbered; the lower half is plain metal.
// Pixel processing runs off the gameplay thread. Exported math is also checked in Node.
export const TILE_TEXTURE_SIZE = 256;

/** Distance inside the glyph creates a broad, smooth recessed bevel, rather than a text shadow. */
export function engravedRelief(mask, width, height, bevel = 12, depth = 12) {
  if (mask.length !== width * height) throw new RangeError('Glyph mask dimensions do not match.');
  const distance = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) distance[i] = mask[i] > 127 ? width + height : 0;
  const diagonal = Math.SQRT2;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!distance[i]) continue;
    if (!x || !y || x === width - 1 || y === height - 1) { distance[i] = 0; continue; }
    distance[i] = Math.min(distance[i], distance[i - 1] + 1, distance[i - width] + 1, distance[i - width - 1] + diagonal, distance[i - width + 1] + diagonal);
  }
  for (let y = height - 2; y >= 1; y--) for (let x = width - 2; x >= 1; x--) {
    const i = y * width + x;
    distance[i] = Math.min(distance[i], distance[i + 1] + 1, distance[i + width] + 1, distance[i + width + 1] + diagonal, distance[i + width - 1] + diagonal);
  }
  const heights = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    const t = Math.min(1, (distance[i] + mask[i] / 255 * 0.4) / bevel);
    heights[i] = -depth * t * t * (3 - 2 * t);
  }
  const normal = new Uint8ClampedArray(mask.length * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    const dx = (heights[y * width + Math.min(width - 1, x + 1)] - heights[y * width + Math.max(0, x - 1)]) * 0.5;
    const dy = (heights[Math.min(height - 1, y + 1) * width + x] - heights[Math.max(0, y - 1) * width + x]) * 0.5;
    const length = Math.hypot(dx, dy, 1);
    normal[i * 4] = (-dx / length + 1) * 127.5;
    // Texture V follows image rows. Engine reconstructs the signed tangent frame from UVs.
    normal[i * 4 + 1] = (dy / length + 1) * 127.5;
    normal[i * 4 + 2] = (1 / length + 1) * 127.5;
    normal[i * 4 + 3] = 255;
  }
  return { normal, heights, distance };
}

function canvas(width, height) {
  const image = new OffscreenCanvas(width, height), context = image.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('2048 tile baking requires OffscreenCanvas 2D.');
  return { image, context };
}

function bakeTile(metal, value, tint) {
  const size = TILE_TEXTURE_SIZE, glyph = canvas(size, size), albedo = canvas(size, size * 2);
  glyph.context.fillStyle = '#ffffff';
  const text = String(value);
  let fontSize = size * 0.53;
  glyph.context.font = `900 ${fontSize}px Arial, sans-serif`;
  fontSize *= Math.min(1, size * 0.72 / glyph.context.measureText(text).width);
  glyph.context.font = `900 ${fontSize}px Arial, sans-serif`;
  glyph.context.textAlign = 'center';
  const metrics = glyph.context.measureText(text);
  const baseline = size / 2 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
  glyph.context.fillText(text, size / 2, baseline);
  const pixels = glyph.context.getImageData(0, 0, size, size).data;
  const mask = new Uint8Array(size * size);
  for (let i = 0; i < mask.length; i++) mask[i] = pixels[i * 4 + 3];
  const bevelWidth = size * 0.0234375;
  const relief = engravedRelief(mask, size, size, bevelWidth, bevelWidth);
  for (let half = 0; half < 2; half++) albedo.context.drawImage(metal, 0, half * size, size, size);
  albedo.context.globalCompositeOperation = 'multiply';
  albedo.context.fillStyle = tint; albedo.context.fillRect(0, 0, size, size * 2);
  albedo.context.globalCompositeOperation = 'source-over';
  const colorPixels = albedo.context.getImageData(0, 0, size, size * 2);
  const normalPixels = new Uint8ClampedArray(size * size * 2 * 4);
  const roughPixels = new Uint8ClampedArray(normalPixels.length);
  for (let y = 0; y < size * 2; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, offset = i * 4, numbered = y < size;
    const coverage = numbered ? mask[i] / 255 : 0;
    const bevel = numbered ? Math.min(1, relief.distance[i] / bevelWidth) : 0;
    if (coverage > 0) {
      // A dark machined pocket and a brighter cut lip retain contrast on both steel and gold.
      const pocket = 0.22 + (1 - bevel) * 1.03;
      for (let c = 0; c < 3; c++) colorPixels.data[offset + c] *= 1 - coverage + coverage * pocket;
    }
    const groove = Math.cos(y * Math.PI * 2 * 43 / size) * 0.025;
    normalPixels[offset] = numbered ? relief.normal[offset] : 128;
    normalPixels[offset + 1] = (numbered ? relief.normal[offset + 1] : 128) + groove * 127;
    normalPixels[offset + 2] = numbered ? relief.normal[offset + 2] : 255;
    normalPixels[offset + 3] = 255;
    roughPixels[offset] = 255;
    roughPixels[offset + 1] = coverage > 0 ? 155 + bevel * 55 : 100 + groove * 150;
    roughPixels[offset + 2] = coverage > 0 ? 205 : 245;
    roughPixels[offset + 3] = 255;
  }
  albedo.context.putImageData(colorPixels, 0, 0);
  const normal = canvas(size, size * 2), roughness = canvas(size, size * 2);
  normal.context.putImageData(new ImageData(normalPixels, size, size * 2), 0, 0);
  roughness.context.putImageData(new ImageData(roughPixels, size, size * 2), 0, 0);
  return { albedo: albedo.image.transferToImageBitmap(), normal: normal.image.transferToImageBitmap(), roughness: roughness.image.transferToImageBitmap() };
}

if (typeof self !== 'undefined') {
  let metal;
  self.onmessage = event => {
    const request = event.data;
    try {
      if (request.type === 'init') { metal = request.metal; self.postMessage({ id: request.id }); return; }
      if (request.type !== 'bake' || !metal || !Number.isSafeInteger(request.value) || request.value < 2) throw new Error('Invalid 2048 tile texture request.');
      const maps = bakeTile(metal, request.value, request.tint);
      self.postMessage({ id: request.id, maps }, [maps.albedo, maps.normal, maps.roughness]);
    } catch (error) { self.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) }); }
  };
}
