import { useCallback, useEffect, useRef, useState } from 'react';

import { Artwork } from '@/components/islandcn/artwork';
import { PlayerControls, PlayerCover, PlayerTitle, type PlaybackState } from '@/components/islandcn/now-playing-activity';
import { islandAudio, type IslandAudio } from '@/components/island-audio';
import { LiveMeter } from '@/components/LiveMeter';
import { useIslandNudge } from '@/components/IslandNudge';
import { warm } from '@/scripts/warm';
import { defaultClock, IslandView, islandMetrics, islandMotion, type IslandMetricsOverrides, type IslandMotionOverrides, type IslandPresentation } from '@/lib/island';

/**
 * The navigation as the island, drawn by the islandcn engine (src/lib/island), with a song in it.
 * At rest it is the plain pill; while the song plays it is compact, a cover and a level meter, as a
 * music player's island is. Hovered (fine
 * pointers), tapped (touch) or focused, it opens into islandcn's expanded player (cover, title,
 * meter, times and play/pause) with the links below, and closes when left. The engine solves the
 * springs, the shape and the crossfades; this file decides when it is open and what it holds.
 *
 * The song, with a needle drop recorded onto its start, plays only from the island's play button
 * (island-audio.ts). While it isn't playing, the closed island keeps a bubble with a note in it
 * (IslandNudge.tsx). The meter shows the song's real spectrum.
 */
const links = [
  { href: '#projects', label: 'Projects' },
  { href: '#studies', label: 'Studies' },
  { href: '#how-i-work', label: 'How I work' },
  { href: '#contact', label: 'Contact' },
] as const;

const song = { title: 'Feather', artist: 'Nujabes', src: '/audio/feather.m4a', cover: '/audio/modal-soul.jpg', levels: '/audio/feather.levels.bin', duration: 177_450 } as const;
const seed = `${song.title} ${song.artist}`;
/** The meter takes the cover's red, lifted so it reads on black. */
const tone = '#ff7a5c';

/**
 * Hover intent, for fine pointers: the pointer has to rest on the island a moment before it opens,
 * so a mouse crossing the top of the page on its way to the tab bar doesn't set it off, and it can
 * slip off the edge for a moment (the card is still growing under it) without the island closing.
 */
const hoverOpenDelay = 70;
const hoverCloseDelay = 180;

/**
 * The player and the links need more room than the engine's 180 pt cap. And the island keeps its
 * keyline on a dark page when it shows nothing or only the bubble, as it does open or playing: on
 * iOS the bare cutout has none, but here the pill is the way in, and on black it would vanish.
 */
const metrics = { expanded: { maxHeight: 300 }, keyline: { idle: 1 } } as const satisfies IslandMetricsOverrides;

/**
 * The open and the close, tuned on islandcn's iOS-fitted springs so each reads as one motion on a
 * phone (stepped frame by frame, 60 Hz, iPhone size):
 *
 * - The close goes straight to the compact pill. Upstream's `collapse` heads for the idle pill
 *   first and turns at 0.31 s: the card shrank to 105 wide, under the 155 it ends at, stopped,
 *   grew back 55 pt with a 5 pt overshoot and settled at about 0.95 s, empty from 0.2 to 0.43 s
 *   while it waited to turn. Now the edges, height and corners each take one near critically
 *   damped spring (0.4 / 0.9, 0.38 / 0.92: under 0.5 pt past the end, settled by about 0.45 s),
 *   with no lean or swell at the end (`tail`), and the cover and bars come in from 0.06 s as the
 *   card's content leaves on 0.3 s (0.6 keeps it bright while it blurs), so the two overlap all
 *   the way down.
 * - The open keeps its springs, a little more damped (0.79 to 0.86 for a tap, 0.82 to 0.86 for
 *   hover and keyboard): the card went 3.6 pt past its size and back, now about 1. The compact cover
 *   and bars, drawn twice the size and blurred, lingered faintly over the card until 0.55 s; they
 *   now leave on 0.2 s at their presence's pace (`exitFade` 0.7 for 0.5 and 0.65) and are gone by
 *   0.3 s.
 * - No blur skirts (`blurSkirt`): each blurred slot drew a cloned copy of itself at under 4.5%
 *   opacity on a plus-lighter blend, too faint to see and a blurred, blended layer more per slot.
 * - No keyline dip (`keyline.dip`, below).
 * - The pill's edges and height settle without overshoot as the bubble buds (`split`, 1 against
 *   0.815): after a close the pill comes down from the card on that spring, and it fell 2.3 pt
 *   under capsule height and 3 pt narrower, thinner than the bubble beside it. The bubble keeps its
 *   own springs.
 */
