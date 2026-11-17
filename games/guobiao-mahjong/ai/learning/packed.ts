import {validateNetwork,type SmallNetwork} from './network';
export interface PackedNetwork {format:'haiyue.small-fp16/1';input:number;hidden:number;output:number;byteLength:number;checksum:number;payload:string}
export function networkChecksum(bytes:Uint8Array){let h=0x811c9dc5;for(const b of bytes)h=Math.imul(h^b,0x01000193);return h>>>0;}
function half(n:number){const sign=n&0x8000?-1:1,e=n>>>10&31,f=n&1023;return e===31?f?NaN:sign*Infinity:sign*(e===0?f*2**-24:(1+f/1024)*2**(e-15));}
/** Only compact inference networks are accepted here; teacher checkpoints remain offline. */
export function decodeNetwork(p:PackedNetwork):SmallNetwork {
  if(p.format!=='haiyue.small-fp16/1'||![p.input,p.hidden,p.output].every(Number.isInteger)||p.input<1||p.input>512||p.hidden<1||p.hidden>32||p.output<1||p.output>128)throw Error('Invalid packed network dimensions');
  const expected=p.input*8+(p.input*p.hidden+p.hidden+p.hidden*p.output+p.output)*2;
  if(p.byteLength!==expected||!Number.isInteger(p.checksum)||p.checksum<0||p.checksum>0xffffffff||p.payload.length!==Math.ceil(expected/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(p.payload))throw Error('Invalid packed network payload');
  const bytes=Uint8Array.from(atob(p.payload),c=>c.charCodeAt(0));if(bytes.length!==expected||networkChecksum(bytes)!==p.checksum)throw Error('Packed network checksum mismatch');
  const v=new DataView(bytes.buffer);let offset=0;const floats=(n:number)=>Array.from({length:n},()=>{const x=v.getFloat32(offset,true);offset+=4;return x}),halves=(n:number)=>Array.from({length:n},()=>{const x=half(v.getUint16(offset,true));offset+=2;return x});
  const network={mean:floats(p.input),scale:floats(p.input),w1:Array.from({length:p.input},()=>halves(p.hidden)),b1:halves(p.hidden),w2:Array.from({length:p.hidden},()=>halves(p.output)),b2:halves(p.output)};
  if(offset!==expected)throw Error('Unused packed network bytes');validateNetwork(network,p.input,p.output,32);return network;
}
