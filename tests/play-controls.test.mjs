import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ChessScene, playCameraPosition } from '../src/scene.js';
import { leaveReview } from '../src/playback-state.js';
test('play camera keeps every file and tall statue in view on phones and desktop', () => {
  for (const [width, height] of [
    [320, 844],
    [390, 844],
    [650, 900],
    [1280, 720],
  ]) {
    const camera = new THREE.PerspectiveCamera(width < 650 ? 58 : 43, width / height, 0.1, 180);
    camera.position.copy(playCameraPosition(camera.aspect, camera.fov));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    for (const x of [-13.1, 13.1])
      for (const y of [0, 5.5])
        for (const z of [-13.1, 13.1]) {
          const p = new THREE.Vector3(x, y, z).project(camera);
          assert.ok(
            Math.abs(p.x) <= 0.901 && Math.abs(p.y) <= 0.781,
            `${width}x${height}: clipped board corner`,
          );
        }
  }
});

test('leaving a still-frame review resumes the game loop and removes review-only URL flags', () => {
  const app = { manual: true },
    removed = [],
    replaced = [];
  const history = {
    state: { keep: 'state' },
    replaceState(...args) {
      replaced.push(args);
    },
  };
  leaveReview(
    app,
    { href: 'http://127.0.0.1:5178/?frame=6.6&sculpture=p&film&keep=yes#board' },
    history,
    { classList: { remove: (value) => removed.push(value) } },
  );
  assert.equal(app.manual, false);
  assert.deepEqual(removed, ['sculpture-review']);
  assert.deepEqual(replaced, [[history.state, '', '/?keep=yes#board']]);
});

test('ordinary film exit does not rewrite a playable URL or require automation hooks', () => {
  leaveReview(
    undefined,
    { href: 'http://127.0.0.1:5178/' },
    {
      replaceState() {
        assert.fail('no URL change needed');
      },
    },
    { classList: { remove() {} } },
  );
});

function pick(hits, tileSquare = 'e4') {
  const scene = Object.create(ChessScene.prototype);
  scene.renderer = {
    domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) },
  };
  scene.pointer = new THREE.Vector2();
  scene.camera = {};
  scene.pieces = new Map();
  scene.tiles = [];
  scene.raycaster = {
    setFromCamera() {},
    intersectObjects(objects) {
      return objects === scene.tiles
        ? [{ object: { userData: { square: tileSquare } } }]
        : hits.map((object) => ({ object }));
    },
  };
  return scene.pick(640, 360);
}
function piece(square, mesh) {
  const root = new THREE.Group();
  root.userData = { square, type: 'p' };
  root.add(mesh);
  return root;
}

test('generated combat meshes are clickable through their owning sculpture ancestor', () => {
  const mesh = new THREE.Mesh();
  piece('e2', mesh);
  assert.equal(mesh.userData.piece, undefined, 'new combat geometry has no legacy annotation');
  assert.equal(pick([mesh]), 'e2');
});

test('hidden weapon geometry and hidden parent groups cannot steal board clicks', () => {
  const hiddenWeapon = new THREE.Mesh();
  hiddenWeapon.visible = false;
  piece('d2', hiddenWeapon);
  const hiddenChild = new THREE.Mesh(),
    hiddenParent = piece('f2', hiddenChild);
  hiddenParent.visible = false;
  const visible = new THREE.Mesh();
  piece('e2', visible);
  assert.equal(pick([hiddenWeapon, hiddenChild, visible]), 'e2');
});

test('unowned or hidden hits fall through to the destination tile', () => {
  const hidden = new THREE.Mesh();
  hidden.visible = false;
  piece('d2', hidden);
  assert.equal(pick([new THREE.Mesh(), hidden]), 'e4');
});

test('interrupting a capture removes the unmapped victim before rebuilding the board', () => {
  const scene = Object.create(ChessScene.prototype),
    attacker = new THREE.Group(),
    victim = new THREE.Group();
  Object.assign(scene, {
    scene: new THREE.Scene(),
    pieces: new Map([['e4', attacker]]),
    capture: { victim },
    clearDebris() {},
    clearHighlights() {},
  });
  scene.scene.add(attacker, victim);
  scene.sync({ board: () => [] });
  assert.equal(scene.capture, null);
  assert.equal(scene.pieces.size, 0);
  assert.equal(scene.scene.children.length, 0, 'no ghost victim is left on the playable board');
});
