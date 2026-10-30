import type { Level, Tile } from './model';
import { placeCactus } from './desert';
export function desertLevel():Level {
    const width=150,height=32,cells:Tile[]=Array(width*height).fill('.');
    const l:Level={version:1,name:'金字塔流沙与雪球',backdrop:'desert',width,height,cells,spawn:[2,19.2],properties:{},contents:{}};
    const put=(x:number,y:number,t:Tile)=>{cells[y*width+x]=t;};
    for(let y=20;y<height;y++)for(let x=0;x<width;x++)put(x,y,'#');
    for(const [a,b]of [[16,29],[54,71]])for(let y=20;y<26;y++)for(let x=a!;x<b!;x++)put(x,y,'quicksand');
    for(const x of [7,35,75,99])put(x,19,'snowball');
    put(12,19,'J');put(30,19,'T');put(22,15,'G');
    placeCactus(l,40,19,4);placeCactus(l,60,19,3);placeCactus(l,87,19,5);
    for(let y=17;y<20;y++)put(45,y,'B');
    for(let x=92;x<99;x++)put(x,16,x%2?'?':'B');l.contents![16*width+93]='snowball';
    for(const x of [19,22,25,58,62,66])put(x,17,'o');
    put(10,11,'smile-cloud');put(46,10,'smile-cloud');put(139,19,'E');return l;
}
