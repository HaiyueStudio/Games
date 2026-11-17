import {decodeNetwork,type PackedNetwork} from '../learning/packed';
import type {BeliefModel} from '../belief/model';
import {validateJointBundle,type JointBundle,type JointModel} from './model';
export interface PackedJointBundle {format:'haiyue.joint-bundle/1';belief:Omit<BeliefModel,'network'>&{network:PackedNetwork};joint:Omit<JointModel,'network'>&{network:PackedNetwork}}
export function decodeJointBundle(p:PackedJointBundle):JointBundle {
  if(p.format!=='haiyue.joint-bundle/1')throw Error('Invalid joint bundle format');
  const bundle:JointBundle={schemaVersion:1,belief:{...p.belief,network:decodeNetwork(p.belief.network)},joint:{...p.joint,network:decodeNetwork(p.joint.network)}};validateJointBundle(bundle);return bundle;
}
