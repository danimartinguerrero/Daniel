/**
 * Music, way "Off the record": the plates after the ring, and the glass control under them.
 *
 * One number says where the plates are: `pos`, in plates (0 = the guitar in place, 1 = the bass…).
 * The plates, their light, their lean and the control's thumb are all drawn from it, so the thumb is
 * the same position seen small and the two can never disagree. `pos` is a spring (physics.ts, Apple's
 * response + damping), so whatever moves it starts from where it is on screen and keeps its speed:
 *
 * - A finger or a mouse drags the plates 1:1 from where it took hold, after 10 px in which a vertical
 *   move is left to the page's scroll. Past the first and the last plate it is held back (rubber band).
 *   Let go, the throw is projected the way scrolling decelerates and the plates settle on the plate
 *   nearest where it would have come to rest (one plate at most from the one taken hold of), carrying
 *   on at the finger's speed, with a little give because the hand gave it momentum.
 * - A trackpad's sideways swipe does the same through wheel events.
 * - The thumb is dragged 1:1 too, grows a little while it is held, and is thrown the same way. A tap on
 *   another segment sends the plates there with no overshoot: nothing threw them.
 * - The arrow keys, Home and End move between the tabs, as tabs do.
 * - Taking hold of anything mid-flight stops it where it is.
 *
 * The light on the metal is a glint fixed in the room: scrolling moves it across the words (the page's
 * other words fill with light as they are scrolled too), and a plate moved by hand slides its letters
 * under it. The word leans a little with the speed it is moving at, and straightens as it stops.
 *
 * Only transforms and opacity are written, once a frame, and only while something moves.
 */
import { onPage } from '@/scripts/page';
import { Spring, VelocityTracker, project, rubberband, clamp } from '@/components/music/v4/physics';

const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
const SLOP = 10; // px a press may wander before it is a drag
/** A hand never throws faster than this (plates/s): clustered events can report absurd speeds. */
const MAX_V = 9;
const sameWay = (a: number, b: number) => b === 0 || Math.sign(a) === Math.sign(b);

