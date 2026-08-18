import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.')) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});

const { UnityInfiniteWfcMap } = await import('../wfc-map/UnityInfiniteWfc.ts');
const { UNITY_WFC_MODULES } = await import('../wfc-map/unityModuleData.ts');
const { buildWfcGroundNavMesh } = await import('../wfc-map/WfcGroundNavMesh.ts');
const {
  isUsefulPlayableWfcSurface,
  selectPlayableWfcSurface,
} = await import('../wfc-map/WfcPlayableSurface.ts');

function bytesFromHex(hex) {
  return Uint8Array.from({ length: hex.length / 2 }, (_value, index) => (
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  ));
}

function contains(mask, index) {
  return (mask[index >> 3] & (1 << (index & 7))) !== 0;
}

test('Unity InfiniteMap collapse keeps its propagated wave between aligned chunks', () => {
  const map = new UnityInfiniteWfcMap(6);
  map.reset(3);
  const first = map.collapseArea(0, 4, 0, 4, 25);
  assert.equal(first.changedColumns.length, 25);
  assert.ok(map.initializedSlotCount > 25 * 6, 'constraints should survive outside the collapsed chunk');
  const initializedAfterFirstChunk = map.initializedSlotCount;
  const seamBeforeExpansion = map.getCollapsedColumn(4, 2);

  const second = map.collapseArea(5, 9, 0, 4, 25);
  assert.equal(second.changedColumns.length, 25);
  assert.ok(map.initializedSlotCount > initializedAfterFirstChunk);
  assert.deepEqual(map.getCollapsedColumn(4, 2), seamBeforeExpansion);

  for (let z = 0; z < 5; z++) {
    const left = map.getCollapsedColumn(4, z);
    const right = map.getCollapsedColumn(5, z);
    assert.ok(left && right);
    for (let y = 0; y < 6; y++) {
      const leftModule = left[y];
      const rightModule = right[y];
      assert.equal(
        contains(bytesFromHex(UNITY_WFC_MODULES[leftModule].neighbors[3]), rightModule),
        true,
        `invalid adjacency at (4, ${y}, ${z}) -> (5, ${y}, ${z})`,
      );
    }
  }

  const generatedColumns = new Map();
  for (let z = 0; z < 5; z++) {
    for (let x = 0; x < 10; x++) generatedColumns.set(`${x},${z}`, map.getCollapsedColumn(x, z));
  }
  const playableSurface = selectPlayableWfcSurface(generatedColumns);
  assert.equal(isUsefulPlayableWfcSurface(playableSurface), true);
  assert.ok(playableSurface.verticalTransitions > 0, 'playable surface must change height through stairs');
  assert.ok(playableSurface.topLayer > playableSurface.baseLayer);
  assert.ok(
    playableSurface.slots.length < generatedColumns.size * 3,
    'disconnected stacked floors must not be exposed as the playable map',
  );
  const layersByColumn = new Map();
  for (const slot of playableSurface.slots) {
    const layers = layersByColumn.get(slot.columnKey) ?? [];
    layers.push(slot.y);
    layersByColumn.set(slot.columnKey, layers);
  }
  for (const layers of layersByColumn.values()) {
    layers.sort((a, b) => a - b);
    assert.ok(layers.length <= 2, 'a playable column may only contain a surface or one stair pair');
    if (layers.length === 2) assert.equal(layers[1] - layers[0], 1, 'stair layers must be consecutive');
  }

  const builtNavigation = buildWfcGroundNavMesh(playableSurface, {
    blockSize: 28,
    cellsPerBlock: 7,
    startX: 2,
    startZ: 2,
    surfaceY: 5.6,
  });
  assert.ok(builtNavigation);
  assert.ok(builtNavigation.walkableCellCount > 0);

  const navMesh = builtNavigation.navMesh;
  let adjacentPair = null;
  for (let row = 0; row < navMesh.rows && !adjacentPair; row++) {
    for (let column = 0; column + 1 < navMesh.columns; column++) {
      const left = row * navMesh.columns + column;
      const right = left + 1;
      if (navMesh.walkable[left] && navMesh.walkable[right]
        && navMesh.clearance[left] >= 3 && navMesh.clearance[right] >= 3) {
        adjacentPair = [left, right];
        break;
      }
    }
  }
  assert.ok(adjacentPair, 'generated WFC ground should expose a NavMesh corridor');
  const pointForCell = cell => {
    const column = cell % navMesh.columns;
    const row = Math.floor(cell / navMesh.columns);
    return [
      navMesh.originX + (column + 0.5) * navMesh.cellSize,
      navMesh.heights[cell],
      navMesh.originZ + (row + 0.5) * navMesh.cellSize,
    ];
  };
  const path = navMesh.findPath(pointForCell(adjacentPair[0]), pointForCell(adjacentPair[1]), { radius: 3 });
  assert.equal(path.status, 'complete');
  assert.ok(path.pointCount > 1);

  const lowestSlot = playableSurface.slots.find(slot => slot.y === playableSurface.baseLayer);
  const highestSlot = playableSurface.slots.find(slot => slot.y === playableSurface.topLayer);
  assert.ok(lowestSlot && highestSlot);
  const pointForSlot = slot => [
    (slot.x - 2) * 28,
    (slot.y - playableSurface.baseLayer) * 28 + 5.6,
    (slot.z - 2) * 28,
  ];
  const lowPoint = navMesh.projectPoint(pointForSlot(lowestSlot), { radius: 3 });
  const highPoint = navMesh.projectPoint(pointForSlot(highestSlot), { radius: 3 });
  assert.ok(lowPoint && highPoint);
  assert.ok(highPoint[1] > lowPoint[1], 'NavMesh should retain the selected WFC height variation');
  const stairPath = navMesh.findPath(lowPoint, highPoint, { radius: 3 });
  assert.equal(stairPath.status, 'complete');
  assert.ok(stairPath.pointCount > 2, 'path should traverse the generated stair-connected surface');
});
