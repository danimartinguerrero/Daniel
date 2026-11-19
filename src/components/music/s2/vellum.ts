/**
 * Sketch s2/a, "Vellum": the stack of clear sheets under the records.
 *
 * Each sheet has a depth (0 = on top), a spring, so a sheet coming up passes through the others
 * rather than swapping with them. The depth sets how bright and how soft its print is: film under film
 * dims and diffuses what is behind it. The top sheet can be slid off sideways by hand: it follows the
 * finger 1:1, pivoting about where it was taken, and on release the throw is projected (Apple's
 * deceleration); thrown far enough it leaves, goes to the bottom of the pile and slides back under from
 * the side it left by. The record turned to the middle of the carousel above comes to the top.
 */
import { onPage } from '@/scripts/page';
import { Spring, VelocityTracker, clamp, project } from '../v4/physics';

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('[data-music-page]');
  const stack = document.querySelector<HTMLElement>('[data-s2v-stack]');
  if (root && stack) init(root, stack, signal);
});

interface Sheet {
  id: string;
  el: HTMLElement;
  ink: HTMLElement;
  edge: HTMLElement;
  glint: HTMLElement;
  depth: Spring;
  x: Spring;
  lift: Spring;
  /** How much a sideways move turns the sheet: set by where it was taken. */
  twist: number;
  written: Record<string, string>;
}

