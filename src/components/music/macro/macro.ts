import { onPage } from '@/scripts/page';
import { FILL_HOLD, clearTextFill, measureFillLine, measureTextFill, paintTextFill, type LitLine } from '../v4/text-fill';
import type { Instrument, View } from './instrument';

/* Direction "Macro" (MacroStory.astro). Each chapter holds one screen while the page scrolls on, and
   that scroll is a camera's path along the instrument: it arrives at a part, drifts slowly while the
   sentence that goes with it fills with light (the site's one pace, text-fill.ts), then travels on to
   the next part without a cut. At the end it draws back and the whole instrument stands beside the
   last sentence, and then on its own.

   Apple, Designing Fluid Interfaces: the camera follows the scroll through a critically damped spring
   (no overshoot: nothing here was thrown), so a wheel's steps glide and a trackpad's flick carries on
   smoothly; a travel eases in and out (smootherstep) and a sentence leaves the way the camera goes and
   arrives from where it comes (hint in the direction of motion). Only WebGL, transform, opacity and a
   small blur change frame to frame. */

interface Shot { from: View; to: View } // where the camera arrives, and where it has drifted to as the sentence ends
type Shots = { wide: Shot[]; narrow: Shot[] };

// Model units: the instrument is 1 long, upright along +Y from -0.5 to 0.5, facing +Z.
const v = (eye: View['eye'], at: View['at'], fov: number, shift: View['shift'], roll = 0): View => ({ eye, at, fov, shift, roll });

// A shot: where the camera arrives, and as its sentence fills it drifts a little closer and turns a
// little further, so the picture is never quite still while it is read.
const shot = (view: View, closer = .07, turn = 2.5): Shot => ({
  from: view,
  to: {
    ...view,
    eye: view.eye.map((value, i) => value + (view.at[i]! - value) * closer) as View['eye'],
    roll: view.roll + turn,
  },
});

// Each path: the instrument's parts in the order the story reaches them, then the whole of it lying on
// a diagonal. Framed on a wide screen so the part fills the side away from that beat's words
// (MacroStory.astro's places), and on a phone so it fills the lower part of the screen.
const PATHS: Record<string, { turn: number; shots: Shots }> = {
  'pj-bass': {
    turn: 0,
    shots: {
      wide: [
        shot(v([-.1, .5, .3], [0, .42, 0], 24, [.3, -.12], 20)), // the headstock, at the right
        shot(v([.11, -.04, .09], [0, .2, .012], 38, [-.12, .12], -62)), // down the neck, from the body
        shot(v([-.08, .06, .07], [0, .25, .012], 40, [-.16, -.2], -125)), // along the frets to the headstock
        shot(v([0, -.5, .32], [0, -.26, 0], 32, [.36, .24], -90)), // the strings over the pickups
        shot(v([.25, .1, 1.55], [0, -.02, 0], 24, [.04, .03], -58), .03, 1.5), // all of it
      ],
      narrow: [
        shot(v([-.1, .5, .34], [0, .42, 0], 34, [.05, .22], 20)),
        shot(v([.11, -.04, .09], [0, .2, .012], 48, [0, .18], -30)),
        shot(v([-.08, .06, .07], [0, .25, .012], 50, [.14, .24], -150)),
        shot(v([0, -.5, .32], [0, -.26, 0], 44, [.12, .32], -90)),
        shot(v([.15, .1, 2.6], [0, -.02, 0], 26, [0, .08], -22), .03, 1.5),
      ],
    },
  },
  'les-paul': {
    turn: 0,
    shots: {
      wide: [
        shot(v([-.1, .5, .32], [0, .4, 0], 28, [.38, -.14], 20)), // the headstock, at the right
        shot(v([-.25, -.2, .42], [.02, -.27, 0], 30, [-.36, .04], 15)), // the body, at the left
        shot(v([0, -.52, .34], [0, -.25, 0], 34, [.24, .26], -90)), // the pickups and the bridge
        shot(v([-.08, .02, .08], [0, .22, .02], 40, [-.12, .16], -55)), // along the fretboard
        shot(v([.25, .1, 1.55], [0, -.02, 0], 24, [.04, .03], -58), .03, 1.5), // all of it
      ],
      narrow: [
        shot(v([-.1, .5, .36], [0, .4, 0], 36, [.06, .25], 10)),
        shot(v([-.25, -.2, .42], [.02, -.27, 0], 46, [.04, .42], 15)),
        shot(v([0, -.52, .34], [0, -.25, 0], 46, [.12, .32], -90)),
        shot(v([-.08, .02, .08], [0, .22, .02], 50, [.28, .3], -172)),
        shot(v([.15, .1, 2.6], [0, -.02, 0], 26, [0, .08], -22), .03, 1.5),
      ],
    },
  },
};

