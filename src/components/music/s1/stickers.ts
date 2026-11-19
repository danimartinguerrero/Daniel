/**
 * s1, sketch A: peeling the stickers. A sticker is stuck: a pull first only bends it up toward the
 * finger, resisting (rubber band), and past PEEL px it comes off with a small snap and from then on
 * follows the finger 1:1, held where it was grabbed: it swings about that point as the hand moves, as
 * a card held by a corner does. Let go, it slides on to where the throw would carry it (Apple's
 * projection) at the speed the finger had, and presses down flat where it lands. It can be caught
 * while it slides. Everything is a spring from v4/physics.ts, stepped in one frame loop.
 */
import { onPage } from '@/scripts/page';
import { Spring, VelocityTracker, clamp, project, rubberband } from '@/components/music/v4/physics';

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('[data-s1-stickers]');
  if (root) init(root, signal);
});

const PEEL = 26; // px of pull before it lets go of the paper
const LEAN = 30; // degrees the edge tips up, at most, while it is still stuck
const RAD = Math.PI / 180;

interface Sticker {
  el: HTMLElement;
  body: HTMLElement;
  flat: HTMLElement;
  lift: HTMLElement;
  x: Spring; // px from its slot
  y: Spring;
  r: Spring; // degrees
  up: Spring; // 0 pressed flat, 1 held up
  lean: Spring; // 0..1, how far its pulled edge is tipped up
  dir: number; // the direction it is pulled in, radians
  landing: boolean;
}

interface Drag {
  s: Sticker;
  id: number;
  sx: number; sy: number; // where the finger came down
  x0: number; y0: number; r0: number; // the sticker then
  gx: number; gy: number; // grab point from its centre, px
  size: number;
  free: boolean;
  tx: number; ty: number; // where the finger has taken it (before the catch-up and the swing)
  cx: number; cy: number; // the gap to close as it comes free
  bounds: { x0: number; x1: number; y0: number; y1: number };
  trX: VelocityTracker; trY: VelocityTracker;
}

