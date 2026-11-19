/**
 * Music, way scroll-4: each part after the ring rises into place as it comes on screen, once
 * (scroll-4.css). A part already above the screen, as when coming back to the page partway down, is
 * simply there.
 */
import { onPage } from '@/scripts/page';

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('[data-sc4]');
  if (!root || !('IntersectionObserver' in window)) return;
  const parts = root.querySelectorAll<HTMLElement>('[data-sc4-reveal]');
  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting && entry.boundingClientRect.top > 0) continue;
      entry.target.classList.add('is-in');
      seen.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px' });
  // Parts on screen already when the page is set up show without waiting for a frame of the observer.
  for (const part of parts) {
    if (part.getBoundingClientRect().top < innerHeight * 0.92) part.classList.add('is-in');
    else seen.observe(part);
  }
  root.classList.add('is-armed');
  signal.addEventListener('abort', () => seen.disconnect());
});
