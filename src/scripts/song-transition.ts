/**
 * The song in the island opens its page, as a Live Activity opens its app from the Dynamic Island:
 * the music page grows out of the island card that was pressed and fills the screen, and the page
 * that was there dims behind it. Leaving the music page plays it backwards, faster: the page shrinks
 * back into the island, where the song goes on playing. Every other change of page still cuts.
 *
 * The router already runs each change of page inside a view transition, with no animation of its own
 * (transition:animate="none" on <html>); this only animates that transition's snapshots, with the
 * Web Animations API, so the motion is transform, opacity, filter and clip-path on two layers and
 * stays off the page's own work (the music page sets its carousel up while the page grows).
 * Once per visit, from scripts/page.ts.
 */
import type { TransitionBeforePreparationEvent, TransitionBeforeSwapEvent } from 'astro:transitions/client';

const MUSIC = '/music';
/** The island's corners: the open card and the resting pill (lib/island/metrics.ts, Island.astro). */
const CARD_RADIUS = 47.9;
const PILL_RADIUS = 18.42;
/** How far the pages scale about the island while the clip opens or closes. */
const DEPTH = 0.94;
// Opening: the drawer curve, iOS's sheet and app-launch deceleration, quick off the mark and long to
// settle. Closing: a short wind-up and a soft landing in the pill. A clip that shrinks loses area as
// the square of its size, so the drawer curve there reads as a cut: gone in a quarter of the time.
const EASE_OPEN = 'cubic-bezier(0.32, 0.72, 0, 1)';
const EASE_CLOSE = 'cubic-bezier(0.3, 0, 0.15, 1)';

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)');
const supported = 'startViewTransition' in document;

const path = (url: URL) => url.pathname.replace(/\/+$/, '') || '/';
const island = () => document.querySelector<HTMLElement>('[data-island-nav] [data-islandcn] > div');
const shape = () => document.querySelector('[data-island-nav] [data-islandcn] svg g path')?.getBoundingClientRect();
const pill = () => document.querySelector('.island-nav__hit')?.getBoundingClientRect();

/** The island card as it was under the press, before it starts to close. */
let pressed: DOMRect | undefined;
let mode: 'open' | 'close' | null = null;
let oldName = '';

document.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('.island-nav__song')) pressed = shape();
}, { capture: true });

document.addEventListener('astro:before-preparation', (event) => {
  const { from, to, sourceElement, navigationType } = event as TransitionBeforePreparationEvent;
  const leaving = path(from) === MUSIC, arriving = path(to) === MUSIC;
  mode = null;
  island()?.style.removeProperty('view-transition-name');
  if (!supported || reduce.matches || leaving === arriving) return;
  if (arriving && sourceElement?.closest('.island-nav__song')) mode = 'open';
  // A phone's back swipe has already slid the page away; don't play a second motion after it.
  else if (leaving && !(navigationType === 'traverse' && coarse.matches)) mode = 'close';
  if (mode) oldName = getComputedStyle(document.documentElement).viewTransitionName;
});

// The new page is in hand and the old one is about to be captured. The island gets its own layer
// for the length of the transition: it is the one thing on screen that doesn't change page, so it
// stays live and in front of both (its own close plays on).
document.addEventListener('astro:after-preparation', () => {
  if (mode) island()?.style.setProperty('view-transition-name', 'song-island');
});

document.addEventListener('astro:before-swap', (event) => {
  const { viewTransition } = event as TransitionBeforeSwapEvent;
  const now = mode;
  mode = null;
  if (!now) return;
  const from = pressed;
  pressed = undefined;
  viewTransition.ready.then(() => play(now, from)).catch(() => {});
  viewTransition.finished.finally(() => {
    island()?.style.removeProperty('view-transition-name');
    document.getElementById('song-transition-order')?.remove();
  });
});

function play(kind: 'open' | 'close', from: DOMRect | undefined) {
  const root = document.documentElement;
  const newName = getComputedStyle(root).viewTransitionName;
  const W = innerWidth, H = innerHeight;
  const open = kind === 'open';
  // Where the page starts (opening) or ends (closing): the island as it is now, already on its
  // way to the pill (or the card that was pressed, if it can't be read), or the pill itself.
  const r = (open ? shape() ?? from : pill()) ?? new DOMRect(W / 2 - 77.5, 13.91, 155, 36.84);
  const radius = Math.min(open ? CARD_RADIUS : PILL_RADIUS, r.height / 2);
  // The page scales about the island; the clip is drawn before that scale, so it is placed where
  // the scale will carry it onto the island.
  const ox = r.x + r.width / 2, oy = r.y + r.height / 2;
  const un = (v: number, o: number) => o + (v - o) / DEPTH;
  const small = `inset(${un(r.top, oy).toFixed(1)}px ${(W - un(r.right, ox)).toFixed(1)}px ${(H - un(r.bottom, oy)).toFixed(1)}px ${un(r.left, ox).toFixed(1)}px round ${(radius / DEPTH).toFixed(1)}px)`;
  const full = 'inset(0px 0px 0px 0px round 0px)';
  const origin = `${ox.toFixed(1)}px ${oy.toFixed(1)}px`;
  // A longer way to go on a wide screen takes a little longer; closing is always the quicker.
  const duration = open ? (W > 760 ? 520 : 460) : W > 760 ? 420 : 380;

  // The music page is the moving layer either way: on top as it grows, and on top as it shrinks.
  const music = open ? newName : oldName;
  const other = open ? oldName : newName;
  const order = document.createElement('style');
  order.id = 'song-transition-order';
  order.textContent = `::view-transition-group(${music}){z-index:1}`;
  document.head.append(order);

  const timing = { duration, easing: open ? EASE_OPEN : EASE_CLOSE, fill: 'both' as const };
  const grow = [
    { clipPath: small, transform: `scale(${DEPTH})`, transformOrigin: origin },
    { clipPath: full, transform: 'none', transformOrigin: origin },
  ];
  root.animate(open ? grow : [...grow].reverse(), { ...timing, pseudoElement: `::view-transition-${open ? 'new' : 'old'}(${music})` });
  if (!open) {
    // The last of it goes into the pill rather than sitting on it.
    root.animate([{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration, easing: 'linear', fill: 'both', pseudoElement: `::view-transition-old(${music})` });
  }
  // The other page sits behind, dimmed while the music page is over it. The router hides the old
  // snapshot outright (opacity 0); this keeps it.
  const dim = [{ opacity: 1, filter: 'brightness(1)' }, { opacity: 1, filter: 'brightness(0.62)' }];
  root.animate(open ? dim : [...dim].reverse(), { ...timing, pseudoElement: `::view-transition-${open ? 'old' : 'new'}(${other})` });
}
