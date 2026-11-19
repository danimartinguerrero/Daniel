/**
 * Sketch s3/a, "Quantise". His words are set as notes in bars of four beats: each one starts on the
 * sixteenth a note would, and its weight is how hard the note is hit. Played in, they are loose, a
 * little early or late and off the line, as notes are before they are quantised. The scroll is the
 * quantise knob: as a bar comes up the screen its words are pulled onto the beat, each on its own
 * spring, so they land one after another like the notes they are.
 *
 * A word can be picked up and thrown along its bar. Where it lands is where the throw would come to
 * rest (Apple's projection), quantised to the nearest sixteenth: projecting to the nearest snap point
 * is what quantising is. The last bar is the one he plays himself. It never quite lands.
 */
import { Spring, VelocityTracker, clamp, project, rubberband } from '@/components/music/v4/physics';
import { onPage } from '@/scripts/page';

type Word = {
  el: HTMLElement;
  bar: Bar;
  on0: number; // the sixteenth it is written on
  on: number; // the sixteenth it is on now (a hand can move it)
  row: number; // on a phone a bar is two lines of eight
  human: number; // how far off the beat it was played, in sixteenths
  rise: number; // and off the line, in type sizes
  late: number; // for his bar: how late it always is, in sixteenths
  x: Spring;
  y: Spring;
  lift: Spring;
  notch: HTMLElement; // where it starts, marked on the bar's ruler; as tall as it is hit
  base: number; // its place on the line before any transform, px
  width: number;
  held: boolean;
};
type Bar = { el: HTMLElement; ticks: HTMLElement; late: boolean; words: Word[]; q: number };

