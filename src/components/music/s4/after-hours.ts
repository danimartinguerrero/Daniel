/**
 * s4/c, "After hours". One clock: how far the visitor has come down the page. As the photograph comes
 * up the lamp over the shelf goes down, and once the photograph is pinned, its screen wakes and its
 * light comes up in the room. Going back up reverses it on the same path, light for light: the screen
 * goes dark first, then the lamp comes back over the records. Opacity only, written once per frame
 * that the scroll has moved.
 */
import { onPage } from '@/scripts/page';
import { clamp } from '@/components/music/v4/physics';

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('[data-s4h]');
  const dusk = document.querySelector<HTMLElement>('[data-s4h-dusk]');
  if (root && dusk) init(root, dusk, signal);
});

function init(root: HTMLElement, dusk: HTMLElement, signal: AbortSignal) {
  const track = root.querySelector<HTMLElement>('[data-s4h-track]')!;
  const lit = root.querySelector<HTMLElement>('[data-s4h-lit]')!;
  const words = root.querySelector<HTMLElement>('[data-s4h-words]')!;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // A light coming up is not linear to the eye: it eases in (a screen waking), and a lamp dimming
  // eases out (most of the change early, the last glow lingering).
  const easeIn = (t: number) => t * t;
  const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
  const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);

  let frame = 0;
  function render() {
    frame = 0;
    const r = track.getBoundingClientRect();
    const H = innerHeight;
    // 0 as the photograph comes in at the bottom of the screen, 1 as the pin lets go.
    const t = clamp((H - r.top) / r.height, 0, 1);
    dusk.style.opacity = (0.86 * easeOut(span(t, 0.05, 0.42))).toFixed(3);
    const l = easeIn(span(t, 0.36, 0.72));
    lit.style.opacity = l.toFixed(3);
    const w = span(t, 0.55, 0.8);
    words.style.opacity = w.toFixed(3);
    words.style.transform = `translate3d(0,${((1 - w) * 16).toFixed(1)}px,0)`;
  }
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(render); };
  render();
  window.addEventListener('scroll', onScroll, { passive: true, signal });
  window.addEventListener('resize', onScroll, { signal });
  signal.addEventListener('abort', () => {
    cancelAnimationFrame(frame);
    dusk.style.opacity = '';
  });
}
