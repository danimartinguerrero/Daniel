/**
 * Original sleeve art for each record, drawn from its palette and motif: simple abstract figures,
 * not the albums' real covers. Returns SVG markup (viewBox 0 0 100 100) for set:html.
 */
import type { Vinyl } from '@/data/music-sleeves';

const f = (n: number) => Number(n.toFixed(2));

export function sleeveSvg(v: Vinyl): string {
  const [deep, mid, light, accent] = v.palette;
  const id = `v1-${v.id}`;
  let art = '';
  switch (v.motif) {
    case 'horizon': {
      // A low sun on the horizon, its reflection broken into lines on the water.
      art += `<defs><linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${deep}"/><stop offset="1" stop-color="${mid}"/></linearGradient></defs>`;
      art += `<rect width="100" height="62" fill="url(#${id}-sky)"/>`;
      art += `<circle cx="50" cy="62" r="19" fill="${light}"/>`;
      art += `<rect y="62" width="100" height="38" fill="${accent}"/>`;
      for (let i = 0; i < 9; i++) {
        const y = 64.5 + i * 3.9;
        const w = 34 - i * 3.2;
        art += `<rect x="${f(50 - w / 2)}" y="${f(y)}" width="${f(w)}" height="${f(1.3 - i * 0.07)}" rx="0.6" fill="${light}" opacity="${f(0.85 - i * 0.07)}"/>`;
      }
      break;
    }
    case 'bands': {
      art += `<rect width="100" height="100" fill="${deep}"/>`;
      const bands: [number, number, string][] = [[34, 14, mid], [50, 3, light], [55.5, 9, accent], [66.5, 1.4, light], [70, 18, mid], [90, 2.2, light]];
      for (const [y, h, c] of bands) art += `<rect y="${y}" width="100" height="${h}" fill="${c}"/>`;
      art += `<rect x="12" y="12" width="9" height="9" fill="${light}"/>`;
      break;
    }
    case 'arcs': {
      art += `<rect width="100" height="100" fill="${deep}"/>`;
      for (let i = 0; i < 9; i++) {
        const r = 22 + i * 10;
        const c = i === 4 ? accent : i % 2 ? light : mid;
        art += `<path d="M ${f(-2)} ${f(102 - r)} A ${r} ${r} 0 0 1 ${f(r - 2)} 102" fill="none" stroke="${c}" stroke-width="${i === 4 ? 2.6 : 1.4}" opacity="${i === 4 ? 1 : f(0.9 - i * 0.07)}"/>`;
      }
      break;
    }
    case 'rings': {
      art += `<rect width="100" height="100" fill="${deep}"/>`;
      for (let i = 0; i < 14; i++) {
        const r = 5 + i * 3.4;
        const c = i === 6 ? accent : i % 3 === 0 ? light : mid;
        art += `<circle cx="50" cy="50" r="${f(r)}" fill="none" stroke="${c}" stroke-width="${i === 6 ? 1.8 : 0.7}" opacity="${i === 6 ? 1 : f(0.95 - i * 0.045)}"/>`;
      }
      break;
    }
    case 'waves': {
      art += `<rect width="100" height="100" fill="${deep}"/>`;
      const cols = [mid, accent, light, mid, accent];
      for (let i = 0; i < 5; i++) {
        const y0 = 30 + i * 13;
        let d = `M 0 ${y0}`;
        for (let x = 0; x <= 100; x += 5) d += ` L ${x} ${f(y0 + Math.sin((x / 100) * Math.PI * 2 + i * 0.9) * (4 + i))}`;
        d += ' L 100 100 L 0 100 Z';
        art += `<path d="${d}" fill="${cols[i]}" opacity="${f(0.55 + i * 0.1)}"/>`;
      }
      break;
    }
    case 'dots': {
      art += `<rect width="100" height="100" fill="${deep}"/>`;
      for (let y = 0; y < 11; y++) {
        for (let x = 0; x < 11; x++) {
          const cx = 5 + x * 9, cy = 5 + y * 9;
          const dist = Math.hypot(cx - 30, cy - 68);
          const r = Math.max(0.5, 3.6 - dist * 0.045);
          art += `<circle cx="${cx}" cy="${cy}" r="${f(r)}" fill="${light}" opacity="0.88"/>`;
        }
      }
      art += `<circle cx="77" cy="23" r="11" fill="${accent}"/>`;
      art += `<circle cx="77" cy="23" r="11" fill="none" stroke="${mid}" stroke-width="0.8" opacity="0.6"/>`;
      break;
    }
    case 'grid': {
      art += `<rect width="100" height="100" fill="${deep}"/>`;
      for (let y = 0; y < 6; y++) {
        for (let x = 0; x < 6; x++) {
          const lit = (x * 7 + y * 3) % 5 === 0;
          const isAccent = x === 3 && y === 2;
          art += `<rect x="${12 + x * 13}" y="${12 + y * 13}" width="11" height="11" rx="0.8" fill="${isAccent ? accent : lit ? light : mid}" opacity="${isAccent ? 1 : lit ? 0.75 : 0.9}"/>`;
        }
      }
      break;
    }
    case 'sun': {
      art += `<rect width="100" height="100" fill="${deep}"/>`;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        art += `<line x1="${f(50 + Math.cos(a) * 21)}" y1="${f(40 + Math.sin(a) * 21)}" x2="${f(50 + Math.cos(a) * 70)}" y2="${f(40 + Math.sin(a) * 70)}" stroke="${light}" stroke-width="0.6" opacity="0.32"/>`;
      }
      art += `<circle cx="50" cy="40" r="16" fill="${accent}"/>`;
      art += `<rect y="76" width="100" height="24" fill="${mid}"/>`;
      art += `<rect y="76" width="100" height="1.2" fill="${light}" opacity="0.7"/>`;
      break;
    }
  }
  return `<svg class="v1-art" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${art}</svg>`;
}
