/**
 * Music, way "atlas": the climb, and the threads between the records once the camera is above them.
 * A copy of v4/climb.ts, carried on (v4's own file is shared with /music and is not touched). The first
 * stretch is that file's, at the same pace: the camera rises, the records lie down in a ring, and the
 * passages in the middle fill with light. Then:
 *
 *   1. The last passage lifts away, the record's name under the ring goes, and the camera rises a little
 *      further and draws back until the whole ring is on the screen, with room under it for a legend.
 *   2. One route at a time (routes.ts), the records it is about stay lit and the others step back into
 *      the dark; a thread of light is drawn with the scroll from the older record to the newer, its
 *      name comes up along it, and the legend says what they share. A route's threads stay on, dimmer,
 *      as the next is drawn.
 *   3. All eleven: every thread at once. Then the record at the front of the ring lights its own
 *      threads and the rest recede; turn the ring and the light goes to the record that comes to the
 *      front, and the legend says what that one is tied to. With a mouse, the record pointed at takes
 *      the light instead. A tap still takes a record out: nothing here takes a press.
 *
 * As in the climb, the scroll's part has no state of its own and nothing plays: every frame is drawn
 * from where the page's scroll is (followed through the same short spring), so it goes both ways and
 * stops where the hand stops. The threads are tied to the carousel's own sleeves: they are laid from
 * where the carousel says the ring is ("v4:turn"), in the same frame it draws the sleeves, so they go
 * round with the ring under a hand. The one thing that eases on its own is the light moving from one
 * record's threads to another's (about a tenth of a second, from wherever it is).
 *
 * Sleeves, steps and the caption are only ever moved and faded (transform, opacity, each on a layer of
 * its own). The threads are one SVG under the records, repainted on a frame where they move.
 */
import { onPage } from '@/scripts/page';
import { Spring, clamp } from '../v4/physics';
import type { CameraView } from '../v4/climb';
import { vinyls } from '@/data/music';
import { START } from '../v4/start';
import { routes, atlasCopy } from './routes';
import { threads, ties, around, tie, bow, pathOf, readingPathOf, measureQuad, along, nameSide, DY, type Pt, type Quad } from './geometry';

const TILT = 56; // degrees: a floor seen from above and in front, not a plan
const TILT_ATLAS = 68; // and for the map: higher, so the threads and their names are less foreshortened
const GAP = 1.06; // a sleeve's width and a little air, along the ring

/* The stretch of scroll, in svh from the moment the stage is pinned. Up to 278 it is the climb as on
   /music (its shares of 290svh); the rest is this way's. */
const RUN = 735; // the whole stretch: the section's --climb-run
const CAMERA_UNTIL = 110.2;
const WORDS_FROM = 116;
const WORDS_UNTIL = 278.4;
const PAGE_IN = 0.08;
const PAGE_FULL = 0.82;
const PAGE_OUT = 0.9;
const LAST_OUT: Span = [296, 310]; // the last passage goes too, now: the floor is needed for the map
const CAPTION_OUT: Span = [298, 312];
const REFRAME: Span = [300, 346]; // the camera rises a little more and draws back to the whole ring
const INTRO_FROM = 318;
const ROUTES_FROM = 352;
const UNIT = 33; // a route's share, for a weight of 1
type Span = readonly [number, number];
const WINDOWS: Span[] = (() => {
  let s = ROUTES_FROM;
  return routes.map((r) => [s, (s += UNIT * (r.weight ?? 1))] as const);
})();
const ALL_FROM = WINDOWS[WINDOWS.length - 1]![1];
const ALL_REST: Span = [ALL_FROM, ALL_FROM + 14]; // every thread comes up to the same light
const FOCUS: Span = [ALL_FROM + 20, ALL_FROM + 38]; // and the front record's come forward
// From there to RUN is a breath before the page moves on.

