import { onPage } from '@/scripts/page';
import { FILL_HOLD, clearTextFill, measureFillLine, measureTextFill, paintTextFill, type LitLine } from '../v4/text-fill';
import type { CaseScene } from './scene';

/* The instruments, prototype "Estuche" (CaseStory.astro). Each section's screen is held while its words
   fill, line after line, at the site's one pace (text-fill.ts). In a chapter, over the same stretch:
   while the title fills, the lid lifts; while the story fills, the instrument rises out of its cavity
   and turns its face to you. Scrolling back undoes it in the same order, the same way.

   The lid is also the hand's (Apple, Designing Fluid Interfaces):
   - grab it anywhere on the case (a mouse), or by its front edge (a finger: the rest of the screen still
     scrolls), and its edge stays under the pointer, from where it was grabbed: the opening that puts the
     edge there is found, not guessed from a ratio;
   - past shut or past open it gives, less and less (rubber band); with the instrument out it will not
     shut on it: it gives against it instead;
   - let go, and the release velocity is handed to a spring, and where that velocity would carry the lid
     (Apple's projection) decides open or shut, not where the finger stopped. A flick has momentum, so
     its spring may swing a little (damping .8); a slow release settles without overshoot;
   - it can be caught again mid-swing, from where it is on screen;
   - what the hand chose holds until the scroll arrives at the same place; from there the scroll leads.
   The grip is a button too: Enter or Space opens or shuts it. */

const FOLLOW = .1; // s: how closely the lift follows the scroll, so a wheel's steps glide
const DECELERATION = .998; // Apple's normal deceleration: a lid thrown carries as a page would
const project = (velocity: number) => (velocity / 1000) * DECELERATION / (1 - DECELERATION);
const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const smooth = (t: number) => t * t * (3 - 2 * t);
const rubber = (overshoot: number) => (overshoot * .6 * .55) / (.6 + .55 * Math.abs(overshoot));

interface Spring { damping: number; response: number }
const FOLLOWING: Spring = { damping: 1, response: .34 }; // the lid following the scroll

