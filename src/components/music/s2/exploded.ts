/**
 * Sketch s2/c, "Exploded beat": the scroll takes one FL Studio project apart.
 *
 * The scroll through the section is the only input, and it maps 1:1 onto the stack (the scroll is
 * already the hand: no easing between them, so it can be stopped or reversed at any frame). Three
 * overlapping phases: the window tips back onto the desk; its layers lift apart in depth, the deeper
 * ones further from the lamp and so darker (depth as light falloff, as Apple shows a device's insides);
 * then each layer's name turns to face you. A pointer over a layer lifts it a little out of the stack
 * on a critically damped spring, so the depth can be felt as well as seen.
 */
import { onPage } from '@/scripts/page';
import { Spring, clamp } from '../v4/physics';

// Declared before onPage, which sets the page up at once on a first load.
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

onPage((signal) => {
  const track = document.querySelector<HTMLElement>('[data-s2x-track]');
  if (track) init(track, signal);
});

function init(track: HTMLElement, signal: AbortSignal) {
  const group = track.querySelector<HTMLElement>('[data-s2x-group]')!;
  const layers = [...track.querySelectorAll<HTMLElement>('[data-s2x-layer]')]
    .sort((a, b) => Number(a.dataset.s2xLayer) - Number(b.dataset.s2xLayer)) // top layer first
    .map((el) => ({
    el,
    shade: el.querySelector<HTMLElement>('[data-s2x-shade]')!,
    lift: new Spring(0, { response: 0.35, damping: 1 }, 0.002),
  }));
  const labels = [...track.querySelectorAll<HTMLElement>('[data-s2x-label]')];
  const beat = track.querySelector<HTMLElement>('[data-s2x-beat]')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrow = () => innerWidth < 760;

  let p = 0;
  function measure() {
    const r = track.getBoundingClientRect();
    p = reduced ? 1 : clamp(-r.top / Math.max(1, r.height - innerHeight), 0, 1);
  }

  function render() {
    const tilt = smooth(0.0, 0.32, p);
    const apart = smooth(0.22, 0.68, p);
    const named = smooth(0.55, 0.8, p);
    const pw = group.offsetWidth;
    const rx = tilt * 52;
    const rz = -tilt * (narrow() ? 24 : 32);
    const gap = pw * (narrow() ? 0.4 : 0.2) * apart;
    const scale = 1 - tilt * 0.12;
    const shiftY = tilt * pw * (narrow() ? 0.08 : 0.02);
    const P = 2000; // the distance the scene is seen from
    const stack = `perspective(${P}px) translate3d(0,${shiftY.toFixed(1)}px,0) scale(${scale.toFixed(4)}) rotateX(${rx.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg)`;
    const sin = Math.sin((rx * Math.PI) / 180), cos = Math.cos((rx * Math.PI) / 180);
    const n = layers.length;
    layers.forEach((l, k) => {
      const z = ((n - 1) / 2 - k) * (1.5 + gap) + l.lift.value * pw * 0.06;
      l.el.style.transform = `${stack} translate3d(0,0,${z.toFixed(2)}px)`;
      l.shade.style.opacity = clamp(k * (0.05 + apart * 0.14) - l.lift.value * 0.15, 0, 0.6).toFixed(3);
      // Where the layer's middle lands on screen: tipped back by rx, seen in perspective, then scaled.
      const label = labels[k]!;
      const y = ((-z * sin * scale + shiftY) * P) / (P - z * cos * scale);
      label.style.transform = `translate3d(0,${(y - label.offsetHeight / 2).toFixed(1)}px,0)`;
      // One after another, top layer first.
      label.style.opacity = smooth(k * 0.12, k * 0.12 + 0.5, named * 1.36).toFixed(3);
    });
    beat.style.opacity = named.toFixed(3);
  }

  let raf = 0;
  let last = 0;
  function frame(now: number) {
    const dt = Math.min(0.05, (now - (last || now)) / 1000) || 1 / 60;
    last = now;
    let busy = false;
    for (const l of layers) busy = !l.lift.step(dt) || busy;
    render();
    raf = busy ? requestAnimationFrame(frame) : 0;
    if (!raf) last = 0;
  }
  const tick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  addEventListener('scroll', () => { measure(); tick(); }, { passive: true, signal });
  addEventListener('resize', () => { measure(); tick(); }, { signal });

  // A pointer over a layer, once they are apart, lifts it out a little.
  layers.forEach((l) => {
    l.el.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || p < 0.4) return;
      l.lift.to(1);
      tick();
    }, { signal });
    l.el.addEventListener('pointerleave', () => { l.lift.to(0); tick(); }, { signal });
  });

  measure();
  render();
  signal.addEventListener('abort', () => cancelAnimationFrame(raf));
}
