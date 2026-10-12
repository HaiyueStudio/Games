import type {HYDialog} from './ui';
import type {ValleyEditorApi} from './api';
import {chapterTwoRecipe} from '../recipes/chapter-two';
/** Data commands only: the editor never evaluates pasted JavaScript. */
export class ApiUI {
  constructor(private api:ValleyEditorApi){
    const dialog=document.getElementById('api-dialog') as HYDialog,text=document.getElementById('api-text') as HTMLTextAreaElement,report=document.getElementById('api-report')!;
    const run=(apply:boolean)=>{try{const batch=JSON.parse(text.value),info=api.validate(batch);if(apply){api.apply(batch);api.fit();}report.textContent=`${apply?'已应用，可一次撤销':'校验通过'}：${info.objects} 个构件，${info.groups} 个父节点。${info.playIssues.join(' ')}`;}catch(e){report.textContent=String(e);}};
    document.getElementById('api')!.onclick=()=>{if(!text.value)text.value=JSON.stringify({apiVersion:1,label:'API 新建路径',expectedRevision:api.status().revision,commands:[{op:'object.create',object:{id:'api-road',type:1,position:[0,2,0]}}]},null,2);dialog.showModal();};
    document.getElementById('close-api')!.onclick=()=>dialog.close();document.getElementById('api-validate')!.onclick=()=>run(false);document.getElementById('api-apply')!.onclick=()=>run(true);
    document.getElementById('api-chapter-two')!.onclick=()=>{text.value=JSON.stringify({...chapterTwoRecipe(),expectedRevision:api.status().revision},null,2);report.textContent='已填入第二关建图命令，应用后替换当前地图；整批可撤销。';};
  }
}
