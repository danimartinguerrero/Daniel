/**
 * Music, design 4: "Listening bar". The carousel of records, the record pulled out of it, the
 * shrink-wrap opened with its tear strip, and the disc sliding out of the sleeve.
 *
 * Everything that moves is a spring (physics.ts) stepped in one requestAnimationFrame loop and written
 * straight to `transform`/`opacity` on the element that moves: nothing animates layout, and no CSS
 * variable changes per frame. Springs start from the value on screen and keep their velocity, so a
 * row in flight can be caught, a record on its way out can be sent back, and a peel let go early
 * springs home from where the finger left it.
 */
import { musicCopy, vinyls, type Vinyl } from '@/data/music';
import { Spring, VelocityTracker, clamp, project, rubberband } from './physics';
import { onPage } from '@/scripts/page';

// Set up each time the page is shown; what it starts outside the page stops when the page is swapped out.
onPage((signal) => {
  const page = document.querySelector<HTMLElement>('[data-music-page].v4');
  if (page) init(page, signal);
});

function init(root: HTMLElement, signal: AbortSignal) {
  const q = <T extends Element = HTMLElement>(sel: string, scope: ParentNode = root) => scope.querySelector<T>(sel)!;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => reduceMotion.matches;

  /* ---------------------------------------------------------------- the row */

  const row = q('[data-v4-row]');
  const buttons = [...row.querySelectorAll<HTMLButtonElement>('[data-vinyl]')];
  const shades = buttons.map((b) => q('[data-v4-shade]', b));
  const byId = new Map(vinyls.map((v) => [v.id, v] as const));
  const records = buttons.map((b) => byId.get(b.dataset.vinyl!)!);
  const n = buttons.length;
  const capTitle = q('[data-v4-cap-title]');
  const capMeta = q('[data-v4-cap-meta]');
  const caption = q('[data-v4-caption]');

  const HOME = 4000; // the track's resting scroll offset (see the CSS)
  const ROT = 60; // how far the neighbours turn away, in degrees

  let W = 0; // row width
  let S = 0; // sleeve size in the row
  let A = 0; // centre of the first neighbour, px from the middle; also px per record while dragging
  let B = 0; // spacing of the records further out
  let P = 0; // perspective distance

  function measure() {
    W = row.clientWidth;
    S = buttons[0]!.offsetWidth;
    A = S * 0.66;
    B = S * (W > 760 ? 0.36 : 0.26);
    P = S * 2.6;
    row.scrollLeft = HOME;
    row.scrollTop = 0;
  }

  /* The row is a ring: after the last record comes the first. `pos` runs freely (it is brought back
     into 0..n when it rests), and each record sits at its shortest way round from it. */
  const mod = (i: number) => ((i % n) + n) % n;
  /** A distance in records, taken the short way round the ring: -n/2..n/2. */
  const around = (d: number) => d - n * Math.round(d / n);

  /** The pose of a record d places from the middle of the row. */
  function pose(d: number) {
    const ad = Math.abs(d);
    const sg = Math.sign(d);
    const near = Math.min(ad, 1);
    return {
      x: sg * (near * A + Math.max(0, ad - 1) * B),
      rot: -sg * near * ROT,
      s: 1 - near * 0.14,
      shade: Math.min(0.78, near * 0.38 + Math.max(0, ad - 1) * 0.12),
      // The far side of the ring is out of sight: a record fades out before it crosses from one end to the other.
      alpha: clamp(n / 2 - ad, 0, 1),
      z: 1000 - Math.round(ad * 10),
    };
  }

  // Where the row is, in records (0 = the first one in the middle).
  // The row opens on a record in the middle (marked by the page), so there are sleeves on both sides.
  const START = Math.max(0, buttons.findIndex((b) => b.hasAttribute('data-start')));
  const pos = new Spring(START, { response: 0.5, damping: 1 }, 0.0004);
  const zs = buttons.map(() => -1);
  const alphas = buttons.map(() => -1);
  let captionIndex = START;

  function renderRow() {
    const part = openIndex === null ? 0 : clamp(lift.value, 0, 1);
    for (let i = 0; i < n; i++) {
      const d = around(i - pos.value);
      const g = pose(d);
      let x = g.x;
      let shade = g.shade;
      if (part > 0 && i !== openIndex) {
        // The row parts around the record that came out, and dims.
        x += Math.sign(d) * Math.min(Math.abs(d), 1) * part * S * 0.32;
        shade = Math.min(0.85, shade + part * 0.3);
      }
      buttons[i]!.style.transform = `translate3d(${x.toFixed(2)}px,0,0) perspective(${P.toFixed(0)}px) rotateY(${g.rot.toFixed(3)}deg) scale(${g.s.toFixed(4)})`;
      shades[i]!.style.opacity = shade.toFixed(3);
      if (zs[i] !== g.z) {
        zs[i] = g.z;
        buttons[i]!.style.zIndex = String(g.z);
      }
      if (alphas[i] !== g.alpha) {
        alphas[i] = g.alpha;
        buttons[i]!.style.opacity = g.alpha.toFixed(3);
        buttons[i]!.style.pointerEvents = g.alpha < 0.2 ? 'none' : ''; // nothing to press on the far side
      }
    }
    const c = mod(Math.round(pos.value));
    if (c !== captionIndex) {
      captionIndex = c;
      const v = records[c]!;
      capTitle.textContent = v.title;
      capMeta.textContent = `${v.artist}, ${v.year}`;
      caption.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
    }
  }

  /** Bring record i to the middle, the short way round. */
  function goTo(i: number, velocity?: number) {
    thrown = false;
    pos.to(pos.value + around(i - pos.value), { response: 0.5, damping: 1, velocity });
    tick();
  }

  /* Dragging the row. Vertical pans stay with the browser (touch-action: pan-y); a horizontal one, once
     it is clearly horizontal, tracks the finger 1:1 and throws on release. */
  const tracker = new VelocityTracker();
  let rowDrag: { id: number; x0: number; y0: number; pos0: number; active: boolean } | null = null;
  let dragged = false; // the last press turned into a drag: its click must not open anything
  let caught = false; // the last press caught a thrown row in flight: it only stops it
  let thrown = false; // the row is coasting from a throw (not from a tap or the keyboard)

  row.addEventListener('pointerdown', (e) => {
    if (openIndex !== null || rowDrag?.active || (e.pointerType === 'mouse' && e.button !== 0)) return;
    dragged = false;
    caught = thrown && Math.abs(pos.velocity) > 0.6;
    pos.set(pos.value); // catch it where it is
    rowDrag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, pos0: pos.value, active: false };
    tracker.reset(e.clientX, e.timeStamp);
  });
  row.addEventListener('pointermove', (e) => {
    if (!rowDrag || e.pointerId !== rowDrag.id) return;
    const dx = e.clientX - rowDrag.x0;
    if (!rowDrag.active) {
      const dy = e.clientY - rowDrag.y0;
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      // Clearly sideways: it is ours. Track from here, so nothing jumps by the threshold.
      rowDrag.active = true;
      rowDrag.x0 = e.clientX;
      dragged = true;
      row.setPointerCapture(e.pointerId);
      row.classList.add('is-dragging');
      return;
    }
    tracker.push(e.clientX, e.timeStamp);
    pos.set(rowDrag.pos0 - dx / A); // no ends to pull against: it goes round
    tick();
  });
  const endRowDrag = (e: PointerEvent) => {
    if (!rowDrag || e.pointerId !== rowDrag.id) return;
    const wasActive = rowDrag.active;
    rowDrag = null;
    row.classList.remove('is-dragging');
    if (wasActive) {
      const v = e.type === 'pointercancel' ? 0 : tracker.velocity(e.timeStamp); // px/s, finger
      const vIdx = -v / A;
      const landing = Math.round(pos.value + -project(v) / A);
      // A flick earns a little bounce as it lands; a slow drag settles without one.
      pos.to(landing, { response: 0.55, damping: Math.abs(v) > 500 ? 0.82 : 1, velocity: vIdx });
      thrown = true;
      tick();
    } else if (caught || e.type === 'pointercancel') {
      goTo(Math.round(pos.value));
    }
  };
  // On the window: a press that never became a drag isn't captured, and can end anywhere.
  window.addEventListener('pointerup', endRowDrag, { signal });
  window.addEventListener('pointercancel', endRowDrag, { signal });
  row.addEventListener('dragstart', (e) => e.preventDefault());

  // A trackpad's sideways swipe moves the row too (a mouse wheel still scrolls the page).
  let wheelIdle = 0;
  row.addEventListener(
    'wheel',
    (e) => {
      if (openIndex !== null || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      pos.set(pos.value + e.deltaX / A);
      tick();
      clearTimeout(wheelIdle);
      wheelIdle = window.setTimeout(() => goTo(Math.round(pos.value)), 120);
    },
    { passive: false },
  );

  for (const [i, b] of buttons.entries()) {
    b.addEventListener('click', (e) => {
      // The click that ends a drag opens nothing. A click from the keyboard (detail 0) is never that one.
      const fromDrag = (dragged || caught) && e.detail !== 0;
      dragged = caught = false;
      if (fromDrag) {
        e.preventDefault();
        return;
      }
      if (openIndex !== null) return;
      // Off-centre: it comes to the middle and out in the same motion.
      if (Math.abs(around(i - pos.value)) > 0.5) goTo(i);
      openRecord(i);
    });
  }

  // Keyboard: Tab or the arrow keys walk the row; the focused record comes to the middle.
  let focusGuard = false;
  row.addEventListener('focusin', (e) => {
    const i = buttons.indexOf(e.target as HTMLButtonElement);
    if (i < 0 || openIndex !== null) return;
    focusGuard = true;
    requestAnimationFrame(() => (focusGuard = false));
    if (Math.abs(around(i - pos.target)) > 0.01) goTo(i);
  });
  row.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(e.target as HTMLButtonElement);
    if (i < 0) return;
    // The arrows go round: right of the last record is the first.
    const to = e.key === 'ArrowRight' ? mod(i + 1) : e.key === 'ArrowLeft' ? mod(i - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (to < 0 || to === i) return;
    e.preventDefault();
    buttons[to]!.focus({ preventScroll: true });
  });

  /* Anything that asks the browser to bring a record into view (focus, find in page, an automation)
     scrolls the hidden track. Put it back and centre that record instead: the one that became most
     visible with the scroll. */
  row.addEventListener('scroll', () => {
    const dx = row.scrollLeft - HOME;
    if (Math.abs(dx) < 1 && row.scrollTop === 0) return;
    const rr = row.getBoundingClientRect();
    const seen = (l: number, r: number) => clamp((Math.min(r, rr.right) - Math.max(l, rr.left)) / Math.max(1, r - l), 0, 1);
    let best = -1;
    let bestScore = 0.02;
    buttons.forEach((b, i) => {
      if (i === openIndex) return;
      const r = b.getBoundingClientRect();
      const now = seen(r.left, r.right);
      const gain = now - seen(r.left + dx, r.right + dx);
      const score = gain + (now > 0.98 ? 0.5 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    row.scrollLeft = HOME;
    row.scrollTop = 0;
    if (!focusGuard && best >= 0 && openIndex === null) goTo(best);
  });

  /* ---------------------------------------------------------------- the record, out */

  const overlay = q('[data-v4-open]');
  const scrim = q('[data-v4-scrim]');
  const scroller = q('[data-v4-scroll]');
  const stage = q('[data-v4-stage]');
  const hero = q('[data-v4-hero]');
  const group = q('[data-v4-group]');
  const disc = q('[data-v4-disc]');
  const art = q('[data-v4-art]');
  const titles = q('[data-v4-titles]');
  const title = q('[data-v4-title]');
  const meta = q('[data-v4-meta]');
  const details = q('[data-v4-details]');
  const bar = q('[data-v4-bar]');
  const closeButton = q<HTMLButtonElement>('[data-record-close]');
  const pageContent = q('[data-v4-page]');
  const footer = document.querySelector<HTMLElement>('.music-footer');

  // The tear strip.
  const strip = q('[data-unwrap]');
  const stripWin = q('[data-v4-strip-win]');
  const stripBand = q('[data-v4-strip-band]');
  const handle = q('[data-unwrap-handle]');
  const sheets = [...root.querySelectorAll<HTMLElement>('[data-v4-sheet]')];
  const slacks = [...root.querySelectorAll<HTMLElement>('[data-v4-slack]')];
  // The film: a top piece and a bottom piece.
  const films = [q('[data-v4-film="top"]'), q('[data-v4-film="bottom"]')] as const;
  const filmMid = q('[data-v4-film-mid]'); // the film where the tape goes, shown until the tape is there
  const sweep = q('[data-v4-sweep]');
  const hintCaption = q('[data-v4-hint]');

  const unwrapped = new Set<string>(); // for the rest of the visit
  let openIndex: number | null = null;
  let phase: 'idle' | 'open' | 'closing' = 'idle';

  const lift = new Spring(0, { response: 0.52, damping: 1 }, 0.0005); // 0 in the row, 1 in front of you
  const reveal = new Spring(0, { response: 0.7, damping: 1 }, 0.0005); // 0 disc in the sleeve, 1 half out
  const peel = new Spring(0, { response: 0.35, damping: 1 }, 0.0005); // 0 sealed, 1 strip torn off
  const rise = new Spring(0, { response: 0.55, damping: 1 }, 0.05); // px: the record making room for the details
  const away = new Spring(0, { response: 0.42, damping: 1 }, 0.0005); // 0 film on the sleeve, 1 gone
  let shedding = false; // the film is coming away

  /** Pulling the tape leans on the record: its right side tips away by this much, and it sinks a little. */
  const TILT = 8; // degrees
  const PRESS = 0.045; // of its size

  // Geometry of the pulled-out record, measured when it comes out.
  let So = 0; // its size
  let target = { cx: 0, cy: 0 }; // its centre at rest, in the viewport, with the overlay at scrollAt
  let scrollAt = 0;
  let source = { cx: 0, cy: 0 }; // the middle of the row's sleeve slot, in the viewport
  let revealScale = 1;
  let waitForDisc = false; // closing: the disc goes back in before the sleeve goes home

  function measureOpen() {
    hero.style.transform = 'none';
    const r = hero.getBoundingClientRect();
    So = r.width;
    target = { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    scrollAt = scroller.scrollTop;
    const rr = row.getBoundingClientRect();
    source = { cx: rr.left + rr.width / 2, cy: rr.top + buttons[0]!.offsetTop + S / 2 };
    // Sleeve plus the half of the disc that shows is 1.48 sleeves wide; shrink it to fit a phone.
    revealScale = Math.min(1, (window.innerWidth - 32) / (So * 1.48));
  }

  function luminance(hex: string) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
    if (!m) return 0;
    const [r, g, b] = [m[1], m[2], m[3]].map((h) => {
      const c = parseInt(h!, 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function fill(i: number, v: Vinyl) {
    const tone = buttons[i]!.dataset.tone === 'light' ? 'light' : 'dark';
    overlay.dataset.tone = tone;
    const [, mid, light] = v.palette;
    // The label is the sleeve's middle colour, unless that would vanish into the black vinyl.
    overlay.style.setProperty('--label-bg', luminance(mid) < 0.04 ? light : mid);
    art.innerHTML = q('.v4-art', buttons[i]!).innerHTML;
    title.textContent = v.title;
    meta.textContent = `${v.artist}, ${v.year}`;
    q('[data-v4-why]').textContent = v.why;
    q('[data-tracklist]').replaceChildren(
      ...v.tracks.map((t) => {
        const li = document.createElement('li');
        li.textContent = t;
        return li;
      }),
    );
    const f = musicCopy.record.fields;
    const facts: [string, string, string][] = [
      ['year', f.year, String(v.year)],
      ['format', f.format, v.format],
      ['tracks', f.tracks, String(v.tracks.length)],
      ['label', f.label, v.label],
      ['genre', f.genre, v.genre],
    ];
    q('[data-v4-facts]').replaceChildren(
      ...facts.map(([key, name, value]) => {
        const box = document.createElement('div');
        box.className = `v4-fact v4-fact--${key}`;
        const dt = document.createElement('dt');
        dt.textContent = name;
        const dd = document.createElement('dd');
        dd.textContent = value;
        box.append(dt, dd);
        return box;
      }),
    );
  }

  function setBackgroundInert(on: boolean) {
    pageContent.inert = on;
    if (footer) footer.inert = on;
    document.documentElement.style.overflow = on ? 'hidden' : '';
  }

  function openRecord(i: number) {
    if (openIndex !== null) return;
    const v = records[i]!;
    const isOpen = unwrapped.has(v.id);
    openIndex = i;
    phase = 'open';
    fill(i, v);

    overlay.hidden = false;
    overlay.setAttribute('data-record-open', v.id);
    overlay.toggleAttribute('data-record-unwrapped', isOpen);
    overlay.toggleAttribute('data-layout-open', isOpen);
    overlay.removeAttribute('data-show-details');
    overlay.classList.add('is-instant');
    details.hidden = !isOpen;
    handle.tabIndex = isOpen ? -1 : 0;
    scroller.scrollTop = 0;
    setBackgroundInert(true);

    measureOpen();
    clearTimeout(hintTimer);
    hintPhase = isOpen || hintShown ? 'done' : 'idle';
    peel.set(isOpen ? 1 : 0);
    reveal.set(0);
    rise.set(0);
    away.set(0);
    endShed();
    buttons[i]!.classList.add('is-out');

    if (reduced()) {
      // No flight: the record is simply there, faded in.
      lift.set(1);
      if (isOpen) reveal.set(1);
      overlay.classList.add('is-fade');
      overlay.style.opacity = '0';
      renderAll();
      void overlay.offsetWidth;
      overlay.style.opacity = '1';
      if (isOpen) overlay.setAttribute('data-show-details', '');
    } else {
      lift.to(1, { response: 0.52, damping: 1 });
      renderAll();
    }
    requestAnimationFrame(() => overlay.classList.remove('is-instant'));
    (isOpen ? title : handle).focus({ preventScroll: true });
    tick();
  }

  function closeRecord() {
    if (openIndex === null || phase === 'closing') return;
    phase = 'closing';
    cancelHint();
    overlay.removeAttribute('data-show-details');
    if (peelDrag) endPeel(null);
    if (shedding) {
      // Put back while the film was still coming away: it is gone.
      away.set(1);
      endShed();
    }
    if (!unwrapped.has(records[openIndex]!.id)) peel.to(0, { response: 0.3, damping: 1 });
    rise.set(0);
    if (lift.settled && lift.value === 1) measureOpen(); // fresh, in case the window changed

    if (reduced()) {
      overlay.style.opacity = '0';
      window.setTimeout(finishClose, 210);
      return;
    }
    if (reveal.value > 0.001) {
      reveal.to(0, { response: 0.45, damping: 1 });
      waitForDisc = true;
    } else {
      lift.to(0, { response: 0.5, damping: 1 });
    }
    tick();
  }

  function finishClose() {
    if (openIndex === null) return;
    const i = openIndex;
    openIndex = null;
    phase = 'idle';
    waitForDisc = false;
    lift.set(0);
    reveal.set(0);
    rise.set(0);
    overlay.hidden = true;
    overlay.removeAttribute('data-record-open');
    overlay.removeAttribute('data-record-unwrapped');
    overlay.removeAttribute('data-layout-open');
    overlay.removeAttribute('data-show-details');
    overlay.classList.remove('is-fade');
    overlay.style.opacity = '';
    stage.style.transform = '';
    buttons[i]!.classList.remove('is-out');
    setBackgroundInert(false);
    renderRow();
    buttons[i]!.focus({ preventScroll: true });
  }

  function renderHero() {
    const t = lift.value;
    if (lift.settled && t === 1) {
      hero.style.transform = 'none';
    } else {
      // From the record's pose in the row (wherever the row is right now) to its place in front.
      const g = pose(around(openIndex! - pos.value));
      const k = (g.s * S) / So;
      const u = 1 - t;
      const scrolled = scroller.scrollTop - scrollAt;
      const x = (source.cx + g.x - target.cx) * u;
      const y = (source.cy - (target.cy - scrolled)) * u - Math.sin(Math.PI * clamp(t, 0, 1)) * So * 0.1;
      hero.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) perspective(${P.toFixed(0)}px) rotateY(${(g.rot * u).toFixed(3)}deg) scale(${(k + (1 - k) * t).toFixed(4)})`;
    }
    stage.style.transform = rise.value === 0 ? '' : `translate3d(0,${rise.value.toFixed(2)}px,0)`;
    const a = clamp(t, 0, 1);
    scrim.style.opacity = Math.min(1, a * 1.5).toFixed(3);
    const late = clamp((t - 0.65) / 0.35, 0, 1).toFixed(3);
    titles.style.opacity = late;
    bar.style.opacity = late;
    // What a sleeve in the row doesn't have (the tear tape and its tab) arrives with it and leaves
    // first; the film that was in the tape's place goes as the tape comes.
    handle.style.opacity = late;
    stripBand.style.opacity = late; // on the glass itself: a faded parent would cut it off from what it blurs
    filmMid.style.opacity = (1 - Number(late)).toFixed(3);
    // "Slide to unwrap" under the title while sealed; it goes as the tape comes off.
    hintCaption.style.opacity = (Number(late) * clamp(1 - peel.value * 2.5, 0, 1)).toFixed(3);
  }

  /** How far the record leans, 0 to 1. It comes on early in the pull, and goes as the film leaves. */
  function lean() {
    if (openIndex === null || reduced()) return 0;
    if (shedding) return (1 - clamp(away.value, 0, 1)) ** 2;
    if (unwrapped.has(records[openIndex]!.id)) return 0;
    return 1 - (1 - clamp(peel.value, 0, 1)) ** 3;
  }

  function renderReveal() {
    const r = reveal.value;
    const t = lean();
    const shift = -0.24 * So * revealScale * r;
    const s = (1 - (1 - revealScale) * r) * (1 - PRESS * t);
    const tilt = t === 0 ? '' : ` perspective(${(So * 3.8).toFixed(0)}px) rotateY(${(TILT * t).toFixed(3)}deg)`;
    group.style.transform = r === 0 && t === 0 ? '' : `translate3d(${shift.toFixed(2)}px,0,0) scale(${s.toFixed(4)})${tilt}`;
    // The disc rolls out: it turns by as much as it travels, and comes to rest with its label upright.
    disc.style.transform = r === 0 ? '' : `translate3d(${(0.5 * So * r).toFixed(2)}px,0,0) rotate(${((r - 1) * 60).toFixed(2)}deg)`;
  }

  /* The tear strip. The tab's right edge is the tear: behind it the strip is gone and the bare sleeve
     shows through a clean channel; ahead of it the band and its label remain, covered by the tab as
     it passes. Two opposing translates do the clipping, so it is transform only. */
  let lastValueNow = -1;
  function renderPeel() {
    const p = peel.value;
    const pc = clamp(p, 0, 1);
    const torn = pc * So;
    stripWin.style.transform = `translate3d(${torn.toFixed(2)}px,0,0)`;
    stripBand.style.transform = `translate3d(${(-torn).toFixed(2)}px,0,0)`;
    handle.style.transform = `translate3d(${(p * So).toFixed(2)}px,0,0)`;
    // With the tape going, the film loses its tension: the long taut streaks thin out and the short
    // folds of slack film come up in their place.
    const k = clamp((pc - 0.2) / 0.8, 0, 1);
    const loose = k * k * (3 - 2 * k);
    const taut = (1 - 0.65 * loose).toFixed(3);
    const slack = loose.toFixed(3);
    for (const el of sheets) el.style.opacity = taut;
    for (const el of slacks) el.style.opacity = slack;
    const now = Math.round(pc * 100);
    if (now !== lastValueNow) {
      lastValueNow = now;
      handle.setAttribute('aria-valuenow', String(now));
    }
  }

  /* The film coming away once the tape is off: the top piece goes up and the bottom one down, each
     swinging about the end the tab left by. */
  function renderShed() {
    const a = away.value;
    if (a === 0) {
      for (const f of films) {
        f.style.transform = '';
        f.style.opacity = '';
      }
      return;
    }
    // A short way: far enough to read as leaving, not so far that it crosses the title below.
    const d = a * So * 0.17;
    const fade = clamp(1 - a * 1.45, 0, 1).toFixed(3);
    for (let i = 0; i < 2; i++) {
      const up = i === 0 ? -1 : 1;
      films[i]!.style.transform = `translate3d(0,${(up * d).toFixed(2)}px,0) rotate(${(up * a * 3.5).toFixed(3)}deg)`;
      films[i]!.style.opacity = fade;
    }
  }

  function renderAll() {
    renderRow();
    if (openIndex !== null) {
      renderHero();
      renderReveal();
      renderPeel();
      renderShed();
    }
  }

  /* Dragging the tab: 1:1 along the strip from where it was grabbed (anywhere on the strip moves it by
     as much as the finger moves). Let go early and it springs back, re-sealing the strip behind it;
     past 60%, or thrown so that it would get there, it finishes on its own. */
  let peelDrag: { id: number; x0: number; p0: number; el: HTMLElement } | null = null;
  const peelTracker = new VelocityTracker();

  function startPeel(e: PointerEvent, el: HTMLElement) {
    if (openIndex === null || phase !== 'open' || unwrapped.has(records[openIndex]!.id) || peelDrag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (!lift.settled) {
      lift.set(1); // grabbed while still arriving: it is here now
      renderHero();
    }
    el.setPointerCapture(e.pointerId);
    peel.set(peel.value);
    cancelHint();
    peelDrag = { id: e.pointerId, x0: e.clientX, p0: peel.value, el };
    peelTracker.reset(e.clientX, e.timeStamp);
    handle.classList.add('is-pressed');
    tick();
  }
  function movePeel(e: PointerEvent) {
    if (!peelDrag || e.pointerId !== peelDrag.id) return;
    peelTracker.push(e.clientX, e.timeStamp);
    // Once it moves, the tab is picked up: a touch larger, its shadow deeper.
    if (Math.abs(e.clientX - peelDrag.x0) > 2) handle.classList.add('is-lifted');
    let p = peelDrag.p0 + (e.clientX - peelDrag.x0) / So;
    if (p < 0) p = -rubberband(-p * So, So, 0.3) / So;
    else if (p > 1) p = 1 + rubberband((p - 1) * So, So, 0.3) / So;
    peel.set(p);
    tick();
  }
  function endPeel(e: PointerEvent | null) {
    if (!peelDrag) return;
    if (e && e.pointerId !== peelDrag.id) return;
    peelDrag = null;
    handle.classList.remove('is-pressed', 'is-lifted');
    const vPx = e && e.type !== 'pointercancel' ? peelTracker.velocity(e.timeStamp) : 0;
    const v = vPx / So; // strip-lengths per second
    const projected = peel.value + project(vPx, 0.995) / So;
    const done = phase === 'open' && projected >= 0.6;
    if (done) {
      if (reduced()) peel.set(1);
      else peel.to(1, { response: 0.3, damping: 1, velocity: Math.max(v, 0) });
    } else {
      peel.to(0, { response: 0.35, damping: 1, velocity: v });
    }
    tick();
  }
  for (const el of [handle, strip]) {
    el.addEventListener('pointerdown', (e) => startPeel(e, el));
    el.addEventListener('pointermove', movePeel);
    el.addEventListener('pointerup', endPeel);
    el.addEventListener('pointercancel', endPeel);
    el.addEventListener('lostpointercapture', () => endPeel(null));
  }
  handle.addEventListener('keydown', (e) => {
    if (openIndex === null || phase !== 'open' || unwrapped.has(records[openIndex]!.id)) return;
    if (['ArrowRight', 'ArrowUp', 'End', 'PageUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      if (reduced()) peel.set(1);
      else peel.to(1, { response: 0.5, damping: 1 });
      tick();
    }
  });

  /* A one-time hint, half a second after a sealed record has landed: the tab tugs the tape 10px and lets
     go, and a soft light runs once along the tape. Never repeats; any touch or key cancels it. */
  let hintTimer = 0;
  let hintPhase: 'idle' | 'waiting' | 'out' | 'done' = 'idle';
  let hintShown = false; // once per visit
  function scheduleHint() {
    if (hintPhase !== 'idle' || reduced()) return;
    hintPhase = 'waiting';
    hintTimer = window.setTimeout(() => {
      if (phase !== 'open' || openIndex === null || unwrapped.has(records[openIndex]!.id) || peelDrag) return cancelHint();
      hintPhase = 'out';
      hintShown = true;
      peel.to(10 / So, { response: 0.28, damping: 1 });
      sweep.animate(
        [{ transform: 'translateX(-100%)', opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.7 }, { transform: 'translateX(100%)', opacity: 0 }],
        { duration: 900, easing: 'cubic-bezier(0.77, 0, 0.175, 1)' },
      );
      tick();
    }, 500);
  }
  function cancelHint() {
    clearTimeout(hintTimer);
    if (hintPhase === 'out' && !peelDrag) peel.to(0, { response: 0.3, damping: 1 });
    for (const a of sweep.getAnimations()) a.cancel();
    hintPhase = 'done';
  }
  overlay.addEventListener('pointerdown', () => hintPhase !== 'done' && cancelHint(), true);
  overlay.addEventListener('keydown', () => hintPhase !== 'done' && cancelHint(), true);

  /* Finished: the tab slips off the edge and the film comes away on a spring that starts at the speed
     the tape was going, so a quick pull throws it and a slow one lets it fall. As it clears, the record
     moves up to make room, the details rise in beneath it, and the disc slides out. */
  function commitUnwrap() {
    if (openIndex === null) return;
    const id = records[openIndex]!.id;
    if (unwrapped.has(id)) return;
    const speed = peel.velocity; // strip-lengths per second
    unwrapped.add(id);
    peel.set(1);
    overlay.setAttribute('data-record-unwrapped', '');
    buttons[openIndex]!.classList.add('is-unwrapped');
    handle.tabIndex = -1;
    title.focus({ preventScroll: true });
    // One tick as the tape lets go, where the device has haptics for the web.
    if ('vibrate' in navigator) navigator.vibrate(8);
    if (reduced()) {
      openLayout(false);
      reveal.set(1);
      requestAnimationFrame(() => overlay.setAttribute('data-show-details', ''));
      tick();
      return;
    }
    shedding = true;
    overlay.classList.add('is-shedding');
    away.set(0);
    away.to(1, { response: 0.42, damping: 1, velocity: clamp(speed * 0.6, 0, 4) });
    tick();
  }

  function endShed() {
    shedding = false;
    overlay.classList.remove('is-shedding');
  }

  function openLayout(animate: boolean) {
    if (openIndex === null || phase !== 'open') return;
    const before = stage.getBoundingClientRect().top; // where it is on screen now
    details.hidden = false;
    overlay.setAttribute('data-layout-open', '');
    const layoutAfter = stage.getBoundingClientRect().top - rise.value;
    measureOpen();
    if (animate) {
      rise.set(before - layoutAfter); // stay put on screen, then glide up to the new place
      rise.to(0, { response: 0.55, damping: 1 });
      reveal.to(1, { response: 0.7, damping: 1 });
      requestAnimationFrame(() => overlay.setAttribute('data-show-details', ''));
    }
    renderAll();
    tick();
  }

  closeButton.addEventListener('click', closeRecord);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openIndex !== null) {
      e.preventDefault();
      closeRecord();
    }
  }, { signal });

  /* ---------------------------------------------------------------- the clock */

  let raf = 0;
  let last = 0;
  function tick() {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }
  function frame(now: number) {
    raf = 0;
    const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
    last = now;

    let busy = false;
    if (!rowDrag?.active) {
      const moving = !pos.step(dt);
      if (!moving) {
        thrown = false;
        // At rest, back into 0..n: the same place on the ring, so nothing on screen changes.
        if (pos.value < -0.5 || pos.value >= n - 0.5) pos.set(mod(Math.round(pos.value)));
      }
      busy = moving || busy;
    }
    if (openIndex !== null) {
      busy = !lift.step(dt) || busy;
      busy = !reveal.step(dt) || busy;
      busy = !rise.step(dt) || busy;
      if (!peelDrag) busy = !peel.step(dt) || busy;
      busy = busy || !!peelDrag;
      busy = !away.step(dt) || busy;
      if (shedding) {
        // The record opens as the film clears it, not on a timer.
        if (away.value > 0.35 && phase === 'open' && !overlay.hasAttribute('data-layout-open')) openLayout(true);
        if (away.settled) endShed();
      }

      const id = records[openIndex]!.id;
      if (phase === 'open' && !unwrapped.has(id) && lift.settled && lift.value === 1 && hintPhase === 'idle') scheduleHint();
      if (hintPhase === 'out' && peel.value >= peel.target * 0.96) {
        hintPhase = 'done';
        peel.to(0, { response: 0.4, damping: 1 });
        busy = true;
      }
      if (phase === 'open' && !unwrapped.has(id) && peel.target === 1 && peel.value >= 0.995) commitUnwrap();
      // Coming back already unwrapped: the disc slides out as the record arrives.
      if (phase === 'open' && unwrapped.has(id) && overlay.hasAttribute('data-layout-open')) {
        if (reveal.target === 0 && lift.value > 0.55) reveal.to(1, { response: 0.7, damping: 1 });
        if (reveal.value > 0.3 && !overlay.hasAttribute('data-show-details')) overlay.setAttribute('data-show-details', '');
      }
      if (phase === 'closing' && waitForDisc && reveal.value < 0.35) {
        waitForDisc = false;
        lift.to(0, { response: 0.5, damping: 1 });
        busy = true;
      }
    }
    renderAll();
    if (phase === 'closing' && !waitForDisc && lift.settled && lift.value === 0) {
      finishClose();
      busy = !pos.settled;
    }
    if (busy || rowDrag?.active) raf = requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------- start */

  measure();
  renderRow();
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      measure();
      if (openIndex !== null && lift.settled && lift.value === 1) measureOpen();
      renderAll();
    });
  }, { signal });
  signal.addEventListener('abort', () => {
    cancelAnimationFrame(raf);
    cancelAnimationFrame(resizeFrame);
    clearTimeout(wheelIdle);
    clearTimeout(hintTimer);
  });
}
