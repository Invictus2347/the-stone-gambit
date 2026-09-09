import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareCombat, poseCombat, contactDistance } from '../src/combat.js';

export async function loadRig(type) {
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
export function auditRig(g) {
  const p = g.userData.parts,
    type = g.userData.type,
    dir = new THREE.Vector3(0, 0, 1),
    target = new THREE.Vector3(0, 2.75, (type === 'p' ? 2.55 : type === 'r' ? 2.65 : 3.05) - 0.3);
  const names = [
    'SwordArm',
    'SwordForearm',
    'SwordGrip',
    'ShieldArm',
    'ShieldForearm',
    'ShieldGrip',
  ].filter((n) => p[n]);
  const pose = () => Object.fromEntries(names.map((n) => [n, p[n].o.quaternion.clone()]));
  poseCombat(g, null, dir, null);
  const rest = pose();
  let last = rest;
  const result = {
    type,
    maxJointStep: {},
    maxFlex: {},
    minFlex: {},
    rest: [],
    contact: 0,
    endJump: 0,
  };
  for (const prefix of ['Sword', 'Shield'])
    if (p[prefix + 'Arm'])
      result.rest.push({
        prefix,
        joints: ['Arm', 'Forearm', 'Grip'].map((s) =>
          p[prefix + s].o.getWorldPosition(new THREE.Vector3()).toArray(),
        ),
      });
  for (let i = 0; i <= 312; i++) {
    const t = i / 312;
    poseCombat(g, t, dir, target);
    const now = pose();
    for (const n of names) {
      const a = now[n].angleTo(last[n]);
      if (a > (result.maxJointStep[n]?.angle ?? -1)) result.maxJointStep[n] = { angle: a, t };
    }
    for (const prefix of ['Sword', 'Shield'])
      if (p[prefix + 'Arm']) {
        const a = p[prefix + 'Arm'].o.getWorldPosition(new THREE.Vector3()),
          b = p[prefix + 'Forearm'].o.getWorldPosition(new THREE.Vector3()),
          c = p[prefix + 'Grip'].o.getWorldPosition(new THREE.Vector3());
        const flex = (b.clone().sub(a).angleTo(c.clone().sub(b)) * 180) / Math.PI;
        result.maxFlex[prefix] = Math.max(result.maxFlex[prefix] ?? 0, flex);
        result.minFlex[prefix] = Math.min(result.minFlex[prefix] ?? 180, flex);
      }
    if (Math.abs(t - 0.675) < 1 / 624) result.contact = contactDistance(g, target);
    last = now;
  }
  for (const n of names) result.endJump = Math.max(result.endJump, last[n].angleTo(rest[n]));
  return result;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = [];
  for (const type of ['p', 'n', 'b', 'r', 'q', 'k']) report.push(auditRig(await loadRig(type)));
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      report.map(({ type, maxJointStep, maxFlex, minFlex, contact, endJump }) => ({
        type,
        maxJointStep,
        maxFlex,
        minFlex,
        contact,
        endJump,
      })),
      null,
      2,
    ),
  );
}
