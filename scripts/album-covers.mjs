// Makes the record sleeves for the music page from the albums' front covers.
//
// The covers are not kept in the repository at full size. Download each one into a folder, named by the
// record's id in src/data/music.ts (`<id>.jpg`). The ones on the page came from the Cover Art Archive
// (https://coverartarchive.org/release-group/<MusicBrainz release group>/front-1200); In the Court of
// the Crimson King, which it only has small, came from the album's iTunes artwork at 1400 px.
//
//   node scripts/album-covers.mjs <folder with the covers>
//
// Each cover is cropped square and saved at 800 px (the sleeve is at most 360 css px, so 2× with room)
// as public/img/music/<id>.webp. Alongside, src/data/music-covers.json gets two things the page needs
// from each cover's colours, so nothing has to be measured in the browser before it is drawn:
//   tone   'light' | 'dark': how bright the cover is across the middle (44–56% of its height), where
//          the tear tape crosses it. The tape is smoked glass on a light sleeve and clear on a dark one.
//   label  the colour of the disc's centre label: the cover's most vivid colours, averaged, lifted if
//          it would vanish into the black vinyl.
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/album-covers.mjs <folder with <id>.jpg covers>');
  process.exit(2);
}
const imgDir = fileURLToPath(new URL('../public/img/music/', import.meta.url));
const dataFile = fileURLToPath(new URL('../src/data/music-covers.json', import.meta.url));
mkdirSync(imgDir, { recursive: true });

const SIZE = 800;
const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const hex = (r, g, b) => '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');

const out = {};
for (const file of readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort()) {
  const id = basename(file).replace(/\.[^.]+$/, '');
  const square = sharp(join(dir, file)).resize(SIZE, SIZE, { fit: 'cover', position: 'centre', kernel: 'lanczos3' });
  await square.clone().webp({ quality: 82, effort: 6 }).toFile(join(imgDir, `${id}.webp`));

  // A small copy is enough to read its colours.
  const N = 40;
  const { data } = await square.clone().resize(N, N).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = [];
  for (let k = 0; k < data.length; k += 3) px.push([data[k], data[k + 1], data[k + 2]]);

  // tone: the mean light across the band the tape crosses.
  let band = 0, bandN = 0;
  for (let y = Math.floor(N * 0.44); y < Math.ceil(N * 0.56); y++) {
    for (let x = 0; x < N; x++) { band += lum(...px[y * N + x]); bandN++; }
  }
  const tone = band / bandN > 0.28 ? 'light' : 'dark';

  // label: the average of the most vivid sixth of the cover (saturation weighted by brightness).
  const vivid = px
    .map(([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return { c: [r, g, b], s: mx ? ((mx - mn) / mx) * (mx / 255) : 0 }; })
    .sort((a, b) => b.s - a.s)
    .slice(0, Math.ceil(px.length / 6));
  let [r, g, b] = vivid.reduce((acc, { c }) => acc.map((v, i) => v + c[i] / vivid.length), [0, 0, 0]);
  // Grey covers have no vivid colour to speak of: then it's their plain average.
  if (vivid[0].s < 0.12) [r, g, b] = px.reduce((acc, c) => acc.map((v, i) => v + c[i] / px.length), [0, 0, 0]);
  // On black vinyl a label darker than this is a hole: mix it towards white until it shows.
  while (lum(r, g, b) < 0.05) [r, g, b] = [r, g, b].map((c) => c + (255 - c) * 0.15);

  out[id] = { tone, label: hex(r, g, b) };
  console.log(id.padEnd(22), tone.padEnd(6), out[id].label);
}
writeFileSync(dataFile, JSON.stringify(out, null, 2) + '\n');
