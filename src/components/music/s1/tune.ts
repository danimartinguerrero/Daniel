/**
 * s1, sketch B: out of tune, off the grid.
 *
 * Tune: each letter of "Not very well." has its own spring from out of tune (0) to true (1). A hand
 * passing over a letter (the pointer, or a finger sliding along the line) pulls it true at once; a
 * while after the hand has gone it slips back out, slowly, one letter after another, and stays there.
 * Once, as the line first comes into view, an unseen hand runs along it, so you see what it does.
 *
 * Quantize: the words are laid on a beat grid, each starting a little early or late. The playhead is
 * a spring in px along the grid: dragged 1:1 by its grip or by the words, thrown with the finger's
 * speed to where the throw would land (projection), snapped to a beat, rubber-banded at the ends.
 * Every word whose start it has passed snaps onto its beat (a short spring with a little overshoot,
 * the click of a note landing on the grid); a word it goes back over comes off again.
 */
import { onPage } from '@/scripts/page';
import { Spring, VelocityTracker, clamp, project, rubberband } from '@/components/music/v4/physics';

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('[data-s1-tune]');
  if (root) init(root, signal);
});

/** The same "random" every visit: a small seeded generator. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function init(root: HTMLElement, signal: AbortSignal) {
  /* ---------------------------------------------------------------- tune */
  const tuneBox = root.querySelector<HTMLElement>('[data-s1b-tune]')!;
  const offLine = root.querySelector<HTMLElement>('[data-s1b-off]')!;
  const rnd = seeded(7);
  const letters = [...offLine.querySelectorAll<HTMLElement>('.s1b-l')].map((el, i) => {
    // Off by up to a sixth of the type size, up or down, and turned a few degrees: never in tune by chance.
    const sign = i % 2 ? 1 : -1;
    const dy = sign * (0.05 + rnd() * 0.11);
    const rot = (rnd() - 0.5) * 9;
    return {
      el,
      w: el.querySelector<HTMLElement>('.s1b-l__w')!,
      dy,
      rot,
      t: new Spring(0, { response: 0.2, damping: 1 }, 0.0005),
      touched: -1, // when a hand last passed over it
      cx: 0,
    };
  });
  let em = 0;
  function measureTune() {
    em = parseFloat(getComputedStyle(offLine).fontSize);
    const box = offLine.getBoundingClientRect();
    for (const l of letters) {
      const r = l.el.getBoundingClientRect();
      l.cx = r.left - box.left + r.width / 2;
    }
  }

  const HOLD = 900; // ms in tune after the hand has gone, before the first letter slips
  const SLIP = 70; // and then one letter after another

  function brush(x: number, y: number, now: number) {
    const box = offLine.getBoundingClientRect();
    const lx = x - box.left;
    const ly = y - (box.top + box.height / 2);
    if (Math.abs(ly) > em * 0.9) return;
    for (const l of letters) {
      const d = Math.abs(lx - l.cx) / (em * 0.42);
      if (d < 1) {
        // Pulled true: quicker the nearer the hand passes.
        l.t.to(1, { response: 0.14 + 0.12 * d, damping: 1 });
        l.touched = now;
      }
    }
    tick();
  }

  function renderTune(now: number) {
    let busy = false;
    const order = letters.filter((l) => l.touched >= 0).sort((a, b) => a.touched - b.touched);
    const lastTouch = order.length ? order[order.length - 1]!.touched : 0;
    letters.forEach((l, i) => {
      if (l.touched >= 0 && l.t.target === 1) {
        // Slips once the hand has been gone a while: in reading order, each a beat after the last.
        if (now - lastTouch > HOLD + i * SLIP) l.t.to(0, { response: 1.1, damping: 1 });
        else busy = true;
      }
      busy = !l.t.step(dt) || busy;
      const u = 1 - l.t.value;
      l.el.style.transform = u < 0.0005 ? 'none' : `translate3d(0,${(l.dy * em * u).toFixed(2)}px,0) rotate(${(l.rot * u).toFixed(2)}deg)`;
      l.w.style.opacity = clamp(l.t.value, 0, 1).toFixed(3);
    });
    return busy;
  }

  tuneBox.addEventListener('pointermove', (e) => brush(e.clientX, e.clientY, performance.now()), { signal });
  tuneBox.addEventListener('pointerdown', (e) => brush(e.clientX, e.clientY, performance.now()), { signal });

  /* The hint: once, as the line comes into view, a hand runs along it at an easy pace. */
  let hinted = false;
  const io = new IntersectionObserver(([entry]) => {
    if (!entry?.isIntersecting || hinted) return;
    hinted = true;
    io.disconnect();
    const box = offLine.getBoundingClientRect();
    const start = performance.now() + 500;
    const run = (now: number) => {
      if (signal.aborted) return;
      const k = (now - start) / 1100;
      if (k >= 0) {
        const b = offLine.getBoundingClientRect();
        brush(b.left + clamp(k, 0, 1) * box.width, b.top + b.height / 2, now);
      }
      if (k < 1) requestAnimationFrame(run);
    };
    requestAnimationFrame(run);
  }, { threshold: 0.9 });
  io.observe(offLine);

  /* ---------------------------------------------------------------- quantize */
  const q = root.querySelector<HTMLElement>('[data-s1b-q]')!;
  const rows = root.querySelector<HTMLElement>('[data-s1b-rows]')!;
  const text = root.querySelector<HTMLElement>('[data-s1b-text]')!;
  const ruler = root.querySelector<HTMLElement>('[data-s1b-ruler]')!;
  const ph = root.querySelector<HTMLElement>('[data-s1b-ph]')!;
  const grip = root.querySelector<HTMLElement>('[data-s1b-grip]')!;
  const chip = root.querySelector<HTMLButtonElement>('[data-s1b-chip]')!;
  const qr = seeded(23);
  const words = [...text.querySelectorAll<HTMLElement>('.s1b-w')].map((el) => {
    let h = qr() * 2 - 1;
    if (Math.abs(h) < 0.35) h = Math.sign(h || 1) * (0.35 + qr() * 0.2);
    return { el, w: el.querySelector<HTMLElement>('.s1b-w__w')!, x: 0, y: 0, width: 0, h, s: new Spring(0, { response: 0.2, damping: 0.7 }, 0.0005) };
  });
  let g = 30; // px per beat
  let span = 0; // where the last word ends, px
  let lanes: HTMLElement[] = [];

  function layout() {
    q.classList.remove('is-laid');
    const fs = parseFloat(getComputedStyle(text).fontSize);
    g = Math.round(fs * 0.4);
    q.style.setProperty('--g', `${g}px`);
    const W = Math.min(rows.clientWidth, 1200) - 16;
    const lh = fs * 1.25;
    const space = fs * 0.12;
    let x = 0;
    let row = 0;
    for (const w of words) {
      const width = w.el.getBoundingClientRect().width;
      let start = Math.ceil(x / g) * g;
      if (start + width > W && x > 0) {
        row++;
        start = 0;
      }
      w.x = start;
      w.y = row * lh;
      w.width = width;
      x = start + width + space;
    }
    span = Math.ceil((Math.max(...words.map((w) => w.x + w.width)) + g * 0.5) / g) * g;
    q.classList.add('is-laid');
    text.style.setProperty('--h', `${(row + 1) * lh}px`);
    for (const l of lanes) l.remove();
    lanes = Array.from({ length: row + 1 }, (_, i) => {
      const l = document.createElement('span');
      l.className = 's1b-lane';
      l.style.top = `${(i + 1) * lh - 1}px`;
      rows.append(l);
      return l;
    });
    // Bar numbers, one every four beats, as far as the grid runs.
    ruler.replaceChildren(
      ...Array.from({ length: Math.ceil(rows.clientWidth / (g * 4)) }, (_, i) => {
        const s = document.createElement('span');
        s.textContent = String(i + 1);
        s.style.left = `${i * g * 4}px`;
        return s;
      }),
    );
  }

  // The rows are lanes under one playhead, as tracks are in a playlist: it sweeps them all at once.
  const P = new Spring(0, { response: 0.5, damping: 1 }, 0.05);
  const maxP = () => span;
  function renderQ() {
    let busy = !P.step(dt);
    ph.style.transform = `translate3d(${P.value.toFixed(2)}px,0,0)`;
    for (const w of words) {
      // Passed: the playhead is past where the word starts on the grid.
      const on = P.value >= w.x - 1;
      if (on && w.s.target !== 1) w.s.to(1, { response: 0.16, damping: 0.62 });
      if (!on && w.s.target !== 0) w.s.to(0, { response: 0.3, damping: 1 });
      busy = !w.s.step(dt) || busy;
      const off = (1 - w.s.value) * w.h * g * 0.5;
      w.el.style.transform = `translate3d(${(w.x + off).toFixed(2)}px,${w.y.toFixed(2)}px,0)`;
      w.w.style.opacity = clamp(w.s.value, 0, 1).toFixed(3);
    }
    const label = P.target >= maxP() - 1 ? 'Undo' : 'Quantize';
    if (chip.textContent !== label) chip.textContent = label;
    return busy;
  }

  // Dragging: the grip, or anywhere on the grid (once the move is clearly sideways).
  const tracker = new VelocityTracker();
  let drag: { id: number; x0: number; p0: number; el: HTMLElement; active: boolean } | null = null;

  function startDrag(e: PointerEvent, el: HTMLElement) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag = { id: e.pointerId, x0: e.clientX, p0: P.value, el, active: el === grip };
    tracker.reset(e.clientX, e.timeStamp);
    P.set(P.value); // caught where it is
    if (el === grip) {
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      grip.classList.add('is-held');
    }
    tick();
  }
  function moveDrag(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    if (!drag.active) {
      if (Math.abs(dx) < 8) return;
      drag.active = true;
      drag.x0 = e.clientX; // from here, so nothing jumps by the threshold
      drag.el.setPointerCapture(e.pointerId);
      grip.classList.add('is-held');
      return;
    }
    tracker.push(e.clientX, e.timeStamp);
    let v = drag.p0 + dx;
    const hi = maxP();
    if (v < 0) v = -rubberband(-v, 300);
    else if (v > hi) v = hi + rubberband(v - hi, 300);
    P.set(v);
    tick();
  }
  function endDrag(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    const wasActive = drag.active;
    drag = null;
    grip.classList.remove('is-held');
    if (!wasActive) return;
    const v = e.type === 'pointerup' ? tracker.velocity(e.timeStamp, 50) : 0;
    // Where the throw would carry it, then onto the nearest beat.
    const to = clamp(Math.round((P.value + project(v, 0.994)) / g) * g, 0, maxP());
    const D = to - P.value;
    P.to(to, { response: clamp((Math.PI * Math.abs(D)) / Math.max(1, Math.abs(v)), 0.3, 0.9), damping: 1, velocity: v });
    tick();
  }
  for (const el of [grip, rows]) {
    el.addEventListener('pointerdown', (e) => startDrag(e, el));
    el.addEventListener('pointermove', moveDrag);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
  }
  // A tap on the ruler sends the playhead there, to the beat.
  ruler.addEventListener('click', (e) => {
    const r = rows.getBoundingClientRect();
    P.to(clamp(Math.round((e.clientX - r.left) / g) * g, 0, maxP()), { response: 0.45, damping: 1 });
    tick();
  });
  chip.addEventListener('click', () => {
    P.to(P.target >= maxP() - 1 ? 0 : maxP(), { response: 1.3, damping: 1 });
    tick();
  });

  /* ---------------------------------------------------------------- the clock */
  let raf = 0;
  let last = 0;
  let dt = 1 / 60;
  function tick() {
    if (!raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }
  function frame(now: number) {
    raf = 0;
    dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 120;
    last = now;
    let busy = renderTune(now);
    busy = renderQ() || busy;
    if (busy || drag) raf = requestAnimationFrame(frame);
  }

  function measureAll() {
    measureTune();
    layout();
    // The playhead starts a third of the way along, so the words behind it already sit on the grid:
    // the difference is there to see before anything is touched.
    if (!P.value) P.set(Math.round((span * 0.4) / g) * g + 2);
    tick();
  }
  measureAll();
  document.fonts?.ready.then(() => !signal.aborted && measureAll());
  window.addEventListener('resize', measureAll, { signal });
  signal.addEventListener('abort', () => {
    cancelAnimationFrame(raf);
    io.disconnect();
  });
}
