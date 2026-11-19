/**
 * s4/a, "White label". The tear tape follows the finger 1:1 from where it was grabbed; let go, it
 * finishes or springs back depending on where the throw would have taken it (Apple's projection), at
 * the finger's own speed. The film then swings away, the disc slides out of the sleeve's open side, and
 * dragging the disc sideways turns it over about its vertical axis like a hand would, landing on a side
 * on a rotation spring (damping 0.8, response 0.4: Apple's rotation values). Tapping the sleeve sends
 * the disc back in the way it came. Everything is a spring from physics.ts in one frame loop, written
 * to transform and opacity only.
 */
import { onPage } from '@/scripts/page';
import { Spring, VelocityTracker, clamp, project, rubberband } from '@/components/music/v4/physics';
import { s4Copy } from './copy';

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('[data-s4w]');
  if (root) init(root, signal);
});

function init(root: HTMLElement, signal: AbortSignal) {
  const q = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const pair = q('[data-s4w-pair]');
  const sleeve = q('[data-s4w-sleeve]');
  const disc = q('[data-s4w-disc]');
  const spin = q('[data-s4w-spin]');
  const discShadow = q('[data-s4w-disc-shadow]');
  const tab = q<HTMLButtonElement>('[data-s4w-tab]');
  const stripWin = q('[data-s4w-strip-win]');
  const stripBand = q('[data-s4w-strip-band]');
  const filmTop = q('[data-s4w-film="top"]');
  const filmBottom = q('[data-s4w-film="bottom"]');
  const faceA = q('.s4w-face--a');
  const faceB = q('.s4w-face--b');
  const capA = q('[data-s4w-cap="0"]');
  const capB = q('[data-s4w-cap="1"]');
  const hint = q('[data-s4w-hint]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const c = s4Copy.whiteLabel;

  const peel = new Spring(0, { response: 0.35, damping: 1 }, 0.0005); // 0 sealed, 1 tape off
  const away = new Spring(0, { response: 0.5, damping: 1 }, 0.0005); // 0 film on, 1 film gone
  const out = new Spring(0, { response: 0.7, damping: 1 }, 0.0005); // 0 disc in the sleeve, 1 out beside it
  const turn = new Spring(0, { response: 0.4, damping: 0.8 }, 0.05); // degrees about the vertical axis
  let unwrapped = false;

  let S = 0;
  let wide = true;
  const measure = () => {
    S = pair.offsetWidth;
    wide = innerWidth >= 700;
  };

  /* ---------------------------------------------------------------- the tape */
  const tapeTracker = new VelocityTracker();
  let tapeDrag: { id: number; grab: number } | null = null;
  tab.addEventListener('pointerdown', (e) => {
    if (unwrapped || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    tab.setPointerCapture(e.pointerId);
    tab.classList.add('is-pressed');
    // Where the finger took hold, relative to how far the tape had got: it stays under the finger.
    tapeDrag = { id: e.pointerId, grab: e.clientX - peel.value * S };
    tapeTracker.reset(e.clientX, e.timeStamp);
    peel.set(peel.value); // caught where it is, mid-flight too
    tick();
  });
  tab.addEventListener('pointermove', (e) => {
    if (!tapeDrag || e.pointerId !== tapeDrag.id) return;
    tapeTracker.push(e.clientX, e.timeStamp);
    const p = (e.clientX - tapeDrag.grab) / S;
    // Before the start it resists: there is nothing to pull back past.
    peel.set(p < 0 ? rubberband(p * S, S) / S : Math.min(p, 1.02));
    tick();
  });
  const endTape = (e: PointerEvent) => {
    if (!tapeDrag || e.pointerId !== tapeDrag.id) return;
    tapeDrag = null;
    tab.classList.remove('is-pressed');
    const v = e.type === 'pointercancel' ? 0 : tapeTracker.velocity(e.timeStamp, 40) / S; // sleeves per s
    // Where the throw would end decides, not where the finger lifted.
    const lands = peel.value + project(v * S) / S;
    peel.to(lands > 0.5 ? 1 : 0, { response: 0.35, damping: 1, velocity: v });
    tick();
  };
  tab.addEventListener('pointerup', endTape);
  tab.addEventListener('pointercancel', endTape);
  // The keyboard: Enter or Space on the tab pulls it all the way.
  tab.addEventListener('click', (e) => {
    if (e.detail !== 0 || unwrapped) return;
    peel.to(1, { response: 0.5 });
    tick();
  });

  /* ---------------------------------------------------------------- the sleeve: take out, put back */
  sleeve.addEventListener('click', (e) => {
    if (!unwrapped || (e.target as HTMLElement).closest('[data-s4w-tab]')) return;
    out.to(out.target > 0.5 ? 0 : 1, { response: 0.7, damping: 1 });
    tick();
  });
  sleeve.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (!unwrapped) peel.to(1, { response: 0.5 });
    else out.to(out.target > 0.5 ? 0 : 1);
    tick();
  });

  /* ---------------------------------------------------------------- the disc: turn it over */
  const turnTracker = new VelocityTracker();
  let discDrag: { id: number; x0: number; a0: number; active: boolean } | null = null;
  const degPerPx = () => 180 / (S * 0.85); // a stroke across most of the disc turns it over
  disc.addEventListener('pointerdown', (e) => {
    if (out.value < 0.85 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    discDrag = { id: e.pointerId, x0: e.clientX, a0: turn.value, active: false };
    turnTracker.reset(e.clientX, e.timeStamp);
  });
  disc.addEventListener('pointermove', (e) => {
    if (!discDrag || e.pointerId !== discDrag.id) return;
    const dx = e.clientX - discDrag.x0;
    if (!discDrag.active) {
      if (Math.abs(dx) < 8) return;
      // Clearly a turn: from here on it is the disc's, and from where it is now (no jump by the threshold).
      discDrag.active = true;
      discDrag.x0 = e.clientX;
      turn.set(turn.value);
      discDrag.a0 = turn.value;
      disc.setPointerCapture(e.pointerId);
      return;
    }
    turnTracker.push(e.clientX, e.timeStamp);
    turn.set(discDrag.a0 + dx * degPerPx());
    tick();
  });
  const endDisc = (e: PointerEvent) => {
    if (!discDrag || e.pointerId !== discDrag.id) return;
    const d = discDrag;
    discDrag = null;
    const from = Math.round(d.a0 / 180) * 180;
    if (!d.active) {
      // A tap turns it over, the way a hand would: towards you on the right.
      turn.to(from + 180, { response: 0.45, damping: 1 });
    } else {
      const v = e.type === 'pointercancel' ? 0 : turnTracker.velocity(e.timeStamp, 40) * degPerPx();
      const lands = turn.value + project(v);
      // One side at a time, whatever the throw: a disc doesn't spin like a coin.
      const to = clamp(Math.round(lands / 180) * 180, from - 180, from + 180);
      // A flick earns the bounce; a slow turn settles without one.
      turn.to(to, { response: 0.4, damping: Math.abs(v) > 300 ? 0.8 : 1, velocity: v });
    }
    tick();
  };
  disc.addEventListener('pointerup', endDisc);
  disc.addEventListener('pointercancel', endDisc);
  disc.addEventListener('dragstart', (e) => e.preventDefault());

  /* ---------------------------------------------------------------- render */
  const smooth = (t: number) => t * t * (3 - 2 * t);
  let hintText = '';
  function render() {
    const p = clamp(peel.value, -0.2, 1);
    // The tape: the window moves right and the band left inside it, so the band stays put while less
    // of it shows; the tab rides on the tear.
    stripWin.style.transform = `translate3d(${(Math.max(0, p) * S).toFixed(2)}px,0,0)`;
    stripBand.style.transform = `translate3d(${(-Math.max(0, p) * S).toFixed(2)}px,0,0)`;
    tab.style.transform = `translate3d(${(p * S).toFixed(2)}px,0,0)`;
    tab.style.opacity = unwrapped ? '0' : String(clamp((1 - p) / 0.1, 0, 1));
    tab.style.visibility = unwrapped && away.value > 0.2 ? 'hidden' : '';

    // The film: the two pieces swing away from the sleeve's open (right) side, up and down.
    const a = away.value;
    filmTop.style.transform = `translate3d(${(a * S * 0.18).toFixed(2)}px,${(-a * S * 0.32).toFixed(2)}px,0) rotate(${(a * 14).toFixed(2)}deg)`;
    filmBottom.style.transform = `translate3d(${(a * S * 0.22).toFixed(2)}px,${(a * S * 0.3).toFixed(2)}px,0) rotate(${(-a * 11).toFixed(2)}deg)`;
    filmTop.style.opacity = filmBottom.style.opacity = String(clamp(1 - a * 1.4, 0, 1));
    stripWin.style.opacity = String(clamp(1 - a * 3, 0, 1));

    // The disc out of the open side; the sleeve moves the other way so the pair stays centred. On a
    // phone it comes out below, and the sleeve steps back.
    const o = out.value;
    if (wide) {
      sleeve.style.transform = `translate3d(${(-o * S * 0.54).toFixed(2)}px,0,0)`;
      disc.style.transform = `translate3d(${(o * S * 0.54).toFixed(2)}px,0,0)`;
    } else {
      const k = 0.62;
      // Sealed it sits lower, in the middle of its room; it makes room as the disc comes out.
      pair.style.transform = `translate3d(0,${((1 - o) * S * 0.3).toFixed(2)}px,0)`;
      sleeve.style.transform = `translate3d(0,${(-o * S * 0.44).toFixed(2)}px,0) scale(${(1 - o * (1 - k)).toFixed(4)})`;
      disc.style.transform = `translate3d(0,${(o * S * 0.5).toFixed(2)}px,0)`;
    }
    // In front of the sleeve once it is clear of it (it is turned over in front of you).
    disc.style.zIndex = o > 0.92 ? '3' : '1';
    discShadow.style.opacity = String(clamp((o - 0.4) / 0.5, 0, 1));

    // The turn. Edge-on it would vanish: a disc has a little thickness, so it never goes below a sliver.
    const t = turn.value;
    spin.style.transform = `rotateY(${t.toFixed(2)}deg)`;
    const cos = Math.cos((t * Math.PI) / 180);
    // Which face shows is decided here, not by backface-visibility: WebKit drew the far face through.
    faceA.style.visibility = cos >= 0 ? '' : 'hidden';
    faceB.style.visibility = cos < 0 ? '' : 'hidden';
    // The caption is whichever side faces you, changing over as the disc passes edge-on.
    capA.style.opacity = String(smooth(clamp(cos / 0.35 * 0.5 + 0.5, 0, 1)));
    capB.style.opacity = String(smooth(clamp(-cos / 0.35 * 0.5 + 0.5, 0, 1)));

    const h = !unwrapped ? c.hintSealed : o < 0.5 ? c.hintIn : c.hintOut;
    if (h !== hintText) hint.textContent = hintText = h;
  }

  /* ---------------------------------------------------------------- the clock */
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
    let busy = !!tapeDrag || !!discDrag?.active;
    if (!tapeDrag) busy = !peel.step(dt) || busy;
    busy = !away.step(dt) || busy;
    busy = !out.step(dt) || busy;
    if (!discDrag?.active) busy = !turn.step(dt) || busy;
    if (!unwrapped && peel.target === 1 && peel.value >= 0.99) {
      unwrapped = true;
      root.toggleAttribute('data-s4w-unwrapped', true);
      sleeve.setAttribute('aria-label', 'Take the record out, or put it back');
      away.to(1);
      busy = true;
    }
    // The disc follows the film out, as the film clears the open side: not on a timer.
    if (unwrapped && away.value > 0.45 && out.target === 0 && !tookOut) {
      tookOut = true;
      out.to(1, { response: 0.75, damping: 1 });
      busy = true;
    }
    render();
    if (busy) raf = requestAnimationFrame(frame);
  }
  let tookOut = false;

  if (reduced) {
    // No travel: the tape and film simply go, and the disc is beside the sleeve.
    peel.response = 0.2;
  }

  measure();
  render();
  window.addEventListener('resize', () => { measure(); render(); }, { signal });
  signal.addEventListener('abort', () => cancelAnimationFrame(raf));
}
