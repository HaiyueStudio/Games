import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
import { decodePng } from '../../Engine/scripts/visual-regression/png.mjs';
import { rotateSimulatorCamera } from './simulator-camera.mjs';

const root = resolve(import.meta.dirname, '..'), output = resolve(root, 'artifacts/os-buttons');
mkdirSync(output, { recursive: true });
const files = ['site/app.js', 'site/gamepad.js', 'site/simulator.js', 'games/launcher/buttonStyle.ts', 'games/launcher/brandArt.ts', 'games/launcher/DesktopGui.ts',
  'games/simulator/DeviceGui.ts', 'games/simulator/DeviceScreen.ts', 'games/simulator/SimulatorPlayer.ts', 'scripts/verify-os-buttons.mjs', 'scripts/simulator-camera.mjs',
  ...readdirSync(resolve(root, 'site/core')).map(file => 'site/core/' + file)];
const provenance = { schemaVersion: 1, generatedAt: new Date().toISOString(),
  revision: execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirtyWorkingTree: !!execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), 'status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
  fingerprints: Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')])) };
const checks = [], transition = [], delay = milliseconds => new Promise(done => setTimeout(done, milliseconds));
const result = await runChromeWebGpuFixture({ root, fixture: 'site/index.html', query: { verify: 1 }, timeoutMs: 240000,
  disableDx12InfoCollection: true, visualCapture: { viewportWidth: 1440, viewportHeight: 1000 }, interact: async cdp => {
    const evaluate = async expression => {
      const response = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.exception?.description ?? response.result.exceptionDetails.text);
      return response.result?.result?.value;
    };
    const until = async (expression, label) => { for (let attempt = 0; attempt < 450; attempt++) { if (await evaluate(expression)) return; await delay(100); } throw new Error('Timed out: ' + label); };
    const check = (condition, label) => { assert.ok(condition, label); checks.push(label); };
    const node = id => evaluate(`(window.__gameHost?.simulator?.nodes??__gameOS.nodes).find(node=>node.id===${JSON.stringify(id)})`);
    const point = async id => { const control = await node(id); assert.ok(control, id); return { x: control.rect.x + control.rect.width / 2, y: control.rect.y + control.rect.height / 2 }; };
    const move = async id => cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...await point(id), button: 'none', buttons: 0 });
    const leave = () => cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 8, y: 80, button: 'none', buttons: 0 });
    const click = async id => { const position = await point(id); for (const type of ['mousePressed', 'mouseReleased']) await cdp.call('Input.dispatchMouseEvent', { type, ...position, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }); };
    const capture = async name => { const result = await cdp.call('Page.captureScreenshot', { format: 'png' }); const bytes = Buffer.from(result.result.data, 'base64'); if (name) writeFileSync(resolve(output, name + '.png'), bytes); return decodePng(bytes); };
    const sample = (pixels, rectangle) => { const offset = (Math.floor(rectangle.y + rectangle.height / 2) * pixels.width + Math.floor(rectangle.x + 10)) * 4; return [...pixels.data.slice(offset, offset + 3)]; };
    const distance = (first, second) => first.reduce((sum, value, index) => sum + Math.abs(value - second[index]), 0);
    await until('window.__gameOS?.ready&&__gameOS.frames>5', 'native desktop'); await leave(); await delay(200);
    await capture('desktop-default');
    const play = await node('play');
    check(play.button.radius === 12 && play.button.duration === 160 && play.button.background !== play.button.hoverBackground, 'primary native GUI button has the shared rounded style and explicit 160 ms hover colors');
    for (let attempt = 0; attempt < 3; attempt++) {
      await leave(); await delay(220); const resting = sample(await capture(), play.rect);
      await move('play'); const entering = sample(await capture(), play.rect); await delay(220); const hovered = sample(await capture('desktop-primary-hover'), play.rect);
      transition.push({ resting, entering, hovered });
      if (distance(resting, entering) > 3 && distance(entering, hovered) > 3) break;
    }
    check(transition.some(frame => distance(frame.resting, frame.entering) > 3 && distance(frame.entering, frame.hovered) > 3), 'actual opaque button pixels contain genuine intermediate hover frames');
    check((await node('play')).button.hovered, 'hovering the primary button updates native GUI input state');
    for (const id of ['view-favorites', 'favorite', 'settings', 'devices']) {
      await leave(); await delay(180); const resting = await node(id);
      await move(id); await delay(180); const control = await node(id);
      check(control.button.hovered && (id === 'favorite' ? control.button.background !== control.button.hoverBackground
        : control.button.background === 'transparent' && control.button.border === 'transparent' && control.button.iconTint !== resting.button.iconTint), id + ' has visible hover feedback in its intended button style');
    }
    await move('favorite');
    await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...await point('favorite'), button: 'left', buttons: 1, clickCount: 1 });
    check((await node('favorite')).button.pressed, 'pointer down has a distinct native pressed state'); await capture('desktop-pressed');
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...await point('favorite'), button: 'left', buttons: 0, clickCount: 1 });
    await leave(); await delay(200);
    check((await node('favorite')).button.background === '#294f49' && await evaluate('__gameOS.favorites===1'), 'favorite remains highlighted after hover leaves and still performs its action');
    let focus;
    for (let attempt = 0; attempt < 15; attempt++) {
      for (const type of ['keyDown', 'keyUp']) await cdp.call('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab' });
      focus = await evaluate('__gameOS.nodes.find(node=>node.button?.focused&&!node.id.startsWith("game-"))'); if (focus) break;
    }
    check(focus?.button.iconTint === '#c8fff0' || focus?.button.border === '#c1f4ce', 'keyboard Tab focus has a visible mint icon or focus outline'); await capture('desktop-keyboard-focus');
    for (const [width,height] of [[1440,1000],[390,844],[844,390],[320,568]]) {
      await cdp.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});await leave();await delay(250);
      await until('!__gameOS.backdrop.transitioning&&__gameOS.backdrop.current===__gameOS.backdrop.requested', 'stable background for button pixel checks');
      const pixels = await capture('topbar-icons-'+width), controls = await evaluate('__gameOS.nodes.filter(n=>["view-all","view-favorites","devices","search-toggle","settings"].includes(n.id))');
      for (const control of controls) {
        check(control.button.background === 'transparent' && control.button.hoverBackground === 'transparent' && control.button.border === 'transparent', `${width} ${control.id} has no background or border`);
        const r=control.rect;let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
        for(let y=Math.ceil(r.y);y<r.y+r.height;y++)for(let x=Math.ceil(r.x);x<r.x+r.width;x++){
          const offset=(y*pixels.width+x)*4;
          if(Math.min(pixels.data[offset],pixels.data[offset+1],pixels.data[offset+2])>110){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
        }
        check(Number.isFinite(minX)&&Math.abs((minX+maxX+1)/2-(r.x+r.width/2))<=1.5&&Math.abs((minY+maxY+1)/2-(r.y+r.height/2))<=1.5, `${width} ${control.id} actual icon pixels are centered`);
      }
      await move('settings');
      await until('__gameOS.nodes.some(n=>n.id==="nav-tooltip"&&n.opacity===1)', 'styled navigation tooltip');
      const tooltip=await node('nav-tooltip'),arrow=await node('nav-tooltip-arrow'),gear=await node('settings');
      check(tooltip.text==='设置'&&tooltip.rect.width===80&&tooltip.rect.height===48&&arrow?.type==='GuiImage', `${width} tooltip has comfortable text padding, a rounded panel and a native pointer image`);
      check(tooltip.rect.x>=0&&tooltip.rect.x+tooltip.rect.width<=width&&tooltip.rect.y>=0&&tooltip.rect.y+tooltip.rect.height<=height&&Math.abs(arrow.rect.x+arrow.rect.width/2-gear.rect.x-gear.rect.width/2)<1, `${width} tooltip stays on screen and its arrow points to the icon`);
      const shown=await capture('topbar-tooltip-'+width);let changed=0,total=0;
      for(let y=Math.ceil(tooltip.rect.y+8);y<tooltip.rect.y+tooltip.rect.height-8;y++)for(let x=Math.ceil(tooltip.rect.x+8);x<tooltip.rect.x+tooltip.rect.width-8;x++){
        const offset=(y*shown.width+x)*4;
        if(distance([...shown.data.slice(offset,offset+3)],[...pixels.data.slice(offset,offset+3)])>15)changed++;
        total++;
      }
      check(changed/total>.6&&gear.button.hovered, `${width} tooltip draws real panel pixels while leaving the button hit region active`);
      await leave();await until('__gameOS.nodes.every(n=>!n.id.startsWith("nav-tooltip"))', 'tooltip completely fades away');
      const previousArrow=await node('carousel-prev'),nextArrow=await node('carousel-next');
      check([previousArrow,nextArrow].every(n=>n.text===''&&n.button.iconSize===20&&n.button.radius===999&&n.rect.width===n.rect.height&&n.rect.width===(width<600?36:40)), `${width} carousel uses circular glass buttons with native chevron icons`);
      check([previousArrow,nextArrow].every(n=>n.rect.x>=0&&n.rect.x+n.rect.width<=width&&n.rect.y>=0&&n.rect.y+n.rect.height<=height), `${width} both carousel arrows fit inside the viewport`);
      check(previousArrow.button.disabled&&!nextArrow.button.disabled, `${width} the first game only disables the previous arrow`);
      await move('carousel-next');await delay(380);
      const arrowHover=await node('carousel-next');
      check(arrowHover.button.hovered&&arrowHover.button.iconTint==='#f0fcff'&&await evaluate('__gameOS.nodes.some(n=>n.id==="carousel-next-halo")'), `${width} carousel hover brightens the icon and reveals a cyan halo`);
      const arrowPixels=await capture('carousel-arrows-'+width),r=arrowHover.rect;let blueGain=0,haloSamples=0;
      for(let y=Math.floor(r.y-7);y<r.y+r.height+7;y++)for(let x=Math.floor(r.x-7);x<r.x+r.width+7;x++){
        const radius=Math.hypot(x+.5-r.x-r.width/2,y+.5-r.y-r.height/2);
        if(radius<r.width/2+2||radius>r.width/2+7||x<0||y<0||x>=width||y>=height)continue;
        const offset=(y*arrowPixels.width+x)*4+2;blueGain+=Math.max(0,arrowPixels.data[offset]-pixels.data[offset]);haloSamples++;
      }
      check(blueGain/haloSamples>1.5, `${width} actual pixels show soft blue light outside the circular button`);
      await leave();await delay(300);
      if(width===1440){
        const initialGame=await evaluate('__gameOS.selected');await move('carousel-next');await click('carousel-next');
        await until('__gameOS.selected===__gameOS.games[1]&&!__gameOS.shelf.animating', 'next carousel arrow');
        check(!(await node('carousel-prev')).button.disabled, 'next arrow switches to the adjacent game and enables the previous arrow');
        await move('carousel-prev');await click('carousel-prev');await until(`__gameOS.selected===${JSON.stringify(initialGame)}&&!__gameOS.shelf.animating`, 'previous carousel arrow');
        check((await node('carousel-prev')).button.disabled, 'previous arrow returns to the first game and disables backward navigation');
        await move('view-all');await click('view-all');await leave();await delay(300);
      }
    }
    await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await leave();await delay(200);
    await click('view-all'); await click('devices'); await until('__gameHost.simulator?.status==="home"', 'device home');
    check((await node('sim-pad')).button.background === '#294f49', 'simulator toolbar distinguishes the current device rather than coloring both tabs alike');
    await move('sim-phone'); await delay(180);
    check((await node('sim-phone')).button.hovered && await evaluate('__gameHost.simulator.mode==="pad"'), 'toolbar hover highlights without switching device or orbiting the camera'); await capture('device-toolbar-hover');
    await cdp.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await until('__gameHost.simulator.nodes.find(node=>node.id==="sim-phone").button.duration===0', 'reduced motion buttons');
    let paused; cdp.on('Fetch.requestPaused', event => { paused = event; });
    await cdp.call('Fetch.enable', { patterns: [{ urlPattern: '*/games/2048/bundle.js*', requestStage: 'Request' }] });
    await click('sim-icon-2048');
    for (let attempt = 0; !paused && attempt < 100; attempt++) await delay(50); assert.ok(paused, 'deferred game code');
    await until('__gameHost.simulator.status==="loading"', 'loading RTT'); await leave(); await delay(100);
    const resting = await evaluate('haiyueGameOS.simulator.pixels()'); await capture('device-loading-default');
    await move('load-cancel'); await until('__gameHost.simulator.nodes.find(node=>node.id==="load-cancel").button.hovered', 'perspective RTT hover without pressing');
    await delay(80); const hovered = await evaluate('haiyueGameOS.simulator.pixels()');
    check(hovered.hash !== resting.hash && (await node('load-cancel')).button.duration === 0, 'real RTT pixels respond to perspective hover and reduced-motion hover is immediate'); await capture('device-loading-hover');
    await leave(); await until('!__gameHost.simulator.nodes.find(node=>node.id==="load-cancel").button.hovered', 'RTT hover leave'); await delay(60);
    check((await evaluate('haiyueGameOS.simulator.pixels()')).hash === resting.hash, 'leaving the device screen clears the RTT hover with no sticky highlight');
    await rotateSimulatorCamera({ evaluate, cdp, until }, 'landscape'); await move('load-cancel');
    await until('__gameHost.simulator.nodes.find(node=>node.id==="load-cancel").button.hovered', 'landscape RTT hover');
    check(await evaluate('__gameHost.simulator.status==="loading"'), 'hover mapping follows screen orientation without activating loading controls'); await capture('device-loading-landscape-hover');
    await click('load-cancel'); await until('__gameHost.simulator.status==="home"', 'loading cancel');
    await cdp.call('Fetch.continueRequest', { requestId: paused.requestId }); await cdp.call('Fetch.disable');
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await until('__gameHost.simulator.nodes.find(node=>node.id==="sim-reset").text==="复位"&&__gameHost.simulator.nodes.find(node=>node.id==="sim-phone").rect.x<390', 'compact toolbar layout');
    await click('sim-phone'); await until('__gameHost.simulator?.mode==="phone"&&__gameHost.simulator.status==="home"', 'phone toolbar'); await leave(); await delay(100);
    const reset = await point('sim-reset');
    await cdp.call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...reset, id: 0 }] });
    await cdp.call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await delay(100);
    check(!(await node('sim-reset')).button.pressed && !(await node('sim-reset')).button.hovered, 'touch release does not leave hover or pressed styling stuck on mobile');
    check((await node('sim-reset')).text === '复位', 'compact toolbar uses a shorter reset label');
    for (const id of ['sim-desktop', 'sim-pad', 'sim-phone', 'sim-reset', 'sim-audio']) { const control = await node(id); check(control.rect.x >= 0 && control.rect.x + control.rect.width <= 390, id + ' remains inside the mobile viewport'); }
    await capture('mobile-toolbar'); await click('sim-desktop'); await until('__gameOS.running&&!__gameHost.simulator', 'return to desktop');
    check(await evaluate('__gameOS.nodes.filter(node=>node.button).every(node=>node.button.duration===0)'), 'desktop buttons also honor reduced motion'); await capture('mobile-desktop');
    await evaluate(`(()=>{const result=document.createElement('pre');result.id='result';result.hidden=true;result.dataset.status='passed';result.textContent=JSON.stringify({status:'passed'});document.body.append(result);})()`);
  } });
writeFileSync(resolve(output, 'final.png'), Buffer.from(result.visualCapture.pngBase64, 'base64')); delete result.visualCapture.pngBase64;
writeFileSync(resolve(output, 'verification.json'), JSON.stringify({ ...result, provenance, checks, transition }, null, 2));
console.log(`${checks.length} OS button checks passed`);
