/**
 * Way c1: the wall behind the shelf, drawn with three.js. A graphite wall under one lamp, and on it a
 * guitar and a bass, each hanging by its neck from a hanger. The camera's place comes from the scroll
 * (wall.ts passes where the film is); nothing here plays on its own.
 *
 * The two instruments are pendulums: they hang from where the hanger holds them, and whatever moves
 * them (a hand, or the hanger letting go on one side) leaves them to swing and settle by themselves.
 * A frame is drawn only when the camera has moved or something is still swinging.
 *
 * The models are other people's work (public/music/c1/README.md); this file hangs and lights them.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface WallScene {
  /** Draws the wall for a place in the film: `along` counts the lines said (0 to 4), `look` is how far
      the camera has lifted its eyes to the wall (0 to 1). */
  set(along: number, look: number): void;
  resize(): void;
  /** Whether an instrument is under this point of the canvas (px from its top left). */
  over(x: number, y: number): boolean;
  /** Takes hold of the instrument under the point, if there is one. */
  grab(x: number, y: number, time: number): boolean;
  drag(x: number, y: number, time: number): void;
  release(): void;
  dispose(): void;
}

interface Spec {
  url: string;
  /** Its real length, in metres. */
  length: number;
  /** How far under its top the hanger holds it. */
  hook: number;
  x: number;
  /** The neck's width where it is held. */
  neck: number;
  /** Where in the film its hanger lets go on one side, and the angle it then hangs at. */
  slipAt: number;
  slip: number;
}
const HOOK_Y = 0.62;
const SPECS: readonly Spec[] = [
  { url: '/music/c1/guitar.glb', length: 1.0, hook: 0.185, x: -0.29, neck: 0.05, slipAt: 2.4, slip: -0.13 },
  { url: '/music/c1/bass.glb', length: 1.17, hook: 0.215, x: 0.3, neck: 0.048, slipAt: 2.62, slip: 0.075 },
];
/** The middle of what hangs on the wall, and its size, for framing. */
const PAIR = { y: 0.25, height: 1.2, width: 1.0 };
const FOV = 28;

/* A hung instrument swings about a turn a second and takes a few swings to settle. */
const STIFFNESS = 40;
const DAMPING = 1.7;
class Pendulum {
  angle = 0;
  velocity = 0;
  rest = 0;
  held = false;
  /** Moves it on by dt seconds; false once it hangs still. */
  step(dt: number) {
    if (this.held) return true;
    for (let left = dt; left > 0; left -= 0.008) {
      const h = Math.min(left, 0.008);
      this.velocity += (-STIFFNESS * (this.angle - this.rest) - DAMPING * this.velocity) * h;
      this.angle += this.velocity * h;
    }
    if (Math.abs(this.velocity) < 0.002 && Math.abs(this.angle - this.rest) < 0.0006) {
      this.velocity = 0;
      this.angle = this.rest;
      return false;
    }
    return true;
  }
}

const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const part = (t: number, from: number, to: number) => Math.min(1, Math.max(0, (t - from) / (to - from)));
// Past its reach a held instrument follows less and less (apple-design: soft boundaries).
const REACH = 0.62;
const band = (angle: number) => {
  const over = Math.abs(angle) - REACH;
  return over <= 0 ? angle : Math.sign(angle) * (REACH + (over * 0.5) / (1 + over * 2.2));
};

