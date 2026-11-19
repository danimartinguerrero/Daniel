/* Direction "Macro" (MacroStory.astro): ../strings/instrument.ts turned into a camera you can fly. The
   same studio (85 mm look, five soft area lights placed as in scripts/render-instruments.py, AgX, a
   satin finish, on black), but the instrument stays where it stands and the camera moves: close along
   the neck, over the pickups, then back to see all of it. The whole screen is the canvas, so the frame
   is drawn on black, without a clear background. The model (scripts/export-instruments.py) is centred,
   its length 1, upright along +Y and facing +Z. */
import {
  AgXToneMapping, Color, Material, MathUtils, Mesh, MeshPhysicalMaterial, MeshStandardMaterial,
  Object3D, PerspectiveCamera, PMREMGenerator, RectAreaLight, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Where the camera is and what it looks at, in model units (the instrument is 1 long), and its
 *  vertical field of view in degrees. `shift` moves the picture's centre on screen, in fractions of the
 *  screen (+x right, +y down), so the subject can sit beside the words without turning the camera;
 *  `roll` tilts the picture, in degrees, so the neck can cross the screen on a diagonal. */
export interface View { eye: [number, number, number]; at: [number, number, number]; fov: number; shift: [number, number]; roll: number }

export interface Instrument {
  view(view: View): void;
  resize(width: number, height: number, ratio: number): void;
  dispose(): void;
}

const warm = new Color(1, .93, .85);
const cool = new Color(.86, .92, 1);
// The studio's lights, as in render-instruments.py: where, how bright, how wide and tall, what colour.
const LIGHTS: [number, number, number, number, number, number, Color][] = [
  [-.3, 1.6, .45, 7.5, 1.6, .9, warm], // above
  [.6, .25, 2.4, 4.2, .5, 2.4, cool], // a tall band in front
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

export async function createInstrument(canvas: HTMLCanvasElement, url: string, paint: string, turn: number): Promise<Instrument> {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = 1;
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
  scene.environmentIntensity = .12;
  for (const [x, y, z, intensity, width, height, colour] of LIGHTS) {
    const light = new RectAreaLight(colour, intensity, width, height);
    light.position.set(x, y, z);
    light.lookAt(0, 0, 0);
    scene.add(light);
  }

  const camera = new PerspectiveCamera(20, 1, .01, 20);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const model: Object3D = (await loader.loadAsync(url)).scene;
  model.traverse(node => {
    if (!(node instanceof Mesh)) return;
    for (const material of [node.material].flat()) {
      if (material.name === paint) satin(material);
      // Close up, the textures are seen at an angle: let them stay sharp there.
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap'] as const) {
        const texture = (material as MeshStandardMaterial)[key];
        if (texture) texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      }
    }
  });
  const holder = new Object3D();
  holder.add(model);
  // Upright, turned a little towards the page, as it ends in the studio renders (and `turn` more).
  holder.rotation.y = MathUtils.degToRad(-14 + turn);
  scene.add(holder);
  renderer.compile(scene, camera);

  const at = new Vector3();
  let width = 0, height = 0;
  let last = '';

  return {
    view({ eye, at: target, fov, shift, roll }) {
      if (!width) return;
      const key = `${eye.map(v => v.toFixed(5))}|${target.map(v => v.toFixed(5))}|${fov.toFixed(4)}|${shift[0].toFixed(4)},${shift[1].toFixed(4)}|${roll.toFixed(3)}`;
      if (key === last) return;
      last = key;
      camera.fov = fov;
      camera.aspect = width / height;
      // The picture's centre moved on screen: a lens shift, so verticals stay vertical.
      camera.setViewOffset(width, height, -shift[0] * width, -shift[1] * height, width, height);
      camera.position.set(...eye);
      camera.lookAt(at.set(...target));
      camera.rotateZ(MathUtils.degToRad(roll));
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    },
    resize(w, h, ratio) {
      if (w === width && h === height && ratio === renderer.getPixelRatio()) return;
      width = w;
      height = h;
      renderer.setPixelRatio(ratio);
      renderer.setSize(w, h, false);
      last = '';
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
