/**
 * The page's hairlines as a medium. Every section rule (.sec__rule) is redrawn as a string that
 * scrolling sets vibrating: the speed of the scroll feeds a damped travelling wave, so the lines ripple
 * when the page moves and settle when it stops. When a section first comes into view, a laser pulse runs
 * along its rule once. The header carries a beam that grows with the reading.
 */
import { reduceMotion, token } from './figure';

interface Rule { el: HTMLElement; c: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; visible: boolean; pulse: number; phase: number }

export function initWaves() {
  const still = reduceMotion();
  const gold = token('--gold');
  const rules: Rule[] = [];
  const H = 18; // canvas height around the line, CSS px

  document.querySelectorAll<HTMLElement>('.sec__rule').forEach((el) => {
    const c = document.createElement('canvas');
    c.className = 'rule-canvas';
    c.setAttribute('aria-hidden', 'true');
    el.prepend(c);
    el.classList.add('has-wave');
    rules.push({ el, c, ctx: c.getContext('2d')!, w: 0, visible: false, pulse: -1, phase: Math.random() * 6 });
  });

  const fit = (r: Rule) => {
    const dpr = Math.min(devicePixelRatio || 1, 3);
    const w = Math.round(r.el.getBoundingClientRect().width);
    if (w === r.w) return;
    r.w = w; r.c.width = Math.round(w * dpr); r.c.height = Math.round(H * dpr);
    r.c.style.width = `${w}px`; r.c.style.height = `${H}px`;
    r.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  let energy = 0, lastY = scrollY, t = 0, raf = 0, last = 0;
  const draw = (r: Rule) => {
    const { ctx, w } = r;
    ctx.clearRect(0, 0, w, H);
    const mid = H / 2 + 0.5;
    const A = Math.min(6, energy * 6);
    const k = (2 * Math.PI) / 220, om = 5;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 3) {
      const env = Math.sin((Math.PI * x) / w); // fixed at both ends, like a string
      const y = mid + A * env * Math.sin(k * x - om * t + r.phase) * Math.exp(-((x / w - 0.5) ** 2) * 1.2);
      x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = 'rgba(236,235,230,0.14)'; ctx.lineWidth = 1; ctx.stroke();
    // The laser pulse: a bright head with a fading tail.
    if (r.pulse >= 0 && r.pulse <= 1.3) {
      const head = r.pulse * w;
      const g = ctx.createLinearGradient(head - 240, 0, head, 0);
      g.addColorStop(0, 'rgba(226,194,125,0)'); g.addColorStop(1, gold);
      ctx.strokeStyle = g; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(Math.max(0, head - 240), mid); ctx.lineTo(Math.min(w, head), mid); ctx.stroke();
      if (head < w) {
        const glow = ctx.createRadialGradient(head, mid, 0, head, mid, 7);
        glow.addColorStop(0, 'rgba(226,194,125,0.9)'); glow.addColorStop(1, 'rgba(226,194,125,0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(head, mid, 7, 0, Math.PI * 2); ctx.fill();
      }
    }
  };

  const tick = (now: number) => {
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016; last = now; t += dt;
    energy *= Math.exp(-dt * 2.2);
    let busy = energy > 0.01;
    for (const r of rules) {
      if (!r.visible) continue;
      if (r.pulse >= 0 && r.pulse <= 1.3) { r.pulse += dt * 0.75; busy = true; }
      draw(r);
    }
    raf = busy ? requestAnimationFrame(tick) : 0;
    if (!raf) last = 0;
  };
  const wake = () => { if (!raf && !still) raf = requestAnimationFrame(tick); };

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const r = rules.find((x) => x.el === e.target)!;
      r.visible = e.isIntersecting;
      if (r.visible) { fit(r); if (r.pulse < 0 && !still) r.pulse = 0; draw(r); wake(); }
    }
  });
  rules.forEach((r) => io.observe(r.el));
  new ResizeObserver(() => rules.forEach((r) => { fit(r); draw(r); })).observe(document.body);

  addEventListener('scroll', () => {
    const v = Math.abs(scrollY - lastY); lastY = scrollY;
    energy = Math.min(1, energy + v / 900);
    wake();
  }, { passive: true });

  // The reading beam in the header.
  const beam = document.querySelector<HTMLElement>('[data-beam]');
  if (beam) {
    const set = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      beam.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
    };
    addEventListener('scroll', set, { passive: true }); set();
  }
}
