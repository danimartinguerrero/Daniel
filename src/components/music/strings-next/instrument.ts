/* Prototype "B, further" (strings-next): ../strings/instrument.ts with two changes, to fold back into it
   if the prototype is kept: the canvas is clear where the instrument is not (so it can stand in front
   of type), and pose() takes a turn about the instrument's own long axis, for turning it by hand.

   An instrument drawn live with WebGL, as the studio renders were lit (scripts/render-instruments.py):
   the same 85 mm camera, the same five soft lights, AgX, on black, with a satin finish. Its pose is set
   from the scroll and drawn in that frame, so the turn is as smooth as the screen. The model is
   exported by scripts/export-instruments.py: centred, its length 1, upright along +Y, facing +Z. */
import {
  AgXToneMapping, Color, Material, MathUtils, Matrix4, Mesh, MeshPhysicalMaterial, MeshStandardMaterial,
  Object3D, PerspectiveCamera, PMREMGenerator, RectAreaLight, Scene, SRGBColorSpace, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface Instrument {
  pose(progress: number, turn?: number): void; // turn: degrees about its long axis, once upright
  resize(size: number, ratio: number): void;
  dispose(): void;
}

const FRAME_WIDTH = 1.1; // the view's width at the instrument, in instrument lengths
const LENS = 85; // mm, on a 36 mm frame
const smooth = (t: number) => t * t * (3 - 2 * t);

// The studio's lights, as in render-instruments.py (Blender's x, y, z are x, z, -y here): where, how
// bright, how wide and tall, what colour.
const warm = new Color(1, .93, .85);
const cool = new Color(.86, .92, 1);
const LIGHTS: [number, number, number, number, number, number, Color][] = [
  [-.3, 1.6, .45, 7.5, 1.6, .9, warm], // above
  [.6, .25, 2.4, 4.2, .5, 2.4, cool], // a tall band, where the camera is
  [-1.3, .2, -.05, 6.5, .4, 2.2, cool], // the outline, left
  [1.3, -.15, -.1, 4.6, .4, 2.2, warm], // the outline, right
  [.35, -.6, 1.8, 1, 1.2, .9, warm], // a faint card below
];

let lightsReady = false;

/* The paint is satin, not lacquer: no smoother than 0.46 and no clear coat. Metal keeps its finish. */
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

export async function createInstrument(canvas: HTMLCanvasElement, url: string, paint: string): Promise<Instrument> {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = 1;
  if (!lightsReady) {
    RectAreaLightUniformsLib.init();
    lightsReady = true;
  }

  const scene = new Scene();
  // A dim room for the satin to show its shape in; the lights do the rest.
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environment = environment;
  scene.environmentIntensity = .12;
  for (const [x, y, z, intensity, width, height, colour] of LIGHTS) {
    const light = new RectAreaLight(colour, intensity, width, height);
    light.position.set(x, y, z);
    light.lookAt(0, 0, 0);
    scene.add(light);
  }

  const camera = new PerspectiveCamera(2 * MathUtils.radToDeg(Math.atan(18 / LENS)), 1, .1, 20);
  camera.position.set(0, 0, FRAME_WIDTH * LENS / 36);
  camera.lookAt(0, 0, 0);

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const model: Object3D = (await loader.loadAsync(url)).scene;
  model.traverse(node => {
    if (!(node instanceof Mesh)) return;
    for (const material of [node.material].flat()) if (material.name === paint) satin(material);
  });
  const holder = new Object3D();
  holder.add(model);
  scene.add(holder);
  renderer.compile(scene, camera);

  const turn = new Matrix4();
  const step = new Matrix4();
  let shown = -1;
  let turned = 0;
  let size = 0;

  return {
    // From lying flat, seen from a little above, to upright and turned a little towards the page:
    // the same turn as the studio renders.
    pose(progress, degrees = 0) {
      if ((progress === shown && degrees === turned) || !size) return;
      shown = progress;
      turned = degrees;
      const ease = smooth(progress);
      const spin = MathUtils.degToRad(18 - 32 * ease + degrees); // around its neck
      const tilt = MathUtils.degToRad(16 * (1 - ease)); // its face leaning back
      turn.makeRotationX(tilt)
        .multiply(step.makeRotationZ((progress - 1) * -Math.PI / 2))
        .multiply(step.makeRotationY(spin));
      holder.quaternion.setFromRotationMatrix(turn);
      renderer.render(scene, camera);
    },
    resize(css, ratio) {
      if (css === size && ratio === renderer.getPixelRatio()) return;
      size = css;
      renderer.setPixelRatio(ratio);
      renderer.setSize(css, css, false);
      shown = -1;
    },
    dispose() {
      environment.dispose();
      scene.traverse(node => {
        if (!(node instanceof Mesh)) return;
        node.geometry.dispose();
        for (const material of [node.material].flat()) material.dispose();
      });
      renderer.dispose();
    },
  };
}
