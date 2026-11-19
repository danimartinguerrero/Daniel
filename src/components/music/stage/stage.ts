import { onPage } from '@/scripts/page';
import { FILL_HOLD, clearTextFill, measureFillLine, measureTextFill, paintTextFill, type LitLine } from '../v4/text-fill';
import type { Instrument, Levels } from './instrument';

/* The instruments, prototype "Stage" (StageStory.astro). Each section's screen is held while its words
   fill, line after line, at the site's one pace (text-fill.ts). In a chapter the stage follows the words
   like a lighting desk follows a show, beat by beat (the beats are the chapter's four passages):

     title       the room dark, the instrument small at the back of the stage, only its outline lit
     first line  the spot comes on, the haze lights up in it, the camera comes in to the instrument
     left        the light swings onto the left side and the instrument turns towards it
     right       the light swings across to the right, the instrument turns with it
     held        it faces you, the floor's pool comes up and its reflection appears in it

   The instrument is drawn live with WebGL (instrument.ts) on a clear canvas; the light around it is
   CSS gradients brought up with opacity; its reflection is the WebGL frame drawn again into a second
   canvas, upside down about its foot. Everything follows the scroll a little behind (FOLLOW), so a
   wheel's steps glide.

   Once lit, it is the hand's (Apple, Designing Fluid Interfaces): a sideways drag turns it 1:1, from
   where it was grabbed, even mid-spin; on release the drag's velocity goes to a spring, and the rest is
   chosen from where that velocity projects it, always a whole turn, so it settles facing you. */

const FOLLOW = 0.07; // s
const DECELERATION = 0.998; // Apple's normal scroll deceleration, for projecting a flick
const LAYERS = ['haze', 'beam', 'left', 'right', 'floor', 'pool'] as const;
type Layer = typeof LAYERS[number];

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const part = (v: number, from: number, to: number) => smooth(clamp((v - from) / Math.max(1e-6, to - from)));
const project = (velocity: number) => (velocity / 1000) * DECELERATION / (1 - DECELERATION);
const wrap = (angle: number) => ((angle % 360) + 360) % 360;

