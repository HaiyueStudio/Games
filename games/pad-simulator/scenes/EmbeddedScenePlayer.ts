import { AmbientLight, PointLight } from '@haiyue/engine/lighting';
import { BasicMaterial, Camera2D, Camera3D, CartesianTransform3D, ColorSRGB, Component, DirectionalLight, Entity, Geometry2D, Geometry3D, Material2D, Mesh2D, Mesh3D, SphericalTransform3D, System, Transform2D, HaiyueEngine, World } from '@haiyue/engine';
import { BasisTransform3D, DataComponent, InstancedMesh3D, KeyboardComponent, MeshHelper, ScriptComponent, ScriptResource, Transform3D, type JsonObject, type ScriptLifecycleName, type ScriptRuntimeApi, type ScriptRuntimeContext, type ScriptRuntimeReadApi, type ScriptRuntimeSceneApi } from '@haiyue/engine/components';
import { BlinnPhongMaterial, CssMaterial, DepthMaterial, InstancedMaterial, Material, NormalMaterial, RadialShadowMaterial, type CssMaterialStyle } from '@haiyue/engine/material';
import { InstancedMesh3DRenderSystem, Mesh2DRenderSystem, RadialShadowRenderFeature, Render3DSystem } from '@haiyue/engine/systems';
import { InputMap } from '@haiyue/engine/input';
import { createRoundedBox3D } from '@haiyue/engine/geometry';
import { type EngineDefaults } from '@haiyue/engine/core';
import { coreComponentSerializationRegistry } from '@haiyue/engine/serialization';
import {
  Physics2DBody,
  Physics2DJoint,
  Physics2DSystem,
  Physics2DTo3DTransformSync,
  Physics2DTo3DTransformSyncSystem,
} from '@haiyue/engine/physics';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { CanvasText2DRenderSystem, CanvasTextComponent } from '@haiyue/extensions/canvas-text';
import { GltfModelComponent, GltfModelSystem } from '@haiyue/extensions/gltf';
import { Grid2DComponent } from '@haiyue/extensions/grid';
import { Spine2DComponent, Spine2DRenderSystem } from '@haiyue/extensions/spine';
import { Tilemap2DComponent, Tilemap2DRenderSystem } from '@haiyue/extensions/tilemap';
import { Tween2DComponent, Tween2DSystem } from '@haiyue/extensions/tween';

type Vec3Tuple = [number, number, number];
type TextureSource = string | ImageBitmap | HTMLCanvasElement | HTMLImageElement | GPUTexture;

interface SerializedEditorScene {
  version: 1;
  name: string;
  globals?: {
    designWidth: number;
    designHeight: number;
    clearColor: [number, number, number, number];
    reverseZ?: boolean;
    parameters: Record<string, unknown>;
    inputMap?: Record<string, string[]>;
  };
  resources: {
    geometries: SerializedGeometry[];
    materials: SerializedMaterial[];
    textures: SerializedTexture[];
    prefabs?: SerializedPrefab[];
    scripts?: SerializedScript[];
  };
  systems?: SerializedSystem[];
  entities: SerializedEntity[];
}

function getEngineDefaultsFromEmbeddedGlobals(globals: SerializedEditorScene['globals']): EngineDefaults | undefined {
  if (!globals) return undefined;
  const clearColorTuple = globals.clearColor ?? [0.04, 0.05, 0.07, 1];
  const clearColor = {
    r: clearColorTuple[0],
    g: clearColorTuple[1],
    b: clearColorTuple[2],
    a: clearColorTuple[3],
  };
  const reverseZ = globals.reverseZ === true;
  return {
    clearColor,
    reverseZ,
    scene: {
      clearColor,
      reverseZ,
      render3D: { reverseZ },
    },
  };
}

type SerializedSystem =
  | {
      type: 'Physics2DSystem';
      gravity: [number, number];
      pixelsPerMeter: number;
      fixedTimeStep: number;
      maxSubSteps: number;
      velocityIterations: number;
      positionIterations: number;
      syncStaticBodiesFromTransform: boolean;
      priority: number;
      disabled?: boolean;
    }
  | {
      type: 'RadialShadowRenderFeature';
      loadOp: 'clear' | 'load';
      priority: number;
      disabled?: boolean;
    };