function init(root: HTMLElement, signal: AbortSignal) {
  const stickers: Sticker[] = [...root.querySelectorAll<HTMLElement>('[data-s1-st]')].map((el) => {
    const base = parseFloat(getComputedStyle(el.parentElement!).getPropertyValue('--r')) || 0;
    return {
      el,
      body: el.querySelector<HTMLElement>('[data-s1-body]')!,
      flat: el.querySelector<HTMLElement>('.s1-st__flat')!,
      lift: el.querySelector<HTMLElement>('.s1-st__lift')!,
      x: new Spring(0, { response: 0.45, damping: 1 }, 0.05),
      y: new Spring(0, { response: 0.45, damping: 1 }, 0.05),
      r: new Spring(base, { response: 0.4, damping: 0.8 }, 0.01),
      up: new Spring(0, { response: 0.2, damping: 1 }, 0.0005),
      lean: new Spring(0, { response: 0.3, damping: 1 }, 0.0005),
      dir: 0,
      landing: false,
    };
  });
  let z = 10;
  const drags = new Map<number, Drag>();

  function render(s: Sticker) {
    s.el.style.transform = `translate3d(${s.x.value.toFixed(2)}px,${s.y.value.toFixed(2)}px,0) rotate(${s.r.value.toFixed(3)}deg)`;
    const up = s.up.value;
    const lean = s.lean.value * LEAN;
    // The pulled edge comes up toward you: turn about the axis across the pull.
    const ax = Math.sin(s.dir), ay = -Math.cos(s.dir);
    const tilt = Math.abs(lean) < 0.01 ? '' : ` rotate3d(${ax.toFixed(4)},${ay.toFixed(4)},0,${lean.toFixed(2)}deg)`;
    s.body.style.transform = `perspective(700px)${tilt} scale(${(1 + 0.06 * up).toFixed(4)})`;
    const u = clamp(up, 0, 1);
    s.flat.style.opacity = (1 - u).toFixed(3);
    s.lift.style.opacity = u.toFixed(3);
    s.lift.style.transform = `translate3d(0,${(up * 6).toFixed(2)}px,0) scale(${(1 + 0.03 * up).toFixed(4)})`;
  }

  /* Where a sticker may go: anywhere in the section. In px from its slot, for its top-left corner. */
  function boundsOf(s: Sticker) {
    const slot = s.el.parentElement!.getBoundingClientRect();
    const area = root.getBoundingClientRect();
    const pad = 8;
    return {
      x0: area.left - slot.left + pad,
      x1: area.right - slot.left - slot.width - pad,
      y0: area.top - slot.top + pad,
      y1: area.bottom - slot.top - slot.height - pad,
    };
  }
  const soft = (v: number, lo: number, hi: number, size: number) =>
    v < lo ? lo - rubberband(lo - v, size) : v > hi ? hi + rubberband(v - hi, size) : v;

  function down(e: PointerEvent, s: Sticker) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ([...drags.values()].some((d) => d.s === s)) return;
    e.preventDefault();
    s.el.setPointerCapture(e.pointerId);
    s.el.style.zIndex = String(++z);
    s.el.classList.add('is-held');
    // Caught while it slides: it is in the hand at once, from where it is on screen.
    const sliding = s.landing || !s.x.settled || !s.y.settled;
    s.landing = false;
    s.x.set(s.x.value);
    s.y.set(s.y.value);
    const rect = s.el.getBoundingClientRect();
    const d: Drag = {
      s, id: e.pointerId, sx: e.clientX, sy: e.clientY,
      x0: s.x.value, y0: s.y.value, r0: s.r.value,
      gx: e.clientX - (rect.left + rect.width / 2), gy: e.clientY - (rect.top + rect.height / 2),
      size: Math.max(s.el.offsetWidth, s.el.offsetHeight),
      free: sliding, tx: s.x.value, ty: s.y.value, cx: 0, cy: 0,
      bounds: boundsOf(s),
      trX: new VelocityTracker(), trY: new VelocityTracker(),
    };
    d.trX.reset(e.clientX, e.timeStamp);
    d.trY.reset(e.clientY, e.timeStamp);
    drags.set(e.pointerId, d);
    // Response on the touch itself: it comes up off the paper a little, before anything moves.
    s.up.to(sliding ? 1 : 0.25, { response: 0.16, damping: 1 });
    tick();
  }

  function move(e: PointerEvent) {
    const d = drags.get(e.pointerId);
    if (!d) return;
    d.trX.push(e.clientX, e.timeStamp);
    d.trY.push(e.clientY, e.timeStamp);
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    const s = d.s;
    if (!d.free) {
      const dist = Math.hypot(dx, dy);
      if (dist < PEEL) {
        // Still stuck: it gives a little toward the finger, less and less, and its near edge tips up.
        const k = dist / PEEL;
        s.dir = Math.atan2(dy, dx) - s.r.value * RAD; // in the sticker's own frame
        s.x.set(d.x0 + rubberband(dx, 70, 0.4));
        s.y.set(d.y0 + rubberband(dy, 70, 0.4));
        s.lean.set(k * k);
        s.up.set(0.25 + 0.45 * k);
        tick();
        return;
      }
      // Off the paper. The gap between where it was held back and the finger closes quickly (in the
      // frame loop), and from then on it is 1:1. The tipped edge drops flat with a little wobble.
      d.free = true;
      d.sx = e.clientX - dx; // unchanged; the drag carries on from the same origin
      d.cx = s.x.value - (d.x0 + dx);
      d.cy = s.y.value - (d.y0 + dy);
      s.lean.to(0, { response: 0.32, damping: 0.55 });
      s.up.to(1, { response: 0.22, damping: 0.85 });
      if ('vibrate' in navigator) navigator.vibrate(6);
    }
    d.tx = d.x0 + dx;
    d.ty = d.y0 + dy;
    tick();
  }

  function up(e: PointerEvent) {
    const d = drags.get(e.pointerId);
    if (!d) return;
    drags.delete(e.pointerId);
    const s = d.s;
    s.el.classList.remove('is-held');
    const cancel = e.type !== 'pointerup';
    if (!d.free) {
      // Let go before it came off: it settles back flat where it is stuck.
      s.x.to(d.x0, { response: 0.3, damping: 1 });
      s.y.to(d.y0, { response: 0.3, damping: 1 });
      s.lean.to(0, { response: 0.34, damping: 0.6 });
      s.up.to(0, { response: 0.26, damping: 0.7 });
      tick();
      return;
    }
    // The finger's speed over its last few frames, so nothing brakes or lurches as it lifts.
    const vx = cancel ? 0 : d.trX.velocity(e.timeStamp, 50);
    const vy = cancel ? 0 : d.trY.velocity(e.timeStamp, 50);
    // A sticker slides on paper: more friction than a scroll view (0.99, not 0.998).
    const b = d.bounds;
    const lx = clamp(s.x.value + project(vx, 0.99), b.x0, b.x1);
    const ly = clamp(s.y.value + project(vy, 0.99), b.y0, b.y1);
    // A spring stiffer than the throw would yank it forward: soften it until it only slows down
    // (as the carousel does). Each axis on its own spring.
    const resp = (D: number, v: number) => clamp((Math.PI * Math.abs(D)) / Math.max(1, Math.abs(v)), 0.3, 0.75);
    s.x.to(lx, { response: resp(lx - s.x.value, vx), damping: 1, velocity: vx });
    s.y.to(ly, { response: resp(ly - s.y.value, vy), damping: 1, velocity: vy });
    // It keeps the angle it swung to, a little more with whatever spin it had.
    s.r.to(s.r.value + s.r.velocity * 0.08, { response: 0.5, damping: 1 });
    s.landing = true;
    tick();
  }

  for (const s of stickers) {
    s.el.addEventListener('pointerdown', (e) => down(e, s));
    s.el.addEventListener('pointermove', move);
    s.el.addEventListener('pointerup', up);
    s.el.addEventListener('pointercancel', up);
    s.el.addEventListener('lostpointercapture', (e) => drags.has(e.pointerId) && up(e));
    s.el.addEventListener('dragstart', (e) => e.preventDefault());
  }

  /* ------------------------------------------------------------------ the clock */
  let raf = 0;
  let last = 0;
  function tick() {
    if (!raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }
  function frame(now: number) {
    raf = 0;
    const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 120;
    last = now;
    let busy = drags.size > 0;
    for (const d of drags.values()) {
      if (!d.free) continue;
      const s = d.s;
      // Close the gap left by the peel.
      const k = Math.exp(-dt / 0.06);
      d.cx *= k;
      d.cy *= k;
      // Swing: a sticker held off-centre and moved sideways hangs back from the hand. Held above its
      // middle and moved right, its bottom trails left: it turns clockwise.
      const vx = d.trX.velocity(now, 80);
      const lever = clamp(-d.gy / d.size, -0.6, 0.6) * 2;
      const vy = d.trY.velocity(now, 80);
      const leverX = clamp(d.gx / d.size, -0.6, 0.6) * 2;
      s.r.to(d.r0 + clamp((vx * lever + vy * leverX) * 0.012, -24, 24), { response: 0.4, damping: 0.8 });
      s.r.step(dt);
      // Hold the grab point under the finger as it turns: the centre moves round it.
      const a = (s.r.value - d.r0) * RAD;
      const gx = d.gx * Math.cos(a) - d.gy * Math.sin(a);
      const gy = d.gx * Math.sin(a) + d.gy * Math.cos(a);
      const b = d.bounds;
      s.x.set(soft(d.tx + d.cx + (d.gx - gx), b.x0, b.x1, d.size));
      s.y.set(soft(d.ty + d.cy + (d.gy - gy), b.y0, b.y1, d.size));
      busy = !s.up.step(dt) || busy;
      busy = !s.lean.step(dt) || busy;
      render(s);
    }
    const held = new Set([...drags.values()].filter((d) => d.free).map((d) => d.s));
    for (const s of stickers) {
      if (held.has(s)) continue;
      let moving = false;
      moving = !s.x.step(dt) || moving;
      moving = !s.y.step(dt) || moving;
      moving = !s.r.step(dt) || moving;
      moving = !s.lean.step(dt) || moving;
      // Nearly there: it comes down onto the paper, pressing a touch past flat as it sticks.
      if (s.landing && Math.hypot(s.x.target - s.x.value, s.y.target - s.y.value) < 6) {
        s.landing = false;
        s.up.to(0, { response: 0.3, damping: 0.55 });
      }
      moving = !s.up.step(dt) || moving || s.landing;
      if (moving || drags.size) render(s);
      busy = busy || moving;
    }
    if (busy) raf = requestAnimationFrame(frame);
  }

  signal.addEventListener('abort', () => cancelAnimationFrame(raf));
}
