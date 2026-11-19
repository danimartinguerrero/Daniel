/**
 * Music, way scroll-3: the light after the ring. Past the records the page scrolls on as any page does,
 * and each sentence, then the drawing of what it names, waits dim and fills with light from the left as
 * it comes up the screen: the site's one fill (--fill-dim, --fill-edge), line after line, as the
 * passages in the ring fill, so reading on is the same act as before. Its pace is the one thing that
 * differs: the ring's words are pinned and take --fill-line of scroll a line, but these scroll past,
 * and at that pace a three-line sentence would still be filling as it left the top of the screen. So
 * a sentence is lit by the time its top is two fifths of the way down the screen, a drawing by the
 * time its middle is halfway: what is being read is always lit.
 *
 * Every frame is drawn from where the scroll is, never from a clock, so it follows the hand both ways
 * and stops when it stops. It follows the scroll through the short, critically damped spring the climb
 * uses (v4/climb.ts explains the iPhone's uneven scroll steps it evens out). Only transforms are
 * written, two per line or drawing, and only when they change; nothing is painted again.
 *
 * With reduced motion, without the script, and in forced colours everything is simply lit.
 */
import { onPage } from '@/scripts/page';
import { Spring, clamp } from '@/components/music/v4/physics';

const PAD = 0.25; // em around a line's box, for ink past it
// Where on the screen (shares of its height, from the top) the light starts and is done.
const TEXT_FROM = 0.92, TEXT_UNTIL = 0.4; // a sentence's top
const ART_FROM = 0.95, ART_UNTIL = 0.5; // a drawing's top, then its middle

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('.s3');
  if (root) init(root, signal);
});