interface SerializedGeometry {
  id: number;
  name: string;
  positions: number[] | SerializedTypedArray;
  normals: number[] | SerializedTypedArray | null;
  textureCoordinates: Array<{ set: number; data: number[] | SerializedTypedArray }>;
  textureCoordinateLayout: number[];
  indices: number[] | SerializedTypedArray | null;
  indexType: 'uint16' | 'uint32' | null;
  topology: GPUPrimitiveTopology | null;
  cullMode: GPUCullMode | null;
  frontFace: GPUFrontFace | null;
}

interface SerializedTypedArray {
  encoding: 'base64';
  componentType: 'float32' | 'uint16' | 'uint32';
  length: number;
  data: string;
}

type SerializedMaterial =
  | { id: number; name: string; type: 'CssMaterial'; text: string; style: CssMaterialStyle; color: [number, number, number, number]; blending: BasicMaterial['blending'] }
  | { id: number; name: string; type: 'BasicMaterial'; color: [number, number, number, number]; blending: BasicMaterial['blending']; textureId: number | null }
  | { id: number; name: string; type: 'NormalMaterial'; space: NormalMaterial['space'] }
  | { id: number; name: string; type: 'DepthMaterial'; near: number; far: number; isOrthographic: boolean }
  | { id: number; name: string; type: 'BlinnPhongMaterial'; ambient: [number, number, number, number]; diffuse: [number, number, number, number]; specular: [number, number, number, number]; shininess: number; blending: BlinnPhongMaterial['blending'] }
  | { id: number; name: string; type: 'RadialShadowMaterial'; color: [number, number, number]; opacity: number; innerRadius: number };

interface SerializedTexture {
  id: number;
  name: string;
  src: string | null;
}

interface SerializedScript {
  id: number;
  name: string;
  scripts: Record<ScriptLifecycleName, string>;
}

interface SerializedPrefab {
  id: number;
  name: string;
  root: SerializedEntity;
}

interface SerializedEntity {
  name: string;
  disabled: boolean;
  components: SerializedComponent[];
  children: SerializedEntity[];
}

