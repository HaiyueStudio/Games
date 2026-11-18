import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { decodePng, encodePng } from './png-rgba.mjs';

export const atlasConfigFile = 'atlas.config.json';
export const atlasOutputFile = 'assets/atlas.build.png';
const validAsset = (source, extension) => typeof source === 'string' &&
  /^[\w.-]+(?:\/[\w.-]+)*$/.test(source) && source.toLowerCase().endsWith(extension) &&
  source.split('/').every(part => part !== '..' && part !== '.');
const validSize = size => Number.isInteger(size) && size > 0;

export function gameImageAtlasUrl(png) {
  const hash = createHash('sha256').update(png).digest('hex').slice(0, 16);
  return `./${atlasOutputFile}?v=${hash}`;
}

function readConfig(file) {
  const config = JSON.parse(readFileSync(file, 'utf8'));
  if (!Number.isInteger(config.maxSize) || config.maxSize < 16 || config.maxSize > 4096 ||
      !Array.isArray(config.images) || config.images.length === 0) throw Error(`Invalid image atlas configuration: ${file}`);
  const seen = new Set();
  for (const { source, width, maxEdge, frameEdges = {} } of config.images) {
    if (!validAsset(source, '.png') || source === 'atlas.build.png' || seen.has(source) ||
        width !== undefined && !validSize(width) || maxEdge !== undefined && !validSize(maxEdge) ||
        Object.entries(frameEdges).some(([index, edge]) => !/^\d+$/.test(index) || !validSize(edge))) {
      throw Error(`Invalid or duplicate atlas image ${source} in ${file}`);
    }
    seen.add(source);
  }
  for (const [source, hash] of Object.entries(config.backgrounds ?? {})) {
    if (!/^[\w-]+\.png$/.test(source) || !/^[a-f0-9]{64}$/.test(hash)) throw Error(`Invalid background ${source} in ${file}`);
  }
  if (config.frameMap !== undefined && !validAsset(config.frameMap, '.json') ||
      config.inlineSvg !== undefined && (!Array.isArray(config.inlineSvg) || config.inlineSvg.some(source => !validAsset(source, '.svg')))) {
    throw Error(`Invalid atlas metadata configuration: ${file}`);
  }
  return config;
}

// Area averaging in premultiplied alpha keeps dark or colorful transparent edges out of smaller sprites.
function resize(image, width = image.width, height = Math.max(1, Math.round(image.height * width / image.width))) {
  if (width >= image.width && height >= image.height) return image;
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

function sliceFrames(image, group, rectangles, maxEdge, frameEdges) {
  if (!Array.isArray(rectangles)) throw Error(`Missing atlas frames for ${group}.`);
  return rectangles.map((rect, index) => {
    if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isFinite)) throw Error(`Invalid frame ${group}:${index}.`);
    const [u, v, w, h] = rect;
    const x = Math.round(u * image.width), y = Math.round(v * image.height);
    const width = Math.min(image.width - x, Math.round(w * image.width));
    const height = Math.min(image.height - y, Math.round(h * image.height));
    if (x < 0 || y < 0 || width < 1 || height < 1) throw Error(`Invalid frame bounds for ${group}:${index}.`);
    const source = `${group}:${index}`;
    const data = Buffer.allocUnsafe(width * height * 4);
    for (let row = 0; row < height; row++) {
      const start = ((y + row) * image.width + x) * 4;
      image.data.copy(data, row * width * 4, start, start + width * 4);
    }
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 0) data.fill(0, i, i + 3);
    const scale = Math.min(1, (frameEdges[index] ?? maxEdge ?? Infinity) / Math.max(width, height));
    const pixels = resize({ width, height, data }, Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    return { source, ...pixels, ...(scale === 1 ? {} : { sourceSize: [width, height] }) };
  });
}

