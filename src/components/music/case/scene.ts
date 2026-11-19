/* Prototype "Estuche" (CaseStory.astro): an instrument in its hard case, drawn live with WebGL.

   The case is made from the instrument itself: the model's outline, taken slice by slice along its
   length and grown by a disc (a Minkowski sum), gives the shell's shape, rounded at every corner, and,
   grown less, the fitted cavity it lies in. The shell is satin black with a fine grain, an aluminium
   valance runs round the seam, three latches sit on the front, and the cavity and the lid are lined with
   velvet (sheen, no gloss). One soft spotlight from above casts real shadows: the lid's on the lining,
   the instrument's in its cavity once it lifts. The rest of the light is the studio's (../strings).

   Case space: the instrument's own (x across, y along its length, z out of its face), so it lies in its
   cavity as modelled; the case is then laid on the floor, its length across the screen (on a phone, up
   the screen), the hinge at the back. */
import {
  AgXToneMapping, BufferAttribute, BufferGeometry, CanvasTexture, Color, DataTexture, ExtrudeGeometry,
  Group, InstancedMesh, Material, MathUtils, Matrix4, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D,
  PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Quaternion, Raycaster,
  RectAreaLight, RepeatWrapping, RGBAFormat, Scene, ShadowMaterial, Shape, ShapeGeometry, SpotLight, SRGBColorSpace,
  Vector2, Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export interface CaseOptions {
  url: string; // the instrument (public/music/instruments/*.glb)
  paint: string; // its material that gets the satin finish
  lining: string; // the velvet's colour
  sheen: string; // the velvet's sheen
}

/** Where a case is, moved from its place on the floor (world units, radians). */
export interface Placement {
  along: number; // along its own length (on a phone, up the screen)
  up: number; // off the floor
  flip: number; // turned over about its own length, the near edge rising first (a record turned over)
  yaw: number; // turned about the vertical
  visible: boolean;
}

export interface Kit {
  /** lid: 0 shut, 1 open (beyond either is rubber band); lift: 0 in its cavity, 1 lifted out to you;
      latch: 0 latched, 1 open. */
  set(lid: number, lift: number, latch: number): void;
  place(placement: Partial<Placement>): void;
  /** Where the lid's front edge would be on screen, in css px, at this opening. */
  edge(lid: number): Vector2;
  /** Points of the lid's lining (case-space x across, y along) on screen, in css px, at this opening,
      and whether the lining faces the camera there. */
  onLining(points: [number, number][], lid: number): { screen: Vector2[]; facing: boolean };
  /** The lining's extent in case space: across (back to front) and along (the body's widest stretch). */
  liningBox: { back: number; front: number; from: number; to: number };
  /** Whether this point of the canvas (css px) is on this case. */
  onLid(x: number, y: number): boolean;
}

export interface CaseScene {
  kits: Kit[];
  resize(width: number, height: number, ratio: number, portrait: boolean): void;
  render(): void;
  dispose(): void;
}

const LID_OPEN = MathUtils.degToRad(102); // the lid at rest, open, leaning back a little past upright
const STEP = 1 / 400; // slices along the length
const RANGE = .62; // slices cover y in [-RANGE, RANGE]
const SHELL = .04; // the shell grows the outline by this...
const CAVITY = .012; // ...the cavity by this
const H_BASE = .075; // the bottom half's height
const H_LID = .045; // the lid's
const FLOOR = .018; // the cavity's floor, above the bottom of the case

const smooth = (t: number) => t * t * (3 - 2 * t);
let lightsReady = false;

/* The paint is satin, not lacquer (as in ../strings/instrument.ts). */
function satin(material: Material) {
  if (!(material instanceof MeshStandardMaterial)) return;
  if (material instanceof MeshPhysicalMaterial) material.clearcoat = 0;
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>',
      '#include <metalnessmap_fragment>\n\troughnessFactor = mix(max(roughnessFactor, .46), roughnessFactor, step(.5, metalnessFactor));');
  };
  material.customProgramCacheKey = () => 'satin';
  material.needsUpdate = true;
}

