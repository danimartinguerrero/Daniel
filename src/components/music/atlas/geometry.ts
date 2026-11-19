/**
 * Music, way "atlas": the shape of the threads, shared by the page as it is built (the still map shown
 * with reduced motion or without the script) and by the script that draws them over the ring.
 *
 * A thread is tied to the inner edge of each sleeve and bows in towards the middle of the ring, so it
 * never crosses a sleeve. Where a sleeve has several threads they are tied side by side along its edge,
 * in the order their other ends lie round the ring, so none of them cross where they leave it.
 */
import { vinyls } from '@/data/music';
import covers from '@/data/music-covers.json';
import { routes, type Thread } from './routes';

export interface Pt { x: number; y: number }
/** A quadratic curve: from `a`, pulled towards `c`, to `b`. */
export interface Quad { a: Pt; c: Pt; b: Pt }

export const n = vinyls.length;
export const indexOf = (id: string) => {
  const i = vinyls.findIndex((v) => v.id === id);
  if (i < 0) throw new Error(`atlas: no record "${id}"`);
  return i;
};
/** A distance in records, the short way round the ring: -n/2..n/2. */
export const around = (d: number) => d - n * Math.round(d / n);

export interface AtlasThread extends Thread {
  key: string;
  route: number;
  /** Its place among its route's threads, and how many there are. */
  step: number;
  steps: number;
  fromIndex: number;
  toIndex: number;
  /** Where it is tied along each sleeve's edge: -1..1 of the room there is, 0 the middle. */
  fromSlot: number;
  toSlot: number;
  /** Its colour at each end: the colour of that record's disc label, lit by the lamp. */
  fromColour: string;
  toColour: string;
  /** How far it bows in towards the centre: neighbours more, so a short thread still has room for
      its name; across the ring hardly at all. */
  pull: number;
}

const LAMP = '#fff3e6';
/** `hex` taken `amount` of the way towards `to`. */
export function mix(hex: string, to = LAMP, amount = 0.5) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [p(hex), p(to)];
  return `#${a.map((v, i) => Math.round(v + (b[i]! - v) * amount).toString(16).padStart(2, '0')).join('')}`;
}
const labelColour = (id: string) => (covers as Record<string, { label: string }>)[id]?.label ?? '#86868b';

/** Every thread, in the order they are drawn, with where each is tied. */
export const threads: readonly AtlasThread[] = (() => {
  const list = routes.flatMap((route, r) => route.threads.map((t, step) => ({
    ...t,
    key: `${route.id}-${step}`,
    route: r,
    step,
    steps: route.threads.length,
    fromIndex: indexOf(t.from),
    toIndex: indexOf(t.to),
    fromSlot: 0,
    toSlot: 0,
    fromColour: mix(labelColour(t.from), LAMP, 0.42),
    toColour: mix(labelColour(t.to), LAMP, 0.42),
    pull: 0.5 + 0.3 * (1 - (Math.abs(around(indexOf(t.to) - indexOf(t.from))) - 1) / (n / 2 - 1)),
  })));
  // The threads tied to each sleeve, in the order their other ends lie round the ring from it.
  for (let i = 0; i < n; i++) {
    const ends = list.flatMap((t) => [
      ...(t.fromIndex === i ? [{ t, end: 'from' as const, d: around(t.toIndex - i) }] : []),
      ...(t.toIndex === i ? [{ t, end: 'to' as const, d: around(t.fromIndex - i) }] : []),
    ]).sort((p, q) => p.d - q.d);
    ends.forEach((e, k) => {
      const slot = ends.length < 2 ? 0 : (k / (ends.length - 1)) * 2 - 1;
      if (e.end === 'from') e.t.fromSlot = slot;
      else e.t.toSlot = slot;
    });
  }
  return list;
})();

/** Which records a thread touches, for each record: itself and the ones it is tied to. */
export const ties: readonly (readonly number[])[] = vinyls.map((_, i) => [
  i,
  ...threads.filter((t) => t.fromIndex === i).map((t) => t.toIndex),
  ...threads.filter((t) => t.toIndex === i).map((t) => t.fromIndex),
]);

/**
 * Where a thread is tied, on the floor, in the ring's own units (the ring's centre at 0, `across` to the
 * right, `toward` towards you), for a record `d` places round from the front. `r` is the radius of the
 * sleeves' inner edges; `spread` how far apart the outermost threads on one edge are tied.
 */
export function tie(d: number, slot: number, r: number, spread: number) {
  const th = (d * 2 * Math.PI) / n;
  const o = (slot * spread) / 2; // along the edge, the way the ring goes round
  return {
    across: r * Math.sin(th) + o * Math.cos(th),
    toward: r * Math.cos(th) - o * Math.sin(th),
  };
}

/** The thread's curve between two points, bowed in towards the ring's centre `o`. */
export function bow(a: Pt, b: Pt, o: Pt, pull = 0.55): Quad {
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return { a, b, c: { x: m.x + (o.x - m.x) * pull, y: m.y + (o.y - m.y) * pull } };
}

export const at = (q: Quad, t: number): Pt => {
  const u = 1 - t;
  return {
    x: u * u * q.a.x + 2 * u * t * q.c.x + t * t * q.b.x,
    y: u * u * q.a.y + 2 * u * t * q.c.y + t * t * q.b.y,
  };
};

const f = (v: number) => v.toFixed(1);
export const pathOf = (q: Quad) => `M${f(q.a.x)} ${f(q.a.y)}Q${f(q.c.x)} ${f(q.c.y)} ${f(q.b.x)} ${f(q.b.y)}`;
/** The same curve, always from left to right, for the words along it to be upright. */
export const readingPathOf = (q: Quad) => pathOf(q.a.x <= q.b.x ? q : { a: q.b, c: q.c, b: q.a });

/**
 * Which side of the thread its name goes on, as `dy`: always the side it bows out to. On the inside of
 * a bend the letters of a name set along it run into each other; on the outside they open out. `was`
 * is the side it was on, kept while the bend is too slight for the side to matter (no flicking from
 * one to the other as the ring turns a thread through straight).
 */
export function nameSide(q: Quad, was: 'above' | 'below' = 'above'): 'above' | 'below' {
  const [a, b] = q.a.x <= q.b.x ? [q.a, q.b] : [q.b, q.a]; // read left to right
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // The reading direction's left, which is "above" the line for upright letters.
  const nx = b.y - a.y, ny = -(b.x - a.x);
  const len = Math.hypot(nx, ny) || 1;
  const out = ((q.c.x - m.x) * nx + (q.c.y - m.y) * ny) / len;
  if (Math.abs(out) < 6) return was;
  return out > 0 ? 'above' : 'below';
}
export const DY = { above: '-0.5em', below: '1.15em' } as const;

const SAMPLES = 16;
/** The curve's length, and where along it (0..1 of the way) each sixteenth of its length is. */
export function measureQuad(q: Quad) {
  const lengths = [0];
  let prev = q.a;
  for (let i = 1; i <= SAMPLES; i++) {
    const p = at(q, i / SAMPLES);
    lengths.push(lengths[i - 1]! + Math.hypot(p.x - prev.x, p.y - prev.y));
    prev = p;
  }
  return lengths;
}
/** The point `share` of the way along the curve by length. */
export function along(q: Quad, lengths: number[], share: number): Pt {
  const L = lengths[SAMPLES]! * share;
  let i = 1;
  while (i < SAMPLES && lengths[i]! < L) i++;
  const from = lengths[i - 1]!, to = lengths[i]!;
  const t = (i - 1 + (to > from ? (L - from) / (to - from) : 0)) / SAMPLES;
  return at(q, t);
}
