import { onPage } from '@/scripts/page';
import { clamp, Spring } from '../v4/physics';
import { FILL_HOLD, clearTextFill, measureFillLine, measureTextFill, paintTextFill, type LitLine } from '../v4/text-fill';

const ease = (n: number) => {
  const t = clamp(n, 0, 1);
  return t * t * (3 - 2 * t);
};

/* The held scroll, 0 to 1: the story lights up, the window arrives, the notes are drawn, the velocities rise. */
const ARRIVE = { start: .12, each: .16 };
const WRITE = { start: .3, sweep: .42, each: .06 };
const STEMS = { start: .78, sweep: .09, each: .08 };

onPage(signal => {
  const section = document.querySelector<HTMLElement>('[data-studio]');
  if (!section) return;
  const stage = section.querySelector<HTMLElement>('.studio__stage')!;
  const passages = [...section.querySelectorAll<HTMLElement>('[data-fill-text]')];
  const fl = section.querySelector<HTMLElement>('[data-fl]')!;
  const startOf = (el: HTMLElement, { start, sweep }: { start: number; sweep: number }) =>
    start + Number(el.dataset.step) / 32 * sweep;
  const notes = [...section.querySelectorAll<HTMLElement>('.note')].map(el => ({
    el, key: el.dataset.key!, start: startOf(el, WRITE), k: 1, shown: -1,
  }));
  const keys = [...section.querySelectorAll<HTMLElement>('.fl__keys [data-key]')]
    .map(el => ({ el, notes: notes.filter(note => note.key === el.dataset.key), down: false }))
    .filter(key => key.notes.length);
  const stems = [...section.querySelectorAll<HTMLElement>('.vel')].map(el => ({
    el, stem: el.querySelector<HTMLElement>('.vel__stem')!, head: el.querySelector<HTMLElement>('.vel__head')!,
    start: startOf(el, STEMS), height: 0, shown: -1,
  }));
  const motion = matchMedia('(prefers-reduced-motion: no-preference) and (min-height: 580px) and (forced-colors: none)');
  const progress = new Spring(0, { response: .19, damping: 1 }, .0002);
  let lines: LitLine[] = [];
  let lineDistance = 1;
  let nearby = false;
  let frame = 0;
  let lastFrame = 0;
  let travel = 0;
  let lead = 0;

  function measure() {
    if (motion.matches) {
      lines = passages.flatMap(measureTextFill);
      lineDistance = measureFillLine(stage);
      section!.style.setProperty('--studio-fill-travel', `${(lines.length + FILL_HOLD) * lineDistance}px`);
    } else {
      passages.forEach(clearTextFill);
      lines = [];
      section!.style.removeProperty('--studio-fill-travel');
    }
    travel = section!.offsetHeight - stage.offsetHeight;
    lead = Math.min(innerHeight * .66, stage.offsetHeight * .66);
    for (const stem of stems) {
      stem.height = stem.el.offsetHeight;
      stem.shown = -1;
    }
  }

  function readProgress() {
    return clamp((lead - section!.getBoundingClientRect().top) / Math.max(1, lead + travel), 0, 1);
  }

  function paint(p: number) {
    // The roll starts arriving on approach. The text starts filling when the stage pins.
    const pinnedScroll = p * (lead + travel) - lead;
    paintTextFill(lines, pinnedScroll / lineDistance);
    // The window arrives as a thing: a little smaller and lower, growing into its place as it fades in.
    const here = ease((p - ARRIVE.start) / ARRIVE.each);
    fl.style.opacity = String(here);
    fl.style.transform = here >= 1 ? '' : `translate3d(0,${((1 - here) * 28).toFixed(2)}px,0) scale(${(.955 + .045 * here).toFixed(4)})`;
    // Each note is drawn from its left edge, like dragging the pencil out to its length.
    for (const note of notes) {
      const k = note.k = Math.round(ease((p - note.start) / WRITE.each) * 1000) / 1000;
      if (k === note.shown) continue;
      note.shown = k;
      note.el.style.clipPath = k >= 1 ? '' : `inset(-2px ${((1 - k) * 100).toFixed(1)}% -2px -2px)`;
      note.el.style.visibility = k > 0 ? '' : 'hidden';
    }
    // While a note is being drawn its key is held down, as the piano roll previews it.
    for (const key of keys) {
      const down = key.notes.some(note => note.k > 0 && note.k < 1);
      if (down !== key.down) key.el.classList.toggle('is-down', key.down = down);
    }
    // Then each note's velocity rises from the floor of the editor, in the order the notes were written.
    for (const stem of stems) {
      const k = Math.round(ease((p - stem.start) / STEMS.each) * 1000) / 1000;
      if (k === stem.shown) continue;
      stem.shown = k;
      stem.el.style.opacity = k > 0 ? '' : '0';
      stem.stem.style.transform = k >= 1 ? '' : `scaleY(${k})`;
      stem.head.style.transform = k >= 1 ? '' : `translate3d(0,${((1 - k) * stem.height).toFixed(2)}px,0)`;
    }
  }

  function tick(now: number) {
    frame = 0;
    const dt = lastFrame ? Math.min(.05, (now - lastFrame) / 1000) : 1 / 60;
    lastFrame = now;
    progress.to(readProgress());
    const settled = progress.step(dt);
    paint(progress.value);
    if (!settled) frame = requestAnimationFrame(tick);
    else lastFrame = 0;
  }

  function scroll() {
    if (motion.matches && nearby && !frame) frame = requestAnimationFrame(tick);
  }

  function reset() {
    cancelAnimationFrame(frame);
    frame = lastFrame = 0;
    section!.toggleAttribute('data-held', motion.matches);
    measure();
    progress.set(motion.matches ? readProgress() : 1);
    paint(progress.value);
  }

  const visibility = new IntersectionObserver(([entry]) => {
    nearby = !!entry?.isIntersecting;
    if (nearby && motion.matches) reset();
  }, { rootMargin: '30% 0px' });
  const resize = new ResizeObserver(reset);
  visibility.observe(section);
  resize.observe(stage);
  reset();
  void document.fonts.ready.then(() => { if (!signal.aborted) reset(); });
  // A direct link lands before the record shelf and instruments measure their
  // scroll distances. Realign once their first layout and font pass are done.
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (location.hash === '#fl-studio' && navigation?.type !== 'back_forward') {
    let moved = false;
    const keepPosition = () => { moved = true; };
    for (const event of ['wheel', 'touchstart', 'keydown', 'pointerdown']) {
      window.addEventListener(event, keepPosition, { once: true, passive: true, signal });
    }
    const land = async () => {
      await document.fonts.ready;
      requestAnimationFrame(() => {
        if (!moved && !signal.aborted && location.hash === '#fl-studio') {
          window.scrollTo({ top: scrollY + section.getBoundingClientRect().top, behavior: 'instant' });
        }
      });
    };
    if (document.readyState === 'complete') void land();
    else window.addEventListener('load', land, { once: true, signal });
  }
  window.addEventListener('scroll', scroll, { passive: true, signal });
  motion.addEventListener('change', reset, { signal });
  signal.addEventListener('abort', () => {
    visibility.disconnect();
    resize.disconnect();
    cancelAnimationFrame(frame);
    passages.forEach(clearTextFill);
  }, { once: true });
});
