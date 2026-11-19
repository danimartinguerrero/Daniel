/**
 * /music/cuaderno: the notebook's pages turn with the ring. The ring is turned by hand (a drag, a
 * trackpad, the arrow keys: the carousel's own, listening-bar.ts), and it says where it is on the
 * page's root ("v4:turn", in records, running freely). One record round is one leaf over: between two
 * records the leaf of the one leaving stands as far up as the ring has gone, its back carrying the
 * next record's printed note, the next record's page under it. So the notebook has no motion of its
 * own: it inherits the ring's drag, its throw and its settling, and stops where the ring stops.
 *
 *   - The leaf is two strips hinged on each other. The faster it turns, the more its outer strip lags
 *     behind, as paper does going through the air (a short critically damped spring); at rest it is flat.
 *   - A ring has no last record; a notebook has a last page. Going on from the last record to the
 *     first, all the pages before it come back over together, as a hand takes them to go back to the
 *     start, and the other way round.
 *   - Turned too fast to read, the leaf goes by blank.
 *   - The cover is the scroll's (climb.ts says how far open it is, "cuaderno:open"): until it is open
 *     the ring only changes the page under it.
 *   - So that a visitor finds out the page turns: once the cover is open, the corner of the page lifts
 *     a little and lies down again (twice at most, some seconds apart), and a line under the notebook
 *     says how. Both stop for good once a page has been turned, and the lift gives way at once to the
 *     ring.
 *
 * With reduced motion nothing turns: the notebook lies open after the passages and its pages change,
 * with a short fade, when another record comes to the middle of the carousel.
 */
import { onPage } from '@/scripts/page';
import { Spring, clamp } from '@/components/music/v4/physics';

const LAG = 0.055; // degrees the outer strip lags per degree a second the leaf turns
const LAG_MAX = 34; // degrees
const RIFFLE = 2.6; // records a second: faster than this the leaf goes by blank
const PEEK = 24; // degrees the page's corner is lifted to show it turns

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('[data-music-page].v4');
  const nb = root?.querySelector<HTMLElement>('[data-cn]');
  if (root && nb) init(root, nb, signal);
});