export async function createScene(canvas: HTMLCanvasElement): Promise<WallScene> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const anisotropy = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  // Something for the lacquer and the chrome to reflect: a dim room.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = room.texture;
  scene.environmentIntensity = 0.55;

  /* The wall: graphite paint, lit only by the lamp, so it is the page's black wherever the lamp
     doesn't reach. A fine grain keeps the light on it from looking like a gradient. */
  const grain = document.createElement('canvas');
  grain.width = grain.height = 256;
  const ink = grain.getContext('2d')!;
  const dots = ink.createImageData(256, 256);
  for (let i = 0; i < dots.data.length; i += 4) {
    const v = 118 + Math.random() * 20;
    dots.data[i] = dots.data[i + 1] = dots.data[i + 2] = v;
    dots.data[i + 3] = 255;
  }
  ink.putImageData(dots, 0, 0);
  const grainMap = new THREE.CanvasTexture(grain);
  grainMap.wrapS = grainMap.wrapT = THREE.RepeatWrapping;
  grainMap.repeat.set(26, 16);
  grainMap.anisotropy = anisotropy;
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x232325, roughness: 0.93, metalness: 0, bumpMap: grainMap, bumpScale: 0.35, envMapIntensity: 0 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), wallMaterial);
  wall.receiveShadow = true;
  scene.add(wall);

  /* One lamp, above and a little to the left, in the colour of the shelf's lamp. Its edge is as soft as
     a light's can be, and the canvas fades to black before the light does. */
  const lamp = new THREE.SpotLight(0xfff0e0, 360, 0, 0.285, 1, 2);
  lamp.position.set(-0.85, 2.7, 2.7);
  lamp.target.position.set(0.02, 0.22, 0);
  lamp.castShadow = true;
  lamp.shadow.mapSize.setScalar(coarse ? 1024 : 2048);
  lamp.shadow.camera.near = 1.5;
  lamp.shadow.camera.far = 7;
  lamp.shadow.bias = -0.0006;
  lamp.shadow.normalBias = 0.012;
  lamp.shadow.radius = 5;
  scene.add(lamp, lamp.target);
  // And what little comes back from the room on the other side, so the dark edges still have a shape.
  const back = new THREE.DirectionalLight(0xcfdcff, 0.28);
  back.position.set(2.4, 0.4, 2);
  scene.add(back);

  /* The instruments, each turned upright with its front to the room, at its real size, hanging from the
     point the hanger holds it at. */
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const steel = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.42, metalness: 0.85 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.95, metalness: 0 });
  const hung = await Promise.all(SPECS.map(async (spec) => {
    const model = (await loader.loadAsync(spec.url)).scene;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.position.sub(box.getCenter(new THREE.Vector3()));
    const holder = new THREE.Group();
    holder.add(model);
    const axes = [size.x, size.y, size.z];
    const long = axes.indexOf(Math.max(...axes));
    const thin = axes.indexOf(Math.min(...axes));
    const unit = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
    const up = unit[long]!;
    const front = unit[thin]!;
    holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, front), up, front).invert());
    const scale = spec.length / axes[long]!;
    holder.scale.setScalar(scale);
    const depth = axes[thin]! * scale;
    holder.position.set(0, spec.hook - spec.length / 2, depth / 2 + 0.014);
    model.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      for (const material of [mesh.material].flat() as THREE.MeshPhysicalMaterial[]) {
        // Sharp at a slant: without this the frets and the strings smear as the camera comes round.
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'] as const) {
          const map = material[key];
          if (map) map.anisotropy = anisotropy;
        }
        // Glass-like parts would need the whole scene drawn a second time to see through them.
        // Lacquer: a clear coat over the paint, so the lamp and the room show in it as on a real body.
        if (/MainBake|BodyMaterial/.test(material.name)) {
          material.clearcoat = 1;
          material.clearcoatRoughness = 0.06;
        }
        if (material.transmission) {
          material.transmission = 0;
          material.roughness = Math.min(material.roughness, 0.25);
        }
      }
    });
    const pivot = new THREE.Group();
    pivot.position.set(spec.x, HOOK_Y, 0);
    pivot.add(holder);
    scene.add(pivot);

    // The hanger: a plate on the wall, an arm, and two rubber-sleeved prongs the headstock rests on.
    const hanger = new THREE.Group();
    hanger.position.copy(pivot.position);
    const reach = Math.min(depth, 0.085) + 0.02;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.1, 0.008), steel);
    plate.position.set(0, 0.012, 0.004);
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(spec.neck + 0.034, 0.009, 0.009), steel);
    yoke.position.set(0, -0.004, 0.012);
    hanger.add(plate, yoke);
    for (const side of [-1, 1]) {
      const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.0052, 0.0052, reach, 16), rubber);
      prong.rotation.x = Math.PI / 2 - 0.1;
      prong.position.set(side * (spec.neck / 2 + 0.009), 0.002 + (reach / 2) * 0.1, 0.012 + reach / 2);
      prong.castShadow = true;
      hanger.add(prong);
    }
    scene.add(hanger);
    return { spec, pivot, pendulum: new Pendulum(), depth };
  }));

  /* ---------------------------------------------------------------- the camera's places */
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 40);
  interface Place { from: THREE.Vector3; to: THREE.Vector3 }
  const place = (fx: number, fy: number, fz: number, tx: number, ty: number, tz = 0): Place => ({ from: new THREE.Vector3(fx, fy, fz), to: new THREE.Vector3(tx, ty, tz) });
  let places: Place[] = [];
  let width = 1;
  let height = 1;
  function frame() {
    const aspect = width / height;
    const tan = Math.tan((FOV * Math.PI) / 360);
    const wide = width >= 820;
    const guitar = SPECS[0]!;
    const bass = SPECS[1]!;
    if (wide) {
      // The pair on the right of the picture, the words on its left.
      const d = Math.max((PAIR.height / 0.6) / (2 * tan), (PAIR.width / 0.36) / (2 * tan * aspect));
      const seen = 2 * tan * d * aspect; // metres across the picture
      const x = -0.17 * seen;
      places = [
        place(x, PAIR.y - 0.1, d * 1.04, x, PAIR.y),
        place(guitar.x - 1.02, 0.1, 1.72, guitar.x - 0.36, 0.14, 0.05), // the guitar, from its left
        place(bass.x + 0.42, -0.02, 1.9, bass.x - 0.52, 0.02, 0.05), // the bass, from its right
        place(x * 0.92, PAIR.y, d * 0.9, x * 0.92, PAIR.y), // both, square on
        place(x * 1.3, PAIR.y + 0.12, d * 1.42, x * 1.3, PAIR.y + 0.04), // and from further back
      ];
    } else {
      // The pair in the upper part of the picture, the words under it.
      const d = Math.max((PAIR.height / 0.56) / (2 * tan), (PAIR.width / 0.9) / (2 * tan * aspect));
      const tall = 2 * tan * d; // metres up the picture
      const y = PAIR.y - 0.1 * tall;
      places = [
        place(0, y - 0.08, d * 1.04, 0, y),
        place(guitar.x - 0.55, -0.18, 2.3, guitar.x + 0.02, -0.14, 0.05),
        place(bass.x + 0.55, -0.26, 2.4, bass.x - 0.02, -0.22, 0.05),
        place(0, y, d * 0.94, 0, y),
        place(0, y + 0.1, d * 1.3, 0, y + 0.02),
      ];
    }
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
  // The camera travels as a line comes up and has arrived by the time it is being lit.
  const MOVES: readonly (readonly [number, number])[] = [[0, 0.42], [0.76, 1.4], [1.76, 2.36], [2.78, 3.42]];
  const eye = new THREE.Vector3();
  const aim = new THREE.Vector3();
  function look(along: number, lookUp: number) {
    let i = 0;
    let f = 0;
    for (let m = 0; m < MOVES.length; m++) {
      const [from, to] = MOVES[m]!;
      if (along >= to) { i = m + 1; f = 0; } else if (along > from) { i = m; f = smoother(part(along, from, to)); break; } else break;
    }
    const a = places[i]!;
    const b = places[Math.min(i + 1, places.length - 1)]!;
    eye.lerpVectors(a.from, b.from, f);
    aim.lerpVectors(a.to, b.to, f);
    // Still coming up from the floor: the wall is seen from a little lower until the eyes are level.
    eye.y -= (1 - lookUp) * 0.5;
    camera.position.copy(eye);
    camera.lookAt(aim);
  }

  /* ---------------------------------------------------------------- frames, only when something moves */
  let along = 0;
  let lookUp = 0;
  let dirty = true;
  let raf = 0;
  let last = 0;
  let disposed = false;
  function tick(now: number) {
    raf = 0;
    if (disposed) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    let swinging = false;
    for (const item of hung) {
      const before = item.pendulum.angle;
      if (item.pendulum.step(dt)) swinging = true;
      if (item.pendulum.angle !== before) {
        item.pivot.rotation.z = item.pendulum.angle;
        renderer.shadowMap.needsUpdate = true;
        dirty = true;
      }
    }
    if (dirty && lookUp > 0) {
      look(along, lookUp);
      renderer.render(scene, camera);
      dirty = false;
    }
    if (swinging) raf = requestAnimationFrame(tick);
  }
  const wake = () => {
    if (raf || disposed) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    width = w;
    height = h;
    renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 3 : 2));
    renderer.setSize(w, h, false);
    frame();
    dirty = true;
    wake();
  }

  /* ---------------------------------------------------------------- a hand on an instrument */
  const point = new THREE.Vector3();
  const onScreen = (x: number, y: number, z: number) => {
    point.set(x, y, z).project(camera);
    return { x: ((point.x + 1) / 2) * width, y: ((1 - point.y) / 2) * height };
  };
  /** Which instrument is under the point: within its half width of the line from its hook to its foot. */
  function under(x: number, y: number) {
    for (let i = hung.length - 1; i >= 0; i--) {
      const { spec, pendulum, depth } = hung[i]!;
      const z = depth / 2;
      const hook = onScreen(spec.x, HOOK_Y, z);
      const reach = spec.length - spec.hook;
      const foot = onScreen(spec.x + Math.sin(pendulum.angle) * reach, HOOK_Y - Math.cos(pendulum.angle) * reach, z);
      const side = onScreen(spec.x + 0.19, HOOK_Y, z);
      const dx = foot.x - hook.x;
      const dy = foot.y - hook.y;
      const t = Math.min(1, Math.max(-0.12, ((x - hook.x) * dx + (y - hook.y) * dy) / (dx * dx + dy * dy)));
      if (Math.hypot(x - hook.x - dx * t, y - hook.y - dy * t) <= Math.abs(side.x - hook.x)) return i;
    }
    return -1;
  }
  let held = -1;
  let offset = 0; // between the hand and the instrument, as it was taken
  const trail: { time: number; angle: number }[] = [];
  /** The angle of the point about an instrument's hook: 0 straight under it. */
  const about = (i: number, x: number, y: number) => {
    const { spec, depth } = hung[i]!;
    const hook = onScreen(spec.x, HOOK_Y, depth / 2);
    return Math.atan2(x - hook.x, y - hook.y);
  };

  resize();
  renderer.shadowMap.needsUpdate = true;
  renderer.compile(scene, camera);

  return {
    set(nextAlong, nextLook) {
      if (nextAlong === along && nextLook === lookUp) return;
      along = nextAlong;
      lookUp = nextLook;
      // A hanger lets go on one side as "neither very well" is said, and holds again going back up.
      for (const { spec, pendulum } of hung) pendulum.rest = along >= spec.slipAt ? spec.slip : 0;
      dirty = true;
      wake();
    },
    resize,
    over: (x, y) => lookUp === 1 && under(x, y) >= 0,
    grab(x, y, time) {
      if (lookUp < 1) return false;
      const i = under(x, y);
      if (i < 0) return false;
      held = i;
      const { pendulum } = hung[i]!;
      pendulum.held = true;
      pendulum.velocity = 0;
      offset = about(i, x, y) - pendulum.angle; // it stays where it was taken (no jump to the hand)
      trail.length = 0;
      trail.push({ time, angle: pendulum.angle });
      wake();
      return true;
    },
    drag(x, y, time) {
      if (held < 0) return;
      const { pendulum, pivot } = hung[held]!;
      pendulum.angle = band(about(held, x, y) - offset);
      pivot.rotation.z = pendulum.angle;
      trail.push({ time, angle: pendulum.angle });
      while (trail.length > 2 && time - trail[0]!.time > 90) trail.shift();
      renderer.shadowMap.needsUpdate = true;
      dirty = true;
      wake();
    },
    release() {
      if (held < 0) return;
      const { pendulum } = hung[held]!;
      // It leaves the hand at the hand's speed and swings on from there.
      const first = trail[0]!;
      const end = trail[trail.length - 1]!;
      const span = (end.time - first.time) / 1000;
      pendulum.velocity = span > 0.012 ? Math.max(-9, Math.min(9, (end.angle - first.angle) / span)) : 0;
      pendulum.held = false;
      held = -1;
      wake();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        for (const material of [mesh.material].flat() as THREE.MeshStandardMaterial[]) {
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
          material.dispose();
        }
      });
      room.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
