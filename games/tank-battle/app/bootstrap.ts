import { installGamepad } from '../../gamepad/runtime';
import { TankBattle } from '../game/TankBattle';
import { launchMobile } from '../mobile/mobile';
import { element } from '../ui/dom';

installGamepad('tank-battle');

const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700 || new URLSearchParams(location.search).get('mobile') === '1';
const game = mobile ? null : new TankBattle();
void (game ? game.init() : launchMobile()).catch(error => {
  game?.dispose(); const fatal = element('fatal'); fatal.hidden = false;
  fatal.textContent = `游戏启动失败：${error instanceof Error ? error.message : String(error)}。请使用支持 WebGPU 的浏览器刷新重试。`;
  document.body.dataset.renderStatus = 'failed'; console.error(error);
});
