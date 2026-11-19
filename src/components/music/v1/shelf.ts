/**
 * Music, design 1: "Spines". Pulling a record off the shelf, unwrapping it, putting it back.
 *
 * Everything that moves is a spring (spring.ts) read every frame into transforms and opacities:
 *   p  0 → 1  the record out of the shelf: slides up out of the row, then travels, grows and turns
 *             from spine to front (one value, so closing retraces the same path backwards)
 *   u  0 → 1  the Unwrap tab; a finger drives it 1:1, the spring only takes over on release
 *   f  0 → 1  the two halves of the plastic coming away once the cut is complete
 *   d  0 → 1  the disc sliding part-way out of the sleeve
 */
import { Spring, VelocityTracker, rubberband, type SpringOptions } from './spring';

const OPEN: SpringOptions = { response: 0.62, damping: 1 };
const CLOSE: SpringOptions = { response: 0.5, damping: 1 };
const FADE: SpringOptions = { response: 0.28, damping: 1 }; // reduced motion: a short cross-fade
const TAB_BACK: SpringOptions = { response: 0.35, damping: 1 };
const TAB_FINISH: SpringOptions = { response: 0.3, damping: 1 };
const TAB_FLICK: SpringOptions = { response: 0.32, damping: 0.8 }; // a little give, only after a flick
const FILM: SpringOptions = { response: 0.3, damping: 1 }; // the film comes away in about 300 ms
const RISE = 14; // px the sleeve and the details rise once the record is open
const DISC: SpringOptions = { response: 0.7, damping: 1 };
const DISC_OUT = 0.3; // how far the disc comes out, as a share of the sleeve
const BACKDROP_SCALE = 0.05; // how far the shelf falls back
const HEADROOM = 34; // px a record can rise inside the cabinet (the niche has 44 px above the spines)

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (v: number, a: number, b: number) => {
  const x = clamp((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const easeOut = (x: number) => 1 - (1 - x) * (1 - x);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Rec {
  id: string;
  article: HTMLElement;
  slot: HTMLElement;
  box: HTMLElement;
  disc: HTMLElement;
  shadow: HTMLElement;
  glow: HTMLElement;
  head: HTMLElement;
  title: HTMLElement;
  /** The strip's hit area ([data-unwrap]) and the handle over the tab ([data-unwrap-handle]). */
  track: HTMLElement;
  thumb: HTMLElement;
  /** What is drawn on the sleeve: the tab, the strip's window and the strip inside it. */
  tab: HTMLElement;
  win: HTMLElement;
  band: HTMLElement;
  film: HTMLElement[];
  sheens: HTMLElement[];
  lift: HTMLElement;
  fade: HTMLElement;
  fadeTop: HTMLElement;
  close: HTMLButtonElement;
  k: number;
}

function init() {
  const main = document.querySelector<HTMLElement>('[data-music-page]');
  const backdrop = main?.querySelector<HTMLElement>('[data-backdrop]');
  const stage = main?.querySelector<HTMLElement>('[data-stage]');
  const scrim = stage?.querySelector<HTMLElement>('[data-scrim]');
  const stageScroll = stage?.querySelector<HTMLElement>('[data-stage-scroll]');
  if (!main || !backdrop || !stage || !scrim || !stageScroll) return;
  const footer = document.querySelector<HTMLElement>('.music-footer');

  // iOS only applies :active when the page listens for touches.
  document.addEventListener('touchstart', () => {}, { passive: true });

  const spines = [...main.querySelectorAll<HTMLButtonElement>('button[data-vinyl]')];
  const templates = new Map<string, HTMLTemplateElement>();
  for (const t of stage.querySelectorAll<HTMLTemplateElement>('template[data-tpl]')) templates.set(t.dataset.tpl!, t);

  /** The pulled-out record is cloned in when it comes out and removed when it goes back, so only
      the open record's elements are ever in the document. */
  function build(id: string): Rec | null {
    const tpl = templates.get(id);
    const article = tpl?.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
    if (!article) return null;
    const q = <T extends HTMLElement>(s: string) => article.querySelector<T>(s)!;
    const r: Rec = {
      id,
      article,
      slot: q('[data-slot]'),
      box: q('[data-box]'),
      disc: q('[data-disc]'),
      shadow: q('[data-shadow]'),
      glow: q('[data-glow]'),
      head: q('[data-head]'),
      title: q('h2'),
      track: q('[data-unwrap]'),
      thumb: q('[data-unwrap-handle]'),
      tab: q('[data-tab]'),
      win: q('[data-strip-win]'),
      band: q('[data-strip-band]'),
      film: [...article.querySelectorAll<HTMLElement>('[data-film-half]')],
      sheens: [...article.querySelectorAll<HTMLElement>('[data-sheen]')],
      lift: q('[data-lift]'),
      fade: q('[data-fade]'),
      fadeTop: q('[data-fade-top]'),
      close: q<HTMLButtonElement>('[data-record-close]'),
      k: 0.15,
    };
    r.track.addEventListener('pointerdown', startDrag);
    r.track.addEventListener('pointermove', moveDrag);
    r.track.addEventListener('pointerup', endDrag);
    r.track.addEventListener('pointercancel', endDrag);
    r.track.addEventListener('lostpointercapture', (e) => { if (e.pointerId === dragId) endDrag(null); });
    r.thumb.addEventListener('keydown', (e) => {
      if (['ArrowRight', 'ArrowUp', 'End', 'Enter', ' ', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        commit(0);
      }
    });
    r.close.addEventListener('click', close);
    r.slot.addEventListener('pointerdown', () => { if (phase === 'closing') reopen(); });
    return r;
  }

  const unwrapped = new Set<string>();
  const p = new Spring(0, OPEN, 0.0004);
  const u = new Spring(0, TAB_BACK, 0.0005);
  const f = new Spring(0, FILM, 0.0005);
  const d = new Spring(0, DISC, 0.0005);

  let phase: 'idle' | 'opening' | 'open' | 'closing' = 'idle';
  let rec: Rec | null = null;
  let spine: HTMLButtonElement | null = null;
  let leaning: HTMLButtonElement[] = [];
  let committed = false;
  let revealed = false;
  let reduce = false;
  // Geometry, measured when a record comes out.
  let S = 300;
  let tabMax = 1;
  let from = { cx: 0, cy: 0, h: 1 };
  let lastValueNow = -1;

  // ── The frame loop: step the springs, then draw. Runs only while something moves.
  let raf = 0;
  let last = 0;
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };
  function frame(now: number) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let moving = false;
    for (const s of [p, u, f, d]) if (s.step(dt)) moving = true;
    milestones();
    if (rec) render();
    if (moving || dragId !== null) kick();
    else last = 0;
  }

  /** Where the shelf button is, in viewport space, as if the shelf were at full size. */
  function measureSpine(btn: HTMLElement) {
    const r = btn.getBoundingClientRect();
    const sc = 1 - BACKDROP_SCALE * clamp(p.value);
    const vx = innerWidth / 2, vy = innerHeight / 2;
    return {
      cx: vx + (r.left + r.width / 2 - vx) / sc,
      cy: vy + (r.top + r.height / 2 - vy) / sc,
      h: r.height / sc,
    };
  }

  function render() {
    if (!rec) return;
    const pv = p.value;
    const slot = rec.slot.getBoundingClientRect();
    const t = S * rec.k;
    const dv = clamp(d.value, -0.1, 1.1);
    const shift = -S * DISC_OUT * 0.5 * dv;

    // The record: up out of the row, then across, growing, turning from its spine to its front.
    if (reduce) {
      rec.box.style.transform = `translate3d(${shift}px,0,0) translateZ(${-t / 2}px)`;
      stage!.style.opacity = String(clamp(pv));
    } else {
      // It rises inside the cabinet's headroom (it cannot go through the top board), then comes forward.
      const travel = smooth(pv, 0.16, 1);
      const lift = HEADROOM * easeOut(clamp(pv / 0.3));
      const sx = from.cx - (slot.left + slot.width / 2);
      const sy = from.cy - (slot.top + slot.height / 2);
      const x = sx * (1 - travel) + shift;
      const y = (sy - lift) * (1 - travel);
      const s0 = from.h / S;
      const s = s0 + (1 - s0) * travel;
      const a = 90 * (1 - smooth(pv, 0.22, 0.96));
      const rad = (a * Math.PI) / 180;
      // Keep the face that looks at us on the screen plane, so the perspective never magnifies it:
      // the spine matches the shelf button exactly at the start, the sleeve is crisp at the end.
      const z = -(S / 2 * Math.sin(rad) + (t / 2) * Math.cos(rad)) * s;
      const persp = Math.max(900, S * 3);
      rec.box.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) perspective(${persp}px) translateZ(${z.toFixed(2)}px) scale3d(${s.toFixed(4)},${s.toFixed(4)},${s.toFixed(4)}) rotateY(${a.toFixed(3)}deg)`;
      backdrop!.style.transform = `scale(${(1 - BACKDROP_SCALE * clamp(pv)).toFixed(4)})`;
      stage!.style.opacity = '';
    }
    scrim!.style.opacity = String(clamp(pv));
    rec.glow.style.opacity = String(smooth(pv, 0.35, 1));
    rec.shadow.style.opacity = String(smooth(pv, 0.75, 1));
    rec.shadow.style.transform = `translateX(${(shift + S * DISC_OUT * 0.25 * dv).toFixed(2)}px)`;
    const h = smooth(pv, 0.55, 1);
    rec.head.style.opacity = String(h);
    rec.head.style.transform = `translateY(${((1 - h) * 12).toFixed(2)}px)`;
    const c = smooth(pv, 0.5, 1);
    rec.close.style.opacity = String(c);
    rec.fade.style.opacity = String(c);
    // The top edge only matters once the stage has scrolled; it shows with the details.
    rec.fadeTop.style.opacity = String(smooth(dv, 0.3, 1) * c);

    // The disc: part-way out of the sleeve, turning a little as it slides.
    rec.disc.style.transform = `translate3d(${(S * DISC_OUT * dv).toFixed(2)}px,0,0) rotate(${(dv * 40).toFixed(2)}deg)`;

    // Once the film is off the sleeve rises a little and the details come up beneath it.
    const rise = reduce ? 0 : -RISE * clamp(dv);
    rec.slot.style.transform = rise ? `translate3d(0,${rise.toFixed(2)}px,0)` : '';
    rec.lift.style.transform = rise ? `translate3d(0,${rise.toFixed(2)}px,0)` : '';

    // The tear strip. The tab's centre runs from the sleeve's left edge (u = 0) to its right edge
    // (u = 1); behind it the strip is gone, ahead of it the strip and its label stay, clipped.
    const uv = u.value;
    const fv = clamp(f.value, 0, 1.05);
    const tabX = uv * S;
    const cut = Math.max(0, tabX);
    rec.win.style.transform = `translate3d(${cut.toFixed(2)}px,0,0)`;
    rec.band.style.transform = `translate3d(${(-cut).toFixed(2)}px,0,0)`;
    // Finishing, the tab slips off the right edge as the film comes away.
    const slip = reduce ? 0 : fv * S * 0.14;
    rec.tab.style.transform = `translate3d(${(tabX + slip).toFixed(2)}px,0,0)`;
    rec.tab.style.opacity = String(1 - clamp(fv * 1.6));
    rec.thumb.style.transform = `translate3d(${tabX.toFixed(2)}px,0,0)`;
    rec.track.style.visibility = unwrapped.has(rec.id) && fv > 0.98 ? 'hidden' : '';
    const now = Math.round(clamp(uv) * 100);
    if (now !== lastValueNow) {
      lastValueNow = now;
      rec.thumb.setAttribute('aria-valuenow', String(now));
    }
    // The film stays on while the strip comes off, but its shine thins (to about half).
    const sheen = String((1 - 0.5 * clamp(uv)).toFixed(3));
    for (const el of rec.sheens) el.style.opacity = sheen;
    // Then the film comes away quickly: a fade with a slight lift.
    const filmT = fv && !reduce ? `translate3d(0,${(-fv * 7).toFixed(2)}px,0)` : '';
    const filmO = String(1 - clamp(fv));
    for (const el of rec.film) { el.style.transform = filmT; el.style.opacity = filmO; }
  }

  /** Things that start when another motion gets far enough. */
  function milestones() {
    if (!rec) return;
    if (phase === 'opening' && p.done && p.value === 1) phase = 'open';
    const isOut = phase === 'opening' || phase === 'open';
    // The plastic comes away once the cut is (nearly) all the way across.
    if (committed && f.target !== 1 && u.value > 0.97) f.to(1, undefined, reduce ? FADE : FILM);
    // Then the disc slides out, on every visit once the record is unwrapped.
    if (isOut && unwrapped.has(rec.id) && d.target !== 1 && p.value > 0.9 && (!committed || f.value > 0.6)) {
      if (reduce) d.set(1);
      else d.to(1, undefined, DISC);
    }
    if (isOut && !revealed && unwrapped.has(rec.id) && d.value > 0.4) {
      revealed = true;
      rec.article.classList.add('is-revealed');
    }
    if (phase === 'closing' && p.done && p.value === 0) finish();
  }

  // ── Open
  function open(btn: HTMLButtonElement) {
    const id = btn.dataset.vinyl!;
    if (phase !== 'idle') return;
    const next = build(id);
    if (!next) return;
    reduce = reduced();
    rec = next;
    spine = btn;
    phase = 'opening';
    committed = false;
    revealed = false;
    lastValueNow = -1;

    const isUnwrapped = unwrapped.has(id);
    rec.article.toggleAttribute('data-record-unwrapped', isUnwrapped);
    rec.article.classList.remove('is-revealed');

    // The shelf falls back about the middle of the screen.
    from = measureSpine(btn);
    const b = backdrop!.getBoundingClientRect();
    backdrop!.style.transformOrigin = `${(innerWidth / 2 - b.left).toFixed(1)}px ${(innerHeight / 2 - b.top).toFixed(1)}px`;

    stage!.hidden = false;
    rec.article.setAttribute('data-record-open', id);
    stageScroll!.append(rec.article);
    rec.k = parseFloat(getComputedStyle(rec.article).getPropertyValue('--k')) || 0.15;
    stageScroll!.scrollTop = 0;
    S = rec.slot.clientWidth;
    rec.article.style.setProperty('--S', `${S}px`);
    tabMax = S; // the tab travels the sleeve's full width

    document.documentElement.style.overflow = 'hidden';
    backdrop!.inert = true;
    if (footer) footer.inert = true;
    btn.classList.add('is-out');
    lean(btn, true);

    u.set(isUnwrapped ? 1 : 0);
    f.set(isUnwrapped ? 1 : 0);
    d.set(0);
    p.set(0);
    p.to(1, 0, reduce ? FADE : OPEN);
    render();
    kick();
    (isUnwrapped ? rec.title : rec.thumb).focus({ preventScroll: true });
  }

  // Grab it again while it is on its way back: it turns round and comes out again.
  function reopen() {
    if (!rec || phase !== 'closing' || !spine) return;
    phase = 'opening';
    lean(spine, true);
    p.to(1, undefined, reduce ? FADE : OPEN);
    kick();
  }

  // ── Put back
  function close() {
    if (!rec || !spine || (phase !== 'opening' && phase !== 'open')) return;
    if (dragId !== null) endDrag(null);
    phase = 'closing';
    reduce = reduced();
    rec.article.classList.remove('is-revealed');
    revealed = false;
    from = measureSpine(spine);
    lean(spine, false);
    if (reduce) d.set(0);
    else d.to(0, undefined, { response: 0.4, damping: 1 });
    // A tab let go half-way goes home with the record.
    if (!unwrapped.has(rec.id)) u.to(0, undefined, TAB_BACK);
    p.to(0, undefined, reduce ? FADE : CLOSE);
    kick();
  }

  function finish() {
    if (!rec || !spine) return;
    const btn = spine;
    rec.article.remove();
    stage!.hidden = true;
    stage!.style.opacity = '';
    backdrop!.style.transform = '';
    backdrop!.inert = false;
    if (footer) footer.inert = false;
    document.documentElement.style.overflow = '';
    btn.classList.remove('is-out');
    phase = 'idle';
    rec = null;
    spine = null;
    btn.focus({ preventScroll: true });
  }

  function lean(btn: HTMLButtonElement, on: boolean) {
    for (const s of leaning) s.classList.remove('is-lean-l', 'is-lean-r');
    leaning = [];
    if (!on) return;
    const i = spines.indexOf(btn);
    const left = spines[i - 1];
    const right = spines[i + 1];
    if (left) { left.classList.add('is-lean-r'); leaning.push(left); }
    if (right) { right.classList.add('is-lean-l'); leaning.push(right); }
  }

  // ── Unwrap
  function commit(velocity: number) {
    if (!rec || committed || unwrapped.has(rec.id)) return;
    committed = true;
    unwrapped.add(rec.id);
    rec.article.setAttribute('data-record-unwrapped', '');
    spine?.classList.add('is-unwrapped');
    const flicked = velocity > 900;
    if (reduce) {
      u.set(1);
      f.to(1, 0, FADE);
    } else {
      u.to(1, velocity / tabMax, flicked ? TAB_FLICK : TAB_FINISH);
    }
    // The tab is going away: focus moves to the record's name, ahead of the details.
    rec.title.focus({ preventScroll: true });
    kick();
  }

  let dragId: number | null = null;
  let dragStartX = 0;
  let dragStartPx = 0;
  const tracker = new VelocityTracker();

  function startDrag(e: PointerEvent) {
    if (!rec || committed || unwrapped.has(rec.id) || dragId !== null) return;
    if (phase !== 'open' && phase !== 'opening') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    dragId = e.pointerId;
    rec.track.setPointerCapture(e.pointerId);
    rec.track.classList.add('is-pressed');
    dragStartX = e.clientX;
    dragStartPx = u.value * tabMax; // from wherever the tab is now, mid-spring included
    u.set(u.value);
    tracker.reset(e.timeStamp, dragStartPx);
    kick();
  }
  function moveDrag(e: PointerEvent) {
    if (e.pointerId !== dragId) return;
    const raw = dragStartPx + (e.clientX - dragStartX);
    let px = raw;
    if (raw < 0) px = -rubberband(-raw, 80);
    else if (raw > tabMax) px = tabMax + rubberband(raw - tabMax, 80);
    u.set(px / tabMax);
    tracker.add(e.timeStamp, px);
    kick();
  }
  function endDrag(e: PointerEvent | null) {
    if (dragId === null || !rec) return;
    const id = dragId;
    dragId = null;
    if (rec.track.hasPointerCapture(id)) rec.track.releasePointerCapture(id);
    rec.track.classList.remove('is-pressed');
    const v = e ? tracker.velocity(e.timeStamp) : 0;
    const px = u.value * tabMax;
    // Where the tab would come to rest if thrown: decide from that, not from where it was let go.
    const projected = px + v * 0.1;
    if (e && e.type === 'pointerup' && v > -150 && Math.max(px, projected) > tabMax * 0.6) commit(v);
    else u.to(0, v / tabMax, TAB_BACK);
    kick();
  }

  for (const btn of spines) btn.addEventListener('click', () => open(btn));

  // A tap on the empty space around the record puts it back too.
  stageScroll.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === stageScroll || t.matches('.v1-rec')) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (phase === 'opening' || phase === 'open')) {
      e.preventDefault();
      close();
    }
  });

  addEventListener('resize', () => {
    if (!rec || phase === 'idle') return;
    S = rec.slot.clientWidth;
    rec.article.style.setProperty('--S', `${S}px`);
    tabMax = S; // the tab travels the sleeve's full width
    render();
  });
}

init();
