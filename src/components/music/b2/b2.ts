/**
 * Behaviour of version b2: the words of the block under the records light as they rise past a reading
 * line, and go dim again when they drop back below it. The lighting is tied to the scroll position
 * itself, so it follows the hand exactly, can be stopped or reversed at any instant, and needs no pin.
 * Nothing runs while the page is still: one frame per scroll event at most.
 *
 * Each word gets the scroll position at which it lights: its centre has to
 * reach the reading line, 70% of the way down the smallest viewport (100svh, never innerHeight, which
 * grows on an iPhone as its toolbar collapses mid-scroll). Words further right on their line must rise a
 * little higher, so a line reads left to right instead of flipping at once. Where the page cannot scroll
 * far enough for the last words to reach the line (they sit just above the footer), every position is
 * drawn in proportionally, so the last word is lit at the bottom of the page on any window.
 *
 * Everything starts inside onPage and stops when its signal aborts.
 */
import { onPage } from '@/scripts/page';

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const LINE = 0.7; // the reading line, as a fraction of the small viewport's height
const SWEEP = 0.12; // how much further a word at the end of a line rises, in the same unit

onPage((signal) => {
  const block = document.querySelector<HTMLElement>('.b2 [data-b2]');
  if (!block) return;
  const probe = block.querySelector<HTMLElement>('.b2-probe')!;
  const words = [...block.querySelectorAll<HTMLElement>('.b2-w')].map((el) => ({ el, at: 0, on: false }));
  if (!words.length) return;

  let first = 0;
  let last = 0;

  // Where each word lights, in document scroll positions. Read every frame that runs (a few dozen words):
  // the block's place also moves with transforms (the intro brings it in from a little lower), which no
  // resize event reports, and reading before any write this frame costs no extra layout.
  function measure() {
    const y = scrollY;
    const svh = probe.offsetHeight || innerHeight;
    const box = block.getBoundingClientRect();
    const left = box.left + parseFloat(getComputedStyle(block).paddingLeft);
    const width = Math.max(1, box.right - parseFloat(getComputedStyle(block).paddingRight) - left);
    for (const w of words) {
      const r = w.el.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (r.left - left) / width));
      w.at = r.top + y + r.height / 2 + x * SWEEP * svh - LINE * svh;
    }
    first = Math.min(...words.map((w) => w.at));
    last = Math.max(...words.map((w) => w.at));
  }

  let queued = 0;
  function update() {
    queued = 0;
    if (reduce.matches) return;
    measure();
    const y = scrollY;
    // The page's own end, which moves with the iPhone's toolbar: the last word must be lit by then.
    const end = document.documentElement.scrollHeight - innerHeight - 2;
    const k = last > end && last > first ? Math.max(0, (end - first) / (last - first)) : 1;
    for (const w of words) {
      const on = y >= first + (w.at - first) * k;
      if (on !== w.on) { w.on = on; w.el.classList.toggle('on', on); }
    }
  }
  const queue = () => { if (!queued) queued = requestAnimationFrame(update); };

  function arm() {
    block!.classList.toggle('is-armed', !reduce.matches);
    for (const w of words) { w.on = false; w.el.classList.remove('on'); }
    queue();
  }

  // A reflow (the font arriving, anything above changing height) moves the words without a scroll.
  const resized = new ResizeObserver(queue);
  resized.observe(document.body);
  arm();
  update();
  addEventListener('scroll', queue, { passive: true, signal });
  addEventListener('resize', queue, { signal });
  reduce.addEventListener('change', arm, { signal });
  signal.addEventListener('abort', () => { cancelAnimationFrame(queued); resized.disconnect(); });
});
