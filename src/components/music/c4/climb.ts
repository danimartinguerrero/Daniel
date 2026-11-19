/**
 * Music, way c4: the climb, and what the scroll goes on to make once the camera is above the ring.
 * A copy of v4/climb.ts, carried on. The first stretch is that file's, at the same pace: the camera
 * rises, the records lie down in a ring, and the passages in the middle fill with light. Then, with
 * nothing brought in from outside:
 *
 *   1. A sliver of each cover lifts off its sleeve, one after another round the ring, and they stand
 *      together in the middle as a twelfth sleeve made of the other eleven.
 *   2. The camera comes down towards it and it comes to the front, as a record taken out does; the
 *      ring goes dark behind it.
 *   3. Its disc rolls out. Side A says what its owner plays, and fills with light; the disc turns
 *      over, and side B says what he makes.
 *   4. The disc goes back in, film shrinks onto the sleeve, and it is laid down in the middle of the
 *      ring, the camera back above it.
 *
 * As in the climb, nothing has a state of its own and nothing plays: every frame is drawn from where
 * the page's scroll is, so it follows the hand both ways and stops where the hand stops. The eleven
 * sleeves are the carousel's own and stay whole on the floor (a sliver is a sample: the record it
 * comes from is still there to take out and unwrap), and the ring still turns under a hand while the
 * slivers are in the air: each one leaves from where its sleeve lies now ("v4:turn"). The one thing
 * here that moves on its own is the disc, out of its sleeve: a finger turns it, it keeps the speed it
 * was let go at, and slows to a stop.
 *
 * Only transform and opacity are written on a scroll frame, each on a layer of its own, and only when
 * they have changed; the carousel is only told the camera has moved when it has. A word being filled
 * is repainted, as in the climb. No frame is asked for while the scroll and the disc are still.
 */
import { onPage } from '@/scripts/page';
import { VelocityTracker, clamp } from '../v4/physics';
import type { CameraView } from '../v4/climb';

const TILT = 56; // degrees: a floor seen from above and in front, not a plan
const GAP = 1.06; // a sleeve's width and a little air, along the ring

/* The stretch of scroll, in svh from the moment the stage is pinned. Up to 278 it is the climb as it
   was (its shares of 290svh); the rest is this way's. */
const RUN = 705; // the whole stretch: the section's --climb-run
const CAMERA_UNTIL = 110.2;
/** The passages in the ring: where each one's stretch starts and ends, and, within it, when it has
    come in, when it is full, and when it starts to make way. */
const PAGES = [
  { from: 116, to: 170.1, full: 0.82, out: 0.9 },
  { from: 170.1, to: 224.3, full: 0.82, out: 0.9 },
  { from: 224.3, to: 278.4, full: 0.82, out: 0.9 },
  { from: 278.4, to: 322, full: 0.5, out: 0.8 }, // "I make music too.": short, held lit, gone as the slivers rise
];
const PAGE_IN = 0.08;
const NAME_OUT = [296, 312]; // the name of the record at the front of the ring goes: the ring isn't about it now
const LIFT = [312, 404]; // the slivers leave their sleeves and stand together
const COME = [404, 458]; // the new sleeve comes to the front, the camera down towards it
const DISC_OUT = [430, 474];
const SIDE_A = { in: [444, 454], fill: [454, 502], out: [508, 518] };
const FLIP = [508, 538];
const SIDE_B = { in: [528, 538], fill: [538, 598], out: [606, 616] };
const DISC_IN = [606, 634];
const SLACK = [622, 640]; // the film comes on, loose
const TAUT = [636, 658]; // and shrinks to the sleeve
const HOME = [642, 690]; // it is laid down in the middle of the ring; the camera goes back up
const NAME_IN = [678, 692];

