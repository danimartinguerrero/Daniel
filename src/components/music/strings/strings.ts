import { onPage } from '@/scripts/page';
import { FILL_HOLD, clearTextFill, measureFillLine, measureTextFill, paintTextFill, type LitLine } from '../v4/text-fill';

/* The instruments (StringStory.astro). Each section's screen is held while its words fill, line after
   line, at the site's one pace (text-fill.ts): the section is as tall as its lines need. In a chapter
   the instrument comes from lying under the words, large and dim, to standing upright at the right,
   over the same stretch of scroll. Scroll sets a target. Between wheel or touch updates the turn,
   position, scale and brightness follow it together at the display's refresh rate. */

import type { Instrument } from './instrument';

interface Pose { x: number; y: number; size: number; opacity: number }
// Two short smoothing stages round off both the step and the sudden change of speed at a wheel tick.
const RESPONSE_MS = 42;
const SETTLED = 0.0001;
const smooth = (t: number) => t * t * (3 - 2 * t);

onPage(signal => {
  const root = document.querySelector<HTMLElement>('[data-strings]');
  if (!root) return;
  const allowed = matchMedia('(prefers-reduced-motion: no-preference) and (min-height: 500px) and (min-width: 320px) and (forced-colors: none)');
  const narrow = matchMedia('(max-width: 760px)');
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  const sections = [...root.querySelectorAll<HTMLElement>('[data-fill-section]')].map(element => {
    const canvas = element.querySelector('canvas');
    const model = element.dataset.model;
    return {
      element,
      stage: element.querySelector<HTMLElement>('[data-fill-stage]')!,
      copy: element.querySelector<HTMLElement>('.strings__copy'),
      texts: [...element.querySelectorAll<HTMLElement>('[data-fill-text]')],
      lines: [] as LitLine[],
      enabled: false,
      near: false,
      film: model && canvas ? {
        model, canvas,
        paint: element.dataset.paint ?? '',
        art: element.querySelector<HTMLElement>('.strings__art')!,
        mover: element.querySelector<HTMLElement>('.strings__mover')!,
        instrument: null as Instrument | null,
        loading: false,
        failed: false,
        from: { x: 0, y: 0, size: 1, opacity: 1 } as Pose,
        to: { x: 0, y: 0, size: 1, opacity: 1 } as Pose,
        target: 0,
        filtered: 0,
        shown: 0,
        visible: false,
      } : null,
    };
  });
  type Section = typeof sections[number];
  type Film = NonNullable<Section['film']>;

  let line = 1;
  let stopped = false;
  const ratio = () => Math.min(devicePixelRatio || 1, 2);
  // Allocate once for the enlarged entrance too, so the strings don't become upscaled pixels.
  // Keep full resolution at rest; cap the additional detail for the moving close-up.
  const canvasPixels = (film: Film) => Math.ceil(Math.max(
    film.to.size * ratio(), Math.min(2048, film.from.size * ratio()),
  ));


  /* ---- the instrument */
  // Both scenes are set up as soon as the part comes near, one after the other while the browser is
  // idle, and drawn once at once, so that loading, compiling and uploading them never lands in the
  // middle of a scroll through the chapter before.
  const idle = (run: () => void) => 'requestIdleCallback' in window ? requestIdleCallback(run, { timeout: 1200 }) : setTimeout(run, 60);
  let preparing = false;
  function prepare() {
    if (preparing) return;
    const films = sections.flatMap(({ enabled, film }) => enabled && film && !film.loading ? [film] : []);
    if (!films.length) return;
    preparing = true;
    const next = () => {
      const film = films.shift();
      if (!film || stopped) { preparing = false; return; }
      idle(() => load(film).finally(next));
    };
    next();
  }
  async function load(film: Film) {
    if (film.loading || film.instrument || film.failed) return;
    film.loading = true;
    if (saveData) return flat(film);
    try {
      const { createInstrument } = await import('./instrument');
      const instrument = await createInstrument(film.canvas, film.model, film.paint);
      if (stopped) return instrument.dispose();
      film.instrument = instrument;
      instrument.resize(canvasPixels(film), 1);
      instrument.pose(film.shown);
      film.art.classList.add('is-ready');
      request();
    } catch {
      flat(film);
    }
  }
  // No WebGL (or no data to spare): the upright still where the instrument would stand, moved the same way.
  function flat(film: Film) {
    film.failed = true;
    film.art.classList.add('is-flat', 'is-ready');
    request();
  }

  /* ---- where it stands */
  // It ends upright, its length 82% of the screen's height, in the right half (under the words, in
  // what is left of a phone's screen); it starts lying under the words, larger and dim. The view of it
  // is the instrument's length and a tenth, square.
  function place(section: Section, film: Film) {
    const width = section.stage.clientWidth;
    const height = section.stage.clientHeight;
    let to: Pose, from: Pose;
    if (narrow.matches) {
      const top = section.copy!.getBoundingClientRect().bottom - section.stage.getBoundingClientRect().top + 8;
      const band = Math.max(1, height - top - 12);
      to = { x: width * .6, y: top + band / 2, size: band * 1.1, opacity: 1 };
      from = { x: width / 2, y: top + band * .42, size: width * 1.12, opacity: .42 };
    } else {
      to = { x: width * .745, y: height * .52, size: height * .82 * 1.1, opacity: 1 };
      // Low enough that the neck passes under the words, not through them.
      from = { x: width * .55, y: height * .75, size: Math.min(width * .8, height * 2.1) * 1.1, opacity: .34 };
    }
    film.to = to;
    film.from = from;
    const style = film.mover.style;
    style.width = style.height = `${to.size.toFixed(1)}px`;
    style.left = `${(to.x - to.size / 2).toFixed(1)}px`;
    style.top = `${(to.y - to.size / 2).toFixed(1)}px`;
    film.instrument?.resize(canvasPixels(film), 1);
  }
  function at(film: Film, progress: number) {
    const { from, to } = film;
    const x = from.x + (to.x - from.x) * progress - to.x;
    const y = from.y + (to.y - from.y) * progress - to.y;
    const scale = (from.size + (to.size - from.size) * progress) / to.size;
    return {
      transform: `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) scale(${scale.toFixed(4)})`,
      opacity: (from.opacity + (to.opacity - from.opacity) * progress).toFixed(3),
    };
  }
  // Exact time-based response of two successive low-pass filters. A 120 Hz display gets twice as
  // many intermediate poses as a 60 Hz display, with the same travel time.
  function draw(film: Film, elapsed: number) {
    const previous = film.filtered;
    const t = elapsed / RESPONSE_MS;
    const decay = Math.exp(-t);
    film.filtered = film.target + (previous - film.target) * decay;
    film.shown = film.target + (film.shown - film.target + (previous - film.target) * t) * decay;
    const moving = Math.max(Math.abs(film.filtered - film.target), Math.abs(film.shown - film.target)) > SETTLED;
    if (!moving || !film.visible) film.shown = film.filtered = film.target;
    const { transform, opacity } = at(film, film.shown);
    film.mover.style.transform = transform;
    film.mover.style.opacity = opacity;
    film.instrument?.pose(film.shown);
    return moving && film.visible;
  }

  /* ---- the held screens */
  function measure() {
    line = measureFillLine(root!);
    for (const section of sections) {
      const hold = (enabled: boolean) => {
        section.element.classList.toggle('statement', enabled);
        section.element.classList.toggle('is-scrubbed', enabled);
      };
      hold(allowed.matches);
      section.enabled = allowed.matches && (!section.copy ||
        section.copy.offsetHeight <= section.stage.offsetHeight * (narrow.matches ? .58 : .7));
      hold(section.enabled);
      if (section.enabled) {
        section.lines = section.texts.flatMap(text => measureTextFill(text));
        section.element.style.height = `${(section.stage.offsetHeight + (section.lines.length + FILL_HOLD) * line).toFixed(1)}px`;
        if (section.film) place(section, section.film);
      } else {
        section.texts.forEach(clearTextFill);
        section.lines = [];
        section.element.style.removeProperty('height');
        if (section.film) {
          section.film.visible = false;
          section.film.mover.removeAttribute('style');
        }
      }
    }
    if (sections.some(section => section.near && section.enabled)) prepare();
    request();
  }

  let queued = 0;
  let dirty = true;
  let lastFrame = 0;
  function tick(now: number) {
    queued = 0;
    let moving = false;
    const elapsed = Math.max(0, now - lastFrame);
    for (const section of sections) {
      if (!section.enabled || !section.near) continue;
      const film = section.film;
      if (dirty) {
        const rect = section.element.getBoundingClientRect();
        const scrolled = Math.max(0, section.stage.getBoundingClientRect().top - rect.top);
        paintTextFill(section.lines, scrolled / line);
        if (!film) continue;
        film.target = smooth(Math.min(1, scrolled / (Math.max(1, section.lines.length) * line)));
        // Arrive at the correct pose after a deep link or a jump across chapters.
        if (!film.visible) film.shown = film.filtered = film.target;
        film.visible = rect.bottom > 0 && rect.top < innerHeight;
      }
      if (film && (dirty || film.visible) && draw(film, elapsed)) moving = true;
    }
    dirty = false;
    lastFrame = now;
    if (moving) queued = requestAnimationFrame(tick);
    else lastFrame = 0;
  }
  function request() {
    dirty = true;
    if (queued || stopped) return;
    if (!lastFrame) lastFrame = performance.now();
    queued = requestAnimationFrame(tick);
  }

  const near = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const section = sections.find(item => item.element === entry.target)!;
      section.near = entry.isIntersecting;
      if (section.near) prepare();
      else if (section.film) section.film.visible = false;
    }
    request();
  }, { rootMargin: '150% 0px' });
  for (const section of sections) near.observe(section.element);

  // A phone's toolbar coming and going resizes the window but not the held screen (svh): measured again
  // only for a window that really changed, so nothing is rebuilt mid-scroll.
  let size = '';
  function resized() {
    const now = `${innerWidth}x${sections[0]?.stage.offsetHeight}`;
    if (now === size) return request();
    size = now;
    measure();
  }
  resized();
  document.fonts.ready.then(() => { if (!signal.aborted) measure(); });
  window.addEventListener('scroll', request, { passive: true, signal });
  window.addEventListener('resize', resized, { passive: true, signal });
  allowed.addEventListener('change', measure, { signal });
  signal.addEventListener('abort', () => {
    stopped = true;
    cancelAnimationFrame(queued);
    near.disconnect();
    for (const { film } of sections) {
      if (!film) continue;
      film.instrument?.dispose();
    }
  });
});
