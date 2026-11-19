/**
 * Music, way "radio": the climb, and the session after it. Copied from the music page's climb
 * (v4/climb.ts, as it stood on 2026-11-18, with the spring that follows the scroll) so that this page
 * can carry it on without touching the live one.
 *
 * Past the shelf the page does not scroll on to something else. The stage stays on screen, and the
 * scroll raises the camera: the records leave their row, lie down on the floor in a ring, and you end
 * up looking down on them, with how the collection came about standing in the middle. Scrolling further
 * fills those words with light, a letter at a time, one passage after another.
 *
 * Then the session (session.ts): the last passage makes way, and the records come up out of the ring one
 * at a time, oldest first, to stand in the middle of it, each named underneath, its year rolling on
 * number wheels from the one before; twice the presenter talks between them. A record comes up from the
 * place it lies in and goes back down into it, leaving a gap in the ring while it is out.
 *
 * Nothing here plays on its own: every frame is drawn from where the page's scroll is, so it follows
 * the hand both ways, stops where the hand stops, and going back up is the same film backwards
 * (apple-design: with the gesture, interruptible at any frame). Except the words. Whatever is to be
 * read in the middle (a passage, the record on the deck's name, the presenter's line) is a state, not a
 * place in the scroll: one thing holds the middle at a time, chosen from the scroll with a little
 * hysteresis, and it comes in and goes in a moment on its own clock. Faded with the scroll, a name
 * left the hand stopping half-way through a handover with a name at a third of its strength; now
 * wherever the hand stops, the words there are whole. The light filling a line still follows the
 * scroll: that is the reading, as on the music page. The year on the deck rolls on a spring to the
 * record's year, so it never rests between two digits. It follows the scroll through a short,
 * critically damped spring rather than to the pixel, which evens out the uneven steps an iPhone tells
 * the page of (see v4/climb.ts).
 *
 * The records are the carousel's own (listening-bar.ts), not copies: this module works out where the
 * camera is, where the ring lies on this screen and which records are on their way to or from the
 * middle, and says so on the page's root as "radio:camera". The carousel draws its sleeves from that, so
 * a record on the deck is a real sleeve: pressed, it comes out to you from where it stands.
 *
 * Only transform and opacity are written on a scroll frame, each on a layer of its own, and only when
 * they have changed. The words are the one exception: a word being filled is repainted (one or two
 * small words a frame). No frame is asked for while the scroll is still.
 */
import { onPage } from '@/scripts/page';
import { Spring, clamp } from './physics';
import { byYear, CLIMB, cues, DOWN, LINE_FILL, LINE_IN, LINE_OUT, UP, UP_FIRST } from './session';

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
  /** The session: the records out of the ring, by id, 0 lying in their place to 1 standing on the deck. */
  deck: { id: string; t: number }[];
  /** The deck's middle, below the line the sleeves' centres stand on in the row, and a record's size there. */
  deckY: number;
  deckS: number;
  /** How much the rest of the ring is dimmed while a record is on the deck, 0 to 1. */
  dim: number;
  /** How far the name under the ring has gone: the deck names its own record. 0 to 1. */
  hush: number;
}

