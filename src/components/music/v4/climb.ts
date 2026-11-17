/**
 * Music: the climb. Past the shelf the page does not scroll on to something else. The stage stays on
 * screen, and the scroll raises the camera: the records leave their row, lie down on the floor in a
 * ring, and you end up looking down on them, with how the collection came about standing in the
 * middle. Scrolling further fills those words with light, a letter at a time, one passage after another.
 *
 * Nothing here has a state of its own, and nothing plays: every frame is drawn from where the page's
 * scroll is, so it follows the hand both ways, stops where the hand stops, and going back up is the
 * same film backwards (apple-design: 1:1 with the gesture, interruptible at any frame).
 *
 * The records are the carousel's own (listening-bar.ts), not copies: this module only works out where
 * the camera is and where the ring lies on this screen, and says so on the page's root as "v4:camera".
 * The carousel draws its sleeves from that, so they turn under a hand in the ring exactly as in the
 * row, and a record taken out of the ring comes out from where it lies.
 *
 * Only transform and opacity are written on a scroll frame, each on a layer of its own, and only when
 * they have changed. The words are the one exception: a word being filled is repainted (one or two
 * small words a frame), after the camera has stopped. No frame is asked for while the scroll is still.
 */
import { onPage } from '@/scripts/page';
import { clamp } from './physics';

/** What the carousel needs to draw its records from the camera's place. Lengths are px. */
export interface CameraView {
  /** How far up the camera is: 0 at the shelf, 1 above the ring. Already eased. */
  w: number;
  /** The ring's radius, to the middle of a sleeve lying in it. */
  R: number;
  /** How much smaller the records are drawn from above than at the shelf. */
  zoom: number;
  /** The ring's centre, below the line the sleeves' centres stand on in the row. */
  y: number;
  /** How far the camera looks down in the end, in degrees. */
  tilt: number;
  /** The camera's distance, for how much nearer things are larger. */
  far: number;
}

