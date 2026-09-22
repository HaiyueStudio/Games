import {EngineSudokuGame} from './engine-game';
const game=new EngineSudokuGame();
void game.init().catch(error=>{game.stop();const boot=document.querySelector<HTMLElement>('#boot');if(boot)boot.textContent=`无法启动 Haiyue GUI：${error instanceof Error?error.message:String(error)}`;console.error(error);});
