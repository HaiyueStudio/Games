import { CartesianTransform3D, Entity } from '@haiyue/engine';
import { Transform3D } from '@haiyue/engine/components';
import { applyGltfAnimationClip, type LoadedGltfModel } from '@haiyue/extensions/gltf';
import { mat4, vec3 } from 'wgpu-matrix';

export function matrixTo(entity: Entity, ancestor: Entity | null): Float32Array {
  if (entity === ancestor) return mat4.identity();
  const local = entity.getComponent(Transform3D)?.localMatrix ?? mat4.identity();
  return entity.parent ? mat4.multiply(matrixTo(entity.parent, ancestor), local) : mat4.copy(local);
}
export function soldierClip(model: LoadedGltfModel, name: string) {
  const clip = model.animationClips.find(c => c.name === name);
  if (!clip) throw new Error(`Missing character animation ${name}`);
  return clip;
}
/** Shared asset-specific scale and right-hand attachment for both teams. */
export function mountSoldier(parent: Entity, character: LoadedGltfModel, weapon: LoadedGltfModel) {
  const frame = new Entity('ren42 asset axis and meters').addComponent(new CartesianTransform3D({
    position: [0, 0.94, 0], rotation: [0, Math.PI, 0], scale: [0.027, 0.027, 0.027],
  }));
  frame.addChild(character.root); parent.addChild(frame);
  applyGltfAnimationClip(soldierClip(character, 'run_top2'), 0);
  applyGltfAnimationClip(soldierClip(character, 'idle_bottom'), 0);
  soldierClip(character, 'death');
  const find = (entity: Entity): Entity | undefined => entity.name === '1seal_skeleton_Bip01 R Hand'
    ? entity : entity.children.map(find).find(Boolean);
  const hand = find(character.root);
  if (!hand) throw new Error('ren42 right-hand attachment bone is missing');
  const handMatrix = matrixTo(hand, character.root);
  const desired = mat4.translation([handMatrix[12]!, handMatrix[13]! - 0.3, handMatrix[14]! - 1.6]);
  mat4.scale(desired, [0.78, 0.78, 0.78], desired);
  const socket = new Entity('AK47 right-hand socket').addComponent(
    new Transform3D().setMatrix(mat4.multiply(mat4.inverse(handMatrix), desired)));
  hand.addChild(socket); socket.addChild(weapon.root);
  return { frame, hand, socket };
}
export function soldierMuzzle(weapon: LoadedGltfModel) {
  const point = vec3.transformMat4([0, 3.3, 31.5], matrixTo(weapon.root, null));
  return { x: point[0]!, y: point[1]!, z: point[2]! };
}
/** The low-level glTF sampler loops; stop just before its wrap point for a held final pose. */
export function deathPose(model: LoadedGltfModel, age: number) {
  const clip = soldierClip(model, 'death');
  const time = Math.min(age, Math.max(0, clip.duration - 0.000001));
  applyGltfAnimationClip(clip, time);
  return time;
}
