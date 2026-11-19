import { onPage } from '@/scripts/page';
import { FILL_HOLD, clearTextFill, measureFillLine, measureTextFill, paintTextFill, type LitLine } from '../v4/text-fill';
import type { Instrument, SurroundPose } from './instrument';
import { createTurntable } from './turntable';
import { createCopyLayer, type FlatCopy } from './copy-layer';
import { Spring } from '../v4/physics';

/* The instruments on the music page (LineupStory.astro). The heading and both instruments share a
   pinned stage. The timeline is measured in the scroll a line takes to fill (text-fill.ts):

     title fills ─ title parts ─ bass rises ─ bass fans out ─ hold ─ the slide from the bass to the guitar ─ guitar turns ─ hold

   Every frame is a function of where the scroll is (smoothed, so a wheel's steps glide), so scrolling back
   plays it all backwards exactly. Motion, by Emil Kowalski's rules:

   - The bass arrives as a hand of cards fanned out: its copies come out one at a time, nearest first,
     each from behind the one before it and carried out by it, on a strong ease-out, the next starting
     while the last is still moving (a stagger). A card that starts hidden behind its neighbour needs no
     fade, so the colours are never seen half transparent; only the first, out from behind the turned
     instrument, fades up, quickly. The bass starts face-on and turns as its copies fan out.
   - The slide: the guitar's line-up waits to the right of the bass's, and between the blue bass and the
     green guitar stand STEPS more copies, each a step further from the bass and nearer the guitar, in
     outline and in colour: a flip book laid out along the row. The screen travels the row, eased in and
     out (smoothstep, the page's curve for scrubbed motion). Each text stays above its own instrument
     as the row passes the edges of the stage. The in-between copies fan out behind the blue bass in order.
   - The instruments have weight. Whatever moves them across the screen (a card slid out in the deal, the
     row sliding along), they lean back against the motion, the more the faster it goes, and when it slows
     they swing past upright, rock and settle, each at its own pace (a spring each, Apple's damping ratio
     and response, a little different from one to the next). The real ones turn on their axis with it.
     It is driven by how things actually move, not by where the scroll is, so it is never quite the same
     twice; scrolling back sways them the other way.

   The in-between outlines: both outlines sampled into the same number of points, matched part to part
   (body, waist, neck, head), and moved between; the colours through OKLab, so blue reaches green through
   clean teal, never grey.

   Once a scene's instrument has settled, its instrument is the hand's (Apple, Designing
   Fluid Interfaces): a sideways drag turns it 1:1, even mid-spin; on release the velocity goes to a
   spring that rests where the velocity projects it, a whole number of turns from its pose. */

const FOLLOW = 0.07; // s: the screen follows the scroll this closely
const DECELERATION = 0.998; // Apple's normal scroll deceleration, for projecting a flick
const THREE_QUARTER_YAW = -50; // degrees from face-on
const FRAME_WIDTH = 1.1; // matches instrument.ts: the frame's width in instrument lengths
const BODY = .27; // a body's width, in frame widths (the outlines in silhouettes.ts)
const BASS_ENTRANCE = 2.4; // lines of scroll for the title to part and the bass to rise
const HOLD = .8; // lines of scroll the lit bass waits before the move
const MOVE = 4.2; // lines of scroll the slide takes
const STEPS = 5; // copies between the blue bass and the green guitar
const VIEW = 1600; // the outlines' frame, silhouettes.ts
// The outlines as the instrument turns (scripts/instrument-outlines.mjs): every TURN_STEP degrees about its
// long axis, POINTS points each, matched part to part, Uint16 coordinates times 16.
const TURN_STEP = 10, POINTS = 720, UNITS = 16;
const FOLLOW_TURN = [.14, .22, .3]; // s: how closely the copies follow the real one's turn, nearest first

const clamp = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - (1 - t) ** 4; // close to the site's --ease-out, cubic-bezier(.23, 1, .32, 1)
const project = (velocity: number) => (velocity / 1000) * DECELERATION / (1 - DECELERATION);
const wrap = (angle: number) => ((angle % 360) + 360) % 360;

// ── Colour, through OKLab ────────────────────────────────────────────────────────────────────────────
type Lab = [number, number, number];
function toLab(hex: string): Lab {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s];
}
function fromLab([L, A, B]: Lab) {
  const l = (L + .3963377774 * A + .2158037573 * B) ** 3;
  const m = (L - .1055613458 * A - .0638541728 * B) ** 3;
  const s = (L - .0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.707614701 * s];
  return `rgb(${rgb.map(c => Math.round(255 * Math.min(1, Math.max(0, c <= .0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - .055)))).join(',')})`;
}

// ── Outlines as the instrument turns ─────────────────────────────────────────────────────────────────
// The outline at `yaw` degrees, between the two nearest that were drawn, into `out`.
function shapeAt(data: Uint16Array, yaw: number, out: Float32Array, stride: number) {
  const at = wrap(yaw) / TURN_STEP;
  const count = data.length / (POINTS * 2);
  const a = Math.floor(at) % count, b = (a + 1) % count, t = at - Math.floor(at);
  const start = a * POINTS * 2, end = b * POINTS * 2;
  let written = 0;
  for (let i = 0; i < POINTS * 2; i += stride * 2) {
    out[written++] = (data[start + i]! * (1 - t) + data[end + i]! * t) / UNITS;
    out[written++] = (data[start + i + 1]! * (1 - t) + data[end + i + 1]! * t) / UNITS;
  }
  return out.subarray(0, written);
}
function pathOf(points: Float32Array) {
  let d = '';
  for (let i = 0; i < points.length; i += 2) d += `${i ? 'L' : 'M'}${points[i]!.toFixed(1)} ${points[i + 1]!.toFixed(1)}`;
  return `${d}Z`;
}

