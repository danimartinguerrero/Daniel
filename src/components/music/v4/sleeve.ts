/**
 * Design 4, "Listening bar": the sleeve art. Original abstract figures drawn from each record's palette
 * and motif on a 100×100 square. None of them imitates the album's real cover, logo or lettering.
 * No ids or gradients, so the same markup can be cloned into the pulled-out record without clashing.
 */
import type { Vinyl } from '@/data/music';

const f = (n: number) => Number(n.toFixed(2));

/** A small deterministic random, so the server and every reload draw the same sleeve. */
function seeded(text: string) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function motif(v: Vinyl): string {
  const [deep, mid, light, accent] = v.palette;
  const rnd = seeded(v.id);
  switch (v.motif) {
    case 'horizon': {
      // A low sun on a horizon, its reflection broken into bars on still water.
      let s = `<rect width="100" height="100" fill="${deep}"/>`;
      s += `<rect width="100" height="60" fill="${mid}" opacity=".28"/><rect y="24" width="100" height="36" fill="${mid}" opacity=".32"/><rect y="44" width="100" height="16" fill="${mid}" opacity=".4"/>`;
      s += `<circle cx="50" cy="60" r="21" fill="${light}"/>`;
      s += `<rect y="60" width="100" height="40" fill="${deep}"/>`;
      for (let k = 0; k < 6; k++) {
        const w = 40 - k * 6.2;
        s += `<rect x="${f(50 - w / 2)}" y="${f(63.5 + k * 5.6)}" width="${f(w)}" height="${f(2.4 - k * 0.25)}" rx="1" fill="${light}" opacity="${f(0.78 - k * 0.12)}"/>`;
      }
      s += `<rect y="59.6" width="100" height=".8" fill="${accent}"/>`;
      return s;
    }
    case 'bands': {
      // Tilted bands of colour, thick and thin.
      const bands: [number, number, string][] = [[6, 9, mid], [19, 3, light], [26, 13, mid], [43, 2, accent], [49, 7, light], [61, 4, mid], [69, 16, mid], [88, 1.6, accent], [92, 5, light]];
      let s = `<rect width="100" height="100" fill="${deep}"/><g transform="rotate(-14 50 50)">`;
      for (const [y, h, c] of bands) s += `<rect x="-30" y="${y}" width="160" height="${h}" fill="${c}"${c === mid ? ' opacity=".85"' : ''}/>`;
      return s + '</g>';
    }
    case 'arcs': {
      // Quarter arcs spreading from the lower left corner.
      let s = `<rect width="100" height="100" fill="${deep}"/>`;
      for (let k = 0; k < 9; k++) {
        const r = 16 + k * 11;
        const c = k === 5 ? accent : k % 2 ? light : mid;
        s += `<circle cx="0" cy="100" r="${r}" fill="none" stroke="${c}" stroke-width="${k === 5 ? 2.4 : 1.2 + (k % 3) * 0.6}" opacity="${k === 5 ? 1 : f(0.9 - k * 0.06)}"/>`;
      }
      return s;
    }
    case 'rings': {
      // Concentric rings slightly off centre, one of them lit.
      let s = `<rect width="100" height="100" fill="${deep}"/>`;
      for (let k = 1; k <= 8; k++) {
        const r = k * 5.4;
        s += `<circle cx="54" cy="47" r="${f(r)}" fill="none" stroke="${k === 5 ? accent : mid}" stroke-width="${k === 5 ? 2.2 : 1.1}" opacity="${k === 5 ? 1 : f(1 - k * 0.07)}"/>`;
      }
      s += `<circle cx="54" cy="47" r="2.4" fill="${light}"/>`;
      return s;
    }
    case 'waves': {
      // Stacked waves, each a different colour and phase.
      let s = `<rect width="100" height="100" fill="${deep}"/>`;
      const cols = [mid, accent, light, mid, accent, mid, light];
      cols.forEach((c, k) => {
        const y = 18 + k * 11;
        const a = 5 + (k % 3) * 1.6;
        const x0 = -12 + k * 3;
        s += `<path d="M${x0} ${y} q12.5 ${-a} 25 0 t25 0 t25 0 t25 0 t25 0" fill="none" stroke="${c}" stroke-width="3.2" stroke-linecap="round" opacity="${c === mid ? 0.9 : 1}"/>`;
      });
      return s;
    }
    case 'dots': {
      // A field of dots of many sizes on a pale ground, one of them in colour.
      let s = `<rect width="100" height="100" fill="${light}"/>`;
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const size = r === 2 && c === 4 ? 5.2 : 0.8 + rnd() * 2.8;
          s += `<circle cx="${f(11 + c * 13)}" cy="${f(11 + r * 13)}" r="${f(size)}" fill="${r === 2 && c === 4 ? accent : r > 4 ? deep : mid}"/>`;
        }
      }
      return s;
    }
    case 'grid': {
      // A tight grid of tiles, a few of them lit and one in colour.
      let s = `<rect width="100" height="100" fill="${deep}"/>`;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const lit = rnd() > 0.8;
          const one = r === 5 && c === 2;
          s += `<rect x="${f(7 + c * 11)}" y="${f(7 + r * 11)}" width="8.6" height="8.6" rx=".8" fill="${one ? accent : lit ? light : mid}" opacity="${one ? 1 : lit ? 0.55 : 0.9}"/>`;
        }
      }
      return s;
    }
    case 'sun': {
      // A big sun cut by horizontal bars, over a dark field.
      let s = `<rect width="100" height="100" fill="${mid}"/>`;
      s += `<circle cx="50" cy="46" r="27" fill="${accent}"/>`;
      for (let k = 0; k < 5; k++) s += `<rect y="${f(50 + k * 5.2)}" width="100" height="${f(1 + k * 0.55)}" fill="${mid}"/>`;
      s += `<rect y="74" width="100" height="26" fill="${deep}"/><rect y="74" width="100" height=".8" fill="${light}" opacity=".8"/>`;
      return s;
    }
  }
}

export function sleeveSvg(v: Vinyl): string {
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${motif(v)}</svg>`;
}

/** Linear-light value of one sRGB channel (0..255). */
const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** Roughly what covers the band across the middle of each motif (44–56% of the height), by share. */
function underStrip(v: Vinyl): [string, number][] {
  const [deep, mid, light, accent] = v.palette;
  switch (v.motif) {
    case 'horizon': return [[light, 0.37], [deep, 0.4], [mid, 0.23]];
    case 'bands': return [[mid, 0.45], [deep, 0.3], [light, 0.17], [accent, 0.08]];
    case 'arcs': return [[deep, 0.72], [mid, 0.14], [light, 0.1], [accent, 0.04]];
    case 'rings': return [[deep, 0.78], [mid, 0.17], [accent, 0.05]];
    case 'waves': return [[deep, 0.6], [mid, 0.2], [accent, 0.1], [light, 0.1]];
    case 'dots': return [[light, 0.86], [mid, 0.14]];
    case 'grid': return [[mid, 0.55], [deep, 0.3], [light, 0.15]];
    case 'sun': return [[accent, 0.5], [mid, 0.5]];
  }
}

/** Whether the sleeve is light or dark where the tear strip crosses it (relative luminance of the mix). */
export function stripTone(v: Vinyl): 'light' | 'dark' {
  let r = 0, g = 0, b = 0;
  for (const [hex, w] of underStrip(v)) {
    const [cr, cg, cb] = rgb(hex);
    r += lin(cr) * w; g += lin(cg) * w; b += lin(cb) * w;
  }
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.28 ? 'light' : 'dark';
}
