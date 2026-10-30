import type { Level, Tile } from './model';
import { placeGlassPipe } from './glass';
import { placeStone } from './adventure';
import { placeCannon } from './advanced';
import { setCell } from './terrain';

export function advancedCoast():Level {
    const width=160,height=24,cells:Tile[]=Array(width*height).fill('.');
    const l:Level={version:1,name:'05 · 火焰机关城',width,height,cells,spawn:[2,14.2],contents:{},properties:{}};
    const put=(x:number,y:number,t:Tile)=>{cells[y*width+x]=t;};
    for(let y=15;y<height;y++)for(let x=0;x<width;x++)put(x,y,'#');
    put(4,14,'basin');put(7,14,'F');put(11,13,'ice');l.contents![13*width+11]='coin';put(12,13,'ice');l.contents![13*width+12]='duck';
    put(15,11,'toggle-switch');for(let x=18;x<22;x++)put(x,13,'red-block');for(let x=23;x<27;x++)put(x,12,'blue-block');
    placeCannon(l,31,14,3);placeCannon(l,37,8,2);l.contents![8*width+37]='coin';placePipe(l,41,9,6);
    put(49,12,'ghost');put(55,14,'iron-turtle');put(59,14,'spring-v');
    for(let x=65;x<86;x++)for(let y=13;y<23;y++)put(x,y,'water');put(71,18,'squid');put(79,17,'fish');
    placeStone(l,92,10);put(89,14,'C');placeGlassPipe(l,9*width+100,[[0,0],[0,3],[12,3],[12,0]]);
    put(125,14,'spring-v');for(let x=129;x<133;x++)put(x,10,'B');put(138,14,'iron-turtle');put(150,14,'E');return l;
}

export function secretGarden():Level {
    const width=100,height=24,cells:Tile[]=Array(width*height).fill('.');
    const l:Level={version:1,name:'04 · 藤蔓秘境',width,height,cells,spawn:[2,14.2],contents:{},properties:{}};
    const put=(x:number,y:number,t:Tile)=>{cells[y*width+x]=t;};
    for(let x=0;x<width;x++)for(let y=15;y<height;y++)put(x,y,'#');
    put(4,14,'basin');put(7,11,'B');put(8,11,'B');put(10,11,'hidden-block');l.contents![11*width+10]='key';
    put(15,14,'locked-door');put(25,14,'door');l.properties![14*width+15]={link:4};l.properties![14*width+25]={link:4};
    for(let y=7;y<15;y++)put(29,y,'vine');for(let x=30;x<35;x++)put(x,10,'=');put(32,9,'key');
    placeStone(l,38,9);placeStone(l,48,13);l.properties![13*width+48]={direction:'left'};
    placeStone(l,59,13);l.properties![13*width+59]={direction:'right'};for(let y=11;y<15;y++){put(42,y,'#');put(67,y,'#');}
    put(72,14,'^');put(76,12,'spike-all');put(80,14,'spring-h');put(83,14,'J');put(93,14,'E');
    return l;
}

/** A full introductory course following 1-1's teaching rhythm, with ocean art. */
export function coastOneOne(): Level {
    const width = 240, height = 18, cells: Tile[] = Array(width * height).fill('.');
    const put = (x: number, y: number, t: Tile) => { cells[y * width + x] = t; };
    const row = (x: number, y: number, count: number, t: Tile) => { for (let n = 0; n < count; n++) put(x + n, y, t); };
    for (let x = 0; x < width; x++) for (let y = 15; y < height; y++)
        if (!((x >= 69 && x < 71) || (x >= 86 && x < 89) || (x >= 153 && x < 155))) put(x, y, '#');
    put(16, 11, '?'); row(20, 11, 5, 'B'); put(21, 11, '?'); put(23, 11, '?'); put(22, 7, '?');
    for (const [x, h] of [[28, 2], [38, 3], [46, 4], [57, 4], [163, 2], [179, 2], [224, 3], [235, 3]]) placePipe({ width, height, cells }, x!, 15 - h!, h!);
    put(22, 14, 'J'); put(40, 14, 'J'); put(51, 14, 'J'); put(53, 14, 'J');
    row(77, 11, 3, 'B'); put(78, 11, '?'); row(80, 7, 8, 'B'); row(91, 7, 4, 'B'); put(94, 11, '?');
    row(100, 11, 3, 'B'); put(101, 11, '?'); put(106, 11, '?'); put(109, 11, '?'); put(112, 11, '?'); put(109, 7, '?');
    row(118, 11, 3, 'B'); row(121, 7, 4, 'B'); row(128, 7, 4, 'B'); put(129, 7, '?'); put(130, 7, '?');
    for (const x of [81, 83, 98, 103, 108, 114, 124, 126, 169, 171]) put(x, 14, x === 108 || x === 169 ? 'T' : 'J');
    // Two little staircases rehearse climbing before the final ascent.
    for (let n = 0; n < 4; n++) for (let y = 14 - n; y < 15; y++) { put(134 + n, y, 'B'); put(144 - n, y, 'B'); }
    for (let n = 0; n < 4; n++) for (let y = 14 - n; y < 15; y++) put(148 + n, y, 'B');
    for (let n = 0; n < 8; n++) for (let y = 14 - n; y < 15; y++) { put(182 + n, y, 'B'); if (n === 7) put(190, y, 'B'); }
    for (const [x, y, n] of [[30, 10, 3], [71, 10, 4], [91, 5, 4], [118, 9, 3], [155, 10, 3], [194, 9, 5]]) row(x!, y!, n!, 'o');
    put(95, 14, 'C'); put(199, 14, 'E');
    // The bonus room lives beyond an impassable wall, reachable only by pipe.
    for (let y = 0; y < 18; y++) { put(221, y, 'B'); put(239, y, 'B'); }
    row(222, 7, 17, 'B');
    for (let y = 10; y <= 13; y++) row(227, y, 7, 'o');
    return { version: 1, name: '1-1 · 初见鲸屿', width, height, spawn: [2, 13], cells,
        contents: Object.fromEntries([[16,11,'auto'],[21,11,'coin'],[23,11,'coin'],[22,7,'fire'],[78,11,'auto'],[94,11,'coin'],[101,11,'coin'],[106,11,'auto'],[109,11,'coin'],[112,11,'coin'],[109,7,'growth'],[129,7,'coin'],[130,7,'coin']].map(([x,y,content]) => [Number(y)*width+Number(x),content])) as NonNullable<Level['contents']>,
        warps: [{ from: [57, 11], to: [225, 12] }, { from: [235, 12], to: [164, 13] }] };
}