const PUSH = 0.5; // how much nearer the camera comes, as a share of its distance
const DIP = 12; // and how many degrees lower it looks
const SLICE = 0.42; // a sliver's own share of the lift; the eleven overlap
const REACH = 0.7; // how far out of the sleeve the disc comes, in sleeves: its whole label clears the sleeve
const SPREAD = 0.98 + REACH; // the sleeve and its disc out, in sleeves, from edge to edge

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('[data-music-page].v4');
  const track = root?.querySelector<HTMLElement>('[data-climb]');
  if (root && track) init(root, track, signal);
});

function init(root: HTMLElement, track: HTMLElement, signal: AbortSignal) {
  const q = (sel: string) => track.querySelector<HTMLElement>(sel)!;
  const all = (sel: string) => [...track.querySelectorAll<HTMLElement>(sel)];
  const stage = q('[data-climb-stage]');
  const row = q('[data-v4-row]');
  const sleeve = q('[data-vinyl]');
  const sleeves = all('[data-vinyl]');
  const count = sleeves.length;
  const head = q('[data-climb-head]');
  const wall = q('[data-climb-wall]');
  const floor = q('[data-climb-floor]');
  const caption = q('[data-v4-caption]');
  // This way's own.
  const capWrap = q('[data-c4-capwrap]');
  const film = q('[data-c4-film]');
  const scrim = q('[data-c4-scrim]');
  const cast = q('[data-c4-cast]');
  const rec = q('[data-c4-rec]');
  const slices = all('[data-c4-slice]');
  const glints = slices.map((el) => el.querySelector<HTMLElement>('[data-c4-glint]')!);
  const finish = q('[data-c4-finish]');
  const slack = q('[data-c4-slack]');
  const taut = q('[data-c4-taut]');
  const disc = q('[data-c4-disc]');
  const flipEl = q('[data-c4-flip]');
  const turnEl = q('[data-c4-turn]');
  const labels = all('[data-c4-label]');
  const notes = q('[data-c4-notes]');
  const name = q('[data-c4-caption]');
  // With reduced motion there is no film (the CSS lays the page out without one), and nothing to do.
  const still = matchMedia('(prefers-reduced-motion: reduce)');

  /* A passage of words that fills with light. A word starts filling when the light reaches its first
     letter and is full at its last: where each starts and ends is counted in letters, so the light
     moves at an even pace however long the words are. */
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
  const pages = all('[data-climb-page]').map(lit);
  const sides = all('[data-c4-note]').map(lit);
  /** Fill a passage up to `amount` of the way (0 to 1). */
  function fill(page: Lit, amount: number) {
    const at = amount * (page.length + LEAD);
    for (let k = 0; k < page.words.length; k++) {
      const span = page.spans[k]!;
      // Full once the light's soft edge has passed its last letter.
      const f = clamp((at - span.from) / (span.to - span.from + LEAD), 0, 1).toFixed(3);
      if (page.fills[k] !== f) page.words[k]!.style.setProperty('--f', (page.fills[k] = f));
    }
  }

  /* ---------------------------------------------------------------- where things lie on this screen */
  let view: CameraView = { w: 0, R: 0, zoom: 1, y: 0, tilt: TILT, far: 1 }; // the camera above the ring
  let lead = 0; // how far below the top of the screen the stage still is when the camera starts
  let run = 1; // px of scroll the stage stays on screen for
  let captionShift = 0;
  let S = 0; // a sleeve's size at the shelf
  let E = 0; // the new sleeve's size in front of you; its box is laid out at this size
  let fit = 1; // how much smaller it is drawn with its disc out, to fit a phone
  let stand = { y: 0, m: 1 }; // standing in the middle of the ring: px below the sleeves' line, and its size (of E)
  let front = 0; // in front of you: px below the sleeves' line
  // Where the ring is turned to, in records (the carousel says so as it turns).
  let pos = Math.max(0, sleeves.findIndex((b) => b.hasAttribute('data-start')));

  function measure() {
    // As the page lays it out at the shelf: the row is only made as large as the stage while the camera
    // is up (see the CSS), and its place before that is what everything is measured from.
    track.classList.remove('is-climbing');
    const st = stage.getBoundingClientRect();
    const rw = row.getBoundingClientRect();
    const cap = caption.getBoundingClientRect();
    S = sleeve.offsetWidth;
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
    // screen and runs off both sides, as a floor does when you stand over it.
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
    const wordsY = centre + ((innerDown - innerUp) * zoom) / 2;
    stage.style.setProperty('--words-y', `${wordsY.toFixed(1)}px`);
    stage.style.setProperty('--words-w', `${wordsW.toFixed(1)}px`);
    stage.style.setProperty('--words-fs', `${clamp(wordsW / 13.5, 17, 36).toFixed(1)}px`);

    /* The new sleeve. In front of you it is the size a record taken out is, and its box is laid out at
       that size, so it is never drawn larger than it was painted. With its disc out it is 1.68
       sleeves wide, and shrinks to fit a phone. It and the sentence under it are centred between the
       island and the bottom of the stage. */
    E = Math.max(200, Math.min(340, st.width * 0.76, st.height - 330));
    fit = Math.min(1, (st.width - 32) / (E * SPREAD));
    stage.style.setProperty('--c4-so', `${E.toFixed(1)}px`);
    stage.style.setProperty('--c4-line', `${line.toFixed(1)}px`);
    stage.style.setProperty('--c4-notes-fs', `${clamp(st.width * 0.062, 22, 34).toFixed(1)}px`);
    const gap = 30;
    const block = E * fit + gap + notes.offsetHeight;
    const blockTop = top + Math.max(0, (st.height - top - 24 - block) / 2);
    front = blockTop + (E * fit) / 2 - line;
    stage.style.setProperty('--c4-notes-y', `${(blockTop + E * fit + gap).toFixed(1)}px`);
    // Standing in the middle of the ring, where the passages were: as large as the clear floor lets it.
    stand = {
      y: wordsY - line,
      m: Math.min(inner * zoom * 2 * 0.56, (innerDown + innerUp) * zoom * 0.66, E) / E,
    };
    // Its name goes where the front record's name was, under the ring.
    stage.style.setProperty('--c4-cap-y', `${(cap.top - st.top + captionShift).toFixed(1)}px`);

    run = Math.max(1, track.offsetHeight - st.height);
    // The camera starts a little before the stage reaches the top of the screen, so the first of the
    // scroll already moves it; never before the page has been scrolled at all.
    lead = Math.min(track.getBoundingClientRect().top + scrollY, innerHeight * 0.22);
    drawn = NaN;
    told = '';
  }

  /* ---------------------------------------------------------------- the records, from the camera's place
     As the carousel draws them (listening-bar.ts, `place` and `turn3d`), for a camera that is all the
     way up: where the record d places from the front of the ring lies, in px from the sleeves' line,
     how much larger or smaller it is drawn (`k`), and how it is turned. */
  const around = (d: number) => d - count * Math.round(d / count);
  function lying(d: number, cam: CameraView) {
    const th = (d * 2 * Math.PI) / count;
    const a = (cam.tilt * Math.PI) / 180;
    const toward = cam.R * Math.cos(th);
    const k = (cam.far / (cam.far - toward * Math.cos(a))) * cam.zoom;
    return { x: cam.R * Math.sin(th) * k, y: cam.y + toward * Math.sin(a) * k, k, pitch: cam.tilt, yaw: (d * 360) / count, lay: 90 };
  }
  /** The camera's look down (`pitch`), then a facing round the ring (`yaw`), then lying back on the
      floor (`lay`), in degrees, as one matrix: Rx(-pitch) · Ry(yaw) · Rx(lay). */
  function turn3d(pitch: number, yaw: number, lay: number) {
    const rad = Math.PI / 180;
    const cp = Math.cos(-pitch * rad), sp = Math.sin(-pitch * rad);
    const cy = Math.cos(yaw * rad), sy = Math.sin(yaw * rad);
    const cl = Math.cos(lay * rad), sl = Math.sin(lay * rad);
    const m = [
      cy, sp * sy, -cp * sy,
      sy * sl, cp * cl - sp * cy * sl, sp * cl + cp * cy * sl,
      sy * cl, -cp * sl - sp * cy * cl, -sp * sl + cp * cy * cl,
    ].map((v) => (Math.abs(v) < 1e-6 ? '0' : v.toFixed(6)));
    return `matrix3d(${m[0]},${m[1]},${m[2]},0,${m[3]},${m[4]},${m[5]},0,${m[6]},${m[7]},${m[8]},0,0,0,0,1)`;
  }
  /* The new sleeve's box is E wide where a sleeve's is S. Drawn `m` times its box it stands for a
     sleeve drawn m·E/S times its own, and takes the perspective that sleeve would: the carousel's
     2.6 sleeves, at that size. So lying in the ring it is drawn exactly as the sleeves are. */
  const depth = (m: number) => `perspective(${(2.6 * E * m).toFixed(1)}px)`;

  /* ---------------------------------------------------------------- one frame, from where the scroll is */
  // Smootherstep: starts and stops without a jolt, wherever in the scroll that falls.
  const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const part = (t: number, from: number, to: number) => clamp((t - from) / (to - from), 0, 1);
  const span = (t: number, [from, to]: number[]) => part(t, from!, to!);
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;

  // What is on screen, so that a value that hasn't changed isn't written again.
  type Prop = 'transform' | 'opacity' | 'visibility';
  const written = new Map<HTMLElement, Partial<Record<Prop, string>>>();
  function css(el: HTMLElement, prop: Prop, value: string) {
    let w = written.get(el);
    if (!w) written.set(el, (w = {}));
    if (w[prop] === value) return;
    w[prop] = value;
    el.style[prop] = value;
  }
  // The carousel draws all its sleeves when it is told where the camera is: only when that has changed.
  let told = '';
  function say(cam: CameraView) {
    const key = `${cam.w.toFixed(5)} ${cam.zoom.toFixed(5)} ${cam.tilt.toFixed(3)}`;
    if (key === told) return;
    told = key;
    root.dispatchEvent(new CustomEvent('v4:camera', { detail: cam }));
  }

  // The disc under a finger: how far it has been turned, and how fast it is still turning (degrees).
  let spin = 0;
  let spinSpeed = 0;
  let side = 0; // which side faces you: 0 is A, 1 is B
  let roll = 0; // its turn as it rolls out of the sleeve
  const drawTurn = () => css(turnEl, 'transform', `rotate(${(roll + spin).toFixed(2)}deg)`);

  let drawn = NaN;
  let frame = 0;
  function draw() {
    frame = 0;
    if (still.matches) return;
    const top = track.getBoundingClientRect().top;
    if (top === drawn) return;
    drawn = top;

    const s = (-top / run) * RUN; // svh into the stretch
    const w = ease(clamp((lead - top) / (lead + (run * CAMERA_UNTIL) / RUN), 0, 1));

    const lift = span(s, LIFT);
    const come = ease(span(s, COME));
    const home = span(s, HOME);
    const out = smooth(span(s, DISC_OUT)) * (1 - smooth(span(s, DISC_IN)));
    const over = ease(span(s, FLIP));

    // The camera: up over the ring, then down and in towards the new sleeve, and back up at the end.
    const dive = (0.3 * smooth(lift) + 0.7 * come) * (1 - smooth(part(home, 0, 0.85)));
    const cam: CameraView = { ...view, w, zoom: view.zoom * (1 + PUSH * dive), tilt: TILT - DIP * dive };
    // The row takes the whole stage as soon as the camera leaves the shelf, and gives it back there.
    track.classList.toggle('is-climbing', w > 0);
    say(cam);

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
    css(capWrap, 'opacity', (1 - span(s, NAME_OUT)).toFixed(3));

    // The passages: the first comes up, unlit, once the ring has opened round its place. Each one
    // fills, is held, and lifts away as the next comes up into its place.
    pages.forEach((page, i) => {
      const at = PAGES[Math.min(i, PAGES.length - 1)]!;
      const t = part(s, at.from, at.to);
      const arrive = i === 0 ? part(w, 0.86, 1) : part(t, 0, PAGE_IN);
      const leave = part(t, at.out, 1);
      const shown = arrive * (1 - leave);
      css(page.el, 'opacity', shown.toFixed(3));
      css(page.el, 'visibility', shown === 0 ? 'hidden' : '');
      css(page.el, 'transform', `translate3d(0,${((1 - arrive) * 12 - leave * 12).toFixed(1)}px,0)`);
      fill(page, part(t, i === 0 ? 0 : PAGE_IN, at.full));
    });

    /* The new sleeve. It stands in the middle of the ring while the slivers come to it, comes to the
       front, and at the end is carried over the middle of the ring, already level with the floor,
       and lowered onto it (as a record put back in the ring is: listening-bar.ts, renderHero). */
    const begun = lift > 0;
    css(rec, 'visibility', begun ? 'visible' : 'hidden');
    film.classList.toggle('is-front', come > 0.3 && home < 0.5);
    film.classList.toggle('is-out', out > 0.9);
    if (begun) {
      const shift = -((SPREAD - 1) / 2) * E * fit * out; // it moves over for its disc
      const mFront = 1 - (1 - fit) * out;
      const lie = lying(0, { ...cam, R: 0 }); // the middle of the ring
      const mLie = (S * lie.k) / E;
      if (home === 0) {
        const m = mix(stand.m, mFront, come);
        css(rec, 'transform', `translate3d(${(shift * come).toFixed(2)}px,${mix(stand.y, front, come).toFixed(2)}px,0) scale(${m.toFixed(4)})`);
      } else {
        const across = 1 - (1 - home) * (1 - home);
        const level = smooth(clamp(home / 0.62, 0, 1));
        const down = home * Math.sqrt(home);
        const m = mix(mFront, mLie, down);
        css(rec, 'transform', `translate3d(${(shift * (1 - across)).toFixed(2)}px,${mix(front, lie.y, across).toFixed(2)}px,0) ${depth(m)} ${turn3d(lie.pitch * level, 0, lie.lay * level)} scale(${m.toFixed(4)})`);
      }

      // The slivers, each from where its sleeve lies now to its place in the new one. Inside the new
      // sleeve's box, which stands still while they come: their way across the screen is undone by
      // its place and size.
      const n = slices.length;
      for (let i = 0; i < n; i++) {
        const el = slices[i]!;
        const u = clamp((lift - (i * (1 - SLICE)) / (n - 1)) / SLICE, 0, 1);
        css(el, 'visibility', u > 0 ? 'visible' : 'hidden');
        // Turning to face you, it catches the lamp for a moment.
        const glint = 0.42 * Math.sin(Math.PI * u) ** 2;
        css(glints[i]!, 'opacity', glint.toFixed(3));
        css(glints[i]!, 'visibility', glint < 0.004 ? 'hidden' : 'visible'); // no layer kept for light that isn't there
        if (u === 0) continue;
        if (u === 1) {
          css(el, 'transform', 'none');
          continue;
        }
        const g = lying(around(i - pos), cam);
        const e = ease(u);
        // It comes up off its sleeve before it goes anywhere, and is facing you well before it lands.
        const level = 1 - smooth(clamp((u - 0.06) / 0.7, 0, 1));
        const hop = Math.sin(Math.PI * e) * S * cam.zoom * 0.3;
        const m = mix((S * g.k) / E, stand.m, e);
        const x = mix(g.x, 0, e) / stand.m;
        const y = (mix(g.y, stand.y, e) - hop - stand.y) / stand.m;
        css(el, 'transform', `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) ${depth(m / stand.m)} ${turn3d(g.pitch * level, g.yaw * level, g.lay * level)} scale(${(m / stand.m).toFixed(4)})`);
      }
      // All there: it is one sleeve, with a sleeve's edge and the lamp on it.
      css(finish, 'opacity', part(lift, 0.9, 1).toFixed(3));

      // Its shadow on the floor in the middle of the ring: while it is held over it, and again under
      // it as it is carried back, tightening and gone as it touches down.
      const held = smooth(lift) * (1 - come);
      const landing = smooth(part(home, 0.2, 0.55)) * (1 - smooth(part(home, 0.82, 1)));
      const shade = Math.max(0.5 * held, 0.6 * landing);
      css(cast, 'opacity', shade.toFixed(3));
      if (shade > 0) {
        const m = mLie * (1 + 0.2 * (1 - part(home, 0.5, 1)));
        css(cast, 'transform', `translate3d(0,${(lie.y + S * lie.k * 0.06).toFixed(2)}px,0) ${depth(m)} ${turn3d(lie.pitch, 0, lie.lay)} scale(${m.toFixed(4)})`);
      }

      // The disc rolls out of the sleeve, turning as it travels, and turns over between its sides.
      css(disc, 'visibility', out === 0 ? 'hidden' : 'visible');
      css(disc, 'transform', `translate3d(${(REACH * E * out).toFixed(2)}px,0,0)`);
      roll = (out - 1) * 84;
      drawTurn();
      const deg = 180 * over;
      css(flipEl, 'transform', deg === 0 ? 'none' : `perspective(${(E * 3).toFixed(0)}px) rotateY(${deg.toFixed(2)}deg)`);
      side = deg > 90 ? 1 : 0;
      css(labels[0]!, 'opacity', side ? '0' : '1');
      css(labels[1]!, 'opacity', side ? '1' : '0');

      // The film: on loose, then shrunk to the sleeve.
      const tight = smooth(span(s, TAUT));
      css(slack, 'opacity', (smooth(span(s, SLACK)) * (1 - tight)).toFixed(3));
      css(taut, 'opacity', tight.toFixed(3));
    }
    css(scrim, 'opacity', (0.92 * come * (1 - smooth(part(home, 0, 0.6)))).toFixed(3));

    // What the two sides say, under the record: each comes up unlit, fills, is held, and makes way.
    [SIDE_A, SIDE_B].forEach((at, i) => {
      const page = sides[i]!;
      const arrive = span(s, at.in);
      const leave = span(s, at.out);
      const shown = arrive * (1 - leave);
      css(page.el, 'opacity', shown.toFixed(3));
      css(page.el, 'visibility', shown === 0 ? 'hidden' : '');
      css(page.el, 'transform', `translate3d(0,${((1 - arrive) * 12 - leave * 12).toFixed(1)}px,0)`);
      fill(page, span(s, at.fill));
    });
    css(name, 'opacity', span(s, NAME_IN).toFixed(3));
  }
  const ask = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };
  const redraw = () => {
    drawn = NaN;
    ask();
  };

  // The ring turned under a hand: slivers in the air leave from where their sleeves lie now.
  root.addEventListener('v4:turn', (e) => {
    pos = (e as CustomEvent<{ pos: number }>).detail.pos;
    if (rec.style.visibility === 'visible') redraw();
  }, { signal });

  /* ---------------------------------------------------------------- the disc, under a finger
     Out of its sleeve it turns with the finger, about its own middle: the point that was grabbed stays
     under the finger. Let go, it keeps the speed it had and slows to a stop, and a press stops it
     where it is. A press that goes up or down is the page's scroll (touch-action: pan-y), so only one
     that sets off sideways, or a mouse, takes hold of it. */
  const tracker = new VelocityTracker();
  let grab: { id: number; x0: number; y0: number; a0: number; turned: number; from: number; held: boolean } | null = null;
  let spinning = 0;
  let spinLast = 0;
  const angleAt = (e: PointerEvent) => {
    const r = flipEl.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };
  function coast(now: number) {
    spinning = 0;
    const dt = spinLast ? Math.min(1 / 30, (now - spinLast) / 1000) : 1 / 120;
    spinLast = now;
    spin += spinSpeed * dt;
    spinSpeed *= Math.exp(-dt / 0.75); // it slows as a scroll let go does
    drawTurn();
    if (Math.abs(spinSpeed) > 4 && !grab?.held) spinning = requestAnimationFrame(coast);
    else spinSpeed = 0;
  }
  flipEl.addEventListener('pointerdown', (e) => {
    if (grab || (e.pointerType === 'mouse' && e.button !== 0)) return;
    cancelAnimationFrame(spinning); // caught where it is
    spinning = 0;
    spinSpeed = 0;
    grab = { id: e.pointerId, x0: e.clientX, y0: e.clientY, a0: angleAt(e), turned: 0, from: spin, held: false };
    tracker.reset(0, e.timeStamp);
  }, { signal });
  flipEl.addEventListener('pointermove', (e) => {
    if (!grab || e.pointerId !== grab.id) return;
    if (!grab.held) {
      const dx = e.clientX - grab.x0, dy = e.clientY - grab.y0;
      const sideways = e.pointerType === 'mouse' ? Math.hypot(dx, dy) > 3 : Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy);
      if (!sideways) return;
      grab.held = true;
      grab.a0 = angleAt(e); // from here, so nothing jumps by the threshold
      flipEl.setPointerCapture(e.pointerId);
      flipEl.classList.add('is-held');
      return;
    }
    const a = angleAt(e);
    let d = a - grab.a0;
    d -= 360 * Math.round(d / 360); // the short way round, across the seam at 180 degrees
    grab.a0 = a;
    grab.turned += side ? -d : d; // turned over, it is seen from behind
    spin = grab.from + grab.turned;
    tracker.push(grab.turned, e.timeStamp);
    drawTurn();
  }, { signal });
  const letGo = (e: PointerEvent) => {
    if (!grab || e.pointerId !== grab.id) return;
    const held = grab.held;
    grab = null;
    flipEl.classList.remove('is-held');
    if (!held) return;
    spinSpeed = e.type === 'pointercancel' ? 0 : clamp(tracker.velocity(e.timeStamp, 60), -1800, 1800);
    spinLast = 0;
    if (Math.abs(spinSpeed) > 3) spinning = requestAnimationFrame(coast);
  };
  flipEl.addEventListener('pointerup', letGo, { signal });
  flipEl.addEventListener('pointercancel', letGo, { signal });
  flipEl.addEventListener('dragstart', (e) => e.preventDefault(), { signal });

  /* ---------------------------------------------------------------- start */
  measure();
  draw();
  window.addEventListener('scroll', ask, { passive: true, signal });
  // A phone's toolbar coming and going resizes the window; the stage (svh) keeps its size, so nothing
  // jumps, but everything is measured again for a window that really changed.
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
    // Turned on mid-film: the page lays itself out without it, and everything drawn for it goes.
    if (still.matches) {
      track.classList.remove('is-climbing');
      film.classList.remove('is-front', 'is-out');
      told = '';
      say({ ...view, w: 0 });
      cancelAnimationFrame(spinning);
      const mine = [capWrap, scrim, cast, rec, finish, slack, taut, disc, flipEl, turnEl, name, ...slices, ...glints, ...labels];
      for (const el of [head, wall, floor, caption, ...mine, ...[...pages, ...sides].map((page) => page.el)]) {
        const clip = el.style.clipPath; // a sliver's shape is the page's, not the film's
        el.removeAttribute('style');
        if (clip) el.style.clipPath = clip;
      }
      for (const page of [...pages, ...sides]) {
        page.words.forEach((el) => el.style.removeProperty('--f'));
        page.fills.fill('');
      }
      written.clear();
    } else {
      measure();
      draw();
    }
  }, { signal });
  // Fonts arriving change the words' height by a line at most; measured again once they are in.
  document.fonts?.ready.then(() => {
    if (signal.aborted) return;
    size = '';
    again();
  });
  signal.addEventListener('abort', () => {
    cancelAnimationFrame(frame);
    cancelAnimationFrame(spinning);
  });
}
