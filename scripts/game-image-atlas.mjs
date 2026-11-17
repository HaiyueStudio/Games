import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { decodePng, encodePng } from './png-rgba.mjs';

export const atlasConfigFile = 'atlas.config.json';
export const atlasOutputFile = 'assets/atlas.build.png';
const importId = 'virtual:game-image-atlas';
const internalId = '\0' + importId;

export function gameImageAtlasUrl(png) {
  const hash = createHash('sha256').update(png).digest('hex').slice(0, 16);
  return `./${atlasOutputFile}?v=${hash}`;
}

function readConfig(file) {
  const config = JSON.parse(readFileSync(file, 'utf8'));
  if (!Number.isInteger(config.maxSize) || config.maxSize < 16 || config.maxSize > 4096 ||
      !Array.isArray(config.images) || config.images.length === 0) throw Error(`Invalid image atlas configuration: ${file}`);
  const seen = new Set();
  for (const { source, width } of config.images) {
    if (typeof source !== 'string' || !/^[\w.-]+(?:\/[\w.-]+)*\.png$/i.test(source) || source.split('/').some(part => part === '..' || part === '.') ||
        source === 'atlas.build.png' || seen.has(source) || width !== undefined && (!Number.isInteger(width) || width < 1)) {
      throw Error(`Invalid or duplicate atlas image ${source} in ${file}`);
    }
    seen.add(source);
  }
  for (const [source, hash] of Object.entries(config.backgrounds ?? {})) {
    if (!/^[\w-]+\.png$/.test(source) || !/^[a-f0-9]{64}$/.test(hash)) throw Error(`Invalid background ${source} in ${file}`);
  }
  return config;
}

// Area averaging in premultiplied alpha keeps dark or colorful transparent edges out of smaller sprites.
function resize(image, width = image.width) {
  if (width >= image.width) return image;
  const height = Math.max(1, Math.round(image.height * width / image.width));
  const scaleX = image.width / width, scaleY = image.height / height;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const top = y * scaleY, bottom = (y + 1) * scaleY, left = x * scaleX, right = (x + 1) * scaleX;
    let red = 0, green = 0, blue = 0, opacity = 0;
    for (let row = Math.floor(top); row < Math.min(image.height, Math.ceil(bottom)); row++) {
      const weightY = Math.min(bottom, row + 1) - Math.max(top, row);
      for (let col = Math.floor(left); col < Math.min(image.width, Math.ceil(right)); col++) {
        const weight = weightY * (Math.min(right, col + 1) - Math.max(left, col));
        const i = (row * image.width + col) * 4, alpha = image.data[i + 3] * weight;
        opacity += alpha; red += image.data[i] * alpha; green += image.data[i + 1] * alpha; blue += image.data[i + 2] * alpha;
      }
    }
    const i = (y * width + x) * 4;
    const alpha = Math.round(opacity / (scaleX * scaleY));
    if (alpha) {
      data[i] = Math.round(red / opacity); data[i + 1] = Math.round(green / opacity); data[i + 2] = Math.round(blue / opacity);
      data[i + 3] = alpha;
    }
  }
  return { width, height, data };
}

export function buildGameImageAtlas(file) {
  const { maxSize, images, backgrounds = {} } = readConfig(file);
  const assets = resolve(dirname(file), 'assets');
  const sources = images.map(({ source, width }) => {
    const path = resolve(assets, source);
    try { return { source, ...resize(decodePng(readFileSync(path)), width) }; }
    catch (error) { throw Error(`Cannot pack atlas image ${path}: ${error.message}`, { cause: error }); }
  }).sort((a, b) => b.height - a.height || b.width - a.width);
  const frames = Object.create(null);
  let x = 0, y = 0, shelfHeight = 0, width = 0;
  for (const image of sources) {
    const w = image.width + 2, h = image.height + 2;
    if (w > maxSize || h > maxSize) throw Error(`Atlas image ${image.source} exceeds the ${maxSize}px limit.`);
    if (x + w > maxSize) { x = 0; y += shelfHeight; shelfHeight = 0; }
    if (y + h > maxSize) throw Error(`Images in ${file} exceed one ${maxSize}×${maxSize} atlas.`);
    frames[image.source] = { x: x + 1, y: y + 1, width: image.width, height: image.height };
    x += w;
    width = Math.max(width, x);
    shelfHeight = Math.max(shelfHeight, h);
  }
  const height = y + shelfHeight;
  const data = Buffer.alloc(width * height * 4);
  for (const image of sources) {
    const frame = frames[image.source], stride = image.width * 4;
    for (let row = 0; row < image.height; row++) {
      image.data.copy(data, ((frame.y + row) * width + frame.x) * 4, row * stride, (row + 1) * stride);
    }
  }
  const png = encodePng({ width, height, data });
  const optimized = Object.create(null);
  for (const [source, hash] of Object.entries(backgrounds)) {
    const webp = source.replace(/\.png$/, '.webp');
    if (existsSync(resolve(assets, webp)) && createHash('sha256').update(readFileSync(resolve(assets, source))).digest('hex') === hash) {
      optimized[source] = webp;
    }
  }
  return { png, info: { url: gameImageAtlasUrl(png), frames, backgrounds: optimized } };
}

export function gameImageAtlasPlugin(file, loose = false) {
  return {
    name: 'game-image-atlas',
    resolveId(id) { return id === importId ? internalId : undefined; },
    load(id) {
      if (id !== internalId) return undefined;
      this.addWatchFile(file);
      if (loose) return 'export default null;';
      const config = readConfig(file);
      for (const { source } of config.images) this.addWatchFile(resolve(dirname(file), 'assets', source));
      for (const source of Object.keys(config.backgrounds ?? {})) {
        this.addWatchFile(resolve(dirname(file), 'assets', source));
        this.addWatchFile(resolve(dirname(file), 'assets', source.replace(/\.png$/, '.webp')));
      }
      const { png, info } = buildGameImageAtlas(file);
      this.emitFile({ type: 'asset', fileName: atlasOutputFile, source: png });
      return `export default ${JSON.stringify(info)};`;
    },
  };
}
