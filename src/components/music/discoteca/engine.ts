/**
 * Discoteca's copy of v4's listening-bar.ts (the carousel, the record pulled out of it, the unwrapping),
 * with one thing added: past the ring the scene from climb.ts lays the same sleeves on the floor (in a
 * line by year, then gathered by person), and this draws them there with what lies round them (their
 * shadows, the years, the threads, the names) and answers a press on a name. Everything else is v4's.
 *
 * Music, design 4: "Listening bar". The carousel of records, the record pulled out of it, the
 * shrink-wrap opened with its tear strip, and the disc sliding out of the sleeve.
 *
 * Everything that moves is a spring (physics.ts) stepped in one requestAnimationFrame loop and written
 * straight to `transform`/`opacity` on the element that moves: nothing animates layout, and no CSS
 * variable changes per frame. Springs start from the value on screen and keep their velocity, so a
 * row in flight can be caught, a record on its way out can be sent back, and a peel let go early
 * springs home from where the finger left it.
 */
import { musicCopy, vinyls, type Vinyl } from '@/data/music';
import { Spring, VelocityTracker, clamp, project, rubberband } from '../v4/physics';
import { onPage } from '@/scripts/page';
import type { CameraView } from './climb';
import { project as projectFloor, type FloorScene } from './floor';
import { people } from './people';

// Set up each time the page is shown; what it starts outside the page stops when the page is swapped out.
onPage((signal) => {
  const page = document.querySelector<HTMLElement>('[data-discoteca].v4');
  if (page) init(page, signal);
});

