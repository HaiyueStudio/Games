// Coordinate conversion of SMB2J's published area/enemy data, not a ROM loader.
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const game=resolve(import.meta.dirname,'..'),cache=resolve(game,'../../artifacts/whale-smb2-reference');
const files=['sm2main.asm','sm2data2.asm','sm2data3.asm','sm2data4.asm'];
if(process.argv.includes('--fetch')){
 mkdirSync(cache,{recursive:true});
 for(const file of files){
  const response=await fetch('https://raw.githubusercontent.com/threecreepio/smb2j-disassembly/master/'+file);
  if(!response.ok)throw Error(file+': HTTP '+response.status);writeFileSync(resolve(cache,file),await response.text());
 }
}
function tables(source){
 const output={};let current='';
 for(let line of source.split(/\r?\n/)){
  line=line.split(';')[0].trim();const label=/^(\w+):\s*(.*)$/.exec(line);
  if(label){current=label[1];output[current]={bytes:[],words:[]};line=label[2];}
  if(!current)continue;
  const data=/^\.(byte|word)\s+(.+)$/.exec(line);if(!data)continue;
  for(const token of data[2].split(',').map(t=>t.trim())){
   if(data[1]==='word')output[current].words.push(token);
   else if(/^\$[a-f\d]+$/i.test(token))output[current].bytes.push(parseInt(token.slice(1),16));
   else if(/^%[01]+$/.test(token))output[current].bytes.push(parseInt(token.slice(1),2));
   else if(/^\d+$/.test(token))output[current].bytes.push(Number(token));
  }
 }
 return output;
}
const source=files.map(file=>tables(readFileSync(resolve(cache,file),'utf8'))),terrain=source[0].TerrainRenderBits.bytes;
const banks=[source[0],{...source[0],...source[1]},{...source[0],...source[1],...source[2]},{...source[0],...source[3]}];
const worlds=['1','2','3','4','5','6','7','8','9','A','B','C','D'];
const bankFor=index=>banks[index<4?0:index<8?1:index===8?2:3];
const areaKey=(bank,pointer,prefix='L')=>bank[prefix==='L'?'AreaDataAddrs':'EnemyDataAddrs'].words[(pointer&31)+bank[prefix==='L'?'AreaDataHOffsets':'EnemyAddrHOffsets'].bytes[pointer>>5&3]];
function objects(bytes,start=2,enemy=false){
 const records=[];let page=0;
 for(let offset=start;offset<bytes.length;){
  const a=bytes[offset++];if(a===(enemy?255:253))break;
  const b=bytes[offset++];if(b===undefined)throw Error('Incomplete area object');
  const row=a&15;if(b&128)page++;
  if(row===(enemy?15:13)&&!(enemy?b&128:b&64)){page=b&(enemy?63:31);continue;}
  const record={x:page*16+(a>>4),row,code:b&127,page,offset:offset-2};
  if(enemy&&row===14)record.extra=bytes[offset++];
  records.push(record);
 }
 return records;
}
const converted=[];
for(const [worldIndex,world] of worlds.entries()){
 const bank=bankFor(worldIndex),sequence=bank['World'+world+'Areas'].bytes.slice();
 if(sequence.length===5)sequence.splice(1,1);
 for(let stage=0;stage<4;stage++){
  const course=world+'-'+(stage+1),mainPointer=sequence[stage],rooms=new Map(),queue=[mainPointer];
  const worldNumber=worldIndex>=9?worldIndex-9:worldIndex;
  while(queue.length){
   const pointer=queue.shift();if(rooms.has(pointer))continue;
   if(rooms.size>=8)throw Error(course+' contains too many areas');
   const key=areaKey(bank,pointer),bytes=bank[key]?.bytes;
   if(!bytes||bytes.length<3)throw Error('Missing '+course+' '+key);
   const records=objects(bytes),enemies=objects(bank[areaKey(bank,pointer,'E')]?.bytes??[255],0,true);
   const links=enemies.filter(o=>o.row===14&&(worldIndex===8||o.extra>>5===worldNumber));
   const flag=records.find(o=>o.row===13&&o.code===65),axe=records.find(o=>o.row===13&&o.code===66);
   const width=Math.max(32,Math.min(512,Math.ceil(Math.max(...records.map(o=>o.x+(o.row<13?(o.code&15)+2:16)),flag?flag.x+16:0,axe?axe.x+20:0))));
   const height=20,type=pointer>>5&3,water=type===0,cloud=bytes[1]>>6===3;
   const level={version:1,name:course+' · '+(water?'水下秘径':type===2?'深层地窟':type===3?'险峻城堡':'失落海岸'),width,height,spawn:[2,14.2],
    finish:axe?'castle':'flag',backdrop:type===3?'night':type===2?'castle':worldIndex%2?'night':'coast',theme:type===3?'castle':type===2?'underground':'coast',
    progress:{lives:true,initialLives:3},cells:Array(width*height).fill(water?'water':'.'),contents:{},properties:{}};
   if(water){level.liquid={kind:'water',low:0,high:0,mode:'rise',period:1};level.spawn=[2,12];}
   const set=(x,y,t)=>{x=Math.floor(x);y=Math.floor(y);if(x>=0&&x<width&&y>=0&&y<height)level.cells[y*width+x]=t;};
   const rect=(x,y,w,h,t)=>{for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++)set(x+dx,y+dy,t);};
   const prop=(x,y,p)=>{const id=Math.floor(y)*width+Math.floor(x);level.properties[id]={...level.properties[id],...p};};
   const pipe=(x,y,length,rotation=0,plant=true)=>{
    length=Math.max(1,Math.min(16,Math.min(length,height-y)));rect(x,y,2,length,'p');set(x,y,'P');set(x+1,y,'Q');
    for(let row=1;row<length;row++)set(x+1,y+row,'q');prop(x,y,{length,rotation,plant});
   };
   // Terrain control changes are column-local. The 13 bit rows are shifted by
   // four tiles to match the already converted first game's vertical origin.
   let control=bytes[1]&15;
   for(let x=0;x<width;x++){
    for(const o of records.filter(o=>o.x===x&&o.row===14)){
     if(!(o.code&64))control=o.code&15;
    }
    const bits=[terrain[control*2],terrain[control*2+1]];
    // The original parser consumes each byte least-significant bit first.
    for(let row=0;row<13;row++)if(bits[row>>3]&(1<<(row%8)))set(x,row+4,cloud&&row>=8?'=':'#');
    if(level.cells[16*width+x]==='#')rect(x,17,1,height-17,'#');
   }
   const vines=[],platforms=[];
   for(const o of records){
    const x=o.x,y=o.row+4,kind=o.code>>4&7,n=(o.code&15)+1;
    if(o.row===14)continue;
    if(o.row<12&&kind){
     if(kind===0||kind===7)pipe(x,y,(o.code&7)+1,0,true);
     else if(kind===1){
      const style=bytes[1]>>6;
      if(style===2){const h=Math.min(8,n);rect(x,y,1,h,'cannon-body');set(x,y+h-1,'cannon');prop(x,y+h-1,{height:h});}
      else{rect(x,y,n,1,'=');if(style===0&&!cloud&&n>2)rect(x+1,y+1,n-2,height-y-1,'#');}
     }else if(kind===2)rect(x,y,n,1,'B');else if(kind===3)rect(x,y,n,1,'#');else if(kind===4)rect(x,y,n,1,'o');
     else if(kind===5)rect(x,y,1,Math.min(n,height-y),'B');else if(kind===6)rect(x,y,1,Math.min(n,height-y),'#');
    }else if(o.row<12){
     const id=o.code&15;
     if(id<=12){
      const hidden=id===3||id===4||id===5||id===6;
      set(x,y,hidden?'hidden-block':'?');
      const reward=[1,5,8].includes(id)?'poison-pearl':[0,6,7].includes(id)?'auto':id===4||id===12?'one-up':id===10?'star':id===9?'empty':'coin';
      level.contents[y*width+x]=reward;
      if(id===9){const top=Math.max(1,y-5);rect(x,top,1,y-top,'vine');vines.push({x,y:top});}
     }else if(id===13){pipe(x,y,Math.max(1,15-y),0,false);}else if(id===14)set(x,y,'U');else set(x,y,'spring-v');
    }else if(o.row===12){
     if(kind===0)rect(x,12,n,8,water?'water':'.');
     else if(kind===1)platforms.push({x,y:8,w:n});
     else if(kind>=2&&kind<=4)rect(x,kind===2?11:kind===3?12:14,n,1,'=');
     else if(kind===5)rect(x,14,n,6,'lava');
     else rect(x,kind===6?7:11,n,1,'?');
    }else if(o.row===15){
     if(kind===3){for(let col=0;col<n;col++){const top=Math.max(7,14-col);rect(x+col,top,1,15-top,'#');}}
     else if(kind===4){rect(x,11,2,4,water?'water':'.');pipe(x,13,2,0,false);}
     else if(kind===6||kind===7)pipe(x,kind===6?5:8,Math.min(n,10),180,true);
    }else if(o.row===13){
     const id=o.code&63;
     if(id===1){set(x,14,'E');rect(x,15,width-x,height-15,'#');}
     else if(id===2)set(x,10,'bridge-bell');
     else if(id===4)rect(x,12,13,1,'bridge');
     else if(id===12)level.wind={mode:'constant',direction:'right',strength:2,period:6};
    }
   }
   // Normal pipe objects whose usage bit is set share dispatch index zero.
   for(const o of records)if(o.row<12&&(o.code&112)===112&&(o.code&8))pipe(o.x,o.row+4,(o.code&7)+1);
   let balanceLink=20;
   for(const e of enemies){
    if(e.row>=14)continue;
    const x=e.x,y=e.row+3,kind=e.code&63;
    const types={0:'T',1:'T',2:'iron-turtle',3:'T',5:'hammer-otter',6:'J',7:'squid',8:'cannonball',10:'fish',11:'fish',12:'fire-jumper',14:'T',15:'T',16:'T',18:'spiky'};
    if(kind===17){(level.classicFeatures??={}).spawners??=[];level.classicFeatures.spawners.push({kind:'lakitu',start:x,end:Math.max(x+1,width-16),y:4,period:2.5});}
    else if(kind>=27&&kind<=34){set(x,y,'firebar');prop(x,y,{length:kind>=31?12:6,speed:kind%2?1.4:-1.4,phase:0});}
    else if(kind>=36&&kind<=44){
     const length=3;set(x,y,'moving-platform');
     prop(x,y,{length,axis:kind===40||kind===42?'x':'y',range:kind===40||kind===42?[Math.max(0,x-3),Math.min(width,x+5)]:[Math.max(2,y-4),18],speed:kind===39||kind===44?2:-2,
      ...(kind===36?{platformMode:'balance',link:balanceLink++}:{}),...(kind===41?{platformMode:'fall'}:{}),...(kind===38||kind===39||kind===43||kind===44?{loop:true}:{})});
    }else if(kind===45){/* boss placed below with the axe and bridge */}
    else if(kind===13){const anchors=Object.keys(level.properties).map(Number).filter(id=>level.cells[id]==='P');const anchor=anchors.sort((a,b)=>Math.abs(a%width-x)-Math.abs(b%width-x))[0];if(anchor!==undefined)level.properties[anchor].plant=true;}
    else if(types[kind]){
     const tile=types[kind];let yy=Math.max(1,Math.min(16,y));
     if(tile==='fire-jumper'){yy=Math.max(5,Math.min(10,y));set(x,yy,tile);prop(x,yy,{period:3});}
     else if(tile==='fish'&&!water){(level.classicFeatures??={}).spawners??=[];level.classicFeatures.spawners.push({kind:'fish',start:Math.max(0,x-2),end:Math.min(width,x+8),y:18,period:3});}
     else{set(x,yy,tile);if(water)prop(x,yy,{liquid:'water'});if(kind===3)prop(x,yy,{smart:true});if(kind>=14&&kind<=16)prop(x,yy,kind===15?{flight:[Math.max(1,yy-4),Math.min(18,yy+2)]}:{winged:true});}
    }else if(kind>=55&&kind<=62){
     const count=kind%2?2:3,tile=kind<59?'J':'T';for(let i=0;i<count;i++)set(x+i*2,14,tile);
    }else if(kind===20||kind===23){(level.classicFeatures??={}).spawners??=[];level.classicFeatures.spawners.push({kind:kind===20?'fish':'cannonball',start:x,end:Math.max(x+1,width-16),y:18,period:2});}
   }
   // Pair balance platforms in source order. A lone platform remains a normal elevator.
   const balances=Object.entries(level.properties).filter(([,p])=>p.platformMode==='balance');
   for(let i=0;i<balances.length;i++){const [key,p]=balances[i];if(i%2===0&&i+1===balances.length){delete p.platformMode;delete p.link;}else p.link=20+Math.floor(i/2);}
   if(axe){
    const bell=axe.x,bridgeStart=bell-13;rect(bridgeStart,13,13,7,'lava');rect(bridgeStart,12,13,1,'bridge');
    rect(bell,11,3,9,'#');set(bell,10,'bridge-bell');rect(bell+3,15,width-bell-3,5,'#');
    const bx=bell-5;rect(bx,10,2,2,'boss-body');set(bx,10,'turtle-boss');prop(bx,10,{link:1});set(bell+10,14,'E');
   }
   for(const p of platforms){set(p.x,p.y,'moving-platform');prop(p.x,p.y,{length:Math.min(16,p.w),axis:'y',range:[3,17],speed:2});}
   // Exit-pipe shafts share columns with the final wall. Restore their complete
   // collider after the source's overlapping background columns are expanded.
   for(const [key,p]of Object.entries(level.properties))if(level.cells[key]==='P'){
    const x=Number(key)%width,y=Math.floor(Number(key)/width);
    for(let dy=0;dy<p.length;dy++)for(let dx=0;dx<2;dx++)set(x+dx,y+dy,dy===0?(dx?'Q':'P'):dx?'q':'p');
   }
   const cannonCells=new Set();
   for(const [key,p]of Object.entries(level.properties))if(level.cells[key]==='cannon')for(let dy=0;dy<(p.height??2);dy++){
    const at=Number(key)-dy*width;level.cells[at]=dy?'cannon-body':'cannon';cannonCells.add(at);
   }
   level.cells.forEach((t,id)=>{if(t==='cannon-body'&&!cannonCells.has(id))level.cells[id]='#';});
   for(const id of Object.keys(level.properties))if(level.cells[id]==='.'||level.cells[id]==='water')delete level.properties[id];
   for(const id of Object.keys(level.contents))if(!['?','hidden-block'].includes(level.cells[id]))delete level.contents[id];
   // Spawn on the first reachable floor, below any ceiling.
   if(!water){const x=2;for(let y=14;y>=4;y--)if(['#','=','B','P','Q'].includes(level.cells[y*width+x])&&!['#','B'].includes(level.cells[(y-1)*width+x])){level.spawn=[2,y-.8];break;}}
   rooms.set(pointer,{level,links,key,records,vines});
   for(const link of links){const target=link.code&127;if(areaKey(bank,target)&&!rooms.has(target))queue.push(target);}
  }
  const areaId=pointer=>pointer===mainPointer?'main':'area-'+pointer.toString(16);
  for(const [pointer,room] of rooms){
   const l=room.level;
   for(const link of room.links){
    const to=link.code&127,target=rooms.get(to);if(!target)continue;
    const anchors=Object.keys(l.properties).map(Number).filter(id=>l.cells[id]==='P');
    let anchor=anchors.sort((a,b)=>Math.abs(a%l.width-link.x)-Math.abs(b%l.width-link.x))[0];
    const vine=room.vines.find(v=>Math.abs(v.x-link.x)<=4&&(anchor===undefined||Math.abs(v.x-link.x)<Math.abs(anchor%l.width-link.x)));
    if(vine){anchor=vine.y*l.width+vine.x;l.cells[anchor]='warp-box';l.properties[anchor]={};}
    if(anchor===undefined||Math.abs(anchor%l.width-link.x)>6){const x=Math.min(l.width-3,link.x),y=12;for(let dy=0;dy<3;dy++){l.cells[(y+dy)*l.width+x]=dy?'p':'P';l.cells[(y+dy)*l.width+x+1]=dy?'q':'Q';}anchor=y*l.width+x;l.properties[anchor]={length:3};}
    const page=link.extra&31,x=Math.max(1,Math.min(target.level.width-3,page*16+2));
    let y=12;for(let row=16;row>=5;row--)if(['#','=','B','P'].includes(target.level.cells[row*target.level.width+x])&&target.level.cells[(row-1)*target.level.width+x]!== '#'){y=row-2;break;}
    if(pointer===to){(l.warps??=[]).push({from:[anchor%l.width,Math.floor(anchor/l.width)],to:[x+.5,y+1]});}
    else l.properties[anchor]={...l.properties[anchor],area:areaId(to),targetX:x,targetY:Math.max(1,y)};
   }
   // Scroll-lock warp objects use the cartridge's world lookup table, including
   // backward warps. They are explicit course links, separate from room links.
   const zone=room.records.find(o=>o.row===13&&(o.code&63)===5);
   if(zone){
    let destination;
    if(worldIndex>=9)destination=['5','B','C','D'][stage];
    else if(worldIndex===0)destination=(pointer>>5&3)===1?'3':(pointer&31)===0?'2':'4';
    else if(worldIndex===2)destination='1';
    else if(worldIndex===4)destination=(pointer&31)===11?'6':(pointer>>5&3)===1?'8':'7';
    else destination='5';
    const anchors=Object.keys(l.properties).map(Number).filter(id=>l.cells[id]==='P'&&Math.abs(id%l.width-zone.x)<20).sort((a,b)=>Math.abs(a%l.width-zone.x)-Math.abs(b%l.width-zone.x));
    if(anchors.length){const props=l.properties[anchors[0]];delete props.area;props.destination={pack:'lost-levels',course:destination+'-1'};}
   }
   for(const key of Object.keys(l.contents))if(!['?','hidden-block'].includes(l.cells[key]))delete l.contents[key];
  }
  const main=rooms.get(mainPointer).level,areas=Object.fromEntries([...rooms].filter(([p])=>p!==mainPointer).map(([p,r])=>[areaId(p),r.level]));
  if(Object.keys(areas).length)main.areas=areas;
  if(!main.cells.includes('E')&&!Object.values(areas).some(l=>l.cells.includes('E'))){
   // Area-end scroll commands complete a few bonus worlds without a flag object.
   const target=[main,...Object.values(areas)].at(-1),x=target.width-10;
   for(let col=x-3;col<target.width;col++)for(let row=15;row<20;row++)target.cells[row*target.width+col]='#';target.cells[14*target.width+x]='E';
  }
  converted.push(main);console.log(course,main.width,rooms.size,'areas');
 }
}
function pack(level){const {cells,areas,...metadata}=level,runs=[];for(const tile of cells){if(runs.at(-1)?.[0]===tile)runs.at(-1)[1]++;else runs.push([tile,1]);}return {...metadata,runs,...(areas?{areas:Object.fromEntries(Object.entries(areas).map(([id,l])=>[id,pack(l)]))}:{})};}
writeFileSync(resolve(game,'levels/lost-levels-data.ts'),`// Generated from public SMB2J coordinate definitions. See MAP_PACKS.md.\nimport {lazyClassic} from './classic-codec';\nexport const lostLevelsData = [\n${converted.map(l=>'    lazyClassic('+JSON.stringify(pack(l))+'),').join('\n')}\n];\n`);
writeFileSync(resolve(game,'levels/lost-levels-provenance.json'),JSON.stringify({retrieved:new Date().toISOString().slice(0,10),levelCount:converted.length,sources:files.map(file=>({url:'https://github.com/threecreepio/smb2j-disassembly/blob/master/'+file,sha256:createHash('sha256').update(readFileSync(resolve(cache,file))).digest('hex')})),conversion:'Area objects and enemies translated to Whale Maker tiles, four-tile vertical origin, existing Whale Maker physics and artwork'},null,2)+'\n');
