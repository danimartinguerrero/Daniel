/**
 * Design 2, "Crate". Three pieces of motion, all springs that start from what is on screen:
 *
 * - The flip: one number, `pos`, says which record is at the front (fractions are records part-way
 *   over). A sideways drag moves it 1:1; on release a flick is projected forward (Apple's
 *   deceleration) to the record it would come to rest on, and the spring takes the finger's speed.
 * - The lift: the front record leaves the crate for the centre of the screen. Its out-of-crate copy
 *   starts exactly over the sleeve in the crate and springs home; the crate sinks and dims behind it.
 *   Putting it back runs the same springs in reverse, down behind the crate's front wall.
 * - The tear: a strip of tape runs across the film. Its tab follows the finger 1:1 and the tape comes
 *   away behind it; past the threshold (or flicked) it runs off the edge alone and the film lifts away.
 *
 * Every frame writes only `transform` and `opacity` (plus a clip on the lifted record for the few
 * frames it is still behind the crate wall).
 */
import { Spring, run, project, rubberband, VelocityTracker, type SpringConfig } from './spring';

const FLIP: SpringConfig = { response: 0.42, damping: 1 };
const FLICK: SpringConfig = { response: 0.5, damping: 0.84 };
const BRING: SpringConfig = { response: 0.4, damping: 1 };
const LIFT_Y: SpringConfig = { response: 0.46, damping: 1 };
const LIFT_X: SpringConfig = { response: 0.54, damping: 1 };
const LIFT_S: SpringConfig = { response: 0.54, damping: 1 };
const SINK: SpringConfig = { response: 0.5, damping: 1 };
const TEAR_BACK: SpringConfig = { response: 0.36, damping: 1 }; // let go early: back and re-sealed
const TEAR_OFF: SpringConfig = { response: 0.3, damping: 1 }; // past the threshold: off the edge
const FILM_OFF: SpringConfig = { response: 0.24, damping: 1 }; // the rest of the film, ~300 ms
const MAKE_ROOM: SpringConfig = { response: 0.45, damping: 1 };
const FADE: SpringConfig = { response: 0.22, damping: 1 };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function initCrate(): void {
  const main = document.querySelector<HTMLElement>('[data-music-page]');
  if (!main) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  const crate = main.querySelector<HTMLElement>('[data-crate]')!;
  const stage = main.querySelector<HTMLElement>('[data-stage]')!;
  const recs = [...stage.querySelectorAll<HTMLButtonElement>('button[data-vinyl]')];
  const arts = recs.map((r) => r.querySelector<HTMLElement>('.rec__art')!);
  const shades = recs.map((r) => r.querySelector<HTMLElement>('.rec__shade')!);
  const front = stage.querySelector<HTMLElement>('[data-front]')!;
  const walls = stage.querySelector<SVGSVGElement>('[data-walls]')!;
  const wall = (name: string) => walls.querySelector<SVGPathElement>(`[data-wall="${name}"]`)!;
  const readTitle = main.querySelector<HTMLElement>('[data-readout-title]')!;
  const readArtist = main.querySelector<HTMLElement>('[data-readout-artist]')!;
  const readCount = main.querySelector<HTMLElement>('[data-readout-count]')!;
  const steps = [...main.querySelectorAll<HTMLButtonElement>('[data-step]')];

  const lift = main.querySelector<HTMLElement>('[data-lift]')!;
  const scrim = lift.querySelector<HTMLElement>('[data-scrim]')!;
  const scroller = lift.querySelector<HTMLElement>('[data-scroll]')!;
  const edge = lift.querySelector<HTMLElement>('[data-edge]')!;
  // Each record's out-of-crate view waits in a <template>; only the one that is out is in the document.
  const panelCache = new Map<number, HTMLElement>();
  const panelFor = (i: number): HTMLElement => {
    let p = panelCache.get(i);
    if (!p) {
      const tpl = lift.querySelector<HTMLTemplateElement>(`template[data-panel-tpl="${recs[i]!.dataset.vinyl}"]`)!;
      p = (tpl.content.firstElementChild as HTMLElement).cloneNode(true) as HTMLElement;
      panelCache.set(i, p);
    }
    return p;
  };
  const background = [...main.querySelectorAll<HTMLElement>('[data-v2-bg]'), document.querySelector<HTMLElement>('.music-footer')].filter(
    (el): el is HTMLElement => !!el,
  );

  const N = recs.length;
  const K = 0.022; // perspective: each step back is this much smaller
  let S = 0; // sleeve size in the crate, px
  let STRIP = 0; // how much of each record behind shows above the one in front, px
  let UNIT = 0; // finger travel per record, px
  // A little hand-placed untidiness, so the crate does not look machined. Fades out at the front.
  const jitter = recs.map((_, i) => ({ x: (((i * 37) % 7) - 3) * 0.7, r: (((i * 53) % 9) - 4) * 0.14 }));

  const pos = new Spring(0, FLIP, 0.0005);
  let shown = -1;

  /* ——— Layout ——— */

  function measure(): void {
    S = recs[0]!.offsetWidth;
    STRIP = Math.round(S * 0.062);
    UNIT = S * 0.5;
    const top0 = STRIP * (N - 1) + 28;
    const wallTop = top0 + S * 0.6;
    const wallH = S * 0.4 + 18;
    stage.style.setProperty('--strip', `${STRIP}px`);
    stage.style.setProperty('--top0', `${top0}px`);
    stage.style.setProperty('--wall-top', `${wallTop}px`);
    stage.style.setProperty('--wall-h', `${wallH}px`);
    stage.style.height = `${top0 + S + 30}px`;

    // The crate's inside: two side walls and a back, drawn in the same perspective as the records.
    const W = stage.clientWidth;
    const cx = W / 2;
    const inner = S / 2 + 10;
    const rim = 9;
    const db = N + 0.4;
    const sb = 1 / (1 + K * db);
    const floorF = top0 + S;
    const floorB = top0 - db * STRIP + S * sb;
    const topB = floorB - (floorF - wallTop) * sb;
    const xb = inner * sb;
    walls.setAttribute('viewBox', `0 0 ${W} ${stage.offsetHeight}`);
    const pts = (p: [number, number][]) => 'M' + p.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L') + ' Z';
    wall('back').setAttribute('d', pts([[cx - xb, topB], [cx + xb, topB], [cx + xb, floorB], [cx - xb, floorB]]));
    wall('left').setAttribute('d', pts([[cx - inner, wallTop], [cx - xb, topB], [cx - xb, floorB], [cx - inner, floorF]]));
    wall('right').setAttribute('d', pts([[cx + inner, wallTop], [cx + xb, topB], [cx + xb, floorB], [cx + inner, floorF]]));
    wall('rim-left').setAttribute('d', pts([[cx - inner - rim * 1.4, wallTop + 1], [cx - xb - rim * sb, topB], [cx - xb, topB], [cx - inner, wallTop + 1]]));
    wall('rim-right').setAttribute('d', pts([[cx + inner + rim * 1.4, wallTop + 1], [cx + xb + rim * sb, topB], [cx + xb, topB], [cx + inner, wallTop + 1]]));
    render();
  }

  /* ——— The flip ——— */

  // The crate goes round: a record flipped past tips toward you, drops away, and slides back in at
  // the rear, so all eight always stand in the crate and any of them can be reached and tapped.
  const wrapIndex = (n: number): number => ((n % N) + N) % N;
  const TIP = 0.72; // the share of one flip spent tipping out; the rest is sliding back in at the rear
  let order = '';

  function render(): void {
    const p = pos.value;
    const z: number[] = [];
    for (let i = 0; i < N; i++) {
      const d = wrapIndex(i - p); // 0 = at the front, N-1 = at the back
      const j = jitter[i]!;
      const el = recs[i]!;
      let transform: string;
      let opacity = 1;
      let shade: number;
      let still = true;
      if (d <= N - 1) {
        const settle = clamp(d, 0, 1); // the untidiness fades out at the front
        const s = 1 / (1 + K * d);
        transform = `translate3d(${(j.x * settle).toFixed(2)}px, ${(-d * STRIP).toFixed(2)}px, 0) rotate(${(j.r * settle).toFixed(3)}deg) scale(${s.toFixed(4)})`;
        shade = Math.min(0.62, d * 0.085);
        z[i] = N + 1 - Math.floor(d);
      } else {
        const u = N - d; // 0..1 through this record's flip
        still = false;
        if (u < TIP) {
          // Past the front: it tips toward you about its bottom edge, heavy at first; its face turns
          // down, away from the light above, and it sinks behind the front wall.
          const t = u / TIP;
          const tip = -Math.pow(t, 1.3) * 80;
          const drop = t * t * Math.min(14, S * 0.05);
          transform = `translate3d(0, ${drop.toFixed(2)}px, 0) translateY(${S}px) perspective(${(S * 3.2).toFixed(0)}px) rotateX(${tip.toFixed(2)}deg) translateY(${-S}px) scale(${(1 + 0.02 * t).toFixed(4)})`;
          opacity = t < 0.72 ? 1 : Math.max(0, 1 - (t - 0.72) / 0.28);
          shade = t * 0.72;
          z[i] = N + 4;
        } else {
          // Back in at the rear: it rises into the last place.
          const b = (u - TIP) / (1 - TIP);
          const depth = N - 1 + (1 - b) * 0.6;
          const s = 1 / (1 + K * depth);
          transform = `translate3d(${j.x.toFixed(2)}px, ${(-depth * STRIP + (1 - b) * STRIP * 1.5).toFixed(2)}px, 0) rotate(${j.r.toFixed(3)}deg) scale(${s.toFixed(4)})`;
          opacity = b;
          shade = 0.62;
          z[i] = 1;
        }
      }
      el.style.transform = transform;
      el.style.opacity = opacity === 1 ? '' : opacity.toFixed(3);
      el.style.pointerEvents = still ? '' : 'none';
      shades[i]!.style.opacity = shade.toFixed(3);
    }
    // Stacking follows depth; it only changes when a record changes place.
    const key = z.join();
    if (key !== order) {
      order = key;
      recs.forEach((r, i) => (r.style.zIndex = String(z[i])));
    }
    const front = wrapIndex(Math.round(p));
    if (front !== shown) {
      shown = front;
      const r = recs[front]!;
      recs.forEach((el) => el.classList.toggle('is-front', el === r));
      readTitle.textContent = r.dataset.title ?? '';
      readArtist.textContent = r.dataset.artist ?? '';
      readCount.textContent = `${front + 1} / ${N}`;
    }
  }

  /** The nearest position that puts record i at the front; forward only when `ahead`. */
  const positionOf = (i: number, from: number, ahead = false): number => {
    const forward = wrapIndex(i - from);
    if (ahead || forward <= N / 2) return from + forward;
    return from + forward - N;
  };

  let pending: { index: number; at: number } | null = null;
  const flipJob = (dt: number): boolean => {
    const moving = pos.step(dt);
    render();
    if (pending && Math.abs(pos.value - pending.at) < 0.32) {
      const i = pending.index;
      pending = null;
      open(i);
    }
    return moving || pending !== null;
  };

  function go(target: number, config: SpringConfig = BRING, velocity?: number): void {
    if (reduce.matches) {
      pos.set(target);
      flipJob(0);
      return;
    }
    pos.to(target, config, velocity);
    run(flipJob);
  }

  /* Dragging: sideways only; vertical movement is left to the page. */
  let drag: { id: number; x0: number; y0: number; p0: number; locked: boolean; press: HTMLElement | null } | null = null;
  let swallowClick = false;
  const tracker = new VelocityTracker();

  let lastPointer = -Infinity;
  stage.addEventListener('pointerdown', (e) => {
    lastPointer = performance.now();
    if (state !== 'idle' || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    swallowClick = false;
    pending = null;
    // Catching a moving crate stops it where it is, and that touch is not a tap.
    if (!pos.resting && Math.abs(pos.velocity) > 0.4) swallowClick = true;
    pos.set(pos.value);
    const rec = (e.target as Element).closest<HTMLElement>('.rec');
    const press = rec && wrapIndex(Math.round(pos.value)) === Number(rec.dataset.index) ? rec : null;
    press?.classList.add('is-pressed');
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: pos.value, locked: false, press };
  });

  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.locked) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        drag.locked = true;
        drag.x0 = e.clientX; // no jump: tracking starts where the gesture was recognised
        drag.press?.classList.remove('is-pressed');
        swallowClick = true;
        stage.setPointerCapture(e.pointerId);
        stage.classList.add('is-dragging');
        tracker.reset(e.clientX);
      } else if (Math.abs(dy) > 8) {
        end();
      }
      return;
    }
    // Finger to the left flips forward, 1:1: half a sleeve's width of travel per record.
    tracker.add(e.clientX);
    pos.set(drag.p0 - (e.clientX - drag.x0) / UNIT);
    render();
  });

  function end(): void {
    drag?.press?.classList.remove('is-pressed');
    stage.classList.remove('is-dragging');
    drag = null;
  }

  function release(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.id) return;
    const locked = drag.locked;
    end();
    if (!locked) {
      if (pos.value !== Math.round(pos.value)) go(Math.round(pos.value), FLIP);
      return;
    }
    const v = -tracker.velocity / UNIT; // records per second
    // Where the flick would come to rest, at most one full turn of the crate away.
    const projected = pos.value + clamp(project(v * UNIT) / UNIT, -N, N);
    const flick = Math.abs(v * UNIT) > 500;
    go(Math.round(projected), flick ? FLICK : FLIP, v);
  }
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  // A drag that ends over a record must not also tap it.
  stage.addEventListener(
    'click',
    (e) => {
      if (swallowClick) {
        e.preventDefault();
        e.stopPropagation();
        swallowClick = false;
      }
    },
    true,
  );

  // Trackpads and sideways wheels flip; vertical wheel scrolling stays with the page.
  let wheelTimer = 0;
  stage.addEventListener(
    'wheel',
    (e) => {
      if (state !== 'idle' || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      pending = null;
      pos.set(pos.value + e.deltaX / (UNIT * 1.4));
      render();
      clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => go(Math.round(pos.value), FLIP), 90);
    },
    { passive: false },
  );

  recs.forEach((rec, i) => {
    rec.addEventListener('click', () => request(i));
    // Keyboard: Tab or the arrows bring a record to the front without opening it.
    rec.addEventListener('focus', () => {
      // Focus that comes with a tap is the tap's business (it brings the record forward and lifts it).
      if (performance.now() - lastPointer < 1000) return;
      if (state === 'idle' && !drag && wrapIndex(Math.round(pos.target)) !== i) go(positionOf(i, Math.round(pos.target)));
    });
    rec.addEventListener('keydown', (e) => {
      const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: N - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      recs[wrapIndex(to)]!.focus({ preventScroll: true });
    });
  });
  steps.forEach((b) => b.addEventListener('click', () => go(Math.round(pos.target) + Number(b.dataset.step))));

  /* ——— The lift ——— */

  type State = 'idle' | 'opening' | 'open' | 'closing';
  let state: State = 'idle';
  let current = -1;
  let queued: number | null = null;
  const lx = new Spring(0, LIFT_X, 0.05);
  const ly = new Spring(0, LIFT_Y, 0.05);
  const ls = new Spring(1, LIFT_S, 0.0005);
  const sink = new Spring(0, SINK, 0.001);
  let liftEl: HTMLElement | null = null;
  let wallLine = 0; // where the crate's front wall starts, in viewport px, with the crate at rest
  let baseTop = 0;
  let baseH = 0;

  function request(i: number): void {
    if (state === 'closing') {
      if (i === current) reopen();
      else queued = i;
      return;
    }
    if (state !== 'idle') return;
    // A record further back: flip forward through the ones in front of it, and lift it out as it arrives.
    const at = positionOf(i, pos.value, true);
    const near = positionOf(i, pos.value);
    if (Math.abs(near - pos.value) < 0.12) {
      pos.set(near);
      render();
      open(i);
    } else {
      pending = { index: i, at };
      go(at, BRING);
    }
  }

  function setBackground(off: boolean): void {
    for (const el of background) el.inert = off;
    crate.classList.toggle('is-behind', off);
    document.documentElement.style.overflow = off ? 'hidden' : '';
  }

  function open(i: number): void {
    state = 'opening';
    current = i;
    const panel = panelFor(i);
    const id = recs[i]!.dataset.vinyl!;
    liftEl = panel.querySelector<HTMLElement>('[data-out-lift]')!;

    lift.hidden = false;
    lift.classList.remove('is-passing');
    if (panel.parentElement !== scroller) scroller.append(panel);
    panel.setAttribute('data-record-open', id);
    scroller.scrollTop = 0;
    setBackground(true);

    liftEl.style.transform = 'none';
    liftEl.style.opacity = '';
    const to = liftEl.getBoundingClientRect();
    const from = arts[i]!.getBoundingClientRect();
    wallLine = front.getBoundingClientRect().top;
    baseTop = to.top;
    baseH = to.height;
    recs[i]!.classList.add('is-out');

    if (reduce.matches) {
      lx.set(0);
      ly.set(0);
      ls.set(1);
      sink.to(1, FADE);
    } else {
      lx.set(from.left - to.left).to(0, LIFT_X);
      ly.set(from.top - to.top).to(0, LIFT_Y);
      ls.set(from.width / to.width).to(1, LIFT_S);
      sink.to(1, SINK);
    }
    peelFor(i).measure();
    peelFor(i).render();
    if (reduce.matches) requestAnimationFrame(() => panel.classList.add('is-shown'));
    renderLift();
    run(liftJob);

    const handle = panel.querySelector<HTMLElement>('[data-unwrap-handle]');
    (unwrapped.has(i) ? panel : handle ?? panel).focus({ preventScroll: true });
  }

  function reopen(): void {
    const panel = panelFor(current);
    state = 'opening';
    lift.classList.remove('is-passing');
    panel.classList.remove('is-closing');
    panel.classList.add('is-shown');
    setBackground(true);
    lx.to(0, LIFT_X);
    ly.to(0, LIFT_Y);
    ls.to(1, LIFT_S);
    sink.to(1, reduce.matches ? FADE : SINK);
    run(liftJob);
    panel.focus({ preventScroll: true });
  }

  function close(): void {
    if (state !== 'open' && state !== 'opening') return;
    const i = current;
    const panel = panelFor(i);
    state = 'closing';
    peels.get(i)?.cancel();
    panel.classList.remove('is-shown', 'is-settled');
    panel.classList.add('is-closing');
    lift.classList.add('is-passing');
    setBackground(false);
    scroller.style.overflowY = 'hidden';

    // Where the sleeve goes back to: its place in the crate with the crate at rest.
    const restore = crate.style.transform;
    crate.style.transform = 'none';
    const to = arts[i]!.getBoundingClientRect();
    wallLine = front.getBoundingClientRect().top;
    crate.style.transform = restore;
    const t = liftEl!.style.transform;
    liftEl!.style.transform = 'none';
    const base = liftEl!.getBoundingClientRect();
    liftEl!.style.transform = t;
    // The springs are offsets from the sleeve's place in the (possibly scrolled) panel.
    baseTop = base.top;
    baseH = base.height;

    if (reduce.matches) {
      sink.to(0, FADE);
    } else {
      lx.to(to.left - base.left, LIFT_X);
      ly.to(to.top - base.top, LIFT_Y);
      ls.to(to.width / base.width, LIFT_S);
      sink.to(0, SINK);
    }
    run(liftJob);
    recs[i]!.focus({ preventScroll: true });
  }

  function finishClose(): void {
    const i = current;
    const panel = panelFor(i);
    panel.classList.remove('is-closing');
    panel.removeAttribute('data-record-open');
    panel.remove();
    lift.hidden = true;
    lift.classList.remove('is-passing');
    scroller.style.overflowY = '';
    recs[i]!.classList.remove('is-out');
    if (liftEl) {
      liftEl.style.transform = '';
      liftEl.style.clipPath = '';
      liftEl.style.opacity = '';
    }
    crate.style.transform = '';
    crate.style.opacity = '';
    scrim.style.opacity = '0';
    edge.style.opacity = '0';
    state = 'idle';
    current = -1;
    if (document.activeElement === document.body) recs[i]!.focus({ preventScroll: true });
    if (queued !== null) {
      const q = queued;
      queued = null;
      request(q);
    }
  }

  function renderLift(): void {
    const o = sink.value;
    scrim.style.opacity = clamp(o, 0, 1).toFixed(3);
    edge.style.opacity = scrim.style.opacity;
    if (reduce.matches) {
      crate.style.opacity = (1 - 0.5 * o).toFixed(3);
      if (liftEl) liftEl.style.opacity = clamp(o, 0, 1).toFixed(3);
    } else {
      crate.style.transform = `translate3d(0, ${(o * 26).toFixed(2)}px, 0) scale(${(1 - 0.05 * o).toFixed(4)})`;
      crate.style.opacity = (1 - 0.45 * o).toFixed(3);
    }
    if (!liftEl) return;
    const s = ls.value;
    liftEl.style.transform = `translate3d(${lx.value.toFixed(2)}px, ${ly.value.toFixed(2)}px, 0) scale(${s.toFixed(4)})`;
    // While it is still below the top of the crate's front wall, the wall hides that part of it.
    const line = wallLine + o * 26 * (reduce.matches ? 0 : 1);
    const bottom = baseTop + ly.value + baseH * s;
    const hidden = (bottom - line) / s;
    liftEl.style.clipPath = hidden > 0.5 && !reduce.matches ? `inset(-40% -40% ${hidden.toFixed(1)}px -40%)` : '';
  }

  const liftJob = (dt: number): boolean => {
    const a = lx.step(dt);
    const b = ly.step(dt);
    const c = ls.step(dt);
    const d = sink.step(dt);
    renderLift();
    // The title and the controls arrive once the sleeve has nearly landed above them, not under it in flight.
    if (state === 'opening' && Math.abs(ly.value) < 48) panelFor(current).classList.add('is-shown');
    const moving = a || b || c || d;
    if (!moving) {
      if (state === 'opening') {
        state = 'open';
        panelFor(current).classList.add('is-settled');
      } else if (state === 'closing') {
        finishClose();
      }
    }
    return moving;
  };

  scroller.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === scroller || t.classList.contains('out') || t.classList.contains('out__stage')) close();
  });
  lift.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-record-close]')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (state === 'open' || state === 'opening')) {
      e.preventDefault();
      close();
    }
  });

  /* ——— The peel ——— */

  const unwrapped = new Set<number>();
  const peels = new Map<number, ReturnType<typeof makePeel>>();
  const peelFor = (i: number) => {
    let p = peels.get(i);
    if (!p) peels.set(i, (p = makePeel(i)));
    return p;
  };

  /**
   * The tear strip. A band of tape runs across the film; its tab hangs off the sleeve's left edge.
   * Pull the tab and the tape comes away behind it 1:1, leaving a clean channel of bare sleeve, while
   * the label ahead is eaten as the tab passes. Let go early and it springs back and re-seals; past
   * 60% of the way (measured where the release would carry it) it runs off the edge on its own, and
   * the rest of the film lifts away.
   */
  function makePeel(i: number) {
    const panel = panelFor(i);
    const strip = panel.querySelector<HTMLElement>('[data-unwrap]')!;
    const tab = panel.querySelector<HTMLElement>('[data-unwrap-handle]')!;
    const band = panel.querySelector<HTMLElement>('[data-strip-band]')!;
    const label = panel.querySelector<HTMLElement>('[data-strip-label]')!;
    const films = [...panel.querySelectorAll<HTMLElement>('[data-film]')];
    const glosses = films.map((f) => f.querySelector<HTMLElement>('.sheet__gloss')!);

    const u = new Spring(0, TEAR_BACK, 0.0004); // the tab along the strip: 0 at the left edge, 1 at the right
    const f = new Spring(0, FILM_OFF, 0.0005); // the rest of the film coming away, 0..1
    const SLIP = 0.14; // past the right edge, how far the tab runs before it is gone
    let W = 1;
    let committed = false;
    let grip: { id: number; x0: number; u0: number } | null = null;
    const vel = new VelocityTracker();

    function measure(): void {
      W = Math.max(1, strip.clientWidth);
    }

    function render(): void {
      const uv = u.value;
      const fv = f.value;
      const motion = reduce.matches ? 0 : 1;
      const x = uv * W;
      const torn = Math.max(0, x);
      tab.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
      tab.style.opacity = clamp(uv > 1 ? 1 - (uv - 1) / SLIP : 1, 0, 1).toFixed(3);
      band.style.transform = `translate3d(${torn.toFixed(2)}px, 0, 0)`;
      label.style.transform = `translate3d(${(-torn).toFixed(2)}px, 0, 0)`;
      const p = clamp(uv, 0, 1);
      const sheen = (1 - 0.5 * p).toFixed(3);
      for (const g of glosses) g.style.opacity = sheen;
      const part = p * 1.5 * motion; // the film either side of the channel eases apart a little
      const lift = fv * 8 * motion;
      films[0]!.style.transform = `translate3d(0, ${(-part - lift).toFixed(2)}px, 0)`;
      films[1]!.style.transform = `translate3d(0, ${(part - lift).toFixed(2)}px, 0)`;
      const fade = (1 - fv).toFixed(3);
      films[0]!.style.opacity = fade;
      films[1]!.style.opacity = fade;
      tab.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    }

    const job = (dt: number): boolean => {
      const a = u.step(dt);
      if (committed && u.value > 1 + SLIP * 0.5 && f.target !== 1) f.to(1, reduce.matches ? FADE : FILM_OFF);
      const b = f.step(dt);
      render();
      if (committed && f.value === 1 && !b) {
        done();
        return false;
      }
      return a || b || committed;
    };

    function commit(velocity = 0): void {
      if (committed || unwrapped.has(i)) return;
      committed = true;
      grip = null;
      tab.classList.remove('is-pressed');
      if (reduce.matches) u.set(1 + SLIP);
      else u.to(1 + SLIP, TEAR_OFF, Math.max(0, velocity));
      run(job);
    }

    function done(): void {
      // The sleeve moves up a little to make room; it and the words below glide there from where they are.
      const meta = panel.querySelector<HTMLElement>('.out__meta');
      const before = liftEl && state === 'open' ? liftEl.offsetTop : null;
      const metaBefore = meta?.getBoundingClientRect().top ?? 0;
      unwrapped.add(i);
      panel.setAttribute('data-record-unwrapped', '');
      recs[i]!.setAttribute('data-unwrapped', '');
      if (before !== null && liftEl && !reduce.matches) {
        const shift = before - liftEl.offsetTop;
        if (shift) {
          ly.value += shift;
          baseTop -= shift;
          ly.to(0, MAKE_ROOM);
          run(liftJob);
          if (meta) {
            const d = metaBefore - meta.getBoundingClientRect().top;
            meta.style.transition = 'none';
            meta.style.transform = `translateY(${d.toFixed(1)}px)`;
            void meta.offsetHeight;
            meta.style.transition = 'transform 480ms var(--ease-out)';
            meta.style.transform = '';
            meta.addEventListener('transitionend', () => (meta.style.transition = ''), { once: true });
          }
        }
      }
      if (state === 'open') panel.classList.add('is-settled');
      requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('is-revealed')));
      if (panel.contains(document.activeElement) || document.activeElement === document.body) {
        panel.querySelector<HTMLElement>('[data-details-start]')?.focus({ preventScroll: true });
      }
    }

    tab.addEventListener('pointerdown', (e) => {
      if (committed || grip || (state !== 'open' && state !== 'opening')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      tab.setPointerCapture(e.pointerId);
      u.set(u.value); // caught mid-spring, it stays where it is
      grip = { id: e.pointerId, x0: e.clientX, u0: u.value };
      vel.reset(e.clientX);
      tab.classList.add('is-pressed');
    });
    tab.addEventListener('pointermove', (e) => {
      if (!grip || e.pointerId !== grip.id) return;
      const scale = ls.value || 1;
      const raw = grip.u0 + (e.clientX - grip.x0) / (W * scale); // relative to the grab: no jump
      const v =
        raw < 0 ? -rubberband(-raw * W, W * 0.4) / W
        : raw > 1 ? 1 + rubberband((raw - 1) * W, W * 0.4) / W
        : raw;
      vel.add(e.clientX);
      u.set(v);
      render();
    });
    const letGo = (e: PointerEvent): void => {
      if (!grip || e.pointerId !== grip.id) return;
      grip = null;
      tab.classList.remove('is-pressed');
      const scale = ls.value || 1;
      const px = vel.velocity / scale; // px/s along the strip
      const projected = u.value + project(px) / W;
      const v = px / W; // strip lengths per second
      if (projected > 0.6) commit(v);
      else {
        u.to(0, TEAR_BACK, Math.min(0, v));
        run(job);
      }
    };
    tab.addEventListener('pointerup', letGo);
    tab.addEventListener('pointercancel', letGo);
    tab.addEventListener('keydown', (e) => {
      if (['ArrowRight', 'ArrowUp', 'End', 'Enter', ' ', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        commit();
      }
    });

    return {
      measure,
      render,
      /** A record put back mid-tear keeps its film: the strip springs back and re-seals. */
      cancel(): void {
        if (committed) return;
        grip = null;
        tab.classList.remove('is-pressed');
        u.to(0, TEAR_BACK);
        run(job);
      },
    };
  }

  /* ——— Start ——— */

  measure();
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      measure();
      if (current >= 0) {
        peelFor(current).measure();
        peelFor(current).render();
      }
    });
  });
}