function lineCount(text: Element) {
  const range = document.createRange();
  range.selectNodeContents(text);
  return Math.max(1, range.getClientRects().length);
}

interface Slot { x: number; y: number; size: number }

onPage(signal => {
  const root = document.querySelector<HTMLElement>('[data-lu]');
  if (!root) return;
  const allowed = matchMedia('(prefers-reduced-motion: no-preference) and (min-height: 500px) and (min-width: 320px) and (forced-colors: none)');
  const narrow = matchMedia('(max-width: 760px)');

  const show = root.querySelector<HTMLElement>('[data-lu-show]')!;
  const stage = show.querySelector<HTMLElement>('[data-lu-stage]')!;

  const heading = stage.querySelector<HTMLElement>('.lu__heading')!;
  const headingRows = [...heading.querySelectorAll<HTMLElement>('.lu__heading-line')];
  const [upper, lower] = headingRows as [HTMLElement, HTMLElement];
  let headingFill: LitLine[] = [];
  let introEnd = BASS_ENTRANCE;

  const scenes = [...show.querySelectorAll<HTMLElement>('[data-lu-scene]')].map(element => ({
    element,
    cam: element.querySelector<HTMLElement>('[data-lu-cam]')!,
    words: element.querySelector<HTMLElement>('[data-lu-words]')!,
    canvas: element.querySelector('canvas')!,
    grab: element.querySelector<HTMLElement>('[data-lu-grab]')!,
    model: element.dataset.model!,
    paint: element.dataset.paint ?? '',
    copies: [...element.querySelectorAll<SVGSVGElement>('[data-lu-copy]')].map(svg => ({
      svg,
      colour: svg.style.getPropertyValue('--c').trim(),
      side: Number(svg.dataset.side),
      rank: Number(svg.dataset.rank),
      slot: { x: 0, y: 0, size: 1 } as Slot,
    })),
    lights: [...element.querySelectorAll<SVGSVGElement>('[data-lu-copy]')].map((): SurroundPose => ({ x: 0, exposure: 0, lean: 0, yaw: 0 })),
    instrument: null as Instrument | null,
    loading: false,
    centre: { x: 0, y: 0, size: 1 } as Slot,
    standing: false,
    // The turn by hand, in degrees on top of the scroll's: where it is, how fast, where it's going.
    angle: 0, velocity: 0, rest: 0,
    yaw: 0, // degrees: where the real one is turned, all told
    spring: null as null | { damping: number; response: number },
    drag: null as null | { id: number; x: number; y: number; from: number; decided: boolean; history: { t: number; x: number }[] },
    perPixel: .5,
  }));
  type Scene = typeof scenes[number];
  const [bass, guitar] = scenes as [Scene, Scene];
  // The in-between copies, blue bass to green guitar, made once: outline and colour a step further each.
  const blue = bass.copies.find(copy => copy.side === 1 && copy.rank === 3)!;
  const green = guitar.copies.find(copy => copy.side === -1 && copy.rank === 3)!;
  for (const scene of scenes) {
    const front = scene.element.dataset.outline!;
    for (const copy of scene.copies) copy.svg.querySelector('path')!.setAttribute('d', front);
  }
  const steps = (() => {
    const blueLab = toLab(blue.svg.style.getPropertyValue('--c').trim());
    const greenLab = toLab(green.svg.style.getPropertyValue('--c').trim());
    return Array.from({ length: STEPS }, (_, index) => {
      const t = (index + 1) / (STEPS + 1);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', `0 0 ${VIEW} ${VIEW}`);
      svg.setAttribute('class', 'lu__copy lu__step');
      const source = t < .5 ? blue : green;
      const path = source.svg.querySelector('path')!.cloneNode(false) as SVGPathElement;
      path.setAttribute('fill', fromLab(blueLab.map((value, i) => value + (greenLab[i]! - value) * t) as Lab));
      svg.append(path);
      bass.cam.append(svg);
      return { svg, path, t, side: 1, rank: blue.rank + index + 1, turn: { yaw: NaN, speed: 0, response: .3 + .03 * index, drawn: NaN } };
    });
  })();
  // Every copy follows its instrument's turn: a critically damped spring each (Apple's default when nothing
  // was thrown), the nearest the closest behind, so a turn spreads outward from the real one.
  type Follower = { yaw: number; speed: number; response: number; drawn: number };
  const following = new Map<SVGSVGElement, Follower & { path: SVGPathElement }>();
  for (const scene of scenes) for (const copy of scene.copies) {
    following.set(copy.svg, { yaw: NaN, speed: 0, response: FOLLOW_TURN[copy.rank - 1]!, drawn: NaN, path: copy.svg.querySelector('path')! });
  }
  const outlines = new Map<Scene, Uint16Array>();
  const scratch = [new Float32Array(POINTS * 2), new Float32Array(POINTS * 2)] as const;
  async function loadOutlines(scene: Scene) {
    if (outlines.has(scene)) return;
    outlines.set(scene, new Uint16Array(0));
    try {
      const response = await fetch(scene.model.replace(/\.glb$/, '.outlines.bin'), { signal });
      if (!response.ok) return;
      const data = await response.arrayBuffer();
      if (stopped || data.byteLength !== (360 / TURN_STEP) * POINTS * 2 * Uint16Array.BYTES_PER_ELEMENT) return;
      outlines.set(scene, new Uint16Array(data));
      for (const follower of following.values()) follower.drawn = NaN;
      for (const item of steps) item.turn.drawn = NaN;
      request();
    } catch {
      outlines.delete(scene);
    }
  }
  const ready = (scene: Scene) => (outlines.get(scene)?.length ?? 0) > 0;
  // A follower one frame on, towards `target`; true while it still moves.
  function follow(follower: Follower, target: number, dt: number, snap: boolean) {
    if (snap || Number.isNaN(follower.yaw)) { follower.yaw = target; follower.speed = 0; return false; }
    const stiffness = (2 * Math.PI / follower.response) ** 2;
    const friction = 4 * Math.PI / follower.response; // damping ratio 1
    for (let left = dt; left > 0; left -= 1 / 240) {
      const h = Math.min(left, 1 / 240);
      follower.speed += (-stiffness * (follower.yaw - target) - friction * follower.speed) * h;
      follower.yaw += follower.speed * h;
    }
    if (Math.abs(follower.yaw - target) < .02 && Math.abs(follower.speed) < .5) { follower.yaw = target; follower.speed = 0; return false; }
    return true;
  }
  // How far the guitar's line-up waits to the right: its green copy STEPS + 1 steps after the blue bass.
  let reach = 0;
  let spacing = 0;
  let bridgeSpacing = 0;

  let line = 1;
  let enabled = false;
  let near = false;
  let stopped = false;
  // The timeline, in lines of scroll from where the screen is first held.
  const span = { bass: 1, guitar: 1, moveAt: 1, guitarAt: 1, end: 1 };
  let shown = -1; // where the screen is on the timeline, following the scroll
  const touchScroll = new Spring(0, { response: .21, damping: 1 }, .0002);

  async function liveInstrument(scene: Scene) {
    const { createInstrument } = await import('./instrument');
    return createInstrument(
      scene.canvas,
      (narrow.matches && scene.element.dataset.mobileModel) || scene.model,
      scene.paint,
      scene.copies.map(({ colour, side, rank }) => ({ colour, side, rank })),
      narrow.matches,
    );
  }

  async function load(scene: Scene) {
    if (scene.loading) return;
    scene.loading = true;
    try {
      const instrument = narrow.matches
        ? await createTurntable(scene.canvas, scene.model.replace(/\.glb$/, '/turntable.webp')).catch(() => liveInstrument(scene))
        : await liveInstrument(scene);
      if (stopped) return instrument.dispose();
      scene.instrument = instrument;
      instrument.resize(scene.centre.size, narrow.matches);
      request();
    } catch {
      // Keep the still if both renderers fail. Retrying on each scroll frame stalls the entrance.
    }
  }

  // Keep the composited SVG layers close to the artwork as the mobile lineup grows.
  function placeCopy(svg: SVGSVGElement, { x, y, size }: Slot) {
    const fraction = narrow.matches ? .4 : 1;
    const width = size * fraction;
    svg.setAttribute('viewBox', `${VIEW * (1 - fraction) / 2} 0 ${VIEW * fraction} ${VIEW}`);
    svg.style.width = `${width.toFixed(1)}px`;
    svg.style.height = `${size.toFixed(1)}px`;
    svg.style.left = `${(x - width / 2).toFixed(1)}px`;
    svg.style.top = `${(y - size / 2).toFixed(1)}px`;
  }

  // A scene's line-up on this screen: the instrument in the middle of the space under the words, all seven
  // the same height, a body's width and a little air apart (overlapping on a phone), as large as the space
  // and the screen's width allow. Both scenes are one row (the slide runs along it), so both take the
  // space under the taller of the two blocks of words: same size, same level.
  function place(scene: Scene, wordsBottom: number) {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const top = wordsBottom + (narrow.matches ? 12 : 22);
    const bottom = height - (narrow.matches ? 76 : 84); // clear of the dock
    const band = Math.max(80, bottom - top);
    const air = narrow.matches ? .8 : 1.14;
    // Fit the fan to the width independently of instrument height on narrow screens.
    const halfRow = BODY * (air * (blue.rank + 1) + .5);
    const widthLimit = narrow.matches ? width * 1.65 : (width / 2 - 8) / halfRow;
    const frame = Math.min(band * FRAME_WIDTH, widthLimit);
    const naturalSpacing = BODY * frame * air;
    // At any yaw the widest outline extends at most .151 frame widths from the centre.
    const fanSpacing = narrow.matches
      ? Math.min(naturalSpacing, (width / 2 - 8 - frame * .155) / blue.rank)
      : naturalSpacing;
    const length = frame / FRAME_WIDTH;
    const y = top + band / 2;
    scene.centre = { x: width / 2, y, size: frame };
    for (const copy of scene.copies) {
      copy.slot = { x: width / 2 + copy.side * fanSpacing * copy.rank, y, size: frame };
      placeCopy(copy.svg, copy.slot);
    }
    scene.cam.style.setProperty('--frame-size', `${frame}px`);
    scene.cam.style.setProperty('--frame-top', `${(y - frame / 2).toFixed(1)}px`);
    const grab = scene.grab.style;
    const gw = frame * .42, gh = length * 1.02;
    grab.width = `${gw.toFixed(1)}px`; grab.height = `${gh.toFixed(1)}px`;
    grab.left = `${(width / 2 - gw / 2).toFixed(1)}px`; grab.top = `${(y - gh / 2).toFixed(1)}px`;
    scene.perPixel = 360 / Math.max(420, frame * .8);
    scene.instrument?.resize(frame, narrow.matches);
  }

  function measure() {
    // The outline sampling density can change when crossing the mobile breakpoint.
    for (const follower of following.values()) follower.drawn = NaN;
    for (const item of steps) item.turn.drawn = NaN;
    line = measureFillLine(root!);
    enabled = allowed.matches;
    if (enabled && narrow.matches) {
      copyLayer ??= createCopyLayer(stage, flatCopies, VIEW);
    } else {
      copyLayer?.dispose();
      copyLayer = null;
    }
    show.classList.toggle('has-copy-layer', !!copyLayer);
    show.classList.toggle('statement', enabled);
    show.classList.toggle('is-scrubbed', enabled);
    copyLayer?.resize(stage.clientWidth, stage.clientHeight);
    if (!enabled) {
      headingRows.forEach(clearTextFill);
      show.style.removeProperty('height');
      upper.style.transform = lower.style.transform = heading.style.opacity = '';
      bass.words.style.opacity = bass.words.style.transform = '';
      for (const scene of scenes) { stand(scene, false); reset(scene); }
      return;
    }
    headingFill = headingRows.flatMap(measureTextFill);
    introEnd = headingFill.length + BASS_ENTRANCE;
    // Keep the reading time responsive to wrapping without changing the text during scroll.
    const wordsBottom = Math.max(...scenes.map(({ words }) => words.offsetTop + words.offsetHeight));
    for (const scene of scenes) place(scene, wordsBottom);
    bass.cam.style.transformOrigin = `${bass.centre.x}px ${bass.centre.y}px`;
    const chapterLines = (scene: Scene) => Array.from(scene.words.children).reduce((sum, el) => sum + lineCount(el), 0);
    span.bass = chapterLines(bass);
    span.guitar = chapterLines(guitar);
    span.moveAt = introEnd + span.bass + HOLD;
    span.guitarAt = span.moveAt + MOVE;
    span.end = span.guitarAt + span.guitar + FILL_HOLD;
    show.style.height = `${(stage.offsetHeight + span.end * line).toFixed(1)}px`;
    // Every piece of the row leans on its foot.
    for (const element of pieces) element.style.transformOrigin = `50% ${(50 + 50 / 1.1).toFixed(2)}%`;
    still();
    spacing = (blue.slot.x - bass.centre.x) / blue.rank;
    // The two captions still need a viewport between them when the fans overlap tightly.
    const fanWidth = blue.slot.x - green.slot.x;
    bridgeSpacing = narrow.matches ? Math.max(spacing, (stage.clientWidth - fanWidth) / (STEPS + 1)) : spacing;
    reach = fanWidth + (STEPS + 1) * bridgeSpacing;
    steps.forEach(({ svg }, index) => {
      placeCopy(svg, { ...blue.slot, x: blue.slot.x + (index + 1) * bridgeSpacing });
      svg.style.zIndex = String(-2 - index); // further right, further under, as the copies at the right are
    });
    shown = -1;
    if (!near) {
      paintIntro(0);
      guitar.element.style.visibility = 'hidden';
    }
    request();
  }
  function reset(scene: Scene) {
    scene.cam.style.transform = scene.cam.style.opacity = '';
    scene.element.style.visibility = scene.element.style.clipPath = scene.element.style.transform = '';
    for (const copy of scene.copies) { copy.svg.style.transform = copy.svg.style.opacity = ''; copy.svg.style.visibility = ''; }
    scene.canvas.style.transform = scene.canvas.style.opacity = scene.canvas.style.visibility = '';
  }

  // The hand of cards: on each side, copy by copy from the nearest, each slides one step out from behind
  // the one before it, which carries it along: a copy's place is the sum of its own step and those of the
  // copies nearer the middle. Each starts while the one before is still moving.
  function stepOut(progress: number, rank: number) {
    const start = .02 + (rank - 1) * .1;
    const t = clamp((progress - start) / Math.min(.3, 1 - start));
    // A bridge copy already moves with its neighbour. Ease their separation in from zero velocity.
    return rank > blue.rank ? smooth(t) : easeOut(t);
  }
  // Each card carries its neighbours. Compute the stagger once per frame for the SVGs, springs and lights.
  const reveals = new Float64Array(blue.rank + STEPS + 1);
  const offsets = new Float64Array(reveals.length);
  function updateDeal(progress: number) {
    for (let rank = 1; rank < reveals.length; rank++) {
      const reveal = stepOut(progress, rank);
      reveals[rank] = reveal;
      offsets[rank] = offsets[rank - 1]! + (reveal - 1) * (rank <= blue.rank ? spacing : bridgeSpacing);
    }
  }
  function dealt(copy: { rank: number; side: number }) {
    return copy.side * offsets[copy.rank]!;
  }
  function deal(scene: Scene) {
    const first = reveals[1]!;
    const opacity = clamp(first * 4).toFixed(3);
    for (const copy of scene.copies) {
      copy.svg.style.transform = `translate3d(${dealt(copy).toFixed(2)}px,0,0)${leaning(copy.svg)}`;
      // Only the first card, out from behind the turned instrument, fades up; the others are switched on
      // once it is opaque, while still exactly behind it.
      copy.svg.style.opacity = copy.rank === 1 ? opacity : (first >= .25 ? '1' : '0');
    }
  }

  function stand(scene: Scene, standing: boolean) {
    if (standing === scene.standing) return;
    scene.standing = standing;
    scene.element.classList.toggle('is-standing', standing);
    scene.grab.tabIndex = standing ? 0 : -1;
    if (!standing) {
      scene.drag = null;
      scene.element.classList.remove('is-turning');
      if (scene.angle !== 0) aim(scene, Math.round(scene.angle / 360) * 360, 1, .35);
    }
  }
  function aim(scene: Scene, rest: number, damping: number, response: number) {
    scene.rest = rest;
    scene.spring = { damping, response };
    request();
  }
  function stepSpring(scene: Scene, dt: number) {
    const spring = scene.spring;
    if (!spring) return false;
    const stiffness = (2 * Math.PI / spring.response) ** 2;
    const friction = 4 * Math.PI * spring.damping / spring.response;
    for (let left = dt; left > 0; left -= 1 / 240) {
      const h = Math.min(left, 1 / 240);
      scene.velocity += (-stiffness * (scene.angle - scene.rest) - friction * scene.velocity) * h;
      scene.angle += scene.velocity * h;
    }
    if (Math.abs(scene.angle - scene.rest) < .05 && Math.abs(scene.velocity) < 2) {
      scene.spring = null;
      scene.velocity = 0;
      const before = scene.angle;
      scene.angle = wrap(scene.rest) < .001 || wrap(scene.rest) > 359.999 ? 0 : scene.rest;
      scene.rest = scene.angle;
      // A whole turn dropped: the copies following it drop the same, so none unwinds.
      const dropped = scene.angle - before;
      if (dropped) for (const copy of scene.copies) following.get(copy.svg)!.yaw += dropped;
    }
    return true;
  }
  function turn(scene: Scene, threeQuarterShare: number, swayShare = 1) {
    const swayYaw = (lean.get(scene.canvas) ?? 0) * RACK.yaw * swayShare;
    const yaw = (THREE_QUARTER_YAW + swayYaw) * threeQuarterShare + scene.angle;
    scene.yaw = yaw;
    const angle = Math.round(wrap(yaw)) % 360;
    scene.grab.setAttribute('aria-valuenow', String(angle));
    const side = angle === 0 ? 'Facing forward' : `${angle} degrees`;
    if (scene.grab.getAttribute('aria-valuetext') !== side) scene.grab.setAttribute('aria-valuetext', side);
  }
  // Drive each instrument's coloured surround lights from the live position, reveal, sway and turn of its copies.
  function renderInstrument(scene: Scene, pixelRatio: number) {
    if (!scene.instrument || !scene.centre.size) return;
    const scale = FRAME_WIDTH / scene.centre.size;
    const baseLean = lean.get(scene.canvas) ?? 0;
    const dealtScene = scene === bass;
    for (let i = 0; i < scene.copies.length; i++) {
      const copy = scene.copies[i]!;
      const offset = dealtScene ? dealt(copy) : 0;
      const step = dealtScene ? reveals[copy.rank]! : 1;
      const out = scene.lights[i]!;
      out.x = (copy.slot.x + offset - scene.centre.x) * scale;
      out.exposure = dealtScene
        ? (copy.rank === 1 ? smooth(clamp(step * 2.5)) : smooth(step))
        : 1;
      out.lean = (lean.get(copy.svg) ?? 0) - baseLean;
      const follower = following.get(copy.svg)!;
      out.yaw = Number.isNaN(follower.yaw) ? scene.yaw : follower.yaw;
    }
    scene.instrument.pose(scene.yaw, scene.lights, pixelRatio);
    scene.cam.classList.add('has-model');
  }

  // The rack. Every instrument on the row (the copies, the in-between ones, the two real ones) has weight:
  // a spring for how far it leans on its foot (degrees, clockwise: its head to the right), pulled towards
  // a lean set by how fast it is moving across the screen, against the motion. Cards slid out in the deal
  // lean as they go and rock to rest; the row's slide sways them all. Speed is measured in screen widths a
  // second, so it feels the same on any screen; a phone's tighter row leans less, so heads don't touch.
  // Each piece answers with its own weight (Apple's response and damping ratio, a little different from
  // one to the next): underdamped, so the swing shows, but damped enough to come to rest in a beat or two.
  const RACK = { perSpeed: 10.5, most: 10, mostNarrow: 7, smoothing: .06, yaw: 3.2 };
  type Piece = { element: SVGSVGElement | HTMLCanvasElement; at: () => number; lean: number; speed: number; x: number; moving: number; response: number; damping: number };
  const rowX = () => -reach * smooth(clamp((shown - span.moveAt) / MOVE)); // the bass's row; the guitar's moves with it
  const bassAt = () => clamp((shown - introEnd) / span.bass);
  const sources: [Piece['element'], () => number][] = [
    ...[...bass.copies, ...steps].map(copy => [copy.svg, () => rowX() + dealt(copy)] as [Piece['element'], () => number]),
    ...guitar.copies.map(copy => [copy.svg, rowX] as [Piece['element'], () => number]),
    [bass.canvas, rowX], [guitar.canvas, rowX],
  ];
  const rack: Piece[] = sources.map(([element, at], index) => {
    const hash = (seed: number) => { const x = Math.sin((index + 1) * seed) * 43758.5453; return x - Math.floor(x); };
    return { element, at, lean: 0, speed: 0, x: NaN, moving: 0, response: .5 + .28 * hash(12.9898), damping: .38 + .12 * hash(78.233) };
  });
  const pieces = rack.map(piece => piece.element);
  const lean = new Map<Element, number>();
  function still() { for (const piece of rack) { piece.x = NaN; piece.moving = 0; } }
  function sway(dt: number) {
    const width = bass.centre.x * 2 || 1;
    const most = narrow.matches ? RACK.mostNarrow : RACK.most;
    let moving = false;
    for (const piece of rack) {
      const x = piece.at();
      const speed = Number.isNaN(piece.x) ? 0 : (x - piece.x) / dt;
      piece.x = x;
      piece.moving += (speed - piece.moving) * (1 - Math.exp(-dt / RACK.smoothing));
      if (Math.abs(piece.moving) < .5) piece.moving = 0;
      else moving = true;
      const goal = Math.max(-most, Math.min(most, -piece.moving / width * RACK.perSpeed));
      const stiffness = (2 * Math.PI / piece.response) ** 2;
      const friction = 4 * Math.PI * piece.damping / piece.response;
      for (let left = dt; left > 0; left -= 1 / 240) {
        const h = Math.min(left, 1 / 240);
        piece.speed += (-stiffness * (piece.lean - goal) - friction * piece.speed) * h;
        piece.lean += piece.speed * h;
      }
      if (Math.abs(piece.lean - goal) < .01 && Math.abs(piece.speed) < .05) { piece.lean = goal; piece.speed = 0; }
      else moving = true;
      lean.set(piece.element, piece.lean);
    }
    return moving;
  }
  const leaning = (element: Element) => {
    const degrees = lean.get(element) ?? 0;
    return Math.abs(degrees) < .001 ? '' : ` rotate(${degrees.toFixed(3)}deg)`;
  };

  // Back to front, in the same stacking order as the desktop SVGs.
  const flatCopies: FlatCopy[] = [...steps].reverse().map(item => ({
    svg: item.svg, colour: item.path.getAttribute('fill')!,
    x: () => rowX() + blue.slot.x + (item.rank - blue.rank) * bridgeSpacing + dealt(item),
    opacity: () => smooth(clamp(reveals[item.rank]! * 4)),
    lean: () => lean.get(item.svg) ?? 0,
  }));
  for (const scene of scenes) {
    for (const copy of [...scene.copies].sort((a, b) => b.rank - a.rank)) {
      flatCopies.push({
        svg: copy.svg, colour: copy.colour,
        x: () => rowX() + copy.slot.x + (scene === bass ? dealt(copy) : reach),
        opacity: () => scene === guitar ? Number(shown > span.moveAt)
          : copy.rank === 1 ? clamp(reveals[1]! * 4) : Number(reveals[1]! >= .25),
        lean: () => lean.get(copy.svg) ?? 0,
      });
    }
  }
  let copyLayer: ReturnType<typeof createCopyLayer> = null;

  // Allow for the widest body and the head swinging sideways about the foot.
  function onScreen(x: number) {
    const margin = bass.centre.size * .32;
    return x >= -margin && x <= 2 * bass.centre.x + margin;
  }

  // The copies' outlines, turned as their instrument is (each through its follower), and the in-between
  // copies', bass to guitar at their step. A path is rewritten only when its turn has changed.
  function turnCopies(dt: number, snap: boolean) {
    const compact = narrow.matches;
    const stride = compact ? 4 : 1;
    const minTurn = copyLayer ? .12 : compact ? .6 : .05;
    const travel = rowX();
    let moving = false;
    for (const scene of scenes) {
      const data = outlines.get(scene);
      const paths = new Map<number, string>(); // Left and right copies at the same yaw share an outline.
      for (const copy of scene.copies) {
        const follower = following.get(copy.svg)!;
        if (follow(follower, scene.yaw, dt, snap)) moving = true;
        if (!data?.length || Math.abs(follower.yaw - follower.drawn) < minTurn) continue;
        if (compact) {
          if (scene === bass && (copy.rank === 1 ? reveals[1] === 0 : reveals[1]! < .25)) continue;
          const offset = scene === bass ? dealt(copy) : reach;
          if (!onScreen(travel + copy.slot.x + offset)) continue;
        }
        follower.drawn = follower.yaw;
        if (copyLayer) {
          copyLayer.outline(copy.svg, shapeAt(data, follower.yaw, scratch[0], stride));
          continue;
        }
        let path = paths.get(follower.yaw);
        if (path === undefined) {
          path = pathOf(shapeAt(data, follower.yaw, scratch[0], stride));
          paths.set(follower.yaw, path);
        }
        follower.path.setAttribute('d', path);
      }
    }
    if (!ready(bass) || !ready(guitar)) return moving;
    // Between the two real ones' turns, the short way round.
    const apart = ((guitar.yaw - bass.yaw) % 360 + 540) % 360 - 180;
    for (const item of steps) {
      let target = bass.yaw + apart * item.t;
      if (!Number.isNaN(item.turn.yaw)) target = item.turn.yaw + (((target - item.turn.yaw) % 360 + 540) % 360 - 180);
      if (follow(item.turn, target, dt, snap)) moving = true;
      if (Math.abs(item.turn.yaw - item.turn.drawn) < minTurn) continue;
      if (compact && (reveals[item.rank] === 0 || !onScreen(travel + blue.slot.x + (item.rank - blue.rank) * bridgeSpacing + dealt(item)))) continue;
      item.turn.drawn = item.turn.yaw;
      const from = shapeAt(outlines.get(bass)!, item.turn.yaw, scratch[0], stride);
      const to = shapeAt(outlines.get(guitar)!, item.turn.yaw, scratch[1], stride);
      for (let i = 0; i < from.length; i++) from[i] = from[i]! + (to[i]! - from[i]!) * item.t;
      if (copyLayer) copyLayer.outline(item.svg, from);
      else item.path.setAttribute('d', pathOf(from));
    }
    return moving;
  }

  // Two lines slip past each other while the bass rises through the space between them.
  // Use the same smoothed playhead for the lettering, instrument and caption on the way back.
  function paintIntro(at: number) {
    paintTextFill(headingFill, at);
    const t = clamp((at - headingFill.length) / BASS_ENTRANCE);
    const upperExit = smooth(clamp((t - .08) / .72));
    const lowerExit = smooth(clamp((t - .16) / .72));
    upper.style.transform = `translate3d(${-75 * upperExit}%,0,0)`;
    lower.style.transform = `translate3d(${75 * lowerExit}%,0,0)`;
    heading.style.opacity = String(1 - smooth(clamp((t - .36) / .45)));

    const rise = easeOut(clamp((t - .09) / .85));
    bass.cam.style.transform = rise === 1 ? '' : `translate3d(0,${(1 - rise) * 48}%,0) rotate(${(1 - rise) * -16}deg)`;
    bass.cam.style.opacity = String(smooth(clamp((t - .12) / .32)));
    const caption = smooth(clamp((t - .64) / .36));
    bass.words.style.transform = caption === 1 ? '' : `translateY(${16 * (1 - caption)}px)`;
    bass.words.style.opacity = String(caption);
  }

  function draw(at: number) {
    const move = clamp((at - span.moveAt) / MOVE); // 0 to 1
    const bassProgress = bassAt();
    // The guitar begins to turn as it glides into place, keeping some motion through the handover.
    const overlap = narrow.matches ? MOVE * .32 : 0;
    const guitarProgress = clamp((at - span.guitarAt + overlap) / (span.guitar + overlap));
    // The bass is dealt out and turned through its chapter; the guitar's line-up is whole from the move on.
    // Every piece of the row leans on its foot as the rack sways.
    if (!copyLayer) {
      deal(bass);
      for (const copy of guitar.copies) copy.svg.style.transform = leaning(copy.svg);
      for (const item of steps) {
        item.svg.style.transform = `translate3d(${dealt(item).toFixed(2)}px,0,0)${leaning(item.svg)}`;
        item.svg.style.opacity = smooth(clamp(reveals[item.rank]! * 4)).toFixed(3);
      }
    }
    for (const scene of scenes) scene.canvas.style.transform = leaning(scene.canvas);
    // The bass's line-up is off the screen's left edge after the slide, all but the in-between copies
    // nearest the guitar, which stay; so it is never hidden.
    guitar.element.style.visibility = move <= 0 ? 'hidden' : '';
    const arrival = clamp((move - .6) / .4);
    // The slide: the row travels left by the distance between the two line-ups.
    const e = smooth(move);
    bass.element.style.transform = `translate3d(${(-reach * e).toFixed(2)}px,0,0)`;
    guitar.element.style.transform = `translate3d(${(reach * (1 - e)).toFixed(2)}px,0,0)`;
    // The bass turns as the fan opens. The guitar holds that angle through the slide,
    // then turns face-on while the reader scrolls through its own text.
    turn(bass, smooth(clamp((bassProgress - .02) / (narrow.matches ? .96 : .58))));
    turn(guitar, 1 - smooth(guitarProgress), 1 - smooth(arrival));

    // The hand: a scene's instrument is free when its turn is complete.
    stand(bass, bassProgress > .995 && move <= 0);
    stand(guitar, guitarProgress > .995);
  }

  // Use native detail while the phone keeps pace. Sustained late frames lower only the moving
  // render resolution. The final pose is always drawn at full detail before the loop sleeps.
  let motionPixelRatio = Math.min(devicePixelRatio || 1, 1.5);
  let frameBudget = 1000 / 60;
  let lateFrames = 0;
  let sampledFrames = 0;
  function renderPixelRatio(elapsed: number, moving: boolean) {
    if (!narrow.matches) return 2;
    const full = Math.min(devicePixelRatio || 1, 3);
    if (!moving || elapsed === 0) {
      lateFrames = sampledFrames = 0;
      return moving ? motionPixelRatio : full;
    }
    if (elapsed >= 6) frameBudget = Math.min(frameBudget, Math.max(1000 / 120, elapsed));
    sampledFrames++;
    if (elapsed > frameBudget * 1.45) lateFrames++;
    if (lateFrames >= 3) {
      motionPixelRatio = Math.min(full, Math.max(1, motionPixelRatio - .5));
      lateFrames = sampledFrames = 0;
    } else if (sampledFrames >= 90) {
      if (!lateFrames) motionPixelRatio = Math.min(full, 2, motionPixelRatio + .5);
      lateFrames = sampledFrames = 0;
    }
    return motionPixelRatio;
  }

  let queued = 0;
  let last = 0;
  function tick(now: number) {
    queued = 0;
    const elapsed = last ? now - last : 0;
    const dt = elapsed ? Math.min(.05, elapsed / 1000) : 1 / 60;
    last = now;
    let moving = false;
    if (enabled && near) {
      const raw = Math.max(0, stage.getBoundingClientRect().top - show.getBoundingClientRect().top) / line;
      if (narrow.matches || raw >= headingFill.length) void load(bass);
      // Give the bass the loading budget during its entrance.
      if (raw >= introEnd + span.bass * .5) void load(guitar);
      const snap = shown < 0;
      const repaintIntro = snap || shown < introEnd;
      for (const scene of scenes) loadOutlines(scene);
      if (narrow.matches) {
        if (snap) touchScroll.set(raw);
        touchScroll.to(raw);
        moving = !touchScroll.step(dt);
        shown = touchScroll.value;
      } else {
        if (snap) shown = raw;
        else shown += (raw - shown) * (1 - Math.exp(-dt / FOLLOW));
        if (Math.abs(raw - shown) < .0005) shown = raw;
        else moving = true;
      }
      for (const scene of scenes) if (stepSpring(scene, dt)) moving = true;
      if (repaintIntro || shown < introEnd) paintIntro(shown);
      updateDeal(bassAt());
      if (sway(dt)) moving = true;
      draw(shown);
      if (turnCopies(dt, snap)) moving = true;
      const { y, size } = bass.centre;
      copyLayer?.paint(y, size, size * (.5 + .5 / FRAME_WIDTH));
      const centre = bass.centre.x + rowX();
      const pixelRatio = renderPixelRatio(elapsed, moving);
      if (!narrow.matches || onScreen(centre)) renderInstrument(bass, pixelRatio);
      if (!narrow.matches || onScreen(centre + reach)) renderInstrument(guitar, pixelRatio);
    }
    // Leaving a chapter mid-turn can already have queued the settling spring for the next frame.
    if (moving) request();
    else if (!queued) last = 0;
  }
  function request() { if (!queued) queued = requestAnimationFrame(tick); }

  // The hand.
  for (const scene of scenes) {
    const { grab, element } = scene;
    grab.addEventListener('pointerdown', event => {
      if (!scene.standing || scene.drag || event.button > 0) return; // one finger at a time
      scene.spring = null; // caught mid-spin: from where it is on screen
      scene.velocity = 0;
      scene.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, from: scene.angle, decided: event.pointerType === 'mouse', history: [{ t: event.timeStamp, x: event.clientX }] };
      grab.setPointerCapture(event.pointerId);
      if (event.pointerType === 'mouse') element.classList.add('is-turning');
    }, { signal });
    grab.addEventListener('pointermove', event => {
      const drag = scene.drag;
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;
      if (!drag.decided) {
        if (Math.abs(event.clientY - drag.y) > 8 && Math.abs(event.clientY - drag.y) > Math.abs(dx)) { scene.drag = null; return; }
        if (Math.abs(dx) < 8) return;
        drag.decided = true;
        drag.x += Math.sign(dx) * 8; // no jump when the turn takes over
        element.classList.add('is-turning');
      }
      scene.angle = drag.from + (event.clientX - drag.x) * scene.perPixel;
      drag.history.push({ t: event.timeStamp, x: event.clientX });
      while (drag.history.length > 2 && event.timeStamp - drag.history[0]!.t > 100) drag.history.shift();
      request();
    }, { signal });
    const release = (event: PointerEvent, cancelled: boolean) => {
      const drag = scene.drag;
      if (!drag || event.pointerId !== drag.id) return;
      scene.drag = null;
      element.classList.remove('is-turning');
      if (!drag.decided) return;
      const first = drag.history[0]!, end = drag.history[drag.history.length - 1]!;
      const time = (end.t - first.t) / 1000;
      const fresh = event.timeStamp - end.t < 60;
      const velocity = !cancelled && fresh && time > .008 ? ((end.x - first.x) / time) * scene.perPixel : 0;
      scene.rest = Math.round((scene.angle + project(velocity)) / 360) * 360;
      scene.velocity = velocity;
      scene.spring = Math.abs(velocity) > 60 ? { damping: .8, response: .55 } : { damping: 1, response: .45 };
      request();
    };
    grab.addEventListener('pointerup', event => release(event, false), { signal });
    grab.addEventListener('pointercancel', event => release(event, true), { signal });
    grab.addEventListener('lostpointercapture', event => release(event, true), { signal });
    grab.addEventListener('keydown', event => {
      if (!scene.standing) return;
      const step = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 45 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -45 : 0;
      if (step) aim(scene, Math.round(scene.rest / 45) * 45 + step, 1, .4);
      else if (event.key === 'Home') aim(scene, Math.round(scene.angle / 360) * 360, 1, .4);
      else return;
      event.preventDefault();
    }, { signal });
  }

  const watch = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.target === show) near = entry.isIntersecting;
    if (!near) { shown = -1; still(); }
    request();
  }, { rootMargin: '64px 0px' }); // Warm the bass just before the title comes into view.
  watch.observe(show);

  let size = '';
  function resized() {
    const now = `${innerWidth}x${stage.offsetHeight}`;
    if (now === size) return request();
    size = now;
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
    watch.disconnect();
    copyLayer?.dispose();
    for (const scene of scenes) scene.instrument?.dispose();
  });
});
