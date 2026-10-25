import { Geometry3D, createSphere3D, separateGeometryTriangles } from '@haiyue/engine/geometry';
import { gateBands, gateRadii, type Gate } from '../rules/model';

export interface FragmentMesh { buffer: GPUBuffer; vertices: number; triangles: number }

// Separation is done once per mesh; the GPU rotates each triangle around its own centroid.
function upload(device: GPUDevice, source: Geometry3D, label: string): FragmentMesh {
  const geometry = separateGeometryTriangles(source), packed: number[] = [], p = geometry.positions;
  for (let t = 0; t < p.length; t += 9) {
    const a = [p[t]!, p[t + 1]!, p[t + 2]!], b = [p[t + 3]!, p[t + 4]!, p[t + 5]!], c = [p[t + 6]!, p[t + 7]!, p[t + 8]!];
    const ab = b.map((v, i) => v - a[i]!), ac = c.map((v, i) => v - a[i]!);
    const normal = [ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!];
    const length = Math.hypot(...normal);
    if (length < 1e-9) continue; // Remove the sphere's zero-area pole triangles.
    const center = a.map((v, i) => (v + b[i]! + c[i]!) / 3);
    for (let v = 0; v < 3; v++) {
      const offset = t + v * 3;
      const n = geometry.normals ? Array.from(geometry.normals.subarray(offset, offset + 3)) : normal.map(x => x / length);
      packed.push(p[offset]!, p[offset + 1]!, p[offset + 2]!, ...center, ...n, Number(v === 0), Number(v === 1), Number(v === 2));
    }
  }
  const data = new Float32Array(packed);
  const buffer = device.createBuffer({ label, size: data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(buffer, 0, data);
  return { buffer, vertices: data.length / 12, triangles: data.length / 36 };
}

export function createBallFragments(device: GPUDevice): FragmentMesh {
  return upload(device, createSphere3D({ radius: 1, widthSegments: 24, heightSegments: 14 }), 'Glass Rush separated sphere');
}

export function createGateFragments(device: GPUDevice, gate: Gate): FragmentMesh {
  const positions: number[] = [], indices: number[] = [];
  const vertex = (angle: number, radius: number, z: number): number => {
    positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, z); return positions.length / 3 - 1;
  };
  const quad = (a: number, b: number, c: number, d: number): void => { indices.push(a, b, c, a, c, d); };
  for (const band of gateBands(gate)) {
    if (gate.shape === 'diamonds' || gate.shape === 'hexagons') {
      // The widest corners lie on the collision orbit, matching its angular footprint.
      const outline = gate.shape === 'hexagons'
        ? [[band.offset - band.width, 4.55], [band.offset - band.width * .5, 3.75], [band.offset + band.width * .5, 3.75], [band.offset + band.width, 4.55], [band.offset + band.width * .5, 5.25], [band.offset - band.width * .5, 5.25]]
        : [[band.offset - band.width, 4.55], [band.offset, 3.45], [band.offset + band.width, 4.55], [band.offset, 5.3]];
      const front = outline.map(([a, r]) => vertex(a!, r!, -.12)), back = outline.map(([a, r]) => vertex(a!, r!, .12));
      const cf = vertex(band.offset, 4.55, -.12), cb = vertex(band.offset, 4.55, .12);
      for (let i = 0; i < outline.length; i++) {
        const j = (i + 1) % outline.length;
        indices.push(cf, front[i]!, front[j]!, cb, back[j]!, back[i]!);
        quad(front[i]!, back[i]!, back[j]!, front[j]!);
      }
      continue;
    }
    // Even counts preserve the exact central tip of V-shaped and triangular profiles.
    const segments = Math.max(4, Math.ceil(band.width / .11) * 2);
    for (let s = 0; s < segments; s++) {
      const a = band.offset - band.width + 2 * band.width * s / segments, b = band.offset - band.width + 2 * band.width * (s + 1) / segments;
      const ra = gateRadii(gate.shape, -1 + 2 * s / segments), rb = gateRadii(gate.shape, -1 + 2 * (s + 1) / segments);
      for (let ring = 0; ring < 2; ring++) {
        const a0 = ra.inner + (ra.outer - ra.inner) * ring / 2, a1 = ra.inner + (ra.outer - ra.inner) * (ring + 1) / 2;
        const b0 = rb.inner + (rb.outer - rb.inner) * ring / 2, b1 = rb.inner + (rb.outer - rb.inner) * (ring + 1) / 2;
        const f = [vertex(a, a0, -.1), vertex(b, b0, -.1), vertex(b, b1, -.1), vertex(a, a1, -.1)];
        const k = [vertex(a, a0, .1), vertex(b, b0, .1), vertex(b, b1, .1), vertex(a, a1, .1)];
        quad(f[0]!, f[1]!, f[2]!, f[3]!); quad(k[3]!, k[2]!, k[1]!, k[0]!);
        if (ring === 0) quad(f[0]!, k[0]!, k[1]!, f[1]!);
        if (ring === 1) quad(f[2]!, k[2]!, k[3]!, f[3]!);
        if (s === 0) quad(f[3]!, k[3]!, k[0]!, f[0]!);
        if (s === segments - 1) quad(f[1]!, k[1]!, k[2]!, f[2]!);
      }
    }
  }
  return upload(device, new Geometry3D({ positions: new Float32Array(positions), indices: new Uint32Array(indices) }), `Glass Rush ${gate.shape} fragments`);
}

export const fragmentsShader = /* wgsl */`
struct Params { size:vec2f, time:f32, distance:f32, angle:f32, hits:f32, flash:f32, broken:f32 }
struct Item { z:f32, angle:f32, age:f32, kind:f32, impact:f32, shape:f32, width:f32, spin:f32 }
@group(0) @binding(0) var<uniform> u:Params;
@group(0) @binding(1) var<storage,read> items:array<Item>;
struct Vertex { @builtin(position) position:vec4f, @location(0) normal:vec3f, @location(1) bary:vec3f, @location(2) local:vec3f, @location(3) kind:f32, @location(4) alpha:f32, @location(5) damage:f32, @location(6) age:f32, @location(7) shape:f32, @location(8) spin:f32 }
fn hash(n:f32)->f32 { return fract(sin(n*127.1+311.7)*43758.5453); }
fn rotate(p:vec3f,axis:vec3f,a:f32)->vec3f { return p*cos(a)+cross(axis,p)*sin(a)+axis*dot(axis,p)*(1.0-cos(a)); }
fn turn(p:vec2f,a:f32)->vec2f { return vec2f(p.x*cos(a)-p.y*sin(a),p.x*sin(a)+p.y*cos(a)); }
fn bend(z:f32)->vec2f { let d=u.distance;return vec2f(sin((d+z)*.018)-sin(d*.018),cos((d+z)*.023)-cos(d*.023))*.45*z/(z+12.0); }
@vertex fn vs(@location(0) position:vec3f,@location(1) center:vec3f,@location(2) normal:vec3f,@location(3) bary:vec3f,@builtin(vertex_index) v:u32,@builtin(instance_index) instance:u32)->Vertex {
 let item=items[instance];let ball=item.kind>.5;let id=f32(v/3u)+item.shape*83.0;
 let rnd=vec3f(hash(id),hash(id+17.0),hash(id+49.0));let axis=normalize(rnd*2.0-1.0+vec3f(.001));
 let t=max(item.age,0.0);let spin=t*(2.0+rnd.x*6.0);
 let size=select(1.0,.11,ball);let scale=1.0-smoothstep(select(1.0,1.8,ball),select(1.8,3.0,ball),t);
 var point=center*size+rotate((position-center)*size,axis,spin)*scale;
 if(item.age>=0.0) {
  if(ball) { point+=normalize(center+vec3f(.001))*(.055+rnd.y*.23)*t+vec3f(0,.07*t*t,-t*(.7+rnd.z*.65)-t*t*.12); }
  else {
   // Aim at the camera's 3D position, so approaching shards grow in perspective.
   let towardCamera=normalize(vec3f(-center.xy,-(item.z+4.0+center.z)));
   let spread=vec3f(rnd.x-.5,rnd.y-.5,0)*(2.1+rnd.z*3.0);
   point+=(towardCamera*(7.5+rnd.z*3.5)+spread)*t+towardCamera*t*t*2.8+vec3f(0,t*t*.08,0);
  }
 }
 var projected:vec2f;var nearFade=1.0;var viewDepth:f32;
 if(ball) { let depth=1.0+point.z;viewDepth=max(.12,depth);projected=vec2f(0,.65)+point.xy/viewDepth;nearFade=smoothstep(.12,.3,depth); }
 else { let depth=item.z+4.0+point.z;viewDepth=max(.35,depth);projected=bend(item.z)+turn(point.xy,item.angle-u.angle+1.5707963)/viewDepth;nearFade=smoothstep(.35,1.2,depth); }
 var out:Vertex;out.position=vec4f(projected*vec2f(u.size.y/u.size.x,-1)*viewDepth,viewDepth-.15,viewDepth);
 out.normal=rotate(normal,axis,spin);out.bary=bary;out.local=position;out.damage=select(0.0,u.hits,ball);out.age=item.age;out.kind=item.kind;out.shape=item.shape;out.spin=item.spin;
 out.alpha=nearFade*select(1.0,1.0-smoothstep(select(.7,1.3,ball),select(1.8,3.0,ball),t),item.age>=0.0);
 return out;
}
fn spectrum(t:f32)->vec3f { return .52+.48*cos(6.2831853*(t+vec3f(0,.333333,.666667))); }
@fragment fn fs(v:Vertex)->@location(0) vec4f {
 let n=normalize(v.normal);let light=pow(max(0.0,dot(n,normalize(vec3f(-.4,-.7,-1)))),32.0);
 let fres=pow(1.0-abs(n.z),2.0);let derivatives=max(fwidth(v.bary),vec3f(.00001));
 let edge=1.0-smoothstep(0.0,1.3,min(v.bary.x/derivatives.x,min(v.bary.y/derivatives.y,v.bary.z/derivatives.z)));
 let ball=v.kind>.5;let clock=u.time+max(0.0,u.broken);
 if(ball && v.age<0.0 && n.z>0.0){discard;}
 var color:vec3f;
 if(!ball) {
  let p=v.local.xy;let radius=length(p);
  let flow=sin(p.x*1.8+clock*.65)*cos(p.y*2.1-clock*.45);
  let film=spectrum(p.x*.13+p.y*.17+flow*.23+clock*.09+v.shape*.14);
  let sheen=pow(.5+.5*sin(p.x*2.5-p.y*3.0+flow*2.0-clock*1.1),12.0);
  let inner=select(4.08,3.65,v.shape>1.5&&v.shape<2.5);
  let contour=select(0.0,exp(-min(abs(radius-inner),abs(radius-5.05))*35.0),v.shape<3.5);
  color=vec3f(.018,.025,.06)+film*(.65+fres*.7)+sheen*vec3f(.65,.85,1)*.65;
  color+=mix(film,vec3f(.5,.95,1),.6)*(contour*.75+fres*.45);
  color+=edge*film*select(.015,.75,v.age>=0.0);
  let sweep=pow(.5+.5*cos(atan2(p.y,p.x)*6.0-clock*sign(v.spin)*5.0),18.0);
  color+=vec3f(.35,.9,1)*sweep*step(.01,abs(v.spin))*.5;
 }
 if(ball) {
  let flow=sin(v.local.x*5.0+clock*1.6)*cos(v.local.y*4.0-clock*1.15);
  let hue=clock*.24+n.x*.26+n.y*.34+flow*.18+fres*.45;
  let film=pow(spectrum(hue),vec3f(1.5));
  let ribbon=pow(.5+.5*sin(v.local.y*12.0+v.local.x*6.0+flow*3.0-clock*4.0),12.0);
  color=vec3f(.008,.012,.035)+film*(.8+fres*.8)+light*vec3f(.9,.98,1)*2.0;
  color+=spectrum(hue+.33)*ribbon*.8+spectrum(clock*.29+fres*.7)*fres*1.1;
  color+=edge*vec3f(.65,.9,1)*select(.005,.65,v.age>=0.0);
  for(var i=0;i<3;i++){if(f32(i)>=v.damage){break;}let a=f32(i)*2.4+.4;let crack=abs(v.local.x*cos(a)+v.local.y*sin(a)+sin(v.local.y*23.0)*.04);color+=exp(-crack*200.0)*vec3f(.7,.95,1);}
 }
 return vec4f(1.0-exp(-color*1.45),v.alpha*select(.92,.96,ball));
}`;
