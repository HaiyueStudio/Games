// Convert public coordinate facts into Whale Maker's tile schema.
// Run with --fetch to refresh the source cache before conversion.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {readCoordinateData} from './read-coordinate-data.mjs';

const root = resolve(import.meta.dirname, '../../..');
const cache = resolve(root, 'artifacts/whale-classic-reference');
const output = resolve(import.meta.dirname, '../levels');
const ids = Array.from({ length: 32 }, (_, i) => `${Math.floor(i / 4) + 1}-${i % 4 + 1}`);
const expected=JSON.parse(readFileSync(resolve(output,'reference-provenance.json'),'utf8')).coordinateSources;
function verifiedSource(id,bytes){
    if(createHash('sha256').update(bytes).digest('hex')!==expected.find(source=>source.map===id)?.sha256)throw Error(id+': coordinate checksum changed; review and update provenance explicitly');
    return bytes;
}
mkdirSync(cache, { recursive: true });
if (process.argv.includes('--fetch')) {
    for (const id of ids) {
        const response = await fetch(sourceUrl(id));
        if (!response.ok) throw Error(`${id}: HTTP ${response.status}`);
        writeFileSync(resolve(cache, `${id}.js`), verifiedSource(id,Buffer.from(await response.arrayBuffer())));
    }
}
function sourceUrl(id) { return `https://raw.githubusercontent.com/DevJogger/html-mario/gh-pages/settings/maps/${id}.js`; }
function readSource(id) {
    return readCoordinateData(verifiedSource(id,readFileSync(resolve(cache,`${id}.js`))).toString('utf8'),id);
}

// Static sections reproduce each castle corridor once. Route gates below retain
// the upper/lower passage choices in 4-4 and 7-4. 8-4's pipe rooms never loop.
function expandSections(area) {
    const creation = [], sections = [], visiting = new Set();
    function expand(items, offset = 0, sectionIndex) {
        for (const original of items ?? []) {
            const object = { ...original, x: (original.x ?? 0) + offset };
            if (object.macro === 'Section') {
                const next = original.section ?? 0;
                if (visiting.has(next)) continue;
                visiting.add(next);
                const section = area.sections?.[next];
                if (!section) continue;
                const start = object.x, before = section.before?.width ?? 0;
                const stretch = section.stretch ? Math.max(64, section.stretch.width ?? 8) : 0;
                const checks = [];
                sections.push({ index: next, start, checks, end: start + before + stretch + (section.after?.width ?? 0) });
                expand(section.before?.creation, start, next);
                if (section.stretch) for (let x = 0; x < stretch; x += section.stretch.width ?? 8) expand(section.stretch.creation, start + before + x, next);
                expand(section.after?.creation, start + before + stretch, next);
            } else if (object.macro === 'SectionDecider') {
                const current = sections.find(section => section.index === sectionIndex);
                if (current) current.end = object.x;
                expand([{ macro: 'Section', section: original.pass ?? 0 }], object.x);
            } else if (object.macro === 'SectionPass') {
                sections.find(section => section.index === sectionIndex)?.checks.push(object);
            } else if (object.macro !== 'SectionFail') creation.push(object);
        }
    }
    expand(area.creation);
    return { creation, sections };
}

