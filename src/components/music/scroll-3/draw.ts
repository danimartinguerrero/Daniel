/**
 * Music, way scroll-3: the instruments, drawn from above, as SVG symbols. The camera that rose over the
 * ring of records keeps looking down as the page goes on, so each instrument lies flat under it.
 *
 * The guitar, the bass and the piano are drawn at one scale (U units to the millimetre) from real
 * measurements, so they compare as they would on a floor: a guitar's 648 mm scale and a bass's 864 mm,
 * frets placed by the twelfth root of two, string gauges of common sets, a piano's 23.5 mm white keys
 * with its black keys spaced the way pianos space them. The controller is drawn from its layout (a
 * thumbstick, a small display and buttons, eight pads, eight knobs, twenty-five keys), with no logo.
 * Everything here runs when the page is built; the browser only receives the SVG.
 */
const U = 4; // units per mm
const f = (n: number) => +n.toFixed(1);

/** A little deterministic noise, so the wood's grain is the same on every build. */
function noise(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export const NECK_W = 1760;
export const NECK_H = 290;

interface Neck {
  id: string;
  /** Scale length, nut to bridge, in mm. */
  scale: number;
  /** Fingerboard width at the nut and at the 12th fret, mm. */
  nut: number;
  twelfth: number;
  /** Outer strings' spread at the nut and at the bridge, mm. */
  spreadNut: number;
  spreadBridge: number;
  /** Gauges, thinnest first (drawn at the top, as in tablature), mm; wound from `woundFrom` on. */
  gauges: number[];
  woundFrom: number;
  inlay: number; // dot radius, mm
}

const NUT_X = 30; // the headstock's last bit, left of the nut
const NUT_W = 3.2 * U;

function neck(n: Neck) {
  const cy = NECK_H / 2;
  const x0 = NUT_X + NUT_W; // the nut's playing edge: fret positions are measured from here
  const half = (xmm: number) => ((n.nut + ((n.twelfth - n.nut) * xmm) / (n.scale / 2)) * U) / 2;
  const endMm = (NECK_W - x0) / U;
  const fretX = (k: number) => x0 + n.scale * (1 - 2 ** (-k / 12)) * U;
  const frets: number[] = [];
  for (let k = 1; fretX(k) < NECK_W + 20; k++) frets.push(fretX(k));
  const id = n.id;
  const parts: string[] = [];

  // The headstock, the board, its grain.
  parts.push(`<rect x="0" y="${f(cy - half(0) - 6)}" width="${NUT_X + 2}" height="${f(2 * half(0) + 12)}" fill="url(#${id}-head)"/>`);
  parts.push(`<path d="M${x0} ${f(cy - half(0))} L${NECK_W} ${f(cy - half(endMm))} L${NECK_W} ${f(cy + half(endMm))} L${x0} ${f(cy + half(0))} Z" fill="url(#${id}-board)"/>`);
  const r = noise(n.scale);
  for (let i = 0; i < 26; i++) {
    const t = r() * 2 - 1;
    const y0 = cy + t * half(0) * 0.96, y1 = cy + t * half(endMm) * 0.96 + (r() - 0.5) * 6;
    parts.push(`<path d="M${x0} ${f(y0)} C${f(NECK_W * 0.35)} ${f(y0 + (r() - 0.5) * 8)} ${f(NECK_W * 0.7)} ${f(y1 + (r() - 0.5) * 8)} ${NECK_W} ${f(y1)}" stroke="${r() > 0.5 ? '#5a3f2e' : '#160e0a'}" stroke-width="${f(0.6 + r() * 1.6)}" opacity="${f(0.18 + r() * 0.3)}" fill="none"/>`);
  }
  // The board's edges catch a little light.
  parts.push(`<path d="M${x0} ${f(cy - half(0) + 1)} L${NECK_W} ${f(cy - half(endMm) + 1)}" stroke="#6b4c39" stroke-width="2" opacity="0.6"/>`);
  parts.push(`<path d="M${x0} ${f(cy + half(0) - 1)} L${NECK_W} ${f(cy + half(endMm) - 1)}" stroke="#000" stroke-width="3" opacity="0.5"/>`);

  // Dots: 3, 5, 7, 9, two at 12, then 15, 17, 19, 21.
  const dots = [3, 5, 7, 9, 12, 15, 17, 19, 21];
  for (const k of dots) {
    const a = k === 1 ? x0 : fretX(k - 1), b = fretX(k);
    if (b > NECK_W + 30) break;
    const x = (a + b) / 2, h = half((x - x0) / U);
    const rr = n.inlay * U;
    const ys = k === 12 ? [cy - h * 0.42, cy + h * 0.42] : [cy];
    for (const y of ys) parts.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(rr)}" fill="url(#${id}-pearl)"/>`);
  }

  // Frets: nickel silver wire, lit along its crown, with its shadow on the board.
  for (const x of frets) {
    const h = half((x - x0) / U) + 1;
    parts.push(`<rect x="${f(x + 4)}" y="${f(cy - h)}" width="5" height="${f(2 * h)}" fill="#000" opacity="0.42"/>`);
    parts.push(`<rect x="${f(x - 4.5)}" y="${f(cy - h)}" width="9" height="${f(2 * h)}" rx="2" fill="url(#${id}-fret)"/>`);
  }
  // The nut, bone.
  parts.push(`<rect x="${NUT_X}" y="${f(cy - half(0) - 2)}" width="${NUT_W}" height="${f(2 * half(0) + 4)}" rx="2" fill="url(#${id}-nut)"/>`);

  // Strings: their shadows on the board first, then the strings, then the light along each.
  const strings = n.gauges.map((g, i) => {
    const t = i / (n.gauges.length - 1) - 0.5;
    const yAt = (xmm: number) => cy + t * (n.spreadNut + ((n.spreadBridge - n.spreadNut) * xmm) / n.scale) * U;
    return { g: g * U, wound: i >= n.woundFrom, ya: yAt(0), yb: yAt(endMm) };
  });
  for (const s of strings) parts.push(`<path d="M${NUT_X} ${f(s.ya + 3.5)} L${NECK_W} ${f(s.yb + 5)}" stroke="#000" stroke-width="${f(s.g + 2.5)}" opacity="0.5" stroke-linecap="round"/>`);
  for (const s of strings) {
    parts.push(`<path d="M${NUT_X} ${f(s.ya)} L${NECK_W} ${f(s.yb)}" stroke="${s.wound ? '#8a8c90' : '#a9acb1'}" stroke-width="${f(s.g)}"/>`);
    // A wound string's windings: fine dark marks across it.
    if (s.wound) parts.push(`<path d="M${NUT_X} ${f(s.ya)} L${NECK_W} ${f(s.yb)}" stroke="#3f4144" stroke-width="${f(s.g)}" stroke-dasharray="1.1 ${f(Math.max(1.6, s.g * 0.42))}" opacity="0.55"/>`);
    parts.push(`<path d="M${NUT_X} ${f(s.ya - s.g * 0.18)} L${NECK_W} ${f(s.yb - s.g * 0.18)}" stroke="#f4f5f7" stroke-width="${f(Math.max(0.6, s.g * 0.32))}" opacity="${s.wound ? 0.55 : 0.85}"/>`);
  }

  const defs = `
    <linearGradient id="${id}-board" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1b13"/><stop offset="0.5" stop-color="#3b281d"/><stop offset="1" stop-color="#22160f"/></linearGradient>
    <linearGradient id="${id}-head" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#140d09"/><stop offset="1" stop-color="#2a1c14"/></linearGradient>
    <linearGradient id="${id}-fret" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#55575b"/><stop offset="0.45" stop-color="#e9eaec"/><stop offset="0.6" stop-color="#c3c5c9"/><stop offset="1" stop-color="#4a4c50"/></linearGradient>
    <linearGradient id="${id}-nut" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cfc6b2"/><stop offset="0.5" stop-color="#efe9dc"/><stop offset="1" stop-color="#b9b09c"/></linearGradient>
    <radialGradient id="${id}-pearl" cx="0.38" cy="0.35" r="0.75"><stop offset="0" stop-color="#f4f1ea"/><stop offset="0.6" stop-color="#cfcabf"/><stop offset="1" stop-color="#9c978d"/></radialGradient>`;
  return `<symbol id="${id}" viewBox="0 0 ${NECK_W} ${NECK_H}"><defs>${defs}</defs>${parts.join('')}</symbol>`;
}

export const guitar = () => neck({
  id: 's3-guitar', scale: 648, nut: 43, twelfth: 52,
  spreadNut: 35, spreadBridge: 52.5,
  gauges: [0.25, 0.33, 0.43, 0.66, 0.91, 1.17], woundFrom: 3, inlay: 3,
});
export const bass = () => neck({
  id: 's3-bass', scale: 864, nut: 41.3, twelfth: 54,
  spreadNut: 30, spreadBridge: 57,
  gauges: [1.14, 1.65, 2.16, 2.67], woundFrom: 0, inlay: 3.4,
});

/* ------------------------------------------------------------------------------------------- piano */
export const PIANO_W = 1760;
export const PIANO_H = 640;

export function piano() {
  const W = 23.5 * U, top = 40, len = 150 * U, bLen = 95 * U;
  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${PIANO_W}" height="${PIANO_H}" fill="#060606"/>`);
  parts.push(`<rect x="0" y="0" width="${PIANO_W}" height="${top}" fill="url(#s3-p-board)"/>`);
  const whites = Math.ceil(PIANO_W / W) + 1;
  for (let i = 0; i < whites; i++) {
    const x = i * W;
    parts.push(`<rect x="${f(x + 1.6)}" y="${top}" width="${f(W - 3.2)}" height="${len}" rx="5" fill="url(#s3-p-white)"/>`);
    parts.push(`<rect x="${f(x + 1.6)}" y="${top + len - 22}" width="${f(W - 3.2)}" height="22" rx="5" fill="url(#s3-p-lip)"/>`);
  }
  // Black keys: C to E split in five, F to B in seven; a black key takes the 2nd and 4th (and 6th).
  const octave = 7 * W;
  const blacks: [number, number][] = [];
  const ce = (3 * W) / 5, fb = (4 * W) / 7;
  for (let o = 0; o * octave < PIANO_W + octave; o++) {
    const b = o * octave;
    blacks.push([b + ce, ce], [b + 3 * ce, ce], [b + 3 * W + fb, fb], [b + 3 * W + 3 * fb, fb], [b + 3 * W + 5 * fb, fb]);
  }
  for (const [x, w] of blacks) {
    if (x > PIANO_W) continue;
    parts.push(`<rect x="${f(x + 5)}" y="${top}" width="${f(w)}" height="${bLen + 8}" rx="4" fill="#000" opacity="0.45"/>`);
    parts.push(`<rect x="${f(x)}" y="${top}" width="${f(w)}" height="${bLen}" rx="4" fill="url(#s3-p-black)"/>`);
    parts.push(`<rect x="${f(x + 5)}" y="${top}" width="${f(w - 10)}" height="${bLen - 34}" rx="3" fill="url(#s3-p-blacktop)"/>`);
  }
  // The room's one low lamp, as over the records: the keys fall off into the dark away from it.
  parts.push(`<rect x="0" y="0" width="${PIANO_W}" height="${PIANO_H}" fill="url(#s3-p-lamp)"/>`);
  const defs = `
    <radialGradient id="s3-p-lamp" gradientUnits="userSpaceOnUse" cx="${PIANO_W * 0.3}" cy="${PIANO_H * 0.3}" r="${PIANO_W * 0.75}" gradientTransform="translate(${PIANO_W * 0.3} ${PIANO_H * 0.3}) scale(1 0.7) translate(${-PIANO_W * 0.3} ${-PIANO_H * 0.3})"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="0.45" stop-color="#000" stop-opacity="0.14"/><stop offset="1" stop-color="#000" stop-opacity="0.7"/></radialGradient>
    <linearGradient id="s3-p-board" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1a1b"/><stop offset="0.8" stop-color="#0c0c0d"/><stop offset="1" stop-color="#000"/></linearGradient>
    <linearGradient id="s3-p-white" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bdbab2"/><stop offset="0.14" stop-color="#dcd9d1"/><stop offset="0.9" stop-color="#e8e5de"/><stop offset="1" stop-color="#d3cfc7"/></linearGradient>
    <linearGradient id="s3-p-lip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eeebe5"/><stop offset="1" stop-color="#b9b5ac"/></linearGradient>
    <linearGradient id="s3-p-black" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050505"/><stop offset="0.75" stop-color="#151516"/><stop offset="1" stop-color="#2c2c2e"/></linearGradient>
    <linearGradient id="s3-p-blacktop" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1c1c1e"/><stop offset="0.5" stop-color="#2a2a2c"/><stop offset="1" stop-color="#18181a"/></linearGradient>`;
  return `<symbol id="s3-piano" viewBox="0 0 ${PIANO_W} ${PIANO_H}"><defs>${defs}</defs>${parts.join('')}</symbol>`;
}

/* -------------------------------------------------------------------------------------- controller */
export const MPK_W = 1268;
export const MPK_H = 724;

export function controller() {
  const parts: string[] = [];
  parts.push(`<rect x="0" y="6" width="${MPK_W}" height="${MPK_H - 6}" rx="30" fill="#000" opacity="0.6"/>`);
  parts.push(`<rect x="0" y="0" width="${MPK_W}" height="${MPK_H - 8}" rx="30" fill="url(#s3-m-body)"/>`);
  parts.push(`<rect x="1" y="1" width="${MPK_W - 2}" height="${MPK_H - 10}" rx="29" fill="none" stroke="#3a3a3d" stroke-width="2"/>`);

  // The thumbstick, the display, the buttons.
  parts.push(`<circle cx="118" cy="128" r="64" fill="#0d0d0e"/><circle cx="118" cy="128" r="64" fill="none" stroke="#2c2c2f" stroke-width="2"/>`);
  parts.push(`<circle cx="120" cy="132" r="34" fill="#000" opacity="0.5"/><circle cx="118" cy="128" r="33" fill="url(#s3-m-stick)"/>`);
  parts.push(`<rect x="208" y="78" width="96" height="62" rx="6" fill="#050506"/><rect x="214" y="84" width="84" height="20" rx="3" fill="#ffffff" opacity="0.05"/>`);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
    const x = 50 + col * 88, y = 218 + row * 50;
    parts.push(`<rect x="${x}" y="${y + 3}" width="72" height="34" rx="9" fill="#000" opacity="0.5"/><rect x="${x}" y="${y}" width="72" height="34" rx="9" fill="url(#s3-m-button)"/>`);
  }

  // Eight pads, two rows of four.
  for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
    const x = 340 + col * 118, y = 70 + row * 118;
    parts.push(`<rect x="${x + 2}" y="${y + 5}" width="104" height="104" rx="12" fill="#000" opacity="0.55"/>`);
    parts.push(`<rect x="${x}" y="${y}" width="104" height="104" rx="12" fill="url(#s3-m-pad)"/>`);
    parts.push(`<rect x="${x + 1}" y="${y + 1}" width="102" height="102" rx="11" fill="none" stroke="#6a6a6e" stroke-width="1.5" opacity="0.5"/>`);
  }

  // Eight knobs, two rows of four, each turned somewhere else.
  const turns = [-130, -60, 0, 75, -100, 20, 120, -20];
  for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
    const cx = 876 + col * 110, cy = 128 + row * 116, a = (turns[row * 4 + col]! * Math.PI) / 180;
    parts.push(`<circle cx="${cx + 2}" cy="${cy + 5}" r="38" fill="#000" opacity="0.55"/>`);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="38" fill="url(#s3-m-knob)"/><circle cx="${cx}" cy="${cy}" r="37" fill="none" stroke="#4a4a4e" stroke-width="2"/>`);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="27" fill="url(#s3-m-knobtop)"/>`);
    parts.push(`<path d="M${f(cx + Math.sin(a) * 8)} ${f(cy - Math.cos(a) * 8)} L${f(cx + Math.sin(a) * 25)} ${f(cy - Math.cos(a) * 25)}" stroke="#ecebe8" stroke-width="4" stroke-linecap="round"/>`);
  }

  // Twenty-five keys, C to C.
  const kx = 40, ky = 368, kw = 1188, kh = 316, w = kw / 15;
  parts.push(`<rect x="${kx - 8}" y="${ky - 10}" width="${kw + 16}" height="${kh + 18}" rx="8" fill="#060607"/>`);
  for (let i = 0; i < 15; i++) {
    const x = kx + i * w;
    parts.push(`<rect x="${f(x + 1.5)}" y="${ky}" width="${f(w - 3)}" height="${kh}" rx="5" fill="url(#s3-p-white)"/>`);
    parts.push(`<rect x="${f(x + 1.5)}" y="${ky + kh - 16}" width="${f(w - 3)}" height="16" rx="5" fill="url(#s3-p-lip)"/>`);
  }
  const ce = (3 * w) / 5, fb = (4 * w) / 7;
  for (let o = 0; o < 2; o++) {
    const b = kx + o * 7 * w;
    for (const [x, bw] of [[b + ce, ce], [b + 3 * ce, ce], [b + 3 * w + fb, fb], [b + 3 * w + 3 * fb, fb], [b + 3 * w + 5 * fb, fb]] as const) {
      parts.push(`<rect x="${f(x + 4)}" y="${ky}" width="${f(bw)}" height="198" rx="4" fill="#000" opacity="0.45"/>`);
      parts.push(`<rect x="${f(x)}" y="${ky}" width="${f(bw)}" height="192" rx="4" fill="url(#s3-p-black)"/>`);
      parts.push(`<rect x="${f(x + 4)}" y="${ky}" width="${f(bw - 8)}" height="164" rx="3" fill="url(#s3-p-blacktop)"/>`);
    }
  }
  const defs = `
    <linearGradient id="s3-m-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2a2d"/><stop offset="0.5" stop-color="#1e1e20"/><stop offset="1" stop-color="#161618"/></linearGradient>
    <radialGradient id="s3-m-stick" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stop-color="#4a4a4e"/><stop offset="1" stop-color="#18181a"/></radialGradient>
    <linearGradient id="s3-m-button" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#434346"/><stop offset="1" stop-color="#2a2a2d"/></linearGradient>
    <linearGradient id="s3-m-pad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a5a5e"/><stop offset="1" stop-color="#3c3c40"/></linearGradient>
    <radialGradient id="s3-m-knob" cx="0.45" cy="0.35" r="0.7"><stop offset="0" stop-color="#2e2e31"/><stop offset="1" stop-color="#0e0e10"/></radialGradient>
    <radialGradient id="s3-m-knobtop" cx="0.4" cy="0.3" r="0.8"><stop offset="0" stop-color="#3a3a3e"/><stop offset="1" stop-color="#151517"/></radialGradient>`;
  return `<symbol id="s3-controller" viewBox="0 0 ${MPK_W} ${MPK_H}"><defs>${defs}</defs>${parts.join('')}</symbol>`;
}
