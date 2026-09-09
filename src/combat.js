import * as THREE from 'three';
import { bindCombatSurface } from './combat-skin.js';
import { prepareRookCombat, poseRookCombat, rookContactDistance } from './rook-combat.js';
import { solveLimb, addJointLiners } from './limb-ik.js';
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z),
  UP = V(0, 1, 0);
const smooth = (t) => {
  t = THREE.MathUtils.clamp(t, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export function combatBeat(t) {
  return {
    rise: smooth((t - 0.27) / 0.15) * (1 - smooth((t - 0.84) / 0.16)),
    draw: smooth((t - 0.31) / 0.13),
    wind: smooth((t - 0.42) / 0.12),
    strike: smooth((t - 0.54) / 0.135),
    recover: smooth((t - 0.7) / 0.14),
    settle: smooth((t - 0.84) / 0.16),
  };
}
export function prepareCombat(group, material) {
  if (group.userData.type === 'r') {
    prepareRookCombat(group, material);
    return;
  }
  const parts = group.userData.parts;
  group.userData.combat = !!parts.SwordGrip;
  if (!group.userData.combat) return;
  bindCombatSurface(group);
  addJointLiners(group, material);
  if (group.userData.type === 'n') {
    const flail = new THREE.Group();
    group.add(flail);
    const head = new THREE.Group();
    flail.add(head);
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 2), material);
    head.add(ball);
    for (let i = 0; i < 12; i++) {
      const d = V(
        Math.sin(i * 2.399) * 0.8,
        Math.cos(i * 1.7),
        Math.cos(i * 2.399) * 0.8,
      ).normalize();
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.22, 5), material);
      spike.position.copy(d).multiplyScalar(0.27);
      spike.quaternion.setFromUnitVectors(UP, d);
      head.add(spike);
    }
    const links = [];
    for (let i = 0; i < 22; i++) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.017, 5, 10), material);
      flail.add(link);
      links.push(link);
    }
    flail.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    group.userData.flail = { flail, head, links };
  }
  poseCombat(group, null, V(0, 0, 1), null);
}

function solveArm(
  group,
  prefix,
  goal,
  pole,
  names = [prefix + 'Arm', prefix + 'Forearm', prefix + 'Grip'],
  influence = 1,
) {
  solveLimb(group, names, goal, pole, influence);
}
function aim(weapon, direction, side) {
  // A full wrist frame avoids the 180-degree twist discontinuity of a
  // shortest-arc UP-to-direction quaternion during the downward slash.
  const y = direction.clone().normalize(),
    x = side.clone().addScaledVector(y, -side.dot(y)).normalize(),
    z = x.clone().cross(y).normalize();
  const world = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(x, y, z),
  );
  weapon.quaternion.copy(
    weapon.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world),
  );
}

