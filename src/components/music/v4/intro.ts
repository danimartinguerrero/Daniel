/**
 * The music page's intro. "I love" comes into focus in the middle of the screen, large, a word at a
 * time, and drifts up and shrinks, slowly, like a breath drawn in, while nothing else happens: the wait. Then "music" lands below it, much larger, its rainbow
 * racing, and "I love" is pushed up out of its way. A moment later the headline goes home into the
 * page while the rest of the page comes in under it, and the rainbow slows down to its drift.
 *
 * It plays when the page is arrived at (the island's song, a link, a load), not when history steps back
 * to it, and not when the page opens scrolled down. Any touch, click, scroll or key during it plays the
 * rest three times as fast. With reduced motion the page is just there and the bands hold still.
 *
 * Everything is the Web Animations API on transform, opacity and filter, so it runs on the compositor,
 * also while the carousel sets itself up and the island's view transition opens the page. The rainbow's
 * speed changing is baked into keyframes (see `rush`), not a rate changed every frame.
 */
import type { TransitionBeforeSwapEvent } from 'astro:transitions/client';
import { onPage } from '@/scripts/page';

// The site's curves (emil-design-eng): a strong ease-out for arrivals, the iOS drawer curve for going home.
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const EASE_DRAWER = 'cubic-bezier(0.32, 0.72, 0, 1)';
// The wait (easings.net): words coming into focus on a long, soft ease-out (quint), and the drift and
// shrink on a sine in-out, which starts and ends without a corner, as breathing does.
const EASE_FOCUS = 'cubic-bezier(0.22, 1, 0.36, 1)';
const EASE_BREATH = 'cubic-bezier(0.37, 0, 0.63, 1)';

// The timeline, in ms from the start.
const FOCUS = 1300; // each word of "I love" coming into focus
const FOCUS_STAGGER = 220; // "love" a beat after "I"
const HIT = 2100; // "music" lands (the wait before it is "I love" drifting up and shrinking)
const PUNCH = 300; // its landing, and "I love" pushed up
const SETTLE = HIT + 700; // the headline starts home:
const LOVE_HOME = 650; // "I love" first, quickly, out of the way,
const FOLLOW = 100; // "music." a beat later,
const HOME = 850; // taking longer, as it has further to come
const REST_AFTER = 300; // the rest of the page follows, once "music." is past it
const REST_STAGGER = 70;
const REST = 750;
const DECAY = 4500; // the rainbow slowing from its rush to its drift, taking its time
const SKIP_RATE = 3;

// The rainbow, in em per second along the line. A period (all six bands) is --rb-p in the CSS.
const PERIOD = 2.4;
const DRIFT = PERIOD / 5; // at rest: once round every five seconds
const RUSH = 9; // landing: about a third of a band per frame at 60 Hz, fast but never strobing

const reduce = matchMedia('(prefers-reduced-motion: reduce)');

// A step back or forward in history shows the page as it was left, without the show. (This module
// is in the document from the first time the music page is shown, so it hears every return to it.)
document.addEventListener('astro:before-swap', (event) => {
  const { navigationType, newDocument } = event as TransitionBeforeSwapEvent;
  if (navigationType === 'traverse') newDocument.querySelector('.v4[data-intro]')?.removeAttribute('data-intro');
});

