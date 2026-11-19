/**
 * Music, way scroll-1: the blocks after the ring rise into place as they come up the screen, once each,
 * and stay. An entrance, so a strong ease-out (the site's --ease-out) and no more than 600 ms; a block
 * already on screen when the script starts (a reload half-way down, a return from history) is simply
 * there. Nothing waits on it: the text is in the page from the start, and only the script hides it,
 * just before it is watched (scroll-1.css, is-sc1-armed).
 */
import { onPage } from '@/scripts/page';

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('[data-music-page][data-sc1]');
  if (!root || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const blocks = [...root.querySelectorAll<HTMLElement>('[data-sc1-reveal]')];

  // Already passed or on screen: shown at once, without a transition.
  const fold = innerHeight * 0.92;
  for (const el of blocks) if (el.getBoundingClientRect().top < fold) el.classList.add('is-in');
  root.classList.add('is-sc1-armed');

  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      seen.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px' });
  for (const el of blocks) if (!el.classList.contains('is-in')) seen.observe(el);
  signal.addEventListener('abort', () => seen.disconnect());
});
