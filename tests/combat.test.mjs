import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareCombat, poseCombat, contactDistance, combatBeat } from '../src/combat.js';
import { FilmDirector } from '../src/film.js';
import { Chess } from 'chess.js';
import { ChessScene, squarePosition } from '../src/scene.js';
import { FILM_FEN, FILM_MOVES } from '../src/chess-engine.js';
import { FILM_SHOTS } from '../src/film-timeline.js';
import { auditRig } from '../scripts/audit-anatomy.mjs';

async function rig(type) {
  const b = readFileSync(
    new URL(
      `../public/models/${type === 'r' ? 'rook-v5' : 'combat-v4'}/${type}.glb`,
      import.meta.url,
    ),
  );
  const gltf = await new GLTFLoader().parseAsync(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    '',
  );
  const group = new THREE.Group();
  group.add(gltf.scene);
  group.userData = { type, parts: {} };
  gltf.scene.traverse((o) => {
    if (!o.isMesh && !o.name.startsWith('Carved'))
      group.userData.parts[o.name] = {
        o,
        position: o.position.clone(),
        rotation: o.rotation.clone(),
        scale: o.scale.clone(),
      };
  });
  prepareCombat(group, new THREE.MeshStandardMaterial());
  return group;
}
test('pawn genuinely stands, opens both arms and draws two full-length swords', async () => {
  const p = await rig('p'),
    parts = p.userData.parts,
    y = parts.Body.o.getWorldPosition(new THREE.Vector3()).y;
  poseCombat(p, 0.52, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 2.2, 2.25));
  assert.ok(parts.Body.o.getWorldPosition(new THREE.Vector3()).y > y + 0.5);
  assert.ok(parts.SwordWeapon.o.visible && parts.ShieldWeapon.o.visible);
  assert.ok(parts.SwordWeapon.o.scale.y > 0.99);
  assert.ok(Math.abs(parts.SwordArm.o.quaternion.w) < 0.999);
  poseCombat(p, null, new THREE.Vector3(0, 0, 1), null);
  assert.equal(parts.Body.o.getWorldPosition(new THREE.Vector3()).y, y);
  assert.equal(
    parts.SwordWeapon.o.visible,
    true,
    'swords remain held rather than popping out of existence',
  );
});
test('actual weapon geometry reaches the opponent before the shatter cue', async () => {
  for (const [type, spacing, height] of [
    ['p', 2.55, 2.2],
    ['n', 3.05, 2.2],
    ['b', 3.05, 2.75],
    ['q', 3.05, 2.75],
    ['k', 3.05, 2.75],
  ]) {
    const g = await rig(type),
      target = new THREE.Vector3(0, height, spacing - 0.3);
    poseCombat(g, 0.675, new THREE.Vector3(0, 0, 1), target);
    const distance = contactDistance(g, target);
    assert.ok(distance < 0.7, `${type} contact distance ${distance}`);
  }
});
test('knight has a bucking horse and a separate linked flail', async () => {
  const g = await rig('n');
  poseCombat(g, 0.5, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 2.2, 2.75));
  assert.ok(g.userData.parts.Horse.o.rotation.x < -0.15);
  assert.equal(g.userData.flail.links.length, 22);
  assert.ok(combatBeat(0.675).strike > 0.99);
});
test('royal sword starts grounded, lifts before striking, and keeps both hands at the hilt', async () => {
  for (const type of ['k', 'q']) {
    const g = await rig(type),
      p = g.userData.parts,
      dir = new THREE.Vector3(0, 0, 1),
      target = new THREE.Vector3(0, 2.75, 2.75);
    const axis = () =>
      p.SwordWeapon.o
        .localToWorld(new THREE.Vector3(0, 1, 0))
        .sub(p.SwordWeapon.o.getWorldPosition(new THREE.Vector3()))
        .normalize();
    assert.ok(axis().y < -0.99, `${type} rests blade downward`);
    const restY = p.SwordGrip.o.getWorldPosition(new THREE.Vector3()).y;
    for (let i = 0; i <= 306; i++) {
      const t = i / 306;
      poseCombat(g, t, dir, target);
      const support = p.SwordWeapon.o.localToWorld(new THREE.Vector3(0, -0.16, 0));
      assert.ok(
        p.ShieldGrip.o.getWorldPosition(new THREE.Vector3()).distanceTo(support) < 0.13,
        `${type} support hand detached at ${t}`,
      );
      if (i === 159) {
        assert.ok(p.SwordGrip.o.getWorldPosition(new THREE.Vector3()).y > restY + 0.8);
        assert.ok(axis().y > 0.85, `${type} raises blade before slash`);
      }
    }
    poseCombat(g, null, dir, null);
    assert.ok(axis().y < -0.99);
    g.rotation.y = Math.PI;
    poseCombat(g, null, dir, null);
    assert.ok(
      g.worldToLocal(p.SwordGrip.o.getWorldPosition(new THREE.Vector3())).z > 0.2,
      'resting hilt remains in front of either army',
    );
  }
});
test('articulated joints carry carved geometry, not just empty transforms', async () => {
  for (const [type, names] of [
    [
      'p',
      [
        'Body',
        'Head',
        'SwordArm',
        'SwordForearm',
        'SwordGrip',
        'ShieldArm',
        'ShieldForearm',
        'ThighL',
        'ShinL',
      ],
    ],
    ['n', ['Body', 'Head', 'SwordArm', 'SwordForearm', 'HorseHead', 'ForelegL']],
    ['q', ['Chest', 'Head', 'SwordArm', 'SwordForearm']],
  ]) {
    const g = await rig(type);
    for (const name of names) {
      let vertices = 0;
      const bone = g.userData.surfaceSkin.bones.indexOf(g.userData.parts[name].o);
      g.traverse((m) => {
        if (m.userData.combatSurface) {
          const ids = m.geometry.attributes.skinIndex,
            w = m.geometry.attributes.skinWeight;
          for (let i = 0; i < ids.count; i++)
            for (let j = 0; j < 4; j++)
              if (ids.array[i * 4 + j] === bone && w.array[i * 4 + j] > 0.2) vertices++;
        }
      });
      assert.ok(vertices > 30, `${type}/${name} owns sculpted surface (${vertices})`);
    }
  }
});
test('full-body joints move and blade length stays fixed throughout an attack', async () => {
  for (const [type, names] of [
    ['p', ['Hips', 'Head', 'SwordArm', 'SwordForearm', 'ShieldArm', 'ThighL', 'ShinL']],
    ['n', ['Body', 'Head', 'HorseHead', 'ForelegL', 'KneeL', 'SwordArm']],
  ]) {
    const g = await rig(type),
      parts = g.userData.parts,
      rest = new Map(names.map((n) => [n, parts[n].o.quaternion.clone()]));
    poseCombat(g, 0.52, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 2.2, 2.75));
    for (const n of names)
      assert.ok(parts[n].o.quaternion.angleTo(rest.get(n)) > 0.015, `${type}/${n} animates`);
    for (let t = 0.32; t < 0.99; t += 0.01) {
      poseCombat(g, t, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 2.2, 2.75));
      assert.equal(parts.SwordWeapon.o.scale.y, parts.SwordWeapon.scale.y);
    }
  }
});
test('dust clears by 2.4 seconds and settled rubble clears by 3.6 seconds', () => {
  const s = Object.create(ChessScene.prototype),
    mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
    dust = new THREE.Sprite(new THREE.SpriteMaterial());
  Object.assign(s, {
    scene: new THREE.Scene(),
    fragments: [
      {
        mesh,
        v: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        age: 0,
        scale: new THREE.Vector3(1, 1, 1),
      },
    ],
    dust: [{ mesh: dust, age: 0, v: new THREE.Vector3() }],
    clock: 0,
    motes: { rotation: { y: 0 } },
    flames: [],
    flash: { intensity: 0 },
    capture: null,
    film: true,
  });
  s.scene.add(mesh, dust);
  for (let i = 0; i < 150; i++) s.update(1 / 60);
  assert.equal(s.dust.length, 0);
  assert.ok(mesh.scale.x < 1 && mesh.scale.x > 0);
  for (let i = 0; i < 70; i++) s.update(1 / 60);
  assert.equal(s.fragments.length, 0);
  assert.equal(s.scene.children.length, 0);
});
test('attack joints blend frame to frame without an awakening snap', async () => {
  for (const type of ['p', 'n', 'q']) {
    const g = await rig(type),
      names = ['SwordArm', 'SwordForearm', 'SwordGrip', 'Head', 'Body'];
    let prior;
    for (let i = 0; i <= 306; i++) {
      poseCombat(g, i / 306, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 2.2, 2.75));
      const now = names.map((n) => g.userData.parts[n].o.quaternion.clone());
      if (prior)
        for (let j = 0; j < names.length; j++)
          assert.ok(now[j].angleTo(prior[j]) < 0.45, `${type}/${names[j]} snapped at ${i / 306}`);
      prior = now;
    }
  }
});
test('both arms of all six sculptures stay within hinge limits and restore their rest poses', async () => {
  for (const type of ['p', 'n', 'b', 'r', 'q', 'k']) {
    const result = auditRig(await rig(type));
    for (const [name, { angle, t }] of Object.entries(result.maxJointStep))
      assert.ok(angle < 0.2, `${type}/${name} jumps ${angle} radians at ${t}`);
    for (const [arm, flex] of Object.entries(result.maxFlex))
      assert.ok(flex <= 149.1, `${type}/${arm} folds to ${flex} degrees`);
    for (const [arm, flex] of Object.entries(result.minFlex))
      assert.ok(flex >= 5.7, `${type}/${arm} locks at ${flex} degrees`);
    assert.ok(result.endJump < 1e-6, `${type} does not return to its exact rest pose`);
  }
});
test('attack poses are independent of frame history and preserve limb segment lengths', async () => {
  const dir = new THREE.Vector3(0, 0, 1),
    target = new THREE.Vector3(0, 2.75, 2.75);
  for (const type of ['p', 'n', 'b', 'r', 'q', 'k']) {
    const g = await rig(type),
      parts = g.userData.parts;
    const transforms = () =>
      Object.fromEntries(
        Object.entries(parts).map(([n, { o }]) => [
          n,
          [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()],
        ]),
      );
    const lengths = Object.fromEntries(
      Object.entries(parts)
        .filter(([n]) => /Forearm|Grip/.test(n))
        .map(([n, { o }]) => [n, o.position.length()]),
    );
    for (const t of [0.0, 0.29, 0.35, 0.44, 0.52, 0.6, 0.675, 0.73, 0.85, 0.95, 1]) {
      poseCombat(g, t, dir, target);
      const expected = transforms();
      for (const earlier of [0.9, 0.1, 0.7, 0.2]) poseCombat(g, earlier, dir, target);
      poseCombat(g, t, dir, target);
      const actual = transforms();
      for (const n of Object.keys(expected))
        expected[n].forEach((v, i) =>
          assert.ok(
            Math.abs(v - actual[n][i]) < 1e-8,
            `${type}/${n}: history-dependent pose at ${t}`,
          ),
        );
      for (const [n, length] of Object.entries(lengths))
        assert.ok(
          Math.abs(parts[n].o.position.length() - length) < 1e-8,
          `${type}/${n}: bone stretched`,
        );
      if (type === 'p')
        for (const n of ['SwordWeapon', 'ShieldWeapon'])
          assert.equal(parts[n].o.visible, true, 'held sword must not pop in or out');
    }
  }
});
test('leaving the trailer restores the exact playable position and history', () => {
  const chess = new Chess();
  chess.move('e4');
  chess.move('e5');
  const fen = chess.fen(),
    history = chess.history();
  const scene = {
    camera: { fov: 43, updateProjectionMatrix() {} },
    controls: { enabled: true },
    sync() {},
    resetCamera() {},
  };
  const film = new FilmDirector(scene, chess, { atmosphere() {} }, () => {});
  film.start();
  assert.notEqual(chess.fen(), fen);
  film.stop();
  assert.equal(chess.fen(), fen);
  assert.deepEqual(chess.history(), history);
  assert.ok(chess.move('Nf3'));
});
test('real move handler lands all five captures on legal squares and hits before removal', async () => {
  const game = new Chess(FILM_FEN),
    s = Object.create(ChessScene.prototype);
  Object.assign(s, {
    scene: new THREE.Scene(),
    pieces: new Map(),
    highlights: [],
    fragments: [],
    dust: [],
    clock: 0,
    motes: { rotation: { y: 0 } },
    flames: [],
    flash: { intensity: 0 },
    savedCamera: new THREE.Vector3(),
    savedTarget: new THREE.Vector3(),
    camera: new THREE.PerspectiveCamera(),
    controls: { target: new THREE.Vector3(), enabled: true, update() {} },
    cinematic: false,
    reduced: false,
    film: false,
    shake: 0,
  });
  s.puff = () => {};
  let hits = 0;
  s.shatter = (v) => {
    assert.ok(
      s.capture.time / s.capture.duration < 0.71,
      'contact stays synchronized with the impact cue',
    );
    s.scene.remove(v);
    hits++;
  };
  for (const row of game.board())
    for (const piece of row)
      if (piece) {
        const g = piece.type === 'r' ? new THREE.Group() : await rig(piece.type);
        g.userData.type = piece.type;
        g.userData.parts ??= {};
        g.userData.square = piece.square;
        g.userData.color = piece.color;
        g.position.copy(squarePosition(piece.square));
        s.pieces.set(piece.square, g);
        s.scene.add(g);
      }
  for (const san of FILM_MOVES) {
    const move = game.move(san),
      before = hits;
    s.startMove(move, 5.1);
    for (let i = 0; i < 310 && s.capture; i++) s.update(1 / 60);
    assert.equal(hits, before + 1, `${san} made weapon contact`);
    assert.equal(s.capture, null);
    assert.equal(s.pieces.size, game.board().flat().filter(Boolean).length);
    for (const [square, g] of s.pieces)
      assert.ok(
        g.position.distanceTo(squarePosition(square)) < 1e-6,
        `${san}: ${square} has correct world position`,
      );
  }
});

