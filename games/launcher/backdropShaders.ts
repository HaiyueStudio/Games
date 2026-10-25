// WGSL adaptation of the supplied horizontal, position-dependent zoom crossfade.
export const backdropTransitionShader = /* wgsl */`
struct Transition { fromUv:vec4f, toUv:vec4f, parameters:vec4f }
@group(1) @binding(0) var<uniform> transition:Transition;
@group(1) @binding(1) var toTex:texture_2d<f32>;
@fragment fn fs_main(input:VertexOutput)->@location(0) vec4f {
 let p=input.uv;let progress=transition.parameters.w;
 let x=smoothstep(0.0,1.0,progress*2.0+p.x-1.0);
 let fromPoint=(p-vec2f(.5))*(1.0-x)+vec2f(.5);
 let toPoint=(p-vec2f(.5))*x+vec2f(.5);
 let fromColor=textureSampleLevel(srcTex,srcSampler,transition.fromUv.xy+fromPoint*transition.fromUv.zw,0);
 let toColor=textureSampleLevel(toTex,srcSampler,transition.toUv.xy+toPoint*transition.toUv.zw,0);
 return mix(fromColor,toColor,x);
}`;

export const backdropImageShader = /* wgsl */`
struct WallpaperCrop { crop:vec4f }
@group(1) @binding(0) var<uniform> cropData:WallpaperCrop;
@fragment fn fs_main(input:VertexOutput)->@location(0) vec4f {
 return textureSampleLevel(srcTex,srcSampler,cropData.crop.xy+input.uv*cropData.crop.zw,0);
}`;

export const backdropDownsampleShader = /* wgsl */`
@fragment fn fs_main(input:VertexOutput)->@location(0) vec4f {
 return textureSampleLevel(srcTex,srcSampler,input.uv,0);
}`;

export const backdropGlassShader = /* wgsl */`
struct Glass { frame:vec4f }
@group(1) @binding(0) var<uniform> glass:Glass;
@group(1) @binding(1) var blurredTex:texture_2d<f32>;
@group(1) @binding(2) var shadeTex:texture_2d<f32>;
@fragment fn fs_main(input:VertexOutput)->@location(0) vec4f {
 let point=input.uv*glass.frame.xy;
 let top=1.0-smoothstep(glass.frame.z-4.0,glass.frame.z+8.0,point.y);
 let bottom=smoothstep(glass.frame.w,glass.frame.w+80.0,point.y);
 let sharp=textureSampleLevel(srcTex,srcSampler,input.uv,0);
 let blurred=textureSampleLevel(blurredTex,srcSampler,input.uv,0);
 let shade=textureSampleLevel(shadeTex,srcSampler,input.uv,0);
 let picture=mix(sharp,blurred,max(top*.95,bottom*.98));
 return vec4f(mix(picture.rgb,shade.rgb,shade.a),1);
}`;
