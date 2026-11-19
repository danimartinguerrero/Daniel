import { onPage } from '@/scripts/page';
import { FILL_HOLD, clearTextFill, measureFillLine, measureTextFill, paintTextFill, type LitLine } from '../v4/text-fill';
import type { Instrument } from './instrument';

/* The instruments on the music page (LineupStory.astro). The intro's words fill on their own held
   screen. Then one held screen tells both instruments, on one timeline measured in the scroll a line of
   text takes to fill (text-fill.ts, the site's one pace):

     bass words fill ─ hold ─ the slide from the bass to the guitar ─ guitar words fill ─ hold

   Every frame is a function of where the scroll is (smoothed, so a wheel's steps glide), so scrolling back
   plays it all backwards exactly. Motion, by Emil Kowalski's rules:

   - The bass arrives as a hand of cards fanned out: its copies come out one at a time, nearest first,
     each from behind the one before it and carried out by it, on a strong ease-out, the next starting
     while the last is still moving (a stagger). A card that starts hidden behind its neighbour needs no
     fade, so the colours are never seen half transparent; only the first, out from behind the turned
     instrument, fades up, quickly. The instrument turns from its side to three quarters on meanwhile.
   - The slide: the guitar's line-up waits to the right of the bass's, and between the blue bass and the
     green guitar stand STEPS more copies, each a step further from the bass and nearer the guitar, in
     outline and in colour: a flip book laid out along the row. The screen travels the row, eased in and
     out (smoothstep, the page's curve for scrubbed motion), the words travelling half as far, as if
     nearer the glass. The in-between copies are drawn
     once; the slide moves them with transform only. The two that would peek in at a screen's edge while
     a line-up stands come up as the slide begins and go as it ends.
   - The instruments have weight. Whatever moves them across the screen (a card slid out in the deal, the
     row sliding along), they lean back against the motion, the more the faster it goes, and when it slows
     they swing past upright, rock and settle, each at its own pace (a spring each, Apple's damping ratio
     and response, a little different from one to the next). The real ones turn on their axis with it.
     It is driven by how things actually move, not by where the scroll is, so it is never quite the same
     twice; scrolling back sways them the other way.
   - Words cross with a 4 px blur so the two never read as two things overlapping.

   The in-between outlines: both outlines sampled into the same number of points, matched part to part
   (body, waist, neck, head), and moved between; the colours through OKLab, so blue reaches green through
   clean teal, never grey.

   Once a scene's words are lit and the slide is over, its instrument is the hand's (Apple, Designing
   Fluid Interfaces): a sideways drag turns it 1:1, even mid-spin; on release the velocity goes to a
   spring that rests where the velocity projects it, a whole number of turns from its pose. */

const FOLLOW = 0.07; // s: the screen follows the scroll this closely
const DECELERATION = 0.998; // Apple's normal scroll deceleration, for projecting a flick
const REST = -50; // degrees: turned well round, so its depth shows next to the flat copies
const FROM = 64; // degrees: where it starts, showing its side
const BODY = .27; // a body's width, in frame widths (the outlines in silhouettes.ts)
const HOLD = .8; // lines of scroll the lit bass waits before the move
const MOVE = 4.2; // lines of scroll the slide takes
const STEPS = 5; // copies between the blue bass and the green guitar
const BLUR = 4; // px: words crossing blur this much at most
const POINTS = 1200; // points in an in-between outline
const VIEW = 1600; // the outlines' frame, silhouettes.ts

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

