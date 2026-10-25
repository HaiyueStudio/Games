export async function rotateSimulatorCamera({ evaluate, cdp, until }, orientation, settle = true) {
  const camera = await evaluate('__gameHost.simulator.camera'), viewport = await evaluate('({width:innerWidth,height:innerHeight})');
  const target = orientation === 'landscape' ? Math.PI / 2 : Math.PI;
  const delta = Math.atan2(Math.sin(target - camera.theta), Math.cos(target - camera.theta));
  const distance = -delta * viewport.width / (Math.PI * 2 * camera.rotateSpeed), point = { x: distance >= 0 ? 8 : viewport.width - 8, y: viewport.height * .43 };
  await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, button: 'none', buttons: 0 });
  await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1 });
  await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x + distance, y: point.y, button: 'left', buttons: 1 });
  await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x + distance, y: point.y, button: 'left', buttons: 0 });
  if (settle) await until(`__gameHost.simulator.orientation===${JSON.stringify(orientation)}&&!__gameHost.simulator.rotation.active`, 'camera-detected ' + orientation + ' with settled screen animation');
}
