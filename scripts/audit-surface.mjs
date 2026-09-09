import * as THREE from 'three';
import { loadRig } from './audit-anatomy.mjs';
import { poseCombat } from '../src/combat.js';
const type = process.argv[2] ?? 'k',
  g = await loadRig(type),
  V = () => new THREE.Vector3();
poseCombat(g, 0.52, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 2.75, 2.75));
g.updateMatrixWorld(true);
g.userData.surfaceSkin.update();
const bad = [];
g.traverse((m) => {
  if (!m.userData.combatSurface) return;
  const p = m.geometry.attributes.position;
  for (let i = 0; i < p.count; i += 3) {
    const rest = [0, 1, 2].map((j) => V().fromBufferAttribute(p, i + j)),
      now = [0, 1, 2].map((j) => m.getVertexPosition(i + j, V()));
    const ratio = Math.max(
      ...[0, 1, 2].map(
        (j) =>
          now[j].distanceTo(now[(j + 1) % 3]) /
          Math.max(0.01, rest[j].distanceTo(rest[(j + 1) % 3])),
      ),
    );
    if (ratio > 3)
      bad.push({ ratio, rest: rest.map((v) => v.toArray()), now: now.map((v) => v.toArray()) });
  }
});
bad.sort((a, b) => b.ratio - a.ratio);
console.log(JSON.stringify({ type, count: bad.length, worst: bad.slice(0, 5) }, null, 2));
