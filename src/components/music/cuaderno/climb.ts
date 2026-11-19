/**
 * /music/cuaderno: the climb, carried on to the notebook. This is v4's climb (components/music/v4/
 * climb.ts, copied on 2026-11-18 so this page can go further without touching the live page's module):
 * past the shelf the camera rises until you look down on the records lying in a ring, with how the
 * collection came about in the middle, a passage at a time. Then this page's stretch:
 *
 *   1. The last passage lifts away, and under where it stood the notebook catches the lamp's light.
 *   2. The camera comes down over it and straightens until it looks straight down, near enough to read.
 *      The records pass out to the edges of the picture: they are drawn by the carousel from this
 *      camera ("v4:camera"), so they and the notebook move as one floor.
 *   3. The cover opens, onto the page of the record at the front of the ring. From there the ring turns
 *      the pages (notebook.ts).
 *   4. A breath, and the page moves on.
 *
 * Nothing here plays on its own: every frame is drawn from where the page's scroll is, followed by a
 * short critically damped spring (as v4's), so it follows the hand both ways and going back up is the
 * same film backwards. Only transform and opacity are written on a scroll frame, plus visibility when
 * the notebook first comes and goes.
 */
import { onPage } from '@/scripts/page';
import { Spring, clamp } from '@/components/music/v4/physics';
import type { CameraView } from '@/components/music/v4/climb';

const TILT = 56; // degrees: a floor seen from above and in front, not a plan
const GAP = 1.06; // a sleeve's width and a little air, along the ring
/* v4's stretch of scroll, in screens, and its parts as shares of it: the camera rises, then the
   collection's passages fill one after another. */
const BASE = 2.9;
const CAMERA_UNTIL = 0.38;
const WORDS_FROM = 0.4;
const WORDS_UNTIL = 0.96;
// A passage's own share of the words' stretch: it comes in, fills, is held lit, and makes way.
const PAGE_IN = 0.08;
const PAGE_FULL = 0.82;
const PAGE_OUT = 0.9;
/* This page's stretch after it, in screens, and its parts as shares of it. */
const NOTEBOOK = 1.6;
const LAST_OUT: [number, number] = [0, 0.12]; // the last passage lifts away
const LIGHT: [number, number] = [0.02, 0.3]; // the notebook comes into the lamp's light
const DOWN: [number, number] = [0.06, 0.52]; // the camera comes down to it
const OPEN: [number, number] = [0.5, 0.8]; // the cover opens; then it is held open to the end
/** The whole stretch the stage stays on screen for, in screens (the CSS reads it as --climb-run). */
const RUN = BASE * WORDS_UNTIL + NOTEBOOK;

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('[data-music-page].v4');
  const track = root?.querySelector<HTMLElement>('[data-climb]');
  const nb = track?.querySelector<HTMLElement>('[data-cn]');
  if (root && track && nb) init(root, track, nb, signal);
});

