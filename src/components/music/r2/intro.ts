/**
 * "Listening room" (r2): a copy of v4/intro.ts with one addition, the lamp. The show plays in the dark;
 * as the headline starts home the lamp comes on, on the show's own clock, so a hurried intro hurries
 * the light with it. The cone on the wall and its reflection in the counter first, warming up quickly
 * and then slowly, the way a lamp does, and a beat later the light it throws back into the room: the
 * wall appears from the lamp outwards. Arrived at from history, with reduced motion, or scrolled down,
 * the room is lit at once (the CSS only darkens it while `data-intro` is on the page).
 *
 * The rest is v4's, unchanged:
 *
 * The music page's intro. "I love" comes into focus in the middle of the screen, large, a word at a
 * time, and drifts up and shrinks, slowly, like a breath drawn in, while nothing else happens: the
 * wait. Then "music" lands below it, much larger, its rainbow racing, and "I love" is pushed up out of
 * its way. A moment later the headline goes home into the page while the rest of the page comes in
 * under it, and the rainbow slows down to its drift.
 *
 * It plays when the page is arrived at (the island's song, a link, a load), not when history steps back
 * to it, and not when the page opens scrolled down. Any touch, click, scroll or key during it plays the
 * rest three times as fast. With reduced motion the page is just there and the bands hold still.
 *
 * It begins once the page is shown, after the island's view transition has opened it: Safari starts
 * the compositor's animations over when a view transition ends, so on an iPhone "I love" came into
 * focus for 430 ms and then again from nothing, and ran that much behind "music." from then on.
 *
 * The two parts of the headline have to stay in step with each other to the frame, so one clock moves
 * both: a script reads the time once a frame and writes each part's transform (and the landing's
 * opacity and blur) itself, and nothing the browser does to its animations can part them. What needs
 * no such step is the Web Animations API on transform, opacity and filter: the words coming into focus,
 * the rest of the page coming in, and the rainbow.
 *
 * The rainbow is two layers, one inside the other. The inner one drifts for ever, from the moment the
 * page is shown. The outer one adds the rush to it: what the bands move beyond their drift, which is
 * nothing before "music" lands and nothing more once they have slowed down, with the change of speed
 * baked into keyframes (see `rush`), not a rate changed every frame. So no animation ever hands over to
 * another: a second one taking over where the rush ended stood still for a frame, and in Safari began
 * from the start of a period instead (its compositor does not know `iterationStart`), a jump of half a
 * band at the very end of the slowing down.
 */
import type { TransitionBeforeSwapEvent } from 'astro:transitions/client';
import { arrived, onPage } from '@/scripts/page';
import { bezier } from '@/scripts/easing';

// The site's curves (emil-design-eng): a strong ease-out for arrivals, the iOS drawer curve for going
// home. The wait (easings.net): words coming into focus on a long, soft ease-out (quint), and the drift
// and shrink on a sine in-out, which starts and ends without a corner, as breathing does.
const curve = (x1: number, y1: number, x2: number, y2: number) => ({ css: `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`, at: bezier(x1, y1, x2, y2) });
const EASE_OUT = curve(0.23, 1, 0.32, 1);
const EASE_DRAWER = curve(0.32, 0.72, 0, 1);
const EASE_FOCUS = curve(0.22, 1, 0.36, 1);
const EASE_BREATH = curve(0.37, 0, 0.63, 1);

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
const LAMP = SETTLE + 250; // the lamp comes on as "music." is half-way home
const WARM = 760; // the cone: a quick rise, then the last of it slowly
const SPILL_AFTER = 180; // the room's bounced light follows
const SPILL = 1000;
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
  const root = document.querySelector<HTMLElement>('.v4.r2[data-music-page]');
  if (!root) return;
  // Not before the page is shown: what begins while the island is still opening the page, Safari
  // begins again when it has opened (scripts/page.ts). Until then the page is dark, as the CSS has it.
  void arrived().then(() => { if (!signal.aborted) start(root, signal, fromHistory); });
});

