/**
 * Sketch s3/b, "Groove". The record in the middle of the carousel is pressed as a disc whose groove is
 * its words: one line of type that runs as a spiral from the rim to the label, track after track, with
 * the guests. A record with more on it gets a finer groove (smaller type, tighter pitch), as a real long
 * side does. In the run-out, where pressings carry small scratched notes, are his two.
 *
 * Scrolling plays it: the disc turns under a light that stays where it is. A hand can also spin it
 * (a spring that starts from the angle on screen and keeps the hand's velocity; physics.ts).
 */
import { vinyls, type Vinyl } from '@/data/music';
import covers from '@/data/music-covers.json';
import { Spring, VelocityTracker, clamp, project } from '@/components/music/v4/physics';
import { START } from '@/components/music/v4/start';
import { onPage } from '@/scripts/page';

const NS = 'http://www.w3.org/2000/svg';
const C = 500; // centre of the 1000-unit disc
const R_DISC = 496;
const R_OUTER = 470; // first line of the groove (baseline)
const R_INNER = 236; // where the words must have ended
const R_LOCK = 206; // the locked groove at the end of the lead-out
const R_LABEL = 160;
const R_ETCH = 184; // the run-out note, between the locked groove and the label
const PITCH = 1.42; // groove pitch, in multiples of the type size

const ETCHING = 'I play guitar and bass, not very well  ·  I make beats in my spare time, in FL Studio, with an Akai MPK Mini  ·  ';

const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text?: string) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
};

/** A spiral from radius r0 inwards at `pitch` units per turn, starting at the top and turning clockwise. */
function spiral(r0: number, r1: number, pitch: number, from = -90) {
  const turns = (r0 - r1) / pitch;
  if (turns <= 0) return 'M0 0';
  const steps = Math.max(8, Math.ceil(turns * 120)); // every 3 degrees
  let d = '';
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * turns;
    const a = ((from + t * 360) * Math.PI) / 180;
    const r = r0 - t * pitch;
    d += `${k ? 'L' : 'M'}${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`;
  }
  return d;
}
const circle = (r: number, from = -90) => {
  const a = (from * Math.PI) / 180, x = C + r * Math.cos(a), y = C + r * Math.sin(a);
  const xo = C - r * Math.cos(a), yo = C - r * Math.sin(a);
  return `M${x} ${y}A${r} ${r} 0 1 1 ${xo} ${yo}A${r} ${r} 0 1 1 ${x} ${y}`;
};

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
};

let uid = 0;

