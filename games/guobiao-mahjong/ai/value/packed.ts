import {validateActionValueModel,type ActionValueModel} from './model';
import {VALUE_NAMES,VALUE_FEATURE_VERSION} from './features';

export interface PackedActionValueModel {
  format:'haiyue.value-fp16/1';schemaVersion:1;featureVersion:1;featureNames:readonly string[];hidden:number;members:3;fanScale:32;objective:string;
  settings:ActionValueModel['settings'];payload:string;byteLength:number;checksum:number;payloadSha256:string;
}
/** Small embedded assets use this corruption check; release tooling additionally verifies SHA-256. */
export function packedChecksum(bytes:Uint8Array):number {let hash=0x811c9dc5;for(const b of bytes)hash=Math.imul(hash^b,0x01000193);return hash>>>0;}
function half(value:number):number {
  const sign=value&0x8000?-1:1,exponent=value>>>10&31,fraction=value&1023;
  return exponent===31?fraction?NaN:sign*Infinity:sign*(exponent===0?fraction*2**-24:(1+fraction/1024)*2**(exponent-15));
}
/** Decode once inside the existing inference Worker. No teacher, optimizer or rollout is loaded. */
export function decodePackedActionValueModel(p:PackedActionValueModel):ActionValueModel {
  const width=VALUE_NAMES.length;
  if(p.format!=='haiyue.value-fp16/1'||p.schemaVersion!==1||p.featureVersion!==VALUE_FEATURE_VERSION||p.members!==3||p.fanScale!==32||JSON.stringify(p.featureNames)!==JSON.stringify(VALUE_NAMES)||!Number.isInteger(p.hidden)||p.hidden<1||p.hidden>32)throw Error('Invalid packed value schema');
  const expected=width*8+3*(width*p.hidden+p.hidden+p.hidden*4+4)*2;
  if(p.byteLength!==expected||p.payload.length!==Math.ceil(expected/3)*4||!Number.isInteger(p.checksum)||p.checksum<0||p.checksum>0xffffffff||!/^[a-f0-9]{64}$/.test(p.payloadSha256)||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(p.payload))throw Error('Invalid packed value payload');
  const binary=atob(p.payload),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  if(bytes.length!==expected||packedChecksum(bytes)!==p.checksum)throw Error('Packed value checksum mismatch');
  const view=new DataView(bytes.buffer);let offset=0;
  const floats=(n:number)=>Array.from({length:n},()=>{const v=view.getFloat32(offset,true);offset+=4;return v});
  const halves=(n:number)=>Array.from({length:n},()=>{const v=half(view.getUint16(offset,true));offset+=2;return v});
  const mean=floats(width),scale=floats(width),networks=Array.from({length:3},()=>{
    const w1=Array.from({length:width},()=>halves(p.hidden)),b1=halves(p.hidden),w2=Array.from({length:p.hidden},()=>halves(4)),b2=halves(4);return {mean,scale,w1,b1,w2,b2};
  });
  if(offset!==expected)throw Error('Unused packed model bytes');
  const model:ActionValueModel={schemaVersion:1,featureVersion:1,featureNames:p.featureNames,fanScale:32,objective:p.objective,settings:{...p.settings},networks};validateActionValueModel(model);return model;
}