// The scroll, in lines' worth (--fill-line): how long the camera travels between parts, and how long
// the last picture, the whole instrument, is held.
const TRAVEL = 1.5;
const FIRST = .5; // the first sentence arrives as the screen is held
const PULL = 2; // drawing back to the whole instrument
const REST = 1.2;
const RESPONSE = .32; // s, the camera's spring (damping 1)

const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const clamp = (t: number) => Math.min(1, Math.max(0, t));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixView = (a: View, b: View, t: number): View => ({
  eye: [mix(a.eye[0], b.eye[0], t), mix(a.eye[1], b.eye[1], t), mix(a.eye[2], b.eye[2], t)],
  at: [mix(a.at[0], b.at[0], t), mix(a.at[1], b.at[1], t), mix(a.at[2], b.at[2], t)],
  fov: mix(a.fov, b.fov, t),
  shift: [mix(a.shift[0], b.shift[0], t), mix(a.shift[1], b.shift[1], t)],
  roll: mix(a.roll, b.roll, t),
});

// Between two parts the camera draws back a little and comes in again, as a hand moving a camera
// would, so it never passes through the instrument on its way.
function travel(a: View, b: View, t: number): View {
  const view = mixView(a, b, smoother(t));
  const lift = 1 + .6 * Math.sin(Math.PI * t);
  view.eye = view.eye.map((value, i) => view.at[i]! + (value - view.at[i]!) * lift) as View['eye'];
  return view;
}