export function poseCombat(group, t, dir, target) {
  if (group.userData.type === 'r') {
    poseRookCombat(group, t, dir, target);
    return;
  }
  const p = group.userData.parts;
  if (!group.userData.combat) return;
  for (const v of Object.values(p)) {
    v.o.position.copy(v.position);
    v.o.quaternion.setFromEuler(v.rotation);
    v.o.scale.copy(v.scale);
  }
  const active = t !== null,
    b = active ? combatBeat(t) : combatBeat(0),
    type = group.userData.type;
  if (!active) dir = V(0, 0, 1).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion()));
  group.updateMatrixWorld(true);
  const feet = {};
  for (const suffix of ['L', 'R'])
    if (p['Foot' + suffix]) feet[suffix] = p['Foot' + suffix].o.getWorldPosition(V());
  const coil = b.wind * (1 - b.strike),
    release = b.strike * (1 - b.recover),
    alive = b.rise;
  const turn = (-0.28 * coil + 0.34 * release) * alive;
  if (type === 'p') {
    if (p.Hips) {
      p.Hips.o.position.y += 0.43 * alive;
      p.Hips.o.rotation.y += turn * 0.45;
      p.Hips.o.position.z -= 0.1 * coil * alive;
    }
    p.Body.o.position.y += (p.Hips ? 0.19 : 0.62) * alive;
    p.Body.o.rotation.x += (-0.48 - 0.12 * coil + 0.19 * release) * alive;
    p.Body.o.rotation.y += turn;
    if (p.StandLegs) {
      p.StandLegs.o.scale.y = 0.04 + 0.73 * b.rise;
      p.StandLegs.o.visible = b.rise > 0.01;
    }
  } else if (type === 'n') {
    p.Horse.o.rotation.x -= 0.23 * alive * (1 - 0.65 * b.strike);
    p.Horse.o.rotation.z += 0.035 * coil * alive;
    p.Body.o.rotation.x += (0.12 - 0.2 * release) * alive;
    p.Body.o.rotation.y += turn * 1.2;
    for (const [suffix, lag] of [
      ['L', 1],
      ['R', 0.78],
    ]) {
      if (p['Foreleg' + suffix])
        p['Foreleg' + suffix].o.rotation.x += (0.32 * coil - 0.22 * release) * alive * lag;
      if (p['Knee' + suffix])
        p['Knee' + suffix].o.rotation.x -= 0.4 * alive * lag * (1 - 0.6 * b.strike);
      if (p['Thigh' + suffix]) p['Thigh' + suffix].o.rotation.x -= 0.12 * alive;
    }
    if (p.HorseHead) {
      p.HorseHead.o.rotation.x += (0.14 * coil - 0.18 * release) * alive;
      p.HorseHead.o.rotation.y -= turn * 0.25;
    }
  } else {
    p.Body.o.rotation.x += (-0.12 * coil + 0.19 * release) * alive;
    p.Body.o.rotation.y += turn * 0.5;
    if (p.Chest) {
      p.Chest.o.rotation.y += turn * 0.7;
      p.Chest.o.rotation.x += (-0.08 * coil + 0.1 * release) * alive;
    }
  }
  if (p.Head) {
    p.Head.o.rotation.y -= turn * 0.55;
    p.Head.o.rotation.x += (0.13 * coil - 0.1 * release) * alive;
  }
  if (p.Cape) {
    p.Cape.o.rotation.x += (0.1 * coil - 0.14 * release) * alive;
    p.Cape.o.rotation.z -= turn * 0.2;
  }
  group.updateMatrixWorld(true);
  const side = V(dir.z, 0, -dir.x);
  if (alive > 0.001)
    for (const suffix of Object.keys(feet))
      solveArm(
        group,
        '',
        feet[suffix],
        dir,
        ['Thigh' + suffix, 'Shin' + suffix, 'Foot' + suffix],
        alive,
      );
  const royal = type === 'k' || type === 'q';
  if (royal) {
    // One shared hilt, two hands: lift the grounded blade before winding up.
    const lift = active ? smooth((t - 0.28) / 0.23) * (1 - b.settle) : 0;
    const center = group.getWorldPosition(V()),
      rest = center
        .clone()
        .addScaledVector(dir, 0.48)
        .add(V(0, 2.85, 0));
    const raised = center
      .clone()
      .addScaledVector(dir, 0.32)
      .add(V(0, type === 'k' ? 4.3 : 4.15, 0));
    const hit = target ? target.clone().addScaledVector(dir, -2.45) : rest;
    const goal = rest
      .clone()
      .lerp(raised, lift)
      .lerp(hit, b.strike * (1 - b.recover))
      .lerp(rest, b.settle);
    // Keep the shared hilt in front of both shoulders throughout the arc.
    // Passing behind the shoulder made the elbow pole invert during recovery.
    const shoulders = ['SwordArm', 'ShieldArm'].map((n) => p[n].o.getWorldPosition(V()));
    const front = Math.max(...shoulders.map((v) => v.dot(dir))) + 0.4;
    goal.addScaledVector(dir, Math.max(0, front - goal.dot(dir)));
    const angle = Math.PI * (1 - lift) - 0.32 * b.wind * (1 - b.strike);
    let blade = dir
      .clone()
      .multiplyScalar(Math.sin(angle))
      .addScaledVector(UP, Math.cos(angle))
      .normalize();
    solveArm(
      group,
      'Sword',
      goal,
      side
        .clone()
        .negate()
        .add(V(0, -0.3, 0)),
    );
    group.updateMatrixWorld(true);
    const hand = p.SwordGrip.o.getWorldPosition(V());
    if (target)
      blade.lerp(target.clone().sub(hand).normalize(), b.strike * (1 - b.recover)).normalize();
    aim(p.SwordGrip.o, blade.clone().negate(), side.clone().negate());
    p.SwordWeapon.o.rotation.set(Math.PI, 0, 0);
    p.SwordWeapon.o.visible = true;
    group.updateMatrixWorld(true);
    // The supporting hand follows the actual hilt, not a separate attack arc.
    const support = p.SwordWeapon.o.localToWorld(V(0, -0.16, 0));
    solveArm(group, 'Shield', support, side.clone().add(V(0, -0.3, 0)));
    aim(p.ShieldGrip.o, blade.clone().negate(), side.clone().negate());
    group.updateMatrixWorld(true);
  }
  for (const [prefix, sign] of royal
    ? []
    : [
        ['Sword', -1],
        ['Shield', 1],
      ]) {
    const upper = p[prefix + 'Arm']?.o,
      grip = p[prefix + 'Grip']?.o,
      weapon = p[prefix + 'Weapon']?.o;
    if (!upper || !grip) continue;
    const shoulder = upper.getWorldPosition(V()),
      rest = grip.getWorldPosition(V());
    const drawn = shoulder
      .clone()
      .addScaledVector(dir, 0.62)
      .addScaledVector(side, sign * 0.24)
      .add(V(0, -0.22, 0));
    const raised = shoulder
      .clone()
      .addScaledVector(dir, 0.46)
      .addScaledVector(side, sign * 0.3)
      .add(V(0, 0.38, 0));
    const length = type === 'p' ? 1.55 : 2.45;
    const hit = target
      ? target
          .clone()
          .addScaledVector(dir, -length)
          .addScaledVector(side, type === 'p' ? sign * 0.12 : 0)
      : drawn;
    if (type === 'n')
      hit
        .copy(shoulder)
        .addScaledVector(dir, 0.52)
        .addScaledVector(side, sign * 0.12)
        .add(V(0, -0.12, 0));
    const goal = drawn.clone().lerp(raised, b.wind).lerp(hit, b.strike).lerp(drawn, b.recover);
    goal.addScaledVector(dir, Math.max(0, shoulder.dot(dir) + 0.38 - goal.dot(dir)));
    if (b.rise > 0.001)
      solveArm(
        group,
        prefix,
        rest.lerp(goal, b.rise),
        side
          .clone()
          .multiplyScalar(sign)
          .add(V(0, -0.35, 0)),
        undefined,
        alive,
      );
    group.updateMatrixWorld(true);
    if (weapon) {
      weapon.visible = true;
      // Blades keep their length: the articulated wrist carries the weapon.
      const position = weapon.getWorldPosition(V());
      const raisedDirection = dir
        .clone()
        .multiplyScalar(-0.7)
        .add(V(0, 1.0, 0))
        .normalize();
      const hitDirection = target ? target.clone().sub(position).normalize() : dir.clone();
      let direction = UP.clone()
        .lerp(raisedDirection, b.wind)
        .lerp(hitDirection, b.strike)
        .lerp(UP, b.recover)
        .normalize();
      const pawnRest = dir
        .clone()
        .multiplyScalar(0.65)
        .addScaledVector(side, -sign * 0.85)
        .addScaledVector(UP, 0.25)
        .normalize();
      if (type === 'p') direction = pawnRest.clone().lerp(direction, alive).normalize();
      else if (!active || b.rise < 0.01) direction = V(0, -1, 0);
      const restQ = grip.quaternion.clone();
      aim(grip, direction, side);
      if (type !== 'p') grip.quaternion.copy(restQ.slerp(grip.quaternion.clone(), alive));
      // Deterministic hinge frames keep this identical at every frame rate.
      weapon.quaternion.identity();
    }
  }
  group.updateMatrixWorld(true);
  if (group.userData.flail) {
    const { head, links } = group.userData.flail,
      anchor = p.ChainAnchor.o.getWorldPosition(V());
    const angle = -Math.PI * 0.7 + b.wind * Math.PI * 1.1 + b.strike * Math.PI * 0.7;
    const orbit = anchor
      .clone()
      .addScaledVector(side, Math.cos(angle) * 1.1)
      .addScaledVector(dir, Math.sin(angle) * 0.8)
      .add(V(0, 0.65, 0));
    const hanging = anchor.clone().add(V(0, -1.4, 0));
    const end = hanging.lerp(orbit, b.rise * b.wind);
    if (target) end.lerp(target, b.strike * (1 - b.recover));
    head.position.copy(group.worldToLocal(end.clone()));
    for (let i = 0; i < links.length; i++) {
      const u = (i + 0.5) / links.length,
        point = anchor.clone().lerp(end, u);
      point.y -= Math.sin(u * Math.PI) * 0.2 * (1 - b.strike);
      links[i].position.copy(group.worldToLocal(point));
      links[i].quaternion.setFromUnitVectors(
        V(0, 0, 1),
        end
          .clone()
          .sub(anchor)
          .normalize()
          .applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion()).invert()),
      );
      links[i].rotateY(i % 2 ? Math.PI / 2 : 0);
    }
  }
  group.updateMatrixWorld(true);
}
export function contactDistance(group, target) {
  if (group.userData.type === 'r') return rookContactDistance(group, target);
  if (group.userData.flail)
    return group.userData.flail.head.getWorldPosition(V()).distanceTo(target);
  let distance = Infinity;
  for (const prefix of ['Sword', 'Shield']) {
    const w = group.userData.parts[prefix + 'Weapon']?.o;
    if (!w?.visible) continue;
    const a = w.getWorldPosition(V()),
      b = w.localToWorld(V(0, group.userData.type === 'p' ? 1.55 : 2.45, 0));
    const line = new THREE.Line3(a, b);
    distance = Math.min(distance, line.closestPointToPoint(target, true, V()).distanceTo(target));
  }
  return distance;
}
