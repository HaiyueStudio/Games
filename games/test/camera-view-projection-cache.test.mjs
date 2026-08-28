import assert from 'node:assert/strict';
import test from 'node:test';

import { Camera3D, SphericalTransform3D } from '@haiyue/engine';
import { CameraViewProjectionCache } from '../CameraViewProjectionCache.ts';

test('camera projection cache skips unchanged transforms and projections', () => {
  const transform = new SphericalTransform3D({
    radius: 8,
    theta: 0.25,
    phi: 0.8,
    target: [0, 0, 0],
  });
  const camera = new Camera3D({ type: 'perspective', fov: Math.PI / 4, near: 0.1, far: 100 });
  const cache = new CameraViewProjectionCache();

  assert.equal(cache.update(transform, camera, 900, 600), true);
  const firstWorldVersion = transform.worldVersion;
  const firstMatrix = [...cache.matrix];

  assert.equal(cache.update(transform, camera, 900, 600), false);
  assert.equal(transform.worldVersion, firstWorldVersion);
  assert.deepEqual([...cache.matrix], firstMatrix);
});

test('camera projection cache invalidates on transform, viewport, and camera changes', () => {
  const transform = new SphericalTransform3D({ radius: 8, theta: 0, phi: 0.8 });
  const camera = new Camera3D({ type: 'perspective', near: 0.1, far: 100 });
  const cache = new CameraViewProjectionCache();

  cache.update(transform, camera, 900, 600);
  transform.theta += 0.2;
  assert.equal(cache.update(transform, camera, 900, 600), true);
  assert.equal(cache.update(transform, camera, 1200, 600), true);
  assert.equal(camera.aspect, 2);
  camera.fov += 0.1;
  assert.equal(cache.update(transform, camera, 1200, 600), true);
  assert.equal(cache.update(transform, camera, 1200, 600), false);
});