onPage((signal) => {
  const found = document.querySelector<HTMLElement>('[data-otr]');
  if (!found) return;
  const section: HTMLElement = found;
  const stage = section.querySelector<HTMLElement>('[data-otr-stage]')!;
  const plates = [...section.querySelectorAll<HTMLElement>('[data-otr-plate]')].map((el) => ({
    el,
    word: el.querySelector<HTMLElement>('[data-otr-word]')!,
    glint: el.querySelector<HTMLElement>('[data-otr-glint]')!,
    copy: el.querySelector<HTMLElement>('[data-otr-glint-copy]')!,
    body: el.querySelector<HTMLElement>('[data-otr-body]')!,
    wordW: 0,
  }));
  const control = section.querySelector<HTMLElement>('[data-otr-control]')!;
  const thumb = section.querySelector<HTMLElement>('[data-otr-thumb]')!;
  const segs = [...section.querySelectorAll<HTMLButtonElement>('[data-otr-seg]')];
  const last = plates.length - 1;

  let reduce = reduceQuery.matches;
  section.dataset.otrReady = '';
  section.classList.toggle('is-reduced', reduce);

  // ── Springs ────────────────────────────────────────────────────────────────────────────────────
  const pos = new Spring(0, { response: 0.42, damping: 1 }, 0.0005);
  const lean = new Spring(0, { response: 0.3, damping: 0.7 }, 0.01); // degrees
  const grow = new Spring(1, { response: 0.25, damping: 1 }, 0.0005); // the thumb while held
  const press = new Spring(1, { response: 0.2, damping: 1 }, 0.0005); // the plate under a finger

  // ── Geometry, measured on layout changes only ──────────────────────────────────────────────────
  let stageW = 0;
  let plateW = 0;
  let step = 0; // px between one plate and the next
  let segW = 0;

  function measure() {
    stageW = stage.clientWidth;
    const wide = stageW >= 600;
    plateW = Math.round(stageW * (wide ? 0.82 : 0.86));
    // On a phone a long word breaks onto two lines to stay large; on a wide screen every word is one
    // line, so the plates are all one height and no plate stands in a gap left for another.
    section.classList.toggle('is-wide', wide);
    const gap = parseFloat(getComputedStyle(section).getPropertyValue('--otr-gap')) || 24;
    // --otr-gap is a clamp(); read it as the browser resolved it.
    const probe = document.createElement('i');
    probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--otr-gap)';
    section.append(probe);
    const gapPx = probe.getBoundingClientRect().width || gap;
    probe.remove();
    step = plateW + gapPx;
    section.style.setProperty('--otr-plate', `${plateW}px`);

    // The words share one size: the largest at which the widest line still fits its plate.
    section.style.setProperty('--otr-fs', '100px');
    const widest = Math.max(...plates.map((p) => p.word.getBoundingClientRect().width));
    const cap = Math.min(208, stageW * 0.3);
    const fs = Math.max(48, Math.min(cap, (100 * plateW * 0.97) / widest));
    section.style.setProperty('--otr-fs', `${fs.toFixed(2)}px`);
    for (const p of plates) p.wordW = p.word.getBoundingClientRect().width;

    segW = (control.clientWidth - 6) / segs.length;
    control.style.setProperty('--seg', `${segW}px`);
    request();
  }

  // ── Drawing ────────────────────────────────────────────────────────────────────────────────────
  let shown = -1; // the plate the tabs say is selected
  let pressedSeg = -1; // a segment under a press, lit at once

  function select(i: number) {
    if (i === shown) return;
    shown = i;
    segs.forEach((s, j) => {
      s.setAttribute('aria-selected', String(j === i));
      s.tabIndex = j === i ? 0 : -1;
    });
    plates.forEach((p, j) => p.el.setAttribute('aria-hidden', String(j !== i)));
    if (reduce) plates.forEach((p, j) => (p.el.style.opacity = j === i ? '1' : '0'));
  }

  function draw() {
    const p = pos.value;
    select(clamp(Math.round(p), 0, last));

    // Where the light is: from the left of the stage to past its right, as the stage climbs from the
    // bottom of the screen to near its top. One read of layout per frame, before any write.
    const vh = window.innerHeight;
    const top = stage.getBoundingClientRect().top;
    const t = clamp((vh * 0.92 - top) / (vh * 0.8), 0, 1);
    const light = stageW * (-0.3 + 1.6 * t);

    thumb.style.transform = `translate3d(${(p * segW).toFixed(2)}px,0,0) scale(${grow.value.toFixed(4)})`;
    segs.forEach((s, j) => (s.style.opacity = j === pressedSeg ? '1' : (0.55 + 0.45 * (1 - Math.min(Math.abs(j - p), 1))).toFixed(3)));

    if (reduce) {
      for (const pl of plates) pl.el.style.transform = '';
      return;
    }

    plates.forEach((pl, i) => {
      const d = i - p;
      const a = Math.min(Math.abs(d), 1);
      const x = d * step;
      const s = (1 - 0.05 * a) * (Math.round(p) === i ? press.value : 1);
      pl.el.style.transform = `translate3d(${x.toFixed(2)}px,0,0) scale(${s.toFixed(4)})`;
      pl.el.style.opacity = (1 - 0.7 * a).toFixed(3);
      // The words lead a little as they go, as nearer things do.
      pl.body.style.transform = `translate3d(${(d * step * 0.12).toFixed(2)}px,0,0)`;
      pl.word.style.transform = lean.value ? `skewX(${lean.value.toFixed(3)}deg)` : '';
      // The glint stays where the light is; the letters pass under it.
      const g = light - x - pl.wordW / 2;
      pl.glint.style.transform = `translate3d(${g.toFixed(2)}px,0,0)`;
      pl.copy.style.transform = `translate3d(${(-g).toFixed(2)}px,0,0)`;
    });
  }

  // ── The frame loop: runs while anything moves, then stops ──────────────────────────────────────
  let frame = 0;
  let then = 0;
  let prevP = 0;
  let held = false; // a finger, mouse or trackpad has the plates

  function request() {
    if (!frame && !signal.aborted) frame = requestAnimationFrame(tick);
  }

  function tick(now: number) {
    frame = 0;
    const dt = then ? Math.min(0.05, (now - then) / 1000) : 1 / 60;
    then = now;
    const wasFresh = fresh;
    pos.step(fresh ? 0 : dt);
    fresh = false;
    // The lean follows how fast the plates are going, whoever moves them (not in the frame of a release,
    // which shows the hand's last move rather than a frame's worth of the spring).
    const v = (pos.value - prevP) / dt;
    prevP = pos.value;
    if (!wasFresh) lean.to(reduce ? 0 : clamp(-v * 2, -4, 4));
    lean.step(dt);
    grow.step(dt);
    press.step(dt);
    draw();
    if (held || !pos.settled || !lean.settled || !grow.settled || !press.settled) request();
    else then = 0;
  }

  /** Send the plates to plate `i`. With a velocity (plates/s), the hand's speed is carried on. */
  function go(i: number, velocity?: number, response = 0.42) {
    const target = clamp(i, 0, last);
    if (reduce) {
      pos.set(target);
      draw();
      return;
    }
    const v = velocity === undefined ? pos.velocity : clamp(velocity, -MAX_V, MAX_V);
    const thrown = velocity !== undefined && Math.abs(v) > 0.6;
    pos.to(target, { response, damping: thrown ? 0.82 : 1, velocity: v });
    request();
  }

  /** Past the ends, the plates follow less and less (in plates, from a raw position in plates). */
  function band(raw: number, unit: number) {
    if (raw < 0) return rubberband(raw * unit, stageW) / unit;
    if (raw > last) return last + rubberband((raw - last) * unit, stageW) / unit;
    return raw;
  }

  /** Where a throw lands: projected, then the nearest plate, no more than one from where it began. */
  function landing(from: number, at: number, velocity: number, unit: number, oneAtMost = true, rate = 0.998) {
    const rest = Math.round(at + project(velocity * unit, rate) / unit);
    return oneAtMost ? clamp(rest, Math.round(from) - 1, Math.round(from) + 1) : rest;
  }

  // ── Dragging the plates ────────────────────────────────────────────────────────────────────────
  const track = new VelocityTracker();
  let pointer: number | null = null;
  let downX = 0;
  let downY = 0;
  let anchorX = 0; // where the drag took hold, once it is a drag
  let fromPos = 0;
  let dragging = false;
  let tapped: number | null = null;

  stage.addEventListener('pointerdown', (e) => {
    if (pointer !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    pointer = e.pointerId;
    downX = e.clientX;
    downY = e.clientY;
    dragging = false;
    // Caught mid-flight: stop where it is on screen.
    pos.set(pos.value);
    fromPos = pos.value;
    held = true;
    const under = (e.target as Element).closest('[data-otr-plate]');
    tapped = under ? plates.findIndex((p) => p.el === under) : null;
    if (!reduce) press.to(0.985);
    request();
  }, { signal });

  stage.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointer) return;
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    if (!dragging) {
      if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) return end(e, true); // the page's scroll
      if (Math.abs(dx) <= SLOP) return;
      dragging = true;
      anchorX = e.clientX;
      track.reset(pos.value * step, e.timeStamp);
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('is-dragging');
      press.to(1);
      return;
    }
    if (reduce) return;
    pos.set(band(fromPos - (e.clientX - anchorX) / step, step));
    // The speed handed on is the plates' own, not the finger's: past an edge they go slower than it.
    track.push(pos.value * step, e.timeStamp);
    request();
  }, { signal });

  /** While a hand moves the plates, each frame shows where it was when its last event came in, a few
      ms before the frame. Let go, the spring starts from that same moment: it waits out the frame of the
      release (which shows the last move) and carries on from the next, so nothing jumps to catch up. */
  let fresh = false;
  function released() {
    fresh = true;
  }

  function end(e: PointerEvent, cancelled = false) {
    if (e.pointerId !== pointer) return;
    pointer = null;
    held = false;
    released();
    stage.classList.remove('is-dragging');
    press.to(1);
    if (dragging && !cancelled) {
      const v = track.velocity(e.timeStamp, 80) / step; // plates/s
      if (reduce) {
        const moved = e.clientX - anchorX;
        go(Math.round(fromPos) + (Math.abs(moved) > 40 ? (moved < 0 ? 1 : -1) : 0));
      } else {
        go(landing(fromPos, pos.value, v, step), v);
      }
    } else if (!cancelled && tapped !== null && tapped !== Math.round(pos.value)) {
      go(tapped); // a tap on a plate at the side brings it over
    } else if (!reduce) {
      go(Math.round(pos.value), 0);
    }
    dragging = false;
    request();
  }
  stage.addEventListener('pointerup', (e) => end(e), { signal });
  stage.addEventListener('pointercancel', (e) => end(e, !dragging), { signal });
  stage.addEventListener('lostpointercapture', (e) => { if (e.pointerId === pointer) end(e); }, { signal });

  // ── A trackpad's sideways swipe ────────────────────────────────────────────────────────────────
  // The fingers move the plates 1:1. A swipe's momentum then arrives as events that shrink one after
  // another: as soon as they do, the plates take over at that speed, to the plate nearest where it would
  // stop, and the rest of the momentum is swallowed. Waiting for the momentum to run out instead left the
  // plates crawling, still, then pulled to the plate: a stop and a start. Speeding up again is a new swipe.
  let wheeling = false;
  let committed = false;
  let wheelRaw = 0;
  let wheelFrom = 0;
  let wheelTimer = 0;
  let wheelSum = 0;
  let lastDx = 0;
  let shrinking = 0;
  const wheelTrack = new VelocityTracker();

  function wheelGo(at: number) {
    committed = true;
    held = false;
    const v = clamp(wheelTrack.velocity(at, 100) / step, -MAX_V, MAX_V);
    // A trackpad's momentum dies away in about a fifth of a second, much sooner than a scroll view's.
    const target = clamp(landing(wheelFrom, pos.value, v, step, false, 0.995), 0, last);
    // The response that would bring the plates to rest there at the speed they have, neither pulling
    // them on nor braking them as the spring takes over (a critically damped spring glides v/ω).
    const glide = Math.abs(v) > 0.2 && sameWay(target - pos.value, v) ? (2 * Math.PI * Math.abs(target - pos.value)) / Math.abs(v) : 0.42;
    go(target, v, clamp(glide, 0.32, 0.7));
  }

  stage.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || pointer !== null) return;
    e.preventDefault();
    const dx = e.deltaX * (e.deltaMode === 1 ? 16 : 1);
    const speedingUp = Math.abs(dx) > Math.abs(lastDx) * 1.3 + 2 || !sameWay(dx, lastDx);
    if (!wheeling || (committed && speedingUp)) {
      wheeling = true;
      committed = false;
      held = true;
      pos.set(pos.value); // caught where it is
      wheelRaw = wheelFrom = pos.value;
      wheelSum = 0;
      shrinking = 0;
      wheelTrack.reset(pos.value * step, e.timeStamp);
    }
    shrinking = Math.abs(dx) < Math.abs(lastDx) ? shrinking + 1 : 0;
    lastDx = dx;
    clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(() => {
      const was = committed;
      wheeling = committed = false;
      lastDx = 0;
      if (was) return;
      held = false;
      if (!reduce) wheelGo(performance.now());
      request();
    }, 90);
    if (committed) return;
    wheelSum += dx;
    if (reduce) {
      if (Math.abs(wheelSum) > 60) { committed = true; held = false; go(Math.round(wheelFrom) + Math.sign(wheelSum)); }
      return;
    }
    wheelRaw += dx / step;
    pos.set(band(wheelRaw, step));
    wheelTrack.push(pos.value * step, e.timeStamp);
    if (shrinking >= 4) { released(); wheelGo(e.timeStamp); }
    request();
  }, { signal, passive: false });

  // ── The control ───────────────────────────────────────────────────────────────────────────────
  let cPointer: number | null = null;
  let cDownX = 0;
  let cGrab = 0; // the pointer's offset into the thumb
  let cMode: 'tap' | 'thumb' | null = null;
  let cTarget = 0;
  let cFrom = 0;
  const cTrack = new VelocityTracker();
  const segAt = (x: number) => clamp(Math.floor((x - control.getBoundingClientRect().left - 3) / segW), 0, last);

  control.addEventListener('pointerdown', (e) => {
    if (cPointer !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    cPointer = e.pointerId;
    cDownX = e.clientX;
    pos.set(pos.value);
    cFrom = pos.value;
    held = true;
    const left = control.getBoundingClientRect().left + 3;
    const thumbX = left + pos.value * segW;
    const onThumb = e.clientX >= thumbX && e.clientX <= thumbX + segW;
    cTarget = segAt(e.clientX);
    cTrack.reset(pos.value * segW, e.timeStamp);
    if (onThumb) {
      cMode = 'thumb';
      cGrab = e.clientX - thumbX;
      control.setPointerCapture(e.pointerId);
      if (!reduce) grow.to(1.1);
    } else {
      cMode = 'tap';
      pressedSeg = cTarget; // heard on the press
    }
    request();
  }, { signal });

  control.addEventListener('pointermove', (e) => {
    if (e.pointerId !== cPointer) return;
    if (cMode === 'tap') {
      if (Math.abs(e.clientX - cDownX) <= SLOP) return;
      pressedSeg = -1;
      // A slide that began beside the thumb takes the thumb from there, centred under the finger.
      cMode = 'thumb';
      cGrab = segW / 2;
      control.setPointerCapture(e.pointerId);
      if (!reduce) grow.to(1.1);
    }
    const left = control.getBoundingClientRect().left + 3;
    const raw = (e.clientX - cGrab - left) / segW;
    if (reduce) {
      go(Math.round(clamp(raw, 0, last)));
      return;
    }
    // From a grab off the thumb the plates catch up quickly rather than jump; on the thumb it is 1:1.
    const banded = band(raw, segW);
    if (Math.abs(banded - pos.value) > 0.08 && !pos.settled) pos.to(banded, { response: 0.14, damping: 1 });
    else pos.set(banded);
    cTrack.push(pos.value * segW, e.timeStamp);
    request();
  }, { signal });

  function cEnd(e: PointerEvent, cancelled = false) {
    if (e.pointerId !== cPointer) return;
    cPointer = null;
    held = false;
    released();
    pressedSeg = -1;
    grow.to(1);
    if (cMode === 'thumb' && !cancelled) {
      const v = cTrack.velocity(e.timeStamp, 80) / segW;
      go(reduce ? Math.round(pos.value) : landing(cFrom, pos.value, v, segW, false), v);
    } else if (cMode === 'tap' && !cancelled) {
      go(cTarget);
      segs[cTarget]!.focus({ preventScroll: true });
    } else {
      go(Math.round(pos.value));
    }
    cMode = null;
    request();
  }
  control.addEventListener('pointerup', (e) => cEnd(e), { signal });
  control.addEventListener('pointercancel', (e) => cEnd(e, true), { signal });
  // Pointer presses are handled above; a click with no pointer before it is the keyboard's.
  control.addEventListener('click', (e) => {
    if (e.detail !== 0) return;
    const i = segs.indexOf((e.target as Element).closest('[data-otr-seg]') as HTMLButtonElement);
    if (i >= 0) go(i);
  }, { signal });

  control.addEventListener('keydown', (e) => {
    const focused = segs.indexOf(document.activeElement as HTMLButtonElement);
    const now = focused >= 0 ? focused : clamp(Math.round(pos.target), 0, last);
    const to = e.key === 'ArrowRight' ? now + 1 : e.key === 'ArrowLeft' ? now - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
    if (to === null) return;
    e.preventDefault();
    const i = clamp(to, 0, last);
    go(i);
    segs[i]!.focus();
  }, { signal });

  // ── Back to the records ────────────────────────────────────────────────────────────────────────
  section.querySelector<HTMLAnchorElement>('[data-otr-back]')?.addEventListener('click', (e) => {
    const shelf = document.querySelector<HTMLElement>('[data-climb]');
    if (!shelf) return;
    e.preventDefault();
    const top = shelf.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
  }, { signal });

  // ── Setup ──────────────────────────────────────────────────────────────────────────────────────
  reduceQuery.addEventListener('change', () => {
    reduce = reduceQuery.matches;
    section.classList.toggle('is-reduced', reduce);
    pos.set(Math.round(pos.value));
    lean.set(0);
    plates.forEach((p, j) => (p.el.style.opacity = reduce ? (j === shown ? '1' : '0') : ''));
    request();
  }, { signal });

  // The light moves with the scroll, but only while the section is on screen.
  let visible = false;
  const io = new IntersectionObserver(([entry]) => { visible = !!entry?.isIntersecting; if (visible) request(); });
  io.observe(section);
  signal.addEventListener('abort', () => { io.disconnect(); cancelAnimationFrame(frame); clearTimeout(wheelTimer); });
  window.addEventListener('scroll', () => { if (visible && !reduce) request(); }, { passive: true, signal });

  // Only a change of width matters (the words' size changes the height, which must not measure again).
  let seenW = -1;
  const ro = new ResizeObserver(([entry]) => {
    const w = Math.round(entry?.contentRect.width ?? 0);
    if (w === seenW) return;
    seenW = w;
    requestAnimationFrame(() => { if (!signal.aborted) measure(); });
  });
  ro.observe(stage);
  signal.addEventListener('abort', () => ro.disconnect());
  // Fonts change the words' widths: measure again once they are in.
  void document.fonts?.ready.then(() => { if (!signal.aborted) measure(); });
  measure();
});
