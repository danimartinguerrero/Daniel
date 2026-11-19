/**
 * Music, way c2: the film after the records, as numbers. Past the last of the collection's passages
 * the scroll goes on moving the same camera: the controller is set down in the middle of the ring, the
 * camera comes down to it while the records pass out of the picture, and a loop of two bars turns
 * under a needle of light on the floor around it (film.ts draws it; climb.ts says where the scroll is).
 *
 * `shot(s, room)` is the whole film: `s` is how far the scroll is past the collection's last passage,
 * in screens, and what comes back is where the camera is and what state everything is in at that
 * point. It keeps nothing between calls, so the film runs backwards exactly as it runs forwards.
 */
import { STEPS } from './pattern';

/** The stage and the ring the climb left on it. Lengths are px; the ring's are before the camera's zoom. */
export interface Room {
  /** The stage. */
  W: number;
  H: number;
  /** The ring's centre down the stage, and its radius to the middle of a sleeve. */
  cy: number;
  R: number;
  /** A sleeve's side. */
  S: number;
  /** The camera the climb ends on: how much smaller it draws the floor, how far away it is, and how
      far down it looks (degrees). */
  zoom: number;
  far: number;
  tilt: number;
}

export interface Shot {
  /** The camera: the floor's size on screen, its distance, how far down it looks, and where on the
      stage the point it looks at is drawn. */
  zoom: number;
  far: number;
  tilt: number;
  cy: number;
  /** The controller on its way down to the floor: 0 above the picture, 1 lying on it. */
  land: number;
  /** How much of the controller is there yet (it comes out of the dark as it comes down). */
  fade: number;
  /** The records, on their way out of the picture: 1 there, 0 gone. */
  records: number;
  /** The loop's disc of light, drawn round from the needle: 0 dark, 1 all of it. */
  disc: number;
  /** The passage about the beats: how far it has come up (0–1) and how much of it is lit (0–1). */
  lineIn: number;
  lineLit: number;
  /** Where the loop is under the needle, in steps: it goes round once, 0 to the loop's length, and
      the platter it lies on (the controller with it) goes round with it. */
  turn: number;
}

/** The stretch of scroll each part takes, in screens past the collection's last passage. */
export const CUE = {
  /** The passage about the guitar and the bass has the first half screen (climb.ts). */
  down: [0.5, 1.02],
  dive: [1.0, 1.9],
  records: [1.12, 1.52],
  disc: [1.32, 1.92],
  lineIn: [1.56, 1.7],
  lineLit: [1.7, 2.55],
  play: 1.9,
  /** Screens of scroll to a step of the loop. */
  step: 0.055,
} as const;
/** The whole film, in screens: the loop goes round once, is left a moment, and the page moves on. */
export const FILM = CUE.play + STEPS * CUE.step + 0.3;

/** Half the controller's width on the floor, in the ring's px: it lies in the clear middle of the ring
    with air round it. */
export const half = (room: Room) => 0.6 * (room.R - room.S / 2);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const part = (t: number, [from, to]: readonly [number, number]) => clamp01((t - from) / (to - from));
// Smootherstep: starts and stops without a jolt, wherever in the scroll that falls.
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function shot(s: number, room: Room): Shot {
  const u = half(room);
  const wide = room.W >= 700;
  // Where the camera ends up: the controller across most of a phone, under half of a wide screen.
  const across = wide ? Math.min(room.W * 0.38, room.H * 0.62, 600) : Math.min(room.W * 0.88, room.H * 0.6);
  const zoomTo = across / (2 * u);
  const cyTo = room.H * (wide ? 0.5 : 0.52);
  const farTo = Math.max(6.4 * u, 1.9 * room.R);

  const dive = ease(part(s, CUE.dive));
  const turn = clamp01((s - CUE.play) / (CUE.step * STEPS)) * STEPS;
  const round = turn / STEPS; // the loop's one turn: the camera keeps coming down a little

  return {
    zoom: mix(room.zoom, zoomTo, dive) * (1 + 0.05 * ease(round)),
    far: mix(room.far, farTo, dive),
    tilt: mix(room.tilt, 40, ease(part(s, [1.12, 1.9]))) - 3 * ease(round),
    cy: mix(room.cy, cyTo, dive),
    land: 1 - (1 - part(s, CUE.down)) ** 3,
    fade: part(s, [CUE.down[0], CUE.down[0] + 0.16]),
    records: 1 - part(s, CUE.records),
    disc: part(s, CUE.disc),
    lineIn: part(s, CUE.lineIn),
    lineLit: part(s, CUE.lineLit),
    turn,
  };
}
