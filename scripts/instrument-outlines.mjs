// The instruments' outlines for the music page's line-up (src/components/music/lineup), as the real
// instrument turns: for each model, its outline every STEP degrees about its long axis, each as POINTS
// points matched part to part (foot, body, waist, neck, head), so the page can move between any two.
//
//   1. Render alpha silhouettes with Blender (bpy 4.5, the env in ~/.cache/personal-website-instruments):
//        python -I scripts/instrument-outlines.py pj-bass.raw.glb <frames>/pj-bass 1600 10
//      (the raw, uncompressed exports from scripts/export-instruments.py; Blender can't read meshopt)
//   2. Trace and sample them (needs `potrace` from npm, e.g. NODE_PATH=<a folder with it installed>):
//        node scripts/instrument-outlines.mjs <frames>/pj-bass public/music/instruments/pj-bass.outlines.bin
//
// The file is Uint16 little-endian: for each angle (0, STEP, …), POINTS (x, y) pairs in the 1600-unit
// square frame of the WebGL view, times 16. lineup.ts reads it with the same STEP and POINTS.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Resolved the CommonJS way, so NODE_PATH can point at a folder where potrace is installed.
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const potrace = require('potrace');

const STEP = 10;
const POINTS = 720;
const SCALE = 16;
const HEIGHTS = [.25, .42, .6, .8]; // where each side is cut, of the instrument's height from its foot
const SHARES = [.2, .22, .17, .17, .24]; // of a side's points, per piece, foot to head

const [frames, output] = process.argv.slice(2);

function trace(file) {
  return new Promise(async (resolve, reject) => {
    const mask = await sharp(file).extractChannel(3).threshold(128).negate().png().toBuffer();
    potrace.trace(mask, { turdSize: 20, alphaMax: 1, optCurve: true, optTolerance: .4, threshold: 128 }, (error, svg) => {
      if (error) return reject(error);
      // The largest outline is the instrument; potrace's specks are left out.
      const d = svg.match(/ d="([^"]+)"/)[1];
      resolve(d.split(/(?=M)/).map(part => part.trim()).filter(Boolean));
    });
  });
}

// A path of absolute M, L, C and Z commands as a dense polyline.
function flatten(d) {
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+/g);
  const points = [];
  let i = 0, x = 0, y = 0, command = '';
  const number = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    if (/[MLCZ]/.test(tokens[i])) command = tokens[i++];
    if (command === 'Z') continue;
    if (command === 'M' || command === 'L') { x = number(); y = number(); points.push([x, y]); }
    else if (command === 'C') {
      const [x1, y1, x2, y2, x3, y3] = [number(), number(), number(), number(), number(), number()];
      for (let s = 1; s <= 24; s++) {
        const t = s / 24, u = 1 - t;
        points.push([u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3]);
      }
      x = x3; y = y3;
    }
  }
  return points;
}
const area = points => points.reduce((sum, [x1, y1], i) => { const [x2, y2] = points[(i + 1) % points.length]; return sum + x1 * y2 - x2 * y1; }, 0);

function resample(chain, count) {
  const lengths = [0];
  for (let i = 1; i < chain.length; i++) lengths.push(lengths[i - 1] + Math.hypot(chain[i][0] - chain[i - 1][0], chain[i][1] - chain[i - 1][1]));
  const length = lengths[lengths.length - 1] || 1;
  const out = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const target = length * i / count;
    while (j < chain.length - 2 && lengths[j + 1] < target) j++;
    const t = (target - lengths[j]) / ((lengths[j + 1] - lengths[j]) || 1);
    out.push([chain[j][0] + (chain[j + 1][0] - chain[j][0]) * t, chain[j][1] + (chain[j + 1][1] - chain[j][1]) * t]);
  }
  return out;
}

// From its foot up one side to its head, then down the other, each side cut at the same heights and each
// piece given the same share of points in every outline.
function outline(points) {
  if (area(points) < 0) points.reverse();
  const ys = points.map(p => p[1]), xs = points.map(p => p[0]);
  const bottom = Math.max(...ys), top = Math.min(...ys);
  const middle = (Math.max(...xs) + Math.min(...xs)) / 2;
  let foot = 0;
  points.forEach(([x, y], i) => {
    const [fx, fy] = points[foot];
    if (y > fy + .5 || (Math.abs(y - fy) <= .5 && Math.abs(x - middle) < Math.abs(fx - middle))) foot = i;
  });
  points = [...points.slice(foot), ...points.slice(0, foot)];
  const head = points.findIndex(p => p[1] === top);
  const side = (chain, count) => {
    const cuts = [0];
    for (const h of HEIGHTS) {
      const y = bottom - (bottom - top) * h;
      const at = chain.findIndex((p, i) => i > cuts[cuts.length - 1] && p[1] <= y);
      cuts.push(at < 0 ? cuts[cuts.length - 1] + 1 : at);
    }
    cuts.push(chain.length - 1);
    const out = [];
    SHARES.forEach((share, k) => {
      const piece = chain.slice(cuts[k], Math.max(cuts[k] + 2, cuts[k + 1] + 1));
      const n = k === SHARES.length - 1 ? count - out.length : Math.round(count * share);
      out.push(...resample(piece, n));
    });
    return out;
  };
  const one = side(points.slice(0, head + 1), POINTS / 2);
  const other = side([...points.slice(head), points[0]].reverse(), POINTS / 2).reverse();
  return [...one, ...other];
}

const angles = Array.from({ length: 360 / STEP }, (_, i) => i * STEP);
const data = new Uint16Array(angles.length * POINTS * 2);
for (const [a, angle] of angles.entries()) {
  const parts = await trace(path.join(frames, `${String(angle).padStart(3, '0')}.png`));
  const outlines = parts.map(flatten).filter(p => p.length > 2);
  const main = outlines.reduce((best, p) => Math.abs(area(p)) > Math.abs(area(best)) ? p : best);
  outline(main).forEach(([x, y], i) => {
    data[(a * POINTS + i) * 2] = Math.round(x * SCALE);
    data[(a * POINTS + i) * 2 + 1] = Math.round(y * SCALE);
  });
}
fs.writeFileSync(output, Buffer.from(data.buffer));
console.log(output, angles.length, 'angles', POINTS, 'points', data.byteLength, 'bytes');
