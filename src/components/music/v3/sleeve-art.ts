/**
 * Original sleeve art for the wall (Design 3): one abstract figure per record, drawn from its
 * palette and motif, plus the shrink-wrap's creases. Nothing here imitates a real cover. Ids are
 * prefixed `w3-<record>-` so the client can re-prefix a copy of a sleeve without clashing.
 */
import type { Vinyl } from '@/data/music-sleeves';

function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (x: number): string => String(Math.round(x * 100) / 100);

export function sleeveArt(v: Vinyl): string {
  const [deep, mid, light, accent] = v.palette;
  const id = `w3-${v.id}`;
  const r = rng(v.id);
  const defs: string[] = [];
  let body = '';

  switch (v.motif) {
    case 'horizon': {
      defs.push(`<linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${deep}"/><stop offset="1" stop-color="${mid}"/></linearGradient>`);
      defs.push(`<linearGradient id="${id}-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${deep}"/></linearGradient>`);
      defs.push(`<clipPath id="${id}-above"><rect width="100" height="62"/></clipPath>`);
      body += `<rect width="100" height="62" fill="url(#${id}-sky)"/>`;
      body += `<circle cx="50" cy="62" r="19" fill="${light}" clip-path="url(#${id}-above)"/>`;
      body += `<rect y="62" width="100" height="38" fill="url(#${id}-sea)"/>`;
      for (let i = 0; i < 10; i++) {
        const w = (19 - i * 1.5) * 2 * (0.7 + r() * 0.4);
        body += `<rect x="${n(50 - w / 2)}" y="${n(64.4 + i * 3.3)}" width="${n(w)}" height="1.1" rx=".55" fill="${light}" opacity="${n(0.8 - i * 0.065)}"/>`;
      }
      body += `<rect y="61.6" width="100" height=".5" fill="${light}" opacity=".35"/>`;
      break;
    }
    case 'bands': {
      body += `<circle cx="50" cy="20" r="6" fill="${light}" opacity=".85"/>`;
      let y = 34;
      const fills = [mid, light, mid, accent, mid, light, mid];
      let i = 0;
      while (y < 92) {
        const h = 2 + r() * 6.5;
        const fill = fills[i % fills.length]!;
        body += `<rect y="${n(y)}" width="100" height="${n(Math.min(h, 94 - y))}" fill="${fill}" opacity="${fill === light ? 0.75 : 0.95}"/>`;
        y += h + 1.4 + r() * 2;
        i++;
      }
      break;
    }
    case 'arcs': {
      for (let i = 0; i < 9; i++) {
        const R = 16 + i * 11;
        const stroke = i === 4 ? accent : i % 2 ? light : mid;
        const op = i === 4 ? 0.9 : i % 2 ? 0.35 : 0.9;
        body += `<path d="M0 ${n(100 - R)} A ${R} ${R} 0 0 1 ${R} 100" fill="none" stroke="${stroke}" stroke-opacity="${op}" stroke-width="${n(3.6 - i * 0.22)}"/>`;
      }
      body += `<circle cx="78" cy="22" r="3.2" fill="${light}" opacity=".9"/>`;
      break;
    }
    case 'rings': {
      for (let i = 0; i < 12; i++) {
        const R = 6 + i * 3.3;
        body += `<circle cx="50" cy="50" r="${n(R)}" fill="none" stroke="${mid === deep ? light : light}" stroke-opacity="${n(0.08 + r() * 0.16)}" stroke-width="${n(0.5 + r() * 0.6)}"/>`;
      }
      body += `<circle cx="50" cy="50" r="22.5" fill="none" stroke="${accent}" stroke-width="1.6"/>`;
      body += `<circle cx="50" cy="50" r="3" fill="${light}"/>`;
      break;
    }
    case 'waves': {
      const fills = [mid, accent, light, mid, deep];
      for (let i = 0; i < 5; i++) {
        const base = 40 + i * 10;
        const amp = 3 + r() * 3.5;
        const freq = 1.4 + r() * 1.4;
        const phase = r() * Math.PI * 2;
        let d = `M0 ${n(base)}`;
        for (let x = 0; x <= 100; x += 4) d += ` L${x} ${n(base + amp * Math.sin((x / 100) * Math.PI * 2 * freq + phase))}`;
        d += ' L100 100 L0 100 Z';
        body += `<path d="${d}" fill="${fills[i]}" opacity="${i === 4 ? 0.9 : 0.92}"/>`;
      }
      body += `<circle cx="72" cy="22" r="7" fill="${light}" opacity=".9"/>`;
      break;
    }
    case 'dots': {
      defs.push(`<linearGradient id="${id}-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${deep}"/><stop offset="1" stop-color="${mid}"/></linearGradient>`);
      body += `<rect width="100" height="100" fill="url(#${id}-g)"/>`;
      const cx = 38;
      const cy = 40;
      for (let gy = 0; gy < 9; gy++) {
        for (let gx = 0; gx < 9; gx++) {
          const x = 7 + gx * 10.75;
          const y = 7 + gy * 10.75;
          const d = Math.hypot(x - cx, y - cy);
          const rad = Math.max(0.5, 4.4 - d * 0.075);
          const hot = gx === 6 && gy === 6;
          body += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(hot ? 3.6 : rad)}" fill="${hot ? accent : light}" opacity="${hot ? 1 : n(0.55 + rad * 0.09)}"/>`;
        }
      }
      break;
    }
    case 'grid': {
      defs.push(`<linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mid}"/><stop offset="1" stop-color="${deep}"/></linearGradient>`);
      body += `<rect width="100" height="100" fill="url(#${id}-g)"/>`;
      const accentAt = 14;
      for (let gy = 0; gy < 6; gy++) {
        for (let gx = 0; gx < 6; gx++) {
          const k = gy * 6 + gx;
          const x = 8.25 + gx * 14.5;
          const y = 8.25 + gy * 14.5;
          const lit = r() < 0.22;
          const fill = k === accentAt ? accent : lit ? light : light;
          const op = k === accentAt ? 1 : lit ? 0.75 : 0.12;
          body += `<rect x="${n(x)}" y="${n(y)}" width="11" height="11" rx="1.6" fill="${fill}" opacity="${op}"/>`;
        }
      }
      break;
    }
    case 'sun': {
      defs.push(`<linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${deep}"/><stop offset="1" stop-color="${mid}"/></linearGradient>`);
      body += `<rect width="100" height="74" fill="url(#${id}-sky)"/>`;
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const r0 = 27;
        const r1 = 30 + r() * 12;
        body += `<line x1="${n(50 + Math.cos(a) * r0)}" y1="${n(42 + Math.sin(a) * r0)}" x2="${n(50 + Math.cos(a) * r1)}" y2="${n(42 + Math.sin(a) * r1)}" stroke="${light}" stroke-opacity=".55" stroke-width=".8" stroke-linecap="round"/>`;
      }
      body += `<circle cx="50" cy="42" r="23" fill="${accent}"/>`;
      defs.push(`<linearGradient id="${id}-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mid}"/><stop offset="1" stop-color="${deep}"/></linearGradient>`);
      body += `<rect y="74" width="100" height="26" fill="url(#${id}-ground)"/>`;
      body += `<rect y="74" width="100" height=".8" fill="${light}" opacity=".55"/>`;
      break;
    }
  }

  // Ring wear (the disc inside pressing through the card) and a vignette.
  defs.push(`<radialGradient id="${id}-vig" cx="50%" cy="45%" r="75%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></radialGradient>`);
  const wear = `<circle cx="50" cy="50" r="45.5" fill="none" stroke="${light}" stroke-opacity=".07" stroke-width="1.4"/><circle cx="50" cy="50" r="7" fill="none" stroke="${light}" stroke-opacity=".05" stroke-width=".8"/>`;
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs>${defs.join('')}</defs><rect width="100" height="100" fill="${deep}"/>${body}${wear}<rect width="100" height="100" fill="url(#${id}-vig)"/></svg>`;
}

/** The creases of the shrink-wrap: gathered at the corners, a couple of long faint folds. */
export function crinkleArt(seed: string): string {
  const r = rng(`${seed}-wrap`);
  let paths = '';
  const corners: [number, number, number, number][] = [
    [0, 0, 1, 1],
    [100, 0, -1, 1],
    [100, 100, -1, -1],
    [0, 100, 1, -1],
  ];
  for (const [x, y, sx, sy] of corners) {
    const count = 2 + Math.floor(r() * 2);
    for (let i = 0; i < count; i++) {
      const a = 0.2 + r() * 1.15; // spread around the diagonal
      const len = 2.5 + r() * 5;
      const x0 = x + sx * (0.8 + r() * 2);
      const y0 = y + sy * (0.8 + r() * 2);
      const x1 = x0 + sx * Math.cos(a) * len;
      const y1 = y0 + sy * Math.sin(a) * len;
      const qx = (x0 + x1) / 2 + (r() - 0.5) * 3;
      const qy = (y0 + y1) / 2 + (r() - 0.5) * 3;
      paths += `<path d="M${n(x0)} ${n(y0)} Q${n(qx)} ${n(qy)} ${n(x1)} ${n(y1)}" stroke="#fff" stroke-opacity="${n(0.1 + r() * 0.12)}" stroke-width=".3"/>`;
    }
  }
  for (let i = 0; i < 2; i++) {
    const x0 = 10 + r() * 30;
    const y0 = r() < 0.5 ? -2 : 20 + r() * 40;
    const x1 = x0 + 30 + r() * 50;
    const y1 = y0 + 40 + r() * 50;
    paths += `<path d="M${n(x0)} ${n(y0)} L${n(x1)} ${n(y1)}" stroke="#fff" stroke-opacity=".07" stroke-width=".55"/>`;
    paths += `<path d="M${n(x0 + 0.7)} ${n(y0)} L${n(x1 + 0.7)} ${n(y1)}" stroke="#000" stroke-opacity=".08" stroke-width=".5"/>`;
  }
  return `<svg class="v3-wrap__crinkle" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false" fill="none" stroke-linecap="round">${paths}</svg>`;
}

/** Ink for the hype sticker on a given accent. */
export function stickerInk(hex: string): string {
  const c = hex.replace('#', '');
  const [rr, gg, bb] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255) as [number, number, number];
  const lum = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
  return lum > 0.45 ? '#141414' : '#fff';
}