/* A tileable grain as a normal map: white noise, blurred `soft` times, read as a height. */
function grain(size: number, soft: number, strength: number) {
  let height = new Float32Array(size * size).map(() => Math.random());
  for (let pass = 0; pass < soft; pass++) {
    const next = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += height[((y + dy + size) % size) * size + (x + dx + size) % size]!;
      next[y * size + x] = sum / 9;
    }
    height = next;
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const h = (dx: number, dy: number) => height[((y + dy + size) % size) * size + (x + dx + size) % size]!;
    const nx = (h(-1, 0) - h(1, 0)) * strength, ny = (h(0, -1) - h(0, 1)) * strength;
    const length = Math.hypot(nx, ny, 1);
    const i = (y * size + x) * 4;
    data[i] = (nx / length * .5 + .5) * 255;
    data[i + 1] = (ny / length * .5 + .5) * 255;
    data[i + 2] = (1 / length * .5 + .5) * 255;
    data[i + 3] = 255;
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/* The instrument's outline, slice by slice: for each slice along its length, how far it reaches left and
   right. Slices a long triangle spans without a vertex are filled in from their neighbours. */
function outline(model: Object3D) {
  const n = Math.round(2 * RANGE / STEP);
  const lo = new Float32Array(n).fill(Infinity), hi = new Float32Array(n).fill(-Infinity);
  let zmin = Infinity, zmax = -Infinity;
  const v = new Vector3();
  model.updateMatrixWorld(true);
  const matrix = new Matrix4(), each = new Matrix4();
  model.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const position = node.geometry.attributes.position as BufferAttribute;
    // Repeated parts (tuners, knobs) are one mesh drawn many times: each copy where it is placed.
    const copies = node instanceof InstancedMesh ? node.count : 1;
    for (let copy = 0; copy < copies; copy++) {
      matrix.copy(node.matrixWorld);
      if (node instanceof InstancedMesh) matrix.multiply((node.getMatrixAt(copy, each), each));
      for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(matrix);
      const slice = Math.floor((v.y + RANGE) / STEP);
      if (slice < 0 || slice >= n) continue;
      if (v.x < lo[slice]!) lo[slice] = v.x;
      if (v.x > hi[slice]!) hi[slice] = v.x;
      zmin = Math.min(zmin, v.z);
      zmax = Math.max(zmax, v.z);
      }
    }
  });
  let previous = -1;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(hi[i]!)) continue;
    if (previous >= 0 && i - previous > 1) {
      for (let j = previous + 1; j < i; j++) {
        const t = (j - previous) / (i - previous);
        lo[j] = lo[previous]! + (lo[i]! - lo[previous]!) * t;
        hi[j] = hi[previous]! + (hi[i]! - hi[previous]!) * t;
      }
    }
    previous = i;
  }
  return { lo, hi, zmin, zmax };
}

/* The outline grown by a disc of radius `r` (round at every corner and at both ends), smoothed, as a
   closed path of points. */
function disc(lo: Float32Array, hi: Float32Array, r: number) {
  const n = lo.length, k = Math.ceil(r / STEP);
  const left = new Float32Array(n).fill(Infinity), right = new Float32Array(n).fill(-Infinity);
  for (let i = 0; i < n; i++) {
    for (let j = Math.max(0, i - k); j <= Math.min(n - 1, i + k); j++) {
      if (!Number.isFinite(hi[j]!)) continue;
      const dy = (i - j) * STEP;
      if (Math.abs(dy) > r) continue;
      const s = Math.sqrt(r * r - dy * dy);
      right[i] = Math.max(right[i]!, hi[j]! + s);
      left[i] = Math.min(left[i]!, lo[j]! - s);
    }
  }
  return { left, right };
}