onPage(signal => {
  const root = document.querySelector<HTMLElement>('[data-case]');
  if (!root) return;
  const allowed = matchMedia('(prefers-reduced-motion: no-preference) and (min-height: 480px) and (min-width: 320px) and (forced-colors: none)');
  const narrow = matchMedia('(max-width: 760px)');
  const hover = matchMedia('(hover: hover) and (pointer: fine)');
  const webgl = (() => {
    try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
  })();

  const sections = [...root.querySelectorAll<HTMLElement>('[data-fill-section]')].map(element => {
    const canvas = element.querySelector<HTMLCanvasElement>('[data-case-scene]');
    const model = element.dataset.model;
    return {
      element,
      stage: element.querySelector<HTMLElement>('[data-fill-stage]')!,
      title: element.querySelector<HTMLElement>('.case__title'),
      texts: [...element.querySelectorAll<HTMLElement>('[data-fill-text]')],
      lines: [] as LitLine[],
      titleLines: 0,
      enabled: false,
      near: false,
      film: model && canvas ? {
        canvas, model,
        paint: element.dataset.paint ?? '', lining: element.dataset.lining ?? '#222', sheen: element.dataset.sheen ?? '#555',
        lip: element.querySelector<HTMLButtonElement>('[data-case-lip]')!,
        scene: null as CaseScene | null,
        loading: false,
        failed: false,
        lid: 0, velocity: 0,
        spring: FOLLOWING,
        override: null as number | null,
        lift: -1,
        lidScroll: 0, liftScroll: 0,
        drag: null as null | { id: number; offset: number; raw: number; moved: boolean; history: { t: number; v: number }[] },
        clicked: false,
        drawn: '',
      } : null,
    };
  });
  type Section = typeof sections[number];
  type Film = NonNullable<Section['film']>;

  let line = 1;
  let stopped = false;

  // One case at a time, each when the page is idle: building one (the model, the outline, the
  // shaders) is a long task, and the next chapter's must not land in the middle of a scroll.
  let building: Promise<unknown> = Promise.resolve();
  const idle = () => new Promise<void>(resolve => {
    const ric = (window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(() => resolve(), { timeout: 1500 });
    else setTimeout(resolve, 200);
  });
  function load(section: Section, film: Film) {
    if (film.loading) return;
    film.loading = true;
    building = building.then(() => build(section, film));
  }
  async function build(section: Section, film: Film) {
    try {
      await idle();
      if (stopped) return;
      const { createCase } = await import('./scene');
      const scene = await createCase(film.canvas, { url: film.model, paint: film.paint, lining: film.lining, sheen: film.sheen });
      if (stopped) return scene.dispose();
      film.scene = scene;
      size(section, film);
      film.drawn = '';
      request();
      // Shown once its first frame is drawn, so the case fades in rather than popping.
      requestAnimationFrame(() => section.element.classList.add('is-ready'));
    } catch (error) {
      console.error('case: no scene', error);
      film.failed = true;
      measure();
    }
  }

  function size(section: Section, film: Film) {
    film.scene?.resize(section.stage.clientWidth, section.stage.clientHeight, Math.min(devicePixelRatio || 1, 2), narrow.matches);
    film.drawn = '';
  }

  function measure() {
    line = measureFillLine(root!);
    for (const section of sections) {
      const film = section.film;
      const hold = (enabled: boolean) => {
        section.element.classList.toggle('statement', enabled);
        section.element.classList.toggle('is-scrubbed', enabled);
      };
      section.enabled = allowed.matches && (!film || (webgl && !film.failed));
      hold(section.enabled);
      if (section.enabled) {
        if (section.title) section.stage.style.setProperty('--title-h', `${section.title.offsetHeight}px`);
        section.lines = section.texts.flatMap(text => measureTextFill(text));
        section.titleLines = section.title?.querySelectorAll('.v4-lit__win').length ?? 0;
        section.element.style.height = `${(section.stage.offsetHeight + (section.lines.length + FILL_HOLD) * line).toFixed(1)}px`;
        if (film) size(section, film);
      } else {
        section.texts.forEach(clearTextFill);
        section.lines = [];
        section.element.style.removeProperty('height');
        section.element.classList.remove('is-ready');
      }
      if (film) film.lip.tabIndex = section.enabled ? 0 : -1;
    }
    request();
  }

  // The lid's spring (Apple's damping ratio and response), from where it is on screen, as fast as it is
  // going. Returns whether it is still moving.
  function step(film: Film, target: number, dt: number) {
    const { damping, response } = film.spring;
    const stiffness = (2 * Math.PI / response) ** 2;
    const friction = 4 * Math.PI * damping / response;
    for (let left = dt; left > 0; left -= 1 / 240) {
      const h = Math.min(left, 1 / 240);
      film.velocity += (-stiffness * (film.lid - target) - friction * film.velocity) * h;
      film.lid += film.velocity * h;
    }
    if (Math.abs(film.lid - target) < .0005 && Math.abs(film.velocity) < .005) {
      film.lid = target;
      film.velocity = 0;
      return false;
    }
    return true;
  }

  // The least the lid may close: with the instrument out of its cavity, it stops short of it.
  const floorOf = (film: Film) => (film.lift > .03 ? .8 : 0);

  let queued = 0;
  let last = 0;
  function tick(now: number) {
    queued = 0;
    const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let moving = false;
    for (const section of sections) {
      if (!section.enabled || !section.near) continue;
      const scrolled = Math.max(0, section.stage.getBoundingClientRect().top - section.element.getBoundingClientRect().top);
      paintTextFill(section.lines, scrolled / line);
      const film = section.film;
      if (!film) continue;
      if (!film.scene) { load(section, film); continue; }
      // The lid opens while the title fills; the instrument lifts while the story does.
      const filled = scrolled / line;
      const titled = Math.max(1, section.titleLines);
      film.lidScroll = smooth(clamp((filled - .15) / (titled + .2)));
      film.liftScroll = clamp((filled - titled - .35) / Math.max(1, section.lines.length - titled - .2));
      // The hand's choice holds until the scroll arrives at it; from there the scroll leads again, with
      // no jump, since both agree.
      if (film.override !== null && Math.abs(film.lidScroll - film.override) < .02) {
        film.override = null;
        film.spring = FOLLOWING;
      }
      if (!film.drag) {
        const target = Math.max(film.override ?? film.lidScroll, floorOf(film));
        if (step(film, target, dt)) moving = true;
      }
      // Out only once the lid is well open, and back in before it can shut.
      const liftTarget = film.lid > .72 ? film.liftScroll : 0;
      if (film.lift < 0) film.lift = liftTarget;
      else film.lift += (liftTarget - film.lift) * (1 - Math.exp(-dt / FOLLOW));
      if (Math.abs(liftTarget - film.lift) < .0004) film.lift = liftTarget;
      else moving = true;
      const key = `${film.lid.toFixed(4)}:${film.lift.toFixed(4)}`;
      if (key !== film.drawn) {
        film.drawn = key;
        film.scene.set(film.lid, film.lift);
        film.scene.render();
        const edge = film.scene.edge(Math.min(film.lid, 1));
        film.lip.style.transform = `translate3d(${edge.x.toFixed(1)}px,${edge.y.toFixed(1)}px,0)`;
        const open = film.lid > .5;
        film.lip.setAttribute('aria-pressed', String(open));
        film.lip.setAttribute('aria-label', (open ? film.lip.dataset.labelShut : film.lip.dataset.labelOpen) ?? '');
      }
    }
    if (moving) queued = requestAnimationFrame(tick);
    else last = 0;
  }
  function request() { if (!queued) queued = requestAnimationFrame(tick); }

  // The hand.
  for (const section of sections) {
    const film = section.film;
    if (!film) continue;
    const { canvas, lip } = film;
    const local = (event: PointerEvent) => {
      const box = section.stage.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };
    const begin = (event: PointerEvent, target: HTMLElement) => {
      if (!film.scene || film.drag || event.button > 0) return false; // one finger at a time
      const { y } = local(event);
      // Caught mid-swing: from where it is on screen, its velocity dropped.
      film.velocity = 0;
      const offset = y - film.scene.edge(film.lid).y;
      film.drag = { id: event.pointerId, offset, raw: film.lid, moved: false, history: [{ t: event.timeStamp, v: film.lid }] };
      target.setPointerCapture(event.pointerId);
      section.element.classList.add('is-lifting');
      return true;
    };
    const move = (event: PointerEvent) => {
      const drag = film.drag;
      if (!drag || event.pointerId !== drag.id || !film.scene) return;
      const { y } = local(event);
      const wanted = y - drag.offset;
      // The opening that puts the edge under the pointer, searched near where it is, so it stays on the
      // same side of upright.
      let best = drag.raw, error = Infinity;
      for (let r = drag.raw - .25; r <= drag.raw + .25; r += .004) {
        const value = Math.min(1.45, Math.max(-.45, r));
        const miss = Math.abs(film.scene.edge(value).y - wanted);
        if (miss < error) { error = miss; best = value; }
      }
      if (Math.abs(best - drag.raw) > .002) drag.moved = true;
      drag.raw = best;
      const low = floorOf(film);
      film.lid = best > 1 ? 1 + rubber(best - 1) : best < low ? low - rubber(low - best) : best;
      drag.history.push({ t: event.timeStamp, v: film.lid });
      while (drag.history.length > 2 && event.timeStamp - drag.history[0]!.t > 100) drag.history.shift();
      request();
    };
    const end = (event: PointerEvent, cancelled: boolean) => {
      const drag = film.drag;
      if (!drag || event.pointerId !== drag.id) return;
      film.drag = null;
      section.element.classList.remove('is-lifting');
      film.clicked = !drag.moved;
      if (!drag.moved) { request(); return; }
      const first = drag.history[0]!, newest = drag.history[drag.history.length - 1]!;
      const span = (newest.t - first.t) / 1000;
      const fresh = event.timeStamp - newest.t < 60;
      const velocity = !cancelled && fresh && span > .008 ? (newest.v - first.v) / span : 0;
      const projected = film.lid + project(velocity);
      film.override = Math.max(projected > .5 ? 1 : 0, floorOf(film) > 0 ? 1 : 0);
      film.velocity = velocity;
      film.spring = Math.abs(velocity) > 1.2 ? { damping: .8, response: .42 } : { damping: 1, response: .36 };
      request();
    };
    canvas.addEventListener('pointerdown', event => {
      // A mouse lifts the lid from anywhere on the case; a finger from its edge (the grip), so a swipe
      // across the case still scrolls the page.
      if (event.pointerType !== 'mouse' || !film.scene) return;
      const { x, y } = local(event);
      if (film.scene.onLid(x, y)) begin(event, canvas);
    }, { signal });
    lip.addEventListener('pointerdown', event => { begin(event, lip); }, { signal });
    for (const target of [canvas, lip]) {
      target.addEventListener('pointermove', move, { signal });
      target.addEventListener('pointerup', event => end(event, false), { signal });
      target.addEventListener('pointercancel', event => end(event, true), { signal });
      target.addEventListener('lostpointercapture', event => end(event, true), { signal });
    }
    // A press without a drag, or Enter or Space: open it, or shut it.
    lip.addEventListener('click', event => {
      if (event.detail > 0 && !film.clicked) return; // the end of a drag, not a press
      film.clicked = false;
      const open = film.lid > .5;
      film.override = open && floorOf(film) === 0 ? 0 : 1;
      film.spring = { damping: 1, response: .42 };
      request();
    }, { signal });
    // Over the case, the pointer says it can be lifted.
    let hovering = 0;
    canvas.addEventListener('pointermove', event => {
      if (!hover.matches || event.pointerType !== 'mouse' || film.drag || hovering) return;
      hovering = requestAnimationFrame(() => {
        hovering = 0;
        if (!film.scene) return;
        const { x, y } = local(event);
        canvas.classList.toggle('is-over', film.scene.onLid(x, y));
      });
    }, { signal });
  }

  const near = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const section = sections.find(item => item.element === entry.target)!;
      section.near = entry.isIntersecting;
    }
    request();
  }, { rootMargin: '300% 0px' });
  for (const section of sections) near.observe(section.element);

  // A phone's toolbar coming and going resizes the window but not the held screen (svh): measured again
  // only for a window that really changed.
  let current = '';
  function resized() {
    const now = `${innerWidth}x${sections[0]?.stage.offsetHeight}`;
    if (now === current) return request();
    current = now;
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
    for (const { film } of sections) film?.scene?.dispose();
  });
});
