/**
 * Music: the climb. Past the shelf the page does not scroll on to something else. The stage stays on
 * screen, and the scroll raises the camera: the records leave their row, lie down on the floor in a
 * ring, and you end up looking down on them, with how the collection came about standing in the
 * middle. Scrolling further fills those words with light, a line at a time, at the site's one pace (the
 * pace the home page's part names fill at), one passage after another.
 *
 * Nothing here plays on its own: every frame is drawn from where the page's scroll is, so it follows
 * the hand both ways, stops where the hand stops, and going back up is the same film backwards
 * (apple-design: with the gesture, interruptible at any frame). It follows the scroll through a short,
 * critically damped spring rather than to the pixel. On an iPhone the page learns where the scroll is
 * at its own 60 Hz from a scroll that runs at 120 Hz elsewhere, so the steps it is told of come short,
 * long, short: drawn as they come, the records moved in a judder that read as a low frame rate. The
 * spring draws a step on every frame and evens those out, a few hundredths of a second behind the hand.
 *
 * The records are the carousel's own (listening-bar.ts), not copies: this module only works out where
 * the camera is and where the ring lies on this screen, and says so on the page's root as "v4:camera".
 * The carousel draws its sleeves from that, so they turn under a hand in the ring exactly as in the
 * row, and a record taken out of the ring comes out from where it lies.
 *
 * Only transform and opacity are written on a scroll frame, each on a layer of its own, and only when
 * they have changed: nothing is painted again as it plays, the light on the words included (each line
 * has a white copy over it, seen through a sliding window: see lightLines). No frame is asked for while
 * the scroll is still.
 */
