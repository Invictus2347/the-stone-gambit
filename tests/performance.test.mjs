import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FrameBudget, renderPixelRatio } from '../src/render-budget.js';
import { batchRigidMeshes, setPieceAnimated } from '../src/static-batches.js';

test('render budget caps high-DPI framebuffer area and never falls below half resolution', () => {
  assert.ok(renderPixelRatio(3840, 2160, 2) <= 0.5);
  assert.equal(renderPixelRatio(1280, 720, 2), 1.25);
  assert.equal(renderPixelRatio(1280, 720, 2, 0.6), 0.75);
});
test('adaptive quality requires sustained slowness and ignores tab-resume gaps', () => {
  const budget = new FrameBudget();
  for (let i = 0; i < 89; i++) assert.equal(budget.sample(40), false);
  assert.equal(budget.sample(5000), false);
  assert.equal(budget.sample(40), true);
  for (let i = 0; i < 180; i++) assert.equal(budget.sample(16.7), false);
});
test('rigid batching preserves world placement and switches back to articulated originals', () => {
  const root = new THREE.Group(),
    material = new THREE.MeshStandardMaterial();
  root.position.set(7, 0, -4);
  root.rotation.y = Math.PI;
  const originals = [1, 2, 3].map((x) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    mesh.position.x = x;
    root.add(mesh);
    return mesh;
  });
  root.updateMatrixWorld(true);
  const before = new THREE.Box3().setFromObject(root);
  const batches = batchRigidMeshes(root, originals);
  assert.equal(batches.length, 1);
  const rest = new THREE.Group();
  batches.forEach((m) => rest.add(m));
  root.add(rest);
  root.updateMatrixWorld(true);
  const after = new THREE.Box3().setFromObject(rest);
  assert.ok(before.min.distanceTo(after.min) < 1e-6);
  assert.ok(before.max.distanceTo(after.max) < 1e-6);
  root.userData.restBatch = { group: rest, originals };
  setPieceAnimated(root, false);
  assert.ok(originals.every((o) => !o.visible));
  assert.equal(rest.visible, true);
  setPieceAnimated(root, true);
  assert.ok(originals.every((o) => o.visible));
  assert.equal(rest.visible, false);
});
