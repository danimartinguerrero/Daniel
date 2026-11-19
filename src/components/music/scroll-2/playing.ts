/**
 * Music, way scroll-2: the pictures after the ring, in use.
 *
 * The necks are strummed once as each comes into view (the strum itself is CSS: playing.css), and
 * strummed again if they come back after leaving the screen, as the home page's pictures replay.
 *
 * The keys and the pads follow the scroll: nothing here keeps time. Where a picture is on the screen
 * says which key of the scale is down, or which pads of a bar of sixteenths are lit and how far each
 * has faded since it was hit. Scrolling back plays it backwards; stopping holds it. Each frame reads
 * the two pictures' places first and then writes opacities only, and only those that changed.
 *
 * With reduced motion nothing is pressed or lit and the strum doesn't play.
 */
import { onPage } from '@/scripts/page';

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/** The bar on the pads: 16 steps, which pads are hit on each. Pads 0–3 are the near row (kick, snare,
    hat, a clap), 4–7 the far row, touched here and there. */
const BAR: number[][] = [
  [0, 2], [], [2], [6], [1, 2], [], [0, 2], [4],
  [0, 2], [], [2, 5], [0], [1, 2], [7], [2, 3], [],
];

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('[data-sc2]');
  if (root) init(root, signal);
});

function init(root: HTMLElement, signal: AbortSignal) {
  const still = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------------------------------------------------------------- the strum */
  const necks = [...root.querySelectorAll<HTMLElement>('[data-sc2-strum]')];
  const strum = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && e.intersectionRatio >= 0.6) e.target.classList.add('is-struck');
      else if (!e.isIntersecting) e.target.classList.remove('is-struck');
    }
  }, { threshold: [0, 0.6] });
  necks.forEach((n) => strum.observe(n));
  signal.addEventListener('abort', () => strum.disconnect());

  /* ---------------------------------------------------------------- keys and pads, from the scroll */
  const keyboard = root.querySelector<HTMLElement>('[data-sc2-keys]')!;
  const keys = [...keyboard.querySelectorAll<HTMLElement>('[data-sc2-key]')]
    .sort((a, b) => Number(a.dataset.sc2Key) - Number(b.dataset.sc2Key))
    .map((el) => ({ down: el.querySelector<HTMLElement>('.sc2-white__down')!, on: el.querySelector<HTMLElement>('.sc2-finger__on')! }));
  const mpk = root.querySelector<HTMLElement>('[data-sc2-pads]')!;
  const pads = [...mpk.querySelectorAll<HTMLElement>('[data-sc2-pad]')].map((el) => ({
    lit: el.querySelector<HTMLElement>('.sc2-pad__lit')!,
    glow: el.querySelector<HTMLElement>('.sc2-pad__glow')!,
  }));

  const written = new Map<HTMLElement, string>();
  const opacity = (el: HTMLElement, v: number) => {
    const s = v < 0.004 ? '0' : v.toFixed(3);
    if (written.get(el) === s) return;
    written.set(el, s);
    el.style.opacity = s;
  };

  /** How far a picture has come up the screen: 0 as its top passes `from` (a share of the screen's
      height from the top), 1 as it passes `to`. */
  const through = (r: DOMRect, from: number, to: number) => clamp((innerHeight * from - r.top) / (innerHeight * (from - to)));

  function draw() {
    frame = 0;
    if (still.matches) return;
    const kr = keyboard.getBoundingClientRect();
    const pr = mpk.getBoundingClientRect();

    // The scale, one key at a time: key i is down through the i-th eighth of the way, with a short
    // overlap either side so one key lifts as the next goes down (legato), and none at either end.
    const along = through(kr, 0.86, 0.32) * (keys.length + 0.6) - 0.3;
    keys.forEach((k, i) => {
      const d = Math.abs(along - (i + 0.5));
      const down = clamp((0.56 - d) / 0.12);
      opacity(k.down, down);
      opacity(k.on, down);
    });

    // The bar on the pads: a pad lights at its step and fades over the next step and a half.
    const step = through(pr, 0.9, 0.2) * BAR.length;
    pads.forEach((p, n) => {
      let light = 0;
      for (let s = 0; s < BAR.length; s++) {
        if (!BAR[s]!.includes(n)) continue;
        const since = step - s;
        if (since >= 0 && since < 1.6) light = Math.max(light, (1 - since / 1.6) ** 1.6);
      }
      opacity(p.lit, light);
      opacity(p.glow, light);
    });
  }

  let frame = 0;
  const ask = () => { if (!frame) frame = requestAnimationFrame(draw); };
  window.addEventListener('scroll', ask, { passive: true, signal });
  window.addEventListener('resize', ask, { signal });
  still.addEventListener('change', () => {
    if (still.matches) {
      for (const el of written.keys()) el.style.opacity = '';
      written.clear();
    }
    ask();
  }, { signal });
  signal.addEventListener('abort', () => cancelAnimationFrame(frame));
  ask();
}
