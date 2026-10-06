import { BasicMaterial, Camera3D, CartesianTransform3D, DirectionalLight, Entity, EnvironmentLight, Mesh3D, PbrMaterial, SphericalTransform3D, createBox3D, type HaiyueEngine, type Scene } from '@haiyue/engine';
import { createCylinder3D, createTorus3D, type Geometry3D } from '@haiyue/engine/geometry';
import { applyGltfAnimationClip, createGltfPlugin, GltfModelComponent } from '@haiyue/extensions/gltf';
import { GUI_CHARS } from './story';
import { joins, midpoint, paths, project, type PuzzleState, type Vec3 } from './rules';

const COLORS = { stone: '#e5ddc7', cap: '#faf2db', rose: '#cf9c87', gold: '#d7a65a', goldDark: '#977b4b', teal: '#74aaa3', tealDark: '#486f72', dark: '#35555b', light: '#fff0b8', moss: '#92a985', distant: '#cfdcd0' };
function rgba(hex: string): [number,number,number,number] { return [parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255,1]; }
type Paint = keyof typeof COLORS;
export class ValleyScene {
  readonly scene: Scene;
  readonly camera = new Camera3D({ type: 'orthographic', left: -10, right: 10, top: 8, bottom: -8, near: .1, far: 180 });
  readonly model = new GltfModelComponent({ src: './assets/traveler.gltf', autoLoad: true, clearPrevious: true });
  readonly actor = new CartesianTransform3D({ position: [-5.75, 0, 0], scale: [.86,.86,.86] });
  private readonly turn = new CartesianTransform3D({ position: [-2.5,0,0] });
  private readonly slide = new CartesianTransform3D({ position: [4.5,3,1.5] });
  private readonly box = createBox3D();
  private readonly materials = new Map<Paint, PbrMaterial>();
  private readonly geometries: Geometry3D[] = [this.box];
  private readonly ports: Array<{ transform: CartesianTransform3D; material: PbrMaterial }> = [];
  private readonly fireflies: CartesianTransform3D[] = [];
  private readonly glow = new BasicMaterial({ color: rgba('#fff0b8') });
  private scale = 55;
  private width = 1;
  private height = 1;
  private centerX = 0;
  private centerY = 0;
  private animation = 'Idle';
  private animationTime = 0;
  constructor(engine: HaiyueEngine) {
    const camera = new Entity('Fixed orthographic camera · (1,1,1)').addComponent(this.camera).addComponent(new SphericalTransform3D({ radius: 48, theta: Math.PI / 4, phi: Math.acos(1 / Math.sqrt(3)), target: [0,0,0] }));
    this.scene = engine.createScene({ name: 'Beyond the Valley', camera, view: { clearColor: { r: .914, g: .933, b: .906, a: 1 } }, render3D: { loadOp: 'clear' }, render2D: false, gui: { loadOp: 'load', font: { chars: GUI_CHARS, fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 40, atlasSize: 2048, padding: 3 } } });
    this.scene.installPlugin(createGltfPlugin());
    this.scene.add(new Entity('Sun').addComponent(new DirectionalLight({ direction: [-.5,-1,-.2], intensity: 2.2, color: [1,.95,.84] })));
    this.scene.add(new Entity('Sky').addComponent(new EnvironmentLight({ intensity: .85, diffuseColor: [.7,.8,.78], specularColor: [.85,.9,.87] })));
    this.build();
    this.scene.add(new Entity('微 · Traveler').addComponent(this.actor).addComponent(this.model));
  }
  private material(paint: Paint): PbrMaterial {
    let material = this.materials.get(paint);
    if (!material) { material = new PbrMaterial({ baseColor: rgba(COLORS[paint]), metallic: 0, roughness: .95 }); this.materials.set(paint, material); }
    return material;
  }
  private mesh(name: string, position: Vec3, scale: Vec3, paint: Paint, parent?: Entity, geometry = this.box): CartesianTransform3D {
    const transform = new CartesianTransform3D({ position, scale });
    const entity = new Entity(name).addComponent(transform).addComponent(new Mesh3D(geometry, this.material(paint)));
    if (parent) parent.addChild(entity); else this.scene.add(entity);
    return transform;
  }
  private cylinder(radius: number, height: number, segments = 32, top = radius): Geometry3D {
    const geometry = createCylinder3D({ radiusTop: top, radiusBottom: radius, height, radialSegments: segments });
    this.geometries.push(geometry); return geometry;
  }
  private ring(radius: number, tube: number): Geometry3D {
    const geometry = createTorus3D({ radius, tube, radialSegments: 8, tubularSegments: 48 }); this.geometries.push(geometry); return geometry;
  }
  private build(): void {
    // Each tower has an actual height; the two optical seams differ in all XYZ coordinates.
    this.mesh('Home tower', [-5.75,-2.3,0], [2.65,4.3,1.45], 'stone');
    this.mesh('Home cap', [-5.75,-.16,0], [2.75,.32,1.55], 'cap');
    this.mesh('Home plinth', [-5.75,-4.38,0], [2.95,.28,1.7], 'rose');
    for (const x of [-6.75,-6.3,-5.85]) this.mesh('Old valley marks', [x,-1.5,.731], [.08,1.65,.022], 'rose');
    this.mesh('Valley gate left', [-7.07,.7,-.47], [.22,1.4,.25], 'rose');
    this.mesh('Valley gate right', [-7.07,.7,.47], [.22,1.4,.25], 'rose');
    this.mesh('Valley gate lintel', [-7.07,1.45,0], [.33,.25,1.22], 'cap');
    this.mesh('Silent inscription', [-6.95,.75,0], [.06,.8,.57], 'dark');

    const turn = new Entity('Gold rotating bridge').addComponent(this.turn);
    this.mesh('Rotating walkway', [0,-.15,0], [4,.3,.86], 'gold', turn);
    this.mesh('Gold underside', [0,-.36,0], [3.82,.14,.67], 'goldDark', turn);
    for (let i = -7; i <= 7; i++) this.mesh('Gold walkway joint', [i * .25,.006,0], [.018,.018,.81], 'cap', turn);
    this.mesh('Spindle', [0,-.65,0], [1,1,1], 'goldDark', turn, this.cylinder(.42,.7));
    this.mesh('Ring stem', [0,.11,.55], [.12,.15,.95], 'goldDark', turn);
    this.mesh('Drag ring', [0,.16,1.07], [1,1,1], 'gold', turn, this.ring(.39,.065)).setRotation(Math.PI / 2,0,0);
    this.mesh('Ring center', [0,.16,1.07], [1,1,1], 'cap', turn, this.cylinder(.12,.1));
    this.scene.add(turn);
    this.mesh('Pivot column', [-2.5,-2.9,0], [1,1,1], 'rose', undefined, this.cylinder(.65,3.8,8,.5));
    this.mesh('Pivot base', [-2.5,-4.85,0], [1.6,.2,1.6], 'stone');

    this.mesh('Upper landing tower', [3.5,.2,3], [2,5.3,.86], 'stone');
    this.mesh('Upper landing cap', [3.5,2.83,3], [2,.34,.88], 'cap');
    this.mesh('Upper tower belt', [3.5,.8,3], [2.08,.13,.96], 'rose');
    for (const x of [2.8,3.5,4.2]) this.mesh('Window recess', [x,1.9,3.44], [.18,.65,.025], 'tealDark');
    const slide = new Entity('Teal sliding bridge').addComponent(this.slide);
    this.mesh('Sliding walkway', [0,-.15,0], [.86,.3,3], 'teal', slide);
    this.mesh('Sliding underside', [0,-.36,0], [.7,.14,2.9], 'tealDark', slide);
    for (let i = -5; i <= 5; i++) this.mesh('Teal walkway joint', [0,.007,i * .25], [.81,.018,.019], 'cap', slide);
    for (const x of [-.2,0,.2]) this.mesh('Slide grip', [x,.06,0], [.07,.1,.48], 'cap', slide);
    this.scene.add(slide);
    this.mesh('Slide rail', [4.5,2.22,1.5], [5,.12,.12], 'tealDark');
    for (const x of [2.5,3.5,4.5,5.5,6.5]) this.mesh('Rail notch', [x,2.28,1.5], [.08,.08,.32], 'gold');
    this.mesh('Rail support', [4.5,-.25,1.5], [.38,4.85,.38], 'tealDark');

    this.mesh('Lighthouse tower', [7.5,1.45,2], [2,6.8,1.2], 'rose');
    this.mesh('Lighthouse cap', [7.5,4.84,2], [2,.32,1.2], 'cap');
    this.mesh('Lighthouse plinth', [7.5,-2,2], [2.25,.25,1.42], 'stone');
    for (let i = 0; i < 4; i++) this.mesh('Lighthouse slit', [7.7,3.5 - i * 1.15,2.612], [.13,.48,.025], 'goldDark');
    for (const z of [1.5,2.5]) this.mesh('Portal column', [8.35,5.78,z], [.25,1.56,.25], 'cap');
    this.mesh('Portal crown', [8.35,6.66,2], [.38,.26,1.42], 'cap');
    this.mesh('Portal roof', [8.35,6.93,2], [.62,.24,1.7], 'gold');
    const portal = new Entity('Light within the gate').addComponent(new CartesianTransform3D({ position: [8.35,5.8,2], scale: [.055,1.48,.75] })).addComponent(new Mesh3D(this.box, this.glow));
    this.scene.add(portal);
    this.mesh('Star over the gate', [8.35,7.46,2], [.18,.18,.18], 'gold').setRotation(0,0,Math.PI / 4);

    // Quiet geometric islands, ordered without random state for reproducible screenshots.
    for (const [x,y,z,s] of [[-9,-4,-6,1.1],[1,-6,-5,1.4],[11,-5,7,1.3],[-3,-6,6,.65],[10,-3,-4,.5]]) {
      this.mesh('Distant floating island', [x!,y!,z!], [s!,1.1,s!], 'distant');
      this.mesh('Distant island cap', [x!,y!+.6,z!], [s!+.12,.12,s!+.12], 'cap');
    }
    // Small cypress trees establish scale without obscuring the walking surfaces.
    for (const [x,y,z] of [[-5.2,0,-.58],[3.5,3,3.45],[7.1,5,1.52]]) {
      this.mesh('Tree trunk', [x!,y!+.24,z!], [.075,.48,.075], 'goldDark');
      this.mesh('Cypress', [x!,y!+.65,z!], [1,1,1], 'moss', undefined, this.cylinder(.22,.85,7,.025));
    }
    for (let i = 0; i < 8; i++) {
      const material = new PbrMaterial({ baseColor: rgba(COLORS.gold), emissiveFactor: [.12,.06,0], metallic: 0, roughness: 1 });
      const transform = new CartesianTransform3D({ scale: [.13,.036,.13] });
      this.scene.add(new Entity('Connection port').addComponent(transform).addComponent(new Mesh3D(this.box, material))); this.ports.push({ transform, material });
    }
    for (let i = 0; i < 13; i++) this.fireflies.push(this.mesh('Floating light', [-6 + i * 1.1, -1 + (i % 4) * .7, -3 + (i % 3) * 2.4], [.045,.045,.045], 'light'));
  }
  resize(width: number, height: number): void {
    this.width = width; this.height = height;
    this.scale = Math.max(12, Math.min((width - (width < 800 ? 42 : 300)) / 13, (height - 260) / 10.5));
    this.centerX = width * (width < 800 ? .5 : .56); this.centerY = height * (width < 800 ? .49 : .455);
    this.camera.orthoLeft = -this.centerX / this.scale; this.camera.orthoRight = (width - this.centerX) / this.scale;
    this.camera.orthoTop = this.centerY / this.scale; this.camera.orthoBottom = -(height - this.centerY) / this.scale;
  }
  screen(point: Vec3): [number, number] { const p = project(point); return [this.centerX + p[0] * this.scale, this.centerY - p[1] * this.scale]; }
  slideDelta(dx: number, dy: number): number { return (dx / Math.SQRT2 + dy / Math.sqrt(6)) / (this.scale * (1 / 2 + 1 / 6)); }
  handle(kind: 'turn' | 'slide', state: PuzzleState): Vec3 {
    return kind === 'turn' ? [-2.5 + Math.sin(state.angle) * 1.07,.16,Math.cos(state.angle) * 1.07] : [4.5 + state.offset,3.06,1.5];
  }
  sync(s: PuzzleState): void {
    this.turn.setRotation(0,s.angle,0); this.slide.setPosition(4.5+s.offset,3,1.5);
    const all = paths(s), links = joins(s);
    for (let i = 0; i < 4; i++) {
      const a = all[i]!, b = all[i + 1]!, connected = links.find(j => j.from === a.id && j.to === b.id);
      [connected?.a ?? a.b, connected?.b ?? b.a].forEach((point, j) => {
        const port = this.ports[i*2+j]!; port.transform.setPosition(point[0],point[1]+.028,point[2]);
        port.material.baseColor = rgba(connected ? '#fff6b5' : '#926e49');
        port.material.emissiveFactor = connected ? [.6,.45,.14] : [0,0,0];
      });
    }
  }
  pose(position: Vec3, heading?: number): void { this.actor.setPosition(...position); if (heading !== undefined) this.actor.setRotation(0,heading,0); }
  tick(delta: number, walking: boolean, time: number): void {
    const name = walking ? 'Walk' : 'Idle';
    if (this.animation !== name) { this.animation = name; this.animationTime = 0; }
    this.animationTime += delta;
    if (this.model.status === 'loaded') {
      const clip = this.model.runtimeAnimationClips.find(c => c.name === name);
      if (clip) applyGltfAnimationClip(clip, this.animationTime);
    }
    this.fireflies.forEach((t, i) => t.setPosition(-6+i*1.1,-1+(i%4)*.7+Math.sin(time*.45+i)*.16,-3+(i%3)*2.4));
  }
  get animationName(): string { return this.animation; }
}
