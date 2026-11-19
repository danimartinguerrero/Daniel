/**
 * Music, way c2: the controller and the loop, drawn. One WebGL canvas over the stage: the MPK Mini (a
 * model by cooper, CC BY 4.0, see public/music/c2/README.md) lying on the floor the records lie on,
 * seen by the same camera, and round it the loop as a disc of light that turns under a needle.
 *
 * The model comes as one mesh. Here it is taken apart into the pieces it is made of (pads, keys,
 * knobs), so that each can move as the real ones do: a pad goes down and lights, a key dips at its
 * front, a knob turns. Which of them moves, and how far, is read from where the loop is (pattern.ts),
 * and that from the scroll (shot.ts): this file keeps no time of its own.
 *
 * The one thing with a life of its own is the controller in a hand. Pressed, it comes up off the floor
 * and turns with the pointer, 1:1; let go, it carries on at the speed it had, comes round to face you
 * and is set down again (springs from the page's own physics, so it can be caught again mid-turn).
 *
 * A frame is drawn when the scroll moves or while a spring is still moving, and never otherwise.
 * three is loaded with this module, which the page asks for only once the camera has left the shelf.
 */
import {
  ACESFilmicToneMapping, AdditiveBlending, Box3, BufferAttribute, BufferGeometry, CanvasTexture, Color, DataTexture,
  DirectionalLight, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, NearestFilter, PerspectiveCamera, PlaneGeometry,
  PCFSoftShadowMap, PMREMGenerator, Raycaster, RedFormat, Scene, ShaderMaterial, ShadowMaterial, SRGBColorSpace, TextureLoader, Vector2, Vector3, Vector4,
  WebGLRenderer,
} from 'three';
import type { Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Spring, VelocityTracker, clamp, project } from '@/components/music/v4/physics';
import { DRUMS, NOTES, STEPS, key as keyAt, knob as knobAt, pad as padAt } from './pattern';
import { half, shot } from './shot';
import type { Room, Shot } from './shot';

const ASSETS = '/music/c2';
const RED = 0xff2414; // the pads' light
/* The loop's disc, in half-widths of the controller: the three drum parts, then the keys' band. */
const BEAT_R = 1.165; // a tick for every beat, inside the drums
const DRUM_R = [1.26, 1.375, 1.49];
const KEYS_R: [number, number] = [1.63, 1.9];
const RIM_R = 2.02; // the platter's dots, at its edge
const DISC_R = 2.2;

export interface Film {
  /** Draw the film where the scroll is: `s` screens past the collection's last passage. */
  frame(s: number, room: Room): void;
  /** Whether the pointer is over the controller (for the cursor). */
  dispose(): void;
}

