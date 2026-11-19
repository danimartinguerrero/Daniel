/**
 * Way c1: the wall, on the page's side. climb.ts says where the film is (how far the camera has looked
 * up, and how far along the wall's stretch of scroll); from that this lights the lines a letter at a
 * time, as in the ring, and tells the scene where the camera is. Like the climb it keeps no state of
 * its own: every frame comes from where the scroll is, both ways.
 *
 * The scene (three.js and the two models) is only fetched once the page starts to climb, so the intro
 * and the shelf never wait for it. Until it is in, the wall is dark and the lines are still said.
 *
 * A hand can take an instrument and swing it: it follows the hand about its hook from where it was
 * taken, and on release keeps the hand's speed and settles by itself (scene.ts).
 */
import { onPage } from '@/scripts/page';
import { clamp } from '../v4/physics';
import { wallView } from './climb';
import type { WallScene } from './scene';

// The lines' share of the wall's stretch of scroll, and each line's own: it comes in, fills, is held
// lit, and makes way for the next.
const SAYS_FROM = 0.1;
const SAYS_UNTIL = 0.97;
const LINE_IN = 0.1;
const LINE_FULL = 0.72;
const LINE_OUT = 0.9;
const LEAD = 4; // letters the soft edge of the light runs ahead

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('[data-music-page].c1');
  const layer = root?.querySelector<HTMLElement>('[data-c1-wall]');
  if (root && layer) init(root, layer, signal);
});

function init(root: HTMLElement, layer: HTMLElement, signal: AbortSignal) {
  const canvas = layer.querySelector<HTMLCanvasElement>('[data-c1-canvas]')!;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const part = (t: number, from: number, to: number) => clamp((t - from) / (to - from), 0, 1);

  const lines = [...layer.querySelectorAll<HTMLElement>('[data-c1-line]')].map((el) => {
    const words = [...el.querySelectorAll<HTMLElement>('[data-w]')];
    let length = 0;
    const spans = words.map((w) => {
      const from = length;
      length += (w.textContent ?? '').length + 1;
      return { from, to: length - 1 };
    });
    return { el, words, spans, length, fills: new Array<string>(words.length).fill(''), shown: '', moved: '' };
  });
  const along = () => part(wallView.u, SAYS_FROM, SAYS_UNTIL) * lines.length;

  /* ---------------------------------------------------------------- the scene, when it is needed */
  let scene: WallScene | null = null;
  let asked = false;
  function fetchScene() {
    if (asked || still.matches) return;
    asked = true;
    void import('./scene')
      .then(({ createScene }) => createScene(canvas))
      .then((made) => {
        if (signal.aborted) return made.dispose();
        scene = made;
        made.set(along(), wallView.look);
        layer.classList.add('is-lit');
      })
      .catch(() => { /* no WebGL, or the models didn't come: the wall stays dark and the lines are said */ });
  }

  /* ---------------------------------------------------------------- one frame, from where the film is */
  function draw() {
    if (still.matches) return;
    const a = along();
    lines.forEach((line, i) => {
      const t = clamp(a - i, 0, 1);
      const arrive = part(t, 0, LINE_IN);
      const leave = i === lines.length - 1 ? 0 : part(t, LINE_OUT, 1);
      const shown = (arrive * (1 - leave)).toFixed(3);
      if (shown !== line.shown) {
        line.el.style.opacity = line.shown = shown;
        line.el.style.visibility = shown === '0.000' ? 'hidden' : '';
      }
      const moved = `translate3d(0,${((1 - arrive) * 14 - leave * 14).toFixed(1)}px,0)`;
      if (moved !== line.moved) line.el.style.transform = line.moved = moved;
      const at = part(t, LINE_IN, LINE_FULL) * (line.length + LEAD);
      for (let k = 0; k < line.words.length; k++) {
        const span = line.spans[k]!;
        const f = clamp((at - span.from) / (span.to - span.from + LEAD), 0, 1).toFixed(3);
        if (line.fills[k] !== f) line.words[k]!.style.setProperty('--f', (line.fills[k] = f));
      }
    });
    scene?.set(a, wallView.look);
  }
  root.addEventListener('c1:wall', draw, { signal });
  // The page has started to climb: the wall is a few screens of scroll away.
  root.addEventListener('v4:camera', (e) => {
    if ((e as CustomEvent<{ w: number }>).detail.w > 0.02) fetchScene();
  }, { signal });
  draw();
  if (wallView.u > 0) fetchScene();

  /* ---------------------------------------------------------------- a hand on an instrument */
  let pointer = -1;
  const at = (e: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!scene || pointer >= 0 || !e.isPrimary || e.button > 0) return;
    const { x, y } = at(e);
    if (!scene.grab(x, y, e.timeStamp)) return;
    pointer = e.pointerId;
    canvas.setPointerCapture(pointer);
    canvas.classList.add('is-held');
  }, { signal });
  canvas.addEventListener('pointermove', (e) => {
    if (!scene) return;
    const { x, y } = at(e);
    if (e.pointerId === pointer) scene.drag(x, y, e.timeStamp);
    else if (pointer < 0 && e.pointerType === 'mouse') canvas.classList.toggle('is-over', scene.over(x, y));
  }, { signal });
  const letGo = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = -1;
    canvas.classList.remove('is-held');
    scene?.release();
  };
  canvas.addEventListener('pointerup', letGo, { signal });
  canvas.addEventListener('pointercancel', letGo, { signal });
  canvas.addEventListener('lostpointercapture', letGo, { signal });

  const sized = new ResizeObserver(() => scene?.resize());
  sized.observe(canvas);
  still.addEventListener('change', () => {
    if (still.matches) {
      for (const line of lines) {
        line.el.removeAttribute('style');
        line.words.forEach((el) => el.style.removeProperty('--f'));
        line.fills.fill('');
        line.shown = line.moved = '';
      }
    } else {
      draw();
    }
  }, { signal });
  signal.addEventListener('abort', () => {
    sized.disconnect();
    scene?.dispose();
    scene = null;
  });
}