function init(root: HTMLElement, nb: HTMLElement, signal: AbortSignal) {
  const forms = [...document.querySelectorAll<HTMLTemplateElement>('template[data-cn-form]')];
  const clips = [...document.querySelectorAll<HTMLTemplateElement>('template[data-cn-clip]')];
  const n = forms.length;
  if (!n || clips.length !== n) return;
  const one = (sel: string) => nb.querySelector<HTMLElement>(sel)!;
  const left = one('[data-cn-left]'), right = one('[data-cn-right]');
  const leftPage = left.parentElement!;
  const leaf = one('[data-cn-leaf]'), stripA = one('[data-cn-strip-a]'), stripB = one('[data-cn-strip-b]');
  const fa = one('[data-cn-fa]'), fb = one('[data-cn-fb]'), ba = one('[data-cn-ba]'), bb = one('[data-cn-bb]');
  const shades = {
    fa: one('[data-cn-shade-fa]'), fb: one('[data-cn-shade-fb]'),
    ba: one('[data-cn-shade-ba]'), bb: one('[data-cn-shade-bb]'),
    cf: one('[data-cn-shade-cf]'), cb: one('[data-cn-shade-cb]'),
  };
  const cover = one('[data-cn-cover]'), cb = one('[data-cn-cb]');
  const castL = one('[data-cn-cast-left]'), castR = one('[data-cn-cast-right]');
  const hint = root.querySelector<HTMLElement>('[data-cn-hint]');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const mod = (i: number) => ((i % n) + n) % n;

  // Where the ring is, in records. Until the carousel says, the record it starts on.
  const sleeves = [...root.querySelectorAll('[data-vinyl]')];
  let pos = Math.max(0, sleeves.findIndex((b) => b.hasAttribute('data-start')));
  let open = 0;

  /** Put record i's page (f) or printed note (c) into a slot, unless it is there already. */
  function put(slot: HTMLElement, kind: 'f' | 'c', i: number) {
    const key = `${kind}${i}`;
    if (slot.dataset.shown === key) return false;
    slot.replaceChildren((kind === 'f' ? forms : clips)[i]!.content.cloneNode(true));
    slot.dataset.shown = key;
    return true;
  }

  const written = new Map<HTMLElement, Record<string, string>>();
  function css(el: HTMLElement, prop: 'transform' | 'opacity' | 'visibility', value: string) {
    let w = written.get(el);
    if (!w) written.set(el, (w = {}));
    if (w[prop] === value) return;
    w[prop] = value;
    el.style[prop] = value;
  }

  /* How a face is lit, turned φ degrees up from lying flat: the lamp is overhead, so a page standing
     up takes less of it. The front is seen up to 90°, the back past it. */
  const rad = Math.PI / 180;
  const frontShade = (phi: number) => clamp(0.3 * (1 - Math.cos(phi * rad)), 0, 0.3);
  const backShade = (phi: number) => clamp(0.3 * (1 + Math.cos(phi * rad)), 0, 0.3);
  /** The shadow a leaf standing θ up throws on the page it is over: long and faint as it lifts, short and
      dark as it stands, then on the other page as it comes down there. */
  function casts(th: number) {
    const s = Math.sin(th * rad), c = Math.cos(th * rad);
    css(castR, 'opacity', (th < 90 ? s * 0.8 : 0).toFixed(3));
    css(castR, 'transform', `scaleX(${Math.max(0.03, c).toFixed(3)})`);
    css(castL, 'opacity', (th > 90 && open >= 1 ? s * 0.8 : 0).toFixed(3));
    css(castL, 'transform', `scaleX(${Math.max(0.03, -c).toFixed(3)})`);
  }

  /* ---------------------------------------------------------------- the leaf's bend, from its speed */
  const bend = new Spring(0, { response: 0.16, damping: 1 }, 0.02);
  let speed = 0; // records a second, smoothed
  let heading = 1; // which way the ring last went
  let lastTurn = 0;
  let lastFrame = 0;
  let frame = 0;

  /* ---------------------------------------------------------------- showing that the page turns */
  const peek = new Spring(0, { response: 0.42, damping: 1 }, 0.002);
  let peekRising = false;
  let peeks = 0;
  let peekTimer = 0;
  let turned = false; // a page has been turned: nothing more to show
  let openedAt = NaN; // where the ring was when the cover was last fully open
  function schedulePeek(delay: number) {
    clearTimeout(peekTimer);
    if (turned || peeks >= 2 || still.matches) return;
    peekTimer = window.setTimeout(() => {
      if (open < 1 || turned || Math.abs(speed) > 0.05) return schedulePeek(1200);
      peeks++;
      peekRising = true;
      peek.to(1, { response: 0.42, damping: 1 });
      ask();
    }, delay);
  }
  function stopPeek() {
    clearTimeout(peekTimer);
    peekRising = false;
    peek.set(0);
  }

  function onTurn(e: Event) {
    const next = (e as CustomEvent<{ pos: number }>).detail.pos;
    // The ring has the page now: a lift under way gives way to it at once.
    if (peek.value || peekRising) stopPeek();
    // As soon as a turn has clearly begun, the line saying how has done its work.
    if (!turned && open >= 1 && !Number.isNaN(openedAt) && Math.abs(next - openedAt) > 0.12) {
      turned = true;
      clearTimeout(peekTimer);
      hint?.classList.add('is-used');
    }
    const now = performance.now();
    const dt = lastTurn ? clamp((now - lastTurn) / 1000, 1 / 240, 1 / 15) : 1 / 60;
    const v = (next - pos) / dt;
    pos = next;
    lastTurn = now;
    speed += (v - speed) * Math.min(1, dt / 0.05);
    if (Math.abs(speed) > 0.05) heading = Math.sign(speed);
    settle(dt);
    render();
    ask();
  }
  function settle(dt: number) {
    const seam = mod(Math.floor(pos)) === n - 1;
    // A leaf going forward has its outer edge behind it; the block of pages at the seam doesn't bend.
    const turnRate = speed * 180 * (seam ? -1 : 1);
    bend.to(seam ? 0 : clamp(turnRate * LAG, -LAG_MAX, LAG_MAX));
    bend.step(dt);
  }
  const ask = () => { if (!frame) frame = requestAnimationFrame(tick); };
  // Once the ring stops saying anything, its speed is let go and the paper comes flat.
  function tick(now: number) {
    frame = 0;
    const dt = lastFrame ? clamp((now - lastFrame) / 1000, 1 / 240, 1 / 15) : 1 / 60;
    lastFrame = now;
    if (now - lastTurn > 34) {
      speed *= Math.exp(-dt / 0.05);
      if (Math.abs(speed) < 0.01) speed = 0;
      settle(dt);
    }
    if (!peek.settled) {
      peek.step(dt);
      // Up, then straight down again, a little slower, as a corner let go of.
      if (peekRising && peek.value > 0.97) {
        peekRising = false;
        peek.to(0, { response: 0.55, damping: 1 });
      }
      if (!peekRising && peek.settled) schedulePeek(5200);
    }
    if (now - lastTurn > 34 || !peek.settled || peek.value) render();
    if (speed !== 0 || !bend.settled || !peek.settled) ask();
    else lastFrame = 0;
  }

  /* ---------------------------------------------------------------- one picture of the notebook */
  let shownStill = -1;
  function render() {
    if (still.matches) return renderStill();
    const r = mod(Math.round(pos));
    nb.classList.toggle('is-riffling', Math.abs(speed) > RIFFLE && open >= 1);

    // Closed, or opening: the cover and the pages written before this record turn as one block, and
    // the ring only changes the page under it.
    if (open < 1) {
      put(right, 'f', r);
      put(cb, 'c', r);
      css(leaf, 'visibility', 'hidden');
      css(leftPage, 'visibility', 'hidden');
      css(cover, 'visibility', 'visible');
      const th = 180 * open;
      css(cover, 'transform', `translateZ(2px) rotateY(${(-th).toFixed(3)}deg)`);
      css(shades.cf, 'opacity', frontShade(th).toFixed(3));
      css(shades.cb, 'opacity', backShade(th).toFixed(3));
      casts(th);
      return;
    }
    css(cover, 'visibility', 'hidden');
    css(leftPage, 'visibility', 'visible');

    const fl = Math.floor(pos);
    const f = pos - fl;
    const c = mod(fl);
    // At rest (or as good as): the record's two pages, and no leaf in the air, unless its corner is
    // being lifted to show that it turns: then its outer part rises ahead of the rest.
    if (Math.min(f, 1 - f) < 0.0015) {
      put(left, 'c', r);
      const lift = PEEK * peek.value;
      if (lift < 0.05) {
        put(right, 'f', r);
        css(leaf, 'visibility', 'hidden');
        casts(0);
        return;
      }
      nb.classList.remove('is-bundle');
      put(fa, 'f', r); put(fb, 'f', r);
      put(ba, 'c', mod(r + 1)); put(bb, 'c', mod(r + 1));
      put(right, 'f', mod(r + 1));
      const thA = lift * 0.45, lag = -lift * 0.8;
      css(leaf, 'visibility', 'visible');
      css(stripA, 'transform', `rotateY(${(-thA).toFixed(3)}deg)`);
      css(stripB, 'transform', `rotateY(${lag.toFixed(3)}deg)`);
      css(shades.fa, 'opacity', frontShade(thA).toFixed(3));
      css(shades.fb, 'opacity', frontShade(thA - lag).toFixed(3));
      casts(thA - lag * 0.5);
      return;
    }
    const seam = c === n - 1;
    nb.classList.toggle('is-bundle', seam);
    let th: number;
    if (!seam) {
      // The leaf of record c, its back the next record's note, over the next record's page.
      put(fa, 'f', c); put(fb, 'f', c);
      put(ba, 'c', mod(c + 1)); put(bb, 'c', mod(c + 1));
      put(left, 'c', c);
      put(right, 'f', mod(c + 1));
      th = 180 * f;
    } else {
      // From the last record to the first: everything before the last page comes back over.
      put(fa, 'f', 0); put(fb, 'f', 0);
      put(ba, 'c', n - 1); put(bb, 'c', n - 1);
      put(left, 'c', 0);
      put(right, 'f', n - 1);
      th = 180 * (1 - f);
    }
    // Lifting the paper bends it a little even when slow; speed bends it more.
    const lag = seam ? 0 : bend.value + heading * Math.sin(th * rad) * 5;
    const thB = th - lag;
    css(leaf, 'visibility', 'visible');
    css(stripA, 'transform', `rotateY(${(-th).toFixed(3)}deg)`);
    css(stripB, 'transform', `rotateY(${lag.toFixed(3)}deg)`);
    css(shades.fa, 'opacity', frontShade(th).toFixed(3));
    css(shades.ba, 'opacity', backShade(th).toFixed(3));
    css(shades.fb, 'opacity', frontShade(thB).toFixed(3));
    css(shades.bb, 'opacity', backShade(thB).toFixed(3));
    casts(th);
  }

  /** Without motion: the record in the middle, its two pages, changed with a short fade. */
  function renderStill() {
    const r = mod(Math.round(pos));
    if (r === shownStill) return;
    const first = shownStill === -1;
    shownStill = r;
    const changed = [put(left, 'c', r) && left, put(right, 'f', r) && right].filter(Boolean) as HTMLElement[];
    if (!first) for (const el of changed) el.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  }

  root.addEventListener('v4:turn', onTurn, { signal });
  root.addEventListener('cuaderno:open', (e) => {
    const was = open;
    open = (e as CustomEvent<{ open: number }>).detail.open;
    if (open >= 1 && was < 1) {
      openedAt = pos;
      schedulePeek(350);
    } else if (open < 1 && was >= 1) {
      stopPeek();
    }
    render();
  }, { signal });
  still.addEventListener('change', () => {
    // Every inline style this module wrote belongs to the climb's notebook.
    for (const el of written.keys()) el.removeAttribute('style');
    written.clear();
    nb.classList.remove('is-riffling', 'is-bundle');
    shownStill = -1;
    render();
  }, { signal });
  render();
  signal.addEventListener('abort', () => {
    cancelAnimationFrame(frame);
    clearTimeout(peekTimer);
  });
}