function init(root: HTMLElement, signal: AbortSignal) {
  const q = <T extends Element = HTMLElement>(sel: string, scope: ParentNode = root) => scope.querySelector<T>(sel)!;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => reduceMotion.matches;

  /* Every style the frame loop writes goes through here, and a value that hasn't changed isn't written
     again: most frames move one or two things, and an unchanged write still costs the browser a style
     pass on that element. Anything the loop owns must only be written this way, or the record of what
     is on screen goes stale. */
  type Prop = 'transform' | 'opacity' | 'visibility' | 'zIndex' | 'pointerEvents';
  const written = new WeakMap<HTMLElement, Partial<Record<Prop, string>>>();
  function css(el: HTMLElement, prop: Prop, value: string) {
    let w = written.get(el);
    if (!w) written.set(el, (w = {}));
    if (w[prop] === value) return;
    w[prop] = value;
    el.style[prop] = value;
  }

  /* ---------------------------------------------------------------- the row */

  const row = q('[data-v4-row]');
  const buttons = [...row.querySelectorAll<HTMLButtonElement>('[data-vinyl]')];
  const shades = buttons.map((b) => q('[data-v4-shade]', b));
  const byId = new Map(vinyls.map((v) => [v.id, v] as const));
  const records = buttons.map((b) => byId.get(b.dataset.vinyl!)!);
  const n = buttons.length;

  /* The same black shade hides a dark sleeve long before a pale one: at the edge of the row a dark
     sleeve has already gone into the background while a pale one is still a bright square. So each
     sleeve's average brightness is measured once from its art, and dimTo[i] is the factor that brings a
     brighter-than-usual sleeve down to the usual (the median) as it moves out; 1 leaves it alone. */
  const dimTo = new Float32Array(n).fill(1);
  async function measureSleeves() {
    const SIZE = 12;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (!g) return;
    const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const lum: number[] = [];
    for (const b of buttons) {
      const img = b.querySelector<HTMLImageElement>('.v4-art img');
      if (!img) return;
      await img.decode();
      g.clearRect(0, 0, SIZE, SIZE);
      g.drawImage(img, 0, 0, SIZE, SIZE);
      const px = g.getImageData(0, 0, SIZE, SIZE).data;
      let sum = 0;
      for (let k = 0; k < px.length; k += 4) sum += 0.2126 * lin(px[k]!) + 0.7152 * lin(px[k + 1]!) + 0.0722 * lin(px[k + 2]!);
      lum.push(sum / (px.length / 4));
    }
    const median = [...lum].sort((a, b) => a - b)[Math.floor(n / 2)]!;
    lum.forEach((l, i) => (dimTo[i] = l > median ? median / l : 1));
    if (!signal.aborted) renderRow();
  }
  measureSleeves().catch(() => {}); // without it every sleeve keeps the plain shade

  const capTitle = q('[data-v4-cap-title]');
  const capMeta = q('[data-v4-cap-meta]');
  const caption = q('[data-v4-caption]');

  // The floor's pieces (FloorUnder.astro, FloorOver.astro): shadows, years and threads under the
  // records, the names over them.
  const shadowEls = [...root.querySelectorAll<HTMLElement>('[data-dsc-shadow]')];
  const yearEls = [...root.querySelectorAll<HTMLElement>('[data-dsc-year]')];
  const threadEls = [...root.querySelectorAll<HTMLElement>('[data-dsc-thread]')].map((el) => ({ el, person: Number(el.dataset.person), record: Number(el.dataset.record) }));
  const pins = [...root.querySelectorAll<HTMLElement>('[data-dsc-pin]')];
  const pills = pins.map((pin) => q<HTMLButtonElement>('[data-dsc-pill]', pin));

  const HOME = 4000; // the track's resting scroll offset (see the CSS)
  const ROT = 60; // how far the neighbours turn away, in degrees
  const TUCK = 0.6; // how far, in spacings, the pile at each end reaches past the third record
  const MAX_SPEED = 12; // records per second a swipe turns the row at most: kept up for longer, they strobe
  const MAX_THROW = 5; // records a single throw travels at most (half the ring)
  // A flick is let go at the speed the finger had, so nothing brakes as it lifts: up to the speed that
  // carries it the whole throw. It is that fast for a moment only, slowing from the first frame.
  const FLICK_SPEED = 20;

  let W = 0; // row width
  let S = 0; // sleeve size in the row
  let A = 0; // centre of the first neighbour, px from the middle; also px per record while dragging
  let B = 0; // spacing of the records further out
  let P = 0; // perspective distance

  function measure() {
    W = row.clientWidth;
    S = buttons[0]!.offsetWidth;
    A = S * 0.66;
    B = S * (W > 760 ? 0.36 : 0.26);
    P = S * 2.6;
    root.style.setProperty('--dsc-s', `${S}px`); // the floor's pieces are a sleeve's size, as the sleeves are
    row.scrollLeft = HOME;
    row.scrollTop = 0;
  }

  /* The row is a ring: after the last record comes the first. `pos` runs freely (it is brought back
     into 0..n when it rests), and each record sits at its shortest way round from it. */
  const mod = (i: number) => ((i % n) + n) % n;
  /** A distance in records, taken the short way round the ring: -n/2..n/2. */
  const around = (d: number) => d - n * Math.round(d / n);

  /** The pose of a record d places from the middle of the row. Shared with the page (index.astro), which
      draws the same pose before the script runs. */
  function pose(d: number) {
    const ad = Math.abs(d);
    const sg = Math.sign(d);
    const near = Math.min(ad, 1);
    const far = Math.max(0, ad - 1);
    // Past the third record on each side they slide in under it and go dark: the ends of the row are a
    // pile in the shadow, and a record goes round from one pile to the other unseen, however fast the
    // row turns. Eased (no kink) so a record doesn't change speed as it reaches the pile.
    const deep = Math.max(0, far - 2);
    const spread = far - deep + TUCK * (1 - Math.exp(-deep / TUCK));
    return {
      // Half-way between two records the one leaving and the one arriving are pushed just clear of each
      // other, so the moment they change places on top (z, below) has nothing on screen to swap.
      x: sg * (near * A + Math.sin(Math.PI * near) * S * 0.05 + spread * B),
      rot: -sg * near * ROT,
      s: 1 - near * 0.14 - Math.min(deep, 1) * 0.04,
      // Black by the time it is half-way to the back of the ring, whatever the number of records.
      shade: near * 0.38 + Math.min(far, 2) * 0.12 + 0.38 * Math.min(1, (deep / Math.max(0.5, n / 2 - 3)) * 1.6),
      // It only fades once it is black and under the pile, the last half record before it crosses over.
      alpha: clamp((n / 2 - ad) * 2, 0, 1),
      // Nearer the middle is on top. Whole steps are enough to keep that order (neighbours are a record
      // apart), and then it changes once per record passed rather than on nearly every frame.
      z: 1000 - Math.round(ad),
    };
  }

  /* The view from above. On the music page the scroll goes on past the shelf by raising the camera
     (climb.ts, which says where it is on the page's root): the records leave the row, lie down on the
     floor in a ring and are seen from above. They are these same sleeves, so the ring turns under a
     hand as the row does, and a record comes out of it from where it lies. `view` is null at the shelf,
     and then everything below is exactly the row. */
  let view: CameraView | null = null;
  root.addEventListener('v4:camera', (e) => {
    const v = (e as CustomEvent<CameraView>).detail;
    const next = v.w > 0 ? v : null;
    if (!next && !view) return;
    view = next;
    renderRow();
  }, { signal });

  /** Where the record d places from the front is drawn, wherever the camera is: its pose in the row at
      the shelf, its place in the ring from above, and the way between the two. `x` and `y` are px from
      its slot in the row; `k` is how much larger or smaller the camera's place makes it; then it is
      turned as the camera looks down on it (`pitch`), as it faces round the ring (`yaw`) and as it
      lies back on the floor (`lay`), in degrees. */
  function place(i: number, d = around(i - pos.value), g = pose(d)) {
    if (!view) return { x: g.x, y: 0, k: 1, pitch: 0, yaw: g.rot, lay: 0, s: g.s, shade: g.shade, alpha: g.alpha };
    if (view.floor) return onFloor(i, d, view.floor);
    const { w, R, zoom, y, tilt, far } = view;
    const th = (d * 2 * Math.PI) / n; // round the ring from its front, where the middle of the row goes
    const a = (tilt * w * Math.PI) / 180;
    // On the floor: across it, and towards you. The row is a line across; the ring curls back from it.
    const across = g.x + (R * Math.sin(th) - g.x) * w;
    const toward = R * Math.cos(th) * w;
    const k = (far / (far - toward * Math.cos(a))) * (1 + (zoom - 1) * w); // nearer is larger; from above, all smaller
    const ad = Math.abs(d);
    return {
      x: across * k,
      // Looked down on, what is nearer is lower on the screen.
      y: y * w + toward * Math.sin(a) * k,
      k,
      pitch: tilt * w,
      // In the row a neighbour is turned in towards the middle; in the ring it faces out, so that lying
      // back its top points at the centre.
      yaw: g.rot + ((d * 360) / n - g.rot) * w,
      lay: 90 * w,
      s: g.s + (1 - g.s) * w,
      // From above the whole ring is seen: nothing is in the dark at the ends, only a little dimmer
      // away from the front.
      shade: g.shade + (Math.min(ad, 1) * 0.14 + Math.max(0, ad - 1) * 0.045 - g.shade) * w,
      alpha: g.alpha + (1 - g.alpha) * w * w,
    };
  }
  /* Past the ring (discoteca): each record from its place in the ring, loosened, to where the scene
     puts it on the floor, by how far it has got there (`wt`), then seen from the scene's camera. At the
     start (nothing loosened, nothing moved, the camera still the ring's) this is exactly the ring as
     drawn above, so the floor takes over without a seam. Where it lies is kept for its shadow and for
     the threads that run to it. */
  const floorAt = buttons.map(() => ({ x: 0, z: 0, yaw: 0, h: 0 }));
  function onFloor(i: number, d: number, f: FloorScene) {
    const v = view!;
    const ad = Math.abs(d);
    // Loosening: the ring widens a touch, each record turns a little towards the way it will lie, and
    // the ones at the back draw apart, where it is about to open.
    const back = clamp((ad - (n / 2 - 2.5)) / 2.5, 0, 1);
    const th = (d * 2 * Math.PI) / n - Math.sign(d) * 0.2 * f.loosen * back;
    const R = v.R * (1 + 0.05 * f.loosen);
    let ryaw = (d * 360) / n;
    ryaw -= Math.sign(ryaw) * Math.min(Math.abs(ryaw), 8) * f.loosen;
    const t = f.recs[i]!;
    const e = t.wt;
    const rx = R * Math.sin(th), rz = R * Math.cos(th);
    const x = rx + (t.x - rx) * e;
    const z = rz + (t.z - rz) * e;
    const yaw = ryaw + (t.yaw - ryaw) * smooth(clamp(e / 0.8, 0, 1)); // it lands already square
    const h = t.lift + chosen[i]!.value * 0.07 * S;
    const at = floorAt[i]!;
    at.x = x; at.z = z; at.yaw = yaw; at.h = h;
    const p = projectFloor(f.cam, x, z, h);
    const ringShade = Math.min(ad, 1) * 0.14 + Math.max(0, ad - 1) * 0.045;
    const shade = Math.max(ringShade + (t.dim - ringShade) * e, others[i]!.value * 0.62);
    const b = f.bounds;
    const off = p.hidden || p.sy - p.k * S > b.bottom || p.sy + p.k * S < b.top || Math.abs(p.sx) - p.k * S > b.half;
    // Nearer (lower on the screen) is on top, and a record carried over the others is above them all.
    const zi = 1000 + Math.round(p.sy / 6) + (h > 0.02 * S ? 400 : 0);
    return { x: p.sx, y: p.sy, k: p.k, pitch: f.cam.tilt, yaw, lay: 90, s: 1, shade, alpha: off ? 0 : 1, z: zi };
  }

  /* What lies round the records on the floor. A shadow under each while it is off the floor; the years,
     lying flat beside their records and foreshortened with the floor; the threads, straight on the
     screen as lines on a floor are, from a person's name to each of their records (under the records,
     so a thread ends at a sleeve's edge); and the names, standing up, the same size wherever they are. */
  let marksShown = false;
  // Shown by writing `visible`, never by clearing the inline value: the stylesheet keeps these hidden
  // until the scene reaches them, and a cleared value hands them back to it (unseen, and a pill that
  // can't be pressed: the press went to the row under it).
  const hide = (el: HTMLElement) => {
    css(el, 'opacity', '0');
    css(el, 'visibility', 'hidden');
  };
  const pinOff: boolean[] = pins.map(() => true);
  function renderMarks(f: FloorScene) {
    marksShown = true;
    const c = f.cam;
    const b = f.bounds;
    const outside = (p: { sx: number; sy: number; k: number; hidden: boolean }) =>
      p.hidden || p.sy - p.k * S > b.bottom || p.sy + p.k * S < b.top || Math.abs(p.sx) - p.k * S > b.half;
    for (let i = 0; i < n; i++) {
      const el = shadowEls[i];
      if (!el) continue;
      const at = floorAt[i]!;
      const a = i === openIndex ? 0 : clamp(at.h / (0.05 * S), 0, 1) * 0.55;
      const p = projectFloor(c, at.x, at.z + at.h * 0.25); // the lamp is overhead and a little behind you
      if (a < 0.01 || outside(p)) { hide(el); continue; }
      css(el, 'transform', `translate3d(${p.sx.toFixed(2)}px,${p.sy.toFixed(2)}px,0) ${turned({ k: p.k, pitch: c.tilt, yaw: at.yaw, lay: 90, s: 1 + (0.5 * at.h) / S })}`);
      css(el, 'opacity', a.toFixed(3));
      css(el, 'visibility', 'visible');
    }
    f.years.forEach((y, i) => {
      const el = yearEls[i];
      if (!el) return;
      const p = projectFloor(c, y.x, y.z);
      if (y.alpha < 0.01 || outside(p)) return hide(el);
      css(el, 'transform', `translate3d(${p.sx.toFixed(2)}px,${p.sy.toFixed(2)}px,0) ${turned({ k: p.k, pitch: c.tilt, yaw: 0, lay: 90, s: 1 })}`);
      css(el, 'opacity', y.alpha.toFixed(3));
      css(el, 'visibility', 'visible');
    });
    for (const t of threadEls) {
      const hub = f.hubs[t.person];
      const at = floorAt[t.record];
      if (!hub || !at || hub.grow < 0.005) { hide(t.el); continue; }
      const A = projectFloor(c, hub.x, hub.z);
      const B = projectFloor(c, at.x, at.z);
      const dx = B.sx - A.sx, dy = B.sy - A.sy;
      const len = Math.hypot(dx, dy) * hub.grow;
      // With a name chosen, the other names' threads go faint.
      const hi = 1 - anyChosen.value * 0.82 * (1 - lit[t.person]!.value);
      css(t.el, 'transform', `translate3d(${A.sx.toFixed(2)}px,${A.sy.toFixed(2)}px,0) rotate(${Math.atan2(dy, dx).toFixed(4)}rad) scaleX(${(len / 100).toFixed(4)})`);
      css(t.el, 'opacity', (hi * Math.min(1, hub.grow * 3)).toFixed(3));
      css(t.el, 'visibility', 'visible');
    }
    pins.forEach((pin, k) => {
      const hub = f.hubs[k];
      const off = !f.interactive || !hub || hub.alpha < 0.6;
      if (off !== pinOff[k]) {
        pinOff[k] = off;
        pin.toggleAttribute('data-off', off);
      }
      if (!hub || hub.alpha < 0.01) return hide(pin);
      const p = projectFloor(c, hub.x, hub.z);
      css(pin, 'transform', `translate3d(${p.sx.toFixed(2)}px,${p.sy.toFixed(2)}px,0)`);
      css(pin, 'opacity', (hub.alpha * (1 - anyChosen.value * 0.45 * (1 - lit[k]!.value))).toFixed(3));
      css(pin, 'visibility', 'visible');
    });
    // Scrolled away from the names: nothing stays chosen.
    if (!f.interactive && chosenPerson >= 0) choose(-1);
  }
  function hideMarks() {
    marksShown = false;
    for (const el of [...shadowEls, ...yearEls, ...threadEls.map((t) => t.el), ...pins]) hide(el);
    if (chosenPerson >= 0) choose(-1);
  }

  /* A name pressed: its records come up a little off the floor and the rest go into the dark, its
     threads stay lit and the others go faint; pressed again, or the floor pressed, all of it goes
     back. Springs, so a quick change of mind turns round from where things are (critically damped:
     nothing here was thrown). Going back is quicker than coming. */
  let chosenPerson = -1;
  const SEL = { response: 0.35, damping: 1 };
  const UNSEL = { response: 0.25, damping: 1 };
  const chosen = buttons.map(() => new Spring(0, SEL, 0.001)); // on the chosen person's records: lifted
  const others = buttons.map(() => new Spring(0, SEL, 0.001)); // on the rest: dimmed
  const lit = people.map(() => new Spring(0, SEL, 0.001));
  const anyChosen = new Spring(0, SEL, 0.001);
  function choose(k: number) {
    chosenPerson = k;
    const on = new Set(k >= 0 ? people[k]!.records : []);
    const go = (s: Spring, to: number) => {
      if (reduced()) s.set(to);
      else s.to(to, to > s.value ? SEL : UNSEL);
    };
    chosen.forEach((s, i) => go(s, on.has(i) ? 1 : 0));
    others.forEach((s, i) => go(s, k >= 0 && !on.has(i) ? 1 : 0));
    lit.forEach((s, j) => go(s, j === k ? 1 : 0));
    go(anyChosen, k >= 0 ? 1 : 0);
    pills.forEach((b, j) => b.setAttribute('aria-pressed', String(j === k)));
    tick();
  }
  pills.forEach((b, k) => b.addEventListener('click', () => choose(chosenPerson === k ? -1 : k)));
  // A press on the floor between the records lets the name go.
  row.addEventListener('click', (e) => {
    if (view?.floor && chosenPerson >= 0 && !(e.target as Element).closest('[data-vinyl]')) choose(-1);
  });

  /* How a sleeve is turned, as one matrix: the camera's look down (`pitch`), then its facing round the
     ring (`yaw`), then its lying back on the floor (`lay`), in degrees. On its way there a sleeve is
     edge-on for an instant (lying back a quarter turn before the camera's pitch brings it round), which
     is a place rotations chained one after another are best not taken through; one matrix has no such
     place. (Playwright's headless WebKit is no judge of how this looks: it draws every perspective()
     without its vanishing point, the row's own included. The boxes it reports are right.) */
  function turn3d(pitch: number, yaw: number, lay: number) {
    const rad = Math.PI / 180;
    const cp = Math.cos(-pitch * rad), sp = Math.sin(-pitch * rad);
    const cy = Math.cos(yaw * rad), sy = Math.sin(yaw * rad);
    const cl = Math.cos(lay * rad), sl = Math.sin(lay * rad);
    // Rx(-pitch) · Ry(yaw) · Rx(lay), columns first as matrix3d wants them.
    const m = [
      cy, sp * sy, -cp * sy,
      sy * sl, cp * cl - sp * cy * sl, sp * cl + cp * cy * sl,
      sy * cl, -cp * sl - sp * cy * cl, -sp * sl + cp * cy * cl,
    ].map((v) => (Math.abs(v) < 1e-6 ? '0' : v.toFixed(6)));
    return `matrix3d(${m[0]},${m[1]},${m[2]},0,${m[3]},${m[4]},${m[5]},0,${m[6]},${m[7]},${m[8]},0,0,0,0,1)`;
  }
  /* The sleeve's size from the camera's place (`k`) goes inside its perspective, with the perspective
     shortened to match: the same picture as scaling the whole thing afterwards, in the order the row
     has always written its sleeves (place, perspective, turn, size). */
  const turned = (v: { k: number; pitch: number; yaw: number; lay: number; s: number }) =>
    `perspective(${(P * v.k).toFixed(1)}px) ${turn3d(v.pitch, v.yaw, v.lay)} scale(${(v.k * v.s).toFixed(4)})`;
  /** px a finger moves per record under it: the row's spacing at the shelf, the ring's arc at its
      front from above. */
  function perRecord() {
    if (!view) return A;
    const a = (view.tilt * view.w * Math.PI) / 180;
    const k = (view.far / (view.far - view.R * view.w * Math.cos(a))) * (1 + (view.zoom - 1) * view.w);
    return A + (((2 * Math.PI * view.R) / n) * k - A) * view.w;
  }

  // Where the row is, in records (0 = the first one in the middle).
  // The row opens on a record in the middle (marked by the page), so there are sleeves on both sides.
  const START = Math.max(0, buttons.findIndex((b) => b.hasAttribute('data-start')));
  const pos = new Spring(START, { response: 0.5, damping: 1 }, 0.0004);
  let captionIndex = START;

  /* What the row is doing, said aloud on the page's root for whatever else on the page wants to move
     with it (a backdrop, say): "v4:turn" whenever the row has moved, with where it is in records
     (`pos`, running freely; `n` records in the ring), and "v4:centre" when another record becomes the
     one in the middle. "v4:open" and "v4:close" say a record came out and went back. */
  const say = (type: string, detail: object) => root.dispatchEvent(new CustomEvent(type, { detail }));
  let saidPos = NaN;

  function renderRow() {
    // With reduced motion the record doesn't fly out, so the row doesn't part for it either.
    const part = openIndex === null || reduced() ? 0 : clamp(lift.value, 0, 1);
    for (let i = 0; i < n; i++) {
      const d = around(i - pos.value);
      const g = pose(d);
      const v = view ? place(i, d, g) : null;
      let x = v ? v.x : g.x;
      let shade = v ? v.shade : g.shade;
      if (part > 0 && i !== openIndex) {
        // The row parts around the record that came out, and dims. (The ring has room: it only dims.)
        x += Math.sign(d) * Math.min(Math.abs(d), 1) * part * S * 0.32 * (1 - (view?.w ?? 0));
        shade = Math.min(0.85, shade + part * 0.3);
      }
      // From the second record out, a sleeve brighter than most is dimmed to their brightness, so a
      // pale one goes into the pile as the dark ones do instead of staying lit and vanishing at the end.
      const t = clamp(Math.abs(d) - 2, 0, 1) * (1 - (view?.w ?? 0));
      if (t > 0 && dimTo[i]! < 1) shade = 1 - (1 - shade) * (1 - t * t * (3 - 2 * t) * (1 - dimTo[i]!));
      const b = buttons[i]!;
      const alpha = v ? v.alpha : g.alpha;
      css(b, 'transform', v
        ? `translate3d(${x.toFixed(2)}px,${v.y.toFixed(2)}px,0) ${turned(v)}`
        : `translate3d(${x.toFixed(2)}px,0,0) perspective(${P.toFixed(0)}px) rotateY(${g.rot.toFixed(3)}deg) scale(${g.s.toFixed(4)})`);
      css(shades[i]!, 'opacity', shade.toFixed(3));
      css(b, 'zIndex', String(v && 'z' in v ? v.z : g.z));
      css(b, 'opacity', alpha.toFixed(3));
      css(b, 'pointerEvents', alpha < 0.2 ? 'none' : ''); // nothing to press on the far side
    }
    if (view?.floor) renderMarks(view.floor);
    else if (marksShown) hideMarks();
    renderCaption();
    if (pos.value !== saidPos) {
      saidPos = pos.value;
      say('v4:turn', { pos: pos.value, n });
    }
  }

  /* The name under the row. It changes a little past half-way (not at it), so a finger resting between
     two records doesn't flick it back and forth; and while the row spins it steps back instead of
     flashing every name that goes by, and comes back with the record the row slows down on. */
  let speed = 0; // how fast the row is turning, records/s, smoothed
  let speedFrom = START; // where the row was at the last frame
  let captionFlash: Animation | null = null;
  /* On the floor the caption names the record the walk is passing, then the person whose name is
     pressed (a line for each record they are on), and says nothing while no name is. */
  let floorCaption = ''; // what it says on the floor; '' while it is the row's
  function renderCaption() {
    const f = view?.floor;
    if (f && (f.focus !== null || f.people)) {
      let key = '', title = '', meta = '';
      if (f.people) {
        if (chosenPerson >= 0) {
          const p = people[chosenPerson]!;
          key = `p${chosenPerson}`;
          title = p.name;
          meta = p.lines.join('\n');
        }
      } else {
        const v = records[f.focus!]!;
        key = `r${f.focus}`;
        title = v.title;
        meta = `${v.artist}, ${v.year}`;
      }
      if (key && key !== floorCaption) {
        floorCaption = key;
        capTitle.textContent = title;
        capMeta.textContent = meta;
        captionFlash?.cancel();
        captionFlash = reduced() ? null : caption.animate([{ opacity: 0.2, filter: 'blur(2px)' }, { opacity: 1, filter: 'blur(0px)' }], { duration: 180, easing: 'ease-out' });
      }
      css(caption, 'opacity', key ? '1' : '0');
      return;
    }
    if (floorCaption) {
      // Back from the floor: it names the record in front of the ring again.
      floorCaption = '';
      const c = mod(Math.round(pos.value));
      captionIndex = c;
      capTitle.textContent = records[c]!.title;
      capMeta.textContent = `${records[c]!.artist}, ${records[c]!.year}`;
    }
    const off = around(pos.value - captionIndex);
    const atRest = pos.settled && !rowDrag?.active;
    if (Math.abs(off) > 0.62 || (atRest && Math.abs(off) > 0.5)) {
      const c = mod(Math.round(pos.value));
      captionIndex = c;
      const v = records[c]!;
      capTitle.textContent = v.title;
      capMeta.textContent = `${v.artist}, ${v.year}`;
      say('v4:centre', { index: c, id: v.id });
      captionFlash?.cancel();
      captionFlash = speed < 5 ? caption.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' }) : null;
    }
    css(caption, 'opacity', clamp(1 - (speed - 5) / 6, 0, 1).toFixed(3));
  }

  /** Bring record i to the middle, the short way round. */
  function goTo(i: number, velocity?: number) {
    thrown = false;
    endSwipe(); // a swipe still tailing off must not take the row anywhere else
    steer();
    const to = Math.round(pos.value + around(i - pos.value));
    // A record several places away takes a little longer, so the ones between don't flash past.
    const response = Math.min(0.9, 0.5 + 0.1 * Math.max(0, Math.abs(to - pos.value) - 1));
    pos.to(to, { response, damping: 1, velocity });
    tick();
  }

  /** Let the row go at `v` records/s: it coasts to the whole record it would come to rest near, and
      slows from the speed it was let go at. */
  function release(v: number, bounce: boolean, max = MAX_SPEED) {
    v = clamp(v, -max, max);
    coast(Math.round(pos.value + clamp(project(v * A) / A, -MAX_THROW, MAX_THROW)), bounce ? 0.82 : 1, v);
    thrown = true;
    tick();
  }

  /** Send the row to a whole record from the speed `v` it has, slowing all the way there. */
  function coast(landing: number, damping: number, v = pos.velocity) {
    const D = landing - pos.value;
    // A spring stiffer than the throw would pull the row faster than it was let go, a lurch you can see.
    // Heading where it was thrown, soften it until it only slows down: its pull at the start (w²·D) must
    // not beat its drag (2ζw·v), so w ≤ 2ζv/D, i.e. response ≥ πD/(ζv).
    // Only as far as the speed is worth keeping: a row that is barely moving would crawl to its record
    // for over a second on so soft a spring, and being drawn in a little faster than that is no lurch.
    const softest = 0.55 + 0.65 * clamp(Math.abs(v) / 1.5, 0, 1);
    heading = landing;
    lead = 0;
    if (D * v > 0) {
      pos.to(landing, { response: clamp((Math.PI * Math.abs(D)) / (damping * Math.abs(v)), 0.55, softest), damping, velocity: v });
      return;
    }
    // Let go too gently to reach the next record, it is still moving away from the one it goes back to.
    // Aimed straight at that one, the spring's drag alone stops it dead within two frames, and then it
    // comes back: a row that looked on its way to the next record hits a wall. So the spring is first
    // aimed ahead of the row, at the point where its pull and its drag cancel (x + 2ζv/w): on the frame
    // it is let go nothing changes, and it carries on at the speed it had. The aim then comes home
    // (lead, in the frame loop) and the row follows it: it runs on a little, slows, turns round and
    // settles, in one motion. Only as far as there is speed to lose: let go at rest it is drawn straight in.
    turn = TURN * clamp(Math.abs(v) / 0.5, 0, 1);
    if (turn > 0) lead = (damping * v * RETURN) / Math.PI - D;
    pos.to(landing + lead, { response: RETURN, damping, velocity: v });
  }

  /** Whatever takes the row next takes it straight there: nothing is left of a coast. */
  function steer() {
    lead = 0;
    heading = NaN;
  }

  /* Dragging the row. Vertical pans stay with the browser (touch-action: pan-y); a horizontal one, once
     it is clearly horizontal, tracks the finger 1:1 and throws on release. */
  const tracker = new VelocityTracker();
  let rowDrag: { id: number; x0: number; y0: number; pos0: number; active: boolean; dir: 1 | -1 } | null = null;
  let dragged = false; // the last press turned into a drag: its click must not open anything
  let caught = false; // the last press caught a thrown row in flight: it only stops it
  let thrown = false; // the row is coasting from a throw (not from a tap or the keyboard)
  let fingerMoved = false; // the finger has moved the row since the last frame was drawn
  let heading = NaN; // the record a coast is taking the row to
  let lead = 0; // how far past that record the spring is aimed, while a row let go moving away turns round
  let turn = 0; // the time, in seconds, that aim takes to come most of the way home
  const RETURN = 0.55; // the spring a row goes back to its record on
  const TURN = 0.1;

  row.addEventListener('pointerdown', (e) => {
    if (openIndex !== null || rowDrag?.active || (e.pointerType === 'mouse' && e.button !== 0)) return;
    dragged = false;
    // On the floor the records lie where the scroll puts them: a hand doesn't turn them, a press opens one.
    if (view?.floor) {
      caught = false;
      return;
    }
    caught = thrown && Math.abs(pos.velocity) > 0.6;
    // A throw is caught where it is. A row easing into place carries on: stopping it here would leave
    // it between two records if the press never becomes a drag.
    if (caught) {
      steer();
      pos.set(pos.value);
    }
    // From above, a finger on the far side of the ring is on records going the other way: they follow it too.
    const far = !!view && view.w > 0.5 && e.clientY < row.getBoundingClientRect().top + buttons[0]!.offsetTop + S / 2 + view.y * view.w;
    rowDrag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, pos0: pos.value, active: false, dir: far ? -1 : 1 };
    tracker.reset(e.clientX, e.timeStamp);
  });
  row.addEventListener('pointermove', (e) => {
    if (!rowDrag || e.pointerId !== rowDrag.id) return;
    const dx = e.clientX - rowDrag.x0;
    if (!rowDrag.active) {
      const dy = e.clientY - rowDrag.y0;
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      // Clearly sideways: it is ours. Track from here, so nothing jumps by the threshold.
      rowDrag.active = true;
      rowDrag.x0 = e.clientX;
      endSwipe();
      steer();
      pos.set(pos.value); // from wherever it has got to
      rowDrag.pos0 = pos.value;
      dragged = true;
      row.setPointerCapture(e.pointerId);
      row.classList.add('is-dragging');
      return;
    }
    tracker.push(e.clientX, e.timeStamp);
    pos.set(rowDrag.pos0 - (rowDrag.dir * dx) / perRecord()); // no ends to pull against: it goes round
    fingerMoved = true;
    tick();
  });
  const endRowDrag = (e: PointerEvent) => {
    if (!rowDrag || e.pointerId !== rowDrag.id) return;
    const wasActive = rowDrag.active;
    const dir = rowDrag.dir;
    rowDrag = null;
    row.classList.remove('is-dragging');
    if (wasActive) {
      // px/s, the finger's over its last two or three frames. Over the usual 100ms it is behind a flick
      // that is still speeding up and ahead of a hand slowing down to place the row, and the row would
      // brake, or lurch, on the frame it is let go: it carries on at the speed it had on screen.
      const v = e.type === 'pointercancel' ? 0 : tracker.velocity(e.timeStamp, 40);
      // A flick earns a little bounce as it lands; a slow drag settles without one.
      release((-dir * v) / perRecord(), Math.abs(v) > 500, FLICK_SPEED);
    } else if (caught || e.type === 'pointercancel' || (!lead && pos.target !== Math.round(pos.target))) {
      // (A row turning round is aimed between two records, but is on its way to one.)
      goTo(Math.round(pos.value));
    }
  };
  // On the window: a press that never became a drag isn't captured, and can end anywhere.
  window.addEventListener('pointerup', endRowDrag, { signal });
  window.addEventListener('pointercancel', endRowDrag, { signal });
  row.addEventListener('dragstart', (e) => e.preventDefault());

  /* A trackpad's sideways swipe turns the row too (a mouse wheel still scrolls the page).
     Wheel events don't come one per frame: some frames get none and some get two, so a row moved by
     each event stands still and then lurches, and a spring short enough to keep up with the swipe is
     too short to hide that: at a steady swipe the row's speed still swung by a third from frame to
     frame. So the events only record where the swipe had got to and when (their own time stamps), and
     each frame asks where it was one event ago, on the line between two events (wheelTarget): the same
     step on every frame however the events fall, a frame's worth behind the fingers.
     After a fast swipe the pad's momentum dies away over a second, and a row that waited for the end of
     it would stop between two records and then set off again for the nearer one. Where the momentum
     will end is known long before (it decays steadily), so once the swipe has clearly slowed the row
     is let go to the record it will end on (wheelLand), as a throw is: from the speed it has, slowing
     all the way (coast), and no longer following the events. Drawn there while still following them,
     it slowed, picked up speed again for the record and stopped short. If the swipe speeds up again
     the fingers are back, and it follows them again from where it is. A slow swipe isn't let go
     anywhere: it follows the fingers, and settles when they stop. */
  const WHEEL_FOLLOW = { response: 0.1, damping: 1 };
  let wheelIdle = 0; // set while a swipe is going on
  let wheelLast = 0; // when its last event came
  let wheelTo = 0; // where the swipe has taken the row, in records
  let wheelLand = NaN; // the record a slowing swipe has been let go to; NaN while the row follows the swipe
  let wheelPeak = 0; // the fastest the swipe has been, records/s
  let wheelGone = 0; // how far the swipe has turned the row in all (wheelTo is brought back into the ring)
  let wheelEvery = 16; // ms from one event of the swipe to the next, smoothed
  const wheelTracker = new VelocityTracker(); // the swipe's last 100ms: how far it had gone (wheelGone), and when

  /** The swipe is over as far as the row goes: something else has it now (a tap, a key, a finger). */
  function endSwipe() {
    clearTimeout(wheelIdle);
    wheelIdle = 0;
  }
  /** How far the swipe has turned the row since one event before `time`. */
  const wheelSince = (time: number) => wheelGone - wheelTracker.at(time - wheelEvery, wheelEvery);
  /** Where the swipe wants the row on the frame drawn at `now` (the frame's own time, the same clock
      as the events'): where it was one event ago. */
  const wheelTarget = (now: number) => wheelTo - wheelSince(now);

  row.addEventListener(
    'wheel',
    (e) => {
      if (openIndex !== null || rowDrag?.active || view?.floor || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      if (!wheelIdle) {
        wheelTo = pos.value; // from where the row is on screen, even if it was on its way somewhere
        steer();
        wheelLand = NaN;
        wheelPeak = wheelGone = 0;
        wheelEvery = 16;
        wheelTracker.reset(0, e.timeStamp - wheelEvery); // an event tells of the time before it
      } else {
        wheelEvery += (clamp(e.timeStamp - wheelLast, 4, 34) - wheelEvery) * 0.2;
      }
      // No faster than the row may turn, whatever the pad sends and however often it sends it.
      const dt = clamp(e.timeStamp - wheelLast, 4, 50) / 1000;
      wheelLast = e.timeStamp;
      const step = clamp(e.deltaX / A, -MAX_SPEED * dt, MAX_SPEED * dt);
      wheelTo += step;
      wheelGone += step;
      wheelTracker.push(wheelGone, e.timeStamp);
      const speed = wheelTracker.velocity(e.timeStamp);
      wheelPeak = Math.max(wheelPeak, Math.abs(speed));

      // Slowing: well under the speed the swipe had (a slow swipe has less to lose than a fast one).
      const slow = clamp(1 - Math.abs(speed) / clamp(wheelPeak * 0.6, 0.5, 2.5), 0, 1);
      const end = wheelTo + speed * 0.3; // where the momentum will run out
      if (Number.isNaN(wheelLand)) {
        if (wheelPeak > 0.8 && slow > 0.3) wheelLand = Math.round(end);
      } else if (slow === 0) {
        // As fast as it was again: the fingers are back. It follows them from where it is on screen.
        wheelLand = NaN;
        steer();
        wheelTo = pos.value + wheelSince(e.timeStamp);
      } else if (Math.abs(end - wheelLand) > 0.6) {
        wheelLand = Math.round(end); // it keeps to a record until that is clearly another one
      }
      thrown = false;
      tick(); // the frame loop takes the row there
      clearTimeout(wheelIdle);
      wheelIdle = window.setTimeout(() => {
        wheelIdle = 0;
        if (rowDrag?.active) return;
        if (Number.isNaN(wheelLand)) release(pos.velocity, false);
        else thrown = true; // already on its way to its record
      }, 60);
    },
    { passive: false },
  );

  for (const [i, b] of buttons.entries()) {
    b.addEventListener('click', (e) => {
      // The click that ends a drag opens nothing. A click from the keyboard (detail 0) is never that one.
      const fromDrag = (dragged || caught) && e.detail !== 0;
      dragged = caught = false;
      if (fromDrag) {
        e.preventDefault();
        return;
      }
      if (openIndex !== null) return;
      // Off-centre, even a little: it comes to the middle and out in the same motion.
      if (!view?.floor && (around(i - pos.value) !== 0 || pos.target !== pos.value)) goTo(i);
      openRecord(i);
    });
  }

  // Keyboard: Tab or the arrow keys walk the row; the focused record comes to the middle.
  let focusGuard = false;
  row.addEventListener('focusin', (e) => {
    const i = buttons.indexOf(e.target as HTMLButtonElement);
    if (i < 0 || openIndex !== null) return;
    // Only focus from the keyboard. A browser that focuses a button as it is pressed (Chrome) would
    // otherwise send the row towards a sleeve the finger is only starting to drag.
    if (!(e.target as HTMLElement).matches(':focus-visible') || view?.floor) return;
    focusGuard = true;
    requestAnimationFrame(() => (focusGuard = false));
    if (Math.abs(around(i - pos.target)) > 0.01) goTo(i);
  });
  row.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(e.target as HTMLButtonElement);
    if (i < 0) return;
    // The arrows go round: right of the last record is the first.
    const to = e.key === 'ArrowRight' ? mod(i + 1) : e.key === 'ArrowLeft' ? mod(i - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (to < 0 || to === i) return;
    e.preventDefault();
    buttons[to]!.focus({ preventScroll: true });
  });

  /* Anything that asks the browser to bring a record into view (focus, find in page, an automation)
     scrolls the hidden track. Put it back and centre that record instead: the one that became most
     visible with the scroll. */
  row.addEventListener('scroll', () => {
    const dx = row.scrollLeft - HOME;
    if (Math.abs(dx) < 1 && row.scrollTop === 0) return;
    const rr = row.getBoundingClientRect();
    const seen = (l: number, r: number) => clamp((Math.min(r, rr.right) - Math.max(l, rr.left)) / Math.max(1, r - l), 0, 1);
    let best = -1;
    let bestScore = 0.02;
    buttons.forEach((b, i) => {
      if (i === openIndex) return;
      const r = b.getBoundingClientRect();
      const now = seen(r.left, r.right);
      const gain = now - seen(r.left + dx, r.right + dx);
      const score = gain + (now > 0.98 ? 0.5 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    row.scrollLeft = HOME;
    row.scrollTop = 0;
    if (!focusGuard && best >= 0 && openIndex === null && !view?.floor) goTo(best);
  });

  /* ---------------------------------------------------------------- the record, out */

  const overlay = q('[data-v4-open]');
  const scrim = q('[data-v4-scrim]');
  const cast = q('[data-v4-cast]');
  const edge = q('[data-v4-edge]');
  const scroller = q('[data-v4-scroll]');
  const stage = q('[data-v4-stage]');
  const hero = q('[data-v4-hero]');
  const shadow = q('[data-v4-shadow]');
  const group = q('[data-v4-group]');
  const disc = q('[data-v4-disc]');
  const art = q('[data-v4-art]');
  const titles = q('[data-v4-titles]');
  const title = q('[data-v4-title]');
  const meta = q('[data-v4-meta]');
  const details = q('[data-v4-details]');
  const bar = q('[data-v4-bar]');
  const closeButton = q<HTMLButtonElement>('[data-record-close]');
  const pageContent = q('[data-v4-page]');
  const footer = document.querySelector<HTMLElement>('.music-footer');

  // The tear strip.
  const strip = q('[data-unwrap]');
  const stripWin = q('[data-v4-strip-win]');
  const stripBand = q('[data-v4-strip-band]');
  const handle = q('[data-unwrap-handle]');
  const knob = q('.v4-tab__knob', handle);
  const sheets = [...root.querySelectorAll<HTMLElement>('[data-v4-sheet]')];
  const slacks = [...root.querySelectorAll<HTMLElement>('[data-v4-slack]')];
  // The film: a top piece and a bottom piece.
  const films = [q('[data-v4-film="top"]'), q('[data-v4-film="bottom"]')] as const;
  const filmMid = q('[data-v4-film-mid]'); // the film where the tape goes, shown until the tape is there
  // Each piece's drawn edge, and the faint body it gets once it is off the sleeve (renderShed).
  const filmEdges = [...root.querySelectorAll<HTMLElement>('[data-v4-film-edge]')];
  const filmBodies = [...root.querySelectorAll<HTMLElement>('[data-v4-film-body]')];
  // The light a sleeve has in the row (the lamp, and the film's edge as the row draws it): the record
  // takes it on as it lands, so the sleeve in the row takes over from it unchanged.
  const lamp = q('[data-v4-lamp]');
  const discShadow = q('[data-v4-disc-shadow]');
  const sweep = q('[data-v4-sweep]');
  const hintCaption = q('[data-v4-hint]');

  let unwrapped = false; // the record that is out has been unwrapped; putting it back wraps it again
  let openIndex: number | null = null;
  let phase: 'idle' | 'open' | 'closing' = 'idle';
  /* Putting an unwrapped record back: the film closes over the sleeve ('film'), the tape seals back
     across it behind the tab ('tape'), and the record leaves for the row while the tab is still on its
     way ('fly'). A sealed record goes straight to 'fly'. */
  let closeStep: 'film' | 'tape' | 'fly' = 'fly';

  const lift = new Spring(0, { response: 0.52, damping: 1 }, 0.0005); // 0 in the row, 1 in front of you
  const reveal = new Spring(0, { response: 0.7, damping: 1 }, 0.0005); // 0 disc in the sleeve, 1 half out
  const slide = new Spring(0, { response: 0.7, damping: 1 }, 0.0005); // 0 sleeve in the middle, 1 moved over for the disc
  const peel = new Spring(0, { response: 0.35, damping: 1 }, 0.0005); // 0 sealed, 1 strip torn off
  const rise = new Spring(0, { response: 0.55, damping: 1 }, 0.05); // px: the record making room for the details
  const away = new Spring(0, { response: 0.42, damping: 1 }, 0.0005); // 0 film on the sleeve, 1 gone: the top piece
  const away2 = new Spring(0, { response: 0.56, damping: 1 }, 0.0005); // the same for the bottom piece
  const tilt = new Spring(0, { response: 0.3, damping: 1 }, 0.0005); // the lean, once the record is on its way back
  let shedding = false; // the film is coming away, or coming back on
  // Putting it back: how much of the film showed when it turned round (renderShed).
  let shedFrom = [{ a: 1, fade: 0 }, { a: 1, fade: 0 }];
  let detailsTimer = 0;

  /** The spring a record goes home on. Into the ring it is carried over its place and then lowered
      (renderHero), which needs a little longer than the one move into the row. */
  const homeResponse = () => 0.44 + 0.1 * (view?.w ?? 0);

  /** Pulling the tape leans on the record: its right side tips away by this much, and it sinks a little. */
  const TILT = 8; // degrees
  const PRESS = 0.045; // of its size

  // Geometry of the pulled-out record, measured when it comes out.
  let So = 0; // its size
  let target = { cx: 0, cy: 0 }; // its centre at rest, in the viewport, with the overlay at scrollAt
  let scrollAt = 0;
  let source = { cx: 0, cy: 0 }; // the middle of the row's sleeve slot, in the viewport
  let revealScale = 1;

  /** Where the record sits at rest, without the flight (hero) or the room-making glide (stage). The
      caller renders straight after, which puts both back before the frame is drawn. */
  function measureOpen() {
    css(hero, 'transform', 'none');
    css(stage, 'transform', '');
    const r = hero.getBoundingClientRect();
    So = r.width;
    target = { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    scrollAt = scroller.scrollTop;
    const rr = row.getBoundingClientRect();
    source = { cx: rr.left + rr.width / 2, cy: rr.top + buttons[0]!.offsetTop + S / 2 };
    // Sleeve plus the half of the disc that shows is 1.48 sleeves wide; shrink it to fit a phone.
    revealScale = Math.min(1, (window.innerWidth - 32) / (So * 1.48));
    overlay.style.setProperty('--cast', `${S}px`); // its shadow on the floor is a sleeve's footprint
  }

  function fill(i: number, v: Vinyl) {
    const tone = buttons[i]!.dataset.tone === 'light' ? 'light' : 'dark';
    overlay.dataset.tone = tone;
    // The disc's label takes its colour from the cover (worked out with the covers, see sleeve.ts).
    overlay.style.setProperty('--label-bg', buttons[i]!.dataset.label ?? '#444');
    art.innerHTML = q('.v4-art', buttons[i]!).innerHTML;
    title.textContent = v.title;
    meta.textContent = `${v.artist}, ${v.year}`;
    q('[data-v4-about]').textContent = v.about;
    const link = q<HTMLAnchorElement>('[data-v4-source]');
    link.href = v.source.url;
    q('[data-v4-source-label]', link).textContent = v.source.label;
    q('[data-tracklist]').replaceChildren(
      ...v.tracks.map((t) => {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = typeof t === 'string' ? t : t.title;
        if (typeof t !== 'string') {
          const feat = document.createElement('span');
          feat.className = 'v4-tracks__feat';
          feat.textContent = `feat. ${t.feat}`;
          name.append(' ', feat);
        }
        li.append(name);
        return li;
      }),
    );
    const f = musicCopy.record.fields;
    const facts: [string, string, string][] = [
      ['year', f.year, String(v.year)],
      ['format', f.format, v.format],
      ['tracks', f.tracks, String(v.tracks.length)],
      ['label', f.label, v.label],
      ['genre', f.genre, v.genre],
    ];
    q('[data-v4-facts]').replaceChildren(
      ...facts.map(([key, name, value]) => {
        const box = document.createElement('div');
        box.className = `v4-fact v4-fact--${key}`;
        const dt = document.createElement('dt');
        dt.textContent = name;
        const dd = document.createElement('dd');
        dd.textContent = value;
        box.append(dt, dd);
        return box;
      }),
    );
  }

  function setBackgroundInert(on: boolean) {
    pageContent.inert = on;
    if (footer) footer.inert = on;
    document.documentElement.style.overflow = on ? 'hidden' : '';
  }

  function openRecord(i: number) {
    if (openIndex !== null) return;
    const v = records[i]!;
    openIndex = i;
    phase = 'open';
    unwrapped = false;
    closeStep = 'fly';
    fill(i, v);
    say('v4:open', { index: i, id: v.id });

    overlay.hidden = false;
    overlay.setAttribute('data-record-open', v.id);
    overlay.removeAttribute('data-record-unwrapped');
    overlay.removeAttribute('data-layout-open');
    overlay.removeAttribute('data-show-details');
    overlay.classList.remove('is-closing', 'is-shedding');
    overlay.classList.add('is-instant');
    details.hidden = true;
    css(details, 'transform', '');
    handle.tabIndex = 0;
    scroller.scrollTop = 0;
    scroller.scrollLeft = 0;
    setBackgroundInert(true);

    measureOpen();
    clearTimeout(hintTimer);
    hintPhase = hintShown ? 'done' : 'idle';
    peel.set(0);
    reveal.set(0);
    rise.set(0);
    slide.set(0);
    away.set(0);
    away2.set(0);
    tilt.set(0);
    shedding = false;

    if (reduced()) {
      // No flight: the record is simply there, faded in over its place in the row, which goes once
      // the overlay is opaque.
      lift.set(1);
      overlay.classList.add('is-fade');
      overlay.style.opacity = '0';
      renderAll();
      void overlay.offsetWidth;
      overlay.style.opacity = '1';
      window.setTimeout(() => openIndex === i && phase === 'open' && buttons[i]!.classList.add('is-out'), 210);
    } else {
      buttons[i]!.classList.add('is-out');
      lift.to(1, { response: 0.52, damping: 1 });
      renderAll();
    }
    requestAnimationFrame(() => overlay.classList.remove('is-instant'));
    handle.focus({ preventScroll: true });
    tick();
  }

  /* Putting it back. It always goes back sealed: an unwrapped record has its film close over it and the
     tape seal back across it first, the reverse of the unwrapping, overlapping the flight home. */
  function closeRecord() {
    if (openIndex === null || phase === 'closing') return;
    const leaning = lean();
    phase = 'closing';
    clearTimeout(detailsTimer);
    cancelHint();
    if (peelDrag) endPeel(null);
    overlay.removeAttribute('data-show-details');
    // Nothing scrolls under a record on its way back: a scroll during the flight would move it a frame
    // before the loop could follow, and a momentum scroll on a phone stops here.
    overlay.classList.add('is-closing');
    tilt.set(leaning);
    tilt.to(0, { response: 0.3, damping: 1 });

    if (reduced()) {
      // A cross-fade: the record shows again in the row, sealed, as the overlay fades off it unchanged.
      buttons[openIndex]!.classList.remove('is-out');
      overlay.classList.add('is-fade');
      overlay.style.opacity = '0';
      window.setTimeout(finishClose, 210);
      return;
    }

    const rewrap = unwrapped;
    if (rewrap) {
      // The tab stays off until the film is nearly back on (the 'tape' step, in the frame loop): the
      // reverse of the unwrapping, where it slipped off before the film came away.
      unwrapped = false;
      handle.tabIndex = 0;
      shedding = true; // the film comes back the way it left
      overlay.classList.add('is-shedding');
      shedFrom = [away, away2].map((s) => ({ a: Math.max(s.value, 0.001), fade: shedFade(s.value) }));
    }

    // Scrolled down the details: scroll back to the top but leave everything where it is on screen, the
    // details as they fade and the record as it comes back down. A record scrolled out of sight starts
    // just above the top edge rather than from wherever it was.
    const sc = scroller.scrollTop;
    scroller.scrollTop = 0;
    measureOpen(); // fresh, in case the window changed
    if (sc > 0) {
      css(details, 'transform', `translate3d(0,${-sc}px,0)`);
      const bottom = stage.getBoundingClientRect().bottom; // the record and its name, at rest
      let r = rise.value - sc;
      if (bottom + r < 0) r = -bottom - 8;
      rise.value = r; // keeps its velocity
    }
    rise.to(0, { response: 0.42, damping: 1 });

    if (rewrap) {
      closeStep = 'film';
      reveal.to(0, { response: 0.32, damping: 1 });
      slide.to(0, { response: 0.32, damping: 1 });
      // As they left; a piece still leaving turns round.
      away.to(0, { response: 0.42, damping: 1 });
      away2.to(0, { response: 0.42, damping: 1 });
    } else {
      closeStep = 'fly';
      peel.to(0, { response: 0.3, damping: 1 });
      lift.to(0, { response: homeResponse(), damping: 1 });
    }
    renderAll();
    tick();
  }

  function finishClose() {
    if (openIndex === null) return;
    const i = openIndex;
    openIndex = null;
    phase = 'idle';
    unwrapped = false;
    closeStep = 'fly';
    clearTimeout(detailsTimer);
    for (const s of [lift, reveal, slide, rise, peel, away, away2, tilt]) s.set(0);
    shedding = false;
    say('v4:close', { index: i, id: records[i]!.id });
    overlay.hidden = true;
    overlay.removeAttribute('data-record-open');
    overlay.removeAttribute('data-record-unwrapped');
    overlay.removeAttribute('data-layout-open');
    overlay.removeAttribute('data-show-details');
    overlay.classList.remove('is-fade', 'is-closing', 'is-shedding');
    overlay.style.opacity = '';
    css(details, 'transform', '');
    css(stage, 'transform', '');
    buttons[i]!.classList.remove('is-out');
    setBackgroundInert(false);
    renderRow();
    buttons[i]!.focus({ preventScroll: true });
  }

  /* The flight between your hands and the record's place. In the row it is one move: across, turning,
     shrinking, with a little rise on the way. Into the ring seen from above it is two, as a hand puts
     something down on a floor: the record is carried over its place, already level with the floor,
     and then lowered onto it; so it is over its place early (`across`), level early (`level`), and
     only then comes down to size (`down`), its shadow tightening under it. Taking it out is the same
     film backwards: it comes up off the floor where it lay, and then to you. All of it is drawn from
     the one spring (`lift`), so it can be turned round at any point of the way. */
  const smooth = (v: number) => v * v * (3 - 2 * v);
  function renderHero() {
    const t = lift.value;
    if (lift.settled && t === 1) {
      css(hero, 'transform', 'none');
      css(cast, 'opacity', '0');
    } else {
      // From where the record is in front (the stage may still be gliding: rise) to its pose in the row,
      // wherever the row is right now; or to where it lies in the ring.
      const g = place(openIndex!);
      const above = view ? view.w : 0; // how much of this flight is the ring's kind
      const u = clamp(1 - t, 0, 1);
      const across = u + (1 - (1 - u) * (1 - u) - u) * above;
      const level = u + (smooth(clamp(u / 0.62, 0, 1)) - u) * above;
      const down = u + (u * Math.sqrt(u) - u) * above;
      // A spring a little past its end still moves it, as it always has in the row.
      const past = 1 - t - u;
      const k = (g.k * g.s * S) / So;
      const scrolled = scroller.scrollTop - scrollAt;
      const x = (source.cx + g.x - target.cx) * (across + past);
      const y = (source.cy + g.y - (target.cy - scrolled) - rise.value) * (across + past) - Math.sin(Math.PI * clamp(t, 0, 1)) * So * 0.1 * (1 - above);
      // Its perspective shortens as it shrinks, so on its last frame it is drawn exactly as the sleeve
      // in the ring is (see `turned`), and the two change places unseen.
      const near = 1 + (g.k - 1) * down;
      const turn = view ? turn3d(g.pitch * level, g.yaw * level, g.lay * level) : `rotateY(${(g.yaw * (u + past)).toFixed(3)}deg)`;
      css(hero, 'transform', `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) perspective(${(P * near).toFixed(1)}px) ${turn} scale(${(1 + (k - 1) * (down + past)).toFixed(4)})`);

      if (view && above > 0) {
        // Its shadow lies where it will: on the floor at its place, and across the corners of its
        // neighbours. The lamp is overhead, so the shadow is under the record and a little towards
        // you; the higher the record, the larger and fainter. It is gone as the record touches down,
        // and before the backdrop has cleared there is no floor to see it on.
        const high = 1 - down;
        const size = g.k * g.s * (1 + 0.26 * high);
        const cx = source.cx + g.x - S / 2;
        const cy = source.cy + g.y - S / 2 + high * S * g.k * 0.07;
        css(cast, 'transform', `translate3d(${cx.toFixed(2)}px,${cy.toFixed(2)}px,0) perspective(${(P * g.k).toFixed(1)}px) ${turn3d(g.pitch, g.yaw, g.lay)} scale(${size.toFixed(4)})`);
        css(cast, 'opacity', (0.62 * above * smooth(clamp((u - 0.18) / 0.4, 0, 1)) * (1 - smooth(clamp((down - 0.8) / 0.2, 0, 1)))).toFixed(3));
      } else {
        css(cast, 'opacity', '0');
      }
    }
    css(stage, 'transform', rise.value === 0 ? '' : `translate3d(0,${rise.value.toFixed(2)}px,0)`);
    const a = clamp(t, 0, 1);
    const dim = Math.min(1, a * 1.5).toFixed(3);
    css(scrim, 'opacity', dim);
    css(edge, 'opacity', dim); // the scroll edge is the backdrop's colour: it comes and goes with it
    // A sleeve in the row casts no shadow; the record in front does.
    css(shadow, 'opacity', a.toFixed(3));
    // And it is lit as the row lights it: the record trades its own film edge for the row's as it flies,
    // so nothing changes on the frame the sleeve in the row takes its place.
    css(lamp, 'opacity', (1 - a).toFixed(3));
    for (const el of filmEdges) css(el, 'opacity', a.toFixed(3));
    const late = clamp((t - 0.65) / 0.35, 0, 1);
    const lateS = late.toFixed(3);
    css(titles, 'opacity', lateS);
    css(bar, 'opacity', lateS);
    // What a sleeve in the row doesn't have (the tear tape and its tab) arrives with it and leaves
    // first; the film that was in the tape's place goes as the tape comes.
    css(handle, 'opacity', lateS);
    css(stripBand, 'opacity', lateS); // on the glass itself: a faded parent would cut it off from what it blurs
    // Glass nobody can see isn't drawn: its blur would still be worked out on every frame of the flight.
    // (On the knob, not the tab: the tab keeps its focus.)
    css(stripBand, 'visibility', late === 0 ? 'hidden' : '');
    css(knob, 'visibility', late === 0 ? 'hidden' : '');
    css(filmMid, 'opacity', (1 - late).toFixed(3));
    // "Slide to unwrap" under the title while sealed; it goes as the tape comes off.
    css(hintCaption, 'opacity', (late * clamp(1 - peel.value * 2.5, 0, 1)).toFixed(3));
  }

  /** How far the record leans, 0 to 1. It comes on early in the pull. Once the tape is off the record
      is let go on a spring (commitUnwrap) and swings back a little past flat before it settles; on the
      way back it lets go of whatever lean it had. */
  function lean() {
    if (openIndex === null || reduced()) return 0;
    if (phase === 'closing' || unwrapped) return tilt.value;
    return 1 - (1 - clamp(peel.value, 0, 1)) ** 3;
  }

  function renderReveal() {
    const r = reveal.value;
    const t = lean();
    // The sleeve moves over for the disc on a spring of its own, without the disc's overshoot.
    const g = slide.value;
    const shift = -0.24 * So * revealScale * g;
    const s = (1 - (1 - revealScale) * g) * (1 - PRESS * t);
    const tilted = t === 0 ? '' : ` perspective(${(So * 3.8).toFixed(0)}px) rotateY(${(TILT * t).toFixed(3)}deg)`;
    css(group, 'transform', g === 0 && t === 0 ? 'none' : `translate3d(${shift.toFixed(2)}px,0,0) scale(${s.toFixed(4)})${tilted}`);
    // The disc rolls out: it turns as it travels, runs a little past where it stops and rolls back.
    // All the way in, it is out of sight: its shadow would show under the sleeve in the row. So its
    // shadow goes as it slides in, rather than all at once when it is home.
    css(disc, 'transform', r === 0 ? 'none' : `translate3d(${(0.5 * So * r).toFixed(2)}px,0,0) rotate(${((r - 1) * 84).toFixed(2)}deg)`);
    css(disc, 'visibility', r === 0 ? 'hidden' : '');
    css(discShadow, 'opacity', clamp(r / 0.35, 0, 1).toFixed(3));
  }

  /* The tear strip. The tab's right edge is the tear: behind it the strip is gone and the bare sleeve
     shows through a clean channel; ahead of it the band and its label remain, covered by the tab as
     it passes. Two opposing translates do the clipping, so it is transform only. */
  let lastValueNow = -1;
  function renderPeel() {
    const p = peel.value;
    const pc = clamp(p, 0, 1);
    const torn = pc * So;
    css(stripWin, 'transform', `translate3d(${torn.toFixed(2)}px,0,0)`);
    css(stripBand, 'transform', `translate3d(${(-torn).toFixed(2)}px,0,0)`);
    css(handle, 'transform', `translate3d(${(p * So).toFixed(2)}px,0,0)`);
    // With the tape going, the film loses its tension: the long taut streaks thin out and the short
    // folds of slack film come up in their place.
    const k = clamp((pc - 0.2) / 0.8, 0, 1);
    const loose = k * k * (3 - 2 * k);
    const taut = (1 - 0.65 * loose).toFixed(3);
    const slack = loose.toFixed(3);
    for (const el of sheets) css(el, 'opacity', taut);
    for (const el of slacks) css(el, 'opacity', slack);
    const now = Math.round(pc * 100);
    if (now !== lastValueNow) {
      lastValueNow = now;
      handle.setAttribute('aria-valuenow', String(now));
    }
  }

  /* The film coming away once the tape is off. The two pieces are not a mirror image: the top one floats
     up and drifts on after the tab, easing off as it goes; the bottom one, held by the tab longest, lets
     go later and drops, gathering speed. Both curl away from the sleeve and shrink a touch as the film
     loses its stretch. Put back, each comes back on along the same path. */
  /** Leaving, the film is gone well before the end of its way: a third of the way out it is fading. */
  const shedFade = (a: number) => clamp(1 - a * 1.45, 0, 1);

  function renderShed() {
    for (let i = 0; i < 2; i++) {
      const a = (i === 0 ? away : away2).value;
      // Coming back it shows from the start of its way and is all there as it lands, so it closes over
      // the sleeve instead of appearing at the last moment; it starts from what showed as it turned round.
      let f = shedFade(a);
      if (phase === 'closing') f = shedFrom[i]!.fade + (1 - shedFrom[i]!.fade) * clamp(1 - a / shedFrom[i]!.a, 0, 1);
      let tf = 'none';
      if (a !== 0) {
        // Short ways: far enough to read as leaving, not so far that they cross the title below.
        const fall = a * a;
        const x = (i === 0 ? 0.06 * a : 0.02 * fall) * So;
        const y = (i === 0 ? -0.2 * a : 0.26 * fall) * So;
        const rot = i === 0 ? -6 * a - 2.2 * Math.sin(Math.PI * clamp(a, 0, 1)) : 5 * fall;
        const curl = (i === 0 ? 28 : -22) * a;
        tf = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) perspective(${(So * 2.5).toFixed(0)}px) rotateX(${curl.toFixed(2)}deg) rotate(${rot.toFixed(3)}deg) scale(${(1 - 0.04 * a).toFixed(4)})`;
      }
      css(films[i]!, 'transform', tf);
      css(films[i]!, 'opacity', a === 0 ? '' : f.toFixed(3));
      // Off the sleeve clear film would only show as stray lines, so it gets the faintest body there. It
      // comes with the distance: none on the sleeve, where it would grey the sleeve over.
      css(filmBodies[i]!, 'opacity', clamp(a * 4, 0, 1).toFixed(3));
    }
  }

  function renderAll() {
    renderRow();
    if (openIndex !== null) {
      renderHero();
      renderReveal();
      renderPeel();
      renderShed();
    }
  }

  /* Dragging the tab: 1:1 along the strip from where it was grabbed (anywhere on the strip moves it by
     as much as the finger moves). Let go early and it springs back, re-sealing the strip behind it;
     past 60%, or thrown so that it would get there, it finishes on its own. */
  let peelDrag: { id: number; x0: number; p0: number; el: HTMLElement } | null = null;
  const peelTracker = new VelocityTracker();

  function startPeel(e: PointerEvent, el: HTMLElement) {
    if (openIndex === null || phase !== 'open' || unwrapped || peelDrag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (!lift.settled) {
      lift.set(1); // grabbed while still arriving: it is here now
      renderHero();
    }
    el.setPointerCapture(e.pointerId);
    peel.set(peel.value);
    cancelHint();
    peelDrag = { id: e.pointerId, x0: e.clientX, p0: peel.value, el };
    peelTracker.reset(e.clientX, e.timeStamp);
    handle.classList.add('is-pressed');
    tick();
  }
  function movePeel(e: PointerEvent) {
    if (!peelDrag || e.pointerId !== peelDrag.id) return;
    peelTracker.push(e.clientX, e.timeStamp);
    // Once it moves, the tab is picked up: a touch larger, its shadow deeper.
    if (Math.abs(e.clientX - peelDrag.x0) > 2) handle.classList.add('is-lifted');
    let p = peelDrag.p0 + (e.clientX - peelDrag.x0) / So;
    if (p < 0) p = -rubberband(-p * So, So, 0.3) / So;
    else if (p > 1) p = 1 + rubberband((p - 1) * So, So, 0.3) / So;
    peel.set(p);
    tick();
  }
  function endPeel(e: PointerEvent | null) {
    if (!peelDrag) return;
    if (e && e.pointerId !== peelDrag.id) return;
    peelDrag = null;
    handle.classList.remove('is-pressed', 'is-lifted');
    const vPx = e && e.type !== 'pointercancel' ? peelTracker.velocity(e.timeStamp) : 0;
    const v = vPx / So; // strip-lengths per second
    const projected = peel.value + project(vPx, 0.995) / So;
    const done = phase === 'open' && projected >= 0.6;
    if (done) {
      if (reduced()) peel.set(1);
      else peel.to(1, { response: 0.3, damping: 1, velocity: Math.max(v, 0) });
    } else {
      peel.to(0, { response: 0.35, damping: 1, velocity: v });
    }
    tick();
  }
  for (const el of [handle, strip]) {
    el.addEventListener('pointerdown', (e) => startPeel(e, el));
    el.addEventListener('pointermove', movePeel);
    el.addEventListener('pointerup', endPeel);
    el.addEventListener('pointercancel', endPeel);
    el.addEventListener('lostpointercapture', () => endPeel(null));
  }
  handle.addEventListener('keydown', (e) => {
    if (openIndex === null || phase !== 'open' || unwrapped) return;
    if (['ArrowRight', 'ArrowUp', 'End', 'PageUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      if (reduced()) peel.set(1);
      else peel.to(1, { response: 0.5, damping: 1 });
      tick();
    }
  });

  /* A one-time hint, half a second after a sealed record has landed: the tab tugs the tape 10px and lets
     go, and a soft light runs once along the tape. Never repeats; any touch or key cancels it. */
  let hintTimer = 0;
  let hintPhase: 'idle' | 'waiting' | 'out' | 'done' = 'idle';
  let hintShown = false; // once per visit
  function scheduleHint() {
    if (hintPhase !== 'idle' || reduced()) return;
    hintPhase = 'waiting';
    hintTimer = window.setTimeout(() => {
      if (phase !== 'open' || openIndex === null || unwrapped || peelDrag) return cancelHint();
      hintPhase = 'out';
      hintShown = true;
      peel.to(10 / So, { response: 0.28, damping: 1 });
      sweep.animate(
        [{ transform: 'translateX(-100%)', opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.7 }, { transform: 'translateX(100%)', opacity: 0 }],
        { duration: 900, easing: 'cubic-bezier(0.77, 0, 0.175, 1)' },
      );
      tick();
    }, 500);
  }
  function cancelHint() {
    clearTimeout(hintTimer);
    if (hintPhase === 'out' && !peelDrag) peel.to(0, { response: 0.3, damping: 1 });
    for (const a of sweep.getAnimations()) a.cancel();
    hintPhase = 'done';
  }
  overlay.addEventListener('pointerdown', () => hintPhase !== 'done' && cancelHint(), true);
  overlay.addEventListener('keydown', () => hintPhase !== 'done' && cancelHint(), true);

  /* Finished: the tab slips off the edge and the film comes away on a spring that starts at the speed
     the tape was going, so a quick pull throws it and a slow one lets it fall. As it clears, the record
     moves up to make room, the details rise in beneath it, and the disc slides out. */
  function commitUnwrap() {
    if (openIndex === null || unwrapped) return;
    const speed = peel.velocity; // strip-lengths per second
    unwrapped = true;
    peel.set(1);
    overlay.setAttribute('data-record-unwrapped', '');
    handle.tabIndex = -1;
    title.focus({ preventScroll: true });
    // One tick as the tape lets go, where the device has haptics for the web.
    if ('vibrate' in navigator) navigator.vibrate(8);
    if (reduced()) {
      openLayout(false);
      reveal.set(1);
      slide.set(1);
      requestAnimationFrame(() => overlay.setAttribute('data-show-details', ''));
      tick();
      return;
    }
    shedding = true;
    overlay.classList.add('is-shedding');
    away.set(0);
    away.to(1, { response: 0.42, damping: 1, velocity: clamp(speed * 0.6, 0, 4) });
    away2.set(0);
    away2.to(1, { response: 0.56, damping: 1, velocity: clamp(speed * 0.25, 0, 3) });
    // The record was leaning into the pull: with the tension gone it swings back past flat and settles.
    tilt.set(1);
    tilt.to(0, { response: 0.46, damping: 0.45 });
    tick();
  }

  function endShed() {
    shedding = false;
    overlay.classList.remove('is-shedding');
  }

  function openLayout(animate: boolean) {
    if (openIndex === null || phase !== 'open') return;
    const before = stage.getBoundingClientRect().top; // where it is on screen now
    details.hidden = false;
    overlay.setAttribute('data-layout-open', '');
    const layoutAfter = stage.getBoundingClientRect().top - rise.value;
    measureOpen();
    if (animate) {
      rise.set(before - layoutAfter); // stay put on screen, then glide up to the new place
      rise.to(0, { response: 0.6, damping: 0.86 });
      // Thrown out of the sleeve: it runs a little past where it stops and rolls back.
      reveal.to(1, { response: 0.64, damping: 0.66, velocity: 0.9 });
      slide.to(1, { response: 0.7, damping: 1 });
      // The details follow the record up rather than rising with it.
      clearTimeout(detailsTimer);
      detailsTimer = window.setTimeout(() => {
        if (phase === 'open' && unwrapped) overlay.setAttribute('data-show-details', '');
      }, 140);
    }
    renderAll();
    tick();
  }

  closeButton.addEventListener('click', closeRecord);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openIndex !== null) {
      e.preventDefault();
      closeRecord();
    } else if (e.key === 'Escape' && chosenPerson >= 0) {
      choose(-1);
    }
  }, { signal });

  /* ---------------------------------------------------------------- the clock */

  let raf = 0;
  let last = 0;
  function tick() {
    if (!raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }
  function frame(now: number) {
    raf = 0;
    // The first frame of a run has no frame before it to measure from: it takes a short step, so that
    // what was just set going moves on this frame and not on the next.
    const dt = last ? Math.min(1 / 30, Math.max(0, (now - last) / 1000)) : 1 / 120;
    last = now;

    let busy = !!wheelIdle; // a swipe is followed on every frame, between its events too
    if (!rowDrag?.active) {
      if (wheelIdle) {
        if (Number.isNaN(wheelLand)) pos.to(wheelTarget(now), WHEEL_FOLLOW);
        else if (heading !== wheelLand) coast(wheelLand, 1); // let go, or its record has changed
      }
      // A finger's last move and its lifting often come within one frame. The move has already taken
      // the row this frame's distance: the spring it is let go on starts with the next frame, or the
      // row would travel two frames' worth in this one, a jolt forward on every release.
      const h = fingerMoved ? 0 : dt;
      if (lead) {
        // A row turning round (coast): its spring's aim comes home to the record, and the row with it.
        lead *= Math.exp(-h / turn);
        if (Math.abs(lead) < pos.precision) lead = 0;
        pos.target = heading + lead;
      }
      const moving = !pos.step(h) || lead !== 0;
      if (!moving) {
        thrown = false;
        // At rest, back into 0..n by whole turns: the same place on the ring, so nothing on screen
        // changes. "At rest" isn't always on a record: a trackpad swipe sets the row between two on
        // every event, and rounding it here made the whole row jump half a record once per turn.
        if (pos.value < -0.5 || pos.value >= n - 0.5) {
          const turns = n * Math.floor((pos.value + 0.5) / n);
          pos.set(pos.value - turns);
          wheelTo -= turns; // a swipe under way carries on from the same place
          wheelLand -= turns;
          heading -= turns;
        }
      }
      busy = moving || busy;
    }
    fingerMoved = false;
    for (const s of chosen) busy = !s.step(dt) || busy;
    for (const s of others) busy = !s.step(dt) || busy;
    for (const s of lit) busy = !s.step(dt) || busy;
    busy = !anyChosen.step(dt) || busy;
    // How fast the row turns, from frame to frame, whether a finger or a spring is turning it.
    if (pos.settled && !rowDrag?.active) speed = 0;
    else if (dt > 0) speed += (Math.abs(around(pos.value - speedFrom)) / dt - speed) * (1 - Math.exp(-dt / 0.1));
    speedFrom = pos.value;
    if (openIndex !== null) {
      busy = !lift.step(dt) || busy;
      busy = !reveal.step(dt) || busy;
      busy = !slide.step(dt) || busy;
      busy = !rise.step(dt) || busy;
      if (!peelDrag) busy = !peel.step(dt) || busy;
      busy = busy || !!peelDrag;
      busy = !away.step(dt) || busy;
      busy = !away2.step(dt) || busy;
      busy = !tilt.step(dt) || busy;
      if (shedding) {
        // The record opens as the film clears it, not on a timer.
        if (away.value > 0.35 && phase === 'open' && !overlay.hasAttribute('data-layout-open')) openLayout(true);
        if (away.settled && away2.settled) endShed();
      }

      if (phase === 'open' && !unwrapped && lift.settled && lift.value === 1 && hintPhase === 'idle') scheduleHint();
      if (hintPhase === 'out' && peel.value >= peel.target * 0.96) {
        hintPhase = 'done';
        peel.to(0, { response: 0.4, damping: 1 });
        busy = true;
      }
      if (phase === 'open' && !unwrapped && peel.target === 1 && peel.value >= 0.995) commitUnwrap();
      // Putting it back unwrapped: each part starts as the one before is nearly done, not after it.
      if (phase === 'closing' && closeStep === 'film' && Math.max(away.value, away2.value) < 0.4) {
        closeStep = 'tape'; // the film is nearly on: the tab slips back on and sets off along the sleeve
        overlay.removeAttribute('data-record-unwrapped');
        peel.to(0, { response: 0.34, damping: 1 });
        busy = true;
      }
      if (phase === 'closing' && closeStep === 'tape' && peel.value < 0.18) {
        closeStep = 'fly'; // nearly sealed: it heads home as the tab finishes
        lift.to(0, { response: homeResponse(), damping: 1 });
        busy = true;
      }
    }
    renderAll();
    if (phase === 'closing' && closeStep === 'fly' && lift.settled && lift.value === 0) {
      finishClose();
      busy = !pos.settled;
    }
    if (busy || rowDrag?.active) raf = requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------- start */

  measure();
  renderRow();
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      measure();
      // Also mid-flight: a phone's toolbar coming or going resizes the window, and a record flying to
      // the old place would land off it and jump.
      if (openIndex !== null) measureOpen();
      renderAll();
    });
  }, { signal });
  signal.addEventListener('abort', () => {
    cancelAnimationFrame(raf);
    cancelAnimationFrame(resizeFrame);
    clearTimeout(wheelIdle);
    clearTimeout(hintTimer);
    clearTimeout(detailsTimer);
  });
}