type SerializedComponent =
  | { type: 'CartesianTransform3D'; position: Vec3Tuple; rotation: Vec3Tuple; scale: Vec3Tuple; anchor: Vec3Tuple }
  | { type: 'SphericalTransform3D'; radius: number; theta: number; phi: number; target: Vec3Tuple }
  | { type: 'BasisTransform3D'; coordinates: Vec3Tuple; basisX: Vec3Tuple; basisY: Vec3Tuple; basisZ: Vec3Tuple }
  | { type: 'Transform2D'; x: number; y: number; rotation: number; scaleX: number; scaleY: number }
  | { type: 'Camera3D'; projectionType: Camera3D['projectionType']; fov: number; aspect: number; near: number; far: number; orthoLeft: number; orthoRight: number; orthoTop: number; orthoBottom: number; reverseZ?: boolean }
  | { type: 'Camera2D'; width: number; height: number; near: number; far: number; zoom: number }
  | { type: 'DataComponent'; data: JsonObject }
  | { type: 'KeyboardComponent' }
  | {
      type: 'Physics2DBody';
      bodyType: Physics2DBody['type'];
      shape: Physics2DBody['shape'];
      width: number;
      height: number;
      radius: number;
      density: number;
      friction: number;
      restitution: number;
      fixedRotation: boolean;
      linearDamping: number;
      angularDamping: number;
      bullet: boolean;
      allowSleep: boolean;
      isSensor: boolean;
      categoryBits: number;
      maskBits: number;
      groupIndex: number;
      syncTransform: boolean;
    }
  | {
      type: 'Physics2DJoint';
      jointType: Physics2DJoint['type'];
      bodyA: string | number;
      bodyB: string | number;
      anchor: [number, number] | null;
      anchorA: [number, number] | null;
      anchorB: [number, number] | null;
      collideConnected: boolean;
      enableLimit: boolean;
      lowerAngle: number;
      upperAngle: number;
      enableMotor: boolean;
      motorSpeed: number;
      maxMotorTorque: number;
      length: number | null;
      frequencyHz: number;
      dampingRatio: number;
    }
  | {
      type: 'Physics2DTo3DTransformSync';
      sourceEntity: string | number | null;
      plane: Physics2DTo3DTransformSync['plane'];
      fixedAxisValue: number;
      offset: [number, number, number];
      syncRotation: boolean;
      rotationAxis: Physics2DTo3DTransformSync['rotationAxis'];
      rotationOffset: number;
    }
  | { type: 'CanvasTextComponent'; text: string; style: CssMaterialStyle }
  | { type: 'GltfModelComponent'; src: string; scene?: number | null; autoLoad?: boolean; clearPrevious?: boolean; baseColorFactor?: [number, number, number, number] }
  | { type: 'Grid2DComponent'; columns: number; rows: number; cellWidth: number; cellHeight: number; originX: number; originY: number }
  | { type: 'Spine2DComponent'; jsonUrl: string; atlasUrl?: string; imageUrl?: string; imageUrls?: Record<string, string>; skin?: string; animation?: string; loop?: boolean; timeScale?: number; scale?: number; premultipliedAlpha?: boolean }
  | { type: 'Tween2DComponent'; from?: Record<string, number>; to?: Record<string, number>; duration?: number; delay?: number; easing?: string; removeOnComplete?: boolean }
  | { type: 'Tilemap2DComponent'; columns: number; rows: number; cellWidth: number; cellHeight: number; originX: number; originY: number; gap: number; cells: number[]; palette: Array<[number, number, number, number]> }
  | { type: 'Mesh3D'; geometryId: number; materialId: number }
  | { type: 'Mesh2D'; positions: number[] | SerializedTypedArray; indices: number[] | SerializedTypedArray | null; indexType: 'uint16' | 'uint32' | null; topology: GPUPrimitiveTopology | null; color: [number, number, number, number]; blending: Material2D['blending'] }
  | { type: 'PrefabInstance'; prefabId: number }
  | { type: 'MeshHelper'; mode: MeshHelper['mode']; color: [number, number, number, number] }
  | { type: 'ScriptComponent'; scriptId?: number | null; scripts: Partial<Record<ScriptLifecycleName, string>> }
  | { type: 'AmbientLight'; color: [number, number, number, number]; intensity: number }
  | { type: 'DirectionalLight'; color: [number, number, number, number]; intensity: number; direction: Vec3Tuple }
  | { type: 'PointLight'; color: [number, number, number, number]; intensity: number; range: number };

interface RuntimePrefab {
  id: number;
  name: string;
  root: SerializedEntity;
}

interface PlayerRuntime {
  engine: HaiyueEngine;
  world: World;
  geometryMap: Map<number, Geometry3D>;
  materialMap: Map<number, Material>;
  scriptMap: Map<number, ScriptResource>;
  prefabMap: Map<number, RuntimePrefab>;
  canvas: HTMLCanvasElement;
}

function deserializeGeometry(data: SerializedGeometry): Geometry3D {
  return new Geometry3D({
    positions: decodeFloat32Array(data.positions),
    ...(data.normals ? { normals: decodeFloat32Array(data.normals) } : {}),
    textureCoordinates: data.textureCoordinates.map(entry => ({
      set: entry.set,
      data: decodeFloat32Array(entry.data),
    })),
    textureCoordinateLayout: data.textureCoordinateLayout,
    ...(data.indices ? { indices: decodeIndexArray(data.indices, data.indexType) } : {}),
    ...(data.topology == null ? {} : { topology: data.topology }),
    ...(data.cullMode == null ? {} : { cullMode: data.cullMode }),
    ...(data.frontFace == null ? {} : { frontFace: data.frontFace }),
  });
}

function decodeFloat32Array(value: number[] | SerializedTypedArray): Float32Array {
  if (Array.isArray(value)) return new Float32Array(value);
  return decodeTypedArray(value, 'float32') as Float32Array;
}

function decodeIndexArray(value: number[] | SerializedTypedArray, indexType: 'uint16' | 'uint32' | null): Uint16Array | Uint32Array {
  if (Array.isArray(value)) return indexType === 'uint32' ? new Uint32Array(value) : new Uint16Array(value);
  return decodeTypedArray(value, indexType === 'uint32' ? 'uint32' : 'uint16') as Uint16Array | Uint32Array;
}