let firstPage = true;
onPage((signal) => {
  const fromHistory = firstPage && (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'back_forward';
  firstPage = false;
  const root = document.querySelector<HTMLElement>('.v4[data-music-page]');
  if (root) start(root, signal, fromHistory);
});

function start(root: HTMLElement, signal: AbortSignal, fromHistory: boolean) {
  const love = root.querySelector<HTMLElement>('[data-intro-love]');
  const word = root.querySelector<HTMLElement>('[data-intro-word]');
  const bands = root.querySelector<HTMLElement>('[data-rainbow]');
  if (!love || !word || !bands) return root.removeAttribute('data-intro');

  const running: Animation[] = [];
  signal.addEventListener('abort', () => running.forEach((a) => a.cancel()));

  /** The bands drifting at rest, picking up where the rush left them (`phase`, in periods). */
  const drift = (phase = 0) => {
    if (reduce.matches || signal.aborted) return;
    running.push(bands.animate([{ transform: 'translateX(0em)' }, { transform: `translateX(${PERIOD}em)` }], {
      duration: (PERIOD / DRIFT) * 1000, iterations: Infinity, iterationStart: phase,
    }));
  };

  const play = root.hasAttribute('data-intro') && !reduce.matches && !fromHistory && scrollY < 40;
  if (!play) {
    root.removeAttribute('data-intro');
    return drift();
  }

  // Where the parts rest in the page (laid out, unseen), and where they go on the stage. The stage is
  // the screen as it is now, so it is worked out again whenever the screen changes size during the
  // show: on an iPhone, Safari's toolbar comes back as the page opens at its top (it was tucked away on
  // a page scrolled down), and the screen gets shorter under the headline.
  const restLove = love.getBoundingClientRect(), restWord = word.getBoundingClientRect();
  const sx0 = scrollX, sy0 = scrollY;
  type Box = { left: number; right: number; top: number; width: number; height: number };
  /** A part's resting box on the screen now, wherever the page has been scrolled to since. */
  const rest = (r: DOMRect): Box => {
    const dx = sx0 - scrollX, dy = sy0 - scrollY;
    return { left: r.left + dx, right: r.right + dx, top: r.top + dy, width: r.width, height: r.height };
  };
  // Each part scales about the side that faces the other ("I love" its right, "music." its left, as
  // set in the CSS), so neither swells into the other on the way home.
  /** Puts a part's facing side at x and its middle at y, scaled by s. */
  const place = (r: Box, side: 'left' | 'right', x: number, y: number, s: number) => {
    const dx = side === 'right' ? x + (s * r.width) / 2 - r.right : x - (s * r.width) / 2 - r.left;
    return `translate(${dx.toFixed(2)}px, ${(y - r.top - r.height / 2).toFixed(2)}px) scale(${s.toFixed(4)})`;
  };
  const home = 'translate(0px, 0px) scale(1)';
  const T = SETTLE + LOVE_HOME;
  const o = (ms: number) => ms / T;
  const Tw = SETTLE + FOLLOW + HOME;
  const ow = (ms: number) => ms / Tw;
  /** The two parts' paths across the screen as it is now. */
  const paths = () => {
    const L = rest(restLove), M = rest(restWord);
    const W = innerWidth, H = innerHeight;
    const sM = Math.min((W * 0.86) / M.width, (H * 0.4) / M.height); // "music." as wide as the screen allows
    const sL0 = Math.min((W * 0.55) / L.width, (H * 0.24) / L.height); // "I love" alone, large
    const sL1 = sL0 * 0.78; // after the wait
    const sL2 = Math.min(sM * 0.42, sL1); // dwarfed by "music"
    const cx = W / 2, cy = H * 0.47;
    const rise = H * 0.035; // how far "I love" drifts up through the wait
    const hL = L.height * sL2, hM = M.height * sM;
    const top = cy - (hL + hM * 1.02) / 2;
    const loveY = top + hL / 2, wordY = top + hL + hM * 0.02 + hM / 2;
    const loveAt = (y: number, s: number) => place(L, 'right', cx, y, s);
    const wordAt = (s: number) => place(M, 'left', cx, wordY, s);
    return {
      // "I love": in focus, shrinking steadily through the wait, shoved up as "music" lands, then home.
      love: [
        { offset: 0, transform: loveAt(cy + rise, sL0), easing: EASE_BREATH },
        { offset: o(HIT), transform: loveAt(cy, sL1), easing: EASE_OUT },
        { offset: o(HIT + PUNCH), transform: loveAt(loveY, sL2) },
        { offset: o(SETTLE), transform: loveAt(loveY, sL2), easing: EASE_DRAWER },
        { offset: 1, transform: home },
      ],
      // "music.": lands from larger than the screen allows, all at once, then follows "I love" home.
      word: [
        { offset: 0, transform: wordAt(sM * 1.35) },
        { offset: ow(HIT), transform: wordAt(sM * 1.35), easing: EASE_OUT },
        { offset: ow(HIT + PUNCH), transform: wordAt(sM) },
        { offset: ow(SETTLE + FOLLOW), transform: wordAt(sM), easing: EASE_DRAWER },
        { offset: 1, transform: home },
      ],
    } satisfies Record<string, Keyframe[]>;
  };
  const first = paths();
  const loveMoves = love.animate(first.love, { duration: T, fill: 'both' });
  const wordMoves = word.animate(first.word, { duration: Tw, fill: 'both' });

  const show: Animation[] = [
    loveMoves,
    // Shown (the CSS hides it until now); its words come into focus one after the other.
    love.animate([{ opacity: 1 }, { opacity: 1 }], { duration: T, fill: 'both' }),
    ...[...love.querySelectorAll<HTMLElement>('[data-intro-w]')].map((w, i) => w.animate(
      [{ opacity: 0, filter: 'blur(14px)' }, { opacity: 1, offset: 0.6 }, { opacity: 1, filter: 'blur(0px)' }],
      { duration: FOCUS, delay: i * FOCUS_STAGGER, easing: EASE_FOCUS, fill: 'both' },
    )),
    wordMoves,
    word.animate([{ opacity: 0, filter: 'blur(6px)' }, { opacity: 1, offset: 0.3 }, { opacity: 1, filter: 'blur(0px)' }], { duration: PUNCH, delay: HIT, easing: EASE_OUT, fill: 'both' }),
    // The rest of the page, in order down it, following the headline home.
    ...[...root.querySelectorAll<HTMLElement>('[data-intro-rest]'), document.querySelector<HTMLElement>('.music-footer')]
      .filter((el): el is HTMLElement => el !== null)
      .map((el, i) => el.animate([{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'translateY(0px)' }], {
        duration: REST, delay: SETTLE + REST_AFTER + i * REST_STAGGER, easing: EASE_DRAWER, fill: 'both',
      })),
  ];
  const { animation: rushing, end } = rush(bands, HIT, SETTLE - HIT);
  running.push(...show, rushing);

  // The screen changing size mid-show redraws the paths; the parts carry on from where they are in time.
  let settled = false;
  const reflow = () => {
    if (settled) return;
    const next = paths();
    (loveMoves.effect as KeyframeEffect).setKeyframes(next.love);
    (wordMoves.effect as KeyframeEffect).setKeyframes(next.word);
  };
  addEventListener('resize', reflow, { signal });
  visualViewport?.addEventListener('resize', reflow, { signal });

  // Once in place, the page is the page again: no intro state, no animations holding it there.
  Promise.all(show.map((a) => a.finished)).then(() => {
    settled = true;
    root.removeAttribute('data-intro');
    show.forEach((a) => a.cancel());
  }, () => {});
  rushing.finished.then(() => {
    drift(end);
    rushing.cancel();
  }, () => {});

  // Never in the way: whoever reaches for the page gets it sooner.
  const hurry = () => [...show, rushing].forEach((a) => a.playState === 'running' && a.updatePlaybackRate(SKIP_RATE));
  for (const type of ['pointerdown', 'wheel', 'touchstart', 'keydown'] as const) {
    addEventListener(type, hurry, { once: true, passive: true, signal });
  }
}

/**
 * The rainbow from the landing: at full rush while the headline holds, then slowing to the drift. The eye
 * reads speed by ratios, so the speed falls by the same ratio in each moment (from RUSH to DRIFT on a
 * geometric scale), on a sine in-out across DECAY: it lets go of the rush gently and meets the drift
 * without a jolt. The position is that speed summed up sample by sample. The band layer is only one
 * period wider than the word, so the position is kept within a period: at each whole period the
 * keyframes jump back by one, which looks the same. Returns where in a period it ends.
 */
function rush(bands: HTMLElement, delay: number, hold: number) {
  const total = hold + DECAY;
  const speed = (ms: number) => {
    if (ms <= hold) return RUSH;
    const u = Math.min(1, (ms - hold) / DECAY);
    return RUSH * (DRIFT / RUSH) ** ((1 - Math.cos(Math.PI * u)) / 2);
  };
  const frame = (offset: number, em: number): Keyframe => ({ offset, transform: `translateX(${em.toFixed(4)}em)` });
  const keys: Keyframe[] = [frame(0, 0)];
  const STEP = 10;
  let x = 0;
  for (let was = 0; was < total; ) {
    const now = Math.min(was + STEP, total);
    const xp = x;
    x += ((speed(was) + speed(now)) / 2) * ((now - was) / 1000);
    if (Math.floor(x / PERIOD) > Math.floor(xp / PERIOD)) {
      // The moment it crosses a whole period, found on the straight line between the two samples.
      const edge = Math.floor(x / PERIOD) * PERIOD;
      const at = (was + ((edge - xp) / (x - xp)) * (now - was)) / total;
      keys.push(frame(at, PERIOD), frame(at, 0));
    }
    keys.push(frame(now / total, x % PERIOD));
    was = now;
  }
  const animation = bands.animate(keys, { duration: total, delay, fill: 'both' });
  return { animation, end: (x % PERIOD) / PERIOD };
}
