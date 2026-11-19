import { onPage } from '@/scripts/page';
import { FILL_HOLD, clearTextFill, measureFillLine, measureTextFill, paintTextFill, type LitLine } from '../v4/text-fill';

/* The instruments, prototype "B, further" (StringNext.astro). Each section's screen is held while its
   words fill, line after line, at the site's one pace (text-fill.ts). In a chapter, over the same
   stretch of scroll, the instrument rises from lying under the words to standing in front of its name,
   and the name comes forward a little behind it, slower, so the two read as two depths.

   Once it stands, it is the hand's (Apple, Designing Fluid Interfaces):
   - a sideways drag turns it 1:1, from where it was grabbed, even mid-spin (the spring is interrupted
     at its presentation value, never its target);
   - on release the drag's velocity is handed to a spring, and the resting point is chosen from where
     that velocity projects the turn (scroll-like deceleration), always a whole turn: it settles facing
     you. A flick carries momentum, so that spring may overshoot a little (damping .8); a slow release
     settles without overshoot (damping 1);
   - up and down still scroll the page (touch-action: pan-y; a drag only turns after 8 px sideways);
   - the glass pill gives it one full turn; arrow keys turn it by 45 degrees.
   The instrument is drawn live with WebGL (instrument.ts), so every pose, risen or turned, is drawn in
   the frame it is asked for. */

import type { Instrument } from './instrument';

const FOLLOW = 0.07; // s: the instrument follows the scroll this closely, so a wheel's steps glide
const DECELERATION = 0.998; // Apple's normal scroll deceleration, for projecting a flick

interface Pose { x: number; y: number; size: number; opacity: number }

const smooth = (t: number) => t * t * (3 - 2 * t);
const project = (velocity: number) => (velocity / 1000) * DECELERATION / (1 - DECELERATION);
const wrap = (angle: number) => ((angle % 360) + 360) % 360;

