/**
 * What every live figure shares: a canvas drawn at the screen's real pixel density, a loop that runs
 * only while the figure is on screen (and the tab is visible), reduced motion, and the colour of light.
 */

export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface Surface {
  ctx: CanvasRenderingContext2D;
  /** Size in CSS pixels. */
  w: number;
  h: number;
  dpr: number;
}

/**
 * Keeps the canvas backing store at CSS size × devicePixelRatio (capped at 3), so lines and dots are
 * as sharp as the screen allows. `onResize` runs after every change of size.
 */
export function surface(canvas: HTMLCanvasElement, onResize?: (s: Surface) => void): Surface {
  const ctx = canvas.getContext('2d', { alpha: true })!;
  const s: Surface = { ctx, w: 0, h: 0, dpr: 1 };
  const fit = (notify = true) => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w === s.w && h === s.h && dpr === s.dpr) return;
    s.w = w; s.h = h; s.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (notify) onResize?.(s);
  };
  fit(false);
  // The first notice waits a tick, so the caller has its surface in hand by then.
  if (onResize) queueMicrotask(() => onResize(s));
  new ResizeObserver(fit).observe(canvas);
  return s;
}

/**
 * Calls `frame(t, dt)` (seconds) on every animation frame while `el` is on screen and the page is
 * visible. With reduced motion it draws once, and again whenever `redraw` is called.
 */
export function loop(el: Element, frame: (t: number, dt: number) => void) {
  let visible = false, raf = 0, last = 0, t = 0;
  const still = reduceMotion();
  const tick = (now: number) => {
    const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 0;
    last = now; t += dt;
    frame(t, dt);
    raf = requestAnimationFrame(tick);
  };
  const run = () => {
    const go = visible && !document.hidden && !still;
    if (go && !raf) { last = 0; raf = requestAnimationFrame(tick); }
    if (!go && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; run(); }, { rootMargin: '120px' }).observe(el);
  document.addEventListener('visibilitychange', run);
  if (still) frame(0, 0);
  return { redraw: () => frame(t, 0), still };
}

/** Approximate sRGB colour of monochromatic light (380–780 nm), with the eye's falloff at the ends. */
export function wavelengthRGB(nm: number): [number, number, number] {
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else { r = 1; }
  const f = nm < 420 ? 0.3 + 0.7 * (nm - 380) / 40 : nm > 700 ? 0.3 + 0.7 * (780 - nm) / 80 : 1;
  const c = (v: number) => Math.round(255 * Math.pow(Math.max(0, v * f), 0.8));
  return [c(r), c(g), c(b)];
}

export const rgb = ([r, g, b]: [number, number, number], a = 1) => `rgba(${r},${g},${b},${a})`;

/** Reads a CSS custom property from :root (the figures draw in the page's own colours). */
export const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