const motion = {
  viaIdle: { collapse: 0 },
  shape: { pressExpand: { dampingFraction: 0.86 }, expand: { dampingFraction: 0.86 }, collapse: { response: 0.4, dampingFraction: 0.9 }, split: { response: 0.42, dampingFraction: 1 } },
  body: { pressExpand: { dampingFraction: 0.86 }, expand: { dampingFraction: 0.86 }, collapse: { response: 0.38, dampingFraction: 0.92 }, split: { response: 0.42, dampingFraction: 1 } },
  corner: { collapse: { response: 0.38, dampingFraction: 0.92, delay: 0 } },
  tail: { collapse: { width: { lean: { by: 0 }, settle: { at: 0 } }, height: { lean: { by: 0 }, settle: { at: 0 } }, top: { settle: { at: 0 } } } },
  contentTiming: {
    pressExpand: { exit: { response: 0.2 }, exitFade: 0.7 },
    expand: { exit: { response: 0.2 }, exitFade: 0.7 },
    collapse: { exit: { response: 0.3 }, exitFade: 0.6, enter: { response: 0.36, delay: 0.06 } },
  },
  blurSkirt: { max: 0 },
  // The keyline holds its strength through a collapse. Upstream dims it to 15% over 0.5 s and brings
  // it back by 1.1 s (`keyline.dip`, measured on the simulator), which read here as the outline
  // going and coming back each time the island closed.
  keyline: { dip: 1 },
} as const satisfies IslandMotionOverrides;

/**
 * Opening out of the bubble, as the activity stack opens a held bubble (split-expand-b): a press
 * swells the bubble at touch-down (its own wobbling spring), a join is set, the bubble starts into
 * the pill just ahead of it (`bubble.joinLead`) as its note leaves, and the expansion absorbs it as
 * a lobe of the pill and turns outward `bubble.absorbExpand` later. The stack sets the join at its
 * long-press (`longPressBubble`, 224 ms); here a tap opens, so the swell shows for `swellAtLeast`
 * and the join comes `joinSoon` after the lift. Without a press on the bubble (a hover, the pill, a
 * key) the join is `joinSoon` ahead: the note leaves 23 ms before it (the swap's `bubbleExit`), so
 * less would cut it short.
 */
const swellAtLeast = Math.min(120, islandMotion.longPressBubble * 1000);
const joinSoon = 50;
/**
 * After a close, how long the island heads for the bare pill before the bubble buds off it. The
 * split itself waits `viaIdle.split` (0.215 s) on the pill before the bubble shows, so the card is
 * down to capsule height by then.
 */
const budAfterClose = 150;
/** Where the bubble starts, right of the island's centre: half the sensor and half the gap to the bubble. */
const bubbleFrom = islandMetrics.compact.sensorWidth / 2 + islandMetrics.minimal.gap / 2;

/** The page colour just below the island, so the engine's keyline knows how dark it is. */
const backdropUnder = (y: number): string | undefined => {
  const x = Math.round(innerWidth / 2);
  for (const el of document.elementsFromPoint(x, Math.min(innerHeight - 1, y))) {
    if (el.closest('[data-island-nav]')) continue;
    const colour = getComputedStyle(el).backgroundColor;
    const parts = colour.match(/\d+(\.\d+)?/g);
    if (!parts || (parts.length > 3 && Number(parts[3]) === 0)) continue;
    return colour;
  }
  return undefined;
};