function decodeTypedArray(value: SerializedTypedArray, expectedType: SerializedTypedArray['componentType']): Float32Array | Uint16Array | Uint32Array {
  if (value.encoding !== 'base64' || value.componentType !== expectedType) {
    throw new Error(`Invalid serialized typed array. Expected ${expectedType}.`);
  }
  const binary = atob(value.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (value.componentType === 'float32') return new Float32Array(buffer, 0, value.length);
  if (value.componentType === 'uint32') return new Uint32Array(buffer, 0, value.length);
  return new Uint16Array(buffer, 0, value.length);
}

function deserializeMaterial(data: SerializedMaterial, textureMap: Map<number, TextureSource>): Material {
  if (data.type === 'CssMaterial') return new CssMaterial({ text: data.text, style: data.style, color: data.color, blending: data.blending });
  if (data.type === 'NormalMaterial') return new NormalMaterial({ space: data.space });
  if (data.type === 'DepthMaterial') return new DepthMaterial({ near: data.near, far: data.far, isOrthographic: data.isOrthographic });
  if (data.type === 'BlinnPhongMaterial') return new BlinnPhongMaterial({ ambient: data.ambient, diffuse: data.diffuse, specular: data.specular, shininess: data.shininess, blending: data.blending });
  if (data.type === 'RadialShadowMaterial') return new RadialShadowMaterial({ color: data.color, opacity: data.opacity, innerRadius: data.innerRadius });
  return new BasicMaterial({ color: data.color, blending: data.blending, texture: data.textureId === null ? null : textureMap.get(data.textureId) ?? null });
}

function deserializeComponent(
  data: SerializedComponent,
  geometryMap: Map<number, Geometry3D>,
  materialMap: Map<number, Material>,
  scriptMap: Map<number, ScriptResource>,
): unknown {
  const coreComponent = coreComponentSerializationRegistry.deserialize(data, {
    decodeFloat32Array,
    decodeIndexArray,
    getGeometry: id => geometryMap.get(id),
    getMaterial: id => materialMap.get(id),
    getScript: id => scriptMap.get(id),
  });
  if (coreComponent) return coreComponent;
  switch (data.type) {
    case 'CanvasTextComponent': return new CanvasTextComponent({ text: data.text, style: data.style });
    case 'GltfModelComponent': {
      const { scene, ...gltfOptions } = data;
      return new GltfModelComponent({
        ...gltfOptions,
        ...(typeof scene === 'number' ? { scene } : {}),
      });
    }
    case 'Grid2DComponent': return new Grid2DComponent(data);
    case 'Spine2DComponent': return new Spine2DComponent(data);
    case 'Tween2DComponent': return new Tween2DComponent(data);
    case 'Tilemap2DComponent': return new Tilemap2DComponent(data);
    case 'PrefabInstance': return null;
  }
}

function deserializeEntity(data: SerializedEntity, geometryMap: Map<number, Geometry3D>, materialMap: Map<number, Material>, scriptMap: Map<number, ScriptResource>): Entity {
  const entity = new Entity(data.name || 'Untitled Entity');
  entity.disabled = Boolean(data.disabled);
  for (const componentData of data.components ?? []) {
    const component = deserializeComponent(componentData, geometryMap, materialMap, scriptMap);
    if (component) entity.addComponent(component as never);
  }
  const canvasText = entity.getComponent(CanvasTextComponent);
  const mesh = entity.getComponent(Mesh3D);
  if (canvasText && mesh?.material instanceof CssMaterial) canvasText.material = mesh.material;
  for (const childData of data.children ?? []) entity.addChild(deserializeEntity(childData, geometryMap, materialMap, scriptMap));
  return entity;
}

function findEntity(world: World, nameOrId: string | number): Entity | null {
  if (typeof nameOrId === 'number') return world.getEntity(nameOrId);
  for (const entity of world.entities.values()) if (entity.name === nameOrId) return entity;
  return world.getEntity(nameOrId);
}

function findCameraEntity(world: World): Entity | null {
  for (const entity of world.entities.values()) if (!entity.disabled && entity.getComponent(Camera3D)) return entity;
  return null;
}

function findCamera2DEntity(world: World): Entity | null {
  for (const entity of world.entities.values()) if (!entity.disabled && entity.getComponent(Camera2D)) return entity;
  return null;
}

function findPrefab(runtime: PlayerRuntime, nameOrId: string | number): RuntimePrefab | null {
  const id = Number(nameOrId);
  if (Number.isFinite(id) && runtime.prefabMap.has(id)) return runtime.prefabMap.get(id)!;
  return [...runtime.prefabMap.values()].find(prefab => prefab.name === nameOrId) ?? null;
}

function hasRadialShadowMesh(world: World): boolean {
  for (const entity of world.entities.values()) if (entity.getComponent(Mesh3D)?.material.type === 'radial-shadow') return true;
  return false;
}

function hasPhysics2DTo3DSync(world: World): boolean {
  for (const entity of world.entities.values()) if (entity.hasComponent(Physics2DTo3DTransformSync)) return true;
  return false;
}

function installConfiguredSystems(scene: SerializedEditorScene, world: World, engine: HaiyueEngine, cameraEntity: Entity): void {
  for (const config of scene.systems ?? []) {
    if (config.disabled) continue;
    if (config.type === 'Physics2DSystem') {
      world.addSystem(new Physics2DSystem({
        gravity: config.gravity,
        pixelsPerMeter: config.pixelsPerMeter,
        fixedTimeStep: config.fixedTimeStep,
        maxSubSteps: config.maxSubSteps,
        velocityIterations: config.velocityIterations,
        positionIterations: config.positionIterations,
        syncStaticBodiesFromTransform: config.syncStaticBodiesFromTransform,
        priority: config.priority,
      }));
    } else if (config.type === 'RadialShadowRenderFeature') {
      world.addSystem(new RadialShadowRenderFeature(engine, cameraEntity, {
        loadOp: config.loadOp,
        priority: config.priority,
      }));
    }
  }
  if (hasPhysics2DTo3DSync(world) && !world.getSystem(Physics2DTo3DTransformSyncSystem)) {
    world.addSystem(new Physics2DTo3DTransformSyncSystem({ priority: 0.5 }));
  }
}

function createRuntimeApiFactory(runtime: PlayerRuntime) {
  type RuntimeScriptFacade = Pick<ScriptRuntimeReadApi, 'find' | 'findAll' | 'findByComponent' | 'getSystem'>
    & ScriptRuntimeSceneApi
    & { findPrefab(nameOrId: string | number): RuntimePrefab | null };
  const worldFacade: RuntimeScriptFacade = {
    createEntity(name = 'Untitled Entity', parent?: Entity | null): Entity {
      const entity = new Entity(name);
      if (parent) parent.addChild(entity);
      else runtime.world.addEntity(entity);
      return entity;
    },
    destroy(entityOrId: Entity | number | string): void {
      const entity = entityOrId instanceof Entity ? entityOrId : findEntity(runtime.world, entityOrId);
      if (entity) runtime.world.removeEntity(entity);
    },
    removeEntity(entityOrId: Entity | number | string): void { worldFacade.destroy(entityOrId); },
    find(nameOrId: string | number): Entity | null { return findEntity(runtime.world, nameOrId); },
    findAll(name?: string): Entity[] {
      return [...runtime.world.entities.values()].filter(entity => name === undefined || entity.name === name);
    },
    findByComponent(componentType: string | (new (...args: never[]) => Component)): Entity[] {
      return [...runtime.world.entities.values()].filter(entity => entity.getComponent(componentType as never));
    },
    findPrefab(nameOrId: string | number): RuntimePrefab | null {
      return findPrefab(runtime, nameOrId);
    },
    spawnPrefab(nameOrId: string | number, options: { name?: string; parent?: Entity | null; position?: Vec3Tuple | [number, number]; disabled?: boolean } = {}): Entity | null {
      const prefab = findPrefab(runtime, nameOrId);
      if (!prefab) return null;
      const entity = deserializeEntity(prefab.root, runtime.geometryMap, runtime.materialMap, runtime.scriptMap);
      if (options.name) entity.name = options.name;
      if (typeof options.disabled === 'boolean') entity.disabled = options.disabled;
      if (options.position) {
        const p = options.position;
        const t2d = entity.getComponent(Transform2D);
        if (t2d) {
          t2d.x = Number(p[0] ?? 0);
          t2d.y = Number(p[1] ?? 0);
        }
      }
      if (options.parent) options.parent.addChild(entity);
      else runtime.world.addEntity(entity);
      return entity;
    },
    addComponent(entity: Entity, component: never): Entity {
      entity.addComponent(component);
      return entity;
    },
    getSystem(system: string | (new (...args: never[]) => System)): System | null {
      if (typeof system !== 'string') return runtime.world.getSystem(system as never);
      for (const item of runtime.world.systems.values()) {
        if (item.name === system || item.constructor.name === system) return item;
      }
      return runtime.world.getSystem(system);
    },
    addSystem(system: unknown, _renderOptions?: Record<string, unknown> | false | null): unknown {
      runtime.world.addSystem(system as never);
      return system;
    },
    setText(entityOrId: Entity | number | string, text: string): boolean {
      const entity = entityOrId instanceof Entity ? entityOrId : findEntity(runtime.world, entityOrId);
      const canvasText = entity?.getComponent(CanvasTextComponent);
      if (!canvasText) return false;
      canvasText.text = text;
      return true;
    },
  };
  const components = {
    AmbientLight, BasicMaterial, BasisTransform3D, BlinnPhongMaterial, Camera2D, Camera3D, CanvasTextComponent,
    CartesianTransform3D, ColorSRGB, CssMaterial, DataComponent, DepthMaterial, DirectionalLight, Entity,
    Geometry2D, Geometry3D, GltfModelComponent, Grid2DComponent, KeyboardComponent, Material2D, Mesh2D, Mesh3D,
    MeshHelper, InstancedMaterial, InstancedMesh3D, InstancedMesh3DRenderSystem,
    NormalMaterial, Physics2DBody, Physics2DJoint, Physics2DSystem, Physics2DTo3DTransformSync,
    Physics2DTo3DTransformSyncSystem, PointLight, RadialShadowMaterial, RadialShadowRenderFeature,
    ScriptComponent, SphericalTransform3D, Tilemap2DComponent,
    Transform2D, Transform3D, Tween2DComponent, createRoundedBox3D,
  };
  const getPhysicsBody = (target: Entity | Physics2DBody | number | string): Physics2DBody | null => {
    if (target instanceof Physics2DBody) return target;
    const entity = target instanceof Entity ? target : findEntity(runtime.world, target);
    return entity?.getComponent(Physics2DBody) ?? null;
  };
  const getPhysicsSystem = (): Physics2DSystem | null => runtime.world.getSystem(Physics2DSystem) as Physics2DSystem | null;
  const physicsApi = Object.freeze({
    getSystem: getPhysicsSystem,
    body: getPhysicsBody,
    hitTest: (x: number, y: number) => getPhysicsSystem()?.hitTest(runtime.world, x, y) ?? null,
    applyImpulse: (target: Entity | Physics2DBody | number | string, x: number, y: number) => {
      const physics = getPhysicsSystem();
      const body = getPhysicsBody(target);
      return !!physics && !!body && physics.applyLinearImpulse(body, x, y);
    },
    applyForce: (target: Entity | Physics2DBody | number | string, x: number, y: number) => {
      const physics = getPhysicsSystem();
      const body = getPhysicsBody(target);
      return !!physics && !!body && physics.applyForce(body, x, y);
    },
    getVelocity: (
      target: Entity | Physics2DBody | number | string,
      out: { x: number; y: number } = { x: 0, y: 0 },
    ) => {
      const physics = getPhysicsSystem();
      const body = getPhysicsBody(target);
      return physics && body && physics.getLinearVelocity(body, out) ? out : null;
    },
    getMass: (target: Entity | Physics2DBody | number | string) => {
      const physics = getPhysicsSystem();
      const body = getPhysicsBody(target);
      return physics && body ? physics.getBodyMass(body) : null;
    },
    setVelocity: (target: Entity | Physics2DBody | number | string, x: number, y: number) => {
      const physics = getPhysicsSystem();
      const body = getPhysicsBody(target);
      return !!physics && !!body && physics.setLinearVelocity(body, x, y);
    },
    setAngularVelocity: (target: Entity | Physics2DBody | number | string, velocity: number) => {
      const physics = getPhysicsSystem();
      const body = getPhysicsBody(target);
      return !!physics && !!body && physics.setAngularVelocity(body, velocity);
    },
    teleport: (target: Entity | Physics2DBody | number | string, x: number, y: number, angle?: number) => {
      const physics = getPhysicsSystem();
      const body = getPhysicsBody(target);
      return !!physics && !!body && physics.teleportBody(body, x, y, angle);
    },
    stop: (target: Entity | Physics2DBody | number | string) => {
      const physics = getPhysicsSystem();
      const body = getPhysicsBody(target);
      if (!physics || !body) return false;
      return physics.setLinearVelocity(body, 0, 0) && physics.setAngularVelocity(body, 0);
    },
  });
  return (baseApi: ScriptRuntimeApi, _context: ScriptRuntimeContext): ScriptRuntimeApi => ({
    ...baseApi,
    input: KeyboardComponent,
    read: Object.freeze({
      ...baseApi.read!,
      find: worldFacade.find,
      findAll: worldFacade.findAll,
      findByComponent: worldFacade.findByComponent,
      getSystem: worldFacade.getSystem,
      components,
      pointer: Object.freeze({}),
      canvas: {
        element: runtime.canvas,
        width: runtime.canvas.width,
        height: runtime.canvas.height,
        displayWidth: runtime.canvas.width,
        displayHeight: runtime.canvas.height,
      },
      engine: runtime.engine as unknown as Readonly<Record<string, unknown>>,
    }),
    scene: Object.freeze({
      createEntity: worldFacade.createEntity,
      destroy: worldFacade.destroy,
      removeEntity: worldFacade.removeEntity,
      spawnPrefab: worldFacade.spawnPrefab,
      addComponent: worldFacade.addComponent,
      addSystem: worldFacade.addSystem,
      setText: worldFacade.setText,
    }),
    asset: Object.freeze({ findPrefab: worldFacade.findPrefab, prefabs: runtime.prefabMap }),
    physics: physicsApi,
  });
}

export class EmbeddedScenePlayer {
  readonly canvas: HTMLCanvasElement;
  private engine: HaiyueEngine | null = null;
  private world: World | null = null;
  private readonly useSceneDesignSize: boolean;

  constructor(width: number, height: number, options: { useSceneDesignSize?: boolean } = {}) {
    this.useSceneDesignSize = options.useSceneDesignSize ?? true;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'player-canvas';
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.tabIndex = 0;
    this.canvas.setPointerCapture = (() => {}) as typeof this.canvas.setPointerCapture;
    this.canvas.releasePointerCapture = (() => {}) as typeof this.canvas.releasePointerCapture;
    Object.assign(this.canvas.style, {
      position: 'fixed',
      left: '0px',
      top: '0px',
      width: `${width}px`,
      height: `${height}px`,
      opacity: '0',
      pointerEvents: 'none',
      zIndex: '-1',
    });
  }

  async load(url: string): Promise<void> {
    const scene = await fetch(url).then(res => res.json()) as SerializedEditorScene;
    const width = this.useSceneDesignSize ? scene.globals?.designWidth ?? this.canvas.width : this.canvas.width;
    const height = this.useSceneDesignSize ? scene.globals?.designHeight ?? this.canvas.height : this.canvas.height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    await this.run(scene);
  }

  stop(): void {
    this.engine?.destroy();
    this.engine = null;
    this.world = null;
    this.canvas.remove();
    ScriptComponent.resetRuntimeApiFactory();
    ScriptComponent.resetExecutionOptions();
  }

  dispatchPointer(
    type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
    x: number,
    y: number,
    options: { button?: number; buttons?: number; ctrlKey?: boolean; metaKey?: boolean } = {},
  ): void {
    const event = new PointerEvent(type, {
      pointerId: 1,
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: options.button ?? 0,
      buttons: options.buttons ?? (type === 'pointerup' || type === 'pointercancel' ? 0 : 1),
      ctrlKey: options.ctrlKey ?? false,
      metaKey: options.metaKey ?? false,
    });
    this.canvas.dispatchEvent(event);
  }

  private async run(scene: SerializedEditorScene): Promise<void> {
    this.stop();
    document.body.append(this.canvas);
    const defaults = getEngineDefaultsFromEmbeddedGlobals(scene.globals);
    this.engine = new HaiyueEngine({
      canvas: this.canvas,
      ...(defaults === undefined ? {} : { defaults }),
      alphaMode: 'premultiplied',
      msaaSamples: 4,
      devicePixelRatio: 1,
    });
    await this.engine.init();

    this.world = new World(scene.name || 'Embedded Scene');
    (this.world as World & { globals?: unknown }).globals = scene.globals;
    KeyboardComponent.setInputMap(scene.globals?.inputMap ?? InputMap.defaultTetris());
    this.canvas.focus();

    const textureMap = new Map<number, TextureSource>();
    for (const texture of scene.resources?.textures ?? []) if (texture.src) textureMap.set(texture.id, texture.src);

    const geometryMap = new Map<number, Geometry3D>();
    for (const geometry of scene.resources?.geometries ?? []) geometryMap.set(geometry.id, deserializeGeometry(geometry));

    const materialMap = new Map<number, Material>();
    for (const material of scene.resources?.materials ?? []) materialMap.set(material.id, deserializeMaterial(material, textureMap));

    const scriptMap = new Map<number, ScriptResource>();
    for (const script of scene.resources?.scripts ?? []) {
      const resource = new ScriptResource({ name: script.name, scripts: script.scripts });
      scriptMap.set(script.id, resource);
      scriptMap.set(resource.id, resource);
    }

    const prefabMap = new Map<number, RuntimePrefab>();
    for (const prefab of scene.resources?.prefabs ?? []) prefabMap.set(prefab.id, { id: prefab.id, name: prefab.name, root: prefab.root });

    const runtime: PlayerRuntime = { engine: this.engine, world: this.world, geometryMap, materialMap, scriptMap, prefabMap, canvas: this.canvas };
    ScriptComponent.setRuntimeApiFactory(createRuntimeApiFactory(runtime));
    ScriptComponent.enableTrustedProject({ capabilities: ['read', 'scene', 'asset', 'input', 'physics', 'debug'] });

    for (const entity of scene.entities ?? []) this.world.addEntity(deserializeEntity(entity, geometryMap, materialMap, scriptMap));

    let cameraEntity = findCameraEntity(this.world);
    if (!cameraEntity) {
      cameraEntity = new Entity('Camera');
      cameraEntity.addComponent(new Camera3D({ type: 'perspective', fov: Math.PI / 4, near: 0.1, far: 100 }));
      cameraEntity.addComponent(new SphericalTransform3D({ radius: 8, theta: Math.PI / 4, phi: Math.PI / 3 }));
      this.world.addEntity(cameraEntity);
    }
    const renderIntegration = new RenderIntegration(this.engine, { label: 'EmbeddedScenePlayer.render' });
    this.world.addRuntimeIntegration(renderIntegration);
    installConfiguredSystems(scene, this.world, this.engine, cameraEntity);
    const render3DSystem = new Render3DSystem(this.engine, cameraEntity, { loadOp: 'clear', priority: 0, msaaSamples: 4, reverseZ: this.engine.reverseZ });
    this.world.addSystem(render3DSystem);
    this.world.addSystem(new GltfModelSystem({ priority: 0 }));
    if (hasRadialShadowMesh(this.world) && !(scene.systems ?? []).some(config => !config.disabled && config.type === 'RadialShadowRenderFeature')) {
      this.world.addSystem(new RadialShadowRenderFeature(this.engine, cameraEntity, { loadOp: 'load', priority: 20 }));
    }

    const camera2DEntity = findCamera2DEntity(this.world);
    if (camera2DEntity) {
      this.world.addSystem(new Tween2DSystem({ priority: 1 }));
      this.world.addSystem(new Tilemap2DRenderSystem(this.engine, camera2DEntity, { loadOp: 'load', priority: 2 }));
      this.world.addSystem(new Spine2DRenderSystem(this.engine, camera2DEntity, { loadOp: 'load', priority: 3 }));
      this.world.addSystem(new Mesh2DRenderSystem(this.engine, camera2DEntity, { loadOp: 'load', priority: 3 }));
      this.world.addSystem(new CanvasText2DRenderSystem(this.engine, camera2DEntity, { loadOp: 'load', priority: 4 }));
    }
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));

    this.engine.on('update', ({ detail: { time, delta } }) => {
      this.world?.update(time, delta);
    });
    this.engine.run();
  }
}
