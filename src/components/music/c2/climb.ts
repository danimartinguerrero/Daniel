/**
 * Music, way c2: the climb, and what the scroll does after it. This is v4/climb.ts carried on (this
 * page loads it instead): the first stretch is that film unchanged, at the same pace, and then the
 * same stage and the same camera go on.
 *
 *   1. The camera rises over the records and the collection's passages fill with light (as in v4).
 *   2. One more passage in the ring: the guitar and the bass.
 *   3. The controller is set down in the middle of the ring, among the records.
 *   4. The camera comes down to it. The records pass out of the picture, drawn by the carousel from
 *      this camera as before ("v4:camera"), so they and the controller move as one floor.
 *   5. The loop turns under its needle, a step for every stretch of scroll: pads light, keys dip, a
 *      knob opens (film.ts, shot.ts, pattern.ts), and the passage about the beats fills as it goes.
 *
 * Nothing here has a state of its own, and nothing plays: every frame is drawn from where the page's
 * scroll is, so it follows the hand both ways, stops where the hand stops, and going back up is the
 * same film backwards. Only transform, opacity and visibility are written on a scroll frame, plus the
 * canvas; the words being filled are repainted a word or two at a time. No frame is asked for while
 * the scroll is still.
 *
 * three and the model are loaded once the camera has left the shelf, a couple of screens before they
 * are seen, and the canvas draws nothing until the controller is due.
 */
import { onPage } from '@/scripts/page';
import { clamp } from '@/components/music/v4/physics';
import type { CameraView } from '@/components/music/v4/climb';
import { FILM, shot } from './shot';
import type { Room } from './shot';
import type { Film } from './film';

const TILT = 56; // degrees: a floor seen from above and in front, not a plan
const GAP = 1.06; // a sleeve's width and a little air, along the ring
/* v4's stretch of scroll, in screens, and its parts as shares of it: the camera rises, then the
   collection's three passages fill one after another. */
const BASE = 2.9;
const CAMERA_UNTIL = 0.38;
const WORDS_FROM = 0.4;
const WORDS_UNTIL = 0.96;
const COLLECTION = 3; // its passages; the one after them is this way's, at the same pace
// A passage's own share of the words' stretch: it comes in, fills, is held lit, and makes way.
const PAGE_IN = 0.08;
const PAGE_FULL = 0.82;
const PAGE_OUT = 0.9;
/** The whole stretch the stage stays on screen for, in screens (the CSS reads it as --climb-run). */
const RUN = BASE * WORDS_UNTIL + FILM;

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('[data-music-page].v4');
  const track = root?.querySelector<HTMLElement>('[data-climb]');
  if (root && track) init(root, track, signal);
});

