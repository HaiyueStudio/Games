import type {Level} from './model';
export function frostLevel():Level{
    const width=100,height=24,cells=Array<Level['cells'][number]>(width*height).fill('.');
    const l:Level={version:1,name:'冰火试验海岸',width,height,cells,spawn:[2,14.2],contents:{},properties:{},backdrop:'mountains'};
    for(let y=15;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]='#';
    const put=(x:number,y:number,t:Level['cells'][number])=>{cells[y*width+x]=t;};
    put(5,8,'F');put(9,10,'ice-flower');put(14,14,'J');put(18,14,'T');put(23,14,'B');
    for(let x=26;x<34;x++){for(let y=15;y<height;y++)put(x,y,'lava');put(x,11,'=');}
    put(29,9,'fire-jumper');l.properties![9*width+29]={jumpHeight:5,period:3};
    put(38,12,'?');l.contents![12*width+38]='ice-flower';put(42,14,'iron-turtle');put(48,14,'ghost');
    put(54,14,'giant-pearl');put(61,14,'B');put(62,14,'B');put(92,14,'E');return l;
}
