/**
 * The site changes page with Astro's client router (<ClientRouter /> in each page's head): the
 * document stays and only the page in it is swapped, so the island and its song carry on from one
 * page to the next (Island.astro, island-audio.ts). The price is that a page's scripts run once per
 * visit, not once per page shown. `onPage` is how a script sets its page up every time the page is
 * shown, the first load included, and takes it down when the page is swapped out: whatever the setup
 * starts (listeners, observers, frames, timers) stops when `signal` aborts.
 *
 * Also here, once per visit: what the router would otherwise drop on the way to a new page.
 */
import type { TransitionBeforeSwapEvent } from 'astro:transitions/client';

export function onPage(setup: (signal: AbortSignal) => void) {
  let shown: HTMLElement | null = null;
  let current: AbortController | null = null;
  const start = () => {
    // The first load sets up at once; the router's page-load for that same page comes later, at load.
    if (shown === document.body) return;
    shown = document.body;
    current?.abort();
    current = new AbortController();
    setup(current.signal);
  };
  document.addEventListener('astro:before-swap', () => {
    current?.abort();
    current = null;
    shown = null;
  });
  document.addEventListener('astro:page-load', start);
  start();
}

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
let landing = '';
/** The page in the document now. */
let shown = location.pathname;

document.addEventListener('astro:after-swap', () => { shown = location.pathname; });

// Back and forward between places in the page on screen (the home page's in-page trips push one per
// trip, scripts/goto.ts) only scroll, as they did before the router: heard first, they never reach
// the router, which would fetch and redraw the whole page to go up it.
addEventListener('popstate', (event) => {
  const state = event.state as { scrollX?: number; scrollY?: number } | null;
  if (!state || location.pathname !== shown) return;
  event.stopImmediatePropagation();
  scrollTo({ left: state.scrollX ?? 0, top: state.scrollY ?? 0, behavior: 'instant' });
}, { capture: true });

document.addEventListener('astro:before-swap', (event) => {
  const { newDocument, navigationType, to } = event as TransitionBeforeSwapEvent;
  // The router gives <html> the new page's attributes and nothing else. The classes the pages' CSS
  // reads before any script has run go with it: "js" (set inline in the head, which doesn't run
  // again) and "reduce" (scripts/scroll.ts), so the new page's first frame is already the right one.
  newDocument.documentElement.classList.add('js');
  newDocument.documentElement.classList.toggle('reduce', reduce.matches);
  // Back and forward put the page where it was; a link to a part of another page lands on it.
  landing = navigationType === 'traverse' ? '' : to.hash;
});

document.addEventListener('astro:after-swap', () => {
  if (!landing) return;
  const target = document.getElementById(decodeURIComponent(landing.slice(1)));
  landing = '';
  // At once, and at the part's own top, where the island's trips within the page land
  // (scripts/goto.ts): the router's jump to the fragment follows the page's smooth scrolling, which
  // would run the whole page past from the top.
  if (target) scrollTo({ top: target.getBoundingClientRect().top + scrollY, behavior: 'instant' });
});