const aliases = { Goomba: 'J', Koopa: 'T', Beetle: 'iron-turtle', HammerBro: 'hammer-otter', Blooper: 'squid', CheepCheep: 'fish', Springboard: 'spring-v' };
const rewards = { Mushroom: 'auto', Mushroom1Up: 'one-up', Coin: 'coin', Star: 'star' };
const names = ['珍珠海岸', '珊瑚地窟', '月夜云台', '尖刺龟堡'];
const coordinateSources = [];
const converted = [];
for (const [index, id] of ids.entries()) {
    const bytes = verifiedSource(id,readFileSync(resolve(cache, `${id}.js`)));
    coordinateSources.push({ map: id, sha256: createHash('sha256').update(bytes).digest('hex'), url: sourceUrl(id) });
    // Preserve the previously verified first-world layouts and coin-room exits.
    if (index < 4) {
        const level = JSON.parse(readFileSync(resolve(output, `world-${id}.json`), 'utf8'));
        if(index===1){
            const width=34,height=18,cells=Array(width*height).fill('.'),properties={};
            cells.fill('#',15*width);cells[14*width+2]='warp-box';properties[14*width+2]={area:'main',targetX:160,targetY:2};
            for(const [n,world]of [4,3,2].entries()){
                const x=8+n*8,y=12;cells[y*width+x]='P';cells[y*width+x+1]='Q';
                for(let dy=1;dy<3;dy++){cells[(y+dy)*width+x]='p';cells[(y+dy)*width+x+1]='q';}
                properties[y*width+x]={length:3,rotation:0,destination:{pack:'classic',course:world+'-1'}};
            }
            level.areas={'warp-zone':{version:1,name:'1-2 · 跳关地带',width,height,cells,properties,spawn:[3,14.2],backdrop:'castle',theme:'underground'}};
            for(let x=168;x<=172;x++)for(let y=0;y<4;y++)level.cells[y*level.width+x]='.';
            level.cells[3*level.width+169]='warp-box';(level.properties??={})[3*level.width+169]={area:'warp-zone',targetX:3,targetY:13};
        }
        converted.push(level);
        continue;
    }
    const data = readSource(id), world = Math.floor(index / 4) + 1;
    const mainIndex = ['2-2', '4-2', '7-2'].includes(id) ? 1 : 0;
    const links = [], entrances = new Map(), skyLinks = [];
    const levels = data.areas.map((area, areaIndex) => {
        const expanded = expandSections(area), creation = expanded.creation;
        const endFlag = creation.find(o => o.macro === 'EndOutsideCastle');
        const endCastle = creation.find(o => o.macro === 'EndInsideCastle');
        const extent = Math.max(160, ...creation.map(o => (o.x ?? 0) + (Number.isFinite(o.width) ? o.width : 16)), endFlag ? endFlag.x + 96 : 0, endCastle ? endCastle.x + 280 : 0);
        const width = Math.ceil(extent / 8), height = 18, water = !!area.underwater;
        if (width > 512) throw Error(`${id} area ${areaIndex} exceeds the map width limit`);
        const underground = area.setting.includes('Underworld'), castle = area.setting.includes('Castle'), sky = area.setting.includes('Sky');
        const level = { version: 1, name: `${id} · ${areaIndex === mainIndex ? names[index % 4] : water ? '水下航道' : sky ? '云上宝藏' : underground ? '金币密室' : castle ? '城堡通道' : '地上出口'}`,
            classicStage: index + 1, theme: underground ? 'underground' : castle ? 'castle' : 'coast',
            backdrop: castle || area.setting.includes('Night') ? 'night' : underground ? 'castle' : sky ? 'mountains' : 'coast',
            finish: index % 4 === 3 ? 'castle' : 'flag', width, height, spawn: castle ? [1, 8.2] : [2, 14.2],
            cells: Array(width * height).fill(water ? 'water' : '.'), contents: {}, properties: {} };
        if (water) { level.liquid = { kind: 'water', low: 0, high: 0, period: 1, mode: 'rise' }; level.liquidSurface = 0; level.spawn = [2, 12]; }
        const cell = (x, y) => Math.floor(y) * width + Math.floor(x);
        const set = (x, y, tile) => { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && x < width && y >= 0 && y < height) level.cells[y * width + x] = tile; };
        const rect = (x, y, w, h, tile) => { for (let row = Math.max(0, Math.floor(y)); row < Math.min(height, Math.ceil(y + h)); row++) for (let col = Math.max(0, Math.floor(x)); col < Math.min(width, Math.ceil(x + w)); col++) set(col, row, tile); };
        const props = (x, y, value) => { const at = cell(x, y); level.properties[at] = { ...level.properties[at], ...value }; };
        const register = (object, x, y, pipe = true) => {
            if (typeof object.transport === 'number') links.push({ area: areaIndex, x, y, destination: object.transport, pipe });
            if (typeof object.entrance === 'number') entrances.set(object.entrance, { area: areaIndex, x, y: Math.max(0, y - 2) });
        };
        function block(o) {
            const x = Math.floor((o.x ?? 0) / 8), y = Math.round(15 - (o.y ?? 0) / 8);
            const w = Math.max(1, (o.width ?? 8) / 8), h = Math.max(1, (o.height ?? 8) / 8);
            if (o.thing === 'Brick' || o.thing === 'Block') {
                const reward = Array.isArray(o.contents) ? o.contents[0] : o.contents;
                const vine = reward === 'Vine';
                set(x, y, o.hidden ? 'hidden-block' : o.thing === 'Block' || reward && !vine ? '?' : 'B');
                if (reward && !vine || o.thing === 'Block') level.contents[cell(x, y)] = rewards[reward] ?? 'coin';
                if (vine) {
                    rect(x, Math.max(0, y - 5), 1, Math.min(5, y), 'vine');
                    set(x, Math.max(0, y - 5), 'warp-box');
                    links.push({ area: areaIndex, x, y: Math.max(0, y - 5), destination: o.contents[1].transport ?? o.contents[1].entrance, pipe: false });
                }
            } else if (o.thing === 'Stone') rect(x, y, w, Number.isFinite(o.height) ? h : 1, '#');
            else if (aliases[o.thing]) {
                set(x, y, aliases[o.thing]);
                const extra = {};
                if (o.smart) extra.smart = true;
                if (o.floating) extra.flight = [Math.max(0, 15 - (o.end ?? 88) / 8), Math.min(17, 15 - (o.begin ?? 8) / 8)];
                else if (o.jumping) extra.winged = true;
                if (water) extra.liquid = 'water';
                if (Object.keys(extra).length) props(x, y, extra);
            } else if (o.thing === 'Coin') set(x, y, 'o');
            else if (o.thing === 'Coral') rect(x, y, w, h, '#');
            else if (o.thing === 'CastleBlock') {
                set(x, y, o.fireballs ? 'firebar' : '#');
                if (o.fireballs) props(x, y, { length: o.fireballs, speed: Math.min(6, Math.abs(o.speed ?? 1) * 1.4) * (o.direction === 1 ? -1 : 1), phase: 0 });
            } else if (o.thing === 'Platform' && !o.nocollidechar) {
                set(x, y, 'moving-platform');
                const axis = o.floating || o.falling ? 'y' : 'x';
                const range = axis === 'y' ? [Math.max(0, 15 - (o.end ?? o.y ?? 56) / 8), Math.min(17, o.falling ? 17 : 15 - (o.begin ?? -4) / 8)] : [(o.begin ?? o.x) / 8, (o.end ?? (o.x ?? 0) + 64) / 8];
                if (range[0] >= range[1]) range[1] = Math.min(axis === 'y' ? height : width, range[0] + 4);
                props(x, y, { length: Math.max(1, Math.round(w)), axis, range, speed: Math.min(6, o.speed ?? 2), ...(o.falling ? { platformMode: 'fall' } : {}) });
                if (sky && o.transport) skyLinks.push({ area: areaIndex, x: Math.max(2, width - 4), y: 14, destination: data.locations.findIndex(location => location.xloc !== undefined) });
            } else if (o.thing === 'PipeHorizontal') {
                // Use a left-facing mouth and clear the approach arch for tall forms.
                rect(x - 2, y - 2, 3, 4, water ? 'water' : '.');
                set(x, y, 'P'); set(x + 1, y, 'Q'); set(x, y + 1, 'p'); set(x + 1, y + 1, 'q');
                props(x, y, { length: 2, rotation: 270 });
                const fallback = id === '3-1' ? 1 : id === '7-1' ? 1 : id === '7-2' ? 2 : undefined;
                register({ ...o, entrance: undefined, transport: o.transport ?? fallback }, x, y);
            } else if (o.thing === 'Podoboo') {
                const surface = level.cells.findIndex((t, n) => n % width === x && t === 'lava');
                const top = surface < 0 ? 10 : Math.max(5, Math.floor(surface / width) - 5);
                set(x, top, 'fire-jumper'); props(x, top, { period: 3 });
            } else if (o.thing === 'Cannon') {
                const count = Math.max(1, Math.round((o.height ?? 8) / 8)), bottom = y + count - 1;
                if (o.nofire) { rect(x, y, 1, count, '#'); return; }
                set(x, bottom, 'cannon');
                for (let n = 1; n < count; n++) set(x, bottom - n, 'cannon-body');
                props(x, bottom, { height: count });
            } else if (o.thing === 'Lakitu') {
                (level.classicFeatures ??= {}).spawners ??= [];
                level.classicFeatures.spawners.push({ kind: 'lakitu', start: x, end: width - 16, y: Math.max(3, y), period: 2.5 });
            }
        }
        function macro(o) {
            const x = Math.floor((o.x ?? 0) / 8), y = Math.round(15 - (o.y ?? 0) / 8), w = (o.width ?? 8) / 8;
            if (o.macro === 'Fill') {
                for (let row = 0; row < (o.ynum ?? 1); row++) for (let col = 0; col < (o.xnum ?? 1); col++) block({ ...o, macro: undefined, x: (o.x ?? 0) + col * (o.xwidth ?? 8), y: (o.y ?? 0) + row * (o.yheight ?? 8) });
            } else if (o.macro === 'Floor') rect(x, y, w, height - y, '#');
            else if(o.macro==='WarpWorld'){
                for(const [n,world]of (o.warps??[]).entries()){
                    const px=x+1+n*4+(o.warps.length===1?4:0),py=12;
                    rect(px,py,2,3,'p');set(px,py,'P');set(px+1,py,'Q');set(px+1,py+1,'q');set(px+1,py+2,'q');
                    props(px,py,{length:3,rotation:0,destination:{pack:'classic',course:world+'-1'}});
                }
            }
            else if (o.macro === 'Ceiling') rect(x, 4, w, 1, 'B');
            else if (o.macro === 'Pipe') {
                const infinite = o.height === 'Infinity';
                const count = infinite ? Math.max(2, 15 - y) : Math.max(1, Math.round((o.height ?? 16) / 8));
                const top = infinite ? y : y - count;
                rect(x, top, 2, count, 'p');
                set(x, top, 'P');set(x + 1, top, 'Q');
                for (let row = 1; row < count; row++) set(x + 1, top + row, 'q');
                if (o.piranha) props(x, top, { plant: true });
                register(o, x, top);
            } else if (['Tree', 'Shroom', 'Bridge'].includes(o.macro)) {
                rect(x, y, Math.max(o.macro === 'Bridge' ? 2 : 1, w), 1, '=');
                if (o.solidTrunk) rect(x + 1, y + 1, Math.max(1, w - 2), height - y - 1, '#');
                if (o.macro === 'Bridge' && o.begin) rect(x, y, 1, height - y, '#');
                if (o.macro === 'Bridge' && o.end) rect(x + w - 1, y, 1, height - y, '#');
            } else if (o.macro === 'PlatformGenerator') {
                for (let row = 4; row <= 12; row += 4) { set(x, row, 'moving-platform'); props(x, row, { length: Math.round(w), axis: 'y', range: [3, 17], speed: (o.direction ?? 1) * 2, loop: true }); }
            } else if (o.macro === 'Scale') {
                const link = 30 + Object.values(level.properties).filter(p => p.platformMode === 'balance').length / 2;
                for (const right of [false, true]) {
                    const length = Math.max(1, Math.round((right ? o.widthRight ?? 24 : o.widthLeft ?? 24) / 8));
                    const xx = Math.floor(x + (right ? (o.between ?? 40) / 8 : 0) - length / 2);
                    const yy = Math.round(15 - ((o.y ?? 0) - (right ? o.dropRight ?? 24 : o.dropLeft ?? 24)) / 8);
                    set(xx, yy, 'moving-platform'); props(xx, yy, { length, axis: 'y', range: [Math.max(1, y), 17], speed: 1.8, platformMode: 'balance', link });
                }
            } else if (o.macro === 'Water') rect(x, y, w, height - y, 'lava');
            else if (o.macro === 'StartInsideCastle') {
                rect(0, 9, 3, 9, '#');rect(3, 10, 1, 8, '#');rect(4, 11, 1, 7, '#');
                if ((o.width ?? 0) > 40) rect(5, 12, (o.width - 40) / 8, 6, '#');
            } else if (o.macro === 'EndOutsideCastle') set(x, 14, 'E');
            else if (o.macro === 'EndInsideCastle') {
                rect(x, 4, 32, 1, '#');rect(x, 15, 13, 3, 'lava');rect(x + 13, 15, width - x - 13, 3, '#');
                rect(x + 13, 11, 3, 4, '#');rect(x + 14, 5, 2, 3, '#');rect(x, 12, 13, 1, 'bridge');
                set(x + 8, 10, 'turtle-boss');set(x + 9, 10, 'boss-body');set(x + 8, 11, 'boss-body');set(x + 9, 11, 'boss-body');
                props(x + 8, 10, { link: 1 });set(x + 13, 10, 'bridge-bell');set(x + 23, 14, 'E');
            } else if (['CheepsStart', 'BulletBillsStart'].includes(o.macro)) {
                const end = creation.find(n => n.macro === (o.macro === 'CheepsStart' ? 'CheepsStop' : 'BulletBillsStop') && (n.x ?? 0) > (o.x ?? 0));
                (level.classicFeatures ??= {}).spawners ??= [];
                level.classicFeatures.spawners.push({ kind: o.macro === 'CheepsStart' ? 'fish' : 'cannonball', start: x, end: end ? end.x / 8 : width - 16, y: 18, period: o.macro === 'CheepsStart' ? 1.5 : 2.5 });
            } else if (o.macro === 'LakituStop') {
                const lakitu = level.classicFeatures?.spawners?.find(s => s.kind === 'lakitu');
                if (lakitu) lakitu.end = x;
            } else if (o.thing) block(o);
        }
        creation.forEach(macro);
        // Later wall rectangles in the source surround a horizontal mouth.
        // Restore the whole two-cell pipe after those walls have been placed.
        creation.filter(o => o.thing === 'PipeHorizontal').forEach(block);
        if (id !== '8-4' && expanded.sections.length) {
            const gates = expanded.sections.filter(s => s.checks.length).map(s => ({
                start: s.start / 8, end: s.end / 8,
                checks: s.checks.map(o => ({ x: o.x / 8, y: 15 - (o.y ?? 0) / 8, w: (o.width ?? 8) / 8, h: (o.height ?? 8) / 8 })),
            }));
            for (const gate of gates) {
                const corridors = new Map();
                for (const check of gate.checks) {
                    const old = corridors.get(check.y);
                    if (old) old.w = Math.max(old.x + old.w, check.x + check.w) - old.x;
                    else corridors.set(check.y, { ...check });
                }
                gate.checks = [...corridors.values()];
                gate.restart = gate.start;
            }
            if (id === '7-4') for (const [n, gate] of gates.entries()) gate.restart = gates[n < 3 ? 0 : 3].start;
            (level.classicFeatures ??= {}).maze = gates;
        }
        // Explicitly restore water under decorative coins and behind enemies.
        if (sky) { rect(0, 15, width, 3, '='); level.spawn = [2, 12]; }
        for (const key of Object.keys(level.contents)) if (!['?', 'hidden-block'].includes(level.cells[key])) delete level.contents[key];
        for (const key of Object.keys(level.properties)) if (level.cells[key] === '.') delete level.properties[key];
        return level;
    });
    const keyFor = area => area === mainIndex ? 'main' : `area-${area}`;
    function destination(locationIndex) {
        const location = data.locations[locationIndex];
        if (!location) return null;
        const entry = entrances.get(locationIndex);
        const area = location.area ?? 0;
        return entry ?? { area, x: Math.max(2, Math.floor((location.xloc ?? 16) / 8)), y: levels[area].spawn[1] };
    }
    for (const link of [...links, ...skyLinks]) {
        const to = destination(link.destination);
        if (!to || id === '8-4' && to.area <= link.area) continue;
        const level = levels[link.area], at = link.y * level.width + link.x;
        if (!link.pipe) level.cells[at] = 'warp-box';
        level.properties[at] = { ...level.properties[at], area: keyFor(to.area), targetX: Math.max(0, Math.floor(to.x)), targetY: Math.max(0, Math.floor(to.y)) };
    }
    // Sky bonus routes return to the same course at their original x location.
    for (const link of skyLinks) {
        const level = levels[link.area], at = link.y * level.width + link.x;
        level.cells[at] = 'warp-box';
    }
    // A warp-world overlook becomes a bonus route that returns to this stage.
    for (const [areaIndex, level] of levels.entries()) if (areaIndex !== mainIndex &&
        !Object.values(level.properties).some(p => p.area) && !level.cells.includes('E')) {
        const location = data.locations.find(location => location.xloc !== undefined && (location.area ?? 0) === mainIndex);
        const x = level.width - 4, y = 14;
        for (let col = 0; col < level.width; col++) level.cells[15 * level.width + col] = '=';
        level.cells[y * level.width + x] = 'warp-box';
        level.properties[y * level.width + x] = { area: 'main', targetX: Math.floor((location?.xloc ?? 16) / 8), targetY: 12 };
    }
    const main = levels[mainIndex];
    const reachable = new Set([mainIndex]);
    for (let pass = 0; pass < levels.length; pass++) for (const area of [...reachable]) for (const p of Object.values(levels[area].properties)) if (p.area && p.area !== 'main') reachable.add(Number(p.area.slice(5)));
    const areas = Object.fromEntries([...reachable].filter(n => n !== mainIndex).map(n => [keyFor(n), levels[n]]));
    if (Object.keys(areas).length) main.areas = areas;
    // Child rooms refer to their siblings through the parent area dictionary.
    converted.push(main);
    console.log(id, main.width, 'columns,', Object.keys(areas).length, 'subareas');
}

function pack(level) {
    const { cells, areas, ...metadata } = level;
    const runs = [];
    for (const tile of cells) {
        if (runs.at(-1)?.[0] === tile) runs.at(-1)[1]++;
        else runs.push([tile, 1]);
    }
    return { ...metadata, runs, ...(areas ? { areas: Object.fromEntries(Object.entries(areas).map(([id, area]) => [id, pack(area)])) } : {}) };
}
writeFileSync(resolve(output, 'classic-data.ts'), `// Generated by scripts/convert-classic.mjs. Coordinate sources are recorded in CLASSIC_WORLD.md.\nimport { lazyClassic } from './classic-codec';\nexport const classicData = [\n${converted.map(l => `    lazyClassic(${JSON.stringify(pack(l))}),`).join('\n')}\n];\n`);
const provenance = JSON.parse(readFileSync(resolve(output, 'reference-provenance.json'), 'utf8'));
provenance.coordinateSources = coordinateSources;
provenance.retrieved = new Date().toISOString().slice(0, 10);
provenance.levelCount = converted.length;
provenance.conversion = '32 stages, same-course subareas, 4-4/7-4 route gates, finite 8-4 pipe rooms';
writeFileSync(resolve(output, 'reference-provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
