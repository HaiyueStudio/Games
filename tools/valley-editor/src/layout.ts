import type { HYSplit } from './ui';
const KEY='haiyue-valley-editor-layout-v2';
const IDS=['layout-left','layout-right','layout-library','layout-inspector'] as const;
/** Product-level layout preferences; resizing never enters the map's undo history. */
export class EditorLayout {
  private readonly splits=IDS.map(id=>document.getElementById(id) as HYSplit);
  private timer=0;
  constructor(signal:AbortSignal){
    this.defaults();
    try {const saved:unknown=JSON.parse(localStorage.getItem(KEY)??'null');if(Array.isArray(saved)&&saved.length===IDS.length&&saved.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1))this.splits.forEach((s,i)=>s.ratio=saved[i] as number);}catch{/* Storage may be unavailable; layout remains usable for this session. */}
    for(const split of this.splits)split.addEventListener('ratio-change',event=>{
      if(event.target!==split)return;clearTimeout(this.timer);this.timer=window.setTimeout(()=>{this.timer=0;this.save();},200);
    },{signal});
    signal.addEventListener('abort',()=>{if(this.timer){clearTimeout(this.timer);this.save();}},{once:true});
  }
  reset():void {clearTimeout(this.timer);this.timer=0;this.defaults();this.save();}
  private defaults():void {
    const width=document.getElementById('workspace')!.clientWidth,left=width<1200?366:440,right=width<1200?250:290;
    this.splits[0]!.ratio=left/Math.max(1,width-6);this.splits[1]!.ratio=1-right/Math.max(1,width-left-12);
    this.splits[2]!.ratio=.48;this.splits[3]!.ratio=.66;
  }
  private save():void {try{localStorage.setItem(KEY,JSON.stringify(this.splits.map(s=>s.ratio)));}catch{/* Persistence is optional. */}}
}
