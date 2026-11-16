// Precomputes the island meter's levels from the song: six log-spaced bands, 30 frames a second,
// one byte each (0 to 255), so the page can show the music's real spectrum without analysing it
// live (routing an <audio> element through Web Audio is what glitched on phones).
//
//   node scripts/audio-levels.mjs public/audio/feather.m4a public/audio/feather.levels.bin
//
// Needs ffmpeg on the PATH. Keep `bandEdges`, `fps` and the band count in step with
// src/components/island-audio.ts.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('usage: audio-levels.mjs <audio in> <levels out>');

const rate = 44100;
const fps = 30;
const size = 2048;
const bandEdges = [45, 110, 260, 600, 1400, 3300, 9000];
/** Higher bands carry less energy in music: lift them so every bar moves. */
const liftPerBand = 3.5;
/** The bars' range below the loudest moments, in dB, and the curve that keeps quiet passages low. */
const range = 46;
const curve = 1.4;

const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', input, '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);

// Radix-2 FFT, in place.
const fft = (re, im) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const a = i + k, b = a + len / 2;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
};

const hann = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
const frames = Math.ceil((samples.length / rate) * fps);
const bands = bandEdges.length - 1;
const binHz = rate / size;
const db = new Float64Array(frames * bands);
const re = new Float64Array(size), im = new Float64Array(size);

for (let f = 0; f < frames; f++) {
  // The window is centred on the frame's moment.
  const start = Math.round((f / fps) * rate) - size / 2;
  for (let i = 0; i < size; i++) {
    const s = start + i;
    re[i] = s >= 0 && s < samples.length ? samples[s] * hann[i] : 0;
    im[i] = 0;
  }
  fft(re, im);
  for (let b = 0; b < bands; b++) {
    const from = Math.max(1, Math.floor(bandEdges[b] / binHz));
    const to = Math.max(from + 1, Math.ceil(bandEdges[b + 1] / binHz));
    let power = 0;
    for (let i = from; i < to; i++) power += re[i] * re[i] + im[i] * im[i];
    db[f * bands + b] = 10 * Math.log10(power / (to - from) + 1e-20) + b * liftPerBand;
  }
}

// The top of the range is the 99.5th percentile, so one stray peak doesn't flatten the rest.
const sorted = Float64Array.from(db).sort();
const top = sorted[Math.floor(sorted.length * 0.995)];
const out = new Uint8Array(frames * bands);
for (let i = 0; i < db.length; i++) {
  const level = Math.min(1, Math.max(0, (db[i] - (top - range)) / range)) ** curve;
  out[i] = Math.round(level * 255);
}
writeFileSync(output, out);
console.log(`${frames} frames x ${bands} bands at ${fps} fps -> ${output} (${out.length} bytes)`);
