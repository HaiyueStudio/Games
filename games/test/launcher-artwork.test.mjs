import test from 'node:test';
import assert from 'node:assert/strict';
import { artworkWindow } from '../launcher/artworkWindow.ts';
import { desktopLayout, CARD_GAP, SHELF_INSET } from '../launcher/layout.ts';

test('artwork windows cover every intersecting card with only one prefetched neighbour per side', () => {
  for (const [width, height] of [[320, 568], [390, 844], [640, 360], [1040, 600], [1440, 900], [2560, 1080]]) {
    const layout = desktopLayout(width, height), stride = layout.cardWidth + CARD_GAP, count = 31;
    const maxScroll = SHELF_INSET * 2 + count * stride - CARD_GAP - layout.shelf.width;
    for (let scroll = 0; scroll <= maxScroll; scroll += 7) {
      const result = artworkWindow(count, scroll, layout.shelf.width, layout.cardWidth, CARD_GAP, SHELF_INSET);
      const visible = Array.from({ length: count }, (_, index) => index).filter(index => {
        const left = SHELF_INSET + index * stride - scroll;
        return left < layout.shelf.width && left + layout.cardWidth > 0;
      });
      assert.deepEqual(result.visible, visible, `${width} at ${scroll}`);
      assert.ok(result.indices.length <= result.capacity);
      assert.ok(result.indices.length <= visible.length + 2);
      assert.ok(visible.every(index => result.indices.includes(index)));
      assert.ok(result.indices.every(index => index >= Math.max(0, visible[0] - 1) && index <= Math.min(count - 1, visible.at(-1) + 1)));
    }
  }
});

test('empty, filtered and resized carousels bound the texture budget to the current viewport', () => {
  assert.deepEqual(artworkWindow(0, 0, 896, 200, 16, 12), { capacity: 0, visible: [], indices: [] });
  assert.deepEqual(artworkWindow(1, 0, 896, 200, 16, 12), { capacity: 1, visible: [0], indices: [0] });
  assert.equal(artworkWindow(31, 0, 1296, 200, 16, 12).capacity, 9);
  assert.equal(artworkWindow(31, 0, 362, 160, 16, 12).capacity, 5);
  assert.ok(artworkWindow(31, 99999, 362, 160, 16, 12).indices.length === 0, 'no stale indices while a filtered layout clamps its scroll');
});