export async function makeFilm(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<Film> {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  // Soft light from all round, as a room gives, and one lamp above and in front: the page's own lamp.
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;
  pmrem.dispose();
  const lamp = new DirectionalLight(0xfff1e2, 2.6);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.radius = 5;
  lamp.shadow.bias = -0.0006;
  const rim = new DirectionalLight(0xcfe0ff, 0.9);
  scene.add(lamp, lamp.target, rim);

  const camera = new PerspectiveCamera(30, 1, 10, 20000);

  /* ---------------------------------------------------------------- the model, taken apart */
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const textures = new TextureLoader();
  const picture = async (name: string, colour = false) => {
    const t = await textures.loadAsync(`${ASSETS}/${name}`);
    t.flipY = false; // as glTF has them
    if (colour) t.colorSpace = SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  };
  const [gltf, map, normalMap, roughMap] = await Promise.all([
    loader.loadAsync(`${ASSETS}/mpk-mini.glb`),
    picture('mpk-colour.webp', true), picture('mpk-normal.webp'), picture('mpk-rough.webp'),
  ]);
  if (signal.aborted) {
    renderer.dispose();
    throw new DOMException('left the page', 'AbortError');
  }
  let whole: Mesh | undefined;
  gltf.scene.traverse((o) => { if ((o as Mesh).isMesh) whole = o as Mesh; });
  if (!whole) throw new Error('the model has no mesh');

  const skin = new MeshStandardMaterial({ map, normalMap, roughnessMap: roughMap, metalnessMap: roughMap, roughness: 1, metalness: 1 });
  const rig = takeApart(whole.geometry, skin);
  rig.group.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh && !(mesh.material as MeshBasicMaterial).isMeshBasicMaterial) mesh.castShadow = mesh.receiveShadow = true;
  });

  // The controller: `hand` is where a hand has it (lifted, turned), `unit` makes it the ring's size.
  const hand = new Group();
  const unit = new Group();
  unit.add(rig.group);
  hand.add(unit);
  scene.add(hand);

  /* ---------------------------------------------------------------- the floor: its shadow, the loop */
  const floor = new Group();
  scene.add(floor);
  const shadow = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: shadowPicture(), transparent: true, depthWrite: false, color: 0x000000 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 1;
  shadow.position.y = 0.2;
  floor.add(shadow);

  // What the lamp's shadow falls on: the floor, which is otherwise only the page's black.
  const ground = new Mesh(new PlaneGeometry(1, 1), new ShadowMaterial({ opacity: 0.55 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.renderOrder = 0;
  floor.add(ground);

  // The lamp's light on the floor, as under the ring of records: faint, and gone well before its edge.
  // It is what the controller's shadow is seen against.
  const pool = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uLevel: { value: 0 } },
    vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uLevel; varying vec2 vP;
      void main() {
        float t = 1.0 - clamp(length(vP), 0.0, 1.0);
        gl_FragColor = vec4(1.0, 0.941, 0.878, uLevel * t * t * (3.0 - 2.0 * t));
        #include <colorspace_fragment>
      }`,
  }));
  pool.rotation.x = -Math.PI / 2;
  pool.renderOrder = -1;
  floor.add(pool);

  const disc = new Mesh(new PlaneGeometry(DISC_R * 2, DISC_R * 2), discMaterial());
  disc.rotation.x = -Math.PI / 2;
  disc.renderOrder = 2;
  floor.add(disc);

  /* ---------------------------------------------------------------- in a hand */
  const yaw = new Spring(0, { response: 0.55, damping: 0.82 }, 0.0004);
  const pitch = new Spring(0, { response: 0.45, damping: 0.9 }, 0.0004);
  const lift = new Spring(0, { response: 0.38, damping: 1 }, 0.0005);
  const speedX = new VelocityTracker();
  let held: { id: number; x: number; y: number; yaw: number; pitch: number } | null = null;
  const ray = new Raycaster();
  const box = new Box3(new Vector3(-1.02, 0, -0.56), new Vector3(1.02, 0.3, 0.56));
  const hit = new Vector3();
  /** Whether a point of the stage is on the controller. */
  function over(x: number, y: number) {
    if (!last || last.shot.land < 1 || last.shot.records > 0) return false;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
    // Into the controller's own space, where it is a box.
    unit.updateWorldMatrix(true, false);
    const inv = unit.matrixWorld.clone().invert();
    ray.ray.applyMatrix4(inv);
    return !!ray.ray.intersectBox(box, hit);
  }
  // A turn of the hand across the controller's width is half a turn of it.
  const perPx = () => (last ? Math.PI / (2 * half(last.room) * last.shot.zoom) : 0.005);

  canvas.addEventListener('pointerdown', (e) => {
    if (held || (e.pointerType === 'mouse' && e.button !== 0) || !over(e.clientX, e.clientY)) return;
    held = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: yaw.value, pitch: pitch.value };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-held');
    speedX.reset(e.clientX, e.timeStamp);
    yaw.set(yaw.value); // caught where it is, mid-turn or not
    pitch.set(pitch.value);
    lift.to(1, { response: 0.3, damping: 1 });
    run();
  }, { signal });
  canvas.addEventListener('pointermove', (e) => {
    if (!held) {
      if (e.pointerType === 'mouse') canvas.classList.toggle('is-over', over(e.clientX, e.clientY));
      return;
    }
    if (e.pointerId !== held.id) return;
    speedX.push(e.clientX, e.timeStamp);
    yaw.set(held.yaw + (e.clientX - held.x) * perPx());
    // Towards you and away, a little: with a mouse, which doesn't scroll the page by moving.
    if (e.pointerType === 'mouse') pitch.set(clamp(held.pitch + (e.clientY - held.y) * perPx() * 0.6, -0.6, 0.9));
    run();
  }, { signal });
  const letGo = (e: PointerEvent) => {
    if (!held || e.pointerId !== held.id) return;
    held = null;
    canvas.classList.remove('is-held');
    // It carries on at the hand's speed and comes to rest facing you: whichever full turn the throw
    // would have reached.
    const v = e.type === 'pointercancel' ? 0 : speedX.velocity(e.timeStamp, 60) * perPx();
    const turn = Math.PI * 2;
    yaw.to(Math.round((yaw.value + project(v, 0.997)) / turn) * turn, { velocity: v, response: 0.62, damping: 0.86 });
    pitch.to(0, { response: 0.5, damping: 0.85 });
    lift.to(0, { response: 0.5, damping: 1 });
    run();
  };
  canvas.addEventListener('pointerup', letGo, { signal });
  canvas.addEventListener('pointercancel', letGo, { signal });

  /* ---------------------------------------------------------------- a frame */
  let last: { s: number; room: Room; shot: Shot } | null = null;
  let size = '';
  const target = new Vector3();

  function draw() {
    if (!last) return;
    const { room, shot: at } = last;
    const u = half(room);

    // The canvas is the stage, at the screen's own pixels (two to a px at most).
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const now = `${room.W}x${room.H}@${dpr}`;
    if (now !== size) {
      size = now;
      renderer.setPixelRatio(dpr);
      renderer.setSize(room.W, room.H, false);
    }

    // The camera the records are drawn with (climb.ts tells the carousel the same numbers): it looks at
    // the middle of the floor from `far` away, `tilt` degrees down, and draws a px of floor there as
    // `zoom` px. Where on the stage that point is drawn is set by shifting the picture, not the camera.
    const a = (at.tilt * Math.PI) / 180;
    target.set(0, 0, 0);
    camera.position.set(0, Math.sin(a) * at.far, Math.cos(a) * at.far);
    camera.lookAt(target);
    camera.fov = (2 * Math.atan(room.H / (2 * at.far)) * 180) / Math.PI;
    camera.zoom = at.zoom;
    camera.aspect = room.W / room.H;
    camera.near = Math.max(1, at.far * 0.05);
    camera.far = at.far * 6;
    camera.setViewOffset(room.W, room.H, 0, room.H / 2 - at.cy, room.W, room.H);
    camera.updateProjectionMatrix();
    // The lamp, above and a little in front and to the left; its shadow is worked out for the
    // controller's own reach and no further.
    lamp.position.set(-1.1 * u, 5 * u, 2 * u);
    rim.position.set(1.4 * u, 0.9 * u, -1.8 * u);
    const cast = lamp.shadow.camera;
    if (cast.right !== 2.4 * u) {
      cast.left = cast.bottom = -2.4 * u;
      cast.right = cast.top = 2.4 * u;
      cast.near = u;
      cast.far = 9 * u;
      cast.updateProjectionMatrix();
      lamp.shadow.normalBias = 0.004 * u;
    }
    ground.scale.set(6 * u, 6 * u, 1);
    ground.position.y = 0.1;
    pool.scale.set(3.6 * u, 3.6 * u, 1);
    (pool.material as ShaderMaterial).uniforms.uLevel!.value = 0.1 * (1 - at.records);

    // Set down: it comes from above and behind the picture, a little askew, and straightens as it lands.
    const up = 1 - at.land;
    const inHand = lift.value;
    unit.scale.setScalar(u);
    hand.position.set(0, (up * 2.4 + inHand * 0.16) * u, -up * 0.5 * u);
    // The platter the loop lies on carries it round with the loop: once, the way a record turns.
    const platter = (-at.turn / STEPS) * Math.PI * 2;
    hand.rotation.set(up * 0.16 + pitch.value, up * -0.3 + platter + yaw.value, up * -0.1, 'XYZ');

    // Its shadow on the floor: wide and faint under it in the air, tight and dark once it lies there.
    const off = up + inHand * 0.12;
    shadow.scale.set((2.5 + off * 2.2) * u, (1.55 + off * 2.2) * u, 1);
    shadow.rotation.z = hand.rotation.y;
    (shadow.material as MeshBasicMaterial).opacity = at.fade * (0.6 - 0.4 * Math.min(1, off));

    // The loop: the disc under the needle, and the pieces its steps move.
    const turned = at.turn;
    disc.scale.set(u, u, 1);
    disc.position.y = 0.3;
    const du = (disc.material as ShaderMaterial).uniforms;
    du.uTurn!.value = turned;
    du.uShow!.value = at.disc;
    disc.visible = at.disc > 0;

    rig.pads.forEach((pad, i) => {
      const { down, light } = padAt(i, turned);
      pad.mesh.position.y = pad.y - down * 0.013;
      pad.skin.emissiveIntensity = light * 1.5;
      pad.glow.position.y = pad.mesh.position.y + pad.top + 0.004;
      (pad.glow.material as MeshBasicMaterial).opacity = light;
      pad.glow.visible = light > 0.004;
    });
    rig.keys.forEach((k, i) => { k.mesh.rotation.x = keyAt(i, turned) * k.dip; });
    rig.knobs.forEach((k, i) => { k.rotation.y = -knobAt(i, turned); });

    renderer.render(scene, camera);
  }

  /* While a spring is moving, frames follow one another; then they stop. */
  let frame = 0;
  let before = 0;
  function tick(time: number) {
    frame = 0;
    const dt = Math.min(0.05, before ? (time - before) / 1000 : 1 / 60);
    before = time;
    const still = [yaw.step(dt), pitch.step(dt), lift.step(dt)].every(Boolean);
    draw();
    if (!still || held) frame = requestAnimationFrame(tick);
    else before = 0;
  }
  function run() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  signal.addEventListener('abort', dispose);
  function dispose() {
    cancelAnimationFrame(frame);
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const m of [mesh.material].flat()) {
        for (const value of Object.values(m)) (value as Texture | null)?.isTexture && (value as Texture).dispose();
        m.dispose();
      }
    });
    scene.environment?.dispose();
    renderer.dispose();
  }

  return {
    frame(s, room) {
      last = { s, room, shot: shot(s, room) };
      // In the middle of a turn the spring's own frames draw it.
      if (!frame) draw();
    },
    dispose,
  };
}

/* ------------------------------------------------------------------ the model's pieces */
interface Rig {
  group: Group;
  /** The eight pads, 1–4 then 5–8 as printed: the near row first, left to right. */
  pads: { mesh: Mesh; skin: MeshStandardMaterial; glow: Mesh; y: number; top: number }[];
  /** The 25 keys, lowest first. `dip` is how far a key held down is turned at its hinge. */
  keys: { mesh: Mesh; dip: number }[];
  /** The eight knobs, the far row first, left to right. */
  knobs: Group[];
}

/**
 * The model's one mesh as its separate pieces. Pieces that share no corner are different parts, and
 * which part each is can be told from its size and where it is. The model lies x across, y away from
 * the player and z up, in half-widths; here it is turned to lie on the floor (y up, z towards you).
 */
function takeApart(source: BufferGeometry, skin: MeshStandardMaterial): Rig {
  const P = source.getAttribute('position');
  const N = source.getAttribute('normal');
  const T = source.getAttribute('tangent');
  const UV = source.getAttribute('uv');
  const index = source.getIndex()!;
  const count = P.count;
  const BASE = 0.1445; // the model's underside below its middle: it stands on the floor

  // Corners at the same place are one corner, whatever their normals; triangles sharing one are one piece.
  const first = new Map<string, number>();
  const same = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const k = `${P.getX(i)},${P.getY(i)},${P.getZ(i)}`;
    if (!first.has(k)) first.set(k, i);
    same[i] = first.get(k)!;
  }
  const parent = Int32Array.from({ length: count }, (_, i) => i);
  const find = (a: number) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]!]!; return a; };
  for (let t = 0; t < index.count; t += 3) {
    const a = find(same[index.getX(t)]!), b = find(same[index.getX(t + 1)]!), c = find(same[index.getX(t + 2)]!);
    parent[a] = c;
    parent[b] = c;
  }
  const pieces = new Map<number, number[]>(); // a piece's triangles' corners
  for (let t = 0; t < index.count; t += 3) {
    const root = find(same[index.getX(t)]!);
    let list = pieces.get(root);
    if (!list) pieces.set(root, (list = []));
    list.push(index.getX(t), index.getX(t + 1), index.getX(t + 2));
  }

  /** A piece as a mesh of its own, placed so that `pivot` (in the rig's space) is its origin. */
  const make = (corners: number[], pivot: Vector3, material: MeshStandardMaterial) => {
    const to = new Map<number, number>();
    const pos: number[] = [], nor: number[] = [], tan: number[] = [], uv: number[] = [], idx: number[] = [];
    for (const i of corners) {
      let j = to.get(i);
      if (j === undefined) {
        to.set(i, (j = to.size));
        pos.push(P.getX(i) - pivot.x, P.getZ(i) + BASE - pivot.y, -P.getY(i) - pivot.z);
        nor.push(N.getX(i), N.getZ(i), -N.getY(i));
        tan.push(T.getX(i), T.getZ(i), -T.getY(i), T.getW(i));
        uv.push(UV.getX(i), UV.getY(i));
      }
      idx.push(j);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
    g.setAttribute('tangent', new BufferAttribute(new Float32Array(tan), 4));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(idx);
    const mesh = new Mesh(g, material);
    mesh.position.copy(pivot);
    return mesh;
  };

  const group = new Group();
  const pads: (Rig['pads'][number] & { x: number; z: number })[] = [];
  const keys: (Rig['keys'][number] & { x: number })[] = [];
  const knobs: { group: Group; x: number; z: number }[] = [];
  const marks: { corners: number[]; x: number; z: number }[] = [];
  const glowPicture = glow();

  for (const corners of pieces.values()) {
    // The piece's box, in the rig's space.
    const lo = new Vector3(Infinity, Infinity, Infinity), hi = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const i of corners) {
      const v = new Vector3(P.getX(i), P.getZ(i) + BASE, -P.getY(i));
      lo.min(v);
      hi.max(v);
    }
    const tris = corners.length / 3;
    const wide = hi.x - lo.x, deep = hi.z - lo.z;
    const mid = lo.clone().add(hi).multiplyScalar(0.5);

    if (tris < 30 && wide > 0.15 && wide < 0.2 && deep > 0.15) {
      // A pad: its own copy of the skin, so that its light is its own.
      const material = skin.clone();
      material.emissive = new Color(RED);
      material.emissiveIntensity = 0;
      const mesh = make(corners, new Vector3(mid.x, 0, mid.z), material);
      const sprite = new Mesh(new PlaneGeometry(wide * 2.1, deep * 2.1), new MeshBasicMaterial({
        map: glowPicture, color: RED, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false,
      }));
      sprite.rotation.x = -Math.PI / 2;
      sprite.position.set(mid.x, hi.y, mid.z);
      sprite.renderOrder = 3;
      group.add(mesh, sprite);
      pads.push({ mesh, skin: material, glow: sprite, y: 0, top: hi.y, x: mid.x, z: mid.z });
    } else if (lo.z > 0 && deep > 0.28 && wide < 0.13) {
      // A key, white or black: hinged at its far end.
      const mesh = make(corners, new Vector3(mid.x, mid.y, lo.z), skin);
      group.add(mesh);
      keys.push({ mesh, dip: deep > 0.4 ? 0.07 : 0.085, x: mid.x });
    } else if (tris > 150 && tris < 250 && wide < 0.1) {
      // A knob: it turns about its own middle.
      const g = new Group();
      g.position.set(mid.x, 0, mid.z);
      g.add(make(corners, g.position.clone(), skin).translateX(-mid.x).translateZ(-mid.z));
      group.add(g);
      knobs.push({ group: g, x: mid.x, z: mid.z });
    } else if (tris < 40 && wide < 0.02) {
      marks.push({ corners, x: mid.x, z: mid.z }); // the line on a knob's cap
    } else {
      group.add(make(corners, new Vector3(), skin)); // the case, the stick, the buttons
    }
  }
  // Each line goes with the knob it is on.
  for (const mark of marks) {
    const k = knobs.reduce((best, knob) => (Math.hypot(knob.x - mark.x, knob.z - mark.z) < Math.hypot(best.x - mark.x, best.z - mark.z) ? knob : best));
    k.group.add(make(mark.corners, k.group.position.clone(), skin).translateX(-k.x).translateZ(-k.z));
  }

  const row = (a: { x: number; z: number }, b: { x: number; z: number }, nearFirst: boolean) =>
    Math.abs(a.z - b.z) > 0.05 ? (nearFirst ? b.z - a.z : a.z - b.z) : a.x - b.x;
  pads.sort((a, b) => row(a, b, true));
  knobs.sort((a, b) => row(a, b, false));
  keys.sort((a, b) => a.x - b.x);
  return { group, pads, keys, knobs: knobs.map((k) => k.group) };
}

/* ------------------------------------------------------------------ pictures made here */
/** A soft round light, for the glow over a lit pad. */
function glow() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const ramp = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  ramp.addColorStop(0, 'rgba(255,255,255,0.9)');
  ramp.addColorStop(0.35, 'rgba(255,255,255,0.42)');
  ramp.addColorStop(0.7, 'rgba(255,255,255,0.1)');
  ramp.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = ramp;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

/** The controller's shadow on the floor: its footprint, soft at the edge. */
function shadowPicture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.filter = 'blur(14px)';
  g.fillStyle = '#fff';
  g.beginPath();
  g.roundRect(46, 42, 164, 76, 10);
  g.fill();
  return new CanvasTexture(c);
}

/**
 * The loop on the floor. A disc in the controller's half-widths: three rings of steps for the drums and
 * a band for the keys' notes, lying round the controller, turning under a needle that stays at the
 * front. What is near the needle is lit; round the back it is in the dark. A step that has just been
 * played is hot, and cools as it moves away.
 */
function discMaterial() {
  const data = new Uint8Array(STEPS * 4);
  DRUMS.forEach((drum, t) => drum.steps.forEach((on, s) => { data[t * STEPS + s] = on ? 255 : 0; }));
  const steps = new DataTexture(data, STEPS, 4, RedFormat);
  steps.magFilter = steps.minFilter = NearestFilter;
  steps.needsUpdate = true;
  const notes = NOTES.map((n) => new Vector4(n.from, n.len, KEYS_R[0] + (n.key / 24) * (KEYS_R[1] - KEYS_R[0]), 0));

  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uTurn: { value: 0 },
      uShow: { value: 0 },
      uSteps: { value: steps },
      uNotes: { value: notes },
      uDrums: { value: new Vector3(...DRUM_R) },
      uKeys: { value: new Vector2(...KEYS_R) },
      uMarks: { value: new Vector2(BEAT_R, RIM_R) },
      uHot: { value: new Color(RED) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        vP = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      const float STEPS = ${STEPS}.0;
      const float TAU = 6.28318530718;
      uniform float uTurn;
      uniform float uShow;
      uniform sampler2D uSteps;
      uniform vec4 uNotes[${NOTES.length}];
      uniform vec3 uDrums;
      uniform vec2 uKeys;
      uniform vec2 uMarks; // the beats' ticks, the rim's dots
      uniform vec3 uHot;
      varying vec2 vP;

      float box(vec2 p, vec2 b, float r) {
        vec2 q = abs(p) - b + r;
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
      }
      // How hot a step is: lit as the needle reaches it, cooling over the next step and a half.
      float heat(float x) {
        return x < 0.08 ? x / 0.08 : exp(-(x - 0.08) * 2.4) * (1.0 - smoothstep(1.4, 2.0, x));
      }

      void main() {
        float r = length(vP);
        float th = atan(vP.x, -vP.y);               // round the disc from the front, where the needle is
        float px = max(fwidth(vP.x), fwidth(vP.y)); // a screen px, in the disc's units
        float along = th / TAU * STEPS + uTurn;     // which step of the loop lies here
        float c = mod(along, STEPS);
        float idx = floor(c);
        float f = c - idx - 0.5;
        // Steps since the needle reached this one; a step it has not reached yet has not been played.
        float played = mod(uTurn - idx, STEPS);
        float going = step(0.0001, uTurn) * (1.0 - step(STEPS, uTurn));
        float started = going * step(idx, uTurn);
        const vec3 WHITE = vec3(0.96, 0.96, 0.97);

        vec3 col = vec3(0.0);
        float alpha = 0.0;

        // The drums: a step is a small bar of light along its ring; a trace if empty, lit if played on.
        for (int t = 0; t < 3; t++) {
          float rt = t == 0 ? uDrums.x : t == 1 ? uDrums.y : uDrums.z;
          float arc = TAU * rt / STEPS;
          float on = texture2D(uSteps, vec2((idx + 0.5) / STEPS, (float(t) + 0.5) / 4.0)).r;
          float d = box(vec2(f * arc, r - rt), vec2(arc * 0.5 - 0.03, mix(0.017, 0.026, on)), 0.026);
          float cover = 1.0 - smoothstep(-px, px, d);
          float hot = on * heat(played) * started;
          float level = mix(0.1, 0.86, on);
          col += cover * mix(WHITE, uHot * 1.3, hot) * (level + hot * 0.5);
          alpha += cover * (level + hot * 0.14);
          // And the light a lit step throws on the floor round itself: more of it while it is hot.
          // And the light a hot step throws on the floor round itself (none of it reaches its neighbours).
          float halo = exp(-max(d, 0.0) * 26.0) * hot * 0.6 * (1.0 - cover) * (1.0 - smoothstep(0.3, 0.5, abs(f)));
          col += uHot * halo;
          alpha += halo;
        }

        // The keys: each note a line as long as it is held, further out the higher it is.
        for (int i = 0; i < ${NOTES.length}; i++) {
          vec4 n = uNotes[i];
          float arc = TAU * n.z / STEPS;
          float x = mod(along - n.x, STEPS);        // 0..len inside the note
          float d = box(vec2((x - n.y * 0.5) * arc, r - n.z), vec2(n.y * 0.5 * arc - 0.02, 0.0105), 0.0105);
          float cover = 1.0 - smoothstep(-px, px, d);
          float since = mod(uTurn - n.x, STEPS);
          float held = going * step(n.x, uTurn) * step(since, n.y);
          float level = 0.46 + 0.54 * held;
          col += cover * WHITE * level;
          alpha += cover * level;
        }

        // The platter's own marks: a tick for every beat inside the drums (longer where a bar starts),
        // and a row of dots round its edge.
        float beat = abs(fract(along / 4.0 + 0.5) - 0.5) * 4.0; // steps to the nearest beat's line
        float bar = 1.0 - step(0.5, abs(fract(along / 16.0 + 0.5) - 0.5) * 16.0);
        float tick = 1.0 - smoothstep(-px, px, box(vec2(beat * TAU * r / STEPS, r - uMarks.x + bar * 0.012), vec2(0.0045, 0.014 + bar * 0.012), 0.0045));
        col += tick * WHITE * 0.34;
        alpha += tick * 0.34;
        float dotAt = fract(along * 3.0) - 0.5;
        float rimDot = 1.0 - smoothstep(-px, px, length(vec2(dotAt * TAU * uMarks.y / (STEPS * 3.0), r - uMarks.y)) - 0.0075);
        col += rimDot * WHITE * 0.3;
        alpha += rimDot * 0.3;

        // What is near the needle is in its light; the far side of the disc is in the dark.
        float lit = 0.06 + 0.94 * exp(-pow(th / 1.0, 2.0));
        // The disc is drawn round from the needle, both ways.
        float shown = 1.0 - smoothstep(uShow * 3.4 - 0.6, uShow * 3.4, abs(th));
        col *= lit * shown;
        alpha *= lit * shown;

        // The needle: a line of light across the rings at the front.
        float inRings = smoothstep(uMarks.x - 0.07, uMarks.x - 0.03, r) * (1.0 - smoothstep(uMarks.y + 0.03, uMarks.y + 0.07, r)) * step(0.0, -vP.y);
        float line = (1.0 - smoothstep(0.0035 - px, 0.0035 + px, abs(vP.x))) * inRings;
        float aura = exp(-abs(vP.x) * 30.0) * 0.14 * inRings;
        float needle = (line * 0.95 + aura) * smoothstep(0.0, 0.3, uShow);
        col += vec3(1.0, 0.97, 0.94) * needle;
        alpha += needle;

        alpha = clamp(alpha, 0.0, 1.0);
        gl_FragColor = vec4(col / max(alpha, 0.0001), alpha);
        #include <colorspace_fragment>
      }`,
  });
}