/** The words of one record, pressed: the groove, its type size worked out so they fill the side. */
function press(svg: SVGSVGElement, v: Vinyl): SVGGElement {
  const id = `s3b-${++uid}`;
  const g = el('g', { class: 's3b-face' });
  const label = (covers as Record<string, { label: string }>)[v.id]?.label ?? '#444';
  const lightLabel = lum(label) > 0.3;

  // The vinyl, its rim lit from above, and the matte run-out.
  g.append(
    el('circle', { cx: C, cy: C, r: R_DISC, class: 's3b-vinyl' }),
    el('circle', { cx: C, cy: C, r: R_LOCK + 6, class: 's3b-deadwax' }),
  );

  // The words in one run, measured at size 10 to find the size that fills the side.
  const text = el('text', { class: 's3b-groove-text', 'font-size': 10 });
  const tp = el('textPath', { href: `#${id}-path` });
  const runs: { t: string; cls: string; gap?: boolean }[] = [];
  v.tracks.forEach((t, i) => {
    runs.push({ t: `${i + 1}`, cls: 's3b-n', gap: i > 0 });
    if (typeof t === 'string') runs.push({ t: ` ${t}`, cls: 's3b-t' });
    else runs.push({ t: ` ${t.title}`, cls: 's3b-t' }, { t: ` with ${t.feat}`, cls: 's3b-f' });
  });
  for (const r of runs) tp.append(el('tspan', { class: r.cls }, r.t));
  text.append(tp);
  svg.append(text); // measured in place, then moved into the face
  const len10 = text.getComputedTextLength();
  const GAP = 3.2; // the smooth band between two tracks, in type sizes
  const gaps = runs.filter((r) => r.gap).length;
  // Length of a spiral from R_OUTER to R_INNER at pitch p ≈ π(R_OUTER² − R_INNER²)/p, and p = PITCH·f,
  // the words take len10·f/10 + gaps·GAP·f, less the lead-in (half a turn of empty groove).
  const area = Math.PI * (R_OUTER ** 2 - R_INNER ** 2);
  // A long side gets a fine groove; a short one is not blown up past a size that still reads as a groove.
  let f = Math.sqrt(area / (PITCH * (len10 / 10 + gaps * GAP)));
  f = clamp(f * 0.94, 12, 29);
  const pitch = PITCH * f;
  const lead = Math.PI * R_OUTER; // half a turn of lead-in
  // Where the words run out: the spiral's length after t turns is 2πt(R − pt/2).
  const words = lead + (len10 / 10) * f + gaps * GAP * f;
  const t = (R_OUTER - Math.sqrt(Math.max(0, R_OUTER ** 2 - (pitch * words) / Math.PI))) / pitch;
  const rEnd = Math.max(R_INNER - pitch, R_OUTER - pitch * t);

  text.setAttribute('font-size', f.toFixed(2));
  // Positive tracking at a small size, negative as it grows (§15).
  text.setAttribute('letter-spacing', `${(f < 18 ? 0.02 : f < 24 ? 0.008 : -0.006).toFixed(3)}em`);
  tp.setAttribute('startOffset', lead.toFixed(1));
  tp.querySelectorAll('tspan').forEach((s, k) => { if (runs[k]!.gap) s.setAttribute('dx', (GAP * f).toFixed(1)); });

  const path = el('path', { id: `${id}-path`, d: spiral(R_OUTER, R_INNER - pitch, pitch), fill: 'none' });
  // The groove itself, between the lines of type; after the words, the silent grooves to the end of
  // the side at a fine pitch, the lead-out, and the locked groove.
  const g0 = R_OUTER + pitch * 0.62;
  const g1 = rEnd - pitch * 0.38;
  const groove = el('path', { class: 's3b-groove', d: spiral(g0, g1, pitch) });
  const endAngle = -90 + (((g0 - g1) / pitch) * 360) % 360;
  const silent = el('path', { class: 's3b-groove s3b-silent', d: spiral(g1, R_INNER - 10, 5.5, endAngle) });
  const outAngle = endAngle + ((((g1 - (R_INNER - 10)) / 5.5) * 360) % 360);
  const leadOut = el('path', { class: 's3b-groove s3b-leadout', d: spiral(R_INNER - 10, R_LOCK, 14, outAngle) });
  const lock = el('circle', { class: 's3b-groove', cx: C, cy: C, r: R_LOCK, fill: 'none' });
  g.append(groove, silent, leadOut, lock, path, text);

  // The run-out note, scratched in.
  const etchPath = el('path', { id: `${id}-etch`, d: circle(R_ETCH, -150), fill: 'none' });
  const etch = el('text', { class: 's3b-etch', 'font-size': 15.5 });
  etch.append(el('textPath', { href: `#${id}-etch` }, ETCHING));
  g.append(etchPath, etch);

  // The label: the record's own colour, its words upright on it, the spindle hole.
  const lab = el('g', { class: lightLabel ? 's3b-label is-light' : 's3b-label' });
  lab.append(
    el('circle', { cx: C, cy: C, r: R_LABEL, fill: label }),
    el('circle', { cx: C, cy: C, r: R_LABEL, class: 's3b-label-shade' }),
  );
  const title = el('text', { x: C, y: C - 62, class: 's3b-label-title', 'text-anchor': 'middle' }, v.title);
  const artist = el('text', { x: C, y: C - 34, class: 's3b-label-artist', 'text-anchor': 'middle' }, v.artist);
  const meta = el('text', { x: C, y: C + 62, class: 's3b-label-meta', 'text-anchor': 'middle' }, `${v.year}  ·  ${v.format}`);
  const house = el('text', { x: C, y: C + 84, class: 's3b-label-meta', 'text-anchor': 'middle' }, v.label);
  lab.append(title, artist, meta, house, el('circle', { cx: C, cy: C, r: 7.5, class: 's3b-hole' }));
  g.append(lab);
  // A long title is set smaller to stay on the label.
  svg.append(g);
  const tw = title.getComputedTextLength();
  if (tw > 250) title.style.fontSize = `${Math.max(15, (30 * 250) / tw).toFixed(1)}px`;
  return g;
}

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('[data-s3b]');
  const page = document.querySelector<HTMLElement>('[data-music-page]');
  if (!root || !page) return;
  const disc = root.querySelector<HTMLElement>('[data-s3b-disc]')!;
  const spin = root.querySelector<HTMLElement>('[data-s3b-spin]')!;
  const svg = root.querySelector<SVGSVGElement>('[data-s3b-svg]')!;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  let face = press(svg, vinyls[START]!);
  let current = vinyls[START]!.id;

  // Another record comes to the middle above: this one is lifted off and the new one pressed in its
  // place. A cross-fade for the sketch.
  page.addEventListener('v4:centre', (e) => {
    const { id } = (e as CustomEvent<{ id: string }>).detail;
    if (id === current) return;
    current = id;
    const v = vinyls.find((x) => x.id === id);
    if (!v) return;
    const old = face;
    face = press(svg, v);
    face.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' }).finished.then(() => old.remove(), () => old.remove());
  }, { signal });

  /* The turn: what the scroll has played, plus what a hand has spun. */
  const hand = new Spring(0, { response: 0.8, damping: 1 }, 0.01);
  let raf = 0;
  let last = 0;
  let written = '';
  const played = () => {
    if (reduce.matches) return 0;
    const r = root.getBoundingClientRect();
    // One turn per 1.6 screens of scroll, upright at the moment it comes to rest on the screen: it turns
    // as it rises into view, and plays on from there.
    return (-r.top / (innerHeight * 1.6)) * 360;
  };
  const render = () => {
    const a = played() + hand.value;
    const t = `rotate(${a.toFixed(3)}deg)`;
    if (t !== written) { spin.style.transform = t; written = t; }
  };
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    const rest = dragging ? true : hand.step(dt);
    render();
    raf = rest ? 0 : requestAnimationFrame(frame);
    if (!raf) last = 0;
  };
  const tick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  addEventListener('scroll', () => render(), { passive: true, signal });
  addEventListener('resize', () => render(), { signal });
  signal.addEventListener('abort', () => cancelAnimationFrame(raf));
  render();

  /* A hand on the disc turns it 1:1 about its centre, from where it took hold. */
  let dragging = false;
  let pid = -1;
  let grab = 0; // pointer angle at grab, unwrapped as it goes round
  let base = 0;
  let prevA = 0;
  let total = 0;
  let sx = 0, sy = 0, decided = false;
  const tracker = new VelocityTracker();
  const angle = (e: PointerEvent) => {
    const r = disc.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };
  disc.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || reduce.matches) return;
    pid = e.pointerId; sx = e.clientX; sy = e.clientY;
    decided = e.pointerType === 'mouse';
    if (decided) begin(e);
  }, { signal });
  const begin = (e: PointerEvent) => {
    dragging = true;
    disc.setPointerCapture(e.pointerId);
    disc.classList.add('is-held');
    hand.set(hand.value); // caught where it is, mid-spin
    prevA = angle(e); grab = prevA; total = 0; base = hand.value;
    tracker.reset(0, e.timeStamp);
  };
  disc.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    if (!decided) {
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.hypot(dx, dy) < 10) return; // hysteresis: commit to a direction first
      decided = true;
      if (Math.abs(dx) < Math.abs(dy)) { pid = -1; return; } // a vertical swipe is the page's
      begin(e);
    }
    if (!dragging) return;
    const a = angle(e);
    let d = a - prevA;
    if (d > 180) d -= 360; else if (d < -180) d += 360;
    prevA = a; total += d;
    hand.set(base + total);
    tracker.push(total, e.timeStamp);
    tick();
  }, { signal });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== pid) return;
    pid = -1;
    if (!dragging) return;
    dragging = false;
    disc.classList.remove('is-held');
    // Let go, it carries on at the hand's speed and slows to where that throw would come to rest (§5, §6).
    const v = clamp(tracker.velocity(e.timeStamp), -2400, 2400);
    const D = project(v, 0.996);
    hand.to(hand.value + D, { velocity: v, damping: 1, response: clamp(Math.PI * Math.abs(D) / Math.max(1, Math.abs(v)), 0.4, 1.4) });
    tick();
  };
  disc.addEventListener('pointerup', end, { signal });
  disc.addEventListener('pointercancel', end, { signal });
});