onPage(signal => {
  const root = document.querySelector<HTMLElement>('[data-mc]');
  if (!root) return;
  const allowed = matchMedia('(prefers-reduced-motion: no-preference) and (min-height: 500px) and (min-width: 320px) and (forced-colors: none)');
  const narrow = matchMedia('(max-width: 760px)');
  const webgl = (() => {
    try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
  })();

  const intro = root.querySelector<HTMLElement>('[data-mc-intro]')!;
  const introStage = intro.querySelector<HTMLElement>('[data-mc-stage]')!;
  const introText = intro.querySelector<HTMLElement>('[data-fill-text]')!;
  let introLines: LitLine[] = [];

  const chapters = [...root.querySelectorAll<HTMLElement>('[data-mc-chapter]')].map(element => ({
    element,
    stage: element.querySelector<HTMLElement>('[data-mc-stage]')!,
    canvas: element.querySelector('canvas')!,
    beats: [...element.querySelectorAll<HTMLElement>('[data-mc-beat]')].map(text => ({
      text, lines: [] as LitLine[], start: 0, read: 0, shown: -1,
    })),
    path: PATHS[element.dataset.mcChapter!]!,
    model: element.dataset.model!,
    paint: element.dataset.paint ?? '',
    instrument: null as Instrument | null,
    loading: false,
    failed: false,
    near: false,
    total: 0, // lines' worth of scroll the chapter is held for
    pull: 0, // where the drawing back starts, in lines
    position: -1, // where the camera is on its path, in lines, following the scroll
    velocity: 0,
  }));
  type Chapter = typeof chapters[number];

  let line = 1;
  let stopped = false;
  let flying = false;

  async function load(chapter: Chapter) {
    if (chapter.loading) return;
    chapter.loading = true;
    try {
      const { createInstrument } = await import('./instrument');
      const instrument = await createInstrument(chapter.canvas, chapter.model, chapter.paint, chapter.path.turn);
      if (stopped) return instrument.dispose();
      chapter.instrument = instrument;
      size(chapter);
      chapter.position = -1;
      request();
    } catch {
      // No WebGL after all: this chapter goes back to its still and its sentences.
      chapter.failed = true;
      hold(chapter, false);
    }
  }

  function size(chapter: Chapter) {
    const width = chapter.stage.clientWidth, height = chapter.stage.clientHeight;
    // Sharp at the screen's density, up to about five million pixels a frame.
    const ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(5.2e6 / Math.max(1, width * height)));
    chapter.instrument?.resize(width, height, ratio);
  }

  function hold(chapter: Chapter, enabled: boolean) {
    chapter.element.classList.toggle('statement', enabled);
    chapter.element.classList.toggle('is-flying', enabled);
    if (!enabled) {
      for (const beat of chapter.beats) {
        clearTextFill(beat.text);
        beat.text.style.removeProperty('opacity');
        beat.text.style.removeProperty('transform');
        beat.text.style.removeProperty('filter');
      }
      chapter.element.style.removeProperty('height');
    }
  }

  // The chapter's stretch of scroll, in lines: for each sentence a travel to its part (shorter for the
  // first), the lines it fills, and a held moment; then drawing back, and the whole instrument held.
  function measure() {
    line = measureFillLine(root!);
    flying = allowed.matches;
    intro.classList.toggle('statement', flying);
    intro.classList.toggle('is-flying', flying);
    if (flying) {
      introLines = measureTextFill(introText);
      intro.style.height = `${(introStage.offsetHeight + (introLines.length + FILL_HOLD) * line).toFixed(1)}px`;
    } else {
      clearTextFill(introText);
      introLines = [];
      intro.style.removeProperty('height');
    }
    for (const chapter of chapters) {
      const enabled = flying && webgl && !chapter.failed;
      hold(chapter, enabled);
      if (!enabled) continue;
      let at = 0;
      chapter.beats.forEach((beat, index) => {
        beat.lines = measureTextFill(beat.text);
        at += index === 0 ? FIRST : TRAVEL;
        beat.start = at;
        beat.read = beat.lines.length + FILL_HOLD + .4;
        beat.shown = -1;
        at += beat.read;
      });
      chapter.pull = at;
      chapter.total = at + PULL + REST;
      chapter.element.style.height = `${(chapter.stage.offsetHeight + chapter.total * line).toFixed(1)}px`;
      chapter.position = -1;
      size(chapter);
    }
    request();
  }

  // Where the camera is at `position` (lines): arriving at a part, drifting while its sentence fills,
  // travelling on, and at the end drawing back.
  function viewAt(chapter: Chapter, position: number): View {
    const shots = chapter.path.shots[narrow.matches ? 'narrow' : 'wide'];
    const beats = chapter.beats;
    for (let i = beats.length - 1; i >= 0; i--) {
      const beat = beats[i]!;
      const arrive = beat.start - (i === 0 ? FIRST : TRAVEL);
      if (position < arrive && i > 0) continue;
      if (i === beats.length - 1 && position >= chapter.pull) {
        return mixView(shots[i]!.to, shots[i + 1]!.from, smoother(clamp((position - chapter.pull) / PULL)));
      }
      if (position < beat.start && i > 0) {
        return travel(shots[i - 1]!.to, shots[i]!.from, clamp((position - arrive) / TRAVEL));
      }
      const drift = clamp((position - beat.start) / beat.read);
      return mixView(shots[i]!.from, shots[i]!.to, drift * (2 - drift));
    }
    return shots[0]!.from;
  }

  // The sentences: each arrives over the last part of the travel to its part, rising into place, and
  // leaves over the first part of the next travel, upwards, as the camera moves on; meanwhile it fills.
  function words(chapter: Chapter, position: number) {
    const beats = chapter.beats;
    beats.forEach((beat, i) => {
      const travel = i === 0 ? FIRST : TRAVEL;
      const arriving = i === 0 ? 1 : clamp((position - (beat.start - travel * .55)) / (travel * .55));
      const next = beats[i + 1];
      // The last one leaves as the camera draws back: the whole instrument is the picture to end on.
      const leaving = next ? clamp((position - (next.start - TRAVEL)) / (TRAVEL * .4)) : clamp((position - chapter.pull) / (PULL * .35));
      const shown = Math.min(arriving, 1 - leaving);
      const key = `${arriving.toFixed(4)}:${leaving.toFixed(4)}`;
      if (key !== String(beat.shown)) {
        beat.shown = key as unknown as number;
        const enter = 1 - smoother(arriving), exit = smoother(leaving);
        const y = enter * 28 - exit * 22;
        beat.text.style.opacity = smoother(clamp(shown)).toFixed(3);
        beat.text.style.transform = y ? `translate3d(0,${y.toFixed(2)}px,0)` : '';
        const blur = enter * 6 + exit * 5;
        beat.text.style.filter = blur > .05 ? `blur(${blur.toFixed(2)}px)` : '';
      }
      paintTextFill(beat.lines, (position - beat.start) / 1);
    });
  }

  let queued = 0;
  let last = 0;
  function tick(now: number) {
    queued = 0;
    const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let moving = false;
    if (flying) {
      const scrolled = Math.max(0, introStage.getBoundingClientRect().top - intro.getBoundingClientRect().top);
      paintTextFill(introLines, scrolled / line);
    }
    for (const chapter of chapters) {
      if (!chapter.element.classList.contains('is-flying') || !chapter.near) continue;
      load(chapter);
      const scrolled = Math.max(0, chapter.stage.getBoundingClientRect().top - chapter.element.getBoundingClientRect().top);
      const target = Math.min(chapter.total, scrolled / line);
      // The words keep the site's pace exactly: they follow the scroll itself.
      words(chapter, target);
      // The camera follows it through a critically damped spring.
      if (chapter.position < 0) {
        chapter.position = target;
        chapter.velocity = 0;
      } else {
        const stiffness = (2 * Math.PI / RESPONSE) ** 2, friction = 4 * Math.PI / RESPONSE;
        for (let left = dt; left > 0; left -= 1 / 240) {
          const h = Math.min(left, 1 / 240);
          chapter.velocity += (-stiffness * (chapter.position - target) - friction * chapter.velocity) * h;
          chapter.position += chapter.velocity * h;
        }
        if (Math.abs(chapter.position - target) < .0005 && Math.abs(chapter.velocity) < .002) {
          chapter.position = target;
          chapter.velocity = 0;
        } else moving = true;
      }
      chapter.instrument?.view(viewAt(chapter, chapter.position));
    }
    if (moving) queued = requestAnimationFrame(tick);
    else last = 0;
  }
  function request() { if (!queued) queued = requestAnimationFrame(tick); }

  const near = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const chapter = chapters.find(item => item.element === entry.target);
      if (!chapter) continue;
      chapter.near = entry.isIntersecting;
      if (!chapter.near) chapter.position = -1;
    }
    request();
  }, { rootMargin: '150% 0px' });
  for (const chapter of chapters) near.observe(chapter.element);

  // A phone's toolbar coming and going resizes the window but not the held screen (svh): measured again
  // only for a window that really changed, so nothing is rebuilt mid-scroll.
  let current = '';
  function resized() {
    const now = `${innerWidth}x${introStage.offsetHeight}`;
    if (now === current) return request();
    current = now;
    measure();
  }
  resized();
  document.fonts.ready.then(() => { if (!signal.aborted) measure(); });
  window.addEventListener('scroll', request, { passive: true, signal });
  window.addEventListener('resize', resized, { passive: true, signal });
  allowed.addEventListener('change', measure, { signal });
  signal.addEventListener('abort', () => {
    stopped = true;
    cancelAnimationFrame(queued);
    near.disconnect();
    for (const chapter of chapters) chapter.instrument?.dispose();
  });

  if (import.meta.env.DEV) {
    // For tuning the shots from a browser console or a test: draw any view in a chapter.
    (window as unknown as { __macro: unknown }).__macro = {
      view: (index: number, view: View) => chapters[index]?.instrument?.view(view),
      chapters,
    };
  }
});
