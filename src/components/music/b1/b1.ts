/** Behaviour of version b1. Everything starts inside onPage and stops when its signal aborts. */
import { arrived, onPage } from '@/scripts/page';

// The pass: sixteen steps of 110 ms (b1.css, --b1-step-time), the last light's fade, and a margin.
const PASS_MS = 16 * 110 + 400;

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('.b1[data-music-page]');
  const rack = root?.querySelector<HTMLElement>('[data-b1-rack]');
  if (!rack) return;

  // The drawing plays once, the first time most of it is on screen: a light runs along the top of the
  // sixteen steps and each lit step comes on as the light reaches it, so the grid reads as time, left
  // to right. Then it rests. With reduced motion, or when the drawing is already on screen as the page
  // opens (a return scrolled down), it is simply there.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = rack.getBoundingClientRect();
  if (box.top < innerHeight && box.bottom > 0) return;

  let timer = 0;
  // The plain lit state, for good: once the pass is over, or as soon as the visitor has gone by in the
  // middle of it, so nobody comes back to a pattern half lit.
  const done = () => {
    clearTimeout(timer);
    rack.setAttribute('data-done', '');
    io.disconnect();
  };

  const io = new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1];
    if (!entry) return;
    if (rack.hasAttribute('data-played')) {
      if (!entry.isIntersecting) done();
      return;
    }
    if (entry.intersectionRatio < 0.6) return;
    // Not before the page has finished arriving: Safari restarts compositor animations at the end of a
    // view transition.
    void arrived().then(() => {
      if (signal.aborted || rack.hasAttribute('data-done')) return;
      rack.setAttribute('data-played', '');
      timer = window.setTimeout(done, PASS_MS);
    });
  }, { threshold: [0, 0.6] });

  rack.setAttribute('data-armed', '');
  io.observe(rack);
  signal.addEventListener('abort', () => {
    clearTimeout(timer);
    io.disconnect();
    rack.removeAttribute('data-armed');
    rack.removeAttribute('data-played');
    rack.removeAttribute('data-done');
  });
});
