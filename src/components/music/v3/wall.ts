/**
 * The wall's motion (Design 3). One spring, `lift`, carries a record from its ledge to the top of the
 * screen and back (0 on the wall, 1 out); `pull` is how far the sheet has been dragged down; `tear`
 * is the tear strip (0 sealed, 1 the tab at the sleeve's right edge). Every frame writes only
 * transform and opacity, every spring starts from what is on screen, and every gesture can catch a
 * motion in flight.
 */
import { vinyls, type Vinyl } from '@/data/music-sleeves';
import { Spring, project, rubberband, VelocityTracker, clamp01, smoothstep, type SpringConfig } from './spring';
import { stickerInk } from './sleeve-art';

const LEAN = 5; // degrees a sleeve leans back on its ledge (matches --lean)
const PERSPECTIVE = 600; // px, the wall's perspective (matches wall.css)

// Springs. Critically damped unless the gesture itself carried momentum.
const LIFT: SpringConfig = { response: 0.5, damping: 1 };
const HOME: SpringConfig = { response: 0.46, damping: 1 };
const FADE: SpringConfig = { response: 0.22, damping: 1 }; // reduced motion: a short cross-fade
const SNAP: SpringConfig = { response: 0.34, damping: 1 };
const RESEAL: SpringConfig = { response: 0.3, damping: 1 };
const TEAR_OFF: SpringConfig = { response: 0.3, damping: 1 };
const TEAR_FLICK: SpringConfig = { response: 0.3, damping: 0.85 };
/** Where the finished tab comes to rest: past the right edge, slipping off. */
const TEAR_END = 1.16;

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const EASE_SHEET = 'cubic-bezier(0.32, 0.72, 0, 1)';

