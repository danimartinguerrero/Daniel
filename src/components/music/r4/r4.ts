/**
 * Music, direction 4: "Spectrum". Two things move the sash, and nothing else ever does.
 *
 * The intro lays it down. As the headline comes home and the word's rainbow slows, ink runs
 * down each stripe from the page's top edge to the records, green first and blue last, the way the
 * stripes run, as if the rush had spilled out of the word.
 *
 * The song moves it. While the island's song plays, each stripe follows its own part of the song's
 * spectrum (green the lows, blue the highs, as in the island's meter, from the same subscription, so
 * the two agree to the frame, and with the meter's own ballistics: quick up, slow down, eased on every
 * frame between the data's thirty a second). The stripes trade width among themselves, each measured
 * against its own usual level, so the high bands, quieter in any song, move as much as the low ones;
 * the sash keeps its footprint and only breathes a little with the song's loudness, so pressing play
 * never leaves the page emptier. When the song stops, or a record is taken out, the stripes go back to
 * six equal bands on a spring, never a cut.
 *
 * At rest nothing here asks for a frame. With reduced motion the sash is simply there and holds still.
 */
import { arrived, onPage } from '@/scripts/page';
import { islandAudio } from '@/components/island-audio';

// The island's song (IslandNav.tsx): the player is the visit's one, whoever asks for it first.
const SONG = { src: '/audio/feather.m4a', levels: '/audio/feather.levels.bin', duration: 177.45 };

// Each band's usual level in this song (the mean of public/audio/feather.levels.bin, 0 to 1), so a
// stripe is as wide as at rest when its band is at its usual level.
const USUAL = [0.6, 0.71, 0.7, 0.53, 0.25, 0.17];
// A stripe's share is FLOOR plus the square of its level over its usual level (capped at CAP). The
// square keeps the trade clear when every band is loud at once, as in the song's fuller passages. The
// floor keeps the six even when the song is near silent (its first second), where one faint band would
// otherwise take the whole sash.
const FLOOR = 0.5;
const CAP = 4;
// The whole sash, from the quiet opening to the loudest passage.
const QUIET = 0.92;
const LOUD = 1.12;
// The spring that carries the sash between rest and the song: critically damped (apple-design), a
// little slower going back to rest than leaving it, so a pause lets go of the music gently.
const RESPONSE_IN = 0.35;
const RESPONSE_OUT = 0.7;

// The entrance (intro.ts's timeline, in ms from the start of the show): the headline starts home at
// 2800 and the rest of the page follows 300 ms later; the ink starts with the rest of the page, while
// the rainbow in the word is still slowing from its rush, and not before, so that on a phone its path
// does not cross "music." in flight. Each stripe in turn, on the drawer curve.
const SETTLE = 2800 + 300;
const LAY = 640;
const LAY_STAGGER = 50;
const EASE_DRAWER = 'cubic-bezier(0.32, 0.72, 0, 1)';
const SKIP_RATE = 3;

