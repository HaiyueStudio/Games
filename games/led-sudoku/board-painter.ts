import { boardWidth, boardLength } from './topology';
import { regionLetter } from './extra-regions';
import { littleKillerPath } from './little-killer';
import { THEMES, boardInk, type ThemeId } from './theme';
import { completionCellOpacity } from './completion-sweep';
import { t, type Language } from './i18n';
import { SEGMENTS, type Puzzle } from './rules';
import { drawDigit } from './led-display';
import { cageOutlines } from './cage-outline';
import type { HintStep } from './hint-explanation';

export interface ViewState { theme?: ThemeId; puzzle: Puzzle; board: number[]; notes: number[]; crossed?: number[]; selected: number; hint: number; solution: number[]; candidateMasks?: number[]; language?: Language; lesson?: HintStep; completed?: boolean; completionProgress?: number | undefined; }
export function boardGeometry(p: Puzzle): { inset: number; size: number } { return p.options.littleKiller ? {inset:40,size:550} : p.options.skyscraper ? {inset:30,size:570} : {inset:0,size:630}; }
/** Shared hit test includes the outside clue gutter; clue taps never select cells. */
export function boardCellAt(p: Puzzle, x: number, y: number): number {
  const {inset,size}=boardGeometry(p), col=Math.floor((x*630-inset)/size*boardWidth(p)), row=Math.floor((y*630-inset)/size*boardWidth(p));
  return col<0 || col>=boardWidth(p) || row<0 || row>=boardWidth(p) || p.blocked[row*boardWidth(p)+col] ? -1 : row*boardWidth(p)+col;
}
/** Shared CPU rasterization; browser and Native upload this board through Haiyue. */
export function paintBoard(c: CanvasRenderingContext2D, state: ViewState): void {
    const theme=state.theme ?? 'dark', colors=THEMES[theme], ink=(color:string)=>boardInk(theme,color);
    const { puzzle: p, board, notes, selected, hint, solution } = state;
    const width=boardWidth(p);
    const cageLabels=new Set(p.cages.map(cage=>Math.min(...cage.cells)));
    const notePosition=(i:number,d:number) => ({
      x:i%width*70+(p.options.killer?27:24)+((d-1)%3)*(p.options.killer?15:16),
      y:Math.floor(i/width)*70+(cageLabels.has(i)?26:16)+Math.floor((d-1)/3)*(cageLabels.has(i)?15:18),
    });
    const regions=p.options.extraRegion?p.extraRegions??[]:[], regionAt=Array<number>(boardLength(p)).fill(-1);regions.forEach((region,n)=>region.forEach(i=>regionAt[i]=n));
    c.setTransform(2, 0, 0, 2, 0, 0); c.fillStyle = ink('#061218'); c.fillRect(0, 0, 630, 630);
    const geometry=boardGeometry(p); c.save(); c.translate(geometry.inset,geometry.inset); c.scale(geometry.size/(width*70),geometry.size/(width*70));
    for (let i = 0; i < boardLength(p); i++) {
      if(p.options.staircase&&p.blocked[i])continue;
      const x = i % width * 70, y = Math.floor(i / width) * 70;
      const peer = selected >= 0 && (regionAt[i]!>=0 && regionAt[i]===regionAt[selected] || Math.floor(i / width) === Math.floor(selected / width) || i % width === selected % width || (Math.floor(i / (width*3)) === Math.floor(selected / (width*3)) && Math.floor(i % width / 3) === Math.floor(selected % width / 3)));
      const same = selected >= 0 && board[selected] && board[i] === board[selected];
      c.fillStyle = p.blocked[i] ? ink('#020609') : i === selected ? ink('#16474d') : i === hint ? ink('#4b3b20') : same ? ink('#16413e') : peer ? regionAt[i]!>=0?colors.regionPeer:ink('#0c252c') : regionAt[i]!>=0?colors.region:ink('#091a22');
      c.fillRect(x + 2, y + 2, 66, 66);
      if (!p.blocked[i] && p.options.parity && p.parity?.[i]) {
        c.fillStyle = p.parity[i] === 1 ? ink('#bc466550') : ink('#377fce60'); c.fillRect(x + 3, y + 3, 64, 64);
        c.fillStyle = p.parity[i] === 1 ? ink('#ff9fb3') : ink('#91caff'); c.font = 'bold 9px sans-serif'; c.fillText(t(state.language ?? 'zh', p.parity[i] === 1 ? 'odd' : 'even'), x + 52, y + 63);
      }
      if (!p.blocked[i] && p.options.diagonal && (i % 10 === 0 || (i > 0 && i < 80 && i % 8 === 0))) { c.fillStyle = ink('#7261bd33'); c.fillRect(x + 3, y + 3, 64, 64); }
      const sweep=p.blocked[i]?0:completionCellOpacity(i,state.completionProgress,width);
      if(sweep){c.fillStyle=`rgba(${colors.sweep},${sweep})`;c.fillRect(x+2,y+2,66,66);}
      if (p.blocked[i]) {
        c.strokeStyle = ink('#23333e'); c.lineWidth = 1; c.beginPath(); c.moveTo(x + 23, y + 23); c.lineTo(x + 47, y + 47); c.moveTo(x + 47, y + 23); c.lineTo(x + 23, y + 47); c.stroke();
      }
    }
    // Outline only the perimeter, keeping ordinary 3×3 grid boundaries intact.
    for(const region of regions){
      c.strokeStyle=colors.regionBorder;c.lineWidth=2;
      for(const i of region){const x=i%width*70,y=Math.floor(i/width)*70;c.beginPath();
        if(!region.includes(i-9)){c.moveTo(x+3,y+3);c.lineTo(x+67,y+3);}
        if(!region.includes(i+9)){c.moveTo(x+3,y+67);c.lineTo(x+67,y+67);}
        if(i%width===0||!region.includes(i-1)){c.moveTo(x+3,y+3);c.lineTo(x+3,y+67);}
        if(i%width===8||!region.includes(i+1)){c.moveTo(x+67,y+3);c.lineTo(x+67,y+67);}c.stroke();
      }
    }
    // Draw variant geometry behind the digits; every cage has its own boundary.
    c.lineJoin = 'round'; c.lineCap = 'round';
    if (p.options.multiDiagonal) (p.slants ?? []).forEach((line, n) => {
      const first = line[0]!, last = line[line.length - 1]!, dx = line[1]! % width - first % width;
      const x1 = first % width * 70 + 35 - dx * 35, y1 = Math.floor(first / width) * 70;
      const x2 = last % width * 70 + 35 + dx * 35, y2 = Math.floor(last / width) * 70 + 70;
      c.strokeStyle = ink('#ffcb70a0'); c.lineWidth = 3; c.setLineDash([7, 5]); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.setLineDash([]);
      c.save(); c.font = 'bold 10px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (const [x, y] of [[x1, y1], [x2, y2]]) {
        const xx = Math.max(9, Math.min(621, x!)), yy = Math.max(9, Math.min(621, y!));
        c.fillStyle = ink('#ffcb70'); c.beginPath(); c.arc(xx, yy, 7, 0, Math.PI * 2); c.fill(); c.fillStyle = ink('#122027'); c.fillText(String(n + 1), xx, yy);
      }
      c.restore();
    });
    if(p.options.thermometer) for(const path of p.thermometers ?? []) {
      c.lineCap='butt'; c.lineJoin='round';
      for(const [strokeWidth,color] of [[21,ink('#41948c')],[15,ink('#16393d')]] as const) {
        c.lineWidth=strokeWidth; c.strokeStyle=color; c.beginPath();
        path.forEach((i,n)=>n?c.lineTo(i%width*70+35,Math.floor(i/width)*70+35):c.moveTo(i%width*70+35,Math.floor(i/width)*70+35)); c.stroke();
      }
      const bulb=path[0]!; c.fillStyle=ink('#16393d'); c.strokeStyle=ink('#61b8a7'); c.lineWidth=2;
      c.beginPath(); c.arc(bulb%width*70+35,Math.floor(bulb/width)*70+35,25,0,Math.PI*2); c.fill();c.stroke();
    }
    c.lineCap='round';
    for (const line of p.lines) {
      c.strokeStyle = ink('#af88ff70'); c.lineWidth = 11; c.beginPath();
      line.forEach((i, n) => n ? c.lineTo(i % width * 70 + 35, Math.floor(i / width) * 70 + 35) : c.moveTo(i % width * 70 + 35, Math.floor(i / width) * 70 + 35)); c.stroke();
    }
    p.cages.forEach((cage) => {
      const first = Math.min(...cage.cells); c.font = 'bold 11px monospace'; c.fillStyle = ink('#ffc16a'); c.fillText(String(cage.sum), first % width * 70 + 8, Math.floor(first / width) * 70 + 15);
    });
    for (let i = 0; i < boardLength(p); i++) {
      if (p.blocked[i]) continue;
      const x = i % width * 70, y = Math.floor(i / width) * 70, v = board[i]!;
      const color = v ? v !== solution[i] ? colors.wrong : p.givens[i] ? colors.given : colors.user : colors.clue;
      const crossed = state.lesson ? 0 : state.crossed?.[i] ?? 0;
      const proofMask=state.lesson?.candidateMasks?.[i];
      const showProof=proofMask!==undefined && (!!state.candidateMasks?.[i] || !!notes[i] || !!state.crossed?.[i] || state.lesson!.cells.includes(i) || state.lesson!.evidence.includes(i));
      const contextMask=proofMask!==undefined ? (showProof?proofMask:0) : state.candidateMasks?.[i] ?? notes[i]!;
      const mask = !v ? (state.lesson && i === (state.lesson.candidateCell ?? hint) ? state.lesson.candidates.reduce((m,d)=>m|1<<(d-1),0) : contextMask | crossed) : 0;
      const hasNotes = !!mask;
      if (p.options.led !== false) {
        // A playable empty cell still has seven dark tubes. Only black cells omit them.
        drawDigit(c, v ? SEGMENTS[v]! : p.lights[i]!, x + (hasNotes ? p.options.killer ? 7 : 4 : 19), y + (hasNotes ? cageLabels.has(i) ? 23 : p.options.killer ? 8 : 5 : 14), hasNotes ? p.options.killer ? 14 : 16 : 42, color, colors.tube);
      } else if (v) {
        c.save(); c.fillStyle = color; c.font = `${p.givens[i] ? 600 : 500} 38px Arial, sans-serif`;
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(v), x + 35, y + 38); c.restore();
      }
      if (hasNotes) {
        c.save(); c.font = 'bold 13px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        for (let d = 1; d <= 9; d++) if (mask & 1 << (d - 1)) {
          const struck=!!(crossed & 1<<(d-1)),{x:dx,y:dy}=notePosition(i,d);
          c.fillStyle = struck ? ink('#c08894') : ink('#83b6ba');c.fillText(String(d),dx,dy);
          if(struck){c.strokeStyle=ink('#dc9aa7');c.lineWidth=1.6;c.beginPath();c.moveTo(dx-6,dy+6);c.lineTo(dx+6,dy-6);c.stroke();}
        }
        c.restore();
      }
      if (p.options.led !== false && !v && p.lights[i]) { c.fillStyle = colors.clue; c.fillRect(x + 57, y + 10, 3, 3); }
      if (i === selected) { c.strokeStyle = ink('#73ffcf'); c.lineWidth = 2; c.strokeRect(x + 2, y + 2, 66, 66); }
    }
    c.save();c.font='bold 8px sans-serif';c.textAlign='right';c.fillStyle=colors.regionBorder;regions.forEach((region,n)=>{const i=region[0]!;c.fillText(regionLetter(n),i%width*70+64,Math.floor(i/width)*70+65);});c.restore();
    c.lineCap = 'butt';
    // Draw only real cells, so a staircase gap has neither grid nor × markers.
    for(let i=0;i<boardLength(p);i++){
      if(p.options.staircase&&p.blocked[i])continue;
      const row=Math.floor(i/width),col=i%width,x=col*70,y=row*70;
      for(const [x1,y1,x2,y2,boundary] of [[x,y,x+70,y,row%3===0],[x,y+70,x+70,y+70,(row+1)%3===0],[x,y,x,y+70,col%3===0],[x+70,y,x+70,y+70,(col+1)%3===0]] as const){
        c.strokeStyle=boundary?ink('#4c7f88'):ink('#1c3943');c.lineWidth=boundary?2:1;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();
      }
    }
    // Stroke complete contours over the grid so crossing a cell border stays continuous.
    c.save();c.lineJoin='round';c.lineCap='round';c.lineWidth=1;c.setLineDash([3,3]);
    p.cages.forEach((cage,n)=>{
      c.strokeStyle=n%2?ink('#e9a85b99'):ink('#6caebb99');
      for(const contour of cageOutlines(cage.cells,width)) {
        c.beginPath();contour.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.stroke();
      }
    });
    c.restore();
    for (const [a, b] of p.dots) { c.fillStyle = ink('#e8fdff'); c.strokeStyle = ink('#091a22'); c.lineWidth = 2; c.beginPath(); c.arc((a % width + b % width + 1) * 35, (Math.floor(a / width) + Math.floor(b / width) + 1) * 35, 4, 0, Math.PI * 2); c.fill(); c.stroke(); }
    if (p.options.inequality) for (const [a, b] of p.inequalities ?? []) {
      const dx = b % width - a % width, dy = Math.floor(b / width) - Math.floor(a / width);
      const x = (a % width + b % width + 1) * 35, y = (Math.floor(a / width) + Math.floor(b / width) + 1) * 35;
      // When a consecutive dot shares this edge, offset the inequality along it.
      const shared = p.dots.some(pair => pair.includes(a) && pair.includes(b));
      const xx = x - (shared ? dy * 13 : 0), yy = y + (shared ? dx * 13 : 0);
      c.fillStyle = ink('#08171e'); c.beginPath(); c.arc(xx, yy, 8, 0, Math.PI * 2); c.fill();
      c.strokeStyle = ink('#ffdea1'); c.lineWidth = 2; c.beginPath();
      c.moveTo(xx + dx * 4 - dy * 4, yy + dy * 4 + dx * 4); c.lineTo(xx - dx * 4, yy - dy * 4); c.lineTo(xx + dx * 4 + dy * 4, yy + dy * 4 - dx * 4); c.stroke();
    }
    if (p.options.exclusion) for (const e of p.exclusions ?? []) {
      const x = (e.at % width + 1) * 70, y = (Math.floor(e.at / width) + 1) * 70;
      c.fillStyle = ink('#08171e'); c.strokeStyle = e.mask ? ink('#ffbf73') : ink('#c7ecff'); c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, 16, 0, Math.PI * 2); c.fill(); c.stroke();
      if (e.mask) drawDigit(c, e.mask, x - 8, y - 11, 20, colors.clue, colors.tube);
      else { c.save(); c.fillStyle = ink('#e2f6ff'); c.font = 'bold 18px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(e.digit), x, y + 1); c.restore(); }
    }
    if(p.options.xv) for(const clue of p.xvClues ?? []) {
      const [a,b]=clue.cells, x=(a%width+b%width+1)*35, y=(Math.floor(a/width)+Math.floor(b/width)+1)*35;
      c.fillStyle=ink('#19213e'); c.fillRect(x-9,y-10,18,20); c.strokeStyle=ink('#c1b5ff'); c.lineWidth=1; c.strokeRect(x-9,y-10,18,20);
      c.save(); c.fillStyle=ink('#ede4ff');c.font='bold 17px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(clue.sum===5?'V':'X',x,y+1);c.restore();
    }
    if(p.options.quadruple) for(const clue of p.fourSums ?? []) {
      const x=(clue.at%width+1)*70,y=(Math.floor(clue.at/width)+1)*70;
      c.fillStyle=ink('#062c39');c.strokeStyle=ink('#71ddff');c.lineWidth=1.5;c.beginPath();c.moveTo(x,y-21);c.lineTo(x+24,y);c.lineTo(x,y+21);c.lineTo(x-24,y);c.closePath();c.fill();c.stroke();
      c.save();c.fillStyle=ink('#b8eeff');c.font='bold 14px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(`Σ${clue.sum}`,x,y+1);c.restore();
    }
    if(state.lesson) {
      const step=state.lesson;
      c.save();c.textAlign='left';c.textBaseline='alphabetic';
      for(const i of [...new Set([...step.evidence,...step.cells])]) {
        const x=i%width*70,y=Math.floor(i/width)*70,color=step.cells.includes(i)?ink('#ffd18a'):ink('#73e3f2');
        c.strokeStyle=color;c.lineWidth=3;c.strokeRect(x+5,y+5,60,60);
        c.fillStyle=ink('#07171e');c.fillRect(x+5,y+53,40,12);c.fillStyle=color;c.font='bold 9px monospace';c.fillText(`R${Math.floor(i/width)+1}C${i%width+1}`,x+7,y+62);
      }
      for(const e of step.eliminations) for(const d of e.digits) {
        const {x,y}=notePosition(e.cell,d);
        c.fillStyle=ink('#321d26');c.fillRect(x-8,y-8,16,16);c.fillStyle=ink('#ffb1bd');c.font='bold 13px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(String(d),x,y);
        c.strokeStyle=ink('#ffb1bd');c.lineWidth=2;c.beginPath();c.moveTo(x-6,y+6);c.lineTo(x+6,y-6);c.stroke();
      }
      c.restore();
    }
    c.restore();
    if(p.options.littleKiller) {
      c.save();c.font='bold 19px sans-serif';c.fillStyle=theme==='light-blue'?'#9a482c':'#efae82';c.strokeStyle=c.fillStyle;c.lineWidth=2;c.lineCap='round';c.textAlign='center';c.textBaseline='middle';
      for(const clue of p.littleKillers??[]) {
        const path=littleKillerPath(clue),first=path[0]!,second=path[1]!,dx=second%width-first%width,dy=Math.floor(second/width)-Math.floor(first/width),step=geometry.size/width;
        // Aim through the first cell's centre, with both number and arrow outside.
        const x=geometry.inset+(first%width+.5-dx*.5)*step,y=geometry.inset+(Math.floor(first/width)+.5-dy*.5)*step;
        c.beginPath();c.moveTo(x-dx*18,y-dy*18);c.lineTo(x,y);
        c.moveTo(x-dx*8,y);c.lineTo(x,y);c.lineTo(x,y-dy*8);c.stroke();
        c.fillText(String(clue.sum),x-dx*27,y-dy*27);
      }
      c.restore();
    }
    if(p.options.skyscraper && p.skyClues) {
      c.save();c.font='bold 19px sans-serif';c.fillStyle=ink('#a9c7ff');c.textAlign='center';c.textBaseline='middle';
      for(let n=0;n<9;n++) {
        const at=30+(n+.5)*570/width;
        if(p.skyClues.top[n]) c.fillText(String(p.skyClues.top[n]),at,14);
        if(p.skyClues.bottom[n]) c.fillText(String(p.skyClues.bottom[n]),at,616);
        if(p.skyClues.left[n]) c.fillText(String(p.skyClues.left[n]),14,at);
        if(p.skyClues.right[n]) c.fillText(String(p.skyClues.right[n]),616,at);
      }
      c.restore();
    }
}
