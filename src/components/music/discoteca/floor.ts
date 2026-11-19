/**
 * Discoteca: the floor past the ring. Where the records lie in each arrangement, where the camera is,
 * and how a point on the floor lands on the screen. climb.ts works out a scene from the scroll with
 * these; engine.ts draws it. Lengths are px unless a name says S (sleeves: one is a record's width at
 * the shelf).
 *
 * The floor's axes are the ring's: `x` across the screen, `z` towards you. A record lying with yaw 0
 * has its top edge away from you, so its cover reads upright.
 */
import { vinyls } from '@/data/music';
import { byYear, people } from './people';

/** The camera over the floor. At the ring it is v4's: looking down by `tilt`, all of it drawn `zoom`
    times as large, the point it looks at (`cx`, `cz`) `y` px below the row's line on screen, `far`
    away (nearer things are drawn larger by far / (far - depth)). */
export interface FloorCam { tilt: number; zoom: number; y: number; cx: number; cz: number; far: number }

/** Where a record goes on the floor and how far it has got there from its place in the ring (`wt`). */
export interface FloorRec { x: number; z: number; yaw: number; lift: number; wt: number; dim: number }

export interface FloorScene {
  cam: FloorCam;
  /** 0 to 1: the ring loosening, before it opens. */
  loosen: number;
  /** By the shelf's order (vinyls), which is the carousel's. */
  recs: FloorRec[];
  /** Each record's year, printed on the floor beside its place in the line. */
  years: { x: number; z: number; alpha: number }[];
  /** Each person: where their name stands, how far their threads have grown (0 to 1), how much it shows. */
  hubs: { x: number; z: number; grow: number; alpha: number }[];
  /** The record the caption names while the records lie in their line, or null. */
  focus: number | null;
  /** The records are gathered by person: the caption is the chosen person's. */
  people: boolean;
  /** The names can be pressed. */
  interactive: boolean;
  /** The stage, in px from the middle of a sleeve's slot: what is outside it isn't drawn. */
  bounds: { top: number; bottom: number; half: number };
}

/** A point on the floor (and `h` above it) on screen: px from the middle of a sleeve's slot, and how
    much larger than at the shelf it is drawn there (`k`). Past the camera it is `hidden`. */
export function project(cam: FloorCam, x: number, z: number, h = 0) {
  const a = (cam.tilt * Math.PI) / 180;
  const rx = x - cam.cx;
  const rz = z - cam.cz;
  const depth = rz * Math.cos(a) + h * Math.sin(a);
  const hidden = depth > cam.far * 0.7;
  const k = (cam.far / Math.max(cam.far * 0.3, cam.far - depth)) * cam.zoom;
  return { sx: rx * k, sy: cam.y + (rz * Math.sin(a) - h * Math.cos(a)) * k, k, hidden };
}

export const mixCam = (a: FloorCam, b: FloorCam, t: number): FloorCam => ({
  tilt: a.tilt + (b.tilt - a.tilt) * t,
  zoom: a.zoom + (b.zoom - a.zoom) * t,
  y: a.y + (b.y - a.y) * t,
  cx: a.cx + (b.cx - a.cx) * t,
  cz: a.cz + (b.cz - a.cz) * t,
  far: a.far + (b.far - a.far) * t,
});

/* ---------------------------------------------------------------- the line by year
   One after another in the order they came out, oldest at the back, a sleeve and a little air apart
   plus a share of a sleeve for every year between two of them: the gaps in the collection are floor
   left empty. On a phone the line runs straight towards you down the middle of the screen; on a wide
   screen it runs across it, from the back on the left to the front on the right. The year lies beside
   each record, on the side the line leaves free. */
export const STEP = 1.1; // S from one record to the next
export const PER_YEAR = 0.07; // S of floor for every year between two records
export const LINE_TILT = 46;
export const PEOPLE_TILT = 58;

export interface Line {
  /** Along the line, S from the oldest record, by vinyls index. */
  u: number[];
  /** The line's way along the floor (x, z) and the side its years are on, unit vectors. */
  dir: [number, number];
  side: [number, number];
  first: number;
  last: number;
}

