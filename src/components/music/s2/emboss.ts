/**
 * Sketch s2/b, "Blind emboss": the white sleeve turns in the hand, and the lamp rakes across its relief.
 *
 * Two independent springs, one per axis (Apple: never one spring on a 2D distance), hold how far the
 * hand has turned the card. With a mouse the card leans towards the pointer; pressed and dragged it
 * turns 1:1 with the hand (rubber-banded past ±24°), and let go it swings back with the hand's speed on
 * a slightly bouncy spring, since it was thrown. On a phone a sideways drag turns it, and the scroll
 * tips it: coming up from below it faces down and away from the lamp, where the light grazes the
 * letters and they stand out most; it straightens as it reaches the middle of the screen.
 *
 * The light is worked out from the angle: how much the lamp grazes the card sets how far the shade and
 * the light of each letter stand off it and how strong they are; the sheen slides, the card dims as it
 * turns away, and the disc behind the hole shifts against it, being a few millimetres further back.
 * Only transform and opacity change per frame.
 */
import { onPage } from '@/scripts/page';
import { Spring, VelocityTracker, clamp, rubberband } from '../v4/physics';

onPage((signal) => {
  const card = document.querySelector<HTMLElement>('[data-s2e-card]');
  if (card) init(card, signal);
});

function init(card: HTMLElement, signal: AbortSignal) {
  const q = (s: string) => card.querySelector<HTMLElement>(s)!;
  const body = q('[data-s2e-body]');
  const shade = q('[data-s2e-shade]');
  const light = q('[data-s2e-light]');
  const sheen = q('[data-s2e-sheen]');
  const dim = q('[data-s2e-dim]');
  const disc = q('[data-s2e-disc]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  const rx = new Spring(0, { response: 0.5, damping: 1 }, 0.002); // degrees, top away from you
  const ry = new Spring(0, { response: 0.5, damping: 1 }, 0.002); // degrees, right side away
  let scrollTilt = 0;

  const written = new Map<HTMLElement, Record<string, string>>();
  const put = (el: HTMLElement, prop: 'transform' | 'opacity', v: string) => {
    let w = written.get(el);
    if (!w) written.set(el, (w = {}));
    if (w[prop] === v) return;
    w[prop] = v;
    el.style[prop] = v;
  };

  function render() {
    const c = card.offsetWidth;
    const x = rx.value + scrollTilt;
    const y = ry.value;
    const rad = Math.PI / 180;
    put(body, 'transform', `rotateX(${x.toFixed(3)}deg) rotateY(${y.toFixed(3)}deg)`);
    // The lamp is above and a little in front. Tipped towards you the card faces away from it and the
    // light only grazes it: the relief is at its strongest. Tipped back it faces the lamp: flatter.
    const graze = clamp(0.55 - x / 28 + Math.abs(y) / 90, 0.12, 1);
    const ly = 0.6 + graze * 1.9; // px the letter's shade falls below it
    const lx = Math.sin(y * rad) * 4.5; // and sideways, once the card is turned
    put(shade, 'transform', `translate3d(${lx.toFixed(2)}px,${ly.toFixed(2)}px,0)`);
    put(shade, 'opacity', (0.12 + graze * 0.42).toFixed(3));
    put(light, 'transform', `translate3d(${(-lx * 0.45).toFixed(2)}px,${(-ly * 0.4).toFixed(2)}px,0)`);
    put(light, 'opacity', (0.3 + graze * 0.5).toFixed(3));
    put(sheen, 'transform', `translate3d(${(y * c * 0.012).toFixed(1)}px,${(-x * c * 0.01).toFixed(1)}px,0)`);
    put(dim, 'opacity', clamp(-x / 26 * 0.32 + Math.abs(y) / 40 * 0.16, 0, 0.42).toFixed(3));
    // The disc lies behind the card: it slides the other way in the hole.
    put(disc, 'transform', `translate3d(${(-Math.sin(y * rad) * c * 0.03).toFixed(2)}px,${(Math.sin(x * rad) * c * 0.03).toFixed(2)}px,0)`);
  }

  let raf = 0;
  let last = 0;
  function frame(now: number) {
    const dt = Math.min(0.05, (now - (last || now)) / 1000) || 1 / 60;
    last = now;
    let busy = !!held;
    if (!held) { busy = !rx.step(dt) || busy; busy = !ry.step(dt) || busy; }
    render();
    raf = busy ? requestAnimationFrame(frame) : 0;
    if (!raf) last = 0;
  }
  const tick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  function onScroll() {
    if (reduced) return;
    const r = card.getBoundingClientRect();
    const p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
    scrollTilt = clamp(-p * 26, -16, 16);
    tick();
  }
  addEventListener('scroll', onScroll, { passive: true, signal });
  addEventListener('resize', onScroll, { signal });

  /* ---------------------------------------------------------------- the hand */
  const DEG = 0.16; // degrees per px of drag
  const LIMIT = 24;
  const tx = new VelocityTracker();
  const ty = new VelocityTracker();
  let held: { id: number; x0: number; y0: number; rx0: number; ry0: number; active: boolean; touch: boolean } | null = null;
  const band = (v: number) => (Math.abs(v) <= LIMIT ? v : Math.sign(v) * (LIMIT + rubberband(Math.abs(v) - LIMIT, 40)));

  card.addEventListener('pointerdown', (e) => {
    if (held || (e.pointerType === 'mouse' && e.button !== 0)) return;
    held = { id: e.pointerId, x0: e.clientX, y0: e.clientY, rx0: rx.value, ry0: ry.value, active: false, touch: e.pointerType !== 'mouse' };
    tx.reset(e.clientX, e.timeStamp);
    ty.reset(e.clientY, e.timeStamp);
    if (!held.touch) { held.active = true; card.setPointerCapture(e.pointerId); card.classList.add('is-held'); }
    tick();
  }, { signal });

  card.addEventListener('pointermove', (e) => {
    if (!held) {
      // A mouse over the card: it leans gently towards the pointer.
      if (fine && e.pointerType === 'mouse' && !reduced) {
        const r = card.getBoundingClientRect();
        rx.to(-((e.clientY - r.top) / r.height - 0.5) * 10, { response: 0.6, damping: 1 });
        ry.to(((e.clientX - r.left) / r.width - 0.5) * 14, { response: 0.6, damping: 1 });
        tick();
      }
      return;
    }
    if (e.pointerId !== held.id) return;
    tx.push(e.clientX, e.timeStamp);
    ty.push(e.clientY, e.timeStamp);
    const dx = e.clientX - held.x0;
    const dy = e.clientY - held.y0;
    if (!held.active) {
      // A finger: only a clearly sideways drag is ours; up and down scrolls the page.
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      held.active = true;
      held.x0 = e.clientX;
      card.setPointerCapture(e.pointerId);
      card.classList.add('is-held');
      return;
    }
    ry.set(band(held.ry0 + (e.clientX - held.x0) * DEG));
    if (!held.touch) rx.set(band(held.rx0 - dy * DEG));
    tick();
  }, { signal });

  function release(e: PointerEvent) {
    if (!held || e.pointerId !== held.id) return;
    const wasTouch = held.touch;
    held = null;
    card.classList.remove('is-held');
    // Back to rest with the speed the hand had, a little bouncy since it was let go moving.
    const vy = tx.velocity(e.timeStamp, 60) * DEG;
    const vx = wasTouch ? 0 : -ty.velocity(e.timeStamp, 60) * DEG;
    ry.to(0, { response: 0.55, damping: 0.72, velocity: vy });
    rx.to(0, { response: 0.55, damping: 0.72, velocity: vx });
    tick();
  }
  card.addEventListener('pointerup', release, { signal });
  card.addEventListener('pointercancel', release, { signal });
  card.addEventListener('pointerleave', () => {
    if (held || !fine) return;
    rx.to(0, { response: 0.7, damping: 1 });
    ry.to(0, { response: 0.7, damping: 1 });
    tick();
  }, { signal });

  onScroll();
  render();
  signal.addEventListener('abort', () => cancelAnimationFrame(raf));
}
