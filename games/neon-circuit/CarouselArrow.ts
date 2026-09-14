import {uploadNeonCanvas,type NeonRaster} from './NeonRaster';

/** Flat luminous chevrons. No metallic frame, rectangular backing or per-frame raster uploads. */
export function createCarouselArrow(device:GPUDevice,raster:NeonRaster,direction:-1|1):GPUTexture {
  const canvas=raster.canvas(192,256),ctx=canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.clearRect(0,0,192,256);ctx.lineCap='round';ctx.lineJoin='round';
  const path=()=>{ctx.beginPath();ctx.moveTo(direction<0?121:71,64);ctx.lineTo(direction<0?62:130,128);ctx.lineTo(direction<0?121:71,192);};
  for(const [width,alpha] of [[62,.018],[46,.032],[32,.06],[20,.14],[10,.48],[4,.94]]) {
    ctx.lineWidth=width!;ctx.strokeStyle=`rgba(83,235,255,${alpha})`;path();ctx.stroke();
  }
  const texture=device.createTexture({label:'Carousel.luminousArrow',size:[192,256],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
  uploadNeonCanvas(device,raster,canvas,texture);return texture;
}