function init(root: HTMLElement, track: HTMLElement, nb: HTMLElement, signal: AbortSignal) {
  const q = (sel: string) => track.querySelector<HTMLElement>(sel)!;
  const stage = q('[data-climb-stage]');
  const row = q('[data-v4-row]');
  const rowTrack = q('.v4-row__track');
  const sleeve = q('[data-vinyl]');
  const count = track.querySelectorAll('[data-vinyl]').length;
  const head = q('[data-climb-head]');
  const wall = q('[data-climb-wall]');
  const floor = q('[data-climb-floor]');
  const caption = q('[data-v4-caption]');
  const hint = q('[data-cn-hint]');
  // The notebook's parts that come into the light one by one (the notebook itself can't be faded: a
  // see-through layer would flatten the leaf and the cover, which turn in depth).
  const lit = ['.cn-pool', '.cn-page--left', '.cn-page--right', '.cn-board', '.cn-spiral'].map((s) => nb.querySelector<HTMLElement>(s)!);
  // With reduced motion there is no climb (the CSS lays the page out without one), and nothing to do.
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const say = (view: CameraView) => root.dispatchEvent(new CustomEvent('v4:camera', { detail: view }));
  track.style.setProperty('--climb-run', `${(RUN * 100).toFixed(1)}svh`);

  /* The passages. In each, a word starts filling when the light reaches its first letter and is full
     at its last: where each word starts and ends along the passage is counted in letters, so the light
     moves through it at an even pace however long the words are. */
  const LEAD = 5; // letters the soft edge of the light runs ahead
  interface Line { from: number; to: number; span: number; win: HTMLElement; copy: HTMLElement }
  const pages = [...track.querySelectorAll<HTMLElement>('[data-climb-page]')].map((el) => {
    const words = [...el.querySelectorAll<HTMLElement>('[data-w]')];
    let length = 0;
    const spans = words.map((w) => {
      const from = length;
      length += (w.textContent ?? '').length + 1; // and the space after it
      return { from, to: length - 1 };
    });
    return { el, words, spans, length, lines: [] as Line[] };
  });

  // What is on screen, so that a value that hasn't changed isn't written again.
  const written = new Map<HTMLElement, Record<string, string>>([[caption, {}]]);
  function css(el: HTMLElement, prop: 'transform' | 'opacity' | 'visibility', value: string) {
    let w = written.get(el);
    if (!w) written.set(el, (w = {}));
    if (w[prop] === value) return;
    w[prop] = value;
    el.style[prop] = value;
  }

  /* The light along the words (as v4's): each line gets a white copy of its text laid exactly over it,
     inside a window whose right edge fades out over a few letters. Lighting a line slides the window
     along it and the copy back by the same amount: two transforms per line, nothing painted again. */
  const PAD = 0.25; // em around a line's box, for ink past it
  function lightLines() {
    for (const page of pages) {
      page.el.querySelector('.cn-lit')?.remove();
      for (const line of page.lines) written.delete(line.win), written.delete(line.copy);
      page.lines = [];
      const box = page.el.getBoundingClientRect();
      const pad = (parseFloat(getComputedStyle(page.el).fontSize) || 16) * PAD;
      const layer = document.createElement('span');
      layer.className = 'cn-lit';
      layer.setAttribute('aria-hidden', 'true');
      const rects = page.words.map((w) => w.getBoundingClientRect());
      let start = 0;
      for (let k = 1; k <= page.words.length; k++) {
        if (k < page.words.length && Math.abs(rects[k]!.top - rects[start]!.top) < 2) continue;
        const first = rects[start]!, last = rects[k - 1]!;
        const width = last.right - first.left;
        const from = page.spans[start]!.from, to = page.spans[k - 1]!.to;
        const edge = (width / Math.max(1, to - from)) * LEAD;
        const win = document.createElement('span');
        win.className = 'cn-lit__win';
        win.style.cssText = `left:${(first.left - box.left - pad).toFixed(2)}px;top:${(first.top - box.top - pad).toFixed(2)}px;width:${(width + 2 * pad + edge).toFixed(2)}px;height:${(first.height + 2 * pad).toFixed(2)}px;--edge:${edge.toFixed(2)}px`;
        const copy = document.createElement('span');
        copy.className = 'cn-lit__line';
        copy.style.cssText = `left:${pad.toFixed(2)}px;top:${pad.toFixed(2)}px;line-height:${first.height.toFixed(2)}px`;
        copy.textContent = page.words.slice(start, k).map((w) => w.textContent).join(' ');
        win.append(copy);
        layer.append(win);
        page.lines.push({ from, to, span: width + 2 * pad + edge, win, copy });
        start = k;
      }
      page.el.append(layer);
      page.el.classList.add('is-armed');
    }
  }
  function lightUp(page: (typeof pages)[number], at: number) {
    for (const line of page.lines) {
      const k = clamp((at - line.from) / (line.to + LEAD - line.from), 0, 1);
      const shift = (k - 1) * line.span;
      css(line.win, 'transform', `translate3d(${shift.toFixed(2)}px,0,0)`);
      css(line.copy, 'transform', `translate3d(${(-shift).toFixed(2)}px,0,0)`);
    }
  }

  /* ---------------------------------------------------------------- where the ring lies on this screen */
  let view: CameraView = { w: 0, R: 0, zoom: 1, y: 0, tilt: TILT, far: 1 };
  let lead = 0; // how far below the top of the screen the stage still is when the camera starts
  let screen = 1; // the stage's height: a screen, in px
  let run = 1; // px of scroll the stage stays on screen for
  let trackTop = 0; // where the stretch starts in the page
  let line = 0; // the sleeves' centres in the row, down the stage
  let capTop = 0; // the caption's top as laid out, down the stage
  let edge = 0; // from the ring's centre to its sleeves' outer corners, on the floor
  let captionShift = 0;
  // Where the camera is above the ring (v4's), and where it ends over the notebook.
  let zoom0 = 1, centre0 = 0;
  let zoomEnd = 1, centreEnd = 0, panEnd = 0;
  // The notebook, open flat, as it is drawn once the camera is over it (px).
  let pw = 0, ph = 0, gap = 0, spreadW = 0, stageW = 0;

  function measure() {
    // As the page lays it out at the shelf: the row is only made as large as the stage while the camera
    // is up (see the CSS), and its place before that is what everything is measured from.
    track.classList.remove('is-climbing');
    caption.style.transform = '';
    written.get(caption)!.transform = '';
    const st = stage.getBoundingClientRect();
    const rw = row.getBoundingClientRect();
    const cap = caption.getBoundingClientRect();
    const S = sleeve.offsetWidth;
    line = rw.top - st.top + sleeve.offsetTop + S / 2;
    capTop = cap.top - st.top;
    stageW = st.width;
    track.style.setProperty('--room-top', `${Math.max(0, rw.top - st.top).toFixed(1)}px`);
    track.style.setProperty('--room-bottom', `${Math.max(0, st.bottom - rw.bottom).toFixed(1)}px`);

    // The ring, at the size of the records at the shelf: wide enough for them to lie side by side.
    const R = (S * GAP) / (2 * Math.sin(Math.PI / count));
    const far = R * 4.2;
    const a = (TILT * Math.PI) / 180;
    const near = (z: number) => far / (far - z * Math.cos(a));
    edge = Math.hypot(R + S / 2, S / 2);
    const down = edge * Math.sin(a) * near(edge);
    const up = edge * Math.sin(a) * near(-edge);
    let side = 0;
    for (let deg = 60; deg <= 110; deg += 2) {
      const th = (deg * Math.PI) / 180;
      side = Math.max(side, edge * Math.sin(th) * near(edge * Math.cos(th)));
    }
    const inner = R - S / 2;
    const innerDown = inner * Math.sin(a) * near(inner);
    const innerUp = inner * Math.sin(a) * near(-inner);

    const top = 68; // under the island
    const bottom = st.height - cap.height - 44;
    const wide = st.width >= 700 ? st.width - 48 : st.width * 1.42;
    zoom0 = Math.min(1, wide / (2 * side), (bottom - top) / (down + up));
    centre0 = top + (bottom - top - (down + up) * zoom0) / 2 + up * zoom0;

    view = { ...view, R, zoom: zoom0, y: centre0 - line, tilt: TILT, far };
    captionShift = centre0 + down * zoom0 + 18 - capTop;

    stage.style.setProperty('--ring-y', `${centre0.toFixed(1)}px`);
    stage.style.setProperty('--ring-w', `${(side * zoom0 * 3).toFixed(1)}px`);
    stage.style.setProperty('--ring-h', `${((down + up) * zoom0 * 1.5).toFixed(1)}px`);
    const wordsW = Math.min(st.width - 40, inner * zoom0 * 2 * 0.84);
    stage.style.setProperty('--words-y', `${(centre0 + ((innerDown - innerUp) * zoom0) / 2).toFixed(1)}px`);
    stage.style.setProperty('--words-w', `${wordsW.toFixed(1)}px`);
    stage.style.setProperty('--words-fs', `${clamp(wordsW / 13.5, 17, 36).toFixed(1)}px`);

    /* The notebook. Its pages are drawn at the size they are read at, so its text is sharp there: on a
       wide screen the whole spread fits under the island; on a phone a page is most of the width, and
       the camera frames the right-hand page with the spiral at the screen's left edge. On the floor it
       lies in the clear middle of the ring, its corners short of the sleeves' inner edges: that gives
       how far the camera has to come down for it to be this size. */
    const phone = st.width < 700;
    // Room under it for the line that says how its pages turn.
    const roomH = st.height - top - (phone ? 64 : 76);
    if (phone) {
      pw = Math.min(st.width * 0.84, roomH / 1.414);
    } else {
      pw = Math.min(roomH / 1.414, 500, (st.width - 120) / 2.045);
    }
    ph = pw * 1.414;
    gap = pw * 0.045;
    spreadW = pw * 2 + gap;
    const halfDiag = Math.hypot(spreadW / 2, ph / 2);
    zoomEnd = Math.max(zoom0 * 1.2, halfDiag / (inner * 0.94));
    centreEnd = top + roomH / 2 + (phone ? 0 : 4);
    stage.style.setProperty('--cn-hint-y', `${(centreEnd + ph / 2 + (phone ? 14 : 18)).toFixed(1)}px`);
    panEnd = phone ? -(pw + gap) / 2 : 0;
    // Without the climb the notebook keeps the size its CSS gives it, lying open after the passages.
    if (!still.matches) {
      nb.style.setProperty('--pw', `${pw.toFixed(2)}px`);
      nb.style.setProperty('--ph', `${ph.toFixed(2)}px`);
      nb.style.setProperty('--gap', `${gap.toFixed(2)}px`);
      nb.style.setProperty('--hole', `${(pw * 0.03).toFixed(2)}px`);
      nb.style.width = `${spreadW.toFixed(2)}px`;
      nb.style.height = `${ph.toFixed(2)}px`;
    }

    lightLines();
    screen = st.height;
    run = Math.max(1, track.offsetHeight - st.height);
    trackTop = track.getBoundingClientRect().top + scrollY;
    lead = Math.min(trackTop, innerHeight * 0.22);
    drawn = NaN;
  }

  /* ---------------------------------------------------------------- one frame, from where the scroll is */
  const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const part = (t: number, from: number, to: number) => clamp((t - from) / (to - from), 0, 1);
  const parts = (t: number, [from, to]: [number, number]) => part(t, from, to);

  // The scroll, followed by a short critically damped spring (v4's: it evens out an iPhone's uneven
  // scroll steps, a few hundredths of a second behind the hand).
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
  function follow(snap = false) {
    const y = scrollY;
    const from = trackTop - lead - innerHeight, to = trackTop + run + innerHeight;
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

  let opened = NaN;
  function draw(y: number) {
    if (still.matches) return;
    const top = trackTop - y;
    if (top === drawn) return;
    drawn = top;

    const base = screen * BASE; // v4's stretch, in px
    const w = ease(clamp((lead - top) / (lead + base * CAMERA_UNTIL), 0, 1));
    const light = part(-top / base, WORDS_FROM, WORDS_UNTIL);
    // This page's stretch, from 0 (the last passage lit and held) to 1.
    const s = clamp((-top - base * WORDS_UNTIL) / (screen * NOTEBOOK), 0, 1);
    const down = ease(parts(s, DOWN));
    const open = ease(parts(s, OPEN));
    const glow = ease(parts(s, LIGHT));

    track.classList.toggle('is-climbing', w > 0);

    /* The camera: v4's above the ring, then down over the notebook. It straightens from 56° to looking
       straight down, comes nearer (scale, evenly: a ratio a step), and moves to keep the notebook in the
       middle of the picture; on a phone, its right-hand page. */
    const tilt = TILT + (90 - TILT) * down;
    const Z = zoom0 * Math.pow(zoomEnd / zoom0, down);
    const centre = centre0 + (centreEnd - centre0) * down;
    const pan = panEnd * down;
    view = { ...view, w, zoom: Z, y: centre - line, tilt };
    say(view);
    css(rowTrack, 'transform', pan ? `translate3d(${pan.toFixed(2)}px,0,0)` : '');

    const gone = part(w, 0, 0.34);
    css(head, 'opacity', (1 - gone).toFixed(3));
    css(head, 'transform', gone ? `translate3d(0,${(-56 * gone).toFixed(1)}px,0)` : '');
    css(wall, 'opacity', (1 - part(w, 0, 0.6)).toFixed(3));
    // The ring's pool of light gives way to the notebook's.
    css(floor, 'opacity', (part(w, 0.35, 1) * (1 - down)).toFixed(3));
    // The record's name stays under the ring's front record, and goes out of the picture with it.
    if (s > 0) {
      const a = (tilt * Math.PI) / 180;
      const front = centre + edge * Math.sin(a) * (view.far / (view.far - edge * Math.cos(a))) * Z;
      css(caption, 'transform', `translate3d(0,${(front + 18 - capTop).toFixed(1)}px,0)`);
    } else {
      css(caption, 'transform', w ? `translate3d(0,${(captionShift * w).toFixed(1)}px,0)` : '');
    }

    const along = light * pages.length;
    pages.forEach((page, i) => {
      const t = clamp(along - i, 0, 1);
      const arrive = i === 0 ? part(w, 0.86, 1) : part(t, 0, PAGE_IN);
      const leave = i === pages.length - 1 ? parts(s, LAST_OUT) : part(t, PAGE_OUT, 1);
      const shown = arrive * (1 - leave);
      css(page.el, 'opacity', shown.toFixed(3));
      css(page.el, 'transform', `translate3d(0,${((1 - arrive) * 12 - leave * 12).toFixed(1)}px,0)`);
      lightUp(page, part(t, i === 0 ? 0 : PAGE_IN, PAGE_FULL) * (page.length + LEAD));
    });

    /* The notebook, lying on the floor at the ring's centre, drawn by the same camera as the sleeves:
       the same perspective and the same look down, at the size the camera's place gives it (1 once it
       is read). Hidden until this stretch begins, so the climb is the live page's to the frame. */
    css(nb, 'visibility', s > 0 ? 'visible' : 'hidden');
    if (s > 0) {
      const x = stageW / 2 + pan - spreadW / 2;
      const yy = centre - ph / 2;
      const k = Z / zoomEnd;
      css(nb, 'transform', `translate3d(${x.toFixed(2)}px,${yy.toFixed(2)}px,0) scale(${k.toFixed(4)}) perspective(${(view.far * zoomEnd).toFixed(0)}px) rotateX(${(90 - tilt).toFixed(3)}deg)`);
      for (const el of lit) css(el, 'opacity', glow.toFixed(3));
    }
    // The line saying how the pages turn, once the cover is open.
    css(hint, 'opacity', ease(part(s, 0.78, 0.88)).toFixed(3));
    if (open !== opened) {
      opened = open;
      root.dispatchEvent(new CustomEvent('cuaderno:open', { detail: { open } }));
    }
  }

  measure();
  follow(true);
  window.addEventListener('scroll', () => follow(), { passive: true, signal });
  let size = `${innerWidth}x${stage.offsetHeight}`;
  const again = () => {
    const now = `${innerWidth}x${stage.offsetHeight}`;
    if (now === size && !still.matches) return follow();
    size = now;
    measure();
    follow(true);
  };
  window.addEventListener('resize', again, { signal });
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
      for (const el of [head, wall, floor, caption, rowTrack, nb, hint, ...lit, ...pages.map((page) => page.el)]) el.removeAttribute('style');
      for (const page of pages) {
        page.el.querySelector('.cn-lit')?.remove();
        page.el.classList.remove('is-armed');
        page.lines = [];
      }
      written.clear();
      written.set(caption, {});
      root.dispatchEvent(new CustomEvent('cuaderno:open', { detail: { open: 1 } }));
    } else {
      measure();
      follow(true);
    }
  }, { signal });
  document.fonts?.ready.then(() => {
    if (signal.aborted || still.matches) return;
    measure();
    follow(true);
  });
  signal.addEventListener('abort', () => cancelAnimationFrame(frame));
}