onPage(signal => {
  const root = document.querySelector<HTMLElement>('[data-st]');
  if (!root) return;
  const allowed = matchMedia('(prefers-reduced-motion: no-preference) and (min-height: 480px) and (min-width: 320px) and (forced-colors: none)');
  const narrow = matchMedia('(max-width: 760px)');

  const sections = [...root.querySelectorAll<HTMLElement>('[data-fill-section]')].map(element => {
    const canvas = element.querySelector<HTMLCanvasElement>('.st__frame');
    const model = element.dataset.model;
    return {
      element,
      stage: element.querySelector<HTMLElement>('[data-fill-stage]')!,
      texts: [...element.querySelectorAll<HTMLElement>('[data-fill-text]')],
      lines: [] as LitLine[],
      beats: [] as number[], // where each passage starts, in lines; the last is where they all end
      enabled: false,
      near: false,
      film: model && canvas ? {
        model, canvas,
        paint: element.dataset.paint ?? '',
        light: element.dataset.light ?? '#ffffff',
        art: element.querySelector<HTMLElement>('[data-st-art]')!,
        head: element.querySelector<HTMLElement>('.st__head')!,
        left: element.querySelector<HTMLElement>('[data-st-side="left"]')!,
        right: element.querySelector<HTMLElement>('[data-st-side="right"]')!,
        mirror: element.querySelector<HTMLCanvasElement>('.st__mirror')!,
        reflection: null as CanvasRenderingContext2D | null,
        layers: Object.fromEntries(LAYERS.map(name => [name, element.querySelector<HTMLElement>(`[data-st-layer="${name}"]`)!])) as Record<Layer, HTMLElement>,
        grab: element.querySelector<HTMLElement>('[data-st-grab]')!,
        instrument: null as Instrument | null,
        loading: false,
        size: 0, // css px of the canvas
        target: 0, // lines filled, where the scroll is
        shown: -1, // lines filled, where the stage is, following it
        lit: false,
        // The hand's turn, in degrees, on top of the show's: where it is, how fast, where it rests.
        angle: 0, velocity: 0, rest: 0,
        spring: null as null | { damping: number; response: number },
        drag: null as null | { id: number; x: number; y: number; from: number; decided: boolean; history: { t: number; x: number }[] },
        perPixel: .5,
      } : null,
    };
  });
  type Section = typeof sections[number];
  type Film = NonNullable<Section['film']>;

  let line = 1;
  let stopped = false;

  async function load(film: Film) {
    if (film.loading) return;
    film.loading = true;
    try {
      const { createInstrument } = await import('./instrument');
      const instrument = await createInstrument(film.canvas, film.model, film.paint, film.light);
      if (stopped) return instrument.dispose();
      film.instrument = instrument;
      instrument.resize(film.size, Math.min(devicePixelRatio || 1, 2));
      request();
    } catch {
      film.loading = false;
    }
  }

  // The stage on this screen: the instrument stands at the centre, from under the first sentence down
  // to the floor (on a phone, clear of the dock); its frame, square, is its length and a tenth. The
  // sentences either side stand by the upper neck, clear of the body, as wide as the room there allows.
  function place(section: Section, film: Film) {
    const width = section.stage.clientWidth;
    const height = section.stage.clientHeight;
    const stageTop = section.stage.getBoundingClientRect().top;
    const below = film.head.getBoundingClientRect().bottom - stageTop;
    const foot = narrow.matches ? height - 86 : height * .91;
    const top = below + (narrow.matches ? 14 : Math.max(18, height * .03));
    const len = Math.max(80, foot - top);
    const x = width / 2;
    const size = len * 1.1;
    const margin = len * .05;
    film.size = size;
    film.perPixel = 360 / Math.max(420, len * 1.1);
    const art = film.art.style;
    art.setProperty('--x', `${x}px`);
    art.setProperty('--top', `${top}px`);
    art.setProperty('--foot', `${foot}px`);
    art.setProperty('--len', `${len}px`);
    for (const canvas of [film.canvas, film.mirror]) {
      const style = canvas.style;
      style.width = style.height = `${size.toFixed(1)}px`;
      style.left = `${(x - size / 2).toFixed(1)}px`;
      style.top = `${(top - margin).toFixed(1)}px`;
    }
    const fold = ((size - margin) / size * 100).toFixed(2);
    film.canvas.style.transformOrigin = `50% ${fold}%`;
    film.mirror.style.setProperty('--fold', `${fold}%`);
    film.mirror.width = film.mirror.height = Math.round(size);
    film.reflection = film.mirror.getContext('2d');
    const grab = film.grab.style;
    grab.width = `${(len * .36).toFixed(1)}px`; grab.height = `${len.toFixed(1)}px`;
    grab.left = `${(x - len * .18).toFixed(1)}px`; grab.top = `${top.toFixed(1)}px`;
    // The sentences by the neck.
    const gap = Math.max(narrow.matches ? 20 : 34, len * .075);
    const gutter = parseFloat(getComputedStyle(film.head).left) || 16;
    const room = x - gap - gutter;
    const measure = narrow.matches ? room : Math.min(room, 22 * parseFloat(getComputedStyle(film.left).fontSize));
    for (const [side, element] of [['left', film.left], ['right', film.right]] as const) {
      const style = element.style;
      style.width = `${measure.toFixed(1)}px`;
      style.left = side === 'left' ? `${(x - gap - measure).toFixed(1)}px` : `${(x + gap).toFixed(1)}px`;
    }
    const tallest = Math.max(film.left.offsetHeight, film.right.offsetHeight);
    const middle = top + len * (narrow.matches ? .3 : .28);
    const sideTop = Math.max(below + 12, middle - tallest / 2);
    film.left.style.top = film.right.style.top = `${sideTop.toFixed(1)}px`;
    film.instrument?.resize(size, Math.min(devicePixelRatio || 1, 2));
    film.shown = -1;
  }

  function measure() {
    line = measureFillLine(root!);
    for (const section of sections) {
      const hold = (enabled: boolean) => {
        section.element.classList.toggle('statement', enabled);
        section.element.classList.toggle('is-scrubbed', enabled);
      };
      section.enabled = allowed.matches;
      hold(section.enabled);
      if (section.enabled) {
        if (section.film) place(section, section.film);
        section.beats = [0];
        section.lines = section.texts.flatMap(text => {
          const lines = measureTextFill(text);
          section.beats.push(section.beats[section.beats.length - 1]! + lines.length);
          return lines;
        });
        section.element.style.height = `${(section.stage.offsetHeight + (section.lines.length + FILL_HOLD) * line).toFixed(1)}px`;
      } else {
        section.texts.forEach(clearTextFill);
        section.lines = [];
        section.element.style.removeProperty('height');
        if (section.film) light(section.film, false);
      }
    }
    request();
  }

  function light(film: Film, lit: boolean) {
    if (lit === film.lit) return;
    film.lit = lit;
    const section = film.canvas.closest<HTMLElement>('[data-fill-section]')!;
    section.classList.toggle('is-lit', lit);
    film.grab.tabIndex = lit ? 0 : -1;
    if (!lit) {
      film.drag = null;
      section.classList.remove('is-turning');
      if (film.angle !== 0) {
        film.rest = Math.round(film.angle / 360) * 360;
        film.spring = { damping: 1, response: .35 };
      }
    }
  }

  // The show at `filled` lines: how bright each light is, how far in the camera is, which way the
  // instrument faces.
  function show(section: Section, film: Film, filled: number) {
    const [b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0] = section.beats;
    const t0 = part(filled, b0, b1); // the title
    const t1 = part(filled, b1, b2); // the first sentence
    const t2 = part(filled, b2, b3); // the left sentence
    const t3 = part(filled, b3, b4); // the right sentence
    const th = part(filled, b4 - .25, b4 + FILL_HOLD * .5); // held
    const base = .07 + .4 * t0 + .13 * t1;
    const levels: Levels = {
      left: base + .55 * t2 - .32 * t3 + .17 * th,
      right: base + .62 * t3 - .22 * th,
      key: .92 * t1 + .08 * th,
      fill: .3 * t1 + .3 * t2 + .4 * th,
    };
    const opacity: Record<Layer, number> = {
      haze: .14 * t0 + .62 * t1 + .24 * th,
      beam: t1,
      left: clamp(t2 - .62 * t3) * (1 - .3 * th),
      right: clamp(t3 - .55 * th),
      floor: .35 * t1 + .35 * t3 + .3 * th,
      pool: .45 * t1 + .55 * th,
    };
    for (const name of LAYERS) film.layers[name].style.opacity = opacity[name].toFixed(3);
    // In from the back of the stage as the spot comes on, about its foot so it stays on the floor.
    const scale = .72 + .28 * t1;
    film.canvas.style.transform = `scale(${scale.toFixed(4)})`;
    film.mirror.style.transform = `scale(${scale.toFixed(4)}) scaleY(-.86)`;
    film.mirror.style.opacity = (.62 * (.3 * t1 + .7 * th)).toFixed(3);
    // Turned to the side being read, then back to you.
    const turn = -24 * t2 + 48 * t3 - 24 * th;
    light(film, th > .5);
    if (film.instrument?.draw(turn + film.angle, levels) && film.reflection) {
      const reflection = film.reflection;
      reflection.clearRect(0, 0, film.mirror.width, film.mirror.height);
      reflection.drawImage(film.canvas, 0, 0, film.mirror.width, film.mirror.height);
    }
  }

  function stepSpring(film: Film, dt: number) {
    const spring = film.spring;
    if (!spring) return false;
    const stiffness = (2 * Math.PI / spring.response) ** 2;
    const friction = 4 * Math.PI * spring.damping / spring.response;
    for (let left = dt; left > 0; left -= 1 / 240) {
      const h = Math.min(left, 1 / 240);
      film.velocity += (-stiffness * (film.angle - film.rest) - friction * film.velocity) * h;
      film.angle += film.velocity * h;
    }
    if (Math.abs(film.angle - film.rest) < .05 && Math.abs(film.velocity) < 2) {
      film.spring = null;
      film.velocity = 0;
      film.angle = wrap(film.rest) < .001 || wrap(film.rest) > 359.999 ? 0 : film.rest;
      film.rest = film.angle;
    }
    return true;
  }
  function announce(film: Film) {
    const angle = Math.round(wrap(film.angle)) % 360;
    film.grab.setAttribute('aria-valuenow', String(angle));
    const side = angle < 30 || angle > 330 ? 'Facing you' : angle > 150 && angle < 210 ? 'From the back' : 'From the side';
    if (film.grab.getAttribute('aria-valuetext') !== side) film.grab.setAttribute('aria-valuetext', side);
  }

  let queued = 0;
  let last = 0;
  function tick(now: number) {
    queued = 0;
    const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let moving = false;
    for (const section of sections) {
      if (!section.enabled || !section.near) continue;
      // How far the page has scrolled since the screen was held: the stage stays, the section moves on.
      const scrolled = Math.max(0, section.stage.getBoundingClientRect().top - section.element.getBoundingClientRect().top);
      paintTextFill(section.lines, scrolled / line);
      const film = section.film;
      if (!film) continue;
      load(film);
      film.target = scrolled / line;
      if (film.shown < 0) film.shown = film.target;
      else film.shown += (film.target - film.shown) * (1 - Math.exp(-dt / FOLLOW));
      if (Math.abs(film.target - film.shown) < .002) film.shown = film.target;
      else moving = true;
      if (stepSpring(film, dt)) moving = true;
      show(section, film, film.shown);
      announce(film);
    }
    if (moving) queued = requestAnimationFrame(tick);
    else last = 0;
  }
  function request() { if (!queued) queued = requestAnimationFrame(tick); }

  // The hand.
  for (const { film, element } of sections) {
    if (!film) continue;
    const { grab } = film;
    grab.addEventListener('pointerdown', event => {
      if (!film.lit || film.drag || event.button > 0) return; // one finger at a time
      film.spring = null; // caught mid-spin: from where it is on screen
      film.velocity = 0;
      film.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, from: film.angle, decided: event.pointerType === 'mouse', history: [{ t: event.timeStamp, x: event.clientX }] };
      grab.setPointerCapture(event.pointerId);
      if (event.pointerType === 'mouse') element.classList.add('is-turning');
    }, { signal });
    grab.addEventListener('pointermove', event => {
      const drag = film.drag;
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;
      if (!drag.decided) {
        if (Math.abs(event.clientY - drag.y) > 8 && Math.abs(event.clientY - drag.y) > Math.abs(dx)) { film.drag = null; return; }
        if (Math.abs(dx) < 8) return;
        drag.decided = true;
        drag.x += Math.sign(dx) * 8; // no jump when the turn takes over
        element.classList.add('is-turning');
      }
      film.angle = drag.from + (event.clientX - drag.x) * film.perPixel;
      drag.history.push({ t: event.timeStamp, x: event.clientX });
      while (drag.history.length > 2 && event.timeStamp - drag.history[0]!.t > 100) drag.history.shift();
      request();
    }, { signal });
    const release = (event: PointerEvent, cancelled: boolean) => {
      const drag = film.drag;
      if (!drag || event.pointerId !== drag.id) return;
      film.drag = null;
      element.classList.remove('is-turning');
      if (!drag.decided) return;
      const first = drag.history[0]!, end = drag.history[drag.history.length - 1]!;
      const span = (end.t - first.t) / 1000;
      const fresh = event.timeStamp - end.t < 60;
      const velocity = !cancelled && fresh && span > .008 ? ((end.x - first.x) / span) * film.perPixel : 0;
      film.rest = Math.round((film.angle + project(velocity)) / 360) * 360;
      film.velocity = velocity;
      film.spring = Math.abs(velocity) > 60 ? { damping: .8, response: .55 } : { damping: 1, response: .45 };
      request();
    };
    grab.addEventListener('pointerup', event => release(event, false), { signal });
    grab.addEventListener('pointercancel', event => release(event, true), { signal });
    grab.addEventListener('lostpointercapture', event => release(event, true), { signal });
    grab.addEventListener('keydown', event => {
      if (!film.lit) return;
      const step = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 45 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -45 : 0;
      if (step) film.rest = Math.round(film.rest / 45) * 45 + step;
      else if (event.key === 'Home') film.rest = Math.round(film.angle / 360) * 360;
      else return;
      film.spring = { damping: 1, response: .4 };
      event.preventDefault();
      request();
    }, { signal });
  }

  const near = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const section = sections.find(item => item.element === entry.target)!;
      section.near = entry.isIntersecting;
      if (section.film && !section.near) section.film.shown = -1;
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
    for (const { film } of sections) film?.instrument?.dispose();
  });
});