test('every v5 character makes visible weapon contact in its actual cinematic study', async () => {
  for (const shot of FILM_SHOTS) {
    const game = new Chess(shot.fen),
      s = Object.create(ChessScene.prototype);
    Object.assign(s, {
      scene: new THREE.Scene(),
      pieces: new Map(),
      highlights: [],
      fragments: [],
      dust: [],
      clock: 0,
      motes: { rotation: { y: 0 } },
      flames: [],
      flash: { intensity: 0 },
      savedCamera: new THREE.Vector3(),
      savedTarget: new THREE.Vector3(),
      camera: new THREE.PerspectiveCamera(),
      controls: { target: new THREE.Vector3(), enabled: true, update() {} },
      cinematic: false,
      reduced: false,
      film: false,
      shake: 0,
    });
    s.puff = () => {};
    let hits = 0;
    s.shatter = (v) => {
      assert.ok(s.capture.time / s.capture.duration < 0.71, shot.name + ' impact synchronization');
      s.scene.remove(v);
      hits++;
    };
    for (const row of game.board())
      for (const piece of row)
        if (piece) {
          const g = await rig(piece.type);
          Object.assign(g.userData, { square: piece.square, color: piece.color });
          g.position.copy(squarePosition(piece.square));
          s.pieces.set(piece.square, g);
          s.scene.add(g);
        }
    s.startMove(game.move(shot.san), shot.duration);
    for (let i = 0; i < 320 && s.capture; i++) s.update(1 / 60);
    assert.equal(hits, 1, shot.name + ' contacts once');
    assert.equal(s.capture, null);
    assert.equal(s.pieces.size, game.board().flat().filter(Boolean).length);
    for (const [square, g] of s.pieces)
      assert.ok(
        g.position.distanceTo(squarePosition(square)) < 1e-6,
        shot.name + ' lands at ' + square,
      );
  }
});
