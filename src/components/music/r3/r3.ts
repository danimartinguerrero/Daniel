/**
 * Music, direction 3: "Liner notes". The pile of spines follows the carousel. The record in the middle
 * is lit, and its spine is pulled out of the pile, each by as much as that record is in the middle:
 * as a hand turns the row the light travels down the pile and one spine slides home as the next comes
 * out, at the hand's pace (two spines are half lit mid-turn). It is written on the carousel's own
 * frames ("v4:turn"), so nothing here runs while the row is still, and it only touches transform and
 * opacity. Pressing a spine asks the carousel to bring its record to the middle.
 */
import { onPage } from '@/scripts/page';

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('[data-music-page].r3');
  if (!root) return;
  const spines = [...root.querySelectorAll<HTMLElement>('[data-r3-spine]')];
  const records = [...root.querySelectorAll<HTMLButtonElement>('[data-vinyl]')];
  const n = spines.length;
  if (!n) return;
  const lit = spines.map((s) => s.querySelector<HTMLElement>('[data-r3-lit]')!);
  const shadows = spines.map((s) => s.querySelector<HTMLElement>('[data-r3-shadow]')!);

  const around = (d: number) => d - n * Math.round(d / n);
  const smooth = (t: number) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
  const last = new Float32Array(n).fill(-1);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  root.addEventListener('v4:turn', (e) => {
    const { pos } = (e as CustomEvent<{ pos: number }>).detail;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(around(i - pos));
      const light = smooth(1 - d); // 1 in the middle, nothing a record away
      if (Math.abs(light - last[i]!) < 0.002) continue;
      last[i] = light;
      const s = spines[i]!;
      // The pull follows the light: out by the full amount at the centre, home a record away.
      // With reduced motion the light still crosses over, but the spine doesn't travel: it is out or in.
      const pull = reduce.matches ? (light >= 0.5 ? 1 : 0) : light;
      s.style.transform = pull > 0 ? `translate3d(calc(${(-pull).toFixed(3)} * var(--r3-pull)), 0, 0)` : 'none';
      s.style.zIndex = light > 0 ? '1' : '';
      lit[i]!.style.opacity = light.toFixed(3);
      shadows[i]!.style.opacity = light.toFixed(3);
    }
  }, { signal });

  root.addEventListener('v4:centre', (e) => {
    const { index } = (e as CustomEvent<{ index: number }>).detail;
    spines.forEach((s, i) => (i === index ? s.setAttribute('aria-current', 'true') : s.removeAttribute('aria-current')));
  }, { signal });

  root.addEventListener('click', (e) => {
    const go = (e.target as Element).closest<HTMLElement>('[data-r3-go]');
    if (!go) return;
    const record = records.find((b) => b.dataset.vinyl === go.dataset.r3Go);
    if (!record) return;
    // The carousel brings a record to the middle when it is focused from the keyboard, so the record
    // is focused as the keyboard would focus it. (Asking the browser to scroll it into view instead
    // leaves the carousel guessing which record was meant, and here, with part of the row under the
    // pile, it guessed wrong.)
    (record as HTMLElement & { focus(o?: { preventScroll?: boolean; focusVisible?: boolean }): void }).focus({ preventScroll: true, focusVisible: true });
    // A press with a finger or a mouse leaves focus on the spine, so no ring is drawn on the sleeve;
    // from the keyboard it stays on the record, ready to be opened with Enter.
    if (e.detail > 0) go.focus({ preventScroll: true });
    // On a phone the pile is under the carousel: bring the carousel up if it is out of sight.
    const row = root.querySelector<HTMLElement>('[data-v4-row]');
    const r = row?.getBoundingClientRect();
    if (row && r && Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) < r.height / 2) row.scrollIntoView({ block: 'nearest' });
  }, { signal });
});
