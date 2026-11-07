import {unzipSync} from 'fflate';
export interface ModelArray {shape:number[];dtype:string;data:Uint8Array}
/** Narrow reader for the pinned NumPy checkpoint format; not a general untrusted model loader. */
export function readNpy(bytes:Uint8Array):ModelArray{
  if(bytes.length<12||String.fromCharCode(...bytes.subarray(0,6))!=='\x93NUMPY')throw new Error('Invalid model NPY header');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),version=bytes[6],offset=version===1?10:12;
  if(version!==1&&version!==2)throw new Error('Unsupported model NPY version');
  const length=version===1?view.getUint16(8,true):view.getUint32(8,true),header=new TextDecoder().decode(bytes.subarray(offset,offset+length));
  if(!/'fortran_order'\s*:\s*False/.test(header))throw new Error('Unsupported Fortran model tensor');
  const dtype=/'descr'\s*:\s*'([^']+)'/.exec(header)?.[1],shapeText=/'shape'\s*:\s*\(([^)]*)\)/.exec(header)?.[1];
  if(!dtype||!shapeText)throw new Error('Invalid model tensor metadata');
  const shape=shapeText.split(',').map(s=>s.trim()).filter(Boolean).map(Number),itemSize=dtype==='<f2'?2:dtype==='<i8'?8:0;
  if(!itemSize||shape.some(n=>!Number.isSafeInteger(n)||n<1)||shape.length>4||shape.reduce((a,b)=>a*b,1)*itemSize!==bytes.length-offset-length)throw new Error('Invalid model tensor shape');
  return {shape,dtype,data:bytes.subarray(offset+length)};
}
let halves:Float32Array|undefined;
function float16Table(){
  if(halves)return halves;halves=new Float32Array(65536);
  for(let i=0;i<65536;i++){const sign=i&0x8000?-1:1,exponent=i>>>10&31,mantissa=i&1023;halves[i]=exponent===0?sign*mantissa*2**-24:exponent===31?mantissa?NaN:sign*Infinity:sign*(1+mantissa/1024)*2**(exponent-15);}
  return halves;
}
export function decodeModelArray(a:ModelArray){
  if(a.dtype!=='<f2')throw new Error('Expected fp16 model weights');
  const view=new DataView(a.data.buffer,a.data.byteOffset,a.data.byteLength),lookup=float16Table(),out=new Float32Array(a.data.byteLength/2),shape=[...a.shape];
  const read=(i:number)=>lookup[view.getUint16(i*2,true)]!;
  if(shape.length===4){
    const [cout,cin,h,w]=shape as [number,number,number,number];
    for(let o=0;o<cout;o++)for(let i=0;i<cin;i++)for(let y=0;y<h;y++)for(let x=0;x<w;x++)out[((y*w+x)*cin+i)*cout+o]=read(((o*cin+i)*h+y)*w+x);
    return {values:out,shape:[h,w,cin,cout]};
  }
  if(shape.length===2){const [rows,cols]=shape as [number,number];for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)out[c*rows+r]=read(r*cols+c);return {values:out,shape:[cols,rows]};}
  if(shape.length!==1)throw new Error('Unsupported model tensor rank');
  for(let i=0;i<out.length;i++)out[i]=read(i);return {values:out,shape};
}
export function checkpointArrays(bytes:Uint8Array){
  const archive=unzipSync(bytes),arrays=new Map<string,ModelArray>();
  for(const [name,data] of Object.entries(archive)){
    if(!/^(stem\.(weight|bias)|body\.\d+\.c[12]\.(weight|bias)|foot\.[13]\.(weight|bias)|meta_blocks)\.npy$/.test(name))throw new Error('Unexpected model tensor');
    arrays.set(name.slice(0,-4),readNpy(data));
  }
  const meta=arrays.get('meta_blocks');
  if(arrays.size!==167||!meta||meta.dtype!=='<i8'||meta.shape.join()!=='1'||new DataView(meta.data.buffer,meta.data.byteOffset,meta.data.byteLength).getBigInt64(0,true)!==40n)throw new Error('Unsupported KD model architecture');
  const expected=new Map<string,string>([['stem.weight','128,38,3,3'],['stem.bias','128'],['foot.1.weight','512,4608'],['foot.1.bias','512'],['foot.3.weight','235,512'],['foot.3.bias','235']]);
  for(let i=0;i<40;i++)for(const c of ['c1','c2']){expected.set('body.'+i+'.'+c+'.weight','128,128,3,3');expected.set('body.'+i+'.'+c+'.bias','128');}
  for(const [name,shape] of expected)if(arrays.get(name)?.dtype!=='<f2'||arrays.get(name)?.shape.join()!==shape)throw new Error('Invalid KD weight: '+name);
  arrays.delete('meta_blocks');return arrays;
}
