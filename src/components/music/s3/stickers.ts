/**
 * Sketch s3/c, "Hype stickers". Each sticker is laid down as the page brings it up: it arrives a
 * little above the surface, larger, turned a little further, and is pressed flat as it reaches its
 * place, so the frames on the way say where it is going (§8). A hand can peel one up and put it
 * elsewhere: it follows 1:1 from where it was taken, swings with the hand's speed like a held card,
 * and when let go it travels to where the throw would come to rest and sticks there (§2, §5, §6).
 */
import { Spring, VelocityTracker, clamp, project, rubberband } from '@/components/music/v4/physics';
import { onPage } from '@/scripts/page';

onPage((signal) => {
  const stage = document.querySelector<HTMLElement>('[data-s3c-stage]');
  if (!stage) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let front = 10;

  const items = [...stage.querySelectorAll<HTMLElement>('[data-s3c-sticker]')].map((el) => {
    const shadow = document.createElement('div');
    shadow.className = 's3c-shadow';
    shadow.setAttribute('aria-hidden', 'true');
    el.prepend(shadow);
    return {
      el, shadow,
      r0: parseFloat(getComputedStyle(el).getPropertyValue('--r')) || 0,
      x: new Spring(0, { response: 0.4, damping: 1 }, 0.05),
      y: new Spring(0, { response: 0.4, damping: 1 }, 0.05),
      rot: new Spring(0, { response: 0.4, damping: 0.8 }, 0.01), // Apple's rotation spring
      lift: new Spring(0, { response: 0.25, damping: 1 }, 0.001),
      press: new Spring(1, { response: 0.45, damping: 0.72 }, 0.001), // laid down with a little give
      held: false,
    };
  });
  type Item = (typeof items)[number];

  /* Laid down as it comes up the screen: held above the surface while low, pressed flat by the time
     it is two fifths of the way up. */
  function lay() {
    const vh = innerHeight;
    const top = stage!.getBoundingClientRect().top;
    for (const it of items) {
      const p = reduce.matches ? 1 : clamp((vh * 0.95 - (top + it.el.offsetTop)) / (vh * 0.3), 0, 1);
      if (Math.abs(it.press.target - p) > 0.001) it.press.to(p);
    }
  }

  const write = (it: Item) => {
    const up = 1 - it.press.value; // how far above the surface
    const l = it.lift.value;
    it.el.style.transform =
      `translate3d(${it.x.value.toFixed(2)}px,${(it.y.value - up * 36).toFixed(2)}px,0) ` +
      `rotate(${(it.r0 + it.rot.value + up * 7).toFixed(3)}deg) scale(${(1 + up * 0.12 + l * 0.05).toFixed(4)})`;
    const s = Math.max(up, l);
    it.shadow.style.opacity = (0.9 * Math.min(1, s * 1.4)).toFixed(3);
    it.shadow.style.transform = `translate3d(0,${(s * 18).toFixed(2)}px,0) scale(${(1 + s * 0.03).toFixed(4)})`;
  };

  let raf = 0, last = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    let rest = true;
    for (const it of items) {
      if (!it.held) { rest = it.x.step(dt) && rest; rest = it.y.step(dt) && rest; }
      rest = it.rot.step(dt) && rest;
      rest = it.lift.step(dt) && rest;
      rest = it.press.step(dt) && rest;
      write(it);
    }
    raf = rest && !items.some((i) => i.held) ? 0 : requestAnimationFrame(frame);
    if (!raf) last = 0;
  };
  const tick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  signal.addEventListener('abort', () => cancelAnimationFrame(raf));

  lay();
  for (const it of items) { it.press.set(it.press.target); write(it); }
  addEventListener('scroll', () => { lay(); tick(); }, { passive: true, signal });

  /* Peeled up by a hand. */
  for (const it of items) {
    let pid = -1, sx = 0, sy = 0, x0 = 0, y0 = 0, decided = false;
    const tx = new VelocityTracker(), ty = new VelocityTracker();
    const bounds = () => {
      const w = it.el.offsetWidth, h = it.el.offsetHeight;
      return {
        xlo: -it.el.offsetLeft - w * 0.2, xhi: stage!.clientWidth - it.el.offsetLeft - w * 0.8,
        ylo: -it.el.offsetTop - h * 0.1, yhi: stage!.clientHeight - it.el.offsetTop - h * 0.6,
      };
    };
    const soft = (v: number, lo: number, hi: number, dim: number) => (v < lo ? lo + rubberband(v - lo, dim) : v > hi ? hi + rubberband(v - hi, dim) : v);
    const begin = (e: PointerEvent) => {
      it.held = true;
      it.el.setPointerCapture(e.pointerId);
      it.el.classList.add('is-held');
      it.el.style.zIndex = String(++front);
      x0 = it.x.value; y0 = it.y.value;
      it.x.set(x0); it.y.set(y0); // caught where it is, mid-flight
      it.lift.to(1);
      tx.reset(0, e.timeStamp); ty.reset(0, e.timeStamp);
      tick();
    };
    it.el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      pid = e.pointerId; sx = e.clientX; sy = e.clientY;
      decided = e.pointerType === 'mouse';
      if (decided) { e.preventDefault(); begin(e); }
      // Feedback on the press itself, before any move (§1).
      it.lift.to(0.35); tick();
    }, { signal });
    it.el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!decided) {
        if (Math.hypot(dx, dy) < 10) return;
        decided = true;
        if (Math.abs(dy) > Math.abs(dx)) { pid = -1; it.lift.to(0); tick(); return; } // the page's scroll
        begin(e);
      }
      if (!it.held) return;
      const b = bounds();
      it.x.set(soft(x0 + dx, b.xlo, b.xhi, 120));
      it.y.set(soft(y0 + dy, b.ylo, b.yhi, 120));
      tx.push(dx, e.timeStamp); ty.push(dy, e.timeStamp);
      // It swings with the hand, as a card held at one edge does.
      it.rot.to(clamp(tx.velocity(e.timeStamp, 60) / 110, -14, 14));
      tick();
    }, { signal });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      pid = -1;
      it.lift.to(0);
      if (!it.held) { tick(); return; }
      it.held = false;
      it.el.classList.remove('is-held');
      const vx = tx.velocity(e.timeStamp), vy = ty.velocity(e.timeStamp);
      const b = bounds();
      // X and Y on their own springs, each from its own velocity (§3), to where the throw comes to rest.
      const thrown = Math.hypot(vx, vy) > 400;
      it.x.to(clamp(it.x.value + project(vx, 0.994), b.xlo, b.xhi), { velocity: vx, damping: thrown ? 0.8 : 1, response: 0.42 });
      it.y.to(clamp(it.y.value + project(vy, 0.994), b.ylo, b.yhi), { velocity: vy, damping: thrown ? 0.8 : 1, response: 0.42 });
      it.rot.to(0);
      tick();
    };
    it.el.addEventListener('pointerup', end, { signal });
    it.el.addEventListener('pointercancel', end, { signal });
  }
});
