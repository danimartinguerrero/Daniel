/**
 * s4/b, "The ring from above". Two things move here and neither has a state of its own:
 *
 * - The point of view follows the scroll. As the floor comes up the screen it is seen almost edge-on,
 *   from where you stood at the shelf; through the pinned stretch the camera rises until you look down
 *   on the ring. The words on the floor become readable by perspective alone, not by a fade.
 * - The ring is the carousel. It turns only when the carousel says it turned (`v4:turn` on the page's
 *   root), so the record nearest you is always the one in the middle up there. A sideways drag or a
 *   trackpad swipe on the floor is handed to the carousel's own row (listening-bar.ts), which follows the
 *   finger 1:1, throws, projects and springs exactly as it does at the top of the page: one ring, one
 *   set of physics, two views. The ring's spacing is computed from the carousel's, so a record's step
 *   round the ring under the finger is the same distance as a record's step in the row.
 */
import { onPage } from '@/scripts/page';
import { clamp } from '@/components/music/v4/physics';
import { vinyls } from '@/data/music';

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('[data-s4r]');
  const page = document.querySelector<HTMLElement>('[data-music-page]');
  if (root && page) init(root, page, signal);
});

function init(root: HTMLElement, page: HTMLElement, signal: AbortSignal) {
  const track = root.querySelector<HTMLElement>('[data-s4r-track]')!;
  const scene = root.querySelector<HTMLElement>('[data-s4r-scene]')!;
  const words = root.querySelector<HTMLElement>('.s4r-words')!;
  const pool = root.querySelector<HTMLElement>('.s4r-pool')!;
  const slots = [...root.querySelectorAll<HTMLElement>('[data-s4r-slot]')];
  const shades = [...root.querySelectorAll<HTMLElement>('[data-s4r-shade]')];
  const sleeves = [...root.querySelectorAll<HTMLElement>('[data-s4r-sleeve]')];
  const capTitle = root.querySelector<HTMLElement>('[data-s4r-cap-title]')!;
  const capMeta = root.querySelector<HTMLElement>('[data-s4r-cap-meta]')!;
  const row = page.querySelector<HTMLElement>('[data-v4-row]')!;
  const buttons = [...row.querySelectorAll<HTMLButtonElement>('[data-vinyl]')];
  const n = vinyls.length;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const start = Math.max(0, buttons.findIndex((b) => b.hasAttribute('data-start')));

  /* ---------------------------------------------------------------- sizes, from the carousel */
  let depth = 0;
  const persp = () => (innerWidth < 700 ? 760 : 1000);
  let R = 0;
  function measure() {
    const A = buttons[0]!.offsetWidth * 0.66; // listening-bar.ts: px the finger moves per record
    R = (n * A) / (2 * Math.PI); // so that one record's arc at the front is A
    const s = A / 1.14;
    root.style.setProperty('--rr', `${R.toFixed(1)}px`);
    root.style.setProperty('--rs', `${s.toFixed(1)}px`);
    root.style.setProperty('--fd', `${(2 * (R + s)).toFixed(1)}px`);
    // Back far enough that the whole ring, seen from above, fits the screen with room for the caption.
    // On a phone the ring is wider than the screen: it runs off both sides, which is how a floor looks
    // from above when you stand in it, and keeps the records and the words at a size you can read.
    const fit = innerWidth < 700 ? innerHeight * 0.95 : Math.min(innerWidth * 0.92, innerHeight * 0.9);
    depth = Math.max(0, ((2 * (R + s)) / fit - 1) * persp());
  }

  /* ---------------------------------------------------------------- the ring follows the carousel */
  const around = (d: number) => d - n * Math.round(d / n);
  let pos = start;
  /* Each piece on the floor carries the whole camera in its own transform (perspective(), then the
     floor's tilt, then its place on the floor), as the carousel's sleeves do: nothing depends on
     preserve-3d, which WebKit drew flat in the pinned box, and the words can face the camera. */
  let cam = '';
  function renderRing() {
    for (let i = 0; i < n; i++) {
      slots[i]!.style.transform = `${cam} rotate(${(((pos - i) * 360) / n).toFixed(3)}deg) translate3d(0,${R.toFixed(1)}px,0)`;
      // The one at the front is lit as the one in the middle of the carousel is; the rest go a little
      // darker round the ring, never black: from above you see the whole ring.
      const d = Math.abs(around(i - pos));
      shades[i]!.style.opacity = (Math.min(1, d) * 0.22 + Math.max(0, d - 1) * 0.06).toFixed(3);
    }
  }
  page.addEventListener('v4:turn', (e) => {
    pos = (e as CustomEvent<{ pos: number }>).detail.pos;
    renderRing();
  }, { signal });
  page.addEventListener('v4:centre', (e) => {
    const v = vinyls[(e as CustomEvent<{ index: number }>).detail.index];
    if (!v) return;
    capTitle.textContent = v.title;
    capMeta.textContent = `${v.artist}, ${v.year}`;
  }, { signal });

  /* ---------------------------------------------------------------- the hand, handed to the carousel */
  const forward = (type: string, e: PointerEvent) =>
    row.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: e.isPrimary,
      clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY, button: e.button, buttons: e.buttons,
    }));
  let held: { id: number; x0: number; moved: boolean; sleeve: number } | null = null;
  scene.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Which record the press began on (the target of the release can be the floor beneath it).
    // Chrome gives the floor as the target of a press inside the tilted ring; asking what is under the
    // point finds the sleeve.
    const s = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.matches('[data-s4r-sleeve]')) as HTMLElement | undefined;
    held = { id: e.pointerId, x0: e.clientX, moved: false, sleeve: s ? Number(s.dataset.s4rSleeve) : -1 };
    forward('pointerdown', e);
  }, { signal });
  scene.addEventListener('pointermove', (e) => {
    if (!held || e.pointerId !== held.id) return;
    if (Math.abs(e.clientX - held.x0) > 8) held.moved = true;
    // Until the row takes the pointer (it captures it once the move is clearly sideways), it hears
    // the moves from here; after that they go to it directly.
    if (!row.hasPointerCapture(e.pointerId)) forward('pointermove', e);
  }, { signal });
  const end = (e: PointerEvent) => {
    if (held && e.pointerId === held.id && !held.moved) {
      // A tap on a record takes it out, as a tap on it in the carousel does. It flies down from the
      // shelf, where it lives.
      if (held.sleeve >= 0 && e.type === 'pointerup') buttons[held.sleeve]?.click();
    }
    held = null;
  };
  window.addEventListener('pointerup', end, { signal });
  window.addEventListener('pointercancel', end, { signal });
  scene.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    row.dispatchEvent(new WheelEvent('wheel', { deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, cancelable: true }));
  }, { passive: false, signal });
  scene.addEventListener('dragstart', (e) => e.preventDefault(), { signal });

  /* ---------------------------------------------------------------- the camera, on the scroll */
  const ease = (t: number) => t * t * (3 - 2 * t);
  let frame = 0;
  function renderCamera() {
    frame = 0;
    const r = track.getBoundingClientRect();
    const H = innerHeight;
    // 0 as the floor comes in at the bottom of the screen, 1 as the pin lets go.
    const t = clamp((H - r.top) / (r.height - H * 0.15), 0, 1);
    const k = ease(t);
    const tilt = 82 - 46 * k; // nearly edge-on, from where you stood at the shelf, to looking down
    // Seen low, the floor sits below the middle of the screen, like a floor; from above it is centred.
    const y = (1 - k) * H * 0.16;
    // The ring sits back from the screen, so all of it fits once you are above it.
    // Pushing the ring back (translateZ) drew it off-centre in WebKit; scaling it down in front of a
    // longer perspective is the same picture: P/(P + D - z) either way.
    const P = persp();
    const scale = P / (P + depth);
    const eye = `translate3d(0,${y.toFixed(1)}px,0) scale(${scale.toFixed(4)})`;
    cam = `${eye} perspective(${(P + depth).toFixed(1)}px) rotateX(${tilt.toFixed(2)}deg)`;
    pool.style.transform = cam;
    // The words stand in the middle of the ring facing you: printed flat on the floor, the perspective
    // slanted their letters like italics.
    words.style.transform = eye;
    // Standing, they would float over a floor still seen edge-on: they come up as the floor opens.
    words.style.opacity = clamp((k - 0.12) / 0.3, 0, 1).toFixed(3);
    renderRing();
  }
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(renderCamera); };

  measure();
  renderRing();
  if (!reduced) {
    renderCamera();
    window.addEventListener('scroll', onScroll, { passive: true, signal });
  }
  window.addEventListener('resize', () => { measure(); onScroll(); }, { signal });
  signal.addEventListener('abort', () => cancelAnimationFrame(frame));
  void sleeves;
  void scene;
}
