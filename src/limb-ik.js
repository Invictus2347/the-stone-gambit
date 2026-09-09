import * as THREE from 'three';
const V = () => new THREE.Vector3(),
  Q = () => new THREE.Quaternion();
const frame = (x, z) => new THREE.Matrix4().makeBasis(x, z.clone().cross(x).normalize(), z);

// The source statues were sculpted with their arms closed against the body.
// Moving the plates exposes unfinished inner surfaces; fitted undersleeves
// provide volume inside those joints without changing the detailed armor.
export function addJointLiners(group, material) {
  if (group.userData.jointLiners) return;
  group.userData.jointLiners = true;
  const radius =
    group.userData.type === 'p'
      ? 0.155
      : ['k', 'q', 'b'].includes(group.userData.type)
        ? 0.135
        : 0.105;
  for (const prefix of ['Sword', 'Shield']) {
    const parts = group.userData.parts,
      upper = parts[prefix + 'Arm']?.o,
      lower = parts[prefix + 'Forearm']?.o,
      grip = parts[prefix + 'Grip']?.o;
    if (!upper || !lower || !grip) continue;
    for (const [bone, end, r] of [
      [upper, lower, radius],
      [lower, grip, radius * 0.82],
    ]) {
      const length = end.position.length();
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.82, r, length, 16), material);
      sleeve.position.copy(end.position).multiplyScalar(0.5);
      sleeve.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        end.position.clone().normalize(),
      );
      sleeve.castShadow = true;
      sleeve.receiveShadow = true;
      sleeve.name = 'Stone armor undersleeve';
      bone.add(sleeve);
      const joint = new THREE.Mesh(new THREE.SphereGeometry(r * 1.1, 16, 12), material);
      joint.castShadow = true;
      joint.receiveShadow = true;
      joint.name = 'Inner stone joint';
      bone.add(joint);
    }
  }
}

// A two-bone anatomical chain: the elbow/knee is a hinge, not a second
// ball-and-socket joint. Preserve its rest bend plane and the sculpt's roll.
export function solveLimb(group, names, goal, pole, influence = 1) {
  const p = group.userData.parts,
    upper = p[names[0]]?.o,
    lower = p[names[1]]?.o,
    grip = p[names[2]]?.o;
  if (!upper || !lower || !grip || influence <= 0) return;
  const qUpper = upper.quaternion.clone(),
    qLower = lower.quaternion.clone();
  group.updateMatrixWorld(true);
  const origin = upper.getWorldPosition(V()),
    u = lower.position.clone().normalize();
  const v = grip.position.clone().applyQuaternion(qLower).normalize();
  const restNormal = u.clone().cross(v);
  if (restNormal.lengthSq() < 1e-8)
    restNormal
      .copy(u)
      .cross(Math.abs(u.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1));
  restNormal.normalize();
  const l1 = origin.distanceTo(lower.getWorldPosition(V())),
    l2 = lower.getWorldPosition(V()).distanceTo(grip.getWorldPosition(V()));
  if (l1 < 1e-5 || l2 < 1e-5) return;
  // Keep a soft elbow at full reach and prevent forearm/upper-arm folding.
  const reach = (angle) => Math.sqrt(l1 * l1 + l2 * l2 + 2 * l1 * l2 * Math.cos(angle));
  const delta = goal.clone().sub(origin),
    distance = THREE.MathUtils.clamp(delta.length(), reach(2.6), reach(0.1));
  const direction =
    delta.lengthSq() > 1e-8
      ? delta.normalize()
      : u.clone().applyQuaternion(upper.getWorldQuaternion(Q()));
  const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance),
    height = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const bend = pole.clone().addScaledVector(direction, -pole.dot(direction));
  if (bend.lengthSq() < 1e-6)
    bend.copy(restNormal).applyQuaternion(upper.getWorldQuaternion(Q())).cross(direction);
  bend.normalize();
  const elbow = origin.clone().addScaledVector(direction, along).addScaledVector(bend, height);
  const end = origin.clone().addScaledVector(direction, distance);
  const a = elbow.clone().sub(origin).normalize(),
    b = end.clone().sub(elbow).normalize(),
    normal = a.clone().cross(b).normalize();
  const world = Q().setFromRotationMatrix(
    frame(a, normal).multiply(frame(u, restNormal).transpose()),
  );
  const desired = upper.parent.getWorldQuaternion(Q()).invert().multiply(world);
  upper.quaternion.copy(qUpper).slerp(desired, influence);
  const restFlex = Math.atan2(u.clone().cross(v).dot(restNormal), u.dot(v));
  const flex = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
  lower.quaternion.copy(qLower).slerp(
    Q()
      .setFromAxisAngle(restNormal, flex - restFlex)
      .multiply(qLower),
    influence,
  );
  group.updateMatrixWorld(true);
}
