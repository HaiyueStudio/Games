export type BrowserBackend='webgpu'|'wasm';
export const TFJS_VERSION='4.22.0';
export const WEIGHTS_REVISION='5670a37c87890ffe95ea0cc0431cb1c704ec8564';
export const KD_WEIGHTS=[
  {name:'kdens_s0_fp16.npz',size:26564407,sha256:'b2d8bc289b0822e1d3e9d04eba3b6b3c435cd37a941875fc3af638cf84ef6e82'},
  {name:'kdens_s1_fp16.npz',size:26563317,sha256:'132e110197f31c05b9d5b39120aa3fe73ac491a55b480314d98abc9fa68319e9'},
  {name:'kdens_s2_fp16.npz',size:26566330,sha256:'73483924cedc86fe6bba2fe7d299127899299bddf429f4d0373364daf5565460'},
] as const;
export const BROWSER_MODELS=[
  {id:'browser-kd-s0',name:'浏览器 · KD Student 0',members:[0]},
  {id:'browser-kd-s1',name:'浏览器 · KD Student 1',members:[1]},
  {id:'browser-kd-s2',name:'浏览器 · KD Student 2',members:[2]},
  {id:'browser-kdens3',name:'浏览器 · KD Ensemble 3',members:[0,1,2]},
  {id:'browser-kd-s0-safe',name:'浏览器 · KD 0 + 末张防守',members:[0],enhancement:'safe'},
  {id:'browser-kd-s0-learned',name:'浏览器 · KD 0 + 策略学习（实验）',members:[0],enhancement:'learned'},
  {id:'browser-kd-s0-value',name:'浏览器 · KD 0 + 行动价值（实验）',members:[0],enhancement:'value'},
  {id:'browser-kd-s0-distilled',name:'浏览器 · KD 0 + 蒸馏价值（实验）',members:[0],enhancement:'distilled'},
  {id:'browser-kd-s0-joint',name:'浏览器 · KD 0 + 联合候选（实验）',members:[0],enhancement:'joint'},
] as const;
export type BrowserModelId=typeof BROWSER_MODELS[number]['id'];
export function browserModel(id:string){return BROWSER_MODELS.find(m=>m.id===id);}
export const validBackend=(value:unknown):value is BrowserBackend=>value==='webgpu'||value==='wasm';
export interface BrowserParameters {temperature:number;seed:number}
export function validateParameters(p:BrowserParameters){
  if(!Number.isFinite(p.temperature)||p.temperature<0||p.temperature>2||!Number.isInteger(p.seed)||p.seed<0||p.seed>0xffffffff)throw new Error('模型参数无效');
}