function init(root: HTMLElement, stack: HTMLElement, signal: AbortSignal) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sheets: Sheet[] = [...stack.querySelectorAll<HTMLElement>('[data-s2v-sheet]')].map((el, i) => ({
    id: el.dataset.s2vSheet!,
    el,
    ink: el.querySelector<HTMLElement>('[data-s2v-ink]')!,
    edge: el.querySelector<HTMLElement>('[data-s2v-edge]')!,
    glint: el.querySelector<HTMLElement>('[data-s2v-glint]')!,
    depth: new Spring(i, { response: 0.55, damping: 1 }, 0.001),
    x: new Spring(0, { response: 0.4, damping: 1 }, 0.05),
    lift: new Spring(0, { response: 0.3, damping: 1 }),
    twist: 0,
    written: {},
  }));
  const byId = new Map(sheets.map((s) => [s.id, s] as const));
  let order = sheets.map((s) => s.id); // top first

  const put = (s: Sheet, el: HTMLElement, prop: 'transform' | 'opacity' | 'filter' | 'zIndex', v: string) => {
    const key = (el === s.el ? 'el' : el === s.ink ? 'ink' : el === s.glint ? 'glint' : 'edge') + prop;
    if (s.written[key] === v) return;
    s.written[key] = v;
    el.style[prop] = v;
  };

  /** How bright a sheet's print is at depth d: full on top, half one sheet down, then dimming. */
  const inkAt = (d: number) => (d <= 1 ? 1 - 0.5 * d : 0.5 * Math.pow(0.8, d - 1));

  function render() {
    // Stacking follows the springs: whichever is nearer the top right now is drawn over the other.
    const ranked = [...sheets].sort((a, b) => a.depth.value - b.depth.value);
    ranked.forEach((s, k) => put(s, s.el, 'zIndex', String(100 - k)));
    for (const s of sheets) {
      const d = Math.max(0, s.depth.value);
      const w = stack.offsetWidth || 1;
      const rot = (s.x.value / w) * s.twist;
      const scale = 1 + s.lift.value * 0.012;
      put(s, s.el, 'transform', `translate3d(${s.x.value.toFixed(2)}px,0,0) rotate(${rot.toFixed(3)}deg) scale(${scale.toFixed(4)})`);
      put(s, s.ink, 'opacity', inkAt(d).toFixed(3));
      // The film diffuses what lies under it: quantised so the blur is only redrawn when it shows.
      put(s, s.ink, 'filter', d < 0.05 ? 'none' : `blur(${(Math.round(Math.min(2.2, d * 0.3) * 10) / 10).toFixed(1)}px)`);
      // Seen a little from above: the deeper a sheet, the higher its edge shows over the one on it.
      put(s, s.edge, 'transform', `translate3d(0,${(-d * 3).toFixed(2)}px,0)`);
      put(s, s.edge, 'opacity', clamp(1 - d / 12, 0.1, 1).toFixed(3));
      put(s, s.glint, 'opacity', (clamp(1 - d, 0, 1)).toFixed(3));
    }
  }

  let raf = 0;
  let last = 0;
  function frame(now: number) {
    const dt = Math.min(0.05, (now - (last || now)) / 1000) || 1 / 60;
    last = now;
    let busy = false;
    for (const s of sheets) {
      if (!(held && held.sheet === s)) busy = !s.x.step(dt) || busy;
      busy = !s.depth.step(dt) || busy;
      busy = !s.lift.step(dt) || busy;
      // A sheet thrown far enough is under the pile by now: send it home, under the others.
      if (s.id === flying && Math.abs(s.x.value) > (stack.offsetWidth || 1) * 0.7) {
        flying = null;
        sendToBottom(s);
      }
    }
    render();
    raf = busy || held ? requestAnimationFrame(frame) : 0;
    if (!raf) last = 0;
  }
  const tick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  function retarget() {
    order.forEach((id, k) => {
      const s = byId.get(id)!;
      if (reduced) s.depth.set(k);
      else s.depth.to(k);
      s.el.toggleAttribute('aria-hidden', k !== 0);
    });
    tick();
  }

  function bringToTop(id: string) {
    if (order[0] === id) return;
    order = [id, ...order.filter((x) => x !== id)];
    const s = byId.get(id)!;
    // Lifted as it comes up through the pile, set down once it is there.
    if (!reduced) { s.lift.to(1, { response: 0.25 }); setTimeout(() => s.lift.to(0, { response: 0.45 }), 260); }
    retarget();
  }

  let flying: string | null = null;
  function sendToBottom(s: Sheet) {
    order = [...order.filter((x) => x !== s.id), s.id];
    retarget();
    // It comes back under the pile the way it went out.
    s.x.to(0, { response: 0.7, damping: 1 });
    s.lift.to(0);
  }

  /* ---------------------------------------------------------------- the hand */
  const tracker = new VelocityTracker();
  let held: { sheet: Sheet; id: number; x0: number; y0: number; from: number; active: boolean } | null = null;

  stack.addEventListener('pointerdown', (e) => {
    if (held || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const top = byId.get(order[0]!)!;
    const r = top.el.getBoundingClientRect();
    // It pivots about where it was taken: taken low, a push right turns it up; taken high, down.
    top.el.style.transformOrigin = `${(e.clientX - r.left).toFixed(0)}px ${(e.clientY - r.top).toFixed(0)}px`;
    top.twist = -((e.clientY - r.top) / r.height - 0.5) * 9;
    held = { sheet: top, id: e.pointerId, x0: e.clientX, y0: e.clientY, from: top.x.value, active: false };
    if (flying === top.id) flying = null;
    tracker.reset(e.clientX, e.timeStamp);
  }, { signal });

  stack.addEventListener('pointermove', (e) => {
    if (!held || e.pointerId !== held.id) return;
    const dx = e.clientX - held.x0;
    tracker.push(e.clientX, e.timeStamp);
    if (!held.active) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - held.y0)) return;
      held.active = true;
      held.x0 = e.clientX; // from here, so nothing jumps by the threshold
      stack.setPointerCapture(e.pointerId);
      held.sheet.el.classList.add('is-held');
      held.sheet.lift.to(1, { response: 0.2 });
      tick();
    }
    const s = held.sheet;
    const x = held.from + (e.clientX - held.x0);
    s.x.set(x);
    tick();
  }, { signal });

  function release(e: PointerEvent, cancelled: boolean) {
    if (!held || e.pointerId !== held.id) return;
    const { sheet: s, active } = held;
    held = null;
    s.el.classList.remove('is-held');
    if (!active) {
      // A tap on a title brings that record's sheet up.
      const pick = !cancelled && (e.target as Element | null)?.closest<HTMLElement>('[data-s2v-pick]');
      if (pick) bringToTop(pick.dataset.s2vPick!);
      return;
    }
    const v = tracker.velocity(e.timeStamp, 60);
    const w = stack.offsetWidth;
    const landing = s.x.value + project(v, 0.996);
    if (!cancelled && Math.abs(landing) > w * 0.42) {
      // Thrown: on at the speed it was let go, towards the edge of the screen.
      const dir = Math.sign(landing);
      flying = s.id;
      s.x.to(dir * (innerWidth * 0.5 + w * 0.65), { response: 0.55, damping: 1, velocity: v });
    } else {
      // Not far enough: back onto the pile, with the little give a let-go thing has.
      s.x.to(0, { response: 0.42, damping: 0.8, velocity: v });
      s.lift.to(0);
    }
    tick();
  }
  stack.addEventListener('pointerup', (e) => release(e, false), { signal });
  stack.addEventListener('pointercancel', (e) => release(e, true), { signal });

  root.addEventListener('v4:centre', (e) => bringToTop((e as CustomEvent<{ id: string }>).detail.id), { signal });

  render();
  signal.addEventListener('abort', () => cancelAnimationFrame(raf));
}