// The same "random" every visit, so the sketch reads the same each time.
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('[data-s3a]');
  if (!root) return;
  const score = root.querySelector<HTMLElement>('[data-s3a-score]')!;
  const phone = matchMedia('(max-width: 640px)');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const rand = seeded(7);

  const bars: Bar[] = [...root.querySelectorAll<HTMLElement>('[data-s3a-bar]')].map((el) => {
    const ticks = document.createElement('span');
    ticks.className = 's3a-ticks';
    ticks.setAttribute('aria-hidden', 'true');
    el.prepend(ticks);
    return { el, ticks, late: el.hasAttribute('data-late'), words: [], q: 0 };
  });
  const words: Word[] = [];
  for (const bar of bars) {
    for (const el of bar.el.querySelectorAll<HTMLElement>('[data-s3a-w]')) {
      const on0 = Number(el.dataset.on);
      const notch = document.createElement('span');
      notch.className = 's3a-notch';
      notch.setAttribute('aria-hidden', 'true');
      notch.style.cssText = el.style.cssText.replace(/--weight:[^;]*;?/, '') + `;--vel:${el.dataset.vel ?? 0.6}`;
      el.parentElement!.append(notch);
      const w: Word = {
        el, notch, bar, on0, on: on0, row: 0,
        human: (rand() - 0.5) * 1.8,
        rise: (rand() - 0.5) * 0.36,
        late: bar.late ? 0.2 + rand() * 0.24 : 0,
        x: new Spring(0, { response: 0.3 + rand() * 0.2, damping: 0.8 }, 0.05),
        y: new Spring(0, { response: 0.42, damping: 1 }, 0.05),
        lift: new Spring(0, { response: 0.22, damping: 1 }, 0.001),
        base: 0, width: 0, held: false,
      };
      bar.words.push(w);
      words.push(w);
    }
  }

  let steps = 16;
  let u = 0; // px per sixteenth
  let f = 48; // the type size the bars are set at, px
  const GAP = 0.3; // the least room between two words, in type sizes

  /* The type size is the largest at which no word runs into the next one's beat. */
  function layout() {
    steps = phone.matches ? 8 : 16;
    u = score.clientWidth / steps;
    score.style.setProperty('--f', '100px');
    const w100 = words.map((w) => w.el.offsetWidth);
    let best = 64;
    for (const bar of bars) {
      bar.words.forEach((w, k) => {
        const row = Math.floor(w.on0 / steps);
        const next = bar.words[k + 1];
        const end = next && Math.floor(next.on0 / steps) === row ? next.on0 : (row + 1) * steps;
        const room = (end - w.on0) * u;
        best = Math.min(best, room / (w100[words.indexOf(w)]! / 100 + GAP));
      });
    }
    f = clamp(Math.floor(best), 22, 64);
    score.style.setProperty('--f', `${f}px`);
    // Tracking tightens as the type grows (§15).
    score.style.setProperty('--track', `${f > 44 ? -0.025 : f > 32 ? -0.015 : -0.005}em`);
    for (const w of words) {
      w.row = Math.floor(w.on0 / steps);
      w.base = w.el.offsetLeft;
      w.width = w.el.offsetWidth;
    }
    // Played loose, but never so loose that a word sits on its neighbour.
    for (const bar of bars) {
      bar.words.forEach((w, k) => {
        const prev = bar.words[k - 1], next = bar.words[k + 1];
        const roomL = prev && prev.row === w.row ? (w.base - (prev.base + prev.width)) / u : 1;
        const roomR = next && next.row === w.row ? (next.base - (w.base + w.width)) / u : 1;
        w.human = clamp(w.human, -Math.max(0, roomL - GAP * f / u) * 0.5, Math.max(0, roomR - GAP * f / u) * 0.5);
      });
    }
  }

  /* How far each bar is quantised: none while it is low on the screen, all of it by the time it is a
     third of the way up. Each bar on its own, so they land in order as the page comes up. */
  function quantise() {
    const vh = innerHeight;
    for (const bar of bars) {
      const top = bar.el.getBoundingClientRect().top;
      bar.q = reduce.matches ? 1 : clamp((vh * 0.84 - top) / (vh * 0.34), 0, 1);
      bar.ticks.style.opacity = (0.35 + 0.65 * (bar.late ? bar.q * 0.4 : bar.q)).toFixed(3);
      for (const w of bar.words) {
        if (w.held) continue;
        const q = bar.q;
        // Off the beat by what was played, less what has been quantised; his bar keeps its lateness.
        const off = w.human * (1 - q) + w.late * q;
        w.x.to(((w.on - w.on0) + off) * u);
        w.y.to(w.rise * f * (1 - q * (bar.late ? 0.45 : 1)));
      }
    }
  }

  let raf = 0, last = 0;
  const render = () => {
    for (const w of words) {
      // Whole pixels, and no scale unless it is in the hand: text on its own layer at a fraction of a
      // pixel is drawn soft.
      const l = w.lift.value;
      w.el.style.transform = `translate3d(${Math.round(w.x.value)}px,${Math.round(w.y.value)}px,0)${l > 0.001 ? ` scale(${(1 + 0.05 * l).toFixed(4)})` : ''}`;
      w.notch.style.transform = `translate3d(${w.x.value.toFixed(2)}px,0,0)`;
    }
  };
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    let rest = true;
    for (const w of words) {
      if (!w.held) rest = w.x.step(dt) && rest;
      rest = w.y.step(dt) && rest;
      rest = w.lift.step(dt) && rest;
    }
    render();
    raf = rest ? 0 : requestAnimationFrame(frame);
    if (!raf) last = 0;
  };
  const tick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  signal.addEventListener('abort', () => cancelAnimationFrame(raf));

  const start = () => {
    layout();
    quantise();
    // The first frame starts where the scroll puts them, not flying in from nowhere.
    for (const w of words) { w.x.set(w.x.target); w.y.set(w.y.target); }
    render();
  };
  start();
  addEventListener('scroll', () => { quantise(); tick(); }, { passive: true, signal });
  addEventListener('resize', () => { start(); }, { signal });
  phone.addEventListener('change', start, { signal });
  document.fonts?.ready.then(() => { if (!signal.aborted) start(); });

  /* A word in the hand: it follows 1:1 from where it was taken, along its bar; its neighbours hold
     their ground, and pushing into one meets more and more resistance (§9). */
  for (const w of words) {
    let pid = -1, sx = 0, sy = 0, x0 = 0, y0 = 0, decided = false;
    const tx = new VelocityTracker();
    const ty = new VelocityTracker();
    const bounds = () => {
      const row = w.bar.words.filter((o) => o.row === w.row);
      const k = row.indexOf(w);
      const prev = row[k - 1], next = row[k + 1];
      const lo = prev ? prev.base + prev.x.value + prev.width + GAP * f : 0;
      const hi = next ? next.base + next.x.value - GAP * f - w.width : steps * u - w.width;
      return { lo: lo - w.base, hi: hi - w.base };
    };
    const begin = (e: PointerEvent) => {
      w.held = true;
      w.el.setPointerCapture(e.pointerId);
      w.el.classList.add('is-held');
      x0 = w.x.value; y0 = w.y.value;
      w.x.set(x0); // caught where it is, mid-flight
      w.lift.to(1);
      tx.reset(0, e.timeStamp); ty.reset(0, e.timeStamp);
      tick();
    };
    w.el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      pid = e.pointerId; sx = e.clientX; sy = e.clientY;
      decided = e.pointerType === 'mouse';
      if (decided) { e.preventDefault(); begin(e); }
    }, { signal });
    w.el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!decided) {
        if (Math.hypot(dx, dy) < 10) return;
        decided = true;
        if (Math.abs(dy) > Math.abs(dx)) { pid = -1; return; } // the page's scroll, not ours
        begin(e);
      }
      if (!w.held) return;
      const { lo, hi } = bounds();
      let x = x0 + dx;
      if (x < lo) x = lo + rubberband(x - lo, u * 2);
      if (x > hi) x = hi + rubberband(x - hi, u * 2);
      w.x.set(x);
      w.y.set(y0 + rubberband(dy, f));
      tx.push(dx, e.timeStamp); ty.push(dy, e.timeStamp);
      tick();
    }, { signal });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      pid = -1;
      if (!w.held) return;
      w.held = false;
      w.el.classList.remove('is-held');
      const v = tx.velocity(e.timeStamp);
      const { lo, hi } = bounds();
      // Where the throw would come to rest, onto the nearest sixteenth that has room for it.
      const landing = clamp(w.x.value + project(v, 0.994), lo, hi);
      const loOn = Math.ceil(lo / u - 1e-6) + w.on0, hiOn = Math.floor(hi / u + 1e-6) + w.on0;
      w.on = clamp(Math.round(landing / u) + w.on0, Math.min(loOn, hiOn), Math.max(loOn, hiOn));
      const thrown = Math.abs(v) > 300;
      const target = (w.on - w.on0 + w.late * w.bar.q) * u;
      w.x.to(target, { velocity: v, damping: thrown ? 0.78 : 1, response: 0.36 });
      w.y.to(w.rise * f * (1 - w.bar.q * (w.bar.late ? 0.45 : 1)), { velocity: ty.velocity(e.timeStamp) });
      w.lift.to(0);
      tick();
    };
    w.el.addEventListener('pointerup', end, { signal });
    w.el.addEventListener('pointercancel', end, { signal });
  }
});
