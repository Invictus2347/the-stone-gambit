import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Batch only opaque, rigid meshes. Animated joints and skinned stone remain intact.
export function batchRigidMeshes(root, meshes) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(),
    batches = new Map();
  for (const mesh of meshes) {
    if (mesh.isSkinnedMesh || Array.isArray(mesh.material) || mesh.material.transparent) continue;
    const key = `${mesh.material.uuid}:${mesh.castShadow}:${mesh.receiveShadow}`;
    if (!batches.has(key)) batches.set(key, { source: mesh, geometries: [] });
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const name of Object.keys(geometry.attributes))
      if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
    if (!geometry.attributes.uv)
      geometry.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(
          new Float32Array(geometry.attributes.position.count * 2),
          2,
        ),
      );
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
    batches.get(key).geometries.push(geometry);
  }
  return [...batches.values()].map(({ source, geometries }) => {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), source.material);
    mesh.castShadow = source.castShadow;
    mesh.receiveShadow = source.receiveShadow;
    geometries.forEach((geometry) => geometry.dispose());
    return mesh;
  });
}

export function setPieceAnimated(piece, active) {
  const rest = piece?.userData.restBatch;
  if (!rest) return;
  rest.group.visible = !active;
  for (const mesh of rest.originals) mesh.visible = active;
}
