import { installGamepad } from '../../gamepad/runtime';
import { WfcCityGame } from '../game/WfcCityGame';

installGamepad('wfc-map');

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
new WfcCityGame().init(canvas).catch(error => {
  console.error(error);
  const status = document.getElementById('status');
  if (status) status.textContent = error instanceof Error ? error.message : String(error);
});
