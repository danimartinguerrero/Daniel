/* Live WebGL studio for the scroll chapters. The exported models are one unit long, upright along
   +Y and facing +Z. A photographed lighting environment supplies reflections at every viewing angle. */
import {
  AgXToneMapping, DirectionalLight, EquirectangularReflectionMapping, Material, MathUtils, Matrix4,
  Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, PCFSoftShadowMap,
  RectAreaLight, Scene, SRGBColorSpace, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

export interface Instrument {
  pose(progress: number): void;
  resize(size: number, ratio: number): void;
  dispose(): void;
}

RectAreaLightUniformsLib.init();

const FRAME_WIDTH = 1.1; // the view's width at the instrument, in instrument lengths
const LENS = 85; // mm, on a 36 mm frame
const smooth = (t: number) => t * t * (3 - 2 * t);

function rim(x: number, width: number, intensity: number, colour: number) {
  const light = new RectAreaLight(colour, intensity, width, 1.5);
  light.position.set(x, .25, -.18);
  light.lookAt(0, 0, 0);
  return light;
}

// Keep highlights broad on the paint and preserve the source roughness on metal hardware.
function satin(material: Material) {
  if (!(material instanceof MeshStandardMaterial)) return;
  if (material instanceof MeshPhysicalMaterial) {
    material.clearcoat = .24;
    material.clearcoatRoughness = .28;
  }
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>',
      '#include <metalnessmap_fragment>\n\troughnessFactor = mix(max(roughnessFactor, .32), roughnessFactor, step(.5, metalnessFactor));');
  };
  material.customProgramCacheKey = () => 'satin';
  material.needsUpdate = true;
}

function hardware(material: MeshStandardMaterial) {
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', `
      #include <metalnessmap_fragment>
      float bareMetal = metalnessFactor * smoothstep(0.065, 0.30, diffuseColor.g);
      diffuseColor.rgb = mix(diffuseColor.rgb, min(vec3(.91), diffuseColor.rgb * 1.48), bareMetal);
      roughnessFactor = mix(roughnessFactor, clamp(roughnessFactor, .16, .36), bareMetal);
    `);
  };
  material.customProgramCacheKey = () => 'nickel-hardware';
}

export async function createInstrument(canvas: HTMLCanvasElement, url: string, paint: string): Promise<Instrument> {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  const key = new DirectionalLight(0xfff4e7, 1.35);
  key.position.set(-.7, .85, 1.1);
  key.castShadow = true;
  // A tight frustum resolves the narrow shadows under the strings and bridge saddles.
  Object.assign(key.shadow.camera, { left: -.57, right: .57, top: .57, bottom: -.57, near: .65, far: 2.15 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.normalBias = .00022;
  key.shadow.bias = -.00012;
  // Feather a tall strip across the top carve. Its reflection moves over the pickup covers as the instrument turns.
  const strip = new RectAreaLight(0xfff6ed, 8.5, .28, 1.2);
  strip.position.set(-.91, .52, .85);
  strip.lookAt(0, -.18, 0);
  strip.rotateZ(.48);
  scene.add(key, strip, rim(-.7, .28, 4.5, 0xe6efff), rim(.85, .16, 3.8, 0xffecd2));

  const camera = new PerspectiveCamera(2 * MathUtils.radToDeg(Math.atan(18 / LENS)), 1, .1, 20);
  camera.position.set(0, 0, FRAME_WIDTH * LENS / 36);
  camera.lookAt(0, 0, 0);

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [gltf, environment] = await Promise.all([
    loader.loadAsync(url),
    new HDRLoader().loadAsync('/music/instruments/studio-small-09.hdr'),
  ]);
  environment.mapping = EquirectangularReflectionMapping;
  scene.environment = environment;
  scene.environmentIntensity = .66;
  scene.environmentRotation.y = 5.3;
  const model = gltf.scene;
  model.traverse(node => {
    if (!(node instanceof Mesh)) return;
    node.castShadow = node.receiveShadow = true;
    for (const material of [node.material].flat()) {
      if (material.name === paint) satin(material);
      if (!(material instanceof MeshStandardMaterial)) continue;
      if (material.name === 'NeckMaterial' || material.name === 'SmallbitsBake') hardware(material);
      if (material.name === 'NeckMaterial' && material instanceof MeshPhysicalMaterial) {
        material.clearcoatRoughness = .27;
      }
      if (material.name === 'StringMaterial') material.roughness = .26;
    }
  });
  const holder = new Object3D();
  holder.add(model);
  scene.add(holder);
  await renderer.compileAsync(scene, camera);

  const turn = new Matrix4();
  const step = new Matrix4();
  let shown = -1;
  let size = 0;

  return {
    // From lying flat, seen from a little above, to upright and turned a little towards the page:
    // the same turn as the studio renders.
    pose(progress) {
      if (progress === shown || !size) return;
      shown = progress;
      const ease = smooth(progress);
      const spin = MathUtils.degToRad(18 - 32 * ease); // around its neck
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
      key.shadow.dispose();
      scene.traverse(node => {
        if (!(node instanceof Mesh)) return;
        node.geometry.dispose();
        for (const material of [node.material].flat()) material.dispose();
      });
      renderer.dispose();
    },
  };
}