const TILT = 56; // degrees: a floor seen from above and in front, not a plan
const GAP = 1.06; // a sleeve's width and a little air, along the ring
// The stretch of scroll, as shares of it: the camera rises, then the passages fill one after another,
// then a breath before the page moves on.
const CAMERA_UNTIL = 0.38;
const WORDS_FROM = 0.4;
const WORDS_UNTIL = 0.96;
// A passage's own share of the words' stretch: it comes in, fills, is held lit, and makes way.
const PAGE_IN = 0.08;
const PAGE_FULL = 0.82;
const PAGE_OUT = 0.9;

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
  // With reduced motion there is no climb (the CSS lays the page out without one), and nothing to do.
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const say = (view: CameraView) => root.dispatchEvent(new CustomEvent('v4:camera', { detail: view }));

  /* The passages. In each, a word starts filling when the light reaches its first letter and is full
     at its last: where each word starts and ends along the passage is counted in letters, so the light
     moves through it at an even pace however long the words are. */
  const LEAD = 5; // letters the soft edge of the light runs ahead
  const pages = [...track.querySelectorAll<HTMLElement>('[data-climb-page]')].map((el) => {
    const words = [...el.querySelectorAll<HTMLElement>('[data-w]')];
    let length = 0;
    const spans = words.map((w) => {
      const from = length;
      length += (w.textContent ?? '').length + 1; // and the space after it
      return { from, to: length - 1 };
    });
    return { el, words, spans, length, fills: new Array<string>(words.length).fill('') };
  });

  /* ---------------------------------------------------------------- where the ring lies on this screen */
  let view: CameraView = { w: 0, R: 0, zoom: 1, y: 0, tilt: TILT, far: 1 };
  let lead = 0; // how far below the top of the screen the stage still is when the camera starts
  let run = 1; // px of scroll the stage stays on screen for
  let captionShift = 0;

  function measure() {
    // As the page lays it out at the shelf: the row is only made as large as the stage while the camera
    // is up (see the CSS), and its place before that is what everything is measured from.
    track.classList.remove('is-climbing');
    const st = stage.getBoundingClientRect();
    const rw = row.getBoundingClientRect();
    const cap = caption.getBoundingClientRect();
    const S = sleeve.offsetWidth;
    const line = rw.top - st.top + sleeve.offsetTop + S / 2; // the sleeves' centres, down the stage
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

    view = { ...view, R, zoom, y: centre - line, tilt: TILT, far };
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

    run = Math.max(1, track.offsetHeight - st.height);
    // The camera starts a little before the stage reaches the top of the screen, so the first of the
    // scroll already moves it; never before the page has been scrolled at all.
    lead = Math.min(track.getBoundingClientRect().top + scrollY, innerHeight * 0.22);
    drawn = NaN;
  }

  /* ---------------------------------------------------------------- one frame, from where the scroll is */
  // Smootherstep: the camera starts and stops without a jolt, wherever in the scroll that falls.
  const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const part = (t: number, from: number, to: number) => clamp((t - from) / (to - from), 0, 1);

  // What is on screen, so that a value that hasn't changed isn't written again.
  const written = new Map<HTMLElement, Record<string, string>>();
  function css(el: HTMLElement, prop: 'transform' | 'opacity' | 'visibility', value: string) {
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

    const w = ease(clamp((lead - top) / (lead + run * CAMERA_UNTIL), 0, 1));
    const light = part(-top / run, WORDS_FROM, WORDS_UNTIL);

    // The row takes the whole stage as soon as the camera leaves the shelf, and gives it back there.
    track.classList.toggle('is-climbing', w > 0);
    view.w = w;
    say(view);

    // The heading hangs on the wall: as the camera rises it goes up out of the picture, and the wall's
    // lamp with it; its light is on the floor instead.
    const gone = part(w, 0, 0.34);
    css(head, 'opacity', (1 - gone).toFixed(3));
    css(head, 'transform', gone ? `translate3d(0,${(-56 * gone).toFixed(1)}px,0)` : '');
    css(head, 'visibility', gone === 1 ? 'hidden' : '');
    css(wall, 'opacity', (1 - part(w, 0, 0.6)).toFixed(3));
    css(floor, 'opacity', part(w, 0.35, 1).toFixed(3));
    // The record's name stays under the records: under the row, then under the ring.
    css(caption, 'transform', w ? `translate3d(0,${(captionShift * w).toFixed(1)}px,0)` : '');

    // The first passage comes up, unlit, once the ring has opened round its place, and is there before
    // the light is. Each one fills, is held, and lifts away as the next comes up into its place.
    const along = light * pages.length;
    pages.forEach((page, i) => {
      const t = clamp(along - i, 0, 1);
      const arrive = i === 0 ? part(w, 0.86, 1) : part(t, 0, PAGE_IN);
      const leave = i === pages.length - 1 ? 0 : part(t, PAGE_OUT, 1);
      const shown = arrive * (1 - leave);
      css(page.el, 'opacity', shown.toFixed(3));
      css(page.el, 'visibility', shown === 0 ? 'hidden' : '');
      css(page.el, 'transform', `translate3d(0,${((1 - arrive) * 12 - leave * 12).toFixed(1)}px,0)`);
      const at = part(t, i === 0 ? 0 : PAGE_IN, PAGE_FULL) * (page.length + LEAD);
      for (let k = 0; k < page.words.length; k++) {
        const span = page.spans[k]!;
        // Full once the light's soft edge has passed its last letter.
        const f = clamp((at - span.from) / (span.to - span.from + LEAD), 0, 1).toFixed(3);
        if (page.fills[k] !== f) page.words[k]!.style.setProperty('--f', (page.fills[k] = f));
      }
    });
  }
  const ask = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };

  measure();
  draw();
  window.addEventListener('scroll', ask, { passive: true, signal });
  // A phone's toolbar coming and going resizes the window; the stage (svh) keeps its size, so nothing
  // jumps, but the ring is measured again for a window that really changed.
  let size = `${innerWidth}x${stage.offsetHeight}`;
  const again = () => {
    const now = `${innerWidth}x${stage.offsetHeight}`;
    if (now === size && !still.matches) return ask();
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
      for (const el of [head, wall, floor, caption, ...pages.map((page) => page.el)]) el.removeAttribute('style');
      for (const page of pages) {
        page.words.forEach((el) => el.style.removeProperty('--f'));
        page.fills.fill('');
      }
      written.clear();
    } else {
      measure();
      draw();
    }
  }, { signal });
  // Fonts arriving change the caption's height by a line at most; the stage's own size is what matters.
  document.fonts?.ready.then(() => !signal.aborted && again());
  signal.addEventListener('abort', () => cancelAnimationFrame(frame));
}