const luma = (colour: string | undefined) => {
  const [r, g, b] = (colour?.match(/\d+(\.\d+)?/g) ?? ['255', '255', '255']).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Where the song's page lives. */
const musicPage = '/music';

export const IslandNav = ({ home = '' }: {
  /** Prefix for the section links: "" on the home page, "/" anywhere else. Defaults to "". */
  home?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [backdrop, setBackdrop] = useState<string | undefined>(undefined);
  const root = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const fine = useRef(false);
  const [sound, setSound] = useState<IslandAudio | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>({ kind: 'paused', position: 0 });

  // The song: one for the whole visit, made on first use (island-audio.ts). It plays on through
  // every change of page, so the island only ever attaches to it.
  useEffect(() => {
    // The island's own play button is the visitor choosing; it starts the song itself.
    setSound(islandAudio({ src: song.src, levels: song.levels, duration: song.duration / 1000 }));
  }, []);

  // The player shows what the audio element is doing and nothing else: every change of the
  // button and the clock comes from the element's own events, whatever started or stopped it
  // (the island, the lock screen), so the two can't disagree.
  useEffect(() => {
    if (!sound) return;
    const el = sound.element;
    const playing = () => setPlayback({ kind: 'playing', startedAt: Date.now() - el.currentTime * 1000 });
    const paused = () => setPlayback({ kind: 'paused', position: el.currentTime * 1000 });
    const ended = () => setPlayback({ kind: 'paused', position: 0 });
    const seeked = () => (el.paused ? paused() : playing());
    // The clock runs on its own between events; if the audio stalled or skipped, put it back.
    const drift = () => {
      if (el.paused) return;
      setPlayback((now) => {
        const startedAt = Date.now() - el.currentTime * 1000;
        return now.kind === 'playing' && Math.abs(now.startedAt - startedAt) < 400 ? now : { kind: 'playing', startedAt };
      });
    };
    // "play" is the press being heard (the button turns at once); "playing" is sound coming out.
    el.addEventListener('play', playing);
    el.addEventListener('playing', playing);
    el.addEventListener('pause', paused);
    el.addEventListener('ended', ended);
    el.addEventListener('seeked', seeked);
    el.addEventListener('timeupdate', drift);
    // Where it is now: already playing, if the island attaches to a song under way.
    if (el.paused) paused(); else playing();
    return () => {
      el.removeEventListener('play', playing);
      el.removeEventListener('playing', playing);
      el.removeEventListener('pause', paused);
      el.removeEventListener('ended', ended);
      el.removeEventListener('seeked', seeked);
      el.removeEventListener('timeupdate', drift);
    };
  }, [sound]);

  // The visitor's choice, remembered for the rest of the visit (island-audio.ts).
  const toggle = useCallback(() => { sound?.toggle(); }, [sound]);

  // The scrubber: jump there. The element's "seeked" event puts the clock and the meter on it.
  const seek = useCallback((ms: number) => { sound?.seek(ms / 1000); }, [sound]);

  useEffect(() => {
    const media = matchMedia('(hover: hover) and (pointer: fine)');
    fine.current = media.matches;
    const onChange = () => { fine.current = media.matches; };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // What is under the island: once per frame while scrolling, and once more when it settles.
  useEffect(() => {
    const below = islandMetrics.idle.height + 14 + 6;
    let ticking = false;
    let settle: number | undefined;
    const read = () => setBackdrop(backdropUnder(below));
    const sense = () => {
      clearTimeout(settle);
      settle = window.setTimeout(read, 120);
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { read(); ticking = false; });
    };
    read();
    addEventListener('scroll', sense, { passive: true });
    addEventListener('resize', sense);
    // The island stays as the site changes page under it (Island.astro); a new page is new ground.
    document.addEventListener('astro:after-swap', sense);
    return () => {
      clearTimeout(settle);
      removeEventListener('scroll', sense);
      removeEventListener('resize', sense);
      document.removeEventListener('astro:after-swap', sense);
    };
  }, []);

  // The bubble (IslandNudge.tsx): whether it is out, a press on it, and the join that opens the
  // island out of it.
  const bubbleOut = useRef(false);
  const openNow = useRef(open);
  openNow.current = open;
  const [bubblePressed, setBubblePressed] = useState(false);
  const bubblePressAt = useRef<number | null>(null);
  const [joining, setJoining] = useState<number | null>(null);
  const joinCancel = useRef<(() => void) | null>(null);
  const clearJoin = useCallback(() => {
    joinCancel.current?.();
    joinCancel.current = null;
    bubblePressAt.current = null;
    setJoining(null);
    setBubblePressed(false);
  }, []);

  // Every open and close goes through here, so a pending hover change never overrides a click,
  // a key or a link.
  const hoverTimer = useRef<number | undefined>(undefined);
  const setNow = useCallback((next: boolean | ((v: boolean) => boolean)) => {
    clearTimeout(hoverTimer.current);
    const want = typeof next === 'function' ? next(openNow.current) : next;
    if (!want) {
      clearJoin();
      setOpen(false);
      return;
    }
    if (openNow.current || joinCancel.current) return;
    if (!bubbleOut.current) {
      setOpen(true);
      return;
    }
    // Out of the bubble: the join first, then the island opens on the clock the engine draws by.
    const clock = defaultClock();
    const now = clock.now();
    const pressed = bubblePressAt.current;
    const at = Math.max(now + joinSoon, pressed === null ? 0 : pressed + swellAtLeast);
    setJoining(at);
    joinCancel.current = clock.at(at, () => {
      joinCancel.current = null;
      bubblePressAt.current = null;
      setJoining(null);
      setBubblePressed(false);
      setOpen(true);
    });
  }, [clearJoin]);
  const setSoon = (next: boolean, ms: number) => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setNow(next), ms);
  };
  useEffect(() => () => { clearTimeout(hoverTimer.current); joinCancel.current?.(); }, []);

  // A press outside, Escape, or focus moving elsewhere closes it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && root.current?.contains(event.target)) return;
      setNow(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const inside = root.current?.contains(document.activeElement) ?? false;
      setNow(false);
      if (inside) trigger.current?.blur();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const close = useCallback(() => setNow(false), [setNow]);

  // Open, the song is one press from its page: fetch it and its scripts now, so the page opens out of
  // the island the moment it is pressed, carousel and all (scripts/warm.ts).
  useEffect(() => { if (open) warm(musicPage); }, [open]);

  // When a touch on the trigger closed the island (its click is then spent).
  const pressClosed = useRef<number | null>(null);

  // The meters hold their bars while the island opens or closes (LiveMeter's `hold`).
  const meterHold = useRef(0);
  useEffect(() => { meterHold.current = performance.now() + 500; }, [open]);

  const playing = playback.kind === 'playing';
  // While the song isn't playing, the closed island keeps a bubble with a note to invite a press.
  const nudge = useIslandNudge();
  // Closing without the song, the island draws in to the bare pill and the bubble buds off it again
  // as it first did (the split), rather than splitting off the shrinking card (`collapseSplit`, iOS's
  // expanded-to-split): there the bubble came out of the card's top corner while it was still tall,
  // and the neck between them appeared all at once as the card came down to capsule height.
  const [budAgain, setBudAgain] = useState(false);
  const wasOpen = useRef(open);
  const budTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const closed = wasOpen.current && !open;
    wasOpen.current = open;
    if (!closed) return;
    // Its own timer, which nothing else cancels: a bubble held back for good would never come back.
    clearTimeout(budTimer.current);
    setBudAgain(true);
    budTimer.current = window.setTimeout(() => setBudAgain(false), budAfterClose);
  }, [open]);
  useEffect(() => () => clearTimeout(budTimer.current), []);
  const bubble = budAgain ? null : nudge;
  bubbleOut.current = !open && !playing && nudge !== null;
  const presentation: IslandPresentation = open
    ? {
        kind: 'expanded',
        // The song is the way to its page: the cover and the title are each a link to it.
        leading: <a className="island-nav__song" href={musicPage} aria-label={`${song.title} by ${song.artist}: my music`} onClick={close}><PlayerCover seed={seed} src={song.cover} /></a>,
        center: <a className="island-nav__song" href={musicPage} tabIndex={-1} aria-hidden="true" onClick={close}><PlayerTitle title={song.title} artist={song.artist} /></a>,
        trailing: <LiveMeter audio={sound} color={tone} size="expanded" hold={meterHold} />,
        bottom: (
          <div className="island-nav__bottom">
            <PlayerControls playback={playback} duration={song.duration} onToggle={toggle} onSeek={seek} />
            <nav className="island-nav__links" aria-label="Primary">
              {links.map((l) => (
                <a key={l.href} className="island-nav__link" href={`${home}${l.href}`} onClick={close}>{l.label}</a>
              ))}
            </nav>
          </div>
        ),
      }
    : playing
      ? {
          kind: 'compact',
          leading: <Artwork seed={seed} src={song.cover} size={22} radius={6} />,
          trailing: <LiveMeter audio={sound} color={tone} size="compact" hold={meterHold} />,
        }
      : bubble ?? { kind: 'idle' };

  const dark = luma(backdrop) < 80;

  return (
    <div
      ref={root}
      className="island-nav"
      data-island-nav=""
      data-open={open || undefined}
      data-dark={dark || undefined}
      data-nudge={!open && !playing && nudge ? '' : undefined}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse' && fine.current) setSoon(true, hoverOpenDelay); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse' && fine.current) setSoon(false, hoverCloseDelay); }}
      onBlur={(e) => { if (!root.current?.contains(e.relatedTarget as Node | null)) setNow(false); }}
    >
      <button
        ref={trigger}
        className="island-nav__hit"
        type="button"
        aria-label={`Menu. ${playing ? 'Playing' : 'Paused'}: ${song.title} by ${song.artist}`}
        aria-expanded={open}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return;
          // Open, a touch on it closes it as it lands, as a touch outside does, rather than swelling
          // the card first and closing on the lift; the click that follows is spent.
          if (open) { pressClosed.current = e.timeStamp; setNow(false); return; }
          // On the bubble, it swells as the stack's bubble does under a finger, and the island opens
          // out of it when the touch lifts.
          if (bubbleOut.current && e.clientX - innerWidth / 2 > bubbleFrom) {
            bubblePressAt.current = defaultClock().now();
            setBubblePressed(true);
            return;
          }
          setPressed(true);
        }}
        onPointerUp={() => setPressed(false)}
        onPointerCancel={() => { setPressed(false); if (!joinCancel.current) clearJoin(); }}
        onPointerLeave={(e) => { setPressed(false); if (e.pointerType !== 'mouse' && !joinCancel.current) clearJoin(); }}
        onClick={(e) => {
          const spent = pressClosed.current;
          pressClosed.current = null;
          if (spent !== null && e.timeStamp - spent < 1000) return;
          // A mouse that hovers has already opened it; a click then keeps it open.
          if (e.detail > 0 && fine.current) { setNow(true); return; }
          setNow((v) => !v);
        }}
        onFocus={(e) => { if (e.target.matches(':focus-visible')) setNow(true); }}
      />
      {/* After the button, so Tab goes from it into the links. */}
      <IslandView
        presentation={presentation}
        placement="viewport"
        label="Navigation and music"
        pressTarget={bubblePressed ? 'bubble' : pressed ? 'pill' : null}
        pressStyle={bubblePressed ? 'swell' : 'squish'}
        joining={joining}
        backdrop={backdrop}
        metrics={metrics}
        motion={motion}
      />
    </div>
  );
};

export default IslandNav;
