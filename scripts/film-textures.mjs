// Makes the shrink-wrap for the music page from two photographs of real plastic film on black:
// the film pulled taut over a sleeve (long streaks fanning across it) and the same kind of film gone
// slack and crumpled, which fades in as the tear tape comes off.
//
// Source photos, by Resource Boy on Pexels (Pexels licence: free to use and to modify). They are not
// kept in the repository; download them at 1600 px wide into a folder, named by their Pexels id:
//   18541865.jpg  https://www.pexels.com/photo/texture-plastic-plastic-wrap-18541865/   (taut)
//   18541876.jpg  https://www.pexels.com/photo/texture-plastic-plastic-wrap-18541876/   (slack)
//
//   node scripts/film-textures.mjs <folder with the two photos>
//
// Each photo is turned and cropped to a square, its black is taken down to true black, and its light
// is given a little bloom. The result is saved as white with the light as its alpha, which is exactly
// what `mix-blend-mode: screen` would give, without needing blending (the film sits inside elements
// that are their own stacking contexts). Under the light goes a soft shadow, offset a few pixels: on a
// dark sleeve it is not seen, on a pale one it is what shows the folds.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/film-textures.mjs <folder with 18541865.jpg and 18541876.jpg>');
  process.exit(2);
}
const outDir = fileURLToPath(new URL('../src/components/music/v4/', import.meta.url));
const SIZE = 1024;

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A square of the photo as light, 0..1 per pixel: turned, cropped (in the turned photo's own pixels) and scaled to SIZE. */
async function light(file, { turn = 0, crop }) {
  const turned = await sharp(join(dir, file)).greyscale().rotate(turn, { background: '#000' }).png().toBuffer();
  return plane(sharp(turned).extract(crop).resize(SIZE, SIZE, { kernel: 'lanczos3' }));
}

/** The first channel of a sharp pipeline's output as 0..1 values (sharp may hand back more channels than it was given). */
async function plane(pipeline) {
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const out = new Float32Array(info.width * info.height);
  for (let i = 0; i < out.length; i++) out[i] = data[i * info.channels] / 255;
  return out;
}

async function blur(a, sigma) {
  return plane(sharp(Buffer.from(Uint8Array.from(a, (v) => Math.round(clamp(v) * 255))), { raw: { width: SIZE, height: SIZE, channels: 1 } }).blur(sigma));
}

/** Black point, white point and gamma: the photo's dark grey ground goes to nothing, its highlights to full. */
const levels = (a, lo, hi, gamma) => a.map((v) => clamp((v - lo) / (hi - lo)) ** gamma);
const screen = (...layers) => layers[0].map((_, i) => 1 - layers.reduce((p, l) => p * (1 - clamp(l[i])), 1));
const scale = (a, k) => a.map((v) => v * k);

/** The edges of the photo fade out, so the film has no hard border where the crop ends. */
const vignette = (a, edge) =>
  a.map((v, i) => {
    const x = (i % SIZE) / SIZE, y = Math.floor(i / SIZE) / SIZE;
    const d = Math.min(x, y, 1 - x, 1 - y);
    return v * Math.min(1, d / edge);
  });

/** White with the light as alpha, over a soft shadow moved (dx, dy) pixels. */
async function save(name, lit, { shadow = 0.34, dx = 3, dy = 9, quality = 80, alphaQuality = 88 }) {
  const soft = await blur(lit, 5);
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const sx = x - dx, sy = y - dy;
      const s = sx >= 0 && sy >= 0 && sx < SIZE && sy < SIZE ? soft[sy * SIZE + sx] * shadow : 0;
      const l = clamp(lit[i]);
      const alpha = l + s * (1 - l);
      const grey = alpha > 0 ? Math.round((l / alpha) * 255) : 255;
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = grey;
      rgba[i * 4 + 3] = Math.round(alpha * 255);
    }
  }
  const file = join(outDir, name);
  const info = await sharp(rgba, { raw: { width: SIZE, height: SIZE, channels: 4 } }).webp({ quality, alphaQuality, effort: 6 }).toFile(file);
  console.log(`wrote ${file} (${(info.size / 1024).toFixed(0)} KB)`);
}

// ---- taut: the fan of streaks, turned so it rises from the lower left to the right edge
const fan = levels(await blur(await light('18541865.jpg', { turn: -90, crop: { left: 150, top: 215, width: 1250, height: 1250 } }), 0.6), 0.09, 0.5, 0.8);
{
  // The streaks in the photo are hairlines; a tight glow gives them body and a wide one the bloom.
  const lit = screen(fan, scale(await blur(fan, 2.2), 1.8), scale(await blur(fan, 9), 1), scale(await blur(fan, 30), 0.4));
  await save('film-taut.webp', vignette(lit, 0.02), {});
}

// ---- slack: the same fan with the tension gone (its streaks spread wide and soft), under the broad
// folds of a second, crumpled sheet turned to run the same way, and a faint haze over everything
{
  const folds = levels(await light('18541876.jpg', { turn: -30, crop: { left: 717, top: 844, width: 1100, height: 1100 } }), 0.12, 0.85, 1.2);
  const lit = screen(scale(await blur(fan, 4), 2.4), scale(await blur(fan, 16), 1.3), scale(folds, 0.6), scale(await blur(folds, 12), 0.3), fan.map(() => 0.05));
  await save('film-slack.webp', vignette(lit, 0.02), { shadow: 0.25, quality: 60, alphaQuality: 60 });
}
