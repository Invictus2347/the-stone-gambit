import * as THREE from 'three';
import { bindCombatSurface } from './combat-skin.js';
import { solveLimb, addJointLiners } from './limb-ik.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z),
  UP = V(0, 1, 0);
const ease = (t) => {
  t = THREE.MathUtils.clamp(t, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const BLADE_LENGTH = 1.35;

/** The tower stays planted. The guardian inside it shields, coils, then cuts. */
export function prepareRookCombat(group, material) {
  group.userData.combat = true;
  group.userData.rookCombat = true;
  // bindCombatSurface shares the cut vertices so the upper torso does not open
  // at its arm/neck seams; shield and tower interiors remain rigid.
  bindCombatSurface(group);
  addJointLiners(group, material);
  poseRookCombat(group, null, V(0, 0, 1), null);
}

function armIK(group, prefix, goal, pole, blend) {
  solveLimb(group, [prefix + 'Arm', prefix + 'Forearm', prefix + 'Grip'], goal, pole, blend);
}

function aimWorld(o, axis, side) {
  const y = axis.clone().normalize(),
    x = side.clone().addScaledVector(y, -side.dot(y)).normalize();
  const z = x.clone().cross(y).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  o.quaternion.copy(o.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));
}

export function poseRookCombat(group, t, dir, target) {
  const p = group.userData.parts;
  if (!p.SwordGrip || !p.ShieldGrip) return;
  for (const state of Object.values(p)) {
    state.o.position.copy(state.position);
    state.o.quaternion.setFromEuler(state.rotation);
    state.o.scale.copy(state.scale);
  }
  if (t === null) {
    delete group.userData.rookMotion;
    group.updateMatrixWorld(true);
    return;
  }
  const alive = ease((t - 0.27) / 0.15) * (1 - ease((t - 0.84) / 0.16));
  const wind = ease((t - 0.42) / 0.12),
    strike = ease((t - 0.54) / 0.135),
    recover = ease((t - 0.71) / 0.13);
  const coil = wind * (1 - strike),
    release = strike * (1 - recover);
  const side = V(-dir.z, 0, dir.x),
    center = group.getWorldPosition(V());
  const localDir = dir
    .clone()
    .applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion()).invert());
  p.Body.o.position.addScaledVector(localDir, 0.24 * release * alive);
  p.Body.o.position.y += 0.055 * alive;
  p.Body.o.rotation.y += (-0.22 * coil + 0.25 * release) * alive;
  p.Body.o.rotation.x += (-0.07 * coil + 0.13 * release) * alive;
  p.Chest.o.rotation.y += (-0.25 * coil + 0.24 * release) * alive;
  p.Head.o.rotation.y += (0.19 * coil - 0.19 * release) * alive;
  p.Head.o.rotation.x += (-0.05 * coil + 0.065 * release) * alive;
  group.updateMatrixWorld(true);

  // The shield is first brought in front of the breastplate, then settles back
  // as the sword-side shoulder carries the strike. It never attacks invisibly.
  const shieldRest = p.ShieldGrip.o.getWorldPosition(V());
  const shieldGuard = center
    .clone()
    .addScaledVector(side, -0.42)
    .addScaledVector(dir, 0.43)
    .add(V(0, 3.4, 0));
  armIK(
    group,
    'Shield',
    shieldRest.clone().lerp(shieldGuard, alive * (0.65 + 0.35 * coil)),
    side
      .clone()
      .negate()
      .add(V(0, -0.3, 0)),
    alive,
  );
  p.ShieldGrip.o.rotation.y += (-0.23 * coil + 0.08 * release) * alive;

  const swordRest = p.SwordGrip.o.getWorldPosition(V());
  const guard = center
    .clone()
    .addScaledVector(side, 0.48)
    .addScaledVector(dir, 0.44)
    .add(V(0, 3.55, 0));
  const raised = center
    .clone()
    .addScaledVector(side, 0.4)
    .addScaledVector(dir, 0.4)
    .add(V(0, 3.8, 0));
  const contact = center
    .clone()
    .addScaledVector(side, 0.12)
    .addScaledVector(dir, 0.8)
    .add(V(0, 3.25, 0));
  const goal = guard.clone().lerp(raised, wind).lerp(contact, strike).lerp(guard, recover);
  armIK(
    group,
    'Sword',
    swordRest.clone().lerp(goal, alive),
    side.clone().add(V(0, -0.3, 0)),
    alive,
  );

  const weapon = p.SwordWeapon.o,
    grip = p.SwordGrip.o,
    restGrip = grip.quaternion.clone();
  const hand = weapon.getWorldPosition(V());
  const raisedAxis = UP.clone().addScaledVector(side, 0.35).addScaledVector(dir, -0.22).normalize();
  const cutAxis = target ? target.clone().sub(hand).normalize() : dir.clone();
  const axis = UP.clone()
    .lerp(raisedAxis, wind)
    .lerp(cutAxis, strike)
    .lerp(UP, recover)
    .normalize();
  // Carry the sword with its wrist. A shared reference frame avoids the 180°
  // shortest-arc flip when crossing from raised to downward-facing angles.
  aimWorld(grip, axis, side);
  grip.quaternion.copy(restGrip.slerp(grip.quaternion.clone(), alive));
  weapon.quaternion.slerp(new THREE.Quaternion(), alive);
  group.updateMatrixWorld(true);
}

export function rookContactDistance(group, target) {
  const weapon = group.userData.parts.SwordWeapon?.o;
  if (!weapon) return Infinity;
  const a = weapon.getWorldPosition(V()),
    b = weapon.localToWorld(V(0, BLADE_LENGTH, 0));
  return new THREE.Line3(a, b).closestPointToPoint(target, true, V()).distanceTo(target);
}
