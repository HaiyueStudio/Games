import type {Level} from './model';
export function workshopLevel():Level{
    const width=100,height=24,cells=Array<Level['cells'][number]>(width*height).fill('.');
    const l:Level={version:1,name:'加速蛇砖与炸弹工坊',width,height,cells,spawn:[2,14.2],properties:{},contents:{},backdrop:'plains'};
    const put=(x:number,y:number,t:Level['cells'][number])=>{cells[y*width+x]=t;};
    for(let y=15;y<height;y++)for(let x=0;x<width;x++)put(x,y,'#');
    for(let x=5;x<12;x++)put(x,15,'speed-belt');for(let x=16;x<24;x++)put(x,15,'ice');
    put(10,14,'J');put(26,14,'wood-crate');for(let x=29;x<37;x++)for(let y=15;y<22;y++)put(x,y,'water');put(32,12,'wood-crate');
    put(40,12,'snake-block');l.properties![1240]={length:4,path:[[0,0],[6,0],[6,-3],[12,-3]]};
    put(58,14,'bomb');put(63,14,'B');put(64,14,'wood-crate');put(65,14,'J');
    for(let x=73;x<81;x++)put(x,11,'B');put(77,10,'hammer-otter');put(84,14,'hammer-otter');put(8,11,'?');l.contents![1108]='bomb';put(94,14,'E');return l;
}