export function placePipe(level: Pick<Level, 'width' | 'height' | 'cells'> & Partial<Pick<Level,'properties'>>, x: number, y: number, height = 3, glass = false): void {
    if (x < 0 || x + 1 >= level.width || y < 0 || y + height > level.height) return;
    for (let n = 0; n < height; n++) {
        setCell(level,(y + n) * level.width + x,glass?(n===0?'glass-pipe':'glass-left-shaft'):n === 0 ? 'P' : 'p');
        setCell(level,(y + n) * level.width + x + 1,glass?(n===0?'glass-right':'glass-right-shaft'):n === 0 ? 'Q' : 'q');
    }
}
export function mechanismCoast():Level {
    const width=180,height=24,cells:Tile[]=Array(width*height).fill('.'),properties:NonNullable<Level['properties']>={};
    const put=(x:number,y:number,t:Tile)=>{cells[y*width+x]=t;};
    for(let x=0;x<width;x++)for(let y=15;y<height;y++)put(x,y,'#');
    for(const [x,t]of [[8,'spring-v'],[11,'basin'],[13,'pow'],[45,'plant'],[50,'spiky'],[55,'spring-h'],[100,'door'],[119,'door'],[126,'p-switch'],[148,'p-door'],[156,'p-door'],[160,'star'],[164,'pow'],[166,'spiky'],[168,'T'],[170,'J'],[176,'E']] as [number,Tile][])put(x,14,t);
    const l:Level={version:1,name:'03 · 机关试验海岸',width,height,cells,spawn:[2,13],properties};
    placeGlassPipe(l,10*width+20,[[0,0],[0,3],[15,3],[15,0]]);placePipe(l,38,12,3);properties[12*width+38]={plant:true};
    for(let n=0;n<3;n++)for(let y=14-n;y<15;y++)put(16+n,y,'#');
    put(41,14,'plant');properties[14*width+41]={mode:'pipe'};
    for(let n=0;n<3;n++){put(59+n,14-n,'slope-up');for(let y=15-n;y<15;y++)put(59+n,y,'#');put(66+n,12+n,'slope-down');for(let y=13+n;y<15;y++)put(66+n,y,'#');}
    for(let x=62;x<66;x++)for(let y=12;y<15;y++)put(x,y,'#');
    for(let x=71;x<95;x++)for(let y=14;y<22;y++)put(x,y,'water');put(75,18,'fish');put(84,17,'squid');put(90,19,'fish');
    put(69,14,'C');put(97,14,'C');properties[14*width+100]={link:1};properties[14*width+119]={link:1};
    put(110,11,'firebar');properties[11*width+110]={length:6,speed:1.5};put(115,12,'firebar');properties[12*width+115]={length:3,speed:-2};
    for(let x=130;x<135;x++){put(x,11,'B');put(x,14,'o');}for(let x=136;x<141;x++)put(x,13,'p-on');for(let x=141;x<146;x++)put(x,11,'p-off');properties[14*width+148]={link:3};properties[14*width+156]={link:3};return l;
}