/** How lit a thread is, at rest after its route, and once every thread is there. */
const REST = 0.3;
const ALL = 0.68;
/** With one record in the light: its threads, and the others. */
const OTHERS = 0.13;
/** A sleeve the route (or the record in the light) isn't about: this much of it is left. */
const DIM = 0.34;
const EASE_LIGHT = 0.09; // s: the light moving from one record's threads to another's

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('[data-music-page].atlas');
  const track = root?.querySelector<HTMLElement>('[data-climb]');
  if (root && track) init(root, track, signal);
});

function init(root: HTMLElement, track: HTMLElement, signal: AbortSignal) {
  const q = (sel: string) => track.querySelector<HTMLElement>(sel)!;
  const stage = q('[data-climb-stage]');
  const row = q('[data-v4-row]');
  const buttons = [...track.querySelectorAll<HTMLElement>('[data-vinyl]')];
  const sleeve = buttons[0]!;
  const count = buttons.length;
  const head = q('[data-climb-head]');
  const wall = q('[data-climb-wall]');
  const floor = q('[data-climb-floor]');
  const caption = q('[data-v4-caption]');
  const capwrap = q('[data-atlas-capwrap]');
  const legend = q('[data-atlas-legend]');
  const steps = [...legend.querySelectorAll<HTMLElement>('[data-atlas-step]')];
  const tiedText = legend.querySelector<HTMLElement>('[data-atlas-tied]')!;
  const svg = track.querySelector<SVGSVGElement>('[data-atlas-svg]')!;
  // With reduced motion there is no climb (the CSS lays the page out without one), and nothing to do.
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = matchMedia('(hover: hover) and (pointer: fine)');
  const say = (view: CameraView) => root.dispatchEvent(new CustomEvent('v4:camera', { detail: view }));

  /* The passages, as in the climb: a word fills as the light along the passage reaches it. */
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

  // What is on screen, so that a value that hasn't changed isn't written again.
  const written = new Map<Element, Record<string, string>>();
  function css(el: HTMLElement, prop: 'transform' | 'opacity', value: string) {
    let w = written.get(el);
    if (!w) written.set(el, (w = {}));
    if (w[prop] === value) return;
    w[prop] = value;
    el.style[prop] = value;
  }
  function attr(el: Element, name: string, value: string) {
    let w = written.get(el);
    if (!w) written.set(el, (w = {}));
    if (w[name] === value) return;
    w[name] = value;
    el.setAttribute(name, value);
  }
  function prop(el: HTMLElement, name: string, value: string) {
    let w = written.get(el);
    if (!w) written.set(el, (w = {}));
    if (w[name] === value) return;
    w[name] = value;
    el.style.setProperty(name, value);
  }

  /* The threads, as the page built them (Atlas.astro). */
  const lines = threads.map((t) => {
    const g = svg.querySelector<SVGGElement>(`[data-atlas-thread="${t.key}"]`)!;
    return {
      t,
      g,
      halo: g.querySelector<SVGPathElement>('.atlas-thread__halo')!,
      core: g.querySelector<SVGPathElement>('.atlas-thread__core')!,
      from: g.querySelector<SVGCircleElement>('[data-atlas-end="from"]')!,
      to: g.querySelector<SVGCircleElement>('[data-atlas-end="to"]')!,
      head: g.querySelector<SVGCircleElement>('.atlas-thread__head')!,
      label: g.querySelector<SVGTextElement>('.atlas-thread__label'),
      text: g.querySelector<SVGTextPathElement>('textPath'),
      side: 'above' as 'above' | 'below',
      reading: svg.querySelector<SVGPathElement>(`#atlas-r-${t.key}`)!,
      grad: svg.querySelector<SVGLinearGradientElement>(`#atlas-g-${t.key}`)!,
      textWidth: 0,
      window: WINDOWS[t.route]!,
    };
  });

  /* ---------------------------------------------------------------- where the ring lies on this screen */
  let view: CameraView = { w: 0, R: 0, zoom: 1, y: 0, tilt: TILT, far: 1 };
  let lead = 0; // how far below the top of the screen the stage still is when the camera starts
  let run = 1; // px of scroll the stage stays on screen for
  let sv = 1; // px in an svh of the stretch
  let captionShift = 0;
  let trackTop = 0;
  let S = 0;
  let line = 0; // the sleeves' centres, down the stage, in the row
  let cx = 0; // the ring's centre, across the stage
  // The camera at the end of the climb, and over the map.
  const climbCam = { zoom: 1, centre: 0 };
  const mapCam = { zoom: 1, centre: 0 };

  /** How far the ring reaches on screen from its centre, seen at `tilt`. */
  function reach(R: number, far: number, tilt: number) {
    const a = (tilt * Math.PI) / 180;
    const near = (z: number) => far / (far - z * Math.cos(a));
    const edge = Math.hypot(R + S / 2, S / 2);
    let side = 0;
    for (let deg = 60; deg <= 110; deg += 2) {
      const th = (deg * Math.PI) / 180;
      side = Math.max(side, edge * Math.sin(th) * near(edge * Math.cos(th)));
    }
    const inner = R - S / 2;
    return {
      down: edge * Math.sin(a) * near(edge),
      up: edge * Math.sin(a) * near(-edge),
      side,
      innerDown: inner * Math.sin(a) * near(inner),
      innerUp: inner * Math.sin(a) * near(-inner),
    };
  }

  function measure() {
    // As the page lays it out at the shelf: the row is only made as large as the stage while the camera
    // is up (see v4's CSS), and its place before that is what everything is measured from.
    track.classList.remove('is-climbing');
    caption.style.transform = '';
    (written.get(caption) ?? {}).transform = '';
    const st = stage.getBoundingClientRect();
    const rw = row.getBoundingClientRect();
    const cap = caption.getBoundingClientRect();
    const lg = legend.getBoundingClientRect();
    S = sleeve.offsetWidth;
    line = rw.top - st.top + sleeve.offsetTop + S / 2;
    cx = rw.left - st.left + rw.width / 2;
    track.style.setProperty('--room-top', `${Math.max(0, rw.top - st.top).toFixed(1)}px`);
    track.style.setProperty('--room-bottom', `${Math.max(0, st.bottom - rw.bottom).toFixed(1)}px`);

    // The ring, at the size of the records at the shelf: wide enough for them to lie side by side.
    const R = (S * GAP) / (2 * Math.sin(Math.PI / count));
    const far = R * 4.2;

    // The climb's view, as on /music: between the island and the record's name, wider than a phone.
    const c = reach(R, far, TILT);
    const top = 68; // under the island
    const bottom = st.height - cap.height - 44;
    const wide = st.width >= 700 ? st.width - 48 : st.width * 1.42;
    const zoom = Math.min(1, wide / (2 * c.side), (bottom - top) / (c.down + c.up));
    const centre = top + (bottom - top - (c.down + c.up) * zoom) / 2 + c.up * zoom;
    climbCam.zoom = zoom;
    climbCam.centre = centre;
    captionShift = centre + c.down * zoom + 18 - (cap.top - st.top);

    // The map's: the whole ring on the screen, a phone's too, between the island and the legend.
    const m = reach(R, far, TILT_ATLAS);
    const mTop = 72;
    const mBottom = lg.top - st.top - 20;
    const mWide = st.width >= 700 ? st.width - 96 : st.width - 14;
    mapCam.zoom = Math.min(1, mWide / (2 * m.side), (mBottom - mTop) / (m.down + m.up));
    mapCam.centre = mTop + (mBottom - mTop - (m.down + m.up) * mapCam.zoom) / 2 + m.up * mapCam.zoom;

    view = { ...view, R, zoom, y: centre - line, tilt: TILT, far };

    // The pool of light under the ring, and the words in the middle of it.
    stage.style.setProperty('--ring-y', `${centre.toFixed(1)}px`);
    stage.style.setProperty('--ring-w', `${(c.side * zoom * 3).toFixed(1)}px`);
    stage.style.setProperty('--ring-h', `${((c.down + c.up) * zoom * 1.5).toFixed(1)}px`);
    const wordsW = Math.min(st.width - 40, (R - S / 2) * zoom * 2 * 0.84);
    stage.style.setProperty('--words-y', `${(centre + ((c.innerDown - c.innerUp) * zoom) / 2).toFixed(1)}px`);
    stage.style.setProperty('--words-w', `${wordsW.toFixed(1)}px`);
    stage.style.setProperty('--words-fs', `${clamp(wordsW / 13.5, 17, 36).toFixed(1)}px`);

    run = Math.max(1, track.offsetHeight - st.height);
    sv = run / RUN;
    trackTop = track.getBoundingClientRect().top + scrollY;
    lead = Math.min(trackTop, innerHeight * 0.22);
    // The names are measured again: their size changes with the screen's.
    for (const l of lines) l.textWidth = 0;
    drawn = NaN;
  }

  /* ---------------------------------------------------------------- one frame, from where the scroll is */
  // Smootherstep: starts and stops without a jolt, wherever in the scroll that falls.
  const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const part = (t: number, from: number, to: number) => clamp((t - from) / (to - from), 0, 1);
  const within = (t: number, span: Span) => part(t, span[0], span[1]);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

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

  /** Where the scroll is in the stretch, in svh: below 0 before the stage is pinned. */
  let s = -Infinity;

  function draw(y: number) {
    if (still.matches) return;
    const top = trackTop - y;
    if (top === drawn) return;
    drawn = top;
    s = -top / sv;

    const w = ease(clamp((lead - top) / (lead + CAMERA_UNTIL * sv), 0, 1));
    const light = part(s, WORDS_FROM, WORDS_UNTIL);
    // The camera over the map: a little higher, drawn back to the whole ring.
    const m = ease(within(s, REFRAME));
    const zoom = lerp(climbCam.zoom, mapCam.zoom, m);
    const centre = lerp(climbCam.centre, mapCam.centre, m);

    track.classList.toggle('is-climbing', w > 0);
    view.w = w;
    view.zoom = zoom;
    view.y = centre - line;
    view.tilt = lerp(TILT, TILT_ATLAS, m);
    say(view);

    const gone = part(w, 0, 0.34);
    css(head, 'opacity', (1 - gone).toFixed(3));
    css(head, 'transform', gone ? `translate3d(0,${(-56 * gone).toFixed(1)}px,0)` : '');
    css(wall, 'opacity', (1 - part(w, 0, 0.6)).toFixed(3));
    // The pool of light stays under the ring as the camera draws back, and dims while routes are told.
    const dark = routesDim();
    css(floor, 'opacity', (part(w, 0.35, 1) * (1 - 0.3 * dark)).toFixed(3));
    css(floor, 'transform', m
      ? `translate3d(0,${(centre - climbCam.centre).toFixed(1)}px,0) scale(${((4 * zoom) / climbCam.zoom).toFixed(4)})`
      : 'scale(4)');
    css(caption, 'transform', w ? `translate3d(0,${(captionShift * w).toFixed(1)}px,0)` : '');
    css(capwrap, 'opacity', (1 - within(s, CAPTION_OUT)).toFixed(3));

    // The passages, as in the climb; the last one makes way too now.
    const along_ = light * pages.length;
    pages.forEach((page, i) => {
      const t = clamp(along_ - i, 0, 1);
      const arrive = i === 0 ? part(w, 0.86, 1) : part(t, 0, PAGE_IN);
      const leave = i === pages.length - 1 ? within(s, LAST_OUT) : part(t, PAGE_OUT, 1);
      css(page.el, 'opacity', (arrive * (1 - leave)).toFixed(3));
      css(page.el, 'transform', `translate3d(0,${((1 - arrive) * 12 - leave * 12).toFixed(1)}px,0)`);
      const lit = part(t, i === 0 ? 0 : PAGE_IN, PAGE_FULL) * (page.length + LEAD);
      for (let k = 0; k < page.words.length; k++) {
        const span = page.spans[k]!;
        const f = clamp((lit - span.from) / (span.to - span.from + LEAD), 0, 1).toFixed(3);
        if (page.fills[k] !== f) page.words[k]!.style.setProperty('--f', (page.fills[k] = f));
      }
    });

    // The legend: one step at a time, each coming up into its place as the one before lifts away.
    const spans: Span[] = [[INTRO_FROM, ROUTES_FROM], ...WINDOWS, [ALL_FROM, Infinity]];
    steps.forEach((el, i) => {
      const [a, b] = spans[i]!;
      const arrive = part(s, a, a + 5);
      const leave = b === Infinity ? 0 : part(s, b - 4, b);
      css(el, 'opacity', (arrive * (1 - leave)).toFixed(3));
      css(el, 'transform', `translate3d(0,${((1 - arrive) * 10 - leave * 10).toFixed(1)}px,0)`);
    });

    paintAtlas();
  }

  /* ---------------------------------------------------------------- the light on one record's threads */
  /* Once every thread is there, one record has the light: the one at the front of the ring, or with a
     mouse the one pointed at. When it changes, each thread and sleeve eases to its new light from where
     it is, so a ring turning under a finger hands the light on from one record to the next. */
  let front = Math.max(0, buttons.findIndex((b) => b.hasAttribute('data-start')));
  if (front < 0) front = START;
  let hovered = -1;
  const focused = () => (hovered >= 0 && pointer.matches ? hovered : front);
  const touches = (i: number) => (t: (typeof threads)[number]) => t.fromIndex === i || t.toIndex === i;
  const lineLit: number[] = lines.map((l) => (touches(focused())(l.t) ? 1 : 0));
  const sleeveLit: number[] = buttons.map((_, i) => (ties[focused()]!.includes(i) ? 1 : 0));
  let easing = 0;
  let easeLast = 0;
  let saidTied = -1;
  function relight() {
    const f = focused();
    if (f !== saidTied) {
      saidTied = f;
      const others = [...new Set(ties[f]!.slice(1))].map((j) => vinyls[j]!.title);
      tiedText.textContent = atlasCopy.all.tied(vinyls[f]!.title, others);
      if (focusShare() > 0) tiedText.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
    }
    if (!easing) easing = requestAnimationFrame(easeLight);
  }
  function easeLight(now: number) {
    easing = 0;
    const dt = easeLast ? Math.min(1 / 30, (now - easeLast) / 1000) : 1 / 60;
    easeLast = now;
    const k = 1 - Math.exp(-dt / EASE_LIGHT);
    const f = focused();
    let moving = false;
    const step = (v: number, to: number) => {
      const next = Math.abs(to - v) < 0.004 ? to : v + (to - v) * k;
      if (next !== to) moving = true;
      return next;
    };
    lines.forEach((l, i) => (lineLit[i] = step(lineLit[i]!, touches(f)(l.t) ? 1 : 0)));
    buttons.forEach((_, i) => (sleeveLit[i] = step(sleeveLit[i]!, ties[f]!.includes(i) ? 1 : 0)));
    paintAtlas();
    if (moving) easing = requestAnimationFrame(easeLight);
    else easeLast = 0;
  }
  root.addEventListener('v4:centre', (e) => {
    front = (e as CustomEvent<{ index: number }>).detail.index;
    relight();
  }, { signal });
  // With a mouse: the record under it. Only reading where the pointer is; the carousel keeps the press.
  row.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const b = (e.target as Element).closest<HTMLElement>('[data-vinyl]');
    const i = b ? buttons.indexOf(b) : -1;
    if (i === hovered) return;
    hovered = i;
    relight();
  }, { signal });
  row.addEventListener('pointerleave', () => {
    if (hovered < 0) return;
    hovered = -1;
    relight();
  }, { signal });
  root.addEventListener('v4:open', () => {
    hovered = -1;
    relight();
  }, { signal });

  /* ---------------------------------------------------------------- the threads */
  let pos = front; // where the carousel says the ring is, in records
  root.addEventListener('v4:turn', (e) => {
    pos = (e as CustomEvent<{ pos: number }>).detail.pos;
    // Said from the carousel's own frame, after it has placed the sleeves: the threads go with them.
    paintAtlas();
  }, { signal });

  /** How far into the dark the records the route isn't about have gone. */
  const routesDim = () => part(s, ROUTES_FROM - 6, ROUTES_FROM + 4) * (1 - part(s, ALL_FROM, ALL_FROM + 12));
  const focusShare = () => within(s, FOCUS);
  let shown = false; // whether anything of the threads is on screen

  function paintAtlas() {
    if (still.matches || !Number.isFinite(s)) return;
    const F = focusShare();
    const D = routesDim();

    // The sleeves: lit while their route is told, or while they share the light.
    buttons.forEach((b, i) => {
      let lit = 0;
      routes.forEach((r, k) => {
        if (!r.threads.some((t) => t.from === vinyls[i]!.id || t.to === vinyls[i]!.id)) return;
        const [a, z] = WINDOWS[k]!;
        lit = Math.max(lit, part(s, a - 2, a + 4) * (1 - part(s, z - 2, z + 4)));
      });
      const told = 1 - D * (1 - lit) * (1 - DIM);
      const face = lerp(told, lerp(DIM, 1, sleeveLit[i]!), F);
      prop(b, '--atlas-face', face.toFixed(3));
    });

    if (s < ROUTES_FROM) {
      if (shown) for (const l of lines) attr(l.g, 'opacity', '0');
      shown = false;
      return;
    }
    shown = true;

    // The ring on the screen now: where its centre is, and how it is seen.
    const a = (view.tilt * view.w * Math.PI) / 180;
    const { R, far, zoom } = view;
    const centre = line + view.y * view.w;
    const project = (p: { across: number; toward: number }): Pt => {
      const k = (far / (far - p.toward * Math.cos(a))) * zoom;
      return { x: cx + p.across * k, y: centre + p.toward * Math.sin(a) * k };
    };
    const O = { x: cx, y: centre };
    const inner = R - S / 2 - S * 0.07; // the sleeves' inner edges, and a little air
    const spread = S * 0.42;
    const rest = lerp(REST, ALL, within(s, ALL_REST));

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      const { t } = l;
      const [a0, b0] = l.window;
      const L = b0 - a0;
      const d0 = a0 + L * (0.14 + (t.step * 0.5) / t.steps);
      const d1 = a0 + L * (0.14 + ((t.step + 1) * 0.5) / t.steps);
      const drawn_ = ease(part(s, d0, d1));
      if (drawn_ <= 0) {
        attr(l.g, 'opacity', '0');
        continue;
      }
      const base = lerp(1, rest, part(s, b0, b0 + 6));
      const lit = lerp(base, lerp(OTHERS, 1, lineLit[i]!), F);
      attr(l.g, 'opacity', lit.toFixed(3));

      const q: Quad = bow(
        project(tie(around(t.fromIndex - pos), t.fromSlot, inner, spread)),
        project(tie(around(t.toIndex - pos), t.toSlot, inner, spread)),
        O,
        t.pull,
      );
      const d = pathOf(q);
      attr(l.core, 'd', d);
      attr(l.halo, 'd', d);
      attr(l.reading, 'd', readingPathOf(q));
      attr(l.grad, 'x1', q.a.x.toFixed(1));
      attr(l.grad, 'y1', q.a.y.toFixed(1));
      attr(l.grad, 'x2', q.b.x.toFixed(1));
      attr(l.grad, 'y2', q.b.y.toFixed(1));
      attr(l.from, 'cx', q.a.x.toFixed(1));
      attr(l.from, 'cy', q.a.y.toFixed(1));
      attr(l.to, 'cx', q.b.x.toFixed(1));
      attr(l.to, 'cy', q.b.y.toFixed(1));
      attr(l.to, 'opacity', part(drawn_, 0.92, 1).toFixed(3));

      // Drawn from its older record: the light runs along it as far as the scroll has come.
      const lengths = measureQuad(q);
      const length = lengths[lengths.length - 1]!;
      if (drawn_ >= 1) {
        attr(l.core, 'stroke-dasharray', 'none');
        attr(l.halo, 'stroke-dasharray', 'none');
        attr(l.head, 'opacity', '0');
      } else {
        const dash = `${length.toFixed(1)} ${length.toFixed(1)}`;
        const off = (length * (1 - drawn_)).toFixed(1);
        attr(l.core, 'stroke-dasharray', dash);
        attr(l.halo, 'stroke-dasharray', dash);
        attr(l.core, 'stroke-dashoffset', off);
        attr(l.halo, 'stroke-dashoffset', off);
        const p = along(q, lengths, drawn_);
        attr(l.head, 'cx', p.x.toFixed(1));
        attr(l.head, 'cy', p.y.toFixed(1));
        attr(l.head, 'opacity', Math.min(1, drawn_ * 10, (1 - drawn_) * 10).toFixed(3));
      }

      // Its name: while its route is told, once it is drawn; then only while its record has the light.
      // A thread at rest is a line with no name, so the names never pile up in the middle of the ring.
      // In the light, the name moves along towards the thread's far end: the threads of one record all
      // leave it side by side, and their names are clear of each other only out where they part.
      if (l.label && l.text) {
        const told = part(s, d1 - 0.02 * L, d1 + 0.1 * L) * (1 - part(s, b0, b0 + 6));
        const named = lerp(told, lineLit[i]!, F);
        const f = focused();
        const fromIsFocus = t.fromIndex === f;
        // Is the focused end at the start of the path the name is set on (always read left to right)?
        const focusAtStart = (q.a.x <= q.b.x) === fromIsFocus;
        const toward = t.fromIndex === f || t.toIndex === f ? (focusAtStart ? 0.68 : 0.32) : 0.5;
        const offset = lerp(0.5, toward, F * lineLit[i]!);
        attr(l.text, 'startOffset', `${(offset * 100).toFixed(1)}%`);
        l.side = nameSide(q, l.side);
        attr(l.label, 'dy', DY[l.side]);
        if (!l.textWidth) l.textWidth = l.label.getComputedTextLength();
        // Room for it either side of where it is centred.
        const room = 2 * Math.min(offset, 1 - offset) * length * 0.94;
        const fit = l.textWidth ? clamp((room - l.textWidth) / 16, 0, 1) : 1;
        attr(l.label, 'opacity', (named * fit).toFixed(3));
      }
    }
  }

  /* ---------------------------------------------------------------- setting up, and keeping up */
  function reset() {
    track.classList.remove('is-climbing');
    say({ ...view, w: 0 });
    for (const el of [head, wall, floor, caption, capwrap, ...steps, ...pages.map((page) => page.el)]) el.removeAttribute('style');
    for (const page of pages) {
      page.words.forEach((el) => el.style.removeProperty('--f'));
      page.fills.fill('');
    }
    for (const b of buttons) b.style.removeProperty('--atlas-face');
    for (const l of lines) l.g.setAttribute('opacity', '0');
    written.clear();
    s = -Infinity;
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
    if (still.matches) reset();
    else {
      measure();
      follow(true);
    }
  }, { signal });
  document.fonts?.ready.then(() => {
    if (signal.aborted) return;
    for (const l of lines) l.textWidth = 0;
    again();
  });
  signal.addEventListener('abort', () => {
    cancelAnimationFrame(frame);
    cancelAnimationFrame(easing);
  });
}
