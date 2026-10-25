import { PbrMaterial, CartesianTransform3D } from '@haiyue/engine';
import type { Cell, MinesweeperSaveData } from '../app/bootstrap';
import type { CellMaterials } from '../../shared/minesweeper/Theme';
import type { MinesHud } from '../ui/MinesHud';
import { CELL_SIZE, REVEAL_DROP, TILE_TOP } from '../rendering/BoardScene';
import type { MinesAudio } from '../../shared/minesweeper/audio/MinesAudio';
import { audioCounts, cueDelta, verifyAudioReady, verifyAudioControls } from '../../shared/minesweeper/audio/verifyAudio';

interface Host {
  canvas:HTMLCanvasElement; cells:Cell[][]; materials:CellMaterials; hud:MinesHud; audio:MinesAudio;
  reset():void; snapshot():MinesweeperSaveData; restore(state:MinesweeperSaveData):void;
  pick(x:number,y:number):number|null; project(cell:Cell):{x:number;y:number}; orbit():void;
}

/** Opt-in deterministic integration coverage. Exercises real GUI, cell meshes, saves and pointer chords. */
export async function verifyMinesweeper(host:Host) {
  const checks:string[]=[];
  const check:(value:unknown,message:string)=>asserts value=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
  const settle=async()=>{for(let i=0;i<6;i++)await new Promise(requestAnimationFrame);};
  const all=host.cells.flat(),cols=host.cells[0]!.length;
  const id=(cell:Cell)=>cell.row*cols+cell.col;
  const visible=(cell:Cell)=>{const p=host.project(cell),r=host.canvas.getBoundingClientRect();return p.y>r.top+170&&p.y<r.bottom-30&&host.pick(p.x,p.y)===id(cell);};
  const find=(predicate:(cell:Cell)=>boolean)=>{const cell=all.find(c=>visible(c)&&predicate(c));if(!cell)throw new Error('No visible Minesweeper fixture cell');return cell;};
  const click=async(cell:Cell,button=0)=>{
    const p=host.project(cell);
    for(const type of ['pointerdown','pointerup'])host.canvas.dispatchEvent(new PointerEvent(type,{clientX:p.x,clientY:p.y,button,
      buttons:type==='pointerdown'?button===2?2:1:0,pointerId:10001,pointerType:'mouse',bubbles:true}));
    await settle();
  };
  const capture=host.canvas.setPointerCapture.bind(host.canvas),release=host.canvas.releasePointerCapture.bind(host.canvas);
  host.canvas.setPointerCapture=pointer=>{if(pointer!==10001)capture(pointer);};
  host.canvas.releasePointerCapture=pointer=>{if(pointer!==10001)release(pointer);};
  try {
    await settle();
    verifyAudioReady(host.audio, check);
    check(all.length===81&&all.every(c=>c.visual.top.material instanceof PbrMaterial),'81 PBR tile faces on the configured 9x9 board');
    check(host.materials.numbers.length===9&&host.materials.numbers.every(m=>typeof m.baseColorTexture==='object'&&m.baseColorTexture&&'texture' in m.baseColorTexture),'Digits 1-8 use resident albedo textures');
    const first=host.cells[4]![4]!;
    await click(first);
    check(cueDelta(host.audio,{click:0,flag:0,explosion:0,button:0},{click:1}),'First-click flood expansion emits one tile cue');
    check(host.snapshot().phase==='playing'&&all.filter(c=>Math.abs(c.row-first.row)<=1&&Math.abs(c.col-first.col)<=1).every(c=>!c.isMine&&c.state==='revealed'),'First reveal protects its 3x3 neighborhood and flood opens zeros');
    const number=find(c=>c.state==='revealed'&&c.adjCount>0);
    check(number.visual.top.material===host.materials.numbers[number.adjCount]
      &&number.visual.root.getComponent(CartesianTransform3D)!.position[1]===Math.fround(REVEAL_DROP),'Revealed digits are attached to recessed tile faces');
    const flagCell=find(c=>c.state==='hidden'&&c.isMine);
    let beforeAudio=audioCounts(host.audio);
    await click(flagCell,2);
    const flag=flagCell.visual.flag;
    check(flag&&!flag.root.disabled&&flag.pole.geometry.positions.length>100&&flag.cloth.geometry.positions.length===36,'Flag has a planted metal collar/pole and folded pennant mesh');
    const yValues=Array.from(flag.pole.geometry.positions).filter((_,i)=>i%3===1);
    check(Math.min(...yValues)<TILE_TOP&&Math.max(...yValues)>TILE_TOP+.7,'Flagpole intersects its tile top rather than floating');
    await click(flagCell,2);await click(flagCell,2);
    check(cueDelta(host.audio,beforeAudio,{flag:3}),'Flag placement, removal and replacement emit one flag cue each');
    check(flagCell.visual.flag===flag&&!flag.root.disabled&&host.hud.elFlags.text==='1','Flag toggle reuses geometry and updates GUI counters');
    const saved=host.snapshot(),roots=all.map(c=>c.visual.root);
    beforeAudio=audioCounts(host.audio);
    host.reset();await settle();
    check(all.every((c,i)=>c.visual.root===roots[i]&&c.state==='hidden'&&(!c.visual.flag||c.visual.flag.root.disabled)),'Restart reuses all tile entities and hides cached markers');
    saved.elapsedSec=37;host.restore(saved);await settle();
    check(cueDelta(host.audio,beforeAudio,{}),'Reset and save restoration never replay gameplay audio');
    check(number.visual.top.material===host.materials.numbers[number.adjCount]&&!flag.root.disabled&&host.hud.timer.text==='37','Existing save shape restores PBR faces, flags and elapsed time');
    host.hud.update(4000);check(!host.hud.noticeSnapshot().visible,'Restored game notification disappears automatically');
    host.orbit();await settle();
    const rotated=find(c=>c.state==='hidden'&&!c.isMine&&c.adjCount>0);
    await click(rotated);
    check(rotated.state==='revealed'&&rotated.visual.top.material===host.materials.numbers[rotated.adjCount],'Ray picking and surface digits survive camera rotation');
    for(const firstButton of [0,2])for(const remaining of [1,2]) {
      const state=structuredClone(saved),target=find(c=>!c.isMine&&c.adjCount>0);
      for(const row of state.cells)for(const c of row)c.state='hidden';
      state.phase='playing';state.cells[target.row]![target.col]!.state='revealed';
      const neighbors=all.filter(c=>c!==target&&Math.abs(c.row-target.row)<=1&&Math.abs(c.col-target.col)<=1);
      for(const c of neighbors)if(c.isMine)state.cells[c.row]![c.col]!.state='flagged';
      host.restore(state);await settle();
      const beforeChord=audioCounts(host.audio);
      const p=host.project(target);
      const emit=(type:string,button:number,buttons:number)=>{const init={clientX:p.x,clientY:p.y,button,buttons,pointerId:10001,pointerType:'mouse',bubbles:true};host.canvas.dispatchEvent(type.startsWith('pointer')?new PointerEvent(type,init):new MouseEvent(type,init));};
      emit('pointerdown',firstButton,firstButton===0?1:2);emit('mousedown',firstButton===0?2:0,3);
      emit('mouseup',remaining===1?2:0,remaining);await settle();
      const once=JSON.stringify(host.snapshot());
      emit('pointerup',remaining===1?0:2,0);emit('mouseup',remaining===1?0:2,0);await settle();
      check(neighbors.filter(c=>!c.isMine).every(c=>c.state==='revealed')&&host.snapshot().phase!=='lost'
        &&once===JSON.stringify(host.snapshot()),`Dual-button chord is applied once: ${firstButton}/${remaining}`);
      check(cueDelta(host.audio,beforeChord,{click:1}),`Native chord emits one cue across both releases: ${firstButton}/${remaining}`);
    }
    host.restore(saved);await settle();
    const wrong=find(c=>c.state==='hidden'&&!c.isMine);await click(wrong,2);
    beforeAudio=audioCounts(host.audio);
    await click(find(c=>c.isMine&&c.state==='hidden'));
    check(cueDelta(host.audio,beforeAudio,{explosion:1}),'One mine hit emits one explosion without a tile cue or per-mine replay');
    check(host.snapshot().phase==='lost'&&all.filter(c=>c.isMine&&c.state!=='flagged').every(c=>c.visual.mine&&!c.visual.mine.disabled&&c.visual.top.material===host.materials.surfaces.mine),'Loss shows PBR mines on red textured faces');
    check(wrong.visual.top.material===host.materials.surfaces['wrong-flag']&&wrong.visual.flag?.cloth.material===host.materials.wrongCloth,'Wrong flags retain muted mesh pennants and crossed faces');
    const lost=host.snapshot();host.reset();host.restore(lost);await settle();
    check(wrong.visual.top.material===host.materials.surfaces['wrong-flag'],'Restoring a lost save preserves wrong flag visuals');
    const winning=structuredClone(saved),last=find(c=>!c.isMine);
    winning.phase='playing';
    for(let r=0;r<winning.rows;r++)for(let c=0;c<winning.cols;c++)winning.cells[r]![c]!.state=winning.cells[r]![c]!.isMine?'hidden':'revealed';
    winning.cells[last.row]![last.col]!.state='hidden';host.restore(winning);await settle();await click(last);
    check(host.snapshot().phase==='won'&&host.hud.noticeSnapshot().text.includes('CLEARED'),'Opening the final safe tile still wins the game');
    const restart=host.hud.snapshot().nodes.find(node=>node.text==='Restart')!;
    const rect=host.canvas.getBoundingClientRect();
    for(const type of ['pointerdown','pointerup'])host.canvas.dispatchEvent(new PointerEvent(type,{clientX:rect.left+restart.rect.x+restart.rect.width/2,
      clientY:rect.top+restart.rect.y+restart.rect.height/2,button:0,buttons:type==='pointerdown'?1:0,pointerId:10001,pointerType:'mouse',bubbles:true}));
    await settle();
    check(host.snapshot().phase==='idle'&&all.every(c=>c.state==='hidden'),'Skinned restart button resets the board without clicking through the GUI');
    await verifyAudioControls(host.audio,host.hud,host.canvas,check,settle,async()=>{
      await click(host.cells[4]![4]!);await click(find(c=>c.state==='hidden'&&c.isMine),2);
    });
    await click(host.cells[1]![1]!);
    for(const cell of all.filter(c=>visible(c)&&c.isMine&&c.state==='hidden').slice(0,4))await click(cell,2);
    host.hud.update(5000);await settle();
    check(host.snapshot().phase==='playing'&&String(host.hud.elFlags.text)==='4','Final deterministic frame contains recessed numbers and four mesh flags');
    return {schemaVersion:1,suite:'minesweeper-pbr',status:'passed',checks,audio:host.audio.snapshot(),final:{rows:host.cells.length,cols,flags:host.hud.elFlags.text,opened:host.hud.elOpen.text}};
  } finally {host.canvas.setPointerCapture=capture;host.canvas.releasePointerCapture=release;}
}
