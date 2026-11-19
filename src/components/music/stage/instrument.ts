/* Prototype "Stage" (StageStory.astro): an instrument drawn live with WebGL, standing upright on a dark
   stage whose lights come up as its words fill. Built from ../strings/instrument.ts (the same model,
   85 mm camera, AgX, satin finish), with three differences:
   - the canvas is clear where the instrument is not, so the stage's light (CSS, behind it) shows;
   - the studio's five soft lights are four groups the page brings up as the words fill: the two rims
     (the outline comes out of the dark, and each swings brighter when the words on its side are read),
     the key from above (the spot) and the fill from the front;
   - the key light takes the chapter's colour of light (cool for a stage, warm for a room at home).
   The model is exported by scripts/export-instruments.py: centred, its length 1, upright along +Y,
   facing +Z. */
import {
  AgXToneMapping, Color, Material, MathUtils, Mesh, MeshPhysicalMaterial, MeshStandardMaterial,
  Object3D, PerspectiveCamera, PMREMGenerator, RectAreaLight, Scene, SRGBColorSpace, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface Levels { left: number; right: number; key: number; fill: number }

export interface Instrument {
  /** Draws it turned `degrees` about its long axis (0: facing you, as it rests), lit at `levels`
      (0 to 1 each). Returns whether a new frame was drawn. */
  draw(degrees: number, levels: Levels): boolean;
  resize(size: number, ratio: number): void;
  dispose(): void;
}

const FRAME_WIDTH = 1.1; // the view's width at the instrument, in instrument lengths
const LENS = 85; // mm, on a 36 mm frame
const REST = -14; // degrees: as the studio renders stand, turned a little towards the page

type Group = keyof Levels;
// The studio's lights (render-instruments.py, Blender's x, y, z as x, z, -y): where, how bright, how
// wide and tall, what colour, which group. `null` colour takes the chapter's light.
const cool = new Color(.86, .92, 1);
const warm = new Color(1, .93, .85);
const LIGHTS: [number, number, number, number, number, number, Color | null, Group][] = [
  [-.3, 1.6, .45, 9, 1.6, .9, null, 'key'], // above, the stage's spot
  [.6, .25, 2.4, 3.6, .5, 2.4, cool, 'fill'], // a tall band, where the camera is
  [-1.3, .2, -.05, 9, .4, 2.2, cool, 'left'], // the outline, left
  [1.3, -.15, -.1, 7.5, .4, 2.2, null, 'right'], // the outline, right, in the chapter's light
  [.35, -.6, 1.8, 1.4, 1.2, .9, null, 'fill'], // the floor's bounce, from below
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

export async function createInstrument(canvas: HTMLCanvasElement, url: string, paint: string, light: string): Promise<Instrument> {
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
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environment = environment;
  const chapter = new Color(light);
  const lights = LIGHTS.map(([x, y, z, intensity, width, height, colour, group]) => {
    const lamp = new RectAreaLight(colour ?? chapter, 0, width, height);
    lamp.position.set(x, y, z);
    lamp.lookAt(0, 0, 0);
    scene.add(lamp);
    return { lamp, intensity, group };
  });

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

  let drawn = '';
  let size = 0;

  return {
    draw(degrees, levels) {
      if (!size) return false;
      const key = `${degrees.toFixed(2)}:${levels.left.toFixed(3)}:${levels.right.toFixed(3)}:${levels.key.toFixed(3)}:${levels.fill.toFixed(3)}`;
      if (key === drawn) return false;
      drawn = key;
      holder.rotation.set(0, MathUtils.degToRad(REST + degrees), 0);
      for (const { lamp, intensity, group } of lights) lamp.intensity = intensity * levels[group];
      // The room's faint reflections come up with the fill, so the dark is really dark at first.
      scene.environmentIntensity = .005 + .115 * levels.fill;
      renderer.render(scene, camera);
      return true;
    },
    resize(css, ratio) {
      if (css === size && ratio === renderer.getPixelRatio()) return;
      size = css;
      renderer.setPixelRatio(ratio);
      renderer.setSize(css, css, false);
      drawn = '';
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