import { onPage } from '@/scripts/page';
import { measureTextFill, paintTextFill, type LitLine } from './text-fill';
import { Spring, clamp } from './physics';

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
// The stretch of scroll, in screens (the stage's height): the camera rises, then the passages fill one
// after another at the site's one pace (--fill-line of scroll a line, as the home page's part names
// fill), each held lit a moment and then making way for the next, and a breath before the page goes on.
const CAMERA = 1.1;
const BEFORE_WORDS = 0.06;
const PAGE_IN = 0.12; // the next passage comes up into the place the last one left
const PAGE_OUT = 0.12;
const TAIL = 0.12;
// Held lit after filling for as long as the home page holds a part name: the last 30% of its hold,
// against 70% for filling it (index.astro, .divider).
const HOLD = 3 / 7; // in lines' worth of scroll

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
  const probe = q('[data-climb-probe]'); // as tall as the scroll a line of text takes to fill (--fill-line)
  // With reduced motion there is no climb (the CSS lays the page out without one), and nothing to do.
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const say = (view: CameraView) => root.dispatchEvent(new CustomEvent('v4:camera', { detail: view }));

  /* The passages, filled as everything on the site fills (--fill-* in global.css): line after line, each
     taking the same scroll whatever its length, a soft edge a quarter of the line wide crossing it.
     Where each passage comes in, fills, is held and goes, in px of scroll since the stage was pinned, is
     worked out in measure from how many lines the browser broke it into. */
  const pages = [...track.querySelectorAll<HTMLElement>('[data-climb-page]')].map((el) => ({
    el,
    lines: [] as LitLine[],
    start: 0, // the first line starts filling
    held: 0, // the last line is full and held lit until here
  }));
  let LINE = 1;

  // What is on screen, so that a value that hasn't changed isn't written again.
  const written = new Map<HTMLElement, Record<string, string>>([[caption, {}]]);
  function css(el: HTMLElement, prop: 'transform' | 'opacity', value: string) {
    let w = written.get(el);
    if (!w) written.set(el, (w = {}));
    if (w[prop] === value) return;
    w[prop] = value;
    el.style[prop] = value;
  }

  /* ---------------------------------------------------------------- where the ring lies on this screen */
  let view: CameraView = { w: 0, R: 0, zoom: 1, y: 0, tilt: TILT, far: 1 };
  let lead = 0; // how far below the top of the screen the stage still is when the camera starts
  let run = 1; // px of scroll the stage stays on screen for
  let stageH = 1; // the stage's height: a screen (100svh)
  let captionShift = 0;
  // Where the stretch starts in the page, so that a frame needs only the scroll position (scrollY) and
  // never asks the browser to lay the page out mid-scroll. Measured again whenever the page's size changes.
  let trackTop = 0;

  function measure() {
    // As the page lays it out at the shelf: the row is only made as large as the stage while the camera
    // is up (see the CSS), and its place before that is what everything is measured from.
    track.classList.remove('is-climbing');
    // The caption as laid out, not where the climb has moved it to.
    caption.style.transform = '';
    written.get(caption)!.transform = '';
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

    for (const page of pages) page.lines = measureTextFill(page.el);
    // The stretch, sized for these passages as broken into lines on this screen: the camera, then each
    // passage's lines at the site's pace and its hold, the passages handing over, and a breath.
    LINE = probe.getBoundingClientRect().height || st.height * 0.35;
    const H = (stageH = st.height);
    let at = (CAMERA + BEFORE_WORDS) * H;
    pages.forEach((page, i) => {
      if (i > 0) at += (PAGE_OUT + PAGE_IN) * H;
      page.start = at;
      at += (page.lines.length + HOLD) * LINE;
      page.held = at;
    });
    track.style.setProperty('--climb-run', `${(at + TAIL * H).toFixed(1)}px`);
    run = Math.max(1, track.offsetHeight - st.height);
    trackTop = track.getBoundingClientRect().top + scrollY;
    // The camera starts a little before the stage reaches the top of the screen, so the first of the
    // scroll already moves it; never before the page has been scrolled at all.
    lead = Math.min(trackTop, innerHeight * 0.22);
    drawn = NaN;
  }

  /* ---------------------------------------------------------------- one frame, from where the scroll is */
  // Smootherstep: the camera starts and stops without a jolt, wherever in the scroll that falls.
  const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const part = (t: number, from: number, to: number) => clamp((t - from) / (to - from), 0, 1);


  /* The scroll, followed. `at` is the scroll position the frame is drawn for. Critically damped and
     short (response 0.18 s): the judder it takes out is a frame or two long, far faster than the
     spring, and little of it gets through (measured with the scroll told in alternating short and long
     steps: a record's steps went from about 80% uneven to about 13%, against 4% for an even scroll). A
     steady scroll is followed about 60 ms behind, and when the hand stops the camera settles. */
  const at = new Spring(scrollY, { response: 0.18, damping: 1 }, 0.05);
  let drawn = NaN;
  let frame = 0;
  let last = 0;
  function tick(now: number) {
    frame = 0;
    const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60;
    last = now;
    const settled = at.step(dt);
    draw(at.value);
    if (!settled) frame = requestAnimationFrame(tick);
    else last = 0;
  }
  /** The scroll moved: follow it. Far from the stretch on both counts (the page scrolled elsewhere), or
      on the first frame, there is nothing to see move, and the spring is simply put there. */
  function follow(snap = false) {
    const y = scrollY;
    const from = trackTop - lead - innerHeight, to = trackTop + run + 8;
    const outside = (v: number) => (v < from ? -1 : v > to ? 1 : 0);
    if (snap || (outside(y) !== 0 && outside(y) === outside(at.value))) {
      at.set(y);
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      return draw(y);
    }
    at.to(y);
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function draw(y: number) {
    if (still.matches) return;
    // Once the shelf has left the screen its final pose also serves the entire instrument section.
    const top = clamp(trackTop - y, -run, lead);
    if (top === drawn) return;
    drawn = top;

    const w = ease(clamp((lead - top) / (lead + CAMERA * stageH), 0, 1));

    // The row takes the whole stage as soon as the camera leaves the shelf, and gives it back there.
    track.classList.toggle('is-climbing', w > 0);
    view.w = w;
    say(view);

    // The heading hangs on the wall: as the camera rises it goes up out of the picture, and the wall's
    // lamp with it; its light is on the floor instead.
    const gone = part(w, 0, 0.34);
    css(head, 'opacity', (1 - gone).toFixed(3));
    css(head, 'transform', gone ? `translate3d(0,${(-56 * gone).toFixed(1)}px,0)` : '');
    css(wall, 'opacity', (1 - part(w, 0, 0.6)).toFixed(3));
    css(floor, 'opacity', part(w, 0.35, 1).toFixed(3));
    // The record's name stays under the records: under the row, then under the ring.
    css(caption, 'transform', w ? `translate3d(0,${(captionShift * w).toFixed(1)}px,0)` : '');

    // The first passage comes up, unlit, once the ring has opened round its place, and is there before
    // the light is. Each one fills, is held, and lifts away as the next comes up into its place.
    const scrolled = -top;
    pages.forEach((page, i) => {
      const arrive = i === 0 ? part(w, 0.86, 1) : part(scrolled, page.start - PAGE_IN * stageH, page.start);
      const leave = i === pages.length - 1 ? 0 : part(scrolled, page.held, page.held + PAGE_OUT * stageH);
      const shown = arrive * (1 - leave);
      // Faded, never hidden: a layer made visible again would be drawn anew mid-scroll.
      css(page.el, 'opacity', shown.toFixed(3));
      css(page.el, 'transform', `translate3d(0,${((1 - arrive) * 12 - leave * 12).toFixed(1)}px,0)`);
      paintTextFill(page.lines, (scrolled - page.start) / LINE);
    });
  }
  measure();
  follow(true);
  window.addEventListener('scroll', () => follow(), { passive: true, signal });
  // A phone's toolbar coming and going resizes the window; the stage (svh) keeps its size, so nothing
  // jumps, but the ring is measured again for a window that really changed.
  let size = `${innerWidth}x${stage.offsetHeight}`;
  const again = () => {
    const now = `${innerWidth}x${stage.offsetHeight}`;
    if (now === size && !still.matches) return follow();
    size = now;
    measure();
    follow(true);
  };
  window.addEventListener('resize', again, { signal });
  // Anything above the stretch changing height (a font arriving, an image) moves where it starts.
  const shifted = new ResizeObserver(() => {
    const top = track.getBoundingClientRect().top + scrollY;
    if (Math.abs(top - trackTop) < 0.5) return;
    measure();
    follow(true);
  });
  shifted.observe(root);
  signal.addEventListener('abort', () => shifted.disconnect());
  still.addEventListener('change', () => {
    // Turned on mid-climb: the page lays itself out without the climb, and everything drawn for it goes.
    if (still.matches) {
      track.classList.remove('is-climbing');
      say({ ...view, w: 0 });
      for (const el of [head, wall, floor, caption, ...pages.map((page) => page.el)]) el.removeAttribute('style');
      for (const page of pages) {
        page.el.querySelector('.v4-lit')?.remove();
        page.el.classList.remove('is-armed');
        page.lines = [];
      }
      written.clear();
      written.set(caption, {});
    } else {
      measure();
      follow(true);
    }
  }, { signal });
  // Fonts arriving change the caption's height by a line at most; the stage's own size is what matters.
  // (and a font arriving late would move the line breaks the light follows).
  document.fonts?.ready.then(() => {
    if (signal.aborted || still.matches) return;
    measure();
    follow(true);
  });
  signal.addEventListener('abort', () => cancelAnimationFrame(frame));
}
