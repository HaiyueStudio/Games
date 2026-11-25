import type { Level, Tile } from '../rules/model';

export type PackedArea = Omit<Level, 'cells' | 'areas'> & { runs: [Tile, number][]; areas?: Record<string, PackedArea> };

export function packArea({cells,areas,...metadata}:Level):PackedArea {
    const runs:[Tile,number][]=[];
    for(const tile of cells){const last=runs.at(-1);if(last?.[0]===tile)last[1]++;else runs.push([tile,1]);}
    return {...structuredClone(metadata),runs,...(areas?{areas:Object.fromEntries(Object.entries(areas).map(([id,area])=>[id,packArea(area)]))}:{})};
}

/** Import budgets are checked before allocating the expanded grid. */
export function unpackArea(value:unknown,child=false):Level {
    const p=value as PackedArea;
    if(!p||!Number.isInteger(p.width)||p.width<20||p.width>512||!Number.isInteger(p.height)||p.height<10||p.height>256||!Array.isArray(p.runs)||p.runs.length>p.width*p.height)throw Error('压缩关卡格式无效');
    let total=0;
    for(const run of p.runs){if(!Array.isArray(run)||run.length!==2||typeof run[0]!=='string'||!Number.isInteger(run[1])||run[1]<1)throw Error('压缩格子无效');total+=run[1];if(total>p.width*p.height)throw Error('压缩格子超出地图');}
    if(total!==p.width*p.height)throw Error('压缩格子数量不符');
    const {areas,...rest}=p;
    if(areas&&(child||typeof areas!=='object'||Array.isArray(areas)||Object.keys(areas).length>8))throw Error('压缩副区格式无效');
    return {...expandClassic(rest),...(areas?{areas:Object.fromEntries(Object.entries(areas).map(([id,area])=>[id,unpackArea(area,true)]))}:{})};
}

/** Generated packs retain compressed blueprints until a course is selected. */
export function lazyClassic(packed:PackedArea):()=>Level {
    let decoded:Level|undefined;
    return ()=>{decoded??=expandClassic(packed);return structuredClone(decoded);};
}

/** Keep large empty and solid regions compact in the game bundle. */
export function expandClassic({ runs, areas, ...metadata }: PackedArea): Level {
    const cells = runs.flatMap(([tile, count]) => Array<Tile>(count).fill(tile));
    return {
        ...metadata,
        cells,
        ...(areas ? { areas: Object.fromEntries(Object.entries(areas).map(([id, area]) => [id, expandClassic(area)])) } : {}),
    };
}