function start(root: HTMLElement, signal: AbortSignal, fromHistory: boolean) {
  const love = root.querySelector<HTMLElement>('[data-intro-love]');
  const word = root.querySelector<HTMLElement>('[data-intro-word]');
  const bands = root.querySelector<HTMLElement>('[data-rainbow]');
  const surge = root.querySelector<HTMLElement>('[data-rainbow-rush]');
  if (!love || !word || !bands || !surge) return root.removeAttribute('data-intro');

  const running: Animation[] = [];
  signal.addEventListener('abort', () => running.forEach((a) => a.cancel()));

  // The bands drift, for good: the rainbow at rest. The intro's rush goes on top of it (`rush`).
  if (!reduce.matches) {
    running.push(bands.animate([{ transform: 'translateX(0em)' }, { transform: `translateX(${PERIOD}em)` }], {
      duration: (PERIOD / DRIFT) * 1000, iterations: Infinity,
    }));
  }

  const play = root.hasAttribute('data-intro') && !reduce.matches && !fromHistory && scrollY < 40;
  if (!play) return root.removeAttribute('data-intro');

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
  type Pose = { x: number; y: number; s: number };
  /** A pose reached at `at` ms; `ease` shapes the way from it to the next one. */
  type Key = Pose & { at: number; ease?: (p: number) => number };
  /** Puts a part's facing side at x and its middle at y, scaled by s. */
  const place = (r: Box, side: 'left' | 'right', x: number, y: number, s: number): Pose => ({
    x: side === 'right' ? x + (s * r.width) / 2 - r.right : x - (s * r.width) / 2 - r.left,
    y: y - r.top - r.height / 2,
    s,
  });
  const HOME_POSE: Pose = { x: 0, y: 0, s: 1 };
  const END = SETTLE + FOLLOW + HOME; // both parts are home
  /** The two parts' paths across the screen as it is now. */
  const paths = (): { love: Key[]; word: Key[] } => {
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
      // "I love": in focus, shrinking through the wait, shoved up as "music" lands, then home.
      love: [
        { at: 0, ...loveAt(cy + rise, sL0), ease: EASE_BREATH.at },
        { at: HIT, ...loveAt(cy, sL1), ease: EASE_OUT.at },
        { at: HIT + PUNCH, ...loveAt(loveY, sL2) },
        { at: SETTLE, ...loveAt(loveY, sL2), ease: EASE_DRAWER.at },
        { at: SETTLE + LOVE_HOME, ...HOME_POSE },
      ],
      // "music.": lands from larger than the screen allows, all at once, then follows "I love" home.
      word: [
        { at: HIT, ...wordAt(sM * 1.35), ease: EASE_OUT.at },
        { at: HIT + PUNCH, ...wordAt(sM) },
        { at: SETTLE + FOLLOW, ...wordAt(sM), ease: EASE_DRAWER.at },
        { at: END, ...HOME_POSE },
      ],
    };
  };
  /** Where a path is at `t` ms, as a transform. */
  const transform = (keys: Key[], t: number) => {
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1]!.at) i++;
    const a = keys[i]!, b = keys[i + 1]!;
    const p = Math.min(1, Math.max(0, (t - a.at) / (b.at - a.at)));
    const e = a.ease ? a.ease(p) : p;
    const mix = (from: number, to: number) => from + (to - from) * e;
    return `translate(${mix(a.x, b.x).toFixed(2)}px, ${mix(a.y, b.y).toFixed(2)}px) scale(${mix(a.s, b.s).toFixed(4)})`;
  };

  // The clock: an animation that animates nothing, so the show's time is the browser's own, in step
  // with the animations below, and is hurried (and, by a test, paused and sought) along with them.
  const clock = root.animate(null, { duration: END });
  let keys = paths();
  const written = new Map<string, string>();
  const write = (el: HTMLElement, prop: 'transform' | 'opacity' | 'filter', value: string) => {
    const id = (el === love ? 'love.' : 'word.') + prop;
    if (written.get(id) === value) return;
    written.set(id, value);
    el.style[prop] = value;
  };
  /** Both parts as they are at the clock's time now. */
  const draw = () => {
    const t = Number(clock.currentTime ?? 0);
    write(love, 'transform', transform(keys.love, t));
    write(word, 'transform', transform(keys.word, t));
    // The landing: "music." comes out of a blur, at once.
    const e = EASE_OUT.at(Math.min(1, Math.max(0, (t - HIT) / PUNCH)));
    write(word, 'opacity', Math.min(1, e / 0.3).toFixed(3));
    write(word, 'filter', e > 0 && e < 1 ? `blur(${(6 * (1 - e)).toFixed(2)}px)` : '');
  };
  love.style.opacity = '1'; // shown (the CSS hides it until now); its words come into focus below
  draw();
  let frame = requestAnimationFrame(function tick() {
    draw();
    frame = requestAnimationFrame(tick);
  });
  /** The parts let go of: they are the page's again. */
  const release = () => {
    cancelAnimationFrame(frame);
    for (const el of [love, word]) for (const prop of ['transform', 'opacity', 'filter'] as const) el.style[prop] = '';
  };
  signal.addEventListener('abort', release);
  // The screen changing size mid-show redraws the paths; the parts carry on from where they are in time.
  const reflow = () => { keys = paths(); };
  addEventListener('resize', reflow, { signal });
  visualViewport?.addEventListener('resize', reflow, { signal });

  const show: Animation[] = [
    clock,
    // "I love" comes into focus, one word after the other.
    ...[...love.querySelectorAll<HTMLElement>('[data-intro-w]')].map((w, i) => w.animate(
      [{ opacity: 0, filter: 'blur(14px)' }, { opacity: 1, offset: 0.6 }, { opacity: 1, filter: 'blur(0px)' }],
      { duration: FOCUS, delay: i * FOCUS_STAGGER, easing: EASE_FOCUS.css, fill: 'both' },
    )),
    // The rest of the page, in order down it, following the headline home.
    ...[...root.querySelectorAll<HTMLElement>('[data-intro-rest]'), document.querySelector<HTMLElement>('.music-footer')]
      .filter((el): el is HTMLElement => el !== null)
      .map((el, i) => el.animate([{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'translateY(0px)' }], {
        duration: REST, delay: SETTLE + REST_AFTER + i * REST_STAGGER, easing: EASE_DRAWER.css, fill: 'both',
      })),
  ];
  // The lamp. Opacity only, on layers that are drawn once and never again.
  const warm = (from: number, at: number, easeIn: string, easeOut: string): Keyframe[] => [
    { opacity: 0, easing: easeIn }, { opacity: from, offset: at, easing: easeOut }, { opacity: 1 },
  ];
  for (const el of root.querySelectorAll<HTMLElement>('[data-r2-light]')) {
    const spill = el.dataset.r2Light === 'spill';
    show.push(el.animate(
      spill ? warm(0.4, 0.3, EASE_OUT.css, EASE_BREATH.css) : warm(0.62, 0.16, EASE_OUT.css, EASE_BREATH.css),
      { duration: spill ? SPILL : WARM, delay: LAMP + (spill ? SPILL_AFTER : 0), fill: 'both' },
    ));
  }
  const rushing = rush(surge, HIT, SETTLE - HIT);
  running.push(...show, rushing);

  // Once in place, the page is the page again: no intro state, nothing holding its parts there.
  Promise.all(show.map((a) => a.finished)).then(() => {
    root.removeAttribute('data-intro');
    release();
    removeEventListener('resize', reflow);
    visualViewport?.removeEventListener('resize', reflow);
    show.forEach((a) => a.cancel());
  }, () => {});

  // Never in the way: whoever reaches for the page gets it sooner. The rainbow is in nobody's way and
  // keeps its own pace (three times the rush strobes, and three times the slowing down ends in a jolt);
  // it is only moved on in time, so that it still starts to slow down as the headline starts home. Once
  // "music" is there to be seen, it is moved on by whole periods of the rush, which look the same.
  const hurry = () => {
    const t = Number(clock.currentTime ?? END);
    show.forEach((a) => a.playState === 'running' && a.updatePlaybackRate(SKIP_RATE));
    if (t >= SETTLE || rushing.playState !== 'running') return;
    const lap = (PERIOD / (RUSH - DRIFT)) * 1000;
    const skip = (SETTLE - t) * (1 - 1 / SKIP_RATE);
    rushing.currentTime = Number(rushing.currentTime) + (t < HIT ? skip : Math.floor(skip / lap) * lap);
  };
  for (const type of ['pointerdown', 'wheel', 'touchstart', 'keydown'] as const) {
    addEventListener(type, hurry, { once: true, passive: true, signal });
  }
}

