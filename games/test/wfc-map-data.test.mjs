import assert from 'node:assert/strict';
import test from 'node:test';
import { UNITY_WFC_MODULES } from '../wfc-map/unityModuleData.ts';
import {
  UNITY_WFC_DOWN_CONNECTORS,
  UNITY_WFC_SPAWN_FLAGS,
  UNITY_WFC_UP_CONNECTORS,
} from '../wfc-map/unityModuleFaces.ts';

const UNITY_PROTOTYPE_PROBABILITIES = new Map(Object.entries({
  Wall_Bench: 0.5,
  Wall_Door: 0.6,
  Bridge_Start: 0.5,
  Bridge_Wall: 0.5,
  High_Wall_Window: 0.5,
  Roof_2_Floor: 0.4,
  Roof_2_Floor_Corner: 0.3,
  Enclosed_Stairs_Entrance_Upper_2: 0.5,
  Enclosed_Stairs_Entrance_Upper_2_Steps: 0.5,
  Enclosed_Stairs_Entrance_Upper_3: 0.5,
  Interior_Corner: 0.5,
  Interior_Door: 0.8,
  Interior_Window: 0.5,
}));

test('Unity WFC module metadata stays index-aligned', () => {
  assert.equal(UNITY_WFC_MODULES.length, 454);
  assert.equal(UNITY_WFC_DOWN_CONNECTORS.length, UNITY_WFC_MODULES.length);
  assert.equal(UNITY_WFC_UP_CONNECTORS.length, UNITY_WFC_MODULES.length);
  assert.equal(UNITY_WFC_SPAWN_FLAGS.length, UNITY_WFC_MODULES.length);
});

test('Unity prototype probabilities are not reconstructed from the ambiguous p*log(p) value', () => {
  for (const [baseName, expected] of UNITY_PROTOTYPE_PROBABILITIES) {
    const variants = UNITY_WFC_MODULES.filter(module => module.baseName === baseName);
    assert.ok(variants.length > 0, `missing Unity module ${baseName}`);
    for (const variant of variants) {
      assert.equal(variant.weight, expected, `${variant.name} probability`);
    }
  }

  assert.equal(UNITY_WFC_MODULES.find(module => module.baseName === 'Tunnel_Corner')?.weight, 0.005);
});