function grown(lo: Float32Array, hi: Float32Array, r: number, smoothing: number) {
  const n = lo.length;
  const { left, right } = disc(lo, hi, r);
  // Smoothing must never bring the line closer to the instrument than three quarters of `r`, or a
  // narrow feature (a tuner, a strap button) would push through the case it is in.
  const floor = disc(lo, hi, r * .75);
  const soften = (values: Float32Array) => {
    const out = new Float32Array(values);
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(values[i]!)) continue;
      let sum = 0, count = 0;
      for (let j = i - smoothing; j <= i + smoothing; j++) if (j >= 0 && j < n && Number.isFinite(values[j]!)) { sum += values[j]!; count++; }
      out[i] = sum / count;
    }
    return out;
  };
  const l = soften(left), rr = soften(right);
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(floor.right[i]!)) rr[i] = Math.max(rr[i]!, floor.right[i]!);
    if (Number.isFinite(floor.left[i]!)) l[i] = Math.min(l[i]!, floor.left[i]!);
  }
  const points: Vector2[] = [];
  const y = (i: number) => -RANGE + (i + .5) * STEP;
  const filled = [...Array(n).keys()].filter(i => Number.isFinite(rr[i]!));
  const first = filled[0]!, last = filled[filled.length - 1]!;
  for (let i = first; i <= last; i += 2) points.push(new Vector2(rr[i]!, y(i)));
  points.push(new Vector2(rr[last]!, y(last)));
  for (let i = last; i >= first; i -= 2) points.push(new Vector2(l[i]!, y(i)));
  points.push(new Vector2(l[first]!, y(first)));
  // The very ends meet in a point; average them so the shape closes on a curve, not a spike.
  return { points, left: l, right: rr, first, last, y };
}

/* The cavity's floor: white, darkening into the walls, as a soft inner shadow does. */
function floorShade(points: Vector2[]) {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const at = (p: Vector2) => [(p.x + RANGE) / (2 * RANGE) * size, (1 - (p.y + RANGE) / (2 * RANGE)) * size] as const;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, size, size);
  const path = new Path2D();
  points.forEach((p, i) => (i ? path.lineTo(...at(p)) : path.moveTo(...at(p))));
  path.closePath();
  context.save();
  context.clip(path);
  context.shadowColor = 'rgba(0,0,0,.9)';
  context.shadowBlur = 26;
  context.lineWidth = 24;
  context.strokeStyle = '#000';
  context.stroke(path);
  context.restore();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/* Normalised uv for a shape in case space, so one texture spans the whole case. */
function spanUV(geometry: BufferGeometry) {
  const position = geometry.attributes.position as BufferAttribute;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    uv[i * 2] = (position.getX(i) + RANGE) / (2 * RANGE);
    uv[i * 2 + 1] = (position.getY(i) + RANGE) / (2 * RANGE);
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
}

