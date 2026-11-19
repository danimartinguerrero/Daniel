/** Behaviour of version b4. Everything starts inside onPage and stops when its signal aborts.
 *
 * Two things: the line keeps up with the carousel (the record in the middle of the records is the one
 * ringed on the line), and choosing a cover on the line takes the page back up to the records and turns
 * them to it. And once, as the line first comes into view, it draws itself from the oldest year to now
 * and each record arrives as the line reaches its year. */
import { onPage, arrived } from '@/scripts/page';

const reduce = matchMedia('(prefers-reduced-motion: reduce)');

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('.b4[data-music-page]');
  const chart = root?.querySelector<HTMLElement>('[data-b4]');
  const axis = chart?.querySelector<HTMLElement>('[data-b4-axis]');
  const row = root?.querySelector<HTMLElement>('[data-v4-row]');
  if (!root || !chart || !axis || !row) return;

  /* ---------------------------------------------------------------- the ring follows the carousel */
  const marks = (id: string) => chart.querySelectorAll<HTMLElement>(`[data-b4-rec="${CSS.escape(id)}"], [data-b4-mark="${CSS.escape(id)}"]`);
  let current = chart.querySelector<HTMLElement>('[data-b4-rec][data-current]')?.dataset.b4Rec ?? '';
  const mark = (id: string) => {
    if (id === current) return;
    if (current) marks(current).forEach((el) => el.removeAttribute('data-current'));
    marks(id).forEach((el) => el.setAttribute('data-current', ''));
    current = id;
  };
  root.addEventListener('v4:centre', (e) => {
    const id = (e as CustomEvent<{ id: string }>).detail?.id;
    if (id) mark(id);
  }, { signal });

  /* ---------------------------------------------------------------- choosing a cover on the line
     The page glides back up until the records sit in the middle of the screen, and the records turn
     to the one chosen while it does, so you arrive at it. The carousel turns to a record that is
     focused from the keyboard (listening-bar.ts tells by :focus-visible), and a script's focus counts
     as the keyboard's when nothing was focused by a pointer before it: so a press on a cover here
     never takes the focus, and the record is focused without scrolling. From the keyboard the focus
     stays on the record, so Tab carries on from there; after a click or a tap it is let go at once,
     before anything is drawn, so no focus ring shows. */
  chart.addEventListener('mousedown', (e) => {
    if ((e.target as Element).closest('[data-b4-pick]')) e.preventDefault();
  }, { signal });
  chart.addEventListener('click', (e) => {
    const pick = (e.target as Element).closest<HTMLButtonElement>('[data-b4-pick]');
    if (!pick) return;
    const id = pick.dataset.b4Pick!;
    const sleeve = row.querySelector<HTMLButtonElement>(`[data-vinyl="${CSS.escape(id)}"]`);
    if (!sleeve) return;

    const caption = root.querySelector<HTMLElement>('[data-v4-caption]');
    const top = row.getBoundingClientRect().top;
    const bottom = (caption ?? row).getBoundingClientRect().bottom;
    const y = Math.max(0, scrollY + (top + bottom) / 2 - innerHeight / 2);
    scrollTo({ top: y, behavior: reduce.matches ? 'instant' : 'smooth' });

    sleeve.focus({ preventScroll: true });
    if (e.detail !== 0) sleeve.blur();
    mark(id);
  }, { signal });

  /* ---------------------------------------------------------------- the line draws itself, once
     Only with motion allowed, and only once the script is here to undo it: the attribute that hides
     the parts is set by this script, so without it everything is simply there. */
  if (reduce.matches || !('IntersectionObserver' in window) || !matchMedia('(min-width: 64rem)').matches) return;
  void arrived().then(() => {
    if (signal.aborted) return;
    chart.setAttribute('data-armed', '');
    const io = new IntersectionObserver((entries) => {
      const en = entries[entries.length - 1]!;
      // Gone past it without it ever coming into view (a jump down the page): it is all there, no show.
      const passed = !en.isIntersecting && en.boundingClientRect.bottom < 0;
      if (!en.isIntersecting && !passed) return;
      io.disconnect();
      if (passed) chart.setAttribute('data-instant', '');
      chart.setAttribute('data-in', '');
    }, { rootMargin: '0px 0px -22% 0px' });
    io.observe(axis);
    signal.addEventListener('abort', () => io.disconnect());
  });
});