function pack(sources, file, maxSize, extrude) {
  const frames = Object.create(null);
  const aliases = new Map();
  const unique = [];
  let x = 0, y = 0, shelfHeight = 0, width = 0;
  for (const image of sources) {
    const key = extrude ? `${image.width}x${image.height}:${createHash('sha256').update(image.data).digest('hex')}` : undefined;
    const original = key === undefined ? undefined : aliases.get(key);
    const sourceSize = image.sourceSize ? { sourceSize: image.sourceSize } : {};
    if (original) {
      frames[image.source] = { ...original, ...sourceSize };
      continue;
    }
    const w = image.width + 2, h = image.height + 2;
    if (w > maxSize || h > maxSize) throw Error(`Atlas image ${image.source} exceeds the ${maxSize}px limit.`);
    if (x + w > maxSize) { x = 0; y += shelfHeight; shelfHeight = 0; }
    if (y + h > maxSize) throw Error(`Images in ${file} exceed one ${maxSize}×${maxSize} atlas.`);
    const frame = { x: x + 1, y: y + 1, width: image.width, height: image.height };
    frames[image.source] = { ...frame, ...sourceSize };
    if (key !== undefined) aliases.set(key, frame);
    unique.push(image);
    x += w;
    width = Math.max(width, x);
    shelfHeight = Math.max(shelfHeight, h);
  }
  const height = y + shelfHeight;
  const data = Buffer.alloc(width * height * 4);
  for (const image of unique) {
    const frame = frames[image.source], stride = image.width * 4;
    for (let row = 0; row < image.height; row++) {
      const start = ((frame.y + row) * width + frame.x) * 4;
      image.data.copy(data, start, row * stride, (row + 1) * stride);
      if (!extrude) continue;
      data.copy(data, start - 4, start, start + 4);
      data.copy(data, start + stride, start + stride - 4, start + stride);
    }
    if (extrude) {
      const top = (frame.y * width + frame.x - 1) * 4, bottom = top + (image.height - 1) * width * 4;
      data.copy(data, top - width * 4, top, top + stride + 8);
      data.copy(data, bottom + width * 4, bottom, bottom + stride + 8);
    }
  }
  return { png: encodePng({ width, height, data }, extrude), frames };
}

export function buildGameImageAtlas(file) {
  const { maxSize, images, backgrounds = {}, frameMap, inlineSvg = [] } = readConfig(file);
  const assets = resolve(dirname(file), 'assets');
  const groups = frameMap ? JSON.parse(readFileSync(resolve(assets, frameMap), 'utf8')) : undefined;
  const frameCounts = Object.create(null);
  const sources = images.flatMap(({ source, width, maxEdge, frameEdges = {} }) => {
    const path = resolve(assets, source);
    try {
      const image = decodePng(readFileSync(path));
      if (!groups) return [{ source, ...resize(image, width) }];
      const group = source.split('/').at(-1).slice(0, -4);
      if (Object.hasOwn(frameCounts, group)) throw Error(`Duplicate frame group ${group}.`);
      const frames = sliceFrames(image, group, groups[group], maxEdge, frameEdges);
      frameCounts[group] = frames.length;
      return frames;
    } catch (error) {
      throw Error(`Cannot pack atlas image ${path}: ${error.message}`, { cause: error });
    }
  }).sort((a, b) => b.height - a.height || b.width - a.width);
  if (groups && Object.keys(groups).some(group => !Object.hasOwn(frameCounts, group))) throw Error(`Missing source sheet in ${file}.`);
  const { png, frames } = pack(sources, file, maxSize, Boolean(groups));
  const optimized = Object.create(null);
  for (const [source, hash] of Object.entries(backgrounds)) {
    const webp = source.replace(/\.png$/, '.webp');
    if (existsSync(resolve(assets, webp)) && createHash('sha256').update(readFileSync(resolve(assets, source))).digest('hex') === hash) {
      optimized[source] = webp;
    }
  }
  const svg = Object.fromEntries(inlineSvg.map(source => [source, readFileSync(resolve(assets, source), 'utf8')]));
  return { png, info: { url: gameImageAtlasUrl(png), frames, backgrounds: optimized,
    ...(groups ? { frameCounts } : {}), ...(inlineSvg.length ? { svg } : {}) } };
}

export function gameImageAtlasPlugin(file, loose = false) {
  const importId = readConfig(file).frameMap ? 'virtual:game-sprite-atlas' : 'virtual:game-image-atlas';
  const internalId = '\0' + importId;
  return {
    name: 'game-image-atlas',
    resolveId(id) { return id === importId ? internalId : undefined; },
    load(id) {
      if (id !== internalId) return undefined;
      this.addWatchFile(file);
      if (loose) return 'export default null;';
      const config = readConfig(file);
      if (config.frameMap) this.addWatchFile(resolve(dirname(file), 'assets', config.frameMap));
      for (const source of config.inlineSvg ?? []) this.addWatchFile(resolve(dirname(file), 'assets', source));
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