/* The cavity's walls: a band from the rim down to the floor, facing in, lighter at the top. */
function walls(points: Vector2[], top: number, bottom: number) {
  const count = points.length;
  const position = new Float32Array(count * 2 * 3);
  const color = new Float32Array(count * 2 * 3);
  const uv = new Float32Array(count * 2 * 2);
  let along = 0;
  points.forEach((p, i) => {
    if (i) along += p.distanceTo(points[i - 1]!);
    position.set([p.x, p.y, top, p.x, p.y, bottom], i * 6);
    color.set([1, 1, 1, .32, .32, .32], i * 6);
    uv.set([along * 8, 1, along * 8, 0], i * 4);
  });
  const index: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = i * 2, b = ((i + 1) % count) * 2;
    index.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('color', new BufferAttribute(color, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  // Facing into the cavity: flip if the path runs the other way round.
  const area = points.reduce((sum, p, i) => sum + p.x * points[(i + 1) % count]!.y - points[(i + 1) % count]!.x * p.y, 0);
  if (area < 0) {
    geometry.setIndex(index.map((_, i) => index[i - (i % 3) + [0, 2, 1][i % 3]!]!));
    geometry.computeVertexNormals();
  }
  return geometry;
}

export async function createCases(canvas: HTMLCanvasElement, list: CaseOptions[]): Promise<CaseScene> {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  if (!lightsReady) {
    RectAreaLightUniformsLib.init();
    lightsReady = true;
  }

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environment = environment;
  scene.environmentIntensity = .1;

  // The light: one soft spot from above and a little in front, which casts the shadows; a broad soft
  // box overhead for the satin; two strips behind for the outline; a faint band low in front.
  const warm = new Color(1, .93, .85), cool = new Color(.86, .92, 1);
  const key = new SpotLight(warm, 15, 0, .62, 1, 2);
  key.position.set(-.35, 2.3, 1.05);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -.0004;
  key.shadow.normalBias = .004;
  key.shadow.radius = 6;
  key.shadow.camera.near = .8;
  key.shadow.camera.far = 4;
  scene.add(key, key.target);
  const boxes: [number, number, number, number, number, number, Color][] = [
    [-.2, 1.7, .3, 1.5, 1.8, 1, warm],
    [-1.5, .45, -.5, 3.2, .4, 1.6, cool],
    [1.5, .4, -.6, 2.2, .4, 1.6, warm],
    [0, .35, 2.2, .45, 2.4, .5, warm],
  ];
  for (const [x, y, z, intensity, width, height, colour] of boxes) {
    const light = new RectAreaLight(colour, intensity, width, height);
    light.position.set(x, y, z);
    light.lookAt(0, 0, 0);
    scene.add(light);
  }

  // The floor is the page's black. Under the case, a faint pool of the spot's light, fading to black
  // with no edge, and in it the case's own shadow, so it rests on something.
  const poolCanvas = document.createElement('canvas');
  poolCanvas.width = poolCanvas.height = 512;
  const pool = poolCanvas.getContext('2d')!;
  const glow = pool.createRadialGradient(256, 256, 0, 256, 256, 256);
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const level = Math.round(30 * Math.pow(1 - t, 2.2)); // eased to black, so no ring shows
    glow.addColorStop(t, `rgb(${level},${Math.round(level * .94)},${Math.round(level * .88)})`);
  }
  pool.fillStyle = glow;
  pool.fillRect(0, 0, 512, 512);
  const poolTexture = new CanvasTexture(poolCanvas);
  poolTexture.colorSpace = SRGBColorSpace;
  const floor = new Mesh(new PlaneGeometry(3.4, 2.4), new MeshBasicMaterial({ map: poolTexture, toneMapped: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.001;
  scene.add(floor);
  const catcher = new Mesh(new PlaneGeometry(6, 6), new ShadowMaterial({ opacity: .75 }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.receiveShadow = true;
  scene.add(catcher);

  const tolex = grain(256, 2, 3);
  tolex.repeat.set(9, 9);
  const shellMaterial = new MeshPhysicalMaterial({
    color: 0x0d0d0e, roughness: .64, metalness: 0, sheen: .35, sheenColor: new Color(0x2a2a2c), sheenRoughness: .7,
    normalMap: tolex, normalScale: new Vector2(.5, .5),
  });
  const fibre = grain(256, 0, 1.2);
  fibre.repeat.set(40, 40);
  const valanceMaterial = new MeshPhysicalMaterial({ color: 0x9a9a9e, metalness: 1, roughness: .38 });
  const latchMaterial = new MeshPhysicalMaterial({ color: 0xb4b4b8, metalness: 1, roughness: .3 });
  const latchShape = new RoundedBoxGeometry(.032, .05, .03, 3, .006);

  const camera = new PerspectiveCamera(26, 1, .1, 30);
  // Case space laid on the floor: its z up, its length along the screen (x), its front (x) towards you.
  const landscape = new Matrix4().makeBasis(new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 1, 0));
  // On a phone: its length up the screen, away from you, the head end far.
  const portraitBasis = new Matrix4().makeBasis(new Vector3(1, 0, 0), new Vector3(0, 0, -1), new Vector3(0, 1, 0));
  let portraitNow = false;
  let size = new Vector2(1, 1);
  let lifted = .2; // how far an instrument rises, in instrument lengths
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const point = new Vector3();
  const toScreen = (local: Vector3, frame: Object3D) => {
    point.copy(local).applyMatrix4(frame.matrixWorld).project(camera);
    return new Vector2((point.x + 1) / 2 * size.x, (1 - point.y) / 2 * size.y);
  };
  const resizers: (() => void)[] = [];
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

  async function kit(options: CaseOptions): Promise<Kit> {
    const model: Object3D = (await loader.loadAsync(options.url)).scene;
    model.traverse(node => {
      if (!(node instanceof Mesh)) return;
      node.castShadow = true;
      node.receiveShadow = true;
      for (const material of [node.material].flat()) if (material.name === options.paint) satin(material);
    });

    // The case, from the instrument's outline.
    const { lo, hi, zmin, zmax } = outline(model);
    const shell = grown(lo, hi, SHELL, 10);
    const cavity = grown(lo, hi, CAVITY, 4);
    const liner = grown(lo, hi, SHELL - .016, 10);
    const hole = new Shape(cavity.points);
    const depth = Math.max(H_BASE, FLOOR + (zmax - zmin) * .8 + .01);
    const velvet = (map?: CanvasTexture, colors = false) => new MeshPhysicalMaterial({
      color: new Color(options.lining), roughness: 1, metalness: 0,
      sheen: 1, sheenColor: new Color(options.sheen), sheenRoughness: .42,
      normalMap: fibre, normalScale: new Vector2(.22, .22), map: map ?? null, vertexColors: colors,
    });

    const root = new Group(); // where the case is in the world, moved
    const caseFrame = new Group(); // case space laid on the floor
    const body = new Group(); // the whole case, in case space
    caseFrame.add(body);
    root.add(caseFrame);
    scene.add(root);

    // The bottom half: a ring round the cavity (with a rounded top edge), its walls, its floor.
    const bevel = .012;
    const baseRing = new Shape(shell.points);
    baseRing.holes.push(hole);
    const base = new Mesh(new ExtrudeGeometry(baseRing, {
      depth: depth - bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * .6, bevelOffset: -bevel * .6, bevelSegments: 4, curveSegments: 1,
    }), shellMaterial);
    base.position.z = bevel;
    base.castShadow = base.receiveShadow = true;
    body.add(base);
    const cavityFloor = new ShapeGeometry(new Shape(cavity.points));
    spanUV(cavityFloor);
    const floorMesh = new Mesh(cavityFloor, velvet(floorShade(cavity.points)));
    floorMesh.position.z = FLOOR;
    floorMesh.receiveShadow = true;
    body.add(floorMesh);
    const wallMesh = new Mesh(walls(cavity.points.map(p => p.clone().multiplyScalar(.999)), depth + bevel * .2, FLOOR), velvet(undefined, true));
    wallMesh.receiveShadow = true;
    body.add(wallMesh);
    // The underside, so a case turned over is closed.
    const under = new Mesh(new ShapeGeometry(new Shape(shell.points)), shellMaterial);
    under.scale.z = -1;
    under.position.z = .0005;
    body.add(under);

    // The valance: a thin band of aluminium round the seam.
    const band = new Shape(grown(lo, hi, SHELL + .0025, 10).points);
    band.holes.push(new Shape(grown(lo, hi, SHELL - .006, 10).points));
    const valance = new Mesh(new ExtrudeGeometry(band, { depth: .007, bevelEnabled: false, curveSegments: 1 }), valanceMaterial);
    valance.position.z = depth + bevel - .0035;
    body.add(valance);

    // The lid: hinged along the back, lined inside.
    const back = Math.min(...shell.points.map(p => p.x));
    const frontmost = shell.points.reduce((best, p) => (p.x > best.x ? p : best));
    const front = frontmost.x;
    const seam = depth + bevel;
    const hinge = new Object3D();
    hinge.position.set(back, 0, seam);
    body.add(hinge);
    const lidMesh = new Mesh(new ExtrudeGeometry(new Shape(shell.points), {
      depth: H_LID - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * .6, bevelOffset: -bevel * .6, bevelSegments: 4, curveSegments: 1,
    }), shellMaterial);
    lidMesh.position.set(-back, 0, bevel + .0035);
    lidMesh.castShadow = lidMesh.receiveShadow = true;
    hinge.add(lidMesh);
    const linerGeometry = new ShapeGeometry(new Shape(liner.points));
    spanUV(linerGeometry);
    const lidLining = new Mesh(linerGeometry, velvet(floorShade(liner.points)));
    lidLining.position.set(-back, 0, .0034);
    lidLining.scale.z = -1; // faces down, into the case
    lidLining.receiveShadow = true;
    hinge.add(lidLining);

    // Three latches on the front, on the bottom half, at the body, the waist and the neck. Each swings
    // out on its lower edge when undone.
    const latches: Object3D[] = [];
    const latchMeshes: Mesh[] = [];
    for (const share of [.2, .48, .78]) {
      const i = Math.round(shell.first + (shell.last - shell.first) * share);
      const pivot = new Object3D();
      pivot.position.set(shell.right[i]! + .006, shell.y(i), seam - .04);
      const at = new Mesh(latchShape, latchMaterial);
      at.position.z = .024;
      at.castShadow = true;
      pivot.add(at);
      body.add(pivot);
      latches.push(pivot);
      latchMeshes.push(at);
    }

    // The instrument, in its cavity, as modelled; lifting, it rises and turns its face to you.
    const holder = new Object3D();
    holder.add(model);
    body.add(holder);
    const rest = new Vector3(0, 0, FLOOR + .002 - zmin);
    holder.position.copy(rest);

    // The widest stretch of the lining, where the body lies: words can be set there.
    const widths = liner.right.map((r, i) => (Number.isFinite(r) ? r - liner.left[i]! : 0));
    let widest = 0;
    widths.forEach((w, i) => { if (w > widths[widest]!) widest = i; });
    const span = Math.round(.22 / STEP);
    const liningBox = {
      back: back + .03, front: front - .03,
      from: liner.y(Math.max(liner.first, widest - span)), to: liner.y(Math.min(liner.last, widest + span)),
    };

    const toYou = new Vector3();
    const faceYou = new Quaternion();
    const centre = new Vector3(); // the case's middle, in the world, at rest: what it turns about
    const axis = new Vector3(); // its length, in the world
    const placement: Placement = { along: 0, up: 0, flip: 0, yaw: 0, visible: true };
    let state = { lid: 0, lift: 0, latch: 0 };
    const q = new Quaternion(), qy = new Quaternion();

    function apply() {
      root.visible = placement.visible;
      q.setFromAxisAngle(axis, -placement.flip);
      qy.setFromAxisAngle(new Vector3(0, 1, 0), placement.yaw);
      root.quaternion.copy(qy).multiply(q);
      root.position.copy(centre).addScaledVector(axis, placement.along);
      root.position.y += placement.up;
      hinge.rotation.set(0, -state.lid * LID_OPEN, 0);
      const swing = MathUtils.degToRad(38) * smooth(Math.min(1, Math.max(0, state.latch)));
      for (const latch of latches) latch.rotation.set(0, swing, 0);
      const e = smooth(Math.min(1, Math.max(0, state.lift)));
      holder.position.copy(rest).addScaledVector(new Vector3(0, 0, 1), lifted * e).addScaledVector(toYou, .05 * e);
      holder.quaternion.identity().slerp(faceYou, .5 * e);
      root.updateMatrixWorld(true);
    }
    resizers.push(() => {
      const basis = portraitNow ? portraitBasis : landscape;
      const middle = new Vector3((back + front) / 2, 0, seam / 2).applyMatrix4(basis);
      centre.copy(middle);
      axis.set(0, 1, 0).applyMatrix4(new Matrix4().extractRotation(basis)).normalize();
      caseFrame.matrixAutoUpdate = false;
      caseFrame.matrix.copy(new Matrix4().makeTranslation(-middle.x, -middle.y, -middle.z).multiply(basis));
      root.quaternion.identity();
      root.position.copy(centre);
      root.updateMatrixWorld(true);
      const inverse = caseFrame.matrixWorld.clone().invert();
      const look = camera.position.clone().applyMatrix4(inverse).normalize();
      toYou.set(look.x, look.y, 0).normalize();
      faceYou.setFromUnitVectors(new Vector3(0, 0, 1), look);
      apply();
    });

    const lidPoint = (x: number, y: number, z: number, lid: number) => {
      const angle = -lid * LID_OPEN;
      const dx = x - back, dz = z;
      return new Vector3(back + dx * Math.cos(angle) + dz * Math.sin(angle), y, seam - dx * Math.sin(angle) + dz * Math.cos(angle));
    };

    return {
      set(lid, lift, latch) {
        state = { lid, lift, latch };
        apply();
      },
      place(next) {
        Object.assign(placement, next);
        apply();
      },
      edge(lid) {
        return toScreen(lidPoint(front, frontmost.y, H_LID, lid), caseFrame);
      },
      onLining(points, lid) {
        const screen = points.map(([x, y]) => toScreen(lidPoint(x, y, 0, lid), caseFrame));
        // The lining faces the camera when the lid has swung past where its inside looks at it.
        const normal = new Vector3(0, 0, -1).applyAxisAngle(new Vector3(0, 1, 0), -lid * LID_OPEN).transformDirection(caseFrame.matrixWorld);
        const centreOnLid = lidPoint((liningBox.back + liningBox.front) / 2, (liningBox.from + liningBox.to) / 2, 0, lid).applyMatrix4(caseFrame.matrixWorld);
        const facing = normal.dot(camera.position.clone().sub(centreOnLid).normalize()) > .2;
        return { screen, facing };
      },
      liningBox,
      onLid(x, y) {
        if (!root.visible) return false;
        ndc.set(x / size.x * 2 - 1, 1 - y / size.y * 2);
        raycaster.setFromCamera(ndc, camera);
        return raycaster.intersectObjects([lidMesh, lidLining, base, ...latchMeshes], false).length > 0;
      },
    };
  }

  const kits: Kit[] = [];
  for (const options of list) kits.push(await kit(options));
  // Every material's shader made now, while the page waits, not in the first frame it is drawn.
  renderer.compile(scene, camera);

  return {
    kits,
    resize(width, height, ratio, portrait) {
      size = new Vector2(width, height);
      portraitNow = portrait;
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      const aspect = width / height;
      camera.aspect = aspect;
      // Seen from in front and above; the case fills the width (on a phone, the height), with room above
      // it for the open lid and the words.
      const elevation = MathUtils.degToRad(portrait ? 64 : 47);
      camera.fov = portrait ? 34 : 24;
      const half = MathUtils.degToRad(camera.fov / 2);
      const across = 2 * Math.atan(Math.tan(half) * aspect);
      const distance = portrait
        ? Math.max(1.08 / Math.tan(half), .36 / Math.tan(across / 2))
        : Math.max(.64 / Math.tan(across / 2), .56 / Math.tan(half));
      const target = portrait ? new Vector3(0, .04, -.34) : new Vector3(0, .085, -.07);
      camera.position.set(0, Math.sin(elevation) * distance, Math.cos(elevation) * distance).add(target);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      lifted = portrait ? .22 : .2;
      for (const resize of resizers) resize();
    },
    render() {
      renderer.render(scene, camera);
    },
    dispose() {
      environment.dispose();
      tolex.dispose();
      poolTexture.dispose();
      fibre.dispose();
      scene.traverse(node => {
        if (!(node instanceof Mesh)) return;
        node.geometry.dispose();
        for (const material of [node.material].flat()) {
          (material as MeshPhysicalMaterial).map?.dispose();
          material.dispose();
        }
      });
      renderer.dispose();
    },
  };
}
