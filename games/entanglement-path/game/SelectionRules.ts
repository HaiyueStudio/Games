import { veilAlpha } from '../art/inkNoise';
export type GameMode = 'solo' | 'shared' | 'race' | 'life';
export interface SelectionChoice { mode: GameMode; board: number; seed: number }
export const MODE_CHOICES: readonly {id:GameMode;name:string;description:string}[] = [
  {id:'solo',name:'独行',description:'旋转与换牌，画出更长的山间水路'},
  {id:'shared',name:'共盘对弈',description:'与机器轮流落笔，先入死路者负'},
  {id:'race',name:'双盘竞分',description:'同种双盘，一人一手，比拼总分'},
  {id:'life',name:'续流',description:'六格余命 · 中心新路 +1 · 花木新路 +2'},
];
export const SCROLL_CLOSE_MS=480;
export const SCROLL_OPEN_MS=660;
export const PREVIEW_CHANGE_MS=640;
export function wrappedIndex(index: number, length: number): number { return ((index%length)+length)%length; }
export function scrollAmount(elapsed: number, opening: boolean): number {
  const t=Math.max(0,Math.min(1,elapsed/(opening?SCROLL_OPEN_MS:SCROLL_CLOSE_MS))),eased=t*t*(3-2*t);
  return opening?eased:1-eased;
}
export function previewAlpha(noise: number, progress: number, incoming: boolean): number {
  const old=veilAlpha(noise,progress);return incoming?1-old:old;
}