const reduce = matchMedia('(prefers-reduced-motion: reduce)');

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('[data-music-page].r4');
  const sash = root?.querySelector<HTMLElement>('[data-r4-sash]');
  const stripes = sash ? [...sash.querySelectorAll<HTMLElement>('[data-r4-stripe]')] : [];
  const inks = sash ? [...sash.querySelectorAll<HTMLElement>('[data-r4-ink]')] : [];
  if (!root || !sash || stripes.length !== 6 || inks.length !== 6) return;

  place(root, sash, stripes, signal);
  // intro.ts runs first (it is imported first) and takes data-intro away at once if there is no show.
  void arrived().then(() => { if (!signal.aborted) lay(root, sash, inks, signal); });

  const audio = islandAudio(SONG);
  const levels = [0, 0, 0, 0, 0, 0];
  let unsubscribe: (() => void) | null = null;
  let out = false; // a record is out of the row

  // `mix` is how much of the song is in the sash: 0 at rest, 1 while it plays. A spring moves it.
  let mix = 0, velocity = 0, last = 0, frame = 0;

  const playing = () => !audio.element.paused && !reduce.matches && !out;

  /** Writes the six stripes for the levels and the mix now. */
  const draw = () => {
    const share = levels.map((l, i) => FLOOR + Math.min(CAP, (l / USUAL[i]!) ** 2));
    const sum = share.reduce((a, b) => a + b, 0);
    const loudness = levels.reduce((a, l, i) => a + Math.min(1.5, l / USUAL[i]!), 0) / 6 / 1.5;
    const span = 6 * (QUIET + (LOUD - QUIET) * loudness);
    // Each stripe's width in stripe widths at rest, eased from 1 by the mix.
    const widths = share.map((s) => 1 + ((s / sum) * span - 1) * mix);
    const total = widths.reduce((a, b) => a + b, 0);
    let x = -total / 2;
    widths.forEach((w, i) => {
      const shift = x - (i - 3); // from where the stripe stands at rest
      stripes[i]!.style.transform = mix === 0 ? '' : `translateX(calc(var(--r4-w) * ${shift.toFixed(4)})) scaleX(${w.toFixed(4)})`;
      x += w;
    });
  };

  const tick = (now: number) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const target = playing() ? 1 : 0;
    const response = target ? RESPONSE_IN : RESPONSE_OUT;
    const k = (2 * Math.PI / response) ** 2;
    velocity += (k * (target - mix) - 2 * Math.sqrt(k) * velocity) * dt;
    mix += velocity * dt;
    const settled = Math.abs(target - mix) < 0.001 && Math.abs(velocity) < 0.001;
    if (settled) { mix = target; velocity = 0; }
    draw();
    if (settled && target === 0) { frame = 0; last = 0; release(); }
    else frame = requestAnimationFrame(tick);
  };
  const wake = () => {
    if (!unsubscribe) unsubscribe = audio.subscribe((next) => { next.forEach((l, i) => { levels[i] = l; }); });
    if (!frame) frame = requestAnimationFrame(tick);
  };
  const release = () => { unsubscribe?.(); unsubscribe = null; };

  audio.element.addEventListener('play', wake, { signal });
  audio.element.addEventListener('pause', wake, { signal }); // to settle back to rest
  reduce.addEventListener('change', wake, { signal });
  root.addEventListener('v4:open', () => { out = true; wake(); }, { signal });
  root.addEventListener('v4:close', () => { out = false; wake(); }, { signal });
  if (playing()) wake();

  signal.addEventListener('abort', () => {
    cancelAnimationFrame(frame);
    frame = 0;
    release();
  });
});

/**
 * Where the sash stands. The CSS puts it right of the centre record; this moves it right as far as it
 * must to keep clear of every word of the copy, wherever the lines happen to break (they break
 * differently from one browser and one screen to the next), with room to spare for the stripes
 * widening while the song plays. On a phone, where the copy runs nearly to the right edge, that is
 * what decides how high up the screen the sash can start, so there it starts from the far left and is
 * pushed only as far as the copy asks.
 *
 * Measured once at the start (before the intro moves the headline about) and again whenever the page
 * changes width; the headline's words are only measured again once the intro has let go of them.
 */