function init(root: HTMLElement, signal: AbortSignal) {
  const still = matchMedia('(prefers-reduced-motion: reduce)');

  // The site's one fill (global.css): a soft edge a quarter of the line (or drawing) wide, line after line.
  const edgeShare = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fill-edge')) || 0.25;
  interface Line { span: number; win: HTMLElement; copy: HTMLElement }
  const texts = [...root.querySelectorAll<HTMLElement>('[data-s3-text]')].map((el) => ({
    el, words: [...el.querySelectorAll<HTMLElement>('[data-w]')], lines: [] as Line[], top: 0,
  }));
  const arts = [...root.querySelectorAll<HTMLElement>('[data-s3-art]')].map((el) => {
    const dim = el.querySelector<SVGSVGElement>('.s3-art__dim')!;
    return { el, dim, win: null as HTMLElement | null, copy: null as SVGSVGElement | null, span: 0, top: 0, height: 0 };
  });

  const written = new Map<Element, string>();
  const put = (el: HTMLElement | SVGElement, value: string) => {
    if (written.get(el) === value) return;
    written.set(el, value);
    el.style.transform = value;
  };

  function disarm() {
    for (const t of texts) {
      t.el.querySelector('.s3-lit')?.remove();
      t.el.classList.remove('is-armed');
      t.lines = [];
    }
    for (const a of arts) {
      a.win?.remove();
      a.win = a.copy = null;
      a.el.classList.remove('is-armed');
    }
    written.clear();
  }

  /* The lines as the browser broke them, each with its lit copy in a sliding window (see v4/climb.ts,
     lightLines), and each drawing with its lit copy. Measured again whenever the layout changes. */
  function measure() {
    disarm();
    if (still.matches) return;
    const y = scrollY;
    const share = edgeShare();
    for (const t of texts) {
      const box = t.el.getBoundingClientRect();
      t.top = box.top + y;
      const pad = (parseFloat(getComputedStyle(t.el).fontSize) || 16) * PAD;
      const layer = document.createElement('span');
      layer.className = 's3-lit';
      layer.setAttribute('aria-hidden', 'true');
      const rects = t.words.map((w) => w.getBoundingClientRect());
      let start = 0;
      for (let k = 1; k <= t.words.length; k++) {
        if (k < t.words.length && Math.abs(rects[k]!.top - rects[start]!.top) < 2) continue;
        const first = rects[start]!, last = rects[k - 1]!;
        const width = last.right - first.left;
        const edge = width * share;
        const win = document.createElement('span');
        win.className = 's3-lit__win';
        win.style.cssText = `left:${(first.left - box.left - pad).toFixed(2)}px;top:${(first.top - box.top - pad).toFixed(2)}px;width:${(width + 2 * pad + edge).toFixed(2)}px;height:${(first.height + 2 * pad).toFixed(2)}px;--edge:${edge.toFixed(2)}px`;
        const copy = document.createElement('span');
        copy.className = 's3-lit__line';
        copy.style.cssText = `left:${pad.toFixed(2)}px;top:${pad.toFixed(2)}px;line-height:${first.height.toFixed(2)}px`;
        copy.textContent = t.words.slice(start, k).map((w) => w.textContent).join(' ');
        win.append(copy);
        layer.append(win);
        t.lines.push({ span: width + 2 * pad + edge, win, copy });
        start = k;
      }
      t.el.append(layer);
      t.el.classList.add('is-armed');
    }
    for (const a of arts) {
      const box = a.el.getBoundingClientRect();
      a.top = box.top + y;
      a.height = box.height;
      // The light crosses what is on screen of the drawing, not the part that runs off it.
      const seen = Math.max(1, Math.min(box.width, document.documentElement.clientWidth - box.left));
      const edge = seen * share;
      a.span = seen + edge;
      const win = document.createElement('div');
      win.className = 's3-art__win';
      win.setAttribute('aria-hidden', 'true');
      win.style.cssText = `width:${a.span.toFixed(1)}px;--edge:${edge.toFixed(1)}px`;
      const copy = a.dim.cloneNode(true) as SVGSVGElement;
      copy.setAttribute('class', 's3-art__lit');
      copy.style.width = `${box.width.toFixed(1)}px`;
      win.append(copy);
      a.el.append(win);
      a.win = win;
      a.copy = copy;
      a.el.classList.add('is-armed');
    }
    drawn = NaN;
  }

  let drawn = NaN;
  function draw(y: number) {
    if (still.matches || y === drawn) return;
    drawn = y;
    const vh = innerHeight;
    for (const t of texts) {
      // Line after line, each over an even share of the stretch, linear with the scroll.
      const k = clamp((vh * TEXT_FROM - (t.top - y)) / (vh * (TEXT_FROM - TEXT_UNTIL)), 0, 1) * t.lines.length;
      for (const [j, line] of t.lines.entries()) {
        const p = clamp(k - j, 0, 1);
        const shift = (p - 1) * line.span;
        put(line.win, `translate3d(${shift.toFixed(2)}px,0,0)`);
        put(line.copy, `translate3d(${(-shift).toFixed(2)}px,0,0)`);
      }
    }
    for (const a of arts) {
      if (!a.win || !a.copy) continue;
      const top = a.top - y;
      const from = vh * ART_FROM, until = vh * ART_UNTIL - a.height / 2;
      const k = clamp((from - top) / Math.max(1, from - until), 0, 1);
      const shift = (k - 1) * a.span;
      put(a.win, `translate3d(${shift.toFixed(1)}px,0,0)`);
      put(a.copy, `translate3d(${(-shift).toFixed(1)}px,0,0)`);
    }
  }

  // The scroll, followed through the climb's spring (response 0.18 s, critically damped).
  const at = new Spring(scrollY, { response: 0.18, damping: 1 }, 0.05);
  let frame = 0;
  let last = 0;
  function tick(now: number) {
    frame = 0;
    const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60;
    last = now;
    const settled = at.step(dt);
    draw(at.value);
    if (!settled) frame = requestAnimationFrame(tick);
    else last = 0;
  }
  function follow(snap = false) {
    const y = scrollY;
    // Nowhere near the section (the camera is still over the ring): put the spring there, draw nothing new.
    if (snap) {
      at.set(y);
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      return draw(y);
    }
    at.to(y);
    if (!frame) frame = requestAnimationFrame(tick);
  }

  measure();
  follow(true);
  window.addEventListener('scroll', () => follow(), { passive: true, signal });
  let width = innerWidth;
  window.addEventListener('resize', () => {
    // A phone's toolbar coming and going changes only the height: the lines stay where they broke.
    if (innerWidth === width) return follow();
    width = innerWidth;
    measure();
    follow(true);
  }, { signal });
  // Anything above changing height (the climb's stretch being set, a font arriving) moves the section.
  let seenTop = root.getBoundingClientRect().top + scrollY;
  const shifted = new ResizeObserver(() => {
    const top = root.getBoundingClientRect().top + scrollY;
    if (Math.abs(top - seenTop) < 0.5) return;
    seenTop = top;
    measure();
    follow(true);
  });
  shifted.observe(document.body);
  signal.addEventListener('abort', () => { shifted.disconnect(); cancelAnimationFrame(frame); });
  still.addEventListener('change', () => { measure(); follow(true); }, { signal });
  document.fonts?.ready.then(() => {
    if (signal.aborted) return;
    measure();
    follow(true);
  });
}
