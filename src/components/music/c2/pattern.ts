/**
 * Music, way c2: the beat the controller is seen making. A loop of two bars in sixteenths: three drum
 * parts, each on a pad, and a phrase on the keys. It is drawn on the floor as a disc that turns under a
 * needle of light (film.ts), and the pads and keys move as their steps pass under it.
 *
 * Nothing here keeps time or makes a sound: where the loop is comes from the page's scroll, in steps,
 * and everything below is worked out from that number alone. Scrolled back, it runs backwards.
 */

/** Steps in the loop: two bars of sixteenths. */
export const STEPS = 32;

/** The drum parts, from the disc's inside out, and the pad each one is on (0–3 the near row, left to
    right: pads 1–4 as printed; 4–7 the far row). */
export const DRUMS = [
  { name: 'kick', pad: 0, steps: at(0, 7, 10, 16, 23, 25) },
  { name: 'snare', pad: 1, steps: at(4, 12, 19, 20, 28) },
  { name: 'hat', pad: 2, steps: at(0, 2, 4, 6, 8, 10, 12, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30) },
] as const;

/** The phrase on the keys: where a note starts and how long it is held, in steps, and which of the 25
    keys it is (0 = the lowest C). Two held notes underneath, a line on top. */
export const NOTES: readonly { from: number; len: number; key: number }[] = [
  { from: 0, len: 14, key: 2 },
  { from: 16, len: 14, key: 0 },
  { from: 0, len: 3, key: 14 },
  { from: 3, len: 3, key: 17 },
  { from: 6, len: 2, key: 21 },
  { from: 8, len: 5, key: 24 },
  { from: 14, len: 2, key: 21 },
  { from: 16, len: 3, key: 19 },
  { from: 19, len: 3, key: 16 },
  { from: 22, len: 2, key: 14 },
  { from: 24, len: 5, key: 12 },
  { from: 30, len: 2, key: 9 },
];

function at(...steps: number[]) {
  const on = new Array<boolean>(STEPS).fill(false);
  for (const s of steps) on[s] = true;
  return on;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
/** How far past the start of step `s` the needle is, in steps, the loop coming round. A step the
    needle has not reached yet (the loop's first time round) has not been played. */
function since(p: number, s: number) {
  const d = p - s;
  return d < 0 ? -1 : d % STEPS;
}

/** A pad as the needle passes its step: how far down it is (0–1) and how much light is in it (0–1).
    It goes down at once, comes up within the step, and its light dies away over the next one. */
export function pad(index: number, p: number) {
  let down = 0;
  let light = 0;
  for (const drum of DRUMS) {
    if (drum.pad !== index) continue;
    for (let s = 0; s < STEPS; s++) {
      if (!drum.steps[s]) continue;
      const x = since(p, s);
      if (x < 0 || x > 2) continue;
      down = Math.max(down, x < 0.1 ? smooth(x / 0.1) : 1 - smooth(clamp01((x - 0.42) / 0.4)));
      light = Math.max(light, x < 0.08 ? x / 0.08 : Math.exp(-(x - 0.08) * 2.4) * (1 - smooth(clamp01((x - 1.4) / 0.6))));
    }
  }
  return { down, light };
}

/** How far down a key is (0–1): held for as long as its note is under the needle. */
export function key(index: number, p: number) {
  let down = 0;
  for (const note of NOTES) {
    if (note.key !== index) continue;
    const x = since(p, note.from);
    if (x < 0 || x > note.len) continue;
    down = Math.max(down, smooth(clamp01(x / 0.14)) * (1 - smooth(clamp01((x - (note.len - 0.3)) / 0.3))));
  }
  return down;
}

/** The first knob of each row, turned as the loop goes round, in radians either side of straight up:
    one opens slowly over the whole loop, the other rides back and forth. */
export function knob(index: number, p: number) {
  const t = clamp01(p / STEPS);
  if (index === 0) return (-0.72 + 1.5 * smooth(t)) * Math.PI * 0.75;
  if (index === 4) return Math.sin(Math.max(0, p) * (Math.PI / 8)) * 0.55 - 0.3;
  return REST[index] ?? 0;
}
/** Where the other knobs were left. */
const REST = [0, 0.9, -1.3, 0.35, 0, -0.6, 1.5, -1.9];