function init(root: HTMLElement, track: HTMLElement, signal: AbortSignal) {
  const q = (sel: string) => track.querySelector<HTMLElement>(sel)!;
  const stage = q('[data-climb-stage]');
  const row = q('[data-v4-row]');
  const sleeve = q('[data-vinyl]');
  const count = track.querySelectorAll('[data-vinyl]').length;
  const head = q('[data-climb-head]');
  const wall = q('[data-climb-wall]');
  const floor = q('[data-climb-floor]');
  const caption = q('[data-v4-caption]');
  const layer = q('[data-c2-film]');
  const canvas = layer.querySelector('canvas')!;
  const line = q('[data-c2-line]');
  // With reduced motion there is no film (the CSS lays the page out without one): the controller is
  // drawn once, lying still, where the page has it.
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const say = (view: CameraView) => root.dispatchEvent(new CustomEvent('v4:camera', { detail: view }));
  track.style.setProperty('--climb-run', `${(RUN * 100).toFixed(1)}svh`);

  /* The passages. In each, a word starts filling when the light reaches its first letter and is full
     at its last: where each word starts and ends along the passage is counted in letters, so the light
     moves through it at an even pace however long the words are. */
  const LEAD = 5; // letters the soft edge of the light runs ahead
  const passage = (el: HTMLElement) => {
    const words = [...el.querySelectorAll<HTMLElement>('[data-w]')];
    let length = 0;
    const spans = words.map((w) => {
      const from = length;
      length += (w.textContent ?? '').length + 1; // and the space after it
      return { from, to: length - 1 };
    });
    return { el, words, spans, length, fills: new Array<string>(words.length).fill('') };
  };
  type Passage = ReturnType<typeof passage>;
  /** Light the passage as far as `t` (0–1) of the way through it. */
  function fill(page: Passage, t: number) {
    const at = t * (page.length + LEAD);
    for (let k = 0; k < page.words.length; k++) {
      const span = page.spans[k]!;
      // Full once the light's soft edge has passed its last letter.
      const f = clamp((at - span.from) / (span.to - span.from + LEAD), 0, 1).toFixed(3);
      if (page.fills[k] !== f) page.words[k]!.style.setProperty('--f', (page.fills[k] = f));
    }
  }
  const pages = [...track.querySelectorAll<HTMLElement>('[data-climb-page]')].map(passage);
  const beats = passage(line);

  /* ---------------------------------------------------------------- where the ring lies on this screen */
  let view: CameraView = { w: 0, R: 0, zoom: 1, y: 0, tilt: TILT, far: 1 };
  let room: Room = { W: 1, H: 1, cy: 0, R: 1, S: 1, zoom: 1, far: 1, tilt: TILT };
  let rest = 0; // the line the sleeves' centres stand on in the row, down the stage
  let lead = 0; // how far below the top of the screen the stage still is when the camera starts
  let screen = 1; // the stage's height: a screen of scroll
  let captionShift = 0;

  function measure() {
    // As the page lays it out at the shelf: the row is only made as large as the stage while the camera
    // is up (see the CSS), and its place before that is what everything is measured from.
    track.classList.remove('is-climbing');
    const st = stage.getBoundingClientRect();
    const rw = row.getBoundingClientRect();
    const cap = caption.getBoundingClientRect();
    const S = sleeve.offsetWidth;
    rest = rw.top - st.top + sleeve.offsetTop + S / 2;
    track.style.setProperty('--room-top', `${Math.max(0, rw.top - st.top).toFixed(1)}px`);
    track.style.setProperty('--room-bottom', `${Math.max(0, st.bottom - rw.bottom).toFixed(1)}px`);

    // The ring, at the size of the records at the shelf: wide enough for them to lie side by side.
    const R = (S * GAP) / (2 * Math.sin(Math.PI / count));
    const far = R * 4.2;
    const a = (TILT * Math.PI) / 180;
    const near = (z: number) => far / (far - z * Math.cos(a)); // how much larger, z towards you
    // How far the ring reaches on screen from its centre: down at the front, up at the back, and to
    // each side (a little in front of the middle, where it is nearer). To the sleeves' outer corners.
    const edge = Math.hypot(R + S / 2, S / 2);
    const down = edge * Math.sin(a) * near(edge);
    const up = edge * Math.sin(a) * near(-edge);
    let side = 0;
    for (let deg = 60; deg <= 110; deg += 2) {
      const th = (deg * Math.PI) / 180;
      side = Math.max(side, edge * Math.sin(th) * near(edge * Math.cos(th)));
    }
    // And the clear floor in the middle, to the sleeves' inner edges.
    const inner = R - S / 2;
    const innerDown = inner * Math.sin(a) * near(inner);
    const innerUp = inner * Math.sin(a) * near(-inner);

    // It has the stage between the island and the record's name. On a phone it is wider than the
    // screen and runs off both sides, as a floor does when you stand over it: fitted to the width it
    // would be a small ring with words too small to read in it.
    const top = 68; // under the island
    const bottom = st.height - cap.height - 44;
    const wide = st.width >= 700 ? st.width - 48 : st.width * 1.42;
    const zoom = Math.min(1, wide / (2 * side), (bottom - top) / (down + up));
    const centre = top + (bottom - top - (down + up) * zoom) / 2 + up * zoom;

    view = { ...view, R, zoom, y: centre - rest, tilt: TILT, far };
    room = { W: st.width, H: st.height, cy: centre, R, S, zoom, far, tilt: TILT };
    captionShift = centre + down * zoom + 18 - (cap.top - st.top);

    // The pool of light under the ring, and the words in the middle of it.
    stage.style.setProperty('--ring-y', `${centre.toFixed(1)}px`);
    stage.style.setProperty('--ring-w', `${(side * zoom * 3).toFixed(1)}px`);
    stage.style.setProperty('--ring-h', `${((down + up) * zoom * 1.5).toFixed(1)}px`);
    const wordsW = Math.min(st.width - 40, inner * zoom * 2 * 0.84);
    stage.style.setProperty('--words-y', `${(centre + ((innerDown - innerUp) * zoom) / 2).toFixed(1)}px`);
    stage.style.setProperty('--words-w', `${wordsW.toFixed(1)}px`);
    // Some twenty-seven letters to the line: a passage is five lines or so, and fits the clear floor.
    stage.style.setProperty('--words-fs', `${clamp(wordsW / 13.5, 17, 36).toFixed(1)}px`);

    screen = Math.max(1, st.height);
    // The camera starts a little before the stage reaches the top of the screen, so the first of the
    // scroll already moves it; never before the page has been scrolled at all.
    lead = Math.min(track.getBoundingClientRect().top + scrollY, innerHeight * 0.22);
    drawn = NaN;
  }

  /* ---------------------------------------------------------------- the film, when it is wanted */
  let film: Film | null = null;
  let asked = false;
  function load() {
    if (asked) return;
    asked = true;
    void import('./film').then(({ makeFilm }) => makeFilm(canvas, signal)).then((made) => {
      film = made;
      layer.classList.add('is-ready');
      drawn = NaN;
      draw();
    }).catch((error: unknown) => {
      // Without WebGL, or with the model missing, the words still tell it; the records just leave.
      if (!signal.aborted) console.warn('[music] the controller could not be drawn', error);
    });
  }

  /* ---------------------------------------------------------------- one frame, from where the scroll is */
  // Smootherstep: the camera starts and stops without a jolt, wherever in the scroll that falls.
  const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const part = (t: number, from: number, to: number) => clamp((t - from) / (to - from), 0, 1);

  // What is on screen, so that a value that hasn't changed isn't written again.
  const written = new Map<HTMLElement, Record<string, string>>();
  function css(el: HTMLElement, prop: 'transform' | 'opacity' | 'visibility' | 'pointerEvents', value: string) {
    let w = written.get(el);
    if (!w) written.set(el, (w = {}));
    if (w[prop] === value) return;
    w[prop] = value;
    el.style[prop] = value;
  }

  let drawn = NaN;
  let frame = 0;
  function draw() {
    frame = 0;
    if (still.matches) return;
    const top = track.getBoundingClientRect().top;
    if (top === drawn) return;
    drawn = top;

    const base = screen * BASE; // v4's stretch, in px
    const w = ease(clamp((lead - top) / (lead + base * CAMERA_UNTIL), 0, 1));
    // The passages, counted as they go by: three of the collection's, and the one that follows them.
    const along = ((-top / base - WORDS_FROM) / (WORDS_UNTIL - WORDS_FROM)) * COLLECTION;
    // And the film after them, in screens.
    const s = -top / screen - BASE * WORDS_UNTIL;
    const at = shot(s, room);
    if (w > 0.15) load();

    // The row takes the whole stage as soon as the camera leaves the shelf, and gives it back there.
    track.classList.toggle('is-climbing', w > 0);
    // Past the passages the carousel is told this film's camera: the same floor, seen from nearer and
    // lower, so its records leave the picture as the controller grows in it.
    view.w = w;
    say(s > 0 ? { w, R: view.R, zoom: at.zoom, y: at.cy - rest, tilt: at.tilt, far: at.far } : view);
    css(row, 'opacity', at.records.toFixed(3));
    css(row, 'visibility', at.records === 0 ? 'hidden' : '');

    // The heading hangs on the wall: as the camera rises it goes up out of the picture, and the wall's
    // lamp with it; its light is on the floor instead.
    const gone = part(w, 0, 0.34);
    css(head, 'opacity', (1 - gone).toFixed(3));
    css(head, 'transform', gone ? `translate3d(0,${(-56 * gone).toFixed(1)}px,0)` : '');
    css(head, 'visibility', gone === 1 ? 'hidden' : '');
    css(wall, 'opacity', (1 - part(w, 0, 0.6)).toFixed(3));
    css(floor, 'opacity', (part(w, 0.35, 1) * at.records).toFixed(3));
    // The record's name stays under the records: under the row, then under the ring, and goes with them.
    css(caption, 'transform', w ? `translate3d(0,${(captionShift * w).toFixed(1)}px,0)` : '');
    css(caption, 'opacity', (1 - part(s, 0.9, 1.15)).toFixed(3));

    // The first passage comes up, unlit, once the ring has opened round its place, and is there before
    // the light is. Each one fills, is held, and lifts away as the next comes up into its place; the
    // last lifts away for the controller.
    pages.forEach((page, i) => {
      const t = clamp(along - i, 0, 1);
      const arrive = i === 0 ? part(w, 0.86, 1) : part(t, 0, PAGE_IN);
      const leave = part(t, PAGE_OUT, 1);
      const shown = arrive * (1 - leave);
      css(page.el, 'opacity', shown.toFixed(3));
      css(page.el, 'visibility', shown === 0 ? 'hidden' : '');
      css(page.el, 'transform', `translate3d(0,${((1 - arrive) * 12 - leave * 12).toFixed(1)}px,0)`);
      fill(page, part(t, i === 0 ? 0 : PAGE_IN, PAGE_FULL));
    });

    // The controller and its loop. The canvas is only shown while there is something on it, and only
    // takes a hand once the records are out of the way.
    const showing = at.fade > 0 && !!film;
    css(layer, 'visibility', showing ? 'visible' : 'hidden');
    css(layer, 'opacity', at.fade.toFixed(3));
    css(canvas, 'pointerEvents', at.records === 0 ? 'auto' : 'none');
    if (showing) film!.frame(s, room);

    // The passage about the beats stands over the controller, and fills as the loop gets going.
    css(line, 'opacity', at.lineIn.toFixed(3));
    css(line, 'visibility', at.lineIn === 0 ? 'hidden' : 'visible');
    css(line, 'transform', `translate3d(-50%,${((1 - at.lineIn) * 12).toFixed(1)}px,0)`);
    fill(beats, at.lineLit);
  }
  const ask = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };

  /* With reduced motion: the controller once, lying still with its loop round it, in the page. */
  function drawStill() {
    load();
    if (!film) return;
    const box = layer.getBoundingClientRect();
    if (!box.width || !box.height) return;
    // A room of the layer's own size, with the camera already down at the controller.
    const R = box.width * 0.5;
    const S = R / 1.881;
    film.frame(2.05, { W: box.width, H: box.height, cy: box.height / 2, R, S, zoom: 1, far: R * 4.2, tilt: TILT });
  }

  measure();
  draw();
  if (still.matches) drawStill();
  window.addEventListener('scroll', ask, { passive: true, signal });
  // A phone's toolbar coming and going resizes the window; the stage (svh) keeps its size, so nothing
  // jumps, but the ring is measured again for a window that really changed.
  let size = `${innerWidth}x${stage.offsetHeight}`;
  const again = () => {
    if (still.matches) return drawStill();
    const now = `${innerWidth}x${stage.offsetHeight}`;
    if (now === size) return ask();
    size = now;
    measure();
    draw();
  };
  window.addEventListener('resize', again, { signal });
  still.addEventListener('change', () => {
    // Turned on mid-climb: the page lays itself out without the climb, and everything drawn for it goes.
    if (still.matches) {
      track.classList.remove('is-climbing');
      say({ ...view, w: 0 });
      for (const [el, props] of written) for (const prop of Object.keys(props)) el.style.setProperty(prop === 'pointerEvents' ? 'pointer-events' : prop, '');
      for (const page of [...pages, beats]) {
        page.words.forEach((el) => el.style.removeProperty('--f'));
        page.fills.fill('');
      }
      written.clear();
      drawStill();
    } else {
      measure();
      draw();
    }
  }, { signal });
  // Fonts arriving change the caption's height by a line at most; the stage's own size is what matters.
  document.fonts?.ready.then(() => !signal.aborted && again());
  signal.addEventListener('abort', () => cancelAnimationFrame(frame));
}
