/**
 * s1, sketch C: the project as a surface. The arrangement is one big picture moved with transform:
 * x and y on springs of their own (a 2D throw on one spring desyncs), dragged 1:1 from where it was
 * grabbed, rubber-banded past its ends, thrown with the finger's speed to where a scroll view would
 * coast to (Apple's projection, 0.998); a throw that would run past an end runs into it and is brought
 * back by the same spring, so it overshoots a little and settles, as a scroll view bounces. It can be
 * caught at any moment. Ctrl-scroll (a trackpad pinch) zooms about the pointer; a sideways trackpad
 * swipe pans. The strip under it is the whole song, and its lens is the part in view: drag the lens and
 * the window follows. A finger moving up or down is left to the page, so the page still scrolls.
 */
import { onPage } from '@/scripts/page';
import { Spring, VelocityTracker, clamp, project, rubberband } from '@/components/music/v4/physics';

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('[data-s1-project]');
  if (root) init(root, signal);
});

function init(root: HTMLElement, signal: AbortSignal) {
  const win = root.querySelector<HTMLElement>('[data-s1c-win]')!;
  const canvas = root.querySelector<HTMLElement>('[data-s1c-canvas]')!;
  const barOut = root.querySelector<HTMLElement>('[data-s1c-bar]')!;
  const mini = root.querySelector<HTMLElement>('[data-s1c-mini]')!;
  const lens = root.querySelector<HTMLElement>('[data-s1c-lens]')!;
  const stage = root.querySelector<HTMLElement>('[data-s1c-stage]')!;
  const BAR = Number(root.dataset.bar);
  const BARS = Number(root.dataset.bars);
  const CW = Number(root.dataset.w);
  const CH = Number(root.dataset.h);

  let ww = 0, wh = 0, mw = 0, s0 = 1;
  const x = new Spring(0, { response: 0.5, damping: 1 }, 0.05);
  const y = new Spring(0, { response: 0.5, damping: 1 }, 0.05);
  let s = 1;

  const lo = (view: number, size: number) => Math.min(0, view - size * s);
  const xBounds = () => [lo(ww, CW), 0] as const;
  const yBounds = () => [lo(wh, CH), 0] as const;
  const band = (v: number, [a, b]: readonly [number, number], dim: number) =>
    v > b ? b + rubberband(v - b, dim) : v < a ? a - rubberband(a - v, dim) : v;

  function measure() {
    ww = win.clientWidth;
    wh = win.clientHeight;
    mw = mini.clientWidth;
    const was = s0;
    s0 = wh / CH;
    s = was === 1 && s === 1 ? s0 : clamp(s * (s0 / was), s0, s0 * 3);
    x.set(clamp(x.value, ...xBounds()));
    y.set(clamp(y.value, ...yBounds()));
    lens.style.width = `${(ww / (CW * s)) * mw}px`;
  }

  let lastBar = -1;
  function render() {
    canvas.style.transform = `translate3d(${x.value.toFixed(2)}px,${y.value.toFixed(2)}px,0) scale(${s.toFixed(5)})`;
    const lx = (-x.value / (CW * s)) * mw;
    lens.style.transform = `translate3d(${lx.toFixed(2)}px,0,0)`;
    lens.style.width = `${((ww / (CW * s)) * mw).toFixed(2)}px`;
    const bar = clamp(Math.floor((ww / 2 - x.value) / s / BAR) + 1, 1, BARS);
    if (bar !== lastBar) {
      lastBar = bar;
      barOut.textContent = String(bar);
    }
  }

  /** Let an axis go at velocity v (px/s): to where it would coast to, or into the end and back. */
  function release(sp: Spring, v: number, bounds: readonly [number, number]) {
    const land = sp.value + project(v, 0.998);
    const to = clamp(land, ...bounds);
    const D = to - sp.value;
    if (land === to && D * v > 0) {
      // Coasting inside: as soft as it must be to only ever slow down (no lurch at the hand-off).
      sp.to(to, { response: clamp((Math.PI * Math.abs(D)) / Math.max(1, Math.abs(v)), 0.4, 1.1), damping: 1, velocity: v });
    } else {
      // Into an end, or already past one: the spring carries the speed on past it and brings it back.
      sp.to(to, { response: 0.55, damping: 1, velocity: v });
    }
  }

  /* ---------------------------------------------------------------- dragging the picture */
  const trX = new VelocityTracker();
  const trY = new VelocityTracker();
  let drag: { id: number; sx: number; sy: number; x0: number; y0: number; active: boolean; touch: boolean } | null = null;

  win.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Caught where it is, if it was moving.
    x.set(x.value);
    y.set(y.value);
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x0: x.value, y0: y.value, active: false, touch: e.pointerType !== 'mouse' };
    trX.reset(e.clientX, e.timeStamp);
    trY.reset(e.clientY, e.timeStamp);
    if (!drag.touch) e.preventDefault();
    tick();
  });
  win.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.active) {
      if (Math.hypot(dx, dy) < 8) return;
      // A finger going up or down is scrolling the page (the browser has it already).
      if (drag.touch && Math.abs(dy) > Math.abs(dx)) {
        drag = null;
        return;
      }
      drag.active = true;
      drag.sx = e.clientX;
      drag.sy = e.clientY;
      win.setPointerCapture(e.pointerId);
      win.classList.add('is-dragging');
      return;
    }
    trX.push(e.clientX, e.timeStamp);
    trY.push(e.clientY, e.timeStamp);
    x.set(band(drag.x0 + dx, xBounds(), ww));
    y.set(band(drag.y0 + dy, yBounds(), wh));
    tick();
  });
  const end = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const was = drag.active;
    drag = null;
    win.classList.remove('is-dragging');
    if (!was) return settle();
    const ok = e.type === 'pointerup';
    release(x, ok ? trX.velocity(e.timeStamp, 50) : 0, xBounds());
    release(y, ok ? trY.velocity(e.timeStamp, 50) : 0, yBounds());
    tick();
  };
  win.addEventListener('pointerup', end);
  win.addEventListener('pointercancel', end);
  win.addEventListener('dragstart', (e) => e.preventDefault());

  function settle() {
    if (!x.settled || !y.settled) return tick();
    release(x, 0, xBounds());
    release(y, 0, yBounds());
    tick();
  }

  /* A trackpad: sideways swipes pan, a pinch (ctrl + wheel) zooms about the pointer. A plain vertical
     scroll is the page's. */
  let wheelEnd = 0;
  win.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const r = win.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const ns = clamp(s * Math.exp(-e.deltaY * 0.012), s0, s0 * 3);
      x.set(px - (px - x.value) * (ns / s));
      y.set(py - (py - y.value) * (ns / s));
      s = ns;
      x.set(clamp(x.value, ...xBounds()));
      y.set(clamp(y.value, ...yBounds()));
      tick();
      return;
    }
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    x.set(band(x.value - e.deltaX, xBounds(), ww));
    clearTimeout(wheelEnd);
    wheelEnd = window.setTimeout(settle, 80);
    tick();
  }, { passive: false });

  /* ---------------------------------------------------------------- the lens */
  const trL = new VelocityTracker();
  let lensDrag: { id: number; sx: number; x0: number } | null = null;
  const toX = (lensPx: number) => -(lensPx / mw) * CW * s;
  mini.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    mini.setPointerCapture(e.pointerId);
    const r = mini.getBoundingClientRect();
    const lr = lens.getBoundingClientRect();
    if (e.target !== lens) {
      // A tap beside the lens: the window goes there, centred on it.
      const target = clamp(toX(e.clientX - r.left - lr.width / 2), ...xBounds());
      x.to(target, { response: 0.5, damping: 1 });
    }
    lens.classList.add('is-held');
    lensDrag = { id: e.pointerId, sx: e.clientX, x0: e.target === lens ? x.value : x.target };
    if (e.target === lens) x.set(x.value);
    trL.reset(e.clientX, e.timeStamp);
    tick();
  });
  mini.addEventListener('pointermove', (e) => {
    if (!lensDrag || e.pointerId !== lensDrag.id) return;
    const dx = e.clientX - lensDrag.sx;
    if (Math.abs(dx) < 2) return;
    trL.push(e.clientX, e.timeStamp);
    x.set(band(lensDrag.x0 + toX(dx), xBounds(), ww));
    tick();
  });
  const lensEnd = (e: PointerEvent) => {
    if (!lensDrag || e.pointerId !== lensDrag.id) return;
    lensDrag = null;
    lens.classList.remove('is-held');
    if (!x.settled && Math.abs(x.target - x.value) > 1 && trL.velocity(e.timeStamp) === 0) return tick();
    release(x, e.type === 'pointerup' ? toX(trL.velocity(e.timeStamp, 50)) : 0, xBounds());
    tick();
  };
  mini.addEventListener('pointerup', lensEnd);
  mini.addEventListener('pointercancel', lensEnd);

  /* ---------------------------------------------------------------- arriving */
  // The window lies back as it comes up the screen and is flat by the time it is well in view.
  function tilt() {
    const r = stage.getBoundingClientRect();
    const vh = window.innerHeight;
    const k = clamp((vh - r.top) / (vh * 0.55), 0, 1);
    const e = 1 - (1 - k) ** 3;
    win.style.transform = k >= 1 ? '' : `rotateX(${((1 - e) * 22).toFixed(2)}deg) scale(${(0.94 + 0.06 * e).toFixed(4)})`;
  }
  window.addEventListener('scroll', tilt, { passive: true, signal });

  // Once, as it comes into view, the arrangement drifts in from the left a few bars: it moves.
  let hinted = false;
  const io = new IntersectionObserver(([en]) => {
    if (!en?.isIntersecting || hinted) return;
    hinted = true;
    io.disconnect();
    if (drag || lensDrag) return;
    x.to(clamp(-BAR * s * 6, ...xBounds()), { response: 1.4, damping: 1 });
    tick();
  }, { threshold: 0.6 });
  io.observe(win);

  /* ---------------------------------------------------------------- the clock */
  let raf = 0, last = 0;
  function tick() {
    if (!raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }
  function frame(now: number) {
    raf = 0;
    const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 120;
    last = now;
    let busy = !!drag || !!lensDrag;
    if (!drag?.active && !lensDrag) {
      busy = !x.step(dt) || busy;
      busy = !y.step(dt) || busy;
    } else if (lensDrag) {
      busy = !x.step(dt) || busy; // a tap beside the lens is still on its way there
    }
    render();
    if (busy) raf = requestAnimationFrame(frame);
  }

  measure();
  render();
  tilt();
  window.addEventListener('resize', () => { measure(); render(); tilt(); }, { signal });
  signal.addEventListener('abort', () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    clearTimeout(wheelEnd);
  });
}