const TILT = 56; // degrees: a floor seen from above and in front, not a plan
const GAP = 1.06; // a sleeve's width and a little air, along the ring
// The stretch of scroll, in svh from where the stage reaches the top of the screen: the camera rises,
// then the passages fill one after another (the music page's own shares of its 290svh), then the session.
const CAMERA_UNTIL = 0.38 * CLIMB;
const WORDS_FROM = 0.4 * CLIMB;
const WORDS_UNTIL = 0.96 * CLIMB;
// A passage's own share of the words' stretch: it comes in, fills, is held lit, and makes way.
const PAGE_IN = 0.08;
const PAGE_FULL = 0.82;
const PAGE_OUT = 0.9;
const CAP_GAP = 14; // px between the record on the deck and its name

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('[data-radio-page].v4');
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
  const pool = q('[data-radio-pool]');
  const cast = q('[data-radio-cast]');
  // With reduced motion there is no climb (the CSS lays the page out without one), and nothing to do.
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const say = (view: CameraView) => root.dispatchEvent(new CustomEvent('radio:camera', { detail: view }));

  /* Words filled with light: the passages, and the presenter's lines. In each, a word starts filling
     when the light reaches its first letter and is full at its last: where each word starts and ends
     along the line is counted in letters, so the light moves through it at an even pace however long
     the words are. */
  const LEAD = 5; // letters the soft edge of the light runs ahead
  const lit = (el: HTMLElement) => {
    const words = [...el.querySelectorAll<HTMLElement>('[data-w]')];
    let length = 0;
    const spans = words.map((w) => {
      const from = length;
      length += (w.textContent ?? '').length + 1; // and the space after it
      return { from, to: length - 1 };
    });
    return { el, words, spans, length, fills: new Array<string>(words.length).fill('') };
  };
  type Lit = ReturnType<typeof lit>;
  const fillTo = (page: Lit, at: number) => {
    for (let k = 0; k < page.words.length; k++) {
      const span = page.spans[k]!;
      // Full once the light's soft edge has passed its last letter.
      const f = clamp((at - span.from) / (span.to - span.from + LEAD), 0, 1).toFixed(3);
      if (page.fills[k] !== f) page.words[k]!.style.setProperty('--f', (page.fills[k] = f));
    }
  };
  const pages = [...track.querySelectorAll<HTMLElement>('[data-climb-page]')].map(lit);
  const lines = new Map([...track.querySelectorAll<HTMLElement>('[data-radio-line]')].map((el) => [el.dataset.radioLine!, lit(el)]));

  // The names on the deck, each with its year's four wheels.
  const names = new Map([...track.querySelectorAll<HTMLElement>('[data-radio-cap]')].map((el) => [
    el.dataset.radioCap!,
    { el, wheels: [...el.querySelectorAll<HTMLElement>('[data-radio-wheel]')] },
  ]));
  const firstRecord = cues.findIndex((c) => c.kind === 'record');

  /* What can hold the middle, in the order the scroll comes to them: the three passages, then the
     session's records (their names) and the presenter's lines. -1 is nothing (the camera not up yet). */
  type Holder = { el: HTMLElement; year?: number };
  const holders: Holder[] = [
    ...pages.map((page) => ({ el: page.el })),
    ...cues.map((cue) => (cue.kind === 'record'
      ? { el: names.get(cue.record.id)!.el, year: cue.record.year }
      : { el: lines.get(cue.key)!.el })),
  ];
  const sessionFrom = pages.length; // the first holder that is the session's
  const presence = new Float32Array(holders.length);
  let owner = -1; // what holds the middle (an index into holders), -1 nothing
  let lastS = NaN;
  const SWITCH = 0.2; // how much more present the next holder must be than the one holding the middle
  /** Hand the middle to holder `to`: what held it goes the way the scroll is going, and what comes,
      comes from that side (up when scrolling on, down when scrolling back). */
  let shown = -1; // what is on screen in the middle: the holder, once there is something of it to read
  let goingOn = true; // the scroll's last direction: on down the page, or back up it
  function hold(to: number, instant: boolean) {
    const from = shown;
    if (to === from) return;
    shown = to;
    if (from >= sessionFrom) leaving = from;
    const dir = goingOn ? 1 : -1;
    if (from >= 0) {
      const el = holders[from]!.el;
      el.style.setProperty('--shift', `${-dir * 8}px`);
      el.classList.toggle('is-instant', instant);
      el.classList.remove('is-on');
    }
    if (to >= 0) {
      const el = holders[to]!.el;
      el.style.setProperty('--shift', `${dir * 8}px`);
      el.classList.toggle('is-instant', instant);
      void getComputedStyle(el).transform; // start from that side, not from wherever it last went
      el.classList.add('is-on');
      const y = holders[to]!.year;
      if (y !== undefined) {
        if (instant) year.set(y);
        else year.to(y);
      }
    }
    if (!instant) wake();
  }
  /* The year on the deck: from the record before, rolled on to this one's on a spring, critically
     damped (apple-design: no overshoot on something that wasn't thrown). */
  const year = new Spring(byYear[0]!.year, { response: 0.32, damping: 1 }, 0.001);
  let yearDrawn = NaN;

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
  let view: CameraView = { w: 0, R: 0, zoom: 1, y: 0, tilt: TILT, far: 1, deck: [], deckY: 0, deckS: 0, dim: 0, hush: 0 };
  let lead = 0; // how far below the top of the screen the stage still is when the camera starts
  let run = 1; // px of scroll the stage stays on screen for
  let unit = 1; // px in 1svh: the stage is 100svh tall
  let captionShift = 0;
  // Where the stretch starts in the page, so that a frame needs only the scroll position (scrollY) and
  // never asks the browser to lay the page out mid-scroll. Measured again whenever the page's size changes.
  let trackTop = 0;
  /* Where the stretch starts down the page, as laid out. Not from its box on screen: the intro brings the
     shelf in with a transform (24px, intro.ts), and measured then the whole session ran 3svh behind the
     scroll until the window was resized. */
  const layoutTop = (el: HTMLElement) => {
    let y = 0;
    for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) y += e.offsetTop;
    return y;
  };

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

    captionShift = centre + down * zoom + 18 - (cap.top - st.top);

    // The pool of light under the ring, and the words in the middle of it.
    stage.style.setProperty('--ring-y', `${centre.toFixed(1)}px`);
    stage.style.setProperty('--ring-w', `${(side * zoom * 3).toFixed(1)}px`);
    stage.style.setProperty('--ring-h', `${((down + up) * zoom * 1.5).toFixed(1)}px`);
    const wordsW = Math.min(st.width - 40, inner * zoom * 2 * 0.84);
    const wordsY = centre + ((innerDown - innerUp) * zoom) / 2;
    stage.style.setProperty('--words-y', `${wordsY.toFixed(1)}px`);
    stage.style.setProperty('--words-w', `${wordsW.toFixed(1)}px`);
    // Some twenty-seven letters to the line: a passage is five lines or so, and fits the clear floor.
    stage.style.setProperty('--words-fs', `${clamp(wordsW / 13.5, 17, 36).toFixed(1)}px`);

    // The deck: a record standing in the middle of the ring with its name under it, the two together
    // centred on the clear floor. It stands nearer than the back of the ring, so it may stand in front
    // of the sleeves lying there, a little larger than the clear floor is tall.
    const capW = Math.min(st.width - 32, Math.max(wordsW * 1.1, 240));
    stage.style.setProperty('--deck-cap-w', `${capW.toFixed(1)}px`);
    let capH = 0;
    for (const { el } of names.values()) capH = Math.max(capH, el.offsetHeight);
    // The name must never sit on a sleeve: the whole of it (record, gap, name) goes between the island
    // and the inner edge of the sleeve lying at the front of the ring, with some air above that edge.
    const roof = top + 8;
    const sill = centre + innerDown * zoom - 18;
    const deckS = clamp(Math.min(sill - roof - CAP_GAP - capH, wordsW * 0.7, 280), 96, 280);
    const blockH = deckS + CAP_GAP + capH;
    const blockTop = clamp(wordsY - blockH / 2, roof, Math.max(roof, sill - blockH));
    const deckMid = blockTop + deckS / 2;
    stage.style.setProperty('--deck-y', `${deckMid.toFixed(1)}px`);
    stage.style.setProperty('--deck-s', `${deckS.toFixed(1)}px`);
    stage.style.setProperty('--deck-cap-top', `${(blockTop + deckS + CAP_GAP).toFixed(1)}px`);

    view = { ...view, R, zoom, y: centre - line, tilt: TILT, far, deckY: deckMid - line, deckS };

    run = Math.max(1, track.offsetHeight - st.height);
    unit = st.height / 100;
    trackTop = layoutTop(track);
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
     short (response 0.18 s), as on the music page: a steady scroll is followed about 60 ms behind, and
     when the hand stops the camera settles. */
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
    const rolled = year.step(dt);
    paintYear();
    if (!settled || !rolled) frame = requestAnimationFrame(tick);
    else last = 0;
  }
  /** Something moves on its own clock (the year): make sure frames come. */
  function wake() {
    if (!frame) frame = requestAnimationFrame(tick);
  }
  /** The year's wheels, on the names that can be seen: the one holding the middle and the one leaving it. */
  let leaving = -1;
  function paintYear() {
    if (year.value === yearDrawn) return;
    yearDrawn = year.value;
    const wheels = wheelsFor(year.value);
    for (const i of [shown, leaving]) {
      if (i < sessionFrom) continue;
      const name = names.get(holderId(i));
      name?.wheels.forEach((el, k) => css(el, 'transform', `translate3d(0,${(-wheels[k]! * 1.25).toFixed(3)}em,0)`));
    }
  }
  const holderId = (i: number) => {
    const cue = cues[i - sessionFrom];
    return cue && cue.kind === 'record' ? cue.record.id : '';
  };
  /** The scroll moved: follow it. Far from the stretch on both counts (the page scrolled elsewhere), or
      on the first frame, there is nothing to see move, and the spring is simply put there. */
  function follow(snap = false) {
    const y = scrollY;
    const from = trackTop - lead - innerHeight, to = trackTop + run + innerHeight;
    const outside = (v: number) => (v < from ? -1 : v > to ? 1 : 0);
    if (snap || (outside(y) !== 0 && outside(y) === outside(at.value))) {
      at.set(y);
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      draw(y, true);
      year.set(year.target);
      return paintYear();
    }
    at.to(y);
    if (!frame) frame = requestAnimationFrame(tick);
  }

  /** The four wheels of a year that may be part of the way to the next: an odometer, so a wheel turns
      on only while every wheel to its right is going from 9 to 0. Each, in digits from 0. */
  function wheelsFor(year: number) {
    const whole = Math.floor(year);
    const frac = year - whole;
    return [1000, 100, 10, 1].map((p) => {
      const digit = Math.floor(whole / p) % 10;
      const below = whole % p;
      return digit + (p === 1 || below === p - 1 ? frac : 0);
    });
  }

  function draw(y: number, instant = false) {
    if (still.matches) return;
    const top = trackTop - y;
    if (top === drawn) return;
    drawn = top;
    const s = -top / unit; // svh of the stretch scrolled

    const w = ease(clamp((lead - top) / (lead + CAMERA_UNTIL * unit), 0, 1));
    const light = part(s, WORDS_FROM, WORDS_UNTIL);

    /* The session, from the running order. */
    const deck: CameraView['deck'] = [];
    let dim = 0;
    let lifted = 0; // how far the record on the deck has stood up: its shadow is under it then
    for (let c = 0; c < cues.length; c++) {
      const cue = cues[c]!;
      const next = cues[c + 1];
      const local = (s - cue.start) / cue.len;
      const nextLocal = next ? (s - next.start) / next.len : -1;
      if (cue.kind === 'record') {
        const up = c === firstRecord ? UP_FIRST : UP;
        const rise = part(local, up.from, up.to);
        // It goes down as what comes after it begins: the next record, or the presenter (sooner, so the
        // line has the middle to itself).
        const fall = !next ? 0 : next.kind === 'record' ? part(nextLocal, DOWN.from, DOWN.to) : part(nextLocal, 0, 0.3);
        const t = rise * (1 - fall);
        if (t > 0) deck.push({ id: cue.record.id, t });
        dim = Math.max(dim, ease(clamp(t * 1.4, 0, 1)));
        lifted = Math.max(lifted, ease(part(t, 0.55, 1)));
        // How much its name belongs in the middle: as much as the record is out on the deck.
        presence[sessionFrom + c] = t;
      } else {
        const line = lines.get(cue.key);
        if (!line) continue;
        const arrive = part(local, LINE_IN.from, LINE_IN.to);
        const leave = next ? part(nextLocal, LINE_OUT.from, LINE_OUT.to) : 0;
        presence[sessionFrom + c] = arrive * (1 - leave);
        fillTo(line, part(local, LINE_FILL.from, LINE_FILL.to) * (line.length + LEAD));
      }
    }
    css(pool, 'opacity', dim.toFixed(3));
    css(cast, 'opacity', lifted.toFixed(3));

    // The row takes the whole stage as soon as the camera leaves the shelf, and gives it back there.
    track.classList.toggle('is-climbing', w > 0);
    view.w = w;
    view.deck = deck;
    view.dim = dim;
    say(view); // (whether the ring's own name goes is settled below, once it is known what holds the middle)

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
    // the light is. Each one fills, is held, and lifts away as the next comes up into its place; the
    // last as the session begins.
    const along = light * pages.length;
    const first = cues[0];
    pages.forEach((page, i) => {
      const t = clamp(along - i, 0, 1);
      const arrive = i === 0 ? part(w, 0.86, 1) : part(t, 0, PAGE_IN);
      // The last one makes way as the first record of the session comes up out of the ring.
      const leave = i < pages.length - 1 ? part(t, PAGE_OUT, 1) : first ? part(s, first.start, first.start + first.len * 0.3) : 0;
      presence[i] = arrive * (1 - leave);
      fillTo(page, part(t, i === 0 ? 0 : PAGE_IN, PAGE_FULL) * (page.length + LEAD));
    });

    /* Who holds the middle. The most present, once it is clearly more present than what holds it now;
       so a holder fading out keeps the middle until the next is a fifth of the way in, and going back
       the same, a little further back: no flicker for a hand resting on the line. Before the first
       passage is half in, nothing. */
    let best = -1;
    for (let i = 0; i < holders.length; i++) if (presence[i]! > (best < 0 ? 0 : presence[best]!)) best = i;
    const now = owner < 0 ? 0 : presence[owner]!;
    let to = owner;
    if (presence[0]! < 0.5 && s < WORDS_FROM) to = -1;
    else if (best >= 0 && best !== owner && presence[best]! >= now + SWITCH) to = best;
    else if (owner < 0 && presence[0]! >= 0.5) to = 0;
    owner = to;
    if (Number.isFinite(lastS) && s !== lastS) goingOn = s > lastS;
    lastS = s;

    /* What of it is shown. A passage or a line, as soon as it holds the middle. A record's name only
       once the record stands on the deck: a record on its way passes where its name goes (the one from
       the front of the ring comes up right through it), and a name over a sleeve can't be read. With a
       little hysteresis again, so a hand resting there doesn't make it flicker. */
    let show = owner;
    const deckIdx = owner - sessionFrom;
    if (deckIdx >= 0 && cues[deckIdx]!.kind === 'record') {
      const t = presence[owner]!;
      show = t >= 0.88 || (shown === owner && t >= 0.8) ? owner : -1;
    }
    if (show !== shown) {
      hold(show, instant);
      yearDrawn = NaN;
      paintYear();
    }
    const hush = owner >= sessionFrom ? 1 : 0;
    if (view.hush !== hush) {
      view.hush = hush;
      say(view);
    }
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
    const top = layoutTop(track);
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
      say({ ...view, w: 0, deck: [], dim: 0, hush: 0 });
      for (const h of holders) h.el.classList.remove('is-on', 'is-instant');
      owner = shown = leaving = -1;
      const drawnEls = [head, wall, floor, caption, pool, cast, ...pages.map((p) => p.el), ...[...lines.values()].map((l) => l.el)];
      for (const { el } of names.values()) drawnEls.push(el);
      for (const el of drawnEls) el.removeAttribute('style');
      for (const page of [...pages, ...lines.values()]) {
        page.words.forEach((el) => el.style.removeProperty('--f'));
        page.fills.fill('');
      }
      written.clear();
      written.set(caption, {});
    } else {
      measure();
      follow(true);
    }
  }, { signal });
  // Fonts arriving change the caption's height by a line at most; the stage's own size is what matters.
  document.fonts?.ready.then(() => !signal.aborted && again());
  signal.addEventListener('abort', () => cancelAnimationFrame(frame));
}
