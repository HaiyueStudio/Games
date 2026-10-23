import { installGamepad } from '../../../gamepad/runtime';
const events = [];
for (const name of ['keydown', 'keyup', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'contextmenu']) {
  document.addEventListener(name, event => {
    const e = event;
    events.push({ type: name, code: e.code, repeat: e.repeat, button: e.button, target: e.target?.id });
    if(name === 'pointerdown') e.target.setPointerCapture(e.pointerId);
  });
}
const dispose = installGamepad(new URLSearchParams(location.search).get('game') ?? 'tank-battle');
Object.assign(window, { fixture: { events, dispose } });