export function line(portrait: boolean): Line {
  const u = new Array<number>(vinyls.length).fill(0);
  let at = 0;
  byYear.forEach((i, j) => {
    if (j > 0) at += STEP + (vinyls[i]!.year - vinyls[byYear[j - 1]!]!.year) * PER_YEAR;
    u[i] = at;
  });
  const phi = ((portrait ? 90 : 28) * Math.PI) / 180;
  const dir: [number, number] = [Math.cos(phi), Math.sin(phi)];
  // To the left of the way the line goes, turned towards you: on a phone straight left.
  const side: [number, number] = [-dir[1], dir[0]];
  return { u, dir, side, first: 0, last: at };
}

/** How far a record or its year sits from the line the camera walks along: the two together are centred on it. */
export const SLEEVE_OFF = -0.45; // S, along `side`
export const YEAR_OFF = 0.5; // S, along `side`

/* ---------------------------------------------------------------- by the people on them
   Placed by hand for the shelf as it is, around the point the walk ends on, in S. Each person's name
   stands where their threads meet. A record or a person not placed here (the shelf has grown) is put
   in a spiral round the outside, or at the middle of their records. */
type Spot = [x: number, z: number, yaw: number];
const PORTRAIT: Record<string, Spot> = {
  'in-the-court': [-1.45, -3.3, -7],
  igor: [0, -3.05, -3],
  ye: [1.45, -3.25, 6],
  'dark-side': [-1.4, -1.8, 3],
  'the-wall': [1.4, -1.7, -4],
  'to-pimp-a-butterfly': [-1.45, -0.3, -3],
  damn: [1.35, -0.2, 4],
  'good-kid-maad-city': [-1.4, 1.3, 2],
  'we-dont-trust-you': [1.3, 1.4, -5],
  illmatic: [-0.75, 2.95, 5],
  'low-end-theory': [0.75, 3.05, -6],
};
const PORTRAIT_HUBS: Record<string, [number, number]> = {
  'Kendrick Lamar': [0.05, 0.55],
  'Anna Wise': [-1.43, 0.5],
  'Pink Floyd': [0, -1.75],
};
const LANDSCAPE: Record<string, Spot> = {
  'to-pimp-a-butterfly': [-1.0, -0.75, -3],
  damn: [1.0, -0.8, 4],
  'good-kid-maad-city': [-1.0, 0.75, 2],
  'we-dont-trust-you': [1.0, 0.8, -5],
  'dark-side': [-4.3, -0.8, 3],
  'the-wall': [-2.55, -0.65, -4],
  'in-the-court': [-3.45, 0.95, -7],
  ye: [2.6, -0.95, 6],
  igor: [4.2, -0.35, -3],
  illmatic: [2.65, 0.85, 5],
  'low-end-theory': [4.15, 1.15, -6],
};
const LANDSCAPE_HUBS: Record<string, [number, number]> = {
  'Kendrick Lamar': [0, 0],
  'Anna Wise': [-1.0, 0],
  'Pink Floyd': [-3.42, -0.72],
};

export interface Gathered { recs: Spot[]; hubs: [number, number][] }

export function gathered(portrait: boolean): Gathered {
  const spots = portrait ? PORTRAIT : LANDSCAPE;
  const hubSpots = portrait ? PORTRAIT_HUBS : LANDSCAPE_HUBS;
  let extra = 0;
  const recs = vinyls.map((v): Spot => {
    const s = spots[v.id];
    if (s) return s;
    const th = extra * 2.4;
    const r = 4.2 + extra * 0.35;
    extra++;
    return [Math.cos(th) * r * (portrait ? 0.55 : 1.1), Math.sin(th) * r * (portrait ? 1 : 0.4), 0];
  });
  const hubs = people.map((p): [number, number] => {
    const h = hubSpots[p.name];
    if (h) return h;
    const xs = p.records.map((i) => recs[i]![0]);
    const zs = p.records.map((i) => recs[i]![1]);
    return [xs.reduce((a, b) => a + b, 0) / xs.length, zs.reduce((a, b) => a + b, 0) / zs.length];
  });
  return { recs, hubs };
}