/**
 * The rush: what the bands move beyond their drift, from the landing on. They race while the headline
 * holds, then slow down to the drift. The eye reads speed by ratios, so the speed falls by the same ratio
 * in each moment (from RUSH to DRIFT on a geometric scale), on a sine in-out across DECAY: it lets go of
 * the rush gently and meets the drift without a jolt. The layer's position is the speed above the drift
 * summed up sample by sample, and it stays where that ends. The bands are only a period wider than they
 * need to be for this, so the position is kept within a period: at each whole period the keyframes jump
 * back by one, which looks the same.
 */
function rush(layer: HTMLElement, delay: number, hold: number) {
  const total = hold + DECAY;
  /** How much faster than the drift the bands go, `ms` after the landing. */
  const extra = (ms: number) => {
    if (ms <= hold) return RUSH - DRIFT;
    const u = Math.min(1, (ms - hold) / DECAY);
    return RUSH * (DRIFT / RUSH) ** ((1 - Math.cos(Math.PI * u)) / 2) - DRIFT;
  };
  const frame = (offset: number, em: number): Keyframe => ({ offset, transform: `translateX(${em.toFixed(4)}em)` });
  const keys: Keyframe[] = [frame(0, 0)];
  const STEP = 10;
  let x = 0;
  for (let was = 0; was < total; ) {
    const now = Math.min(was + STEP, total);
    const xp = x;
    x += ((extra(was) + extra(now)) / 2) * ((now - was) / 1000);
    if (Math.floor(x / PERIOD) > Math.floor(xp / PERIOD)) {
      // The moment it crosses a whole period, found on the straight line between the two samples.
      const edge = Math.floor(x / PERIOD) * PERIOD;
      const at = (was + ((edge - xp) / (x - xp)) * (now - was)) / total;
      keys.push(frame(at, PERIOD), frame(at, 0));
    }
    keys.push(frame(now / total, x % PERIOD));
    was = now;
  }
  return layer.animate(keys, { duration: total, delay, fill: 'both' });
}
