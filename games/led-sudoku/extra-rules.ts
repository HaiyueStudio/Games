import { domainSumPossible, littleKillerPath } from './little-killer';
import type { Options, Puzzle } from './rules';
export type RuleKey = Exclude<keyof Options, 'difficulty'>;
export const RULE_NAMES: Partial<Record<RuleKey, string>> = { staircase:'阶梯数独', diagonal:'对角线', multiDiagonal:'多对角线', killer:'杀手数独', antiKing:'无缘数独', littleKiller:'小杀手', nonConsecutive:'不连续', extraRegion:'额外区域', parity:'奇偶数独', thermometer: '温度计', renban: '连续数', skyscraper: '摩天大楼', missing: '缺一门', xv: 'XV', inequality: '数比', consecutive: '相邻连续', quadruple: '四数和', exclusion: '排除点' };
export const RULE_CONFLICTS: readonly (readonly [RuleKey, RuleKey, string])[] = [
  ...(['diagonal','missing','killer','renban','consecutive','inequality','multiDiagonal','exclusion','thermometer','skyscraper','xv','quadruple','extraRegion','nonConsecutive','littleKiller','antiKing'] as const).map(key=>['staircase',key,'阶梯盘面目前支持 LED 与奇偶叠加，其他规则使用标准九宫布局'] as const),
  ['littleKiller','skyscraper','两种外侧数字的含义不同，避免手机边缘标记拥挤'],
  ['littleKiller','missing','小杀手斜线需要连续的可填格'],
  ['nonConsecutive','consecutive','不连续禁止相邻差 1，白点连续要求差 1'],
  ['nonConsecutive','renban','紫色连续线要求相邻差 1，与不连续规则相反'],
  ['extraRegion','missing','额外区域需要九个可填格组成完整的宫'],
  ['extraRegion','parity','避免区域底色与奇偶底色混淆'],
  ['thermometer', 'renban', '避免两种格内路径重叠'],
  ['skyscraper', 'missing', '摩天大楼需要完整的九格建筑序列'],
  ['xv', 'inequality', '避免格间 V 与大小符号混淆'],
  ['xv', 'consecutive', '避免格间标记重叠'],
  ['quadruple', 'exclusion', '两种标记都占用四格交点'],
];
export function optionConflict(options: Options): string | null {
  const pair = RULE_CONFLICTS.find(([a,b]) => options[a] && options[b]);
  return pair ? `${RULE_NAMES[pair[0]]}与${RULE_NAMES[pair[1]]}不能同时开启：${pair[2]}。` : null;
}
/** Last explicitly enabled rule wins; callers display the returned notice. */
export function selectRule(options: Options, key: RuleKey, enabled: boolean): { options: Options; notice: string } {
  const next = { ...options, [key]: enabled }; const messages: string[] = [];
  if (enabled) for (const [a,b,reason] of RULE_CONFLICTS) {
    const other = a === key ? b : b === key ? a : null;
    if (other && next[other]) { next[other] = false; messages.push(`已关闭${RULE_NAMES[other]}：${reason}`); }
  }
  return { options: next, notice: messages.join('；') };
}
/** 0 is an omitted exterior clue, displayed as blank. */
export interface SkyClues { top: number[]; right: number[]; bottom: number[]; left: number[]; }
export interface FourSum { at: number; sum: number; }
export interface XVClue { cells: [number, number]; sum: 5 | 10; }
export function visibleBuildings(values: readonly number[]): number {
  let high = 0, count = 0; for (const v of values) if (v > high) { high = v; count++; } return count;
}
/** Bitsets index legal permutations by position/digit. Sparse hard clues must not
 * scan tens of thousands of permutations for every candidate in every search node. */
