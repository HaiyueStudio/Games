import type { Level, Tile } from './model';
import { REFERENCE_RULES } from './profile';
import { writePipe } from './pipes';
import { placeGlassPipe } from './glass';

export function p0Level():Level {
    const width=144,height=32,cells:Tile[]=Array(width*height).fill('.');
    const l:Level={version:1,name:'P0 · 冰晶与连击试验',rules:{...REFERENCE_RULES},width,height,cells,spawn:[3,19.2],properties:{},contents:{},backdrop:'mountains'};
    const put=(x:number,y:number,t:Tile)=>cells[y*width+x]=t;
    for(let y=20;y<height;y++)for(let x=0;x<width;x++)put(x,y,'#');
    put(5,19,'ice-flower');for(let x=10;x<17;x++)put(x,20,'ice-solid');
    put(12,16,'ice');l.contents![16*width+12]='coin';put(13,16,'ice');l.contents![16*width+13]='duck';put(15,19,'F');put(19,19,'ice-flower');
    for(const x of [24,28,32])put(x,19,'J');l.properties![19*width+32]={drop:'coin'};
    put(36,19,'T');l.properties![19*width+36]={drop:'key'};
    for(let y=16;y<20;y++)for(let x=42;x<54;x++)put(x,y,'water');put(45,18,'fish');put(50,17,'squid');
    for(let x=56;x<61;x++)put(x,15,'B');put(58,14,'J');put(61,19,'door');put(84,19,'door');l.properties![19*width+61]={link:7};l.properties![19*width+84]={link:7};
    put(63,18,'B');put(64,17,'B');
    placeGlassPipe(l,15*width+66,[[0,0],[0,3],[10,3],[10,0]]);
    writePipe(l,92,17,3);(l.properties![17*width+92]??={}).plant=true;
    put(103,19,'bomb');put(107,19,'iron-turtle');put(112,19,'basin');put(117,19,'spring-h');
    put(126,16,'?');l.contents![16*width+126]='star';put(138,19,'E');return l;
}