// ── Outlines, matched part to part ───────────────────────────────────────────────────────────────────
// An outline as POINTS points: from its foot up one side to its top, then down the other. Each side is cut
// where it first reaches a quarter, 0.42, 0.6 and 0.8 of the instrument's height, and each piece gets the
// same share of points in every outline, so body meets body and neck meets neck.
const HEIGHTS = [.25, .42, .6, .8];
const SHARES = [.2, .22, .17, .17, .24]; // of a side's points, per piece, foot to top
function outline(path: SVGPathElement): Float32Array {
  const total = path.getTotalLength();
  const dense = 4000;
  let points: [number, number][] = [];
  for (let i = 0; i < dense; i++) {
    const p = path.getPointAtLength(total * i / dense);
    points.push([p.x, p.y]);
  }
  // The same way round for every outline.
  let area = 0;
  for (let i = 0; i < dense; i++) {
    const [x1, y1] = points[i]!, [x2, y2] = points[(i + 1) % dense]!;
    area += x1 * y2 - x2 * y1;
  }
  if (area < 0) points.reverse();
  const ys = points.map(p => p[1]);
  const bottom = Math.max(...ys), top = Math.min(...ys);
  const xs = points.map(p => p[0]);
  const middle = (Math.max(...xs) + Math.min(...xs)) / 2;
  // The foot: the lowest point nearest the middle; the head: the highest.
  let foot = 0;
  for (let i = 0; i < dense; i++) {
    const [x, y] = points[i]!, [fx, fy] = points[foot]!;
    if (y > fy + .5 || (Math.abs(y - fy) <= .5 && Math.abs(x - middle) < Math.abs(fx - middle))) foot = i;
  }
  points = [...points.slice(foot), ...points.slice(0, foot)];
  const head = points.findIndex(p => p[1] === top);
  const one = points.slice(0, head + 1); // foot → head
  const other = [...points.slice(head), points[0]!].reverse(); // foot → head, the other way
  const side = (chain: [number, number][], count: number) => {
    const cuts = [0];
    for (const h of HEIGHTS) {
      const y = bottom - (bottom - top) * h;
      const at = chain.findIndex((p, i) => i > cuts[cuts.length - 1]! && p[1] <= y);
      cuts.push(at < 0 ? cuts[cuts.length - 1]! + 1 : at);
    }
    cuts.push(chain.length - 1);
    const out: [number, number][] = [];
    SHARES.forEach((share, k) => {
      const piece = chain.slice(cuts[k]!, Math.max(cuts[k]! + 2, cuts[k + 1]! + 1));
      const lengths = [0];
      for (let i = 1; i < piece.length; i++) lengths.push(lengths[i - 1]! + Math.hypot(piece[i]![0] - piece[i - 1]![0], piece[i]![1] - piece[i - 1]![1]));
      const length = lengths[lengths.length - 1]! || 1;
      const n = k === SHARES.length - 1 ? count - out.length : Math.round(count * share);
      let j = 0;
      for (let i = 0; i < n; i++) {
        const target = length * i / n;
        while (j < piece.length - 2 && lengths[j + 1]! < target) j++;
        const t = (target - lengths[j]!) / ((lengths[j + 1]! - lengths[j]!) || 1);
        out.push([piece[j]![0] + (piece[j + 1]![0] - piece[j]![0]) * t, piece[j]![1] + (piece[j + 1]![1] - piece[j]![1]) * t]);
      }
    });
    return out;
  };
  const half = POINTS / 2;
  const result = new Float32Array(POINTS * 2);
  [...side(one, half), ...side(other, half).reverse()].forEach(([x, y], i) => { result[i * 2] = x; result[i * 2 + 1] = y; });
  return result;
}
function between(a: Float32Array, b: Float32Array, t: number) {
  let d = '';
  for (let i = 0; i < POINTS; i++) {
    const x = a[i * 2]! + (b[i * 2]! - a[i * 2]!) * t;
    const y = a[i * 2 + 1]! + (b[i * 2 + 1]! - a[i * 2 + 1]!) * t;
    d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${d}Z`;
}

interface Slot { x: number; y: number; size: number }

onPage(signal => {
  const root = document.querySelector<HTMLElement>('[data-lu]');
  if (!root) return;
  const allowed = matchMedia('(prefers-reduced-motion: no-preference) and (min-height: 500px) and (min-width: 320px) and (forced-colors: none)');
  const narrow = matchMedia('(max-width: 760px)');

  // The intro: its own held screen, its words filling.
  const intro = root.querySelector<HTMLElement>('.lu__intro')!;
  const introStage = intro.querySelector<HTMLElement>('[data-fill-stage]')!;
  const introTexts = [...intro.querySelectorAll<HTMLElement>('[data-fill-text]')];
  let introLines: LitLine[] = [];

  const show = root.querySelector<HTMLElement>('[data-lu-show]')!;
  const stage = show.querySelector<HTMLElement>('[data-lu-stage]')!;

  const scenes = [...show.querySelectorAll<HTMLElement>('[data-lu-scene]')].map(element => ({
    element,
    cam: element.querySelector<HTMLElement>('[data-lu-cam]')!,
    words: element.querySelector<HTMLElement>('[data-lu-words]')!,
    texts: [...element.querySelectorAll<HTMLElement>('[data-fill-text]')],
    lines: [] as LitLine[],
    canvas: element.querySelector('canvas')!,
    grab: element.querySelector<HTMLElement>('[data-lu-grab]')!,
    model: element.dataset.model!,
    paint: element.dataset.paint ?? '',
    copies: [...element.querySelectorAll<SVGSVGElement>('[data-lu-copy]')].map(svg => ({
      svg, side: Number(svg.dataset.side), rank: Number(svg.dataset.rank), slot: { x: 0, y: 0, size: 1 } as Slot,
    })),
    instrument: null as Instrument | null,
    loading: false,
    centre: { x: 0, y: 0, size: 1 } as Slot,
    standing: false,
    // The turn by hand, in degrees on top of the scroll's: where it is, how fast, where it's going.
    angle: 0, velocity: 0, rest: 0,
    spring: null as null | { damping: number; response: number },
    drag: null as null | { id: number; x: number; y: number; from: number; decided: boolean; history: { t: number; x: number }[] },
    perPixel: .5,
  }));
  type Scene = typeof scenes[number];
  const [bass, guitar] = scenes as [Scene, Scene];
  // The in-between copies, blue bass to green guitar, made once: outline and colour a step further each.
  const blue = bass.copies.find(copy => copy.side === 1 && copy.rank === 3)!;
  const green = guitar.copies.find(copy => copy.side === -1 && copy.rank === 3)!;
  const steps = (() => {
    const defs = root.querySelector('.lu__defs')!;
    const shape = (scene: Scene) => outline(defs.querySelector<SVGPathElement>(scene.element.querySelector('use')!.getAttribute('href')!)!);
    const from = shape(bass), to = shape(guitar);
    const blueLab = toLab(blue.svg.style.getPropertyValue('--c').trim());
    const greenLab = toLab(green.svg.style.getPropertyValue('--c').trim());
    return Array.from({ length: STEPS }, (_, index) => {
      const t = (index + 1) / (STEPS + 1);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', `0 0 ${VIEW} ${VIEW}`);
      svg.setAttribute('class', 'lu__copy lu__step');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', between(from, to, t));
      path.setAttribute('fill', fromLab(blueLab.map((value, i) => value + (greenLab[i]! - value) * t) as Lab));
      svg.append(path);
      bass.cam.append(svg);
      return svg;
    });
  })();
  // How far the guitar's line-up waits to the right: its green copy STEPS + 1 steps after the blue bass.
  let reach = 0;
  let step = 0;

  let line = 1;
  let enabled = false;
  let near = false;
  let stopped = false;
  // The timeline, in lines of scroll from where the screen is first held.
  let span = { bass: 1, guitar: 1, moveAt: 1, guitarAt: 1, end: 1 };
  let shown = -1; // where the screen is on the timeline, following the scroll

  async function load(scene: Scene) {
    if (scene.loading) return;
    scene.loading = true;
    try {
      const { createInstrument } = await import('./instrument');
      const instrument = await createInstrument(scene.canvas, scene.model, scene.paint);
      if (stopped) return instrument.dispose();
      scene.instrument = instrument;
      instrument.resize(scene.centre.size, Math.min(devicePixelRatio || 1, 2));
      request();
    } catch {
      scene.loading = false;
    }
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
    const reach = (frame: number) => BODY * frame * air * 3 + BODY * frame / 2;
    let frame = band * 1.1;
    const half = width / 2 - (narrow.matches ? 8 : Math.max(24, width * .05));
    if (reach(frame) > half) frame *= half / reach(frame);
    const length = frame / 1.1;
    const y = top + band / 2;
    scene.centre = { x: width / 2, y, size: frame };
    for (const copy of scene.copies) {
      copy.slot = { x: width / 2 + copy.side * BODY * frame * air * copy.rank, y, size: frame };
      const style = copy.svg.style;
      style.width = style.height = `${frame.toFixed(1)}px`;
      style.left = `${(copy.slot.x - frame / 2).toFixed(1)}px`;
      style.top = `${(y - frame / 2).toFixed(1)}px`;
    }
    const style = scene.canvas.style;
    style.width = style.height = `${frame.toFixed(1)}px`;
    style.left = `${(width / 2 - frame / 2).toFixed(1)}px`;
    style.top = `${(y - frame / 2).toFixed(1)}px`;
    const grab = scene.grab.style;
    const gw = frame * .42, gh = length * 1.02;
    grab.width = `${gw.toFixed(1)}px`; grab.height = `${gh.toFixed(1)}px`;
    grab.left = `${(width / 2 - gw / 2).toFixed(1)}px`; grab.top = `${(y - gh / 2).toFixed(1)}px`;
    scene.perPixel = 360 / Math.max(420, frame * .8);
    scene.instrument?.resize(frame, Math.min(devicePixelRatio || 1, 2));
  }

  function measure() {
    line = measureFillLine(root!);
    enabled = allowed.matches;
    for (const section of [intro, show]) {
      section.classList.toggle('statement', enabled);
      section.classList.toggle('is-scrubbed', enabled);
    }
    if (!enabled) {
      for (const text of [...introTexts, ...scenes.flatMap(scene => scene.texts)]) clearTextFill(text);
      for (const section of [intro, show]) section.style.removeProperty('height');
      for (const scene of scenes) { stand(scene, false); reset(scene); }
      return;
    }
    introLines = introTexts.flatMap(text => measureTextFill(text));
    intro.style.height = `${(introStage.offsetHeight + (introLines.length + FILL_HOLD) * line).toFixed(1)}px`;
    for (const scene of scenes) {
      // Measured at rest, so the words' size is the real one.
      scene.words.style.transform = '';
      scene.lines = scene.texts.flatMap(text => measureTextFill(text));
    }
    const stageTop = stage.getBoundingClientRect().top;
    const wordsBottom = Math.max(...scenes.map(scene => scene.words.getBoundingClientRect().bottom - stageTop));
    for (const scene of scenes) place(scene, wordsBottom);
    span = { bass: Math.max(1, bass.lines.length), guitar: Math.max(1, guitar.lines.length), moveAt: 0, guitarAt: 0, end: 0 };
    span.moveAt = span.bass + HOLD;
    span.guitarAt = span.moveAt + MOVE;
    span.end = span.guitarAt + span.guitar + FILL_HOLD;
    show.style.height = `${(stage.offsetHeight + span.end * line).toFixed(1)}px`;
    // Every piece of the row leans on its foot.
    for (const element of pieces) element.style.transformOrigin = `50% ${(50 + 50 / 1.1).toFixed(2)}%`;
    still();
    step = BODY * bass.centre.size * (narrow.matches ? .8 : 1.14);
    reach = blue.slot.x + (STEPS + 1) * step - green.slot.x;
    steps.forEach((svg, index) => {
      const frame = blue.slot.size;
      svg.style.width = svg.style.height = `${frame.toFixed(1)}px`;
      svg.style.left = `${(blue.slot.x + (index + 1) * step - frame / 2).toFixed(1)}px`;
      svg.style.top = `${(blue.slot.y - frame / 2).toFixed(1)}px`;
      svg.style.zIndex = String(-2 - index); // further right, further under, as the copies at the right are
    });
    shown = -1;
    request();
  }
  function reset(scene: Scene) {
    scene.cam.style.transform = scene.cam.style.opacity = '';
    scene.words.style.transform = scene.words.style.opacity = scene.words.style.filter = '';
    scene.element.style.visibility = scene.element.style.clipPath = scene.element.style.transform = '';
    for (const copy of scene.copies) { copy.svg.style.transform = copy.svg.style.opacity = ''; copy.svg.style.visibility = ''; }
    scene.canvas.style.transform = scene.canvas.style.opacity = scene.canvas.style.visibility = '';
  }

  // The hand of cards: on each side, copy by copy from the nearest, each slides one step out from behind
  // the one before it, which carries it along: a copy's place is the sum of its own step and those of the
  // copies nearer the middle. Each starts while the one before is still moving.
  const stepOut = (progress: number, rank: number) => easeOut(clamp((progress - .02 - (rank - 1) * .1) / .3));
  // How far a card is from its place (px, along the row) at this point of the deal.
  function dealt(scene: Scene, copy: Scene['copies'][number], progress: number) {
    let out = 0;
    for (let rank = 1; rank <= copy.rank; rank++) out += stepOut(progress, rank);
    // `out` steps from the middle; at home it is `rank` steps.
    return copy.side * (out - copy.rank) * Math.abs(copy.slot.x - scene.centre.x) / copy.rank;
  }
  function deal(scene: Scene, progress: number) {
    for (const copy of scene.copies) {
      copy.svg.style.transform = `translate3d(${dealt(scene, copy, progress).toFixed(2)}px,0,0)`;
      // Only the first card, out from behind the turned instrument, fades up; the others are switched on
      // once it is opaque, while still exactly behind it.
      const first = stepOut(progress, 1);
      copy.svg.style.opacity = copy.rank === 1 ? clamp(first * 4).toFixed(3) : (first >= .25 ? '1' : '0');
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
      scene.angle = wrap(scene.rest) < .001 || wrap(scene.rest) > 359.999 ? 0 : scene.rest;
      scene.rest = scene.angle;
    }
    return true;
  }
  // Its pose: from showing its side to three quarters on as its words fill, plus `extra` degrees (the
  // move's), plus the hand's turn.
  function turn(scene: Scene, progress: number, extra = 0) {
    // It has turned to face you by the time the hand of cards is out, well before its words are all lit.
    const yaw = FROM + (REST - FROM) * smooth(clamp(progress / .6)) + extra + scene.angle;
    scene.instrument?.pose(yaw);
    const angle = Math.round(wrap(yaw - REST)) % 360;
    scene.grab.setAttribute('aria-valuenow', String(angle));
    const side = angle < 30 || angle > 330 ? 'Three quarters on' : angle > 150 && angle < 210 ? 'From the back' : 'Turned';
    if (scene.grab.getAttribute('aria-valuetext') !== side) scene.grab.setAttribute('aria-valuetext', side);
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
  const bassAt = () => clamp(shown / span.bass);
  const sources: [Piece['element'], () => number][] = [
    ...bass.copies.map(copy => [copy.svg, () => rowX() + dealt(bass, copy, bassAt())] as [Piece['element'], () => number]),
    ...steps.map(svg => [svg, rowX] as [Piece['element'], () => number]),
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
    const width = stage.clientWidth || 1;
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

  // Words leaving and arriving: up and out, up and in, each through a slight blur.
  function words(scene: Scene, shown: number, rise: number) {
    scene.words.style.opacity = shown.toFixed(3);
    scene.words.style.transform = `translate3d(0,${rise.toFixed(2)}px,0)`;
    scene.words.style.filter = shown > .999 ? '' : `blur(${(BLUR * (1 - shown)).toFixed(2)}px)`;
  }

  function draw(at: number, raw: number) {
    // The words fill with the scroll itself, so their pace is exactly the site's.
    paintTextFill(bass.lines, raw);
    paintTextFill(guitar.lines, raw - span.guitarAt);
    const move = clamp((at - span.moveAt) / MOVE); // 0 to 1
    const bassProgress = clamp(at / span.bass);
    const guitarProgress = clamp((at - span.guitarAt) / span.guitar);
    // The bass is dealt out and turned as its words fill; the guitar's line-up is whole from the move on.
    // Every piece of the row leans on its foot as the rack sways.
    deal(bass, bassProgress);
    for (const copy of bass.copies) copy.svg.style.transform += leaning(copy.svg);
    for (const copy of guitar.copies) copy.svg.style.transform = leaning(copy.svg);
    for (const svg of steps) svg.style.transform = leaning(svg);
    for (const scene of scenes) scene.canvas.style.transform = leaning(scene.canvas);
    bass.element.style.visibility = move >= 1 ? 'hidden' : '';
    guitar.element.style.visibility = move <= 0 ? 'hidden' : '';
    const leave = easeOut(clamp(move / .3)); // the bass's words going
    const come = easeOut(clamp((move - .6) / .4)); // the guitar's arriving
    words(bass, 1 - leave, -14 * leave);
    words(guitar, come, 14 * (1 - come));
    // The slide: the row travels left by the distance between the two line-ups.
    const e = smooth(move);
    bass.cam.style.transform = `translate3d(${(-reach * e).toFixed(2)}px,0,0)`;
    guitar.cam.style.transform = `translate3d(${(reach * (1 - e)).toFixed(2)}px,0,0)`;
    bass.words.style.transform += ` translate3d(${(-reach * .5 * e).toFixed(2)}px,0,0)`;
    guitar.words.style.transform += ` translate3d(${(reach * .5 * (1 - e)).toFixed(2)}px,0,0)`;
    // The in-between copies are off screen at either end of the slide, all but the first, peeking in at the
    // right edge while the bass stands, and the last, at the left edge once the guitar does: those two
    // come up as the slide begins and go as it ends, so neither line-up has strangers at its edge.
    steps.forEach((svg, index) => {
      const shown = (index === 0 ? clamp(move / .1) : 1) * (index === steps.length - 1 ? clamp((1 - move) / .1) : 1);
      svg.style.opacity = shown.toFixed(3);
    });
    // The real ones also turn on their axis as the rack sways.
    turn(bass, bassProgress, (lean.get(bass.canvas) ?? 0) * RACK.yaw);
    turn(guitar, 1, (lean.get(guitar.canvas) ?? 0) * RACK.yaw);

    // The hand: a scene's instrument is free once its words are lit and the move is over.
    stand(bass, bassProgress > .995 && move <= 0);
    stand(guitar, guitarProgress > .995);
  }

  let queued = 0;
  let last = 0;
  function tick(now: number) {
    queued = 0;
    const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let moving = false;
    if (enabled) {
      const introScrolled = Math.max(0, introStage.getBoundingClientRect().top - intro.getBoundingClientRect().top);
      paintTextFill(introLines, introScrolled / line);
    }
    if (enabled && near) {
      for (const scene of scenes) load(scene);
      const raw = Math.max(0, stage.getBoundingClientRect().top - show.getBoundingClientRect().top) / line;
      if (shown < 0) shown = raw;
      else shown += (raw - shown) * (1 - Math.exp(-dt / FOLLOW));
      if (Math.abs(raw - shown) < .0005) shown = raw;
      else moving = true;
      for (const scene of scenes) if (stepSpring(scene, dt)) moving = true;
      if (sway(dt)) moving = true;
      draw(shown, raw);
    }
    if (moving) queued = requestAnimationFrame(tick);
    else last = 0;
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
  }, { rootMargin: '150% 0px' });
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
    for (const scene of scenes) scene.instrument?.dispose();
  });
});
