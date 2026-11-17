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
import './song-transition';

export function onPage(setup: (signal: AbortSignal) => void) {
  let shown: HTMLElement | null = null;
  let current: AbortController | null = null;
  const start = () => {
    // The first load sets up at once; the router's page-load for that same page comes later, at load.
    if (shown === document.body) return;
    shown = document.body;
    current?.abort();
    const { signal } = (current = new AbortController());
    // Not before the page has its styles. Coming back to a page already seen in this visit, Safari says
    // the page is loaded while its stylesheet is still on the way in: a setup that measures then (the
    // music carousel) measured a page with no layout, and the records were left off the screen.
    const unstyled = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]')].filter((link) => !link.sheet && !link.disabled);
    if (!unstyled.length) return setup(signal);
    const styled = (link: HTMLLinkElement) => new Promise<void>((done) => {
      link.addEventListener('load', () => done(), { once: true });
      link.addEventListener('error', () => done(), { once: true });
      setTimeout(done, 3000); // never held up for good by a stylesheet that doesn't come
    });
    void Promise.all(unstyled.map(styled)).then(() => { if (!signal.aborted) setup(signal); });
  };
  document.addEventListener('astro:before-swap', () => {
    current?.abort();
    current = null;
    shown = null;
  });
  document.addEventListener('astro:page-load', start);
  start();
}

/**
 * The change of page under way, over: resolves a frame after its view transition has finished, so at
 * once on a page that was loaded rather than changed to. Safari starts the compositor's animations over
 * when a view transition ends: on an iPhone, an animation begun as the music page opened out of the
 * island played for 430 ms and then began again from its start. An animation that must play once, or
 * keep time with another, waits for this before it begins.
 */
let arriving: Promise<void> = Promise.resolve();
export const arrived = () => arriving;

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
  const { newDocument, navigationType, to, viewTransition } = event as TransitionBeforeSwapEvent;
  // Never held up for long, whatever becomes of the transition (a tab in the background draws no frame).
  arriving = Promise.race([
    Promise.resolve(viewTransition?.finished).then(() => {}, () => {}).then(() => new Promise<void>((done) => requestAnimationFrame(() => done()))),
    new Promise<void>((done) => setTimeout(done, 2000)),
  ]);
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