export function initWall(): void {
  const root = document.querySelector<HTMLElement>('[data-music-page]');
  if (!root) return;
  const q = <T extends HTMLElement = HTMLElement>(sel: string): T => {
    const el = root.querySelector<T>(sel);
    if (!el) throw new Error(`music v3: missing ${sel}`);
    return el;
  };

  const room = q('[data-room]');
  const stage = q('[data-stage]');
  const scrim = q('[data-scrim]');
  const glow = q('[data-glow]');
  const scroller = q('[data-scroller]');
  const col = q('[data-col]');
  const flyer = q('[data-flyer]');
  const flyerShadow = q('[data-flyer-shadow]');
  const flyerBody = q('[data-flyer-body]');
  const strip = q('[data-unwrap]');
  const tab = q('[data-unwrap-handle]');
  const keep = q('[data-tear-keep]');
  const band = q('[data-tear-band]');
  const sheet = q('[data-sheet]');
  const sheetBg = q('[data-sheet-bg]');
  const sheetInner = q('[data-sheet-inner]');
  const title = q('[data-title]');
  const artist = q('[data-artist]');
  const details = q('[data-details]');
  const whyText = q('[data-why-text]');
  const tracklist = q('[data-tracklist]');
  const facts = q('[data-info]');
  const closeBtn = q<HTMLButtonElement>('[data-record-close]');
  const footer = document.querySelector<HTMLElement>('.music-footer');

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = (): boolean => reducedMotion.matches;

  interface Current {
    v: Vinyl;
    btn: HTMLButtonElement;
    sleeve: HTMLElement;
    wrap: HTMLElement | null;
    sheen: HTMLElement | null;
    /** The film has started coming away (the tab crossed the right edge). */
    shed: boolean;
  }
  let cur: Current | null = null;
  let phase: 'closed' | 'open' | 'closing' = 'closed';
  const unwrapped = new Set<string>();

  // Geometry: where the sleeve hangs on the wall (src) and where it rests when out (dst, at scrollTop 0).
  let src = { cx: 0, top: 0, w: 1 };
  let dst = { cx: 0, top: 0, w: 1, h: 1 };
  let pullY = 0;

  const lift = new Spring(0, () => render(), 0.0004);
  const pull = new Spring(0, (v) => { pullY = v; render(); }, 0.2);
  const tear = new Spring(0, (v) => renderTear(v), 0.0004);

  // ---------- Rendering ----------

  function render(): void {
    const p = lift.value;
    const vis = clamp01(p) * (1 - clamp01(pullY / (innerHeight * 0.9)));

    if (reduced()) {
      stage.style.opacity = String(clamp01(p));
      flyer.style.transform = pullY ? `translate3d(0, ${pullY}px, 0)` : '';
      sheet.style.transform = pullY ? `translate3d(0, ${pullY}px, 0)` : '';
      scrim.style.opacity = String(0.82 * (1 - clamp01(pullY / (innerHeight * 0.9))));
      glow.style.opacity = String(vis);
      flyerShadow.style.opacity = '1';
      sheetBg.style.opacity = '1';
      sheetInner.style.opacity = '1';
      strip.style.opacity = '1';
      return;
    }

    const k = 1 - p;
    const base = (src.w / dst.w) * k + p;
    const s = base * (1 + 0.045 * Math.sin(Math.PI * clamp01(p))); // it comes forward mid-flight
    const dx = (src.cx - dst.cx) * k;
    const dstTop = dst.top - scroller.scrollTop;
    const dy = (src.top - dstTop) * k + pullY * p;
    const lean = LEAN * clamp01(k);
    const persp = PERSPECTIVE / Math.max(s, 0.05);
    const H = dst.h;
    flyer.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${s}) translateY(${H}px) perspective(${persp}px) rotateX(${lean}deg) translateY(${-H}px)`;
    flyerShadow.style.opacity = String(clamp01(p));
    strip.style.opacity = String(smoothstep(0.7, 1, p));

    scrim.style.opacity = String(0.82 * vis);
    glow.style.opacity = String(vis);
    room.style.transform = vis > 0.001 ? `scale(${1 - 0.06 * vis})` : '';

    sheet.style.transform = `translate3d(0, ${(1 - p) * 64 + pullY * p}px, 0) scale(${0.93 + 0.07 * p})`;
    sheetBg.style.opacity = String(smoothstep(0.3, 1, p));
    sheetInner.style.opacity = String(smoothstep(0.45, 1, p));
  }

  /** The strip's travel: the full width of the sleeve. */
  const travel = (): number => Math.max(strip.clientWidth, 1);

  function renderTear(u: number): void {
    const W = travel();
    const x = u * W;
    tab.style.transform = `translate3d(${x}px, 0, 0)`;
    tab.style.opacity = String(1 - smoothstep(1, TEAR_END, u));
    // Behind the tab the strip is gone: the band's keeper moves right, the band counter-moves so the
    // label stays put and is eaten from its left edge.
    const cut = Math.min(Math.max(x, 0), W);
    keep.style.transform = `translate3d(${cut}px, 0, 0)`;
    band.style.transform = `translate3d(${-cut}px, 0, 0)`;
    if (cur?.sheen) cur.sheen.style.opacity = String(1 - 0.5 * clamp01(u));
    flyer.classList.toggle('is-torn', u > 0.002 && !!cur?.wrap);
    if (u >= 1 && cur && !cur.shed && unwrapped.has(cur.v.id)) shedFilm();
  }

  // ---------- Geometry ----------

  function measure(): void {
    if (!cur) return;
    const before = flyer.style.transform;
    flyer.style.transform = 'none';
    const r = flyer.getBoundingClientRect();
    flyer.style.transform = before;
    dst = { cx: r.left + r.width / 2, top: r.top + scroller.scrollTop, w: r.width, h: flyer.offsetHeight };

    const roomBefore = room.style.transform;
    room.style.transform = 'none';
    const slot = cur.btn.querySelector<HTMLElement>('[data-slot]')!.getBoundingClientRect();
    room.style.transform = roomBefore;
    src = { cx: slot.left + slot.width / 2, top: slot.top, w: slot.width };
  }

  function lockPage(on: boolean): void {
    room.inert = on;
    if (footer) footer.inert = on;
    document.documentElement.style.overflow = on ? 'hidden' : '';
    if (on) {
      const r = room.getBoundingClientRect();
      room.style.transformOrigin = `50% ${innerHeight / 2 - r.top}px`;
    } else {
      room.style.transform = '';
      room.style.transformOrigin = '';
    }
  }

  // ---------- Filling the stage ----------

  const fact = (name: string): HTMLElement => facts.querySelector<HTMLElement>(`[data-fact="${name}"]`)!;

  function fill(v: Vinyl, sleeve: HTMLElement, sealed: boolean): Pick<Current, 'wrap' | 'sheen'> {
    flyerBody.innerHTML = sleeve.innerHTML.replaceAll('w3-', 'w3f-');
    let wrap = flyerBody.querySelector<HTMLElement>('[data-wrap]');
    let sheen = flyerBody.querySelector<HTMLElement>('[data-sheen]');
    sheen?.style.removeProperty('transform');
    if (!sealed) { wrap?.remove(); wrap = null; sheen = null; }

    title.textContent = v.title;
    artist.textContent = v.artist;
    whyText.textContent = v.about;
    tracklist.replaceChildren(...v.tracks.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
    tracklist.style.setProperty('--rows', String(Math.ceil(v.tracks.length / 2)));
    fact('label').textContent = v.label;
    fact('genre').textContent = v.genre;
    fact('year').textContent = String(v.year);
    fact('format').textContent = v.format;
    fact('tracks').textContent = String(v.tracks.length);
    glow.style.setProperty('--glow', v.palette[1]);
    flyer.style.setProperty('--tab', v.palette[3]);
    flyer.style.setProperty('--tab-ink', stickerInk(v.palette[3]));

    strip.hidden = !sealed;
    details.hidden = sealed;
    sheet.classList.toggle('is-open', !sealed);
    tab.classList.remove('is-held');
    tab.setAttribute('aria-valuenow', '0');
    flyer.classList.remove('is-torn');
    return { wrap, sheen };
  }

  // ---------- Open / close ----------

  function open(btn: HTMLButtonElement): void {
    if (phase !== 'closed') return;
    const v = vinyls.find((x) => x.id === btn.dataset.vinyl);
    const sleeve = btn.querySelector<HTMLElement>('[data-sleeve]');
    if (!v || !sleeve) return;
    const sealed = !unwrapped.has(v.id);

    cur = { v, btn, sleeve, wrap: null, sheen: null, shed: !sealed };
    Object.assign(cur, fill(v, sleeve, sealed));
    phase = 'open';

    stage.hidden = false;
    stage.style.opacity = '';
    scroller.setAttribute('data-record-open', v.id);
    scroller.toggleAttribute('data-record-unwrapped', !sealed);
    scroller.style.overflowY = '';
    scroller.scrollTop = 0;

    pull.set(0);
    tear.set(0);
    lockPage(true);
    measure();
    if (!reduced()) sleeve.classList.add('is-out');
    lift.set(0);
    lift.to(1, reduced() ? FADE : LIFT);

    if (!reduced()) {
      sheetInner.animate([{ filter: 'blur(6px)' }, { filter: 'blur(0px)' }], { duration: 460, delay: 120, easing: EASE_OUT, fill: 'backwards' });
    }
    (sealed ? tab : title).focus({ preventScroll: true });
  }

  function close(velocityY = 0): void {
    if (phase !== 'open' || !cur) return;
    phase = 'closing';
    endTearDrag(false);
    pull.stop();
    scroller.style.overflowY = 'hidden'; // stops any momentum scroll where it is
    measure();

    let v0 = 0;
    if (velocityY && !reduced()) {
      const span = dst.top - scroller.scrollTop + pullY - src.top;
      if (Math.abs(span) > 1) v0 = velocityY / span;
    }
    lift.to(0, reduced() ? FADE : HOME, { velocity: v0, onRest: finishClose });
  }

  function finishClose(): void {
    if (!cur) return;
    const { btn, sleeve } = cur;
    stage.hidden = true;
    scroller.removeAttribute('data-record-open');
    scroller.removeAttribute('data-record-unwrapped');
    scroller.style.overflowY = '';
    sleeve.classList.remove('is-out');
    lockPage(false);
    flyer.style.transform = '';
    pull.set(0);
    tear.stop();
    flyerBody.replaceChildren();
    cur = null;
    phase = 'closed';
    btn.focus({ preventScroll: true });
  }

  /** Caught in flight on its way home: it goes back out. */
  function reopen(): void {
    if (phase !== 'closing' || !cur) return;
    phase = 'open';
    scroller.style.overflowY = '';
    lift.to(1, reduced() ? FADE : LIFT);
  }

  // ---------- The tear strip ----------

  let tearId: number | null = null;
  let grabX = 0;
  const tearVelocity = new VelocityTracker();

  /** Past the point of no return: the tab runs off the edge on its own. */
  function commitTear(velocity: number): void {
    if (!cur || unwrapped.has(cur.v.id)) return;
    unwrapped.add(cur.v.id);
    cur.sleeve.classList.add('is-unwrapped');
    scroller.setAttribute('data-record-unwrapped', '');
    tab.setAttribute('aria-valuenow', '100');
    if (reduced()) {
      tear.set(TEAR_END);
      shedFilm();
      return;
    }
    tear.to(TEAR_END, velocity > 2.5 ? TEAR_FLICK : TEAR_OFF, { velocity: Math.max(velocity, 0) });
  }

  /** The tab has slipped off: the rest of the film comes away, then the record opens. */
  function shedFilm(): void {
    if (!cur || cur.shed) return;
    cur.shed = true;
    const id = cur.v.id;
    const wrap = cur.wrap;
    const hadFocus = document.activeElement === tab;
    const film = reduced()
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translate3d(0, -10px, 0) scale(1.025)' }];
    const off = wrap?.animate(film, { duration: reduced() ? 180 : 300, easing: EASE_OUT, fill: 'forwards' });
    const stripOff = strip.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-out', fill: 'forwards' });
    stripOff.onfinish = () => { strip.hidden = true; stripOff.cancel(); };
    if (off) off.onfinish = () => { wrap?.remove(); if (cur?.v.id === id) { cur.wrap = null; cur.sheen = null; flyer.classList.remove('is-torn'); } };
    setTimeout(() => revealDetails(id, hadFocus), reduced() ? 0 : 160);
  }

  /** The sheet grows to hold the record's story, which rises in beneath the sleeve. */
  function revealDetails(id: string, moveFocus: boolean): void {
    if (!cur || cur.v.id !== id || phase !== 'open') return;
    const h0 = sheetBg.offsetHeight;
    details.hidden = false;
    sheet.classList.add('is-open');
    const h1 = sheetBg.offsetHeight;
    const blocks = [...details.children] as HTMLElement[];

    if (reduced()) {
      details.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
    } else {
      // The material grows down from where it was (a one-off clip, not a per-frame layout change).
      sheetBg.animate(
        [{ clipPath: `inset(0 0 ${Math.max(h1 - h0, 0)}px 0 round 28px)` }, { clipPath: 'inset(0 0 0 0 round 28px)' }],
        { duration: 520, easing: EASE_SHEET },
      );
      sheetInner.animate([{ transform: 'translate3d(0, 10px, 0)' }, { transform: 'none' }], { duration: 520, easing: EASE_SHEET });
      blocks.forEach((el, i) => {
        el.animate([{ opacity: 0, transform: 'translate3d(0, 18px, 0)' }, { opacity: 1, transform: 'none' }], {
          duration: 520, delay: 60 + i * 70, easing: EASE_OUT, fill: 'backwards',
        });
      });
      // The sleeve moves up a little to make room.
      const nudge = Math.min(48, scroller.scrollHeight - scroller.clientHeight);
      if (nudge > 0 && scroller.scrollTop < 8) scroller.scrollTo({ top: nudge, behavior: 'smooth' });
    }
    if (moveFocus || document.activeElement === document.body) title.focus({ preventScroll: true });
  }

  function endTearDrag(settle: boolean): void {
    if (tearId === null) return;
    tearId = null;
    tab.classList.remove('is-held');
    if (settle) tear.to(0, RESEAL);
  }

  tab.addEventListener('pointerdown', (e) => {
    if (!cur || phase !== 'open' || unwrapped.has(cur.v.id) || tearId !== null || e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    tab.setPointerCapture(e.pointerId);
    tearId = e.pointerId;
    tear.stop();
    grabX = e.clientX - tear.value * travel(); // keep the finger where it took hold
    tearVelocity.reset();
    tearVelocity.add(e.timeStamp, e.clientX);
    tab.classList.add('is-held');
  });

  tab.addEventListener('pointermove', (e) => {
    if (e.pointerId !== tearId) return;
    const W = travel();
    const raw = (e.clientX - grabX) / W;
    let u = raw;
    if (raw < 0) u = -rubberband(-raw * W, W) / W;
    else if (raw > 1) u = 1 + rubberband((raw - 1) * W, W, 0.2) / W;
    tear.set(Math.min(u, 0.999)); // the tab only slips off once released past the point
    tearVelocity.add(e.timeStamp, e.clientX);
  });

  tab.addEventListener('pointerup', (e) => {
    if (e.pointerId !== tearId) return;
    endTearDrag(false);
    const W = travel();
    const v = tearVelocity.velocity(); // px/s
    const projected = tear.value * W + project(v, 0.99);
    if (tear.value > 0.94 || (projected > W * 0.6 && v > -50)) commitTear(v / W);
    else tear.to(0, RESEAL, { velocity: v / W });
  });
  tab.addEventListener('pointercancel', (e) => {
    if (e.pointerId === tearId) endTearDrag(true);
  });

  tab.addEventListener('keydown', (e) => {
    if (!cur || unwrapped.has(cur.v.id)) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'End' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commitTear(0);
    }
  });

  // ---------- Dragging the sheet down to put it back ----------

  const pullVelocity = new VelocityTracker();

  function releasePull(v: number): void {
    const projected = pullY + project(v);
    if ((projected > Math.min(innerHeight * 0.3, 240) && v > -150) || v > 1400) close(v);
    else pull.to(0, SNAP, { velocity: v });
  }

  function setPull(raw: number): void {
    pull.stop();
    pullY = raw >= 0 ? raw : -rubberband(-raw, innerHeight);
    render();
  }

  // Touch: a downward drag that starts with the content at its top pulls the sheet instead of scrolling.
  // A touch that starts on the tear strip is the strip's alone.
  let touchId: number | null = null;
  let touchStart = { x: 0, y: 0 };
  let touchMode: 'idle' | 'pull' | 'native' = 'native';
  let touchBase = 0;

  scroller.addEventListener('touchstart', (e) => {
    if (touchMode === 'pull') return; // a second finger does not take over
    const t = e.changedTouches[0];
    if (!t || phase !== 'open' || tearId !== null || (e.target as Element).closest('[data-unwrap]')) { touchMode = 'native'; return; }
    touchId = t.identifier;
    touchStart = { x: t.clientX, y: t.clientY };
    touchMode = 'idle';
  }, { passive: true });

  scroller.addEventListener('touchmove', (e) => {
    if (touchMode === 'native' || touchId === null) return;
    const t = [...e.touches].find((x) => x.identifier === touchId);
    if (!t) return;
    if (touchMode === 'idle') {
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      if (scroller.scrollTop <= 0 && dy > 0 && Math.abs(dy) >= Math.abs(dx) && phase === 'open') {
        touchMode = 'pull';
        touchBase = t.clientY - pullY;
        pullVelocity.reset();
      } else {
        touchMode = 'native';
        return;
      }
    }
    e.preventDefault();
    setPull(t.clientY - touchBase);
    pullVelocity.add(e.timeStamp, t.clientY);
  }, { passive: false });

  const touchEnd = (e: TouchEvent): void => {
    if (touchId === null || ![...e.changedTouches].some((x) => x.identifier === touchId)) return;
    if (touchMode === 'pull' && phase === 'open') releasePull(pullVelocity.velocity());
    touchId = null;
    touchMode = 'native';
  };
  scroller.addEventListener('touchend', touchEnd);
  scroller.addEventListener('touchcancel', touchEnd);

  // Mouse: drag the sleeve or the sheet's head.
  let mouseId: number | null = null;
  const onMouseDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || phase !== 'open') return;
    if ((e.target as Element).closest('[data-unwrap], button')) return;
    mouseId = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    touchBase = e.clientY - pullY;
    pullVelocity.reset();
    pullVelocity.add(e.timeStamp, e.clientY);
  };
  const onMouseMove = (e: PointerEvent): void => {
    if (e.pointerId !== mouseId) return;
    setPull(e.clientY - touchBase);
    pullVelocity.add(e.timeStamp, e.clientY);
  };
  const onMouseUp = (e: PointerEvent): void => {
    if (e.pointerId !== mouseId) return;
    mouseId = null;
    if (phase === 'open') releasePull(pullVelocity.velocity());
  };
  for (const el of [flyer, ...root.querySelectorAll<HTMLElement>('[data-grab]')]) {
    el.addEventListener('pointerdown', onMouseDown);
    el.addEventListener('pointermove', onMouseMove);
    el.addEventListener('pointerup', onMouseUp);
    el.addEventListener('pointercancel', onMouseUp);
  }

  // A sleeve on its way home can be caught.
  flyer.addEventListener('pointerdown', () => { if (phase === 'closing') reopen(); });

  // ---------- Wiring ----------

  root.querySelectorAll<HTMLButtonElement>('[data-vinyl]').forEach((btn) => {
    btn.addEventListener('click', () => open(btn));
  });
  closeBtn.addEventListener('click', () => close());
  // A tap on the dimmed wall around the record puts it back.
  scroller.addEventListener('click', (e) => {
    if (e.target === scroller || e.target === col) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && phase === 'open') {
      e.preventDefault();
      close();
    }
  });
  addEventListener('resize', () => {
    if (phase === 'closed') return;
    measure();
    render();
    renderTear(tear.value);
  });

  // ---------- The light on the plastic shifts as the wall scrolls past ----------

  const sheens = [...room.querySelectorAll<HTMLElement>('[data-sheen]')];
  let queued = false;
  function shiftLight(): void {
    queued = false;
    if (reduced() || phase !== 'closed') return;
    const vh = innerHeight;
    const rects = sheens.map((s) => s.parentElement!.getBoundingClientRect());
    rects.forEach((r, i) => {
      if (r.bottom < -50 || r.top > vh + 50) return;
      const t = (r.top + r.height / 2) / vh - 0.5; // -0.5 at the top of the screen, 0.5 at the bottom
      sheens[i]!.style.transform = `translate3d(${(t * -14).toFixed(2)}%, ${(t * -10).toFixed(2)}%, 0)`;
    });
  }
  addEventListener('scroll', () => {
    if (!queued) { queued = true; requestAnimationFrame(shiftLight); }
  }, { passive: true });
  shiftLight();
}
