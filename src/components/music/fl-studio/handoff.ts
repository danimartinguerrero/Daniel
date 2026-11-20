import { Spring, clamp } from '../v4/physics';

/* The hand-off from the instruments to FL Studio (LineupStory.astro → StudioStory.astro): the guitar's
   line-up is recorded.

   The two chapters share one held screen for a stretch of scroll: FL Studio's stage lies exactly over
   the instruments', see-through. A playhead (FL's green one) crosses the screen left to right, and
   whatever it passes becomes FL Studio's: the black turns into the Playlist, the guitar's caption into
   FL's, the piano roll's window appears, and each instrument is left behind as a flat shape in the
   colour of a note. One after the other, in the order the playhead reached them, the shapes come away
   from the row, turn to lie along the grid and settle into the piano roll as the first notes of the
   melody, each pressing its key as it lands. From there the chapter goes on as it always did: the
   pencil writes the rest.

   How it moves (Emil Kowalski's rules):
   - It is told by the scroll, so the playhead moves at the scroll's own pace (linear: constant motion)
     and everything plays backwards exactly.
   - The wipe is two opposite transforms (a window and its content, as the page's text fill is), so the
     whole of FL Studio is painted once and only composited after.
   - The shapes are objects, not keyframes: each follows the scroll through a spring (Apple's response
     and damping ratio), and turns on a looser one, so a fast scroll throws them and they rock into
     their slots; a slow one lays them down. Nothing appears from nothing: a shape is the instrument
     that stood there, and the note it becomes takes over under it, in the same place and colour.
   - One canvas, seven shapes; drawn only while something moves. */

/** What the instruments chapter lends to the hand-off (set by lineup.ts while its page is shown). */
export interface LineupPiece {
  /** Centre of its frame on the stage, px. */
  x: number;
  y: number;
  /** The frame's side, px: the outline's 0..view box is drawn this large. */
  size: number;
  /** Its colour; null for the real instrument, which is not a flat copy until the playhead passes it. */
  colour: string | null;
  /** Degrees it leans on its foot right now. */
  lean: number;
  /** Its outline as it is turned now: x, y pairs in the view box, foot first, up one side and down the other. */
  points: Float32Array;
}
export interface LineupBridge {
  /** The guitar's line-up, left to right. Empty until its outlines have loaded. */
  pieces(): LineupPiece[];
  /** The outlines' view box, and where the foot is in it (a share of its height). */
  view: number;
  foot: number;
  /** The chapter is on screen and has come to rest on its last frame. */
  near(): boolean;
  settled(): boolean;
  /** The hand-off draws the copies from now on (or gives them back). */
  take(on: boolean): void;
  /** FL Studio covers the stage completely: nothing needs drawing under it. */
  cover(on: boolean): void;
}
export const lineupBridge: { current: LineupBridge | null } = { current: null };

const joinable = matchMedia('(prefers-reduced-motion: no-preference) and (min-height: 580px) and (min-width: 320px) and (forced-colors: none)');
const narrow = matchMedia('(max-width: 760px)');
/** The scroll the hand-off takes, px, for a stage this tall; 0 where the two chapters are not joined. */
export function handoffDistance(stageHeight: number) {
  if (!joinable.matches || !document.querySelector('[data-studio]') || !document.querySelector('[data-lu]')) return 0;
  return Math.round(stageHeight * (narrow.matches ? 2 : 2.2));
}
export const onJoinChange = (listener: () => void, signal: AbortSignal) => joinable.addEventListener('change', listener, { signal });

const smooth = (n: number) => { const t = clamp(n, 0, 1); return t * t * (3 - 2 * t); };
// A note as the piano roll draws it (StudioStory.astro, .note): its face, flat, inside a darker edge. The edge keeps
// shapes that overlap apart, as it does notes; the glint is the face's top highlight, for the moment a shape lands.
const NOTE = [195, 245, 204], GLINT = [240, 255, 243], EDGE = '#83ab89';
const SWEEP = { from: .04, to: .95 }; // the share of the hand-off the playhead takes
const FLIGHT = .34; // screen widths the playhead travels while a shape flies
const GAP = .012; // screen widths the playhead is past a shape before it comes away

