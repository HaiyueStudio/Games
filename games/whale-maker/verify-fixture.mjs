import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root=resolve(import.meta.dirname,'../..');

export function makeCourse({width=100,height=32,floor=20,goal=width-6,spawn=[3,floor-.8],...options}={}) {
    const cells=Array(width*height).fill('.');
    cells.fill('#',floor*width);
    cells[(floor-1)*width+goal]='E';
    return {version:1,name:'鲸屿试验关',width,height,cells,spawn,properties:{},
        rules:{revision:1,rewards:'score',freezing:'timed',pipes:'reference'},...options};
}

export async function verifyCourse(outputName,checkCourse) {
    const output=resolve(root,'artifacts',outputName);
    mkdirSync(output,{recursive:true});
    const checks=[];
    const result=await runChromeWebGpuFixture({root,fixture:'games/whale-maker/index.html',query:{verify:1},
        timeoutMs:150000,disableDx12InfoCollection:true,visualCapture:{viewportWidth:1280,viewportHeight:860},
        interact:async cdp=>{
            const evaluate=async expression=>{
                const {result}=await cdp.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
                if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);
                return result.result.value;
            };
            const state=(fn,...args)=>evaluate(`(${fn})(window.__whaleMaker,...${JSON.stringify(args)})`);
            const draw=()=>state(g=>g.draw());
            const capture=async name=>{
                await draw();await delay(90);
                const {result}=await cdp.call('Page.captureScreenshot',{format:'png'});
                writeFileSync(resolve(output,`${name}.png`),Buffer.from(result.data,'base64'));
            };
            const load=level=>state((g,level)=>{
                g.editAreaId='main';g.areaRoot=undefined;g.editing=false;g.campaignActive=false;
                g.state.phase='playing';g.level=level;g.restart();g.paused=true;g.draw();
            },level);
            const advance=(ticks,...keys)=>state((g,ticks,keys)=>{
                g.clearControls();keys.forEach(key=>g.keys.add(key));g.paused=false;
                for(let n=0;n<ticks;n++)g.tick(1/120);
                g.paused=true;g.draw();
            },ticks,keys);
            for(let n=0;n<180;n++){
                if(await evaluate('document.body?.dataset.renderStatus==="passed"'))break;
                await delay(200);
            }
            assert.equal(await evaluate('document.body.dataset.renderStatus'),'passed');
            await checkCourse({state,load,advance,capture,checks,delay});
            assert.equal(await state(g=>g.scene.draws.every(draw=>g.scene.sources.has(draw.id))),true);
            assert.equal(await evaluate('document.querySelectorAll("button,img,aside").length'),0);
            await state((g,checks)=>{
                g.destroy();const result=document.createElement('pre');result.id='result';
                result.dataset.status='passed';result.hidden=true;
                result.textContent=JSON.stringify({status:'passed',checks});document.body.append(result);
            },checks);
        }});
    writeFileSync(resolve(output,'browser.json'),JSON.stringify(result,null,2));
    assert.equal(result.status,'passed',JSON.stringify(result));
    console.log(JSON.stringify({status:result.status,checks:result.checks,diagnostics:result.browserDiagnostics}));
}
