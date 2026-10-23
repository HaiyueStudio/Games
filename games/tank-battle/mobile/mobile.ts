import { GameEngine } from '../../session/GameEngine';
import { gamepadFrame } from '../../gamepad/runtime';
import { MobileTankGame } from './MobileTankGame';
import { guardQueuedPointerCapture } from '../../shared/input/pointerCapture';
import { SingleSlotGameSave } from '../../save/SingleSlotGameSave';
import { isGameState, type GameState } from '../rules/rules';
import { ArcadeAudio } from '../audio/audio';
export async function launchMobile(): Promise<void> {
  document.documentElement.classList.add('tank-mobile');
  const canvas=document.querySelector<HTMLCanvasElement>('#gui')!;
  const restore=guardQueuedPointerCapture(canvas);
  const engine=new GameEngine({canvas,msaaSamples:4,clearColor:{r:.06,g:.09,b:.055,a:1},devicePixelRatio:()=>Math.min(devicePixelRatio,2)});
  let game:MobileTankGame|undefined;
  const abort=new AbortController();
  const audio=new ArcadeAudio();
  const dispose=()=>{abort.abort();game?.dispose();audio.dispose();engine.destroy();restore();};
  try {
    const atlas=new Image(),controls=new Image();atlas.src='./assets/mobile-atlas.png';controls.src='./assets/controls.png';
    await Promise.all([atlas.decode(),controls.decode(),engine.init()]);
    const saves=new SingleSlotGameSave<GameState>({gameId:'tank-battle-mobile',name:'铁甲前线 1P',validateData:isGameState});
    const saved=await saves.load();
    game=new MobileTankGame(engine,atlas,controls,{read:()=>saved,write:state=>saves.save(structuredClone(state))},{},{unlock:()=>audio.unlock(),play:sound=>audio.play(sound),stop:()=>audio.suspend()});
    engine.on('update',({detail:{time,delta}})=>{
      const p=gamepadFrame();
      const x=(p?.values.x??0)+Number(p?.held.has('b15')??false)-Number(p?.held.has('b14')??false);
      const y=(p?.values.y??0)+Number(p?.held.has('b13')??false)-Number(p?.held.has('b12')??false);
      game!.update(time,delta,p?{input:{direction:Math.abs(x)+Math.abs(y)<.25?null:Math.abs(x)>Math.abs(y)?(x>0?1:3):(y>0?2:0),fire:p.held.has('b0')||p.held.has('b2')},confirm:p.pressed.has('b0'),pause:p.pressed.has('b9')}:undefined);
    });
    window.addEventListener('blur',()=>game!.pause(),{signal:abort.signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)game!.pause();},{signal:abort.signal});
    window.addEventListener('pagehide',e=>{game!.pause();if(!e.persisted)dispose();},{signal:abort.signal});
    if(new URLSearchParams(location.search).has('verify'))Object.defineProperty(window,'__tankBattle',{configurable:true,value:{snapshot:()=>game!.snapshot().state,hud:()=>game!.snapshot()}});
    engine.run();document.body.dataset.renderStatus='passed';
  } catch(error) {dispose();throw error;}
}