onPage(signal => {
  const root = document.querySelector<HTMLElement>('[data-sn]');
  if (!root) return;
  const allowed = matchMedia('(prefers-reduced-motion: no-preference) and (min-height: 500px) and (min-width: 320px) and (forced-colors: none)');
  const narrow = matchMedia('(max-width: 760px)');

  const sections = [...root.querySelectorAll<HTMLElement>('[data-fill-section]')].map(element => {
    const canvas = element.querySelector('canvas');
    const model = element.dataset.model;
    return {
      element,
      stage: element.querySelector<HTMLElement>('[data-fill-stage]')!,
      copy: element.querySelector<HTMLElement>('.sn__copy'),
      texts: [...element.querySelectorAll<HTMLElement>('[data-fill-text]')],
      lines: [] as LitLine[],
      enabled: false,
      near: false,
      film: model && canvas ? {
        model, canvas, paint: element.dataset.paint ?? '',
        name: element.querySelector<HTMLElement>('[data-sn-name]')!,
        grab: element.querySelector<HTMLElement>('[data-sn-grab]')!,
        pill: element.querySelector<HTMLButtonElement>('[data-sn-turn]')!,
        instrument: null as Instrument | null,
        loading: false,
        from: { x: 0, y: 0, size: 1, opacity: 1 } as Pose,
        to: { x: 0, y: 0, size: 1, opacity: 1 } as Pose,
        target: 0, // where the scroll is, 0 to 1
        shown: -1, // where the instrument is, following it
        standing: false,
        // The turn, in degrees: where it is on screen, how fast it is going, where its spring is going.
        angle: 0, velocity: 0, rest: 0,
        spring: null as null | { damping: number; response: number },
        drag: null as null | { id: number; x: number; y: number; from: number; decided: boolean; history: { t: number; x: number }[] },
        perPixel: .5, // degrees of turn per px of drag
      } : null,
    };
  });
  type Section = typeof sections[number];
  type Film = NonNullable<Section['film']>;

  let line = 1;
  let stopped = false;

  // The model is fetched and its renderer made once the chapter is near; until then the canvas is clear.
  async function load(film: Film) {
    if (film.loading) return;
    film.loading = true;
    try {
      const { createInstrument } = await import('./instrument');
      const instrument = await createInstrument(film.canvas, film.model, film.paint);
      if (stopped) return instrument.dispose();
      film.instrument = instrument;
      instrument.resize(film.to.size, Math.min(devicePixelRatio || 1, 2));
      request();
    } catch {
      film.loading = false;
    }
  }

  // Where the instrument starts and ends on this screen. It ends upright in front of its name, its
  // length 80% of the screen's height, at 70% across (under the words on a phone), with room under it
  // for the pill; it starts lying across the screen under the words, larger and dim. A still's frame is
  // the instrument's length and a tenth, square.
  function place(section: Section, film: Film) {
    const width = section.stage.clientWidth;
    const height = section.stage.clientHeight;
    let to: Pose, from: Pose;
    if (narrow.matches) {
      const top = section.copy!.getBoundingClientRect().bottom - section.stage.getBoundingClientRect().top + 8;
      const band = Math.max(1, height - top - 70);
      to = { x: width * .62, y: top + band / 2, size: band * 1.1, opacity: 1 };
      from = { x: width / 2, y: top + band * .42, size: width * 1.12, opacity: .42 };
    } else {
      to = { x: width * .7, y: height * .47, size: height * .8 * 1.1, opacity: 1 };
      from = { x: width * .55, y: height * .75, size: Math.min(width * .8, height * 2.1) * 1.1, opacity: .34 };
    }
    film.to = to;
    film.from = from;
    const style = film.canvas.style;
    style.width = style.height = `${to.size.toFixed(1)}px`;
    style.left = `${(to.x - to.size / 2).toFixed(1)}px`;
    style.top = `${(to.y - to.size / 2).toFixed(1)}px`;
    // The hand's area: the standing instrument, a little wider than its body.
    const grab = film.grab.style;
    const gw = to.size * .44, gh = to.size * .88;
    grab.width = `${gw.toFixed(1)}px`; grab.height = `${gh.toFixed(1)}px`;
    grab.left = `${(to.x - gw / 2).toFixed(1)}px`; grab.top = `${(to.y - gh / 2).toFixed(1)}px`;
    // A full turn for a drag of about twice the instrument's width on screen.
    film.perPixel = 360 / Math.max(420, to.size * .8);
    // The pill: under the instrument; on a phone, where the dock is, beside its body, at the left
    // margin and under the name.
    const pw = film.pill.offsetWidth || 160, ph = film.pill.offsetHeight || 36;
    const margin = section.copy!.getBoundingClientRect().left - section.stage.getBoundingClientRect().left;
    const pillX = narrow.matches ? margin : to.x - pw / 2;
    const pillY = narrow.matches ? Math.min(height - ph - 84, to.y + to.size / 2 / 1.1 * .62) : Math.min(height - ph - 20, to.y + to.size / 2 / 1.1 + 14);
    film.pill.style.transform = '';
    film.pill.style.left = `${pillX.toFixed(1)}px`;
    film.pill.style.top = `${pillY.toFixed(1)}px`;
    // Sharp where it ends, at the page's pixel density (two at most: a third costs more than it shows).
    film.instrument?.resize(to.size, Math.min(devicePixelRatio || 1, 2));
    film.shown = -1;
  }

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
        if (section.film) stand(section.film, false);
      }
    }
    request();
  }

  function draw(film: Film) {
    film.instrument?.pose(Math.max(0, film.shown), film.angle);
  }

  // Where it stands, how big and how bright, and its name behind it: transform and opacity only.
  function move(film: Film) {
    const progress = smooth(Math.max(0, film.shown));
    const { from, to } = film;
    const x = from.x + (to.x - from.x) * progress - to.x;
    const y = from.y + (to.y - from.y) * progress - to.y;
    const scale = (from.size + (to.size - from.size) * progress) / to.size;
    const opacity = from.opacity + (to.opacity - from.opacity) * progress;
    film.canvas.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) scale(${scale.toFixed(4)})`;
    film.canvas.style.opacity = opacity.toFixed(3);
    // The name: further away, so it travels a third as far and grows less.
    film.name.style.transform = `translate3d(${(x / 3).toFixed(2)}px,0,0) scale(${(1.05 - .05 * progress).toFixed(4)})`;
    film.name.style.opacity = (.15 + .85 * progress).toFixed(3);
  }

  // Standing: the instrument is the hand's, and the pill is there.
  function stand(film: Film, standing: boolean) {
    if (standing === film.standing) return;
    film.standing = standing;
    const section = film.canvas.closest<HTMLElement>('[data-fill-section]')!;
    section.classList.toggle('is-standing', standing);
    film.grab.tabIndex = film.pill.tabIndex = standing ? 0 : -1;
    if (!standing) {
      film.drag = null;
      section.classList.remove('is-turning');
      if (film.angle !== 0) settle(film, 0, 1, .35);
    }
  }

  // The turn's spring (Apple's damping ratio and response), from where the instrument is on screen and
  // as fast as it is going, to `rest`.
  function settle(film: Film, velocity: number, damping: number, response: number) {
    const turns = Math.round(film.angle / 360);
    film.rest = turns * 360;
    film.velocity = velocity;
    film.spring = { damping, response };
    request();
  }
  function aim(film: Film, rest: number, damping: number, response: number) {
    film.rest = rest;
    film.spring = { damping, response };
    request();
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
      // A whole turn is the same as none.
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
      // Upright as the last line fills, and so while the words are held.
      film.target = Math.min(1, scrolled / (Math.max(1, section.lines.length) * line));
      if (film.shown < 0) film.shown = film.target;
      else film.shown += (film.target - film.shown) * (1 - Math.exp(-dt / FOLLOW));
      if (Math.abs(film.target - film.shown) < .0004) film.shown = film.target;
      else moving = true;
      stand(film, film.shown > .995);
      if (stepSpring(film, dt)) moving = true;
      move(film);
      draw(film);
      announce(film);
    }
    if (moving) queued = requestAnimationFrame(tick);
    else last = 0;
  }
  function request() { if (!queued) queued = requestAnimationFrame(tick); }

  // The hand.
  for (const { film, element } of sections) {
    if (!film) continue;
    const { grab, pill } = film;
    grab.addEventListener('pointerdown', event => {
      if (!film.standing || film.drag || event.button > 0) return; // one finger at a time
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
      // Released still, or long after the last move: no velocity to hand over.
      const fresh = event.timeStamp - end.t < 60;
      const velocity = !cancelled && fresh && span > .008 ? ((end.x - first.x) / span) * film.perPixel : 0;
      // Settle on the whole turn nearest to where the flick would carry it.
      const projected = film.angle + project(velocity);
      film.rest = Math.round(projected / 360) * 360;
      film.velocity = velocity;
      film.spring = Math.abs(velocity) > 60 ? { damping: .8, response: .55 } : { damping: 1, response: .45 };
      request();
    };
    grab.addEventListener('pointerup', event => release(event, false), { signal });
    grab.addEventListener('pointercancel', event => release(event, true), { signal });
    grab.addEventListener('lostpointercapture', event => release(event, true), { signal });
    grab.addEventListener('keydown', event => {
      if (!film.standing) return;
      const step = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 45 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -45 : 0;
      if (step) aim(film, Math.round(film.rest / 45) * 45 + step, 1, .4);
      else if (event.key === 'Home') aim(film, Math.round(film.angle / 360) * 360, 1, .4);
      else return;
      event.preventDefault();
    }, { signal });
    // One full turn, from wherever it is, the way it was going (or to the right); a second press while
    // it turns adds another.
    pill.addEventListener('click', () => {
      if (!film.standing) return;
      const direction = film.velocity < -1 ? -1 : 1;
      aim(film, Math.round((film.spring ? film.rest : film.angle) / 360) * 360 + 360 * direction, 1, .8);
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