interface Job { shape: Path2D; x: number; y: number; cos: number; sin: number; alpha: number; colour: string | null; edge: number; face: string }
interface Flyer {
  target: HTMLElement;
  key: HTMLElement | null;
  slot: { x: number; y: number; w: number; h: number }; // the note's box on the stage
  u: Spring; // 0 standing in the row, 1 in its slot
  turn: Spring; // 0 upright, 1 lying along the grid
  swing: number; // its own response, s
  fade: number; // how far the note has taken over from the shape
  down: boolean;
}

export function createHandoff(stage: HTMLElement, fl: HTMLElement, targets: HTMLElement[]) {
  const wipe = stage.querySelector<HTMLElement>('[data-studio-wipe]')!;
  const world = stage.querySelector<HTMLElement>('[data-studio-world]')!;
  const scan = stage.querySelector<HTMLElement>('[data-studio-scan]')!;
  const canvas = stage.querySelector<HTMLCanvasElement>('[data-studio-flight]')!;
  const ctx = canvas.getContext('2d');
  const flyers: Flyer[] = targets.map((target, index) => ({
    target,
    key: fl.querySelector<HTMLElement>(`.fl__keys [data-key="${target.dataset.key}"]`),
    slot: { x: 0, y: 0, w: 1, h: 1 },
    u: new Spring(0, { response: .26, damping: 1 }, .0004),
    // Each turns at its own pace, as the instruments on the rack sway at theirs.
    turn: new Spring(0, { response: .4, damping: .58 }, .0004),
    swing: .4 + .05 * ((index * 5) % 4),
    fade: -1,
    down: false,
  }));
  let width = 1, height = 1, ratio = 1;
  let drawn = false;
  let taken = false;
  let covered = false;
  let linger = 0;
  const written = { reveal: -1, line: NaN, lineOpacity: -1 };

  function measure() {
    width = stage.clientWidth;
    height = stage.clientHeight;
    ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(6e6 / Math.max(1, width * height)));
    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(height * ratio);
    drawn = true; // a resized canvas is empty
    // The notes' boxes with nothing moved: the wipe's transforms cancel out, the window's own is put back by its painter.
    const transform = fl.style.transform;
    fl.style.transform = 'none';
    const origin = stage.getBoundingClientRect();
    for (const flyer of flyers) {
      const box = flyer.target.getBoundingClientRect();
      flyer.slot = { x: box.left - origin.left, y: box.top - origin.top, w: box.width, h: box.height };
    }
    fl.style.transform = transform;
    written.reveal = -1;
    written.line = NaN;
  }

  function reveal(share: number, lineX: number) {
    const shown = Math.round(clamp(share, 0, 1) * width * 100) / 100;
    if (shown !== written.reveal) {
      written.reveal = shown;
      const hidden = width - shown;
      wipe.style.visibility = shown <= 0 ? 'hidden' : '';
      wipe.style.transform = hidden <= 0 ? '' : `translate3d(${(-hidden).toFixed(2)}px,0,0)`;
      world.style.transform = hidden <= 0 ? '' : `translate3d(${hidden.toFixed(2)}px,0,0)`;
    }
    // The playhead fades in over its first steps and is gone once it has left the screen.
    const opacity = lineX <= -8 || lineX >= width + 8 ? 0 : Math.round(smooth((lineX + 8) / 40) * 100) / 100;
    if (opacity !== written.lineOpacity) scan.style.opacity = String(written.lineOpacity = opacity);
    if (opacity && lineX !== written.line) scan.style.transform = `translate3d(${(written.line = lineX).toFixed(2)}px,0,0)`;
  }

  function land(flyer: Flyer, fade: number, down: boolean) {
    const rounded = Math.round(fade * 100) / 100;
    if (rounded !== flyer.fade) {
      flyer.fade = rounded;
      flyer.target.style.visibility = rounded > 0 ? '' : 'hidden';
      flyer.target.style.opacity = rounded >= 1 ? '' : String(rounded);
    }
    if (down !== flyer.down) flyer.key?.classList.toggle('is-down', flyer.down = down);
  }

  const path = (points: Float32Array, cx: number, cy: number, half: number, inflate: number) => {
    // Seen along its length, a shape swells (or thins) sideways into the note's bar; its length is the note's already.
    const shape = new Path2D();
    const sides = points.length / 2;
    for (let i = 0; i < points.length; i += 2) {
      const lateral = points[i]! - cx;
      const edge = i < sides ? -half : half;
      const x = lateral + (edge - lateral) * inflate, y = points[i + 1]! - cy;
      if (i) shape.lineTo(x, y);
      else shape.moveTo(x, y);
    }
    shape.closePath();
    return shape;
  };

  /** One frame at `t` (0 the row as the instruments left it, 1 FL Studio's screen). True while anything still moves.
      `lift`: how far this stage still is below the instruments' (px), when a scroll is thrown back past the start. */
  function paint(t: number, dt: number, snap: boolean, lift = 0) {
    const bridge = lineupBridge.current;
    const pieces = bridge?.pieces() ?? [];
    const live = pieces.length === flyers.length && !!ctx;
    // Where the playhead is, in screen widths. It keeps going past the right edge, so the last shapes land on its count.
    const last = live ? Math.max(...pieces.map(piece => piece.x + piece.size * .13)) / width : 1;
    const end = Math.max(1.03, last + GAP + FLIGHT + .01);
    const at = -.03 + (end + .03) * clamp((t - SWEEP.from) / (SWEEP.to - SWEEP.from), 0, 1);
    const lineX = at * width;
    reveal(at, lineX);

    // The shapes are the hand-off's while it plays, and until the last one thrown by a fast scroll has come to rest.
    // (At rest for the eye is enough: the last of a spring's ringing is not worth holding the row for.)
    const flying = flyers.some(flyer => Math.abs(flyer.u.value - flyer.u.target) > .002 || Math.abs(flyer.turn.value - flyer.turn.target) * 90 > .4
      || Math.abs(flyer.turn.velocity) * 90 > 6);
    const take = live && ((t > 0 && t < 1) || (flying && !snap));
    if (take !== taken) {
      bridge?.take(taken = take);
      // Given back, the row draws its copies again on its next frame: keep them here until it has.
      linger = take ? 0 : 3;
    }
    const draw = take || (live && linger > 0);
    if (linger > 0 && dt > 0) linger--;
    const cover = t >= 1 && !take;
    if (cover !== covered) bridge?.cover(covered = cover);

    let moving = linger > 0;
    const scale = live ? pieces[0]!.size / bridge!.view : 1;
    if (ctx && (draw || drawn)) {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      drawn = false;
    }
    // Back to front: the copies furthest from the middle first, the real one last, as they stand in the row.
    const order = flyers.map((_, index) => index).sort((a, b) => Math.abs(b - 3) - Math.abs(a - 3));
    const jobs: Job[] = [];
    for (const index of order) {
      const flyer = flyers[index]!;
      const piece = pieces[index];
      // Without the row to draw from (its outlines never came), the notes still arrive on the playhead's count.
      const right = piece ? (piece.x + piece.size * .13) / width : (index + 1) / (flyers.length + 1);
      const goal = t >= 1 ? 1 : clamp((at - right - GAP) / FLIGHT, 0, 1);
      // Thrown back past the start, the row is the instruments' again and may scroll away: whatever is still in the
      // air stands up at once, without a swing. (Thrown forward, the shapes keep theirs: they rock into their slots.)
      const over = t <= 0;
      flyer.u.to(goal, { response: over ? .18 : .26 });
      flyer.turn.to(smooth(goal / .7), over ? { response: .2, damping: 1 } : { response: flyer.swing, damping: .58 });
      if (snap) { flyer.u.set(goal); flyer.turn.set(flyer.turn.target); }
      const still = flyer.u.step(dt);
      const stood = flyer.turn.step(dt);
      if (!still || !stood) moving = true;
      const u = clamp(flyer.u.value, 0, 1);
      // The note takes over once the shape is its bar and lies level; a shape still rocking stays a shape.
      // (Within half a degree it reads as level: the last of a spring's ringing is not worth waiting for.)
      const level = 1 - clamp((Math.abs(flyer.turn.value - 1) * 90 - .5) / 2.5, 0, 1);
      const fade = !live || !take ? Number(goal >= 1) : smooth((u - .9) / .1) * level;
      land(flyer, fade, u > .78 && fade < .6 && take);
      if (!draw || !piece || fade >= 1) continue;

      const { points, size, colour } = piece;
      const view = bridge!.view;
      // The shape's own box, for its centre and length.
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < points.length; i += 2) {
        const x = points[i]!, y = points[i + 1]!;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      // Standing: on its foot, leaning as the rack has it.
      const lean = piece.lean * Math.PI / 180 * (1 - smooth(u * 5));
      const footX = view / 2 - cx, footY = view * bridge!.foot - cy; // the foot, seen from the shape's centre
      const startX = piece.x - (Math.cos(lean) * footX - Math.sin(lean) * footY) * scale;
      const startY = piece.y - lift - size / 2 + size * bridge!.foot - (Math.sin(lean) * footX + Math.cos(lean) * footY) * scale;
      // Lying: its length the note's, its centre the note's.
      const slot = flyer.slot;
      const lying = slot.w / (maxY - minY);
      const travel = smooth(u);
      const grow = smooth(u / .86);
      const size1 = scale * (lying / scale) ** grow;
      // It comes away upwards before it comes down into its slot: a small hop, bigger for the ones that go far.
      const hop = Math.min(height * .09, Math.hypot(slot.x - startX, slot.y - startY) * .16) * Math.sin(Math.PI * travel);
      const x = startX + (slot.x + slot.w / 2 - startX) * travel;
      const y = startY + (slot.y + slot.h / 2 - startY) * travel - hop;
      const angle = lean + flyer.turn.value * Math.PI / 2;
      const inflate = smooth((u - .48) / .44);
      const shape = path(points, cx, cy, slot.h / 2 / lying, inflate);
      const glint = smooth((u - .7) / .2);
      jobs.push({
        shape, x: x * ratio, y: y * ratio, cos: Math.cos(angle) * size1 * ratio, sin: Math.sin(angle) * size1 * ratio,
        alpha: 1 - fade, colour, edge: 2 / size1, // half the edge lies under the fill: a pixel shows
        face: `rgb(${NOTE.map((channel, i) => Math.round(channel + (GLINT[i]! - channel) * glint)).join()})`,
      });
    }
    if (ctx && jobs.length) {
      const within = (from: number, to: number, job: Job) => {
        ctx.save();
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.beginPath();
        ctx.rect(from, 0, to - from, height);
        ctx.clip();
        ctx.setTransform(job.cos, job.sin, -job.sin, job.cos, job.x, job.y);
        ctx.globalAlpha = job.alpha;
      };
      const ahead = Math.max(0, lineX), behind = Math.min(width, lineX);
      // Ahead of the playhead the copies are still their own colour, and still behind the real one: its shape is cut
      // out of them, so the instrument itself (on the stage underneath) shows through as it always stood.
      if (ahead < width) for (const job of jobs) {
        within(ahead, width, job);
        if (job.colour) {
          ctx.fillStyle = job.colour;
        } else {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.globalAlpha = 1;
        }
        ctx.fill(job.shape);
        ctx.restore();
      }
      // Behind it they are a note's colour already, each inside its edge.
      if (behind > 0) for (const job of jobs) {
        within(0, behind, job);
        ctx.fillStyle = job.face;
        ctx.strokeStyle = EDGE;
        ctx.lineWidth = job.edge;
        ctx.stroke(job.shape);
        ctx.fill(job.shape);
        ctx.restore();
      }
      drawn = true;
    }
    // Whatever is left on the canvas once the row has its copies back is wiped on the next frame.
    if (drawn && !take) moving = true;
    // Past either end with the shapes still the hand-off's: one more frame gives them back and releases the keys.
    if (take && (t >= 1 || t <= 0)) moving = true;
    return moving;
  }

  function clear() {
    taken = covered = false;
    lineupBridge.current?.take(false);
    lineupBridge.current?.cover(false);
    wipe.style.visibility = wipe.style.transform = world.style.transform = '';
    scan.style.opacity = '0';
    written.reveal = written.lineOpacity = -1;
    written.line = NaN;
    for (const flyer of flyers) {
      flyer.u.set(1);
      flyer.turn.set(1);
      flyer.fade = -1;
      flyer.target.style.visibility = flyer.target.style.opacity = '';
      if (flyer.down) flyer.key?.classList.remove('is-down');
      flyer.down = false;
    }
    ctx?.setTransform(1, 0, 0, 1, 0, 0);
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    drawn = false;
  }

  return { measure, paint, clear, flown: new Set(targets) };
}