function place(root: HTMLElement, sash: HTMLElement, stripes: HTMLElement[], signal: AbortSignal) {
  const bar = sash.parentElement;
  const sleeve = root.querySelector<HTMLElement>('[data-vinyl]');
  if (!bar || !sleeve) return;
  const TAN = Math.tan((25 * Math.PI) / 180), COS = Math.cos((25 * Math.PI) / 180);
  /** The bottom-right corner of every word in `els`, in page coordinates. */
  const corners = (els: Iterable<Element>) => {
    const out: { r: number; b: number }[] = [];
    for (const el of els) {
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
        for (const m of n.data.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(n, m.index ?? 0);
          range.setEnd(n, (m.index ?? 0) + m[0].length);
          const q = range.getBoundingClientRect();
          if (q.width) out.push({ r: q.right + scrollX, b: q.bottom + scrollY });
        }
      }
    }
    return out;
  };
  const title = () => corners(root.querySelectorAll('.v4-intro__title'));
  let headline = title();
  const update = () => {
    if (!root.hasAttribute('data-intro')) headline = title();
    // The copy below the headline may be 24px low while it comes in (intro.ts): measured as it lays out.
    const copy = corners(root.querySelectorAll('.v4-intro .lede, .v4-shelf__head > *'));
    const box = bar.getBoundingClientRect();
    const foot = parseFloat(getComputedStyle(bar).getPropertyValue('--foot')) || 32;
    const floor = box.bottom + scrollY - foot;
    const centre = box.left + scrollX + box.width / 2;
    const s = sleeve.offsetWidth;
    const w = stripes[0]!.offsetWidth - 1;
    const half = (3 * w) / COS; // half the sash's width, measured level
    const room = 28 + 0.4 * w; // clear space, plus how far the green edge moves out while it plays
    const preferred = innerWidth < 600 ? 0 : 0.3 * s + 0.7 * w;
    let x = preferred;
    for (const { r, b } of [...headline, ...copy]) {
      // The sash's left edge, at the height of the word's foot, must lie `room` right of the word.
      x = Math.max(x, r + room + half - (floor - b) * TAN - centre);
    }
    bar.style.setProperty('--r4-x', `${x.toFixed(1)}px`);
  };
  update();
  const watch = new ResizeObserver(() => update());
  watch.observe(bar);
  watch.observe(root.querySelector('.v4-intro') ?? bar);
  void document.fonts?.ready.then(() => { if (!signal.aborted) update(); });
  // Once the headline is home, measure it where it rests.
  const settled = new MutationObserver(() => { if (!root.hasAttribute('data-intro')) { update(); settled.disconnect(); } });
  settled.observe(root, { attributes: true, attributeFilter: ['data-intro'] });
  signal.addEventListener('abort', () => { watch.disconnect(); settled.disconnect(); });
}

/**
 * The entrance: ink laid down each stripe, from where the stripe enters the page at its top edge to
 * where it stops behind the records. Only in the intro's show (no show, no entrance: the sash is there).
 */
function lay(root: HTMLElement, sash: HTMLElement, inks: HTMLElement[], signal: AbortSignal) {
  if (!root.hasAttribute('data-intro') || reduce.matches) return;
  // How far the ink travels: the stripe's length from the top of the page down to its cut, along the
  // slant (25deg), plus the band's own foot below the cut (a stripe and a half; two, to be sure).
  const cut = sash.getBoundingClientRect().bottom + scrollY;
  const reach = Math.ceil(cut / Math.cos((25 * Math.PI) / 180) + 3 * (inks[0]!.offsetWidth || 0));
  const laying = inks.map((ink, i) => ink.animate(
    [{ transform: `translateY(${-reach}px)` }, { transform: 'translateY(0px)' }],
    { duration: LAY, delay: SETTLE + i * LAY_STAGGER, easing: EASE_DRAWER, fill: 'backwards' },
  ));
  // While it is laid, each ink is only as long as the stripe is on the page, so it can travel its own
  // length and no more; afterwards it is the whole stripe again.
  for (const ink of inks) ink.style.top = `calc(100% - ${reach}px)`;
  const done = () => { for (const ink of inks) ink.style.top = ''; };
  void Promise.all(laying.map((a) => a.finished)).then(done, done);
  sash.classList.add('is-laying'); // shown from now on: the ink waits off the stripes until its turn
  signal.addEventListener('abort', () => laying.forEach((a) => a.cancel()));
  // Whoever reaches for the page during the show gets it sooner, as the headline does (intro.ts).
  const hurry = () => laying.forEach((a) => a.playState === 'running' && a.updatePlaybackRate(SKIP_RATE));
  for (const type of ['pointerdown', 'wheel', 'touchstart', 'keydown'] as const) {
    addEventListener(type, hurry, { once: true, passive: true, signal });
  }
}
