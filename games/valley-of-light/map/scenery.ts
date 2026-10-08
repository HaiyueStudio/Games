import { Geometry3D } from '@haiyue/engine/geometry';
import type { MapObject } from './model';
import { seaMeshData, seaPalette } from './water';

/** One faceted mesh, animated by the engine's four GPU morph targets. */
export function seaGeometry(o:MapObject):Geometry3D {return new Geometry3D(seaMeshData(o));}

/** Constant UVs per triangle sample one swatch: distinct colors without extra draw calls. */
export function seaTexture(o:MapObject):HTMLCanvasElement {
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=4;
  const context=canvas.getContext('2d')!,palette=seaPalette(o);
  // Existing authored material colors are linear multipliers; preserve their appearance
  // through the PBR base-color texture's sRGB decoding.
  const srgb=(v:number)=>Math.round(255*(v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055));
  palette.forEach((rgb,i)=>{context.fillStyle=`rgb(${rgb.map(srgb).join(',')})`;context.fillRect(i*4,0,4,4);});return canvas;
}
