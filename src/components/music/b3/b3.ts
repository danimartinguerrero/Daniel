/**
 * Behaviour of version b3, the back of a sleeve.
 *
 * The sleeve turns over once, the first time it comes into view: the page turning one of the records
 * above to show its back. It arrives already mostly turned and settles flat, hinged on its left edge;
 * on a phone, where the sleeve is one tall column, it only rises a little; with reduced motion it fades.
 * Nothing is hidden before this script decides to play it, so without the script, or if it fails, the
 * sleeve is simply there.
 *
 * Side A and the carousel stay in step: the row of the record in the middle is lit, and a row, pressed,
 * takes the visitor up to that record and turns the carousel to it. Everything starts inside onPage and
 * stops when its signal aborts.
 */
import { arrived, onPage } from '@/scripts/page';

const DRAWER = 'cubic-bezier(0.32, 0.72, 0, 1)';
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('.b3[data-music-page]');
  if (!root) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------------------------------------------------------------- the turn-over */

  const sleeve = root.querySelector<HTMLElement>('[data-b3-sleeve]');
  if (sleeve) {
    void arrived().then(() => {
      if (signal.aborted) return;
      // Only a sleeve that is still below the screen plays: one already in view (a reload part-way down,
      // a return to the page) stays where it is rather than vanish and come back.
      if (sleeve.getBoundingClientRect().top < innerHeight) return;
      sleeve.style.opacity = '0';
      const io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          io.disconnect();
          play(sleeve);
        },
        // About a third of the screen into view: the turn plays where the eye already is.
        { rootMargin: '0px 0px -33% 0px' },
      );
      io.observe(sleeve);
      signal.addEventListener('abort', () => io.disconnect(), { once: true });
    });
  }

  function play(el: HTMLElement) {
    const column = matchMedia('(max-width: 759px)').matches;
    let frames: Keyframe[];
    let options: KeyframeAnimationOptions;
    if (reduce.matches) {
      frames = [{ opacity: 0 }, { opacity: 1 }];
      options = { duration: 240, easing: 'ease' };
    } else if (column) {
      frames = [
        { opacity: 0, transform: 'translateY(1.5rem)' },
        { opacity: 1, transform: 'none' },
      ];
      options = { duration: 520, easing: EASE_OUT };
    } else {
      // Hinged on its left edge. The perspective is part of the transform rather than set on the
      // parent: Safari drew a parent's perspective flat here. The light comes up a little ahead of the
      // turn so the sleeve is never a dark slab swinging.
      frames = [
        { opacity: 0, transform: 'perspective(2600px) rotateY(-24deg)', offset: 0 },
        { opacity: 1, offset: 0.55 },
        { opacity: 1, transform: 'perspective(2600px) rotateY(0deg)', offset: 1 },
      ];
      options = { duration: 600, easing: DRAWER };
    }
    el.style.opacity = '';
    const anim = el.animate(frames, { ...options, fill: 'backwards' });
    // Once it has landed, nothing of the animation is left on the sleeve: it is a flat panel again.
    void anim.finished.then(() => anim.cancel(), () => {});
    signal.addEventListener('abort', () => anim.cancel(), { once: true });
  }

  /* ---------------------------------------------------------------- Side A and the carousel */

  const rows = [...root.querySelectorAll<HTMLButtonElement>('[data-b3-row]')];
  if (!rows.length) return;

  const mark = (id: string) => {
    for (const row of rows) {
      if (row.dataset.b3Row === id) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    }
  };

  root.addEventListener(
    'v4:centre',
    (e) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (id) mark(id);
    },
    { signal },
  );

  let trip = 0; // a newer press replaces a trip still on its way
  for (const row of rows) {
    row.addEventListener(
      'click',
      (e) => {
        // detail is 0 when the row is pressed from the keyboard.
        const pointer = (e as MouseEvent).detail !== 0;
        const id = row.dataset.b3Row;
        const record = id ? root.querySelector<HTMLElement>(`[data-vinyl="${CSS.escape(id)}"]`) : null;
        const track = root.querySelector<HTMLElement>('[data-v4-row]');
        if (!record || !track) return;
        const mine = ++trip;

        // The carousel turns to a record that gets keyboard focus. Where the browser can say so
        // (focusVisible), that is the way: on a wide screen every record is already in view, and a
        // scroll into view cannot tell the carousel which one was meant. A pressed row then takes its
        // focus back, so a finger or a mouse leaves no focus ring behind; a key press leaves focus on
        // the record, ready to open. Elsewhere (older Safari) bringing the record into view does it.
        const turn = () => {
          if (signal.aborted || mine !== trip) return;
          (record.focus as (o: object) => void)({ preventScroll: true, focusVisible: true });
          if (!record.matches(':focus-visible')) {
            record.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
          }
          if (pointer) row.focus({ preventScroll: true });
        };

        // First the page goes up until the records sit in the middle of the screen, then the carousel
        // turns, so the visitor sees it turn to the front of what they picked. One motion at a time.
        const box = track.getBoundingClientRect();
        const y = Math.max(0, Math.round(scrollY + box.top + box.height / 2 - innerHeight / 2));
        if (Math.abs(scrollY - y) < 2) return turn();
        if (reduce.matches) {
          scrollTo({ top: y, behavior: 'instant' });
          return turn();
        }
        let done = false;
        const arrive = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          removeEventListener('scrollend', arrive);
          turn();
        };
        // scrollend is missing in older Safari; the timer stands in for it.
        const timer = setTimeout(arrive, 1400);
        addEventListener('scrollend', arrive, { signal });
        scrollTo({ top: y, behavior: 'smooth' });
      },
      { signal },
    );
  }
});
