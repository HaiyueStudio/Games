import { getEngineDiagnosticsSnapshot } from '@haiyue/engine/diagnostics';
import { Entity, HaiyueEngine } from '@haiyue/engine';
import { GuiButton, GuiElement, GuiLabel, GuiRoot } from '@haiyue/engine/gui';
import { guardDeferredPointerCapture } from '../canvasInput';
import { MapView } from './view';
import { moveWheelDrag, type WheelDrag } from './wheelDrag';
import { MapRuntime, pathMarker, markerIndex, centerIndex, cloneMap, parseMap, playIssues, worldSamples, type ValleyMap } from './model';

export async function chooseMap():Promise<ValleyMap|null>{
  return new Promise((resolve,reject)=>{
    const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;document.body.append(input);
    input.addEventListener('cancel',()=>{input.remove();resolve(null);},{once:true});
    input.addEventListener('change',async()=>{const file=input.files?.[0];input.remove();if(!file){resolve(null);return;}try{if(file.size>2_000_000)throw new Error('地图文件不能超过 2 MB。');const map=parseMap(JSON.parse(await file.text())),issues=playIssues(map);if(issues.length)throw new Error(issues.join('\n'));resolve(map);}catch(e){reject(e);}},{once:true});input.click();
  });
}
export async function startMapPlayer(map:ValleyMap):Promise<void>{
  const canvas=document.querySelector<HTMLCanvasElement>('#canvas')!,abort=new AbortController(),releaseCapture=guardDeferredPointerCapture(canvas,abort.signal);
  const engine=new HaiyueEngine({canvas,msaaSamples:4,diagnostics:{enabled:new URLSearchParams(location.search).has('verify')},devicePixelRatio:()=>Math.min(devicePixelRatio,2)});await engine.init();
  let runtime:MapRuntime;
  const texts='点击道路行走；绕动手轮，拖动平移机关。道路尚未连通。寻找开关，或调整机关。旅行者正在前往新的道路。山谷的另一侧，又多了一盏灯。开关已触发。物体组正在移动，稍后再选择道路。机关已就位。点击新的道路继续前行。载入地图重新开始返回序章前往出口正在加载角色地图模式开关已触发旋转视角恢复行走复位视角拖动画面，再次点击按钮恢复行走。';
  const view=new MapView(engine,'./assets/traveler.gltf',Array.from(new Set(texts+map.name+'0123456789 /·：')).join(''));
  runtime=new MapRuntime(cloneMap(map),view.project);let orbitMode=false;
  const root=new GuiRoot({theme:{fontSize:14,colors:{text:'#36544b',textMuted:'#7a897a',primary:'#397568',danger:'#aa785a',background:'#e6ece4',surface:'#f7f8ec',border:'#ced9c7',hover:'#dde8d5',active:'#c5d9bd',disabled:'#93a18b'}}});view.scene.add(new Entity('Map runtime HUD').addComponent(root));
  const title=root.add(new GuiLabel({text:map.name,fontSize:24,x:28,y:22,width:'60%',height:40}));
  const message=root.add(new GuiLabel({text:runtime.message,fontSize:14,style:{backgroundColor:'#f8f8ed',padding:14,radius:12}}));
  const restart=root.add(new GuiButton({text:'重新开始',onClick:()=>{cancel();runtime=new MapRuntime(cloneMap(map),view.project);}}));
  const load=root.add(new GuiButton({text:'载入地图',onClick:()=>{void chooseMap().then(async next=>{if(next){dispose();await startMapPlayer(next);}}).catch(e=>{runtime.message=String(e);if(disposed){const boot=document.getElementById('boot')!;boot.hidden=false;boot.textContent=String(e);}console.error(e);});}}));
  const back=root.add(new GuiButton({text:'返回序章',onClick:()=>{const url=new URL(location.href);url.search='';location.href=url.href;}}));
  const go=root.add(new GuiButton({text:'前往出口',variant:'primary',style:{color:'#fffdeb'},onClick:()=>{const exit=map.objects.find(o=>pathMarker(o)?.kind==='exit');if(exit&&runtime.walkTo(exit.id,markerIndex(exit)))view.pathClick.show(runtime,exit.id,markerIndex(exit));}}));
  const orbit=root.add(new GuiButton({text:'旋转视角',onClick:()=>{cancel();orbitMode=!orbitMode;orbit.setText(orbitMode?'恢复行走':'旋转视角');runtime.message=orbitMode?'拖动画面，再次点击按钮恢复行走。':'点击道路行走；绕动手轮，拖动平移机关。';}}));
  const resetView=root.add(new GuiButton({text:'复位视角',onClick:()=>{if(!runtime.walking&&!runtime.busy)view.resetAngle();}}));
  const setRect=(element:GuiElement,x:number,y:number,width:number,height:number)=>{element.layout=()=>{element.rect={x,y,width,height};};element.markDirty();};
  let width=0,height=0,drag:{id:number;x:number;y:number;hit:string;targetIndex?:number|undefined;value:number;moved:boolean;wheel:WheelDrag|null}|null=null,disposed=false,reported=false;
  const errors:string[]=[];engine.device.addEventListener('uncapturederror',e=>errors.push(e.error.message),{signal:abort.signal});
  function resize():void{const r=canvas.getBoundingClientRect();if(r.width===width&&r.height===height)return;if(drag)cancel();width=r.width;height=r.height;view.resize(width,height);view.fit();setRect(message,20,height-90,width-180,64);setRect(go,width-148,height-80,128,44);const gap=8,bw=Math.min(104,(width-40-gap*2)/3);setRect(restart,width-20-bw,24,bw,34);setRect(load,width-20-bw*2-gap,24,bw,34);setRect(back,width-20-bw*3-gap*2,24,bw,34);setRect(orbit,20,68,104,34);setRect(resetView,132,68,104,34);title.setVisible(width>700);}
  view.setMap(map,false,new URLSearchParams(location.search).get('batch')!=='0');resize();view.fit();
  const local=(e:PointerEvent)=>{const r=canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top] as const;};
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0||drag||orbitMode)return;const [x,y]=local(e);if(y<110||y>height-105)return;const wheelHit=view.pickWheel(x,y,runtime.poses),picked=wheelHit?null:view.pickTarget(x,y,runtime.poses,false),hit=wheelHit??picked?.id;if(!hit||(wheelHit&&(!runtime.canDrag(wheelHit)||!view.canTurnWheel(wheelHit))))return;drag={id:e.pointerId,x,y,hit,targetIndex:picked?.index,value:runtime.poses.mechanisms[hit]??0,moved:false,wheel:wheelHit&&runtime.canDrag(hit)?view.beginWheel(hit,[x,y],runtime.poses):null};canvas.setPointerCapture(e.pointerId);e.preventDefault();},{signal:abort.signal});
  canvas.addEventListener('pointermove',e=>{const d=drag;if(!d||d.id!==e.pointerId)return;const [x,y]=local(e),dx=x-d.x,dy=y-d.y;if(Math.hypot(dx,dy)>5)d.moved=true;if(!d.moved)return;const o=map.objects.find(o=>o.id===d.hit)!;if(d.wheel)runtime.dragTo(o.id,moveWheelDrag(d.wheel,[x,y],view.screen(view.wheelCenter(o,runtime.poses))));else if(o.type===4)runtime.dragTo(o.id,d.value+view.axisDelta(dx,dy,o.motion.axis));},{signal:abort.signal});
  canvas.addEventListener('pointerup',e=>{const d=drag;if(!d||d.id!==e.pointerId)return;drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(d.moved&&(d.wheel||map.objects.find(o=>o.id===d.hit)?.type===4))runtime.dragTo(d.hit,runtime.poses.mechanisms[d.hit]??d.value,true);else if(!d.wheel&&!d.moved){runtime.walkTo(d.hit,d.targetIndex);view.pathClick.show(runtime,d.hit,d.targetIndex);}},{signal:abort.signal});
  function cancel():void{view.setOrbitEnabled(canvas,false);if(drag){const d=drag;drag=null;runtime.dragTo(d.hit,d.value);releaseCapture(d.id);}}
  canvas.addEventListener('pointercancel',cancel,{signal:abort.signal});canvas.addEventListener('lostpointercapture',e=>{if(!canvas.hasPointerCapture(e.pointerId))cancel();},{signal:abort.signal});window.addEventListener('blur',cancel,{signal:abort.signal});
  engine.on('update',({detail:{delta}})=>{resize();const dt=document.hidden?0:Math.min(delta/1000,.05);runtime.tick(dt);if(drag?.wheel&&!runtime.canDrag(drag.hit))cancel();view.tick(dt,runtime);view.setOrbitEnabled(canvas,orbitMode&&!runtime.walking&&!runtime.busy,{x:0,y:110/height,width:1,height:Math.max(.01,(height-215)/height)});message.setText(runtime.message);go.setDisabled(runtime.busy||runtime.completed);resetView.setDisabled(runtime.walking||runtime.busy);
    if(!reported&&view.model.status==='loaded'){reported=true;document.getElementById('boot')!.hidden=true;const result=document.getElementById('result')!;result.dataset.status='passed';result.textContent=JSON.stringify({status:'passed',suite:'valley-map-player'});}
    if(!reported&&view.model.status==='error'){reported=true;const boot=document.getElementById('boot')!;boot.hidden=false;boot.textContent='角色资源加载失败，请检查 traveler.gltf 是否可访问。';const result=document.getElementById('result')!;result.dataset.status='failed';result.textContent=JSON.stringify({status:'failed',error:boot.textContent});}
  });
  if(new URLSearchParams(location.search).has('verify'))Object.defineProperty(window,'__valleyMapPlayer',{configurable:true,value:{snapshot:()=>({markers:view.markerTargets(runtime.poses),pathClick:view.pathClick.snapshot(),twistTargets:view.twistTargets(runtime.poses),performance:view.performanceSnapshot(),diagnostics:getEngineDiagnosticsSnapshot(engine).frame,traveler:view.travelerSnapshot(),surfaces:view.surfaceTargets(runtime.poses),position:runtime.position,up:runtime.up,water:view.waterSnapshot(),wheelStates:view.wheelSnapshot(),wheelFrames:Object.fromEntries(map.objects.filter(o=>o.type===3).map(o=>[o.id,view.wheelProjection(o,runtime.poses)])),camera:{theta:view.orbitTransform.theta,phi:view.orbitTransform.phi,orbit:orbitMode},map:cloneMap(map),at:runtime.at,busy:runtime.busy,walking:runtime.walking,completed:runtime.completed,fired:[...runtime.fired],poses:structuredClone(runtime.poses),model:view.model.status,errors,targets:Object.fromEntries(map.objects.map(o=>{const s=worldSamplesFor(o.id);return [o.id,view.screen(s)];}))})}});
  function worldSamplesFor(id:string):[number,number,number]{const o=map.objects.find(o=>o.id===id)!;const s=worldSamples(map,o,runtime.poses);return s[pathMarker(o)?markerIndex(o):centerIndex(o)]!.point;}
  function dispose():void{if(disposed)return;disposed=true;abort.abort();view.dispose();engine.destroy();}
  window.addEventListener('pagehide',dispose,{once:true,signal:abort.signal});engine.switchScene(view.scene);engine.run();
}