interface SkyTable { words: number; masks: Uint32Array; }
const skyTables = new Map<string, SkyTable>();
function skyTable(front: number, back: number): SkyTable {
  const key = `${front}:${back}`, cached = skyTables.get(key); if (cached) return cached;
  const values = Array<number>(9).fill(0), matches: number[] = [];
  function visit(at: number, used: number, high: number, seen: number): void {
    if (front && (seen > front || seen + Math.min(9 - at, 9 - high) < front)) return;
    if (at === 9) { if ((!front || seen === front) && (!back || visibleBuildings(values.slice().reverse()) === back)) matches.push(...values); return; }
    for (let d = 1; d <= 9; d++) if (!(used & (1 << d))) {
      values[at] = d; visit(at + 1, used | (1 << d), Math.max(high,d), seen + (d > high ? 1 : 0));
    }
  }
  visit(0,0,0,0);
  const words = Math.ceil(matches.length / 9 / 32), masks = new Uint32Array(81 * words);
  for (let row = 0; row < matches.length / 9; row++) for (let i = 0; i < 9; i++) {
    const at = (i * 9 + matches[row * 9 + i]! - 1) * words + (row >>> 5);
    masks[at] = masks[at]! | 1 << (row & 31);
  }
  const table = { words, masks }; skyTables.set(key,table); return table;
}
export function skyLinePossible(values: readonly number[], front: number, back: number): boolean {
  if (values.every(Boolean)) return new Set(values).size === 9 && (!front || visibleBuildings(values) === front) && (!back || visibleBuildings(values.slice().reverse()) === back);
  if (!front && !back) return new Set(values.filter(Boolean)).size === values.filter(Boolean).length;
  const { words, masks } = skyTable(front,back);
  const offsets = values.flatMap((v,i) => v ? [(i * 9 + v - 1) * words] : []);
  if (!offsets.length) return words > 0;
  for (let word = 0; word < words; word++) {
    let compatible = masks[offsets[0]! + word]!;
    for (let n = 1; n < offsets.length && compatible; n++) compatible &= masks[offsets[n]! + word]!;
    if (compatible) return true;
  }
  return false;
}
interface SkyLine { cells: number[]; front: number; back: number; key: string; }
export interface ExtraContext { little: {cells:number[];sum:number}[][]; sumCache:Map<string,boolean>; thermometers: number[][][]; sums: FourSum[][]; xv: Map<string, number>; skyCache: Map<string, boolean>; skyLines: SkyLine[][]; }
export function extraContext(p: Puzzle): ExtraContext {
  const skyLines: SkyLine[][] = Array.from({length:81},()=>[]), sky=p.skyClues;
  if (p.options.skyscraper && sky) for(let n=0;n<9;n++) {
    for(const line of [{cells:Array.from({length:9},(_,i)=>n*9+i),front:sky.left[n]!,back:sky.right[n]!}, {cells:Array.from({length:9},(_,i)=>i*9+n),front:sky.top[n]!,back:sky.bottom[n]!}]) {
      if (!line.front && !line.back) continue;
      const indexed={...line,key:`${line.front}:${line.back}:`};
      for(const i of line.cells) skyLines[i]!.push(indexed);
    }
  }
  const little=p.options.littleKiller?(p.littleKillers??[]).map(clue=>({cells:littleKillerPath(clue),sum:clue.sum})):[];
  return {little:Array.from({length:81},(_,i)=>little.filter(clue=>clue.cells.includes(i))),sumCache:new Map(), thermometers: Array.from({length:81},(_,i) => p.options.thermometer ? (p.thermometers ?? []).filter(t=>t.includes(i)) : []), sums: Array.from({length:81},(_,i) => p.options.quadruple ? (p.fourSums ?? []).filter(s=>[s.at,s.at+1,s.at+9,s.at+10].includes(i)) : []), xv: new Map((p.xvClues ?? []).map(c=>[`${Math.min(...c.cells)}:${Math.max(...c.cells)}`,c.sum])), skyCache:new Map(), skyLines };
}
export function extraAllows(p: Puzzle, board: number[], i: number, v: number, ctx: ExtraContext, peers: number[][]): boolean {
  for(const clue of ctx.little[i]!) {
    const masks=clue.cells.map(j=>{
      if(j===i)return 1<<(v-1);
      if(board[j])return 1<<(board[j]!-1);
      let mask=511;for(const peer of peers[j]!) {const d=peer===i?v:board[peer];if(d)mask&=~(1<<(d-1));}
      return mask;
    });
    const key=clue.sum+':'+masks.join(',');let ok=ctx.sumCache.get(key);
    if(ok===undefined){ok=domainSumPossible(masks,clue.sum);if(ctx.sumCache.size>=6000)ctx.sumCache.clear();ctx.sumCache.set(key,ok);}
    if(!ok)return false;
  }
  for (const path of ctx.thermometers[i]!) {
    const at = path.indexOf(i);
    if (v < at+1 || v > 9-(path.length-1-at)) return false;
    for (let n=0;n<path.length;n++) if (n!==at && board[path[n]!] && (n<at ? v-board[path[n]!]! < at-n : board[path[n]!]!-v < n-at)) return false;
  }
  if (p.options.xv) for (const j of [i%9 ? i-1:-1,i%9<8?i+1:-1,i-9,i+9]) {
    if (j<0 || j>=81 || p.blocked[j]) continue;
    const target = ctx.xv.get(`${Math.min(i,j)}:${Math.max(i,j)}`), other = board[j];
    if (target ? other ? v+other!==target : target-v<1 || target-v>9 || target-v===v : other && (v+other===5 || v+other===10)) return false;
  }
  for (const clue of ctx.sums[i]!) {
    const cells = [clue.at,clue.at+1,clue.at+9,clue.at+10], values = cells.map(j=>j===i?v:board[j]!);
    function feasible(at: number, left: number): boolean {
      if (at===4) return left===0;
      if (left<4-at || left>9*(4-at)) return false;
      if (values[at]) return feasible(at+1,left-values[at]!);
      for (let d=1;d<=9;d++) {
        if (peers[cells[at]!]!.some(j => !cells.includes(j) && board[j]===d) || cells.some((j,n)=>n!==at && values[n]===d && peers[cells[at]!]!.includes(j))) continue;
        values[at]=d; const ok=feasible(at+1,left-d); values[at]=0; if(ok) return true;
      }
      return false;
    }
    if (!feasible(0,clue.sum)) return false;
  }
  if (p.options.skyscraper && p.skyClues) {
    for(const {cells,front,back,key:prefix} of ctx.skyLines[i]!) {
      const values=cells.map(j=>j===i?v:board[j]!), key=prefix+values.join('');
      let ok=ctx.skyCache.get(key); if(ok===undefined) { ok=skyLinePossible(values,front,back); if(ctx.skyCache.size>10000) ctx.skyCache.clear(); ctx.skyCache.set(key,ok); } if(!ok) return false;
    }
  }
  return true;
}
