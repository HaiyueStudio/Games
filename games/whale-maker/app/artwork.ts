import packedAtlas from 'virtual:game-sprite-atlas';

export type SpriteSourceSizes = ReadonlyMap<string, readonly [number, number]>;

export async function loadImage(src: string): Promise<HTMLImageElement> {
    const image = new Image();
    image.src = src;
    await image.decode();
    return image;
}

async function fetchAsset(path: string): Promise<Response> {
    const response = await fetch(`./assets/${path}`);
    if (!response.ok) throw Error(`Missing artwork ${path} (HTTP ${response.status})`);
    return response;
}

async function loadSvg(name: string): Promise<HTMLImageElement> {
    const path = `${name}.svg`;
    const svg = packedAtlas?.svg?.[path] ?? await (await fetchAsset(path)).text();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try { return await loadImage(url); }
    finally { URL.revokeObjectURL(url); }
}

export async function loadArtwork() {
    const images: Record<string, HTMLImageElement> = {};
    const sourceSizes = new Map<string, readonly [number, number]>();
    let frames: Record<string, number[][]>;
    if (packedAtlas) {
        const atlas = packedAtlas;
        const image = await loadImage(atlas.url);
        frames = Object.fromEntries(Object.entries(atlas.frameCounts).map(([name, count]) => {
            images[name] = image;
            const rectangles = Array.from({ length: count }, (_, index) => {
                const id = `${name}:${index}`;
                const { x, y, width, height, sourceSize } = atlas.frames[id]!;
                if (sourceSize) sourceSizes.set(id, sourceSize);
                return [x / image.naturalWidth, y / image.naturalHeight, width / image.naturalWidth, height / image.naturalHeight];
            });
            return [name, rectangles];
        }));
    } else {
        frames = await (await fetchAsset('runtime/frames.json')).json() as Record<string, number[][]>;
        await Promise.all(Object.keys(frames).map(async name => {
            images[name] = await loadImage(`./assets/runtime/${name}.png`);
        }));
    }
    await Promise.all(['desert-icons', 'p1-icons', 'p2-icons'].map(async name => { images[name] = await loadSvg(name); }));
    frames['desert-icons'] = Array.from({ length: 4 }, (_, index) => [index / 4, 0, 1 / 4, 1]);
    frames['p1-icons'] = Array.from({ length: 30 }, (_, index) => {
        const [x, y, width, height] = [0, 3, 4, 5, 6, 8, 9, 20, 21, 22].includes(index)
            ? [10, 10, 76, 76] as const : index === 2 ? [4, 22, 88, 52] as const : [0, 0, 96, 96] as const;
        return [(index % 8 * 96 + x) / 768, (Math.floor(index / 8) * 96 + y) / 384, width / 768, height / 384];
    });
    frames['p2-icons'] = Array.from({ length: 15 }, (_, index) => [index % 8 / 8, Math.floor(index / 8) / 2, 1 / 8, 1 / 2]);
    return { images, frames, sourceSizes };
}
