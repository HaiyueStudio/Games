import { controllerOverlay } from './ui/ControllerOverlay';
import { GameReturnController } from '../session/GameReturnController';
import { GamepadSampler, NeutralGate, type PadFrame } from './sampler';
import { GAMEPAD_PROFILES, keyboardKey } from './profiles';
let current:PadFrame|undefined;
let pointerMode=false;
export const gamepadFrame=():PadFrame|undefined=>pointerMode?undefined:current;
export const isGamepadPointerMode=():boolean=>pointerMode;
const VIRTUAL_POINTER=9000;
/** Compatibility adapter for existing game input handlers. Physical sampling stays in Engine. */
export function installGamepad(id:string):()=>void {
  const profile=GAMEPAD_PROFILES[id];if(!profile)throw new Error(`Missing gamepad profile: ${id}`);
  const lifetime=new AbortController(),sampler=new GamepadSampler(),gate=new NeutralGate();
  const heldKeys=new Map<string,{since:number;repeat:number}>(),physicalKeys=new Set<string>();
  let frame=0,last=0,disposed=false,blocked=false,chord=false,back=false,lookActive=false;
  let x=innerWidth/2,y=innerHeight/2,target:Element|null=null,button=-1,downX=0,downY=0;
  let localPointer=profile.cursor??false;
  const captures=new Map<Element,()=>void>();
  const ensureCapture=(el:Element)=>{
    if(captures.has(el))return;
    const originals=['setPointerCapture','releasePointerCapture','hasPointerCapture'] as const;
    const descriptors=originals.map(name=>Object.getOwnPropertyDescriptor(el,name));
    const set=el.setPointerCapture.bind(el),release=el.releasePointerCapture.bind(el),has=el.hasPointerCapture.bind(el);
    el.setPointerCapture=n=>{if(n!==VIRTUAL_POINTER)set(n);};
    el.releasePointerCapture=n=>{if(n!==VIRTUAL_POINTER)release(n);};
    el.hasPointerCapture=n=>n===VIRTUAL_POINTER?target===el:has(n);
    captures.set(el,()=>originals.forEach((name,i)=>{const d=descriptors[i];if(d)Object.defineProperty(el,name,d);else delete (el as unknown as Record<string,unknown>)[name];}));
  };
  const emitKey=(code:string,down:boolean,repeat=false)=>{
    if(physicalKeys.has(code))return;
    const el=document.activeElement??document.body;
    el.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,key:keyboardKey(code),bubbles:true,cancelable:true,repeat}));
  };
  const mouse=(type:string,el:Element,b:number,buttons:number)=>{
    const init={bubbles:true,cancelable:true,clientX:x,clientY:y,button:b,buttons};
    if(type.startsWith('pointer'))el.dispatchEvent(new PointerEvent(type,{...init,pointerId:VIRTUAL_POINTER,pointerType:'mouse',isPrimary:true}));
    else el.dispatchEvent(new MouseEvent(type,init));
  };
  const rangeValue=()=>{if(target instanceof HTMLInputElement&&target.type==='range'){const r=target.getBoundingClientRect();const min=Number(target.min||0),max=Number(target.max||100),step=Number(target.step)||1;target.value=String(Math.round((min+Math.max(0,Math.min(1,(x-r.left)/r.width))*(max-min))/step)*step);target.dispatchEvent(new Event('input',{bubbles:true}));}};
  const releasePointer=(cancel=false)=>{
    if(!target)return;const el=target,b=button;
    mouse(cancel?'pointercancel':'pointerup',el,b,0);mouse('mouseup',el,b,0);
    if(!cancel){
      if(el instanceof HTMLInputElement&&el.type==='range')el.dispatchEvent(new Event('change',{bubbles:true}));
      else if(b===2)mouse('contextmenu',el,2,0);
      else if(Math.hypot(x-downX,y-downY)<10){
        const select=el.closest('select');
        if(select instanceof HTMLSelectElement){select.selectedIndex=(select.selectedIndex+1)%select.options.length;select.dispatchEvent(new Event('change',{bubbles:true}));}
        else mouse('click',el,0,0);
      }
    }
    target=null;button=-1;
  };
  const release=()=>{for(const code of heldKeys.keys())emitKey(code,false);heldKeys.clear();releasePointer(true);current=undefined;lookActive=false;delete document.body.dataset.gamepadActive;};
  const returnMenu = new GameReturnController(() => { release(); physicalKeys.clear(); gate.reset(); });
  const listen=(el:EventTarget,type:string,fn:EventListener)=>el.addEventListener(type,fn,{signal:lifetime.signal});
  listen(window,'keydown',e=>{if(e.isTrusted)physicalKeys.add((e as KeyboardEvent).code);});
  listen(window,'keyup',e=>{if(e.isTrusted){const code=(e as KeyboardEvent).code;physicalKeys.delete(code);if(heldKeys.has(code))queueMicrotask(()=>{if(!disposed&&heldKeys.has(code)&&!physicalKeys.has(code))emitKey(code,true);});}});
  listen(window,'blur',()=>{blocked=true;gate.reset();physicalKeys.clear();release();});
  listen(window,'focus',()=>{blocked=false;gate.reset();});
  listen(document,'visibilitychange',()=>{blocked=document.hidden;if(blocked){gate.reset();release();}});
  const loop=(time:number)=>{
    if(disposed)return;frame=requestAnimationFrame(loop);const dt=Math.min(.05,(time-last)/1000||0);last=time;
    const pads=sampler.sample();
    if(document.hidden||blocked){gate.reset();release();controllerOverlay.visible = false; controllerOverlay.cursor = false;return;}
    const devices=Array.from(navigator.getGamepads?.()??[]);const active=gate.filter(pads.filter(p=>devices[p.index]?.connected));
    if(!active.length){release();if(returnMenu.active)returnMenu.update(time,[]);controllerOverlay.visible = false; controllerOverlay.cursor = false;return;}
    if(returnMenu.active){release();returnMenu.update(time,active);controllerOverlay.visible = false; controllerOverlay.cursor = false;return;}
    if(active.some(p=>p.pressed.has('b8'))){returnMenu.request();return;}
    const p=active[0]!;
    // R3 is deferred until release so host chords cannot also toggle pointer mode.
    if(p.held.has('b11')){
      back=true;
      const command=p.held.has('b9')?'home':p.held.has('b4')?'previous':p.held.has('b5')?'next':null;
      release();
      if(command&&!chord){
        chord=true;
        if(command==='home')returnMenu.request();
        else if(parent!==window)parent.postMessage({type:'haiyue-gamepad-'+command},location.origin);
      }
      return;
    }
    if(back){if(!chord)localPointer=!localPointer;back=false;chord=false;release();gate.reset();return;}
    pointerMode=localPointer;
    current=p;
    document.body.dataset.gamepadActive='true';
    controllerOverlay.visible = true; controllerOverlay.text=profile.engineHud?'':`${localPointer?'指针模式 · 摇杆移动 · A 点选/拖拽 · B 右键 · LB/RB 滚动':profile.help+(profile.direct?'':' · 右摇杆/RT 操作菜单')} · Back 返回首页 · R3 切换指针 · R3+LB/RB 切游戏`;
    const rx=p.values.rx??0,ry=p.values.ry??0;
    const dx=localPointer?(p.values.x??0)+Number(p.held.has('b15'))-Number(p.held.has('b14')):0;
    const dy=localPointer?(p.values.y??0)+Number(p.held.has('b13'))-Number(p.held.has('b12')):0;
    const vx=profile.direct&&!localPointer?0:rx+dx,vy=profile.direct&&!localPointer?0:ry+dy;
    if(vx||vy){x=Math.max(1,Math.min(innerWidth-2,x+vx*700*dt));y=Math.max(1,Math.min(innerHeight-2,y+vy*700*dt));}
    const hit=target??document.elementFromPoint(x,y);
    controllerOverlay.cursor = localPointer || Math.abs(rx) + Math.abs(ry) > .05 || controllerOverlay.cursor;
    controllerOverlay.x = x; controllerOverlay.y = y;
    const wantButton=(localPointer&&p.held.has('b1'))||(!profile.direct&&!profile.buttons[6]&&p.held.has('b6'))?2:(localPointer&&p.held.has('b0'))||(!profile.direct&&!profile.buttons[7]&&p.held.has('b7'))?0:-1;
    if(target&&button!==wantButton)releasePointer();
    if(wantButton>=0&&!target&&hit){target=hit;button=wantButton;downX=x;downY=y;ensureCapture(target);if(target instanceof HTMLElement)target.focus({preventScroll:true});mouse('pointerdown',target,button,button===2?2:1);mouse('mousedown',target,button,button===2?2:1);rangeValue();}
    if(hit&&(vx||vy)){mouse('pointermove',target??hit,button,button===2?2:button===0?1:0);mouse('mousemove',target??hit,button,button===2?2:button===0?1:0);rangeValue();}
    if(localPointer&&p.pressed.has('b3')&&hit instanceof HTMLSelectElement){hit.selectedIndex=Math.max(0,hit.selectedIndex-1);hit.dispatchEvent(new Event('change',{bubbles:true}));}
    if(localPointer&&(p.held.has('b4')||p.held.has('b5'))){const deltaY=(p.held.has('b5')?1:-1)*500*dt;hit?.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:x,clientY:y,deltaY}));window.scrollBy(0,deltaY);}
    if(id==='minecraft-lite'&&!localPointer){
      const canvas=document.querySelector('canvas');
      if(canvas){
        ensureCapture(canvas);
        if(document.pointerLockElement===canvas){
          document.dispatchEvent(new MouseEvent('mousemove',{movementX:rx*1000*dt,movementY:ry*1000*dt}));
        }else if(!lookActive||rx||ry){
          const r=canvas.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
          for(const type of ['pointerdown','pointermove','pointerup'])canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:VIRTUAL_POINTER,pointerType:'mouse',clientX:cx+(type==='pointermove'?rx*1000*dt:0),clientY:cy+(type==='pointermove'?ry*1000*dt:0)}));
        }
        lookActive=true;
        for(const [action,b] of [['b7',0],['b6',2]] as const)if(p.pressed.has(action))canvas.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:b}));
      }
    }
    const next=new Set<string>();
    if(!profile.native)active.slice(0,profile.second?2:1).forEach((pad,i)=>{
      const mapping=i===0?profile.buttons:profile.second!,directions=i===0?profile.directions:profile.secondDirections;
      if(directions&&!localPointer){const [up,right,down,left]=directions;if((pad.values.y??0)<-.25||pad.held.has('b12'))next.add(up);if((pad.values.y??0)>.25||pad.held.has('b13'))next.add(down);if((pad.values.x??0)>.25||pad.held.has('b15'))next.add(right);if((pad.values.x??0)<-.25||pad.held.has('b14'))next.add(left);}
      for(const [b,key] of Object.entries(mapping))if((!localPointer||!['0','1','4','5','6','7'].includes(b))&&pad.held.has(`b${b}`))next.add(key);
    });
    for(const [code,state] of heldKeys){if(!next.has(code)){emitKey(code,false);heldKeys.delete(code);}else if(time-state.since>400&&time-state.repeat>100&&profile.directions?.includes(code)){emitKey(code,true,true);state.repeat=time;}}
    for(const code of next)if(!heldKeys.has(code)){heldKeys.set(code,{since:time,repeat:time});emitKey(code,true);}
  };
  const dispose=()=>{if(disposed)return;release();disposed=true;cancelAnimationFrame(frame);lifetime.abort();returnMenu.dispose();sampler.dispose();for(const restore of captures.values())restore();controllerOverlay.visible = false; controllerOverlay.cursor = false;pointerMode=false;};
  listen(window,'pagehide',e=>{release();if(!(e as PageTransitionEvent).persisted)dispose();});
  frame=requestAnimationFrame(loop);return dispose;
}
