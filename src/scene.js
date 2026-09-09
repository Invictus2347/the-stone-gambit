import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { makeMaterials } from './materials.js';
import { captureSquare } from './chess-engine.js';
import { prepareCombat, poseCombat, contactDistance } from './combat.js';
import { FrameBudget, renderPixelRatio } from './render-budget.js';
import { batchRigidMeshes, setPieceAnimated } from './static-batches.js';

const clamp = THREE.MathUtils.clamp,
  lerp = THREE.MathUtils.lerp;
const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
const vec = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const squarePosition = (s) =>
  vec((s.charCodeAt(0) - 100.5) * 3, 0, (4.5 - Number(s[1])) * 3);
export function playCameraPosition(aspect, fov) {
  const direction = vec(0, 40, 27).normalize(),
    up = vec(0, direction.z, -direction.y),
    tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  let distance = Math.hypot(40, 27);
  // Fit the board and tallest statues to both axes, including narrow phones.
  for (const x of [-13.1, 13.1])
    for (const y of [0, 5.5])
      for (const z of [-13.1, 13.1]) {
        const point = vec(x, y, z),
          towardCamera = point.dot(direction);
        distance = Math.max(
          distance,
          towardCamera + Math.abs(x) / (tan * Math.max(0.1, aspect) * 0.9),
          towardCamera + Math.abs(point.dot(up)) / (tan * 0.78),
        );
      }
  return direction.multiplyScalar(distance);
}
export class ChessScene {
  constructor(container) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#070e1a');
    this.scene.fog = new THREE.FogExp2('#091322', 0.021);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.info.autoReset = false;
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    container.appendChild(this.renderer.domElement);
    this.mobile = innerWidth < 650;
    this.camera = new THREE.PerspectiveCamera(
      this.mobile ? 58 : 43,
      innerWidth / innerHeight,
      0.1,
      180,
    );
    this.camera.position.set(...(this.mobile ? [33, 39, 42] : [23, 23, 29]));
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 9;
    this.controls.maxDistance = 90;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minPolarAngle = 0.2;
    this.materials = makeMaterials();
    this.pieces = new Map();
    this.assets = {};
    this.rawAssets = {};
    this.fractures = {};
    this.highlights = [];
    this.fragments = [];
    this.dust = [];
    this.clock = 0;
    this.capture = null;
    this.cinematic = true;
    this.reduced = false;
    this.film = false;
    this.hitCallback = () => {};
    this.savedCamera = vec();
    this.savedTarget = vec();
    this.shake = 0;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.3;
    room.dispose();
    pmrem.dispose();
    this.buildBoard();
    this.buildChamber();
    // Static chamber geometry can share draws without changing individual tiles
    // used by picking. The tile proxies remain available to the raycaster.
    const fixed = this.scene.children.filter(
      (o) => o.isMesh && o !== this.reflector && !o.material.transparent,
    );
    for (const mesh of batchRigidMeshes(this.scene, fixed)) this.scene.add(mesh);
    for (const mesh of fixed) this.scene.remove(mesh);
    this.restBatches = new Map();
    this.lights();
    this.buildAtmosphere();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new SSAOPass(this.scene, this.camera, innerWidth, innerHeight);
    this.ao.kernelRadius = 0.65;
    this.ao.minDistance = 0.001;
    this.ao.maxDistance = 0.035;
    this.composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.23, 0.6, 1.2);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.resize = () => {
      const mobile = innerWidth < 650;
      this.camera.aspect = innerWidth / innerHeight;
      if (mobile !== this.mobile) {
        this.mobile = mobile;
        this.camera.fov = mobile ? 58 : 43;
      }
      this.camera.updateProjectionMatrix();
      if (!this.film && !this.capture) this.resetCamera();
      this.renderer.setSize(innerWidth, innerHeight);
      this.composer.setSize(innerWidth, innerHeight);
    };
    window.addEventListener('resize', this.resize);
    this.frameBudget = new FrameBudget();
    this.resolutionScale = 1;
    this.setQuality(true);
  }
  mesh(geometry, material, pos, parent = this.scene) {
    const m = new THREE.Mesh(geometry, material);
    if (pos) m.position.copy(pos);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  block(size, pos, mat = this.materials.architecture) {
    return this.mesh(new THREE.BoxGeometry(...size), mat, vec(...pos));
  }
  buildBoard() {
    this.block([26.2, 0.65, 26.2], [0, -0.55, 0], this.materials.border);
    this.block([25.1, 0.17, 25.1], [0, -0.16, 0], this.materials.metal);
    this.tiles = [];
    for (let r = 1; r <= 8; r++)
      for (let f = 0; f < 8; f++) {
        const square = String.fromCharCode(97 + f) + r,
          p = squarePosition(square);
        const tile = this.mesh(
          new THREE.BoxGeometry(2.976, 0.12, 2.976),
          (f + r) % 2 ? this.materials.blueTile : this.materials.whiteTile,
          p.clone().setY(-0.055),
        );
        tile.userData.square = square;
        this.tiles.push(tile);
      }
    this.reflector = new Reflector(new THREE.PlaneGeometry(24, 24), {
      textureWidth: 1024,
      textureHeight: 1024,
      color: 0x8da4bc,
      clipBias: 0.008,
    });
    this.reflector.rotation.x = -Math.PI / 2;
    this.reflector.position.y = 0.012;
    this.reflector.material.transparent = true;
    this.reflector.material.depthWrite = false;
    this.reflector.material.fragmentShader = this.reflector.material.fragmentShader.replace(
      '1.0 );',
      '0.16 );',
    );
    this.reflector.renderOrder = 1;
    this.scene.add(this.reflector);
    // Board coordinates engraved around its perimeter.
    for (let i = 0; i < 8; i++)
      for (const edge of [0, 1]) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const c = canvas.getContext('2d');
        c.fillStyle = '#a5b4be';
        c.font = '52px Georgia';
        c.textAlign = 'center';
        c.fillText(edge ? `${8 - i}` : String.fromCharCode(65 + i), 64, 80);
        const t = new THREE.CanvasTexture(canvas);
        const m = new THREE.MeshBasicMaterial({
          map: t,
          transparent: true,
          depthWrite: false,
          opacity: 0.65,
        });
        const o = this.mesh(
          new THREE.PlaneGeometry(0.55, 0.55),
          m,
          edge ? vec(-12.45, 0.055, (i - 3.5) * 3) : vec((i - 3.5) * 3, 0.055, 12.45),
        );
        o.rotation.x = -Math.PI / 2;
      }
  }
  buildChamber() {
    this.block([100, 0.5, 100], [0, -1, 0]);
    for (let i = -2; i <= 2; i++) {
      const x = i * 8;
      for (const z of [-21]) {
        this.block([1.6, 15, 1.6], [x, 6.7, z]);
        for (const y of [-0.35, 1, 10, 13.8])
          this.block([2.1, 0.35, 2.1], [x, y, z], this.materials.border);
      }
    }
    for (const z of [-21])
      for (let i = -2; i < 2; i++) {
        const x = i * 8 + 4;
        for (let ring = 0; ring < 3; ring++) {
          const pts = [];
          for (let j = 0; j <= 48; j++) {
            const a = (j / 48) * Math.PI;
            pts.push(
              vec(x + Math.cos(a) * (3.6 + ring * 0.25), 10 + Math.sin(a) * (5.2 + ring * 0.2), z),
            );
          }
          this.mesh(
            new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.13, 6, false),
            this.materials.border,
          );
        }
        this.block([6.3, 9, 0.5], [x, 4.0, z + 0.6]);
        // Tall dark niches, interrupted by stone ribs.
        this.block(
          [3.6, 7, 0.12],
          [x, 4, z - 0.31],
          new THREE.MeshStandardMaterial({ color: '#080d16', roughness: 1 }),
        );
      }
    this.block([60, 22, 1], [0, 9, -25]);
    for (const x of [-24, 24]) {
      this.block([1, 22, 55], [x, 9, 0]);
      for (let z = -16; z <= 16; z += 8) {
        this.block([1.4, 15, 1.5], [x > 0 ? 22.7 : -22.7, 6, z]);
      }
    }
    // A great circular window high on the far wall.
    const torus = this.mesh(
      new THREE.TorusGeometry(4.1, 0.23, 8, 64),
      this.materials.border,
      vec(0, 12, -23.9),
    );
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI;
      const rib = this.block([0.12, 8, 0.17], [0, 12, -23.7], this.materials.border);
      rib.rotation.z = a;
    }
    this.flames = [];
    const fireCanvas = document.createElement('canvas');
    fireCanvas.width = 64;
    fireCanvas.height = 128;
    const fireContext = fireCanvas.getContext('2d'),
      fireGradient = fireContext.createRadialGradient(32, 98, 2, 32, 85, 60);
    fireGradient.addColorStop(0, 'rgba(255,249,215,1)');
    fireGradient.addColorStop(0.27, 'rgba(255,196,81,.95)');
    fireGradient.addColorStop(0.65, 'rgba(248,91,19,.6)');
    fireGradient.addColorStop(1, 'rgba(190,40,5,0)');
    fireContext.fillStyle = fireGradient;
    fireContext.beginPath();
    fireContext.moveTo(32, 3);
    fireContext.bezierCurveTo(57, 44, 62, 85, 50, 111);
    fireContext.bezierCurveTo(39, 134, 10, 124, 11, 100);
    fireContext.bezierCurveTo(13, 69, 34, 51, 32, 3);
    fireContext.fill();
    const fireMap = new THREE.CanvasTexture(fireCanvas);
    for (const x of [-14.7, 14.7])
      for (const z of [-11, 0, 11]) {
        this.mesh(
          new THREE.CylinderGeometry(0.32, 0.55, 0.75, 12),
          this.materials.border,
          vec(x, -0.15, z),
        );
        this.mesh(
          new THREE.CylinderGeometry(0.7, 0.32, 0.38, 12),
          this.materials.metal,
          vec(x, 0.36, z),
        );
        const light = new THREE.PointLight('#ffaf55', 22, 12, 2);
        light.position.set(x, 1.3, z);
        this.scene.add(light);
        for (let i = 0; i < 5; i++) {
          const flame = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: fireMap,
              transparent: true,
              opacity: 0.78,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            }),
          );
          flame.position.set(x + (i - 2) * 0.12, 1.0, z + (i % 2) * 0.1);
          this.scene.add(flame);
          flame.scale.set(0.68, 1.55, 1);
          flame.userData = { phase: i + x, base: flame.position.clone(), light };
          this.flames.push(flame);
        }
      }
    // Deterministic rubble outside the playable board.
    for (let i = 0; i < 65; i++) {
      const a = i * 2.399,
        r = 17 + (i % 7) * 0.48;
      const o = this.mesh(
        new THREE.DodecahedronGeometry(0.18 + (i % 5) * 0.12, 0),
        this.materials.architecture,
        vec(Math.cos(a) * r, -0.55, Math.sin(a) * r),
      );
      o.rotation.set(a, a * 0.3, a * 0.7);
      o.scale.y = 0.5;
    }
  }
  lights() {
    this.scene.add(new THREE.HemisphereLight('#b3d5ff', '#101827', 0.45));
    const key = new THREE.DirectionalLight('#bddeff', 2.8);
    key.position.set(-9, 22, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, {
      left: -20,
      right: 20,
      top: 20,
      bottom: -20,
      near: 1,
      far: 70,
    });
    key.shadow.bias = -0.00025;
    key.shadow.normalBias = 0.025;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#6c9bd3', 2.4);
    rim.position.set(7, 10, -15);
    this.scene.add(rim);
    const fill = new THREE.DirectionalLight('#e9c895', 0.75);
    fill.position.set(15, 8, 12);
    this.scene.add(fill);
    this.flash = new THREE.PointLight('#c9e4ff', 0, 13, 2);
    this.scene.add(this.flash);
  }
  buildAtmosphere() {
    const count = 420;
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      a[i * 3] = Math.sin(i * 97.3) * 22;
      a[i * 3 + 1] = ((i % 97) / 97) * 13;
      a[i * 3 + 2] = Math.cos(i * 45.2) * 23;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    this.motes = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        color: '#90b8d0',
        size: 0.037,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    this.scene.add(this.motes);
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d'),
      grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(191,210,224,.5)');
    grad.addColorStop(0.3, 'rgba(170,187,200,.22)');
    grad.addColorStop(1, 'rgba(160,177,190,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    this.dustTexture = new THREE.TextureLoader().load('/textures/limestone-dust-v2.png');
  }
  async load(onProgress) {
    const loader = new GLTFLoader();
    let n = 0;
    await Promise.all(
      ['p', 'r', 'n', 'b', 'q', 'k'].map(async (type) => {
        const gltf = await loader.loadAsync(
          `/models/${type === 'r' ? 'rook-v5' : 'combat-v4'}/${type}.glb?v=5`,
        );
        this.rawAssets[type] = gltf.scene;
        const optimized = cloneSkeleton(gltf.scene);
        // Merge rigid sculpt details within each articulated joint. Keep the source
        // meshes separately so destruction still releases individual armor parts.
        const parents = [];
        optimized.traverse((o) => {
          if (o.children.some((c) => c.isMesh)) parents.push(o);
        });
        for (const parent of parents) {
          const batches = new Map();
          for (const child of [...parent.children])
            if (child.isMesh && !child.isSkinnedMesh && !child.name.startsWith('Carved')) {
              child.updateMatrix();
              const g = child.geometry.index
                ? child.geometry.toNonIndexed()
                : child.geometry.clone();
              for (const attr of Object.keys(g.attributes))
                if (!['position', 'normal'].includes(attr)) g.deleteAttribute(attr);
              g.applyMatrix4(child.matrix);
              const key = child.material.name;
              if (!batches.has(key)) batches.set(key, { geometries: [], material: child.material });
              batches.get(key).geometries.push(g);
              parent.remove(child);
            }
          for (const batch of batches.values()) {
            const merged = mergeGeometries(batch.geometries);
            if (merged) parent.add(new THREE.Mesh(merged, batch.material));
            batch.geometries.forEach((g) => g.dispose());
          }
        }
        this.assets[type] = optimized;
        onProgress(++n / 6);
      }),
    );
    // Destruction assets are not a prerequisite for making the first move.
    // Fetch sequentially so they do not compete with all six playable models.
    this.fracturesReady = (async () => {
      for (const type of ['p', 'n', 'b', 'r', 'q', 'k']) {
        try {
          this.fractures[type] = (
            await loader.loadAsync(`/models/hero/${type}-fracture.glb?v=1`)
          ).scene;
        } catch {
          /* The existing armor-fragment fallback remains playable. */
        }
      }
    })();
  }
  createPiece(p, square) {
    this.restBatches ??= new Map();
    const group = new THREE.Group();
    const model = cloneSkeleton(this.assets[p.type]);
    group.add(model);
    group.position.copy(squarePosition(square));
    group.rotation.y = p.color === 'w' ? Math.PI : 0;
    group.userData = { square, type: p.type, color: p.color, model, parts: {} };
    model.traverse((o) => {
      if (o.isMesh) o.userData.surfaceMaterialKey = o.material.name;
      if (o.isMesh) {
        const name = o.material.name;
        o.material =
          name === 'Chainmail'
            ? this.materials[p.color === 'w' ? 'ivoryMail' : 'sapphireMail']
            : name === 'Recess'
              ? this.materials.recess
              : name === 'Engraving'
                ? this.materials[p.color === 'w' ? 'ivoryTrim' : 'sapphireTrim']
                : this.materials[p.color === 'w' ? 'ivory' : 'sapphire'];
        o.castShadow = true;
        o.receiveShadow = true;
        o.userData.piece = group;
      }
      if (
        [
          'RookRig',
          'SwordArm',
          'ShieldArm',
          'SwordForearm',
          'ShieldForearm',
          'SwordGrip',
          'ShieldGrip',
          'SwordWeapon',
          'ShieldWeapon',
          'StandLegs',
          'ChainAnchor',
          'Body',
          'Head',
          'Horse',
          'Legs',
          'RoyalSword',
          'Chain',
          'Flail',
          'ForelegL',
          'ForelegR',
          'Hips',
          'Chest',
          'Cape',
          'HorseHead',
          'ThighL',
          'ThighR',
          'ShinL',
          'ShinR',
          'FootL',
          'FootR',
          'KneeL',
          'KneeR',
        ].includes(o.name)
      )
        group.userData.parts[o.name] = {
          o,
          rotation: o.rotation.clone(),
          position: o.position.clone(),
          scale: o.scale.clone(),
        };
    });
    prepareCombat(group, this.materials[p.color === 'w' ? 'ivory' : 'sapphire']);
    const originals = [];
    group.traverseVisible((o) => {
      if (o.isMesh && !o.isSkinnedMesh && !Array.isArray(o.material) && !o.material.transparent)
        originals.push(o);
    });
    const key = `${p.color}:${p.type}`;
    if (!this.restBatches.has(key)) this.restBatches.set(key, batchRigidMeshes(group, originals));
    const rest = new THREE.Group();
    for (const template of this.restBatches.get(key)) {
      const mesh = new THREE.Mesh(template.geometry, template.material);
      mesh.castShadow = template.castShadow;
      mesh.receiveShadow = template.receiveShadow;
      rest.add(mesh);
    }
    group.add(rest);
    group.userData.restBatch = { group: rest, originals };
    setPieceAnimated(group, false);
    this.scene.add(group);
    this.pieces.set(square, group);
    return group;
  }
  sync(chess) {
    if (this.renderer) this.renderer.shadowMap.needsUpdate = true;
    // A capture removes its victim from the square map before the animation
    // ends. Interrupted films/resets must remove that orphaned statue too.
    if (this.capture?.victim) {
      this.capture.victim.userData.surfaceSkin?.dispose();
      this.scene.remove(this.capture.victim);
    }
    for (const p of this.pieces.values()) {
      p.userData.surfaceSkin?.dispose();
      this.scene.remove(p);
    }
    this.pieces.clear();
    this.clearDebris();
    this.capture = null;
    this.clearHighlights();
    for (const row of chess.board()) for (const p of row) if (p) this.createPiece(p, p.square);
  }
  clearDebris() {
    for (const f of this.fragments) this.scene.remove(f.mesh);
    this.fragments = [];
    for (const d of this.dust) {
      this.scene.remove(d.mesh);
      d.mesh.material.dispose();
    }
    this.dust = [];
  }
  clearHighlights() {
    for (const h of this.highlights) {
      this.scene.remove(h);
      h.geometry.dispose();
      h.material.dispose();
    }
    this.highlights = [];
  }
  highlight(square, moves) {
    this.clearHighlights();
    for (const [s, c, capture] of [
      [square, '#d2bb81', false],
      ...moves.map((m) => [m.to, m.captured ? '#e4a381' : '#7ccde9', !!m.captured]),
    ]) {
      const g = capture
        ? new THREE.RingGeometry(1.04, 1.11, 48)
        : new THREE.RingGeometry(
            s === square ? 1.06 : this.film ? 0.18 : 0.3,
            s === square ? 1.1 : this.film ? 0.24 : 0.48,
            48,
          );
      const m = new THREE.MeshBasicMaterial({
        color: c,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const h = new THREE.Mesh(g, m);
      h.rotation.x = -Math.PI / 2;
      h.position.copy(squarePosition(s)).y = 0.06;
      this.scene.add(h);
      this.highlights.push(h);
    }
  }
  pick(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((clientX - r.left) / r.width) * 2 - 1,
      (-(clientY - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([...this.pieces.values()], true);
    for (const hit of hits) {
      let piece,
        visible = true;
      for (let node = hit.object; node; node = node.parent) {
        if (!node.visible) {
          visible = false;
          break;
        }
        if (node.userData.square && node.userData.type) piece = node;
      }
      // Combat adds meshes after the original ownership pass. Resolve their
      // ancestor, and do not let invisible resting weapons intercept clicks.
      if (visible && piece) return piece.userData.square;
    }
    return this.raycaster.intersectObjects(this.tiles)[0]?.object.userData.square;
  }
  startMove(move, duration) {
    this.clearHighlights();
    const attacker = this.pieces.get(move.from),
      victim = move.captured ? this.pieces.get(captureSquare(move)) : null;
    const from = attacker.position.clone(),
      to = squarePosition(move.to);
    const dir = to.clone().sub(from).normalize();
    attacker.rotation.y = Math.atan2(dir.x, dir.z);
    if (victim) victim.rotation.y = Math.atan2(-dir.x, -dir.z);
    this.savedCamera.copy(this.camera.position);
    this.savedTarget.copy(this.controls.target);
    this.capture = {
      move,
      attacker,
      victim,
      from,
      to,
      dir,
      time: 0,
      duration: duration ?? (victim ? 5.8 : 2.6),
      shattered: false,
    };
    this.controls.enabled = false;
    this.highlight(move.from, [{ to: move.to, captured: move.captured }]);
    this.pieces.delete(move.from);
    if (victim) this.pieces.delete(captureSquare(move));
    this.pieces.set(move.to, attacker);
    attacker.userData.square = move.to;
    if (move.flags.includes('k') || move.flags.includes('q')) {
      const rank = move.from[1],
        rf = (move.flags.includes('k') ? 'h' : 'a') + rank,
        rt = (move.flags.includes('k') ? 'f' : 'd') + rank;
      const rook = this.pieces.get(rf);
      this.capture.rook = { piece: rook, from: rook.position.clone(), to: squarePosition(rt) };
      this.pieces.delete(rf);
      this.pieces.set(rt, rook);
      rook.userData.square = rt;
    }
    return this.capture;
  }
  pose(group, arm = 0, lean = 0, shield = 0, awaken = 0) {
    if (group.userData.combat) {
      poseCombat(group, null, vec(0, 0, 1), null);
      return;
    }
    const parts = group.userData.parts;
    // Continuous stone skins tolerate smaller, weighty articulations than rigid toy joints.
    arm *= 0.16;
    shield *= 0.18;
    lean *= 0.35;
    for (const p of Object.values(parts)) {
      p.o.rotation.copy(p.rotation);
      p.o.position.copy(p.position);
      p.o.scale.copy(p.scale);
    }
    if (parts.SwordArm) parts.SwordArm.o.rotation.x += arm;
    if (parts.ShieldArm) parts.ShieldArm.o.rotation.x += shield;
    if (parts.Body) parts.Body.o.rotation.x += lean;
    if (group.userData.type === 'p') {
      if (parts.Body) {
        parts.Body.o.rotation.x -= 0.035 * awaken;
      }
      if (parts.Legs) parts.Legs.o.scale.y *= 1 + 0.24 * awaken;
      if (parts.SwordArm) parts.SwordArm.o.rotation.z -= 0.045 * awaken;
      if (parts.ShieldArm) {
        parts.ShieldArm.o.rotation.z += 0.045 * awaken;
        parts.ShieldArm.o.rotation.x += arm * 0.92;
      }
    }
    if (parts.RoyalSword) {
      parts.RoyalSword.o.position.y += 0.6 * awaken;
      parts.RoyalSword.o.rotation.x += arm * 0.85;
    }
    if (parts.Horse) {
      parts.Horse.o.rotation.x -= awaken * 0.035;
    }
    if (parts.Chain) {
      parts.Chain.o.rotation.x += Math.sin(arm * 1.4 - 0.3) * awaken * 1.1;
      parts.Chain.o.rotation.z += Math.sin(arm * 1.7) * awaken * 0.45;
    }
    for (const key of ['ForelegL', 'ForelegR'])
      if (parts[key]) parts[key].o.rotation.x += Math.sin(awaken * 3) * 0.24;
  }
  shatter(victim, dir) {
    if (this.fractures[victim.userData.type]) {
      this.fractureStatue(victim, dir);
      return;
    }
    const raw = new THREE.Group();
    raw.position.copy(victim.position);
    raw.rotation.copy(victim.rotation);
    raw.add(this.rawAssets[victim.userData.type].clone(true));
    raw.traverse((o) => {
      const pose = victim.userData.parts[o.name];
      if (pose) o.rotation.copy(pose.o.rotation);
    });
    raw.updateMatrixWorld(true);
    let i = 0;
    const rand = () => {
      i++;
      return (Math.sin(i * 127.1 + 43.7) * 43758.5453) % 1;
    };
    raw.traverse((o) => {
      if (!o.isMesh) return;
      // Actual armor, shield and weapon meshes become individual rigid fragments.
      const name = o.material.name,
        color = victim.userData.color;
      const material =
        name === 'Recess'
          ? this.materials.recess
          : name === 'Engraving'
            ? this.materials[color === 'w' ? 'ivoryTrim' : 'sapphireTrim']
            : this.materials[color === 'w' ? 'ivory' : 'sapphire'];
      const mesh = new THREE.Mesh(o.geometry, material);
      o.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      const v = vec(
        dir.x * (1.5 + Math.abs(rand()) * 3) + rand() * 2,
        1.5 + Math.abs(rand()) * 4,
        dir.z * (1.5 + Math.abs(rand()) * 3) + rand() * 2,
      );
      this.fragments.push({
        mesh,
        v,
        spin: vec(rand() * 4, rand() * 4, rand() * 4),
        age: 0,
        scale: mesh.scale.clone(),
      });
    });
    const geo = new THREE.DodecahedronGeometry(0.09, 0);
    for (let j = 0; j < 64; j++) {
      const mesh = new THREE.Mesh(
        geo,
        victim.userData.color === 'w' ? this.materials.ivory : this.materials.sapphire,
      );
      mesh.position
        .copy(victim.position)
        .add(vec(rand() * 0.6, 0.8 + Math.abs(rand()) * 1.8, rand() * 0.6));
      mesh.scale.setScalar(0.4 + Math.abs(rand()) * 2.5);
      this.scene.add(mesh);
      this.fragments.push({
        mesh,
        v: vec(dir.x * 3 + rand() * 4, 2 + Math.abs(rand()) * 5, dir.z * 3 + rand() * 4),
        spin: vec(rand() * 6, rand() * 6, rand() * 6),
        age: 0,
        scale: mesh.scale.clone(),
      });
    }
    this.scene.remove(victim);
    this.puff(victim.position.clone().setY(1.4), 26);
    this.shake = 0.15;
    this.flash.position.copy(victim.position).y = 2;
    this.flash.intensity = 45;
    this.hitCallback();
  }
  fractureStatue(victim, dir) {
    const source = this.fractures[victim.userData.type].clone(true);
    source.position.copy(victim.position);
    source.rotation.copy(victim.rotation);
    source.updateMatrixWorld(true);
    const color = victim.userData.color;
    let i = 0;
    for (const child of [...source.children]) {
      child.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(child),
        center = box.getCenter(vec());
      const fragment = child.clone(true);
      child.matrixWorld.decompose(fragment.position, fragment.quaternion, fragment.scale);
      const pivot = new THREE.Group();
      pivot.position.copy(center);
      fragment.position.sub(center);
      pivot.add(fragment);
      fragment.traverse((o) => {
        if (o.isMesh) {
          const name = o.material.name;
          o.material =
            name === 'Interior'
              ? this.materials[color === 'w' ? 'ivoryInterior' : 'sapphireInterior']
              : name === 'Recess'
                ? this.materials.recess
                : name === 'Engraving'
                  ? this.materials[color === 'w' ? 'ivoryTrim' : 'sapphireTrim']
                  : this.materials[color === 'w' ? 'ivory' : 'sapphire'];
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      this.scene.add(pivot);
      const r1 = Math.sin(++i * 97.23),
        r2 = Math.cos(i * 63.37),
        height = center.y;
      this.fragments.push({
        mesh: pivot,
        v: vec(
          dir.x * (1.2 + height * 0.32) + r1 * 1.0,
          0.6 + Math.abs(r2) * 1.7,
          dir.z * (1.2 + height * 0.32) + r2,
        ),
        spin: vec(r1 * 2, r2 * 1.7, r1 * 1.4),
        age: 0,
        scale: pivot.scale.clone(),
        bounce: 0,
      });
    }
    this.scene.remove(victim);
    this.puff(victim.position.clone().setY(1.25), 30);
    this.shake = 0.12;
    this.flash.position.copy(victim.position).y = 1.5;
    this.flash.intensity = 12;
    this.hitCallback();
  }
  puff(pos, n = 2) {
    for (let i = 0; i < n; i++) {
      const material = new THREE.SpriteMaterial({
        map: this.dustTexture,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        color: '#9cabb5',
        rotation: i * 2.399,
      });
      const mesh = new THREE.Sprite(material);
      mesh.position
        .copy(pos)
        .add(vec(Math.sin(i * 4) * 0.4, Math.cos(i * 7) * 0.2, Math.cos(i * 3) * 0.4));
      mesh.scale.setScalar(0.6);
      this.scene.add(mesh);
      this.dust.push({
        mesh,
        age: 0,
        v: vec(Math.sin(i * 2.4) * 1.2, 0.3 + (i % 4) * 0.15, Math.cos(i * 2.4) * 1.2),
      });
    }
  }
  update(dt) {
    if (this.capture) {
      setPieceAnimated(this.capture.attacker, true);
      setPieceAnimated(this.capture.victim, true);
    }
    if (this.renderer && (this.capture || this.fragments.length))
      this.renderer.shadowMap.needsUpdate = true;
    this.clock += dt;
    this.motes.rotation.y = this.clock * 0.003;
    for (const f of this.flames) {
      const u = f.userData;
      f.scale.y = 1.6 + Math.sin(this.clock * 6 + u.phase) * 0.45;
      f.position.x = u.base.x + Math.sin(this.clock * 4 + u.phase) * 0.04;
      u.light.intensity = 21 + Math.sin(this.clock * 8 + u.phase) * 3;
    }
    this.flash.intensity *= Math.exp(-dt * 15);
    let finished = false;
    if (this.capture) {
      const a = this.capture;
      a.time += dt;
      const t = clamp(a.time / a.duration, 0, 1);
      const isHit = !!a.victim;
      if (!isHit) {
        a.attacker.position.lerpVectors(a.from, a.to, smooth(t));
        if (a.rook) a.rook.piece.position.lerpVectors(a.rook.from, a.rook.to, smooth(t));
        this.pose(a.attacker, Math.sin(t * Math.PI) * -0.08, 0, 0);
      } else {
        const spacing = Math.min(
          a.from.distanceTo(a.to) * 0.8,
          a.attacker.userData.type === 'p' ? 2.55 : a.attacker.userData.type === 'r' ? 2.65 : 3.05,
        );
        const stop = a.to.clone().addScaledVector(a.dir, -spacing);
        a.attacker.position.lerpVectors(a.from, stop, smooth(t / 0.28));
        const contact = a.to
          .clone()
          .addScaledVector(a.dir, -0.3)
          .setY(a.victim.userData.type === 'p' ? 2.2 : 2.75);
        let arm = 0,
          lean = 0;
        if (t > 0.36 && t < 0.59) {
          arm = -smooth((t - 0.36) / 0.23) * 1.9;
          lean = -0.13 * smooth((t - 0.36) / 0.23);
        } else if (t >= 0.59 && t < 0.69) {
          arm = lerp(-1.9, 1.05, smooth((t - 0.59) / 0.1));
          lean = lerp(-0.13, 0.2, smooth((t - 0.59) / 0.1));
        } else if (t >= 0.69) {
          arm = lerp(1.05, 0, smooth((t - 0.69) / 0.25));
          lean = lerp(0.2, 0, smooth((t - 0.69) / 0.25));
        }
        const awaken = smooth((t - 0.25) / 0.18) * (1 - smooth((t - 0.9) / 0.1));
        if (a.attacker.userData.combat) poseCombat(a.attacker, t, a.dir, contact);
        else this.pose(a.attacker, arm, lean, -0.22 * Math.sin(t * Math.PI), awaken);
        if (!a.shattered && a.victim.userData.combat) {
          poseCombat(a.victim, null, a.dir.clone().negate(), null);
          const brace = smooth(clamp((t - 0.43) / 0.18, 0, 1)),
            parts = a.victim.userData.parts;
          if (parts.Body) parts.Body.o.rotation.x += 0.035 * brace;
          if (parts.Head) parts.Head.o.rotation.x -= 0.06 * brace;
          if (parts.ShieldArm && !['q', 'k'].includes(a.victim.userData.type))
            parts.ShieldArm.o.rotation.x -= 0.09 * brace;
          a.victim.updateMatrixWorld(true);
        }
        if (t >= 0.54 && !a.swung) {
          a.swung = true;
          this.swingCallback?.();
        }
        if (t >= 0.675 && !a.shattered) {
          a.contactDistance = a.attacker.userData.combat ? contactDistance(a.attacker, contact) : 0;
          if (a.contactDistance < 0.7) {
            this.shatter(a.victim, a.dir);
            a.shattered = true;
          }
        }
        if (t > 0.84 && a.shattered)
          a.attacker.position.lerpVectors(stop, a.to, smooth((t - 0.84) / 0.16));
        if (this.cinematic && !this.reduced && !this.film) {
          const center = a.to.clone().addScaledVector(a.dir, -0.6).setY(1.7),
            side = vec(-a.dir.z, 0, a.dir.x);
          const desired = center
            .clone()
            .addScaledVector(side, 7.5)
            .addScaledVector(a.dir, -4.5)
            .add(vec(0, 3.0, 0));
          const weight = smooth(t / 0.2) * (1 - smooth((t - 0.86) / 0.14));
          this.camera.position.lerpVectors(this.savedCamera, desired, weight);
          this.controls.target.lerpVectors(this.savedTarget, center, weight);
        }
      }
      if (t < 0.4 && Math.floor(this.clock * 12) !== this.lastPuff) {
        this.lastPuff = Math.floor(this.clock * 12);
        this.puff(a.attacker.position, 1);
      }
      if (t >= 1) {
        // Never leave an unremoved visual victim if an asset cannot reach its target.
        if (a.victim && !a.shattered) {
          this.scene.remove(a.victim);
          console.warn('Combat contact missed', a.move.san, a.contactDistance);
        }
        a.attacker.position.copy(a.to);
        this.pose(a.attacker);
        setPieceAnimated(a.attacker, false);
        if (a.rook) a.rook.piece.position.copy(a.rook.to);
        if (a.move.promotion) {
          this.scene.remove(a.attacker);
          this.pieces.delete(a.move.to);
          this.createPiece({ type: a.move.promotion, color: a.move.color }, a.move.to);
          this.puff(a.to.clone().setY(1.2), 18);
        }
        this.capture = null;
        this.controls.enabled = !this.film;
        finished = true;
      }
    }
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const f = this.fragments[i];
      f.age += dt;
      f.v.y -= 8 * dt;
      f.mesh.position.addScaledVector(f.v, dt);
      f.mesh.rotation.x += f.spin.x * dt;
      f.mesh.rotation.y += f.spin.y * dt;
      f.mesh.rotation.z += f.spin.z * dt;
      if (f.mesh.position.y < 0.1) {
        f.mesh.position.y = 0.1;
        f.v.y = Math.abs(f.v.y) * 0.23;
        f.v.x *= 0.76;
        f.v.z *= 0.76;
        f.spin.multiplyScalar(0.65);
      }
      // Allow the impact to read, then subside before the next trailer capture.
      if (f.age > 1.8)
        f.mesh.scale.copy(f.scale).multiplyScalar(1 - smooth(clamp((f.age - 1.8) / 1.8, 0, 1)));
      if (f.age > 3.6) {
        this.scene.remove(f.mesh);
        this.fragments.splice(i, 1);
      }
    }
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const d = this.dust[i];
      d.age += dt;
      d.v.multiplyScalar(Math.exp(-dt * 1.2));
      d.mesh.position.addScaledVector(d.v, dt);
      d.mesh.scale.setScalar(0.7 + d.age * 0.85);
      d.mesh.material.opacity =
        0.15 * smooth(clamp(d.age / 0.16, 0, 1)) * (1 - smooth(clamp((d.age - 0.25) / 2.15, 0, 1)));
      if (d.age > 2.4) {
        this.scene.remove(d.mesh);
        d.mesh.material.dispose();
        this.dust.splice(i, 1);
      }
    }
    if (!this.film) this.controls.update();
    return finished;
  }
  render() {
    this.renderer.info.reset();
    const offset = vec();
    if (this.shake > 0 && !this.reduced) {
      offset.set(
        Math.sin(this.clock * 137) * this.shake,
        Math.sin(this.clock * 101) * this.shake * 0.7,
        0,
      );
      this.shake *= 0.83;
    }
    this.camera.position.add(offset);
    this.camera.lookAt(this.controls.target);
    if (this.lowQuality) this.renderer.render(this.scene, this.camera);
    else this.composer.render();
    this.camera.position.sub(offset);
  }
  resetCamera() {
    this.camera.position.copy(playCameraPosition(this.camera.aspect, this.camera.fov));
    this.controls.maxDistance = Math.max(90, this.camera.position.length() * 1.4);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }
  setQuality(low) {
    this.lowQuality = low;
    this.resolutionScale = 1;
    this.frameBudget?.reset();
    this.renderer.setPixelRatio(renderPixelRatio(innerWidth, innerHeight, devicePixelRatio));
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.reflector.visible = !low;
    this.bloom.enabled = !low;
    this.ao.enabled = !low;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.needsUpdate = true;
    this.resize();
  }
  adaptQuality(ms) {
    if (!this.lowQuality || this.resolutionScale <= 0.6 || !this.frameBudget.sample(ms)) return;
    this.resolutionScale = Math.max(0.6, this.resolutionScale - 0.15);
    this.renderer.setPixelRatio(
      renderPixelRatio(innerWidth, innerHeight, devicePixelRatio, this.resolutionScale),
    );
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
  }
}
