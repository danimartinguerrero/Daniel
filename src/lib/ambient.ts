/**
 * The page's own physics, outside the figures, so nothing on it is ever quite still:
 * - [data-wave="pan"] (photographs in their frames): a travelling wave crosses the page; each picture
 *   drifts inside its frame with the phase of its position, and its plate catches a little light as
 *   the crest goes by (--crest on the parent).
 * - [data-wave="bob"] (posters, records, covers): a transverse wave along their rows.
 * - Titles come into focus: red and blue apart and blurred (chromatic aberration), converging.
 * - Buttons answer a press with a circular wavefront from where they were pressed.
 * - Now and then a single photon is detected somewhere on the page: a dark count, a faint flash.
 * Everything waits while off screen, and none of it runs with reduced motion.
 */
import { reduceMotion } from './figure';

export function initAmbient() {
  const still = reduceMotion();

  // Titles focus as they arrive (the CSS draws the aberration; this only says when).
  const focus = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-focused'); focus.unobserve(e.target); }
  }, { rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('.title, .display, .sub__title, .seminar__title').forEach((t) => focus.observe(t));
  if (still) return;

  // A circular wavefront from the point of a press.
  document.addEventListener('pointerdown', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.ctl, .pill, .lp__play, .head__nav a, .contact__list a');
    if (!b) return;
    const r = b.getBoundingClientRect();
    const ring = document.createElement('span');
    ring.className = 'wavefront';
    ring.style.left = `${e.clientX - r.left}px`; ring.style.top = `${e.clientY - r.top}px`;
    if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
    b.append(ring);
    ring.addEventListener('animationend', () => ring.remove());
  });

  // Waves through the media.
  type W = { el: HTMLElement; mode: string; x: number; y: number; on: boolean; parent: HTMLElement };
  const ws: W[] = [...document.querySelectorAll<HTMLElement>('[data-wave]')].map((el) => ({ el, mode: el.dataset.wave!, x: 0, y: 0, on: false, parent: el.parentElement! }));
  const measure = () => ws.forEach((w) => { const r = w.parent.getBoundingClientRect(); w.x = r.left + r.width / 2 + scrollX; w.y = r.top + r.height / 2 + scrollY; });
  const io = new IntersectionObserver((entries) => { for (const e of entries) { const w = ws.find((x) => x.parent === e.target); if (w) w.on = e.isIntersecting; } }, { rootMargin: '80px' });
  ws.forEach((w) => io.observe(w.parent));
  measure();
  new ResizeObserver(measure).observe(document.body);

  // Dark counts: a fixed canvas behind everything.
  const sky = document.createElement('canvas');
  sky.className = 'darkcounts'; sky.setAttribute('aria-hidden', 'true');
  document.body.prepend(sky);
  const sctx = sky.getContext('2d')!;
  const fit = () => { const d = Math.min(devicePixelRatio || 1, 2); sky.width = innerWidth * d; sky.height = innerHeight * d; sctx.setTransform(d, 0, 0, d, 0, 0); };
  fit(); addEventListener('resize', fit);
  let flashes: { x: number; y: number; age: number; gold: boolean }[] = [];

  let t = 0, last = 0;
  const tick = (now: number) => {
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0; last = now; t += dt;
    if (!document.hidden) {
      const k = (2 * Math.PI) / 900, om = 0.55;
      for (const w of ws) {
        if (!w.on) continue;
        const vy = w.y - scrollY;
        const phase = k * w.x + k * 0.6 * w.y - om * t;
        if (w.mode === 'pan') {
          const par = (vy / innerHeight - 0.5) * -10; // a touch of parallax with the scroll
          w.el.style.transform = `scale(1.08) translate3d(${(7 * Math.sin(phase)).toFixed(2)}px, ${(5 * Math.cos(phase * 0.8) + par).toFixed(2)}px, 0)`;
          const s = Math.sin(phase + 0.6);
          w.parent.style.setProperty('--crest', (s > 0 ? s ** 6 : 0).toFixed(3));
        } else {
          const ph = (2 * Math.PI * w.x) / 700 - 1.1 * t;
          w.el.style.transform = `translate3d(0, ${(4 * Math.sin(ph)).toFixed(2)}px, 0) rotate(${(0.5 * Math.cos(ph)).toFixed(3)}deg)`;
        }
      }
      // About two photons a second, each a brief point of light.
      if (Math.random() < dt * 2) flashes.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, age: 0, gold: Math.random() < 0.35 });
      sctx.clearRect(0, 0, innerWidth, innerHeight);
      flashes = flashes.filter((f) => (f.age += dt) < 0.9);
      for (const f of flashes) {
        const a = Math.max(0, 1 - f.age / 0.9);
        sctx.fillStyle = f.gold ? `rgba(226,194,125,${0.55 * a})` : `rgba(236,235,230,${0.45 * a})`;
        sctx.beginPath(); sctx.arc(f.x, f.y, 0.7 + 1.6 * a, 0, Math.PI * 2); sctx.fill();
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
