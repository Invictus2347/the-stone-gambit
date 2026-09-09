import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Preserve rigid plate centers, but share and diffuse weights at the sculpt's
// cut boundaries. Identical seam vertices receive identical skin weights.
const cache = new Map();
export function bindCombatSurface(group) {
  const parts = group.userData.parts,
    names = ['$root', ...Object.keys(parts)],
    bones = [group, ...Object.values(parts).map((p) => p.o)];
  const surfaces = [];
  group.traverse((o) => {
    if (o.isMesh && o.name.startsWith('Carved')) surfaces.push(o);
  });
  if (!surfaces.length) return;
  let data = cache.get(group.userData.type);
  if (!data) {
    group.updateMatrixWorld(true);
    const inverse = group.matrixWorld.clone().invert(),
      vertices = new Map(),
      items = [];
    for (const mesh of surfaces) {
      let parent = mesh.parent;
      while (parent !== group && !bones.includes(parent)) parent = parent.parent;
      const owner = Math.max(0, bones.indexOf(parent));
      const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      for (const attr of Object.keys(geo.attributes))
        if (!['position', 'normal'].includes(attr)) geo.deleteAttribute(attr);
      geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
      const pos = geo.attributes.position,
        keys = [];
      for (let i = 0; i < pos.count; i++) {
        const key = [pos.getX(i), pos.getY(i), pos.getZ(i)]
          .map((v) => Math.round(v * 10000))
          .join(',');
        keys.push(key);
        if (!vertices.has(key))
          vertices.set(key, {
            owners: new Set(),
            neighbors: new Set(),
            position: [pos.getX(i), pos.getY(i), pos.getZ(i)],
          });
        vertices.get(key).owners.add(owner);
      }
      for (let i = 0; i < keys.length; i += 3)
        for (let j = 0; j < 3; j++)
          for (let k = 0; k < 3; k++)
            if (j !== k) vertices.get(keys[i + j]).neighbors.add(keys[i + k]);
      items.push({ geo, keys, material: mesh.userData.surfaceMaterialKey ?? mesh.material.name });
    }
    let weights = new Map(
      [...vertices].map(([key, v]) => [
        key,
        new Map([...v.owners].map((o) => [o, 1 / v.owners.size])),
      ]),
    );
    for (let pass = 0; pass < 10; pass++) {
      const next = new Map();
      for (const [key, v] of vertices) {
        const w = new Map([...weights.get(key)].map(([b, x]) => [b, x * 0.55]));
        for (const n of v.neighbors)
          for (const [b, x] of weights.get(n))
            w.set(b, (w.get(b) || 0) + (x * 0.45) / v.neighbors.size);
        const top = [...w].sort((a, b) => b[1] - a[1]).slice(0, 4),
          sum = top.reduce((s, v) => s + v[1], 0);
        next.set(key, new Map(top.map(([b, x]) => [b, x / sum])));
      }
      weights = next;
    }
    if (['p', 'k', 'q'].includes(group.userData.type)) {
      // A physical-width kernel removes the weight spikes caused by uneven STL
      // tessellation. Topological blur alone gives tiny triangles an extremely
      // narrow transition, stretching them into spikes as armor opens.
      // The pawn needs a narrower transition to retain its small crossed hands.
      const radius = group.userData.type === 'p' ? 0.1 : 0.18,
        grid = new Map(),
        cell = (p) => p.map((v) => Math.floor(v / radius));
      // Equal-volume samples avoid both density bias and quadratic work on the
      // densely tessellated chainmail. Each voxel contributes once to the kernel.
      const samples = new Map();
      for (const [key, v] of vertices) {
        const k = v.position.map((n) => Math.floor(n / 0.045)).join(',');
        if (!samples.has(k)) samples.set(k, { position: [0, 0, 0], weights: new Map(), count: 0 });
        const sample = samples.get(k);
        sample.count++;
        v.position.forEach((n, i) => (sample.position[i] += n));
        for (const [b, w] of weights.get(key))
          sample.weights.set(b, (sample.weights.get(b) || 0) + w);
      }
      for (const sample of samples.values()) {
        sample.position = sample.position.map((n) => n / sample.count);
        for (const [b, w] of sample.weights) sample.weights.set(b, w / sample.count);
        const address = cell(sample.position).join(',');
        if (!grid.has(address)) grid.set(address, []);
        grid.get(address).push(sample);
      }
      const softened = new Map();
      for (const [key, v] of vertices) {
        const c = cell(v.position),
          sum = new Float64Array(bones.length);
        for (let x = -1; x <= 1; x++)
          for (let y = -1; y <= 1; y++)
            for (let z = -1; z <= 1; z++) {
              const bucket = grid.get(`${c[0] + x},${c[1] + y},${c[2] + z}`);
              if (!bucket) continue;
              for (const sample of bucket) {
                const d2 = sample.position.reduce((s, n, i) => s + (n - v.position[i]) ** 2, 0);
                if (d2 >= radius * radius) continue;
                const w = (1 - d2 / (radius * radius)) ** 2;
                for (const [bone, weight] of sample.weights) sum[bone] += w * weight;
              }
            }
        // Fade the fourth influence to zero before it changes identity. Hard top-4
        // truncation tears adjacent vertices when the crossed arms share this area.
        const ranked = Array.from(sum, (w, b) => [b, w])
          .filter(([, w]) => w > 1e-9)
          .sort((a, b) => b[1] - a[1]);
        const floor = ranked[4]?.[1] ?? 0,
          top = ranked.slice(0, 4).map(([b, w]) => [b, w - floor]),
          total = top.reduce((s, [, w]) => s + w, 0);
        softened.set(
          key,
          total > 1e-12 ? new Map(top.map(([b, w]) => [b, w / total])) : weights.get(key),
        );
      }
      weights = softened;
    }
    const batches = new Map();
    for (const { geo, keys, material } of items) {
      const indices = new Uint16Array(keys.length * 4),
        values = new Float32Array(keys.length * 4);
      keys.forEach((key, i) => {
        let j = 0;
        for (const [b, w] of weights.get(key)) {
          indices[i * 4 + j] = b;
          values[i * 4 + j++] = w;
        }
      });
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(values, 4));
      if (!batches.has(material)) batches.set(material, []);
      batches.get(material).push(geo);
    }
    data = {
      names,
      geometries: [...batches].map(([material, geos]) => ({
        material,
        geometry: mergeGeometries(geos),
      })),
    };
    cache.set(group.userData.type, data);
  }
  const skeleton = new THREE.Skeleton(
    data.names.map((name) => (name === '$root' ? group : parts[name].o)),
  );
  const materials = new Map(
    surfaces.map((m) => [m.userData.surfaceMaterialKey ?? m.material.name, m.material]),
  );
  for (const m of surfaces) m.removeFromParent();
  group.updateMatrixWorld(true);
  skeleton.calculateInverses();
  for (const { geometry, material } of data.geometries) {
    const mesh = new THREE.SkinnedMesh(geometry, materials.get(material));
    mesh.name = 'Living stone surface';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.userData.piece = group;
    group.add(mesh);
    mesh.bind(skeleton, group.matrixWorld);
    mesh.userData.combatSurface = true;
  }
  group.userData.surfaceSkin = skeleton;
}
