import { useCallback, useEffect, useRef, useState } from 'react';

import { Artwork } from '@/components/islandcn/artwork';
import { PlayerControls, PlayerCover, PlayerMeter, PlayerTitle, type PlaybackState } from '@/components/islandcn/now-playing-activity';
import { IslandView, islandMetrics, type IslandMetricsOverrides, type IslandPresentation } from '@/lib/island';

/**
 * The navigation as the island, drawn by the islandcn engine (src/lib/island), with a song in it.
 * At rest it is compact, a cover and a level meter, as a music player's island is. Hovered (fine
 * pointers), tapped (touch) or focused, it opens into islandcn's expanded player (cover, title,
 * meter, times and play/pause) with the links below, and closes when left. The engine solves the
 * springs, the shape and the crossfades; this file decides when it is open and what it holds.
 */
const links = [
  { href: '#projects', label: 'Projects' },
  { href: '#studies', label: 'Studies' },
  { href: '#how-i-work', label: 'How I work' },
  { href: '#contact', label: 'Contact' },
] as const;

const song = { title: 'Feather', artist: 'Nujabes', src: '/audio/feather.m4a', cover: '/audio/modal-soul.jpg', duration: 176_500 } as const;
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

/** The player and the links need more room than the engine's 180 pt cap. */
const metrics = { expanded: { maxHeight: 300 } } as const satisfies IslandMetricsOverrides;

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

export const IslandNav = () => {
  const [open, setOpen] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [backdrop, setBackdrop] = useState<string | undefined>(undefined);
  const root = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const fine = useRef(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>({ kind: 'paused', position: 0 });

  // The player follows the audio element, whatever started or stopped it.
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const playing = () => setPlayback({ kind: 'playing', startedAt: Date.now() - el.currentTime * 1000 });
    const paused = () => setPlayback({ kind: 'paused', position: el.currentTime * 1000 });
    const ended = () => { el.currentTime = 0; setPlayback({ kind: 'paused', position: 0 }); };
    const seeked = () => (el.paused ? paused() : playing());
    el.addEventListener('playing', playing);
    el.addEventListener('pause', paused);
    el.addEventListener('ended', ended);
    el.addEventListener('seeked', seeked);
    return () => {
      el.removeEventListener('playing', playing);
      el.removeEventListener('pause', paused);
      el.removeEventListener('ended', ended);
      el.removeEventListener('seeked', seeked);
    };
  }, []);

  const toggle = useCallback(() => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  }, []);

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
    return () => {
      clearTimeout(settle);
      removeEventListener('scroll', sense);
      removeEventListener('resize', sense);
    };
  }, []);

  // Every open and close goes through here, so a pending hover change never overrides a click,
  // a key or a link.
  const hoverTimer = useRef<number | undefined>(undefined);
  const setNow = useCallback((next: boolean | ((v: boolean) => boolean)) => {
    clearTimeout(hoverTimer.current);
    setOpen(next);
  }, []);
  const setSoon = (next: boolean, ms: number) => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setOpen(next), ms);
  };
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

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

  const playing = playback.kind === 'playing';
  const presentation: IslandPresentation = open
    ? {
        kind: 'expanded',
        leading: <PlayerCover seed={seed} src={song.cover} />,
        center: <PlayerTitle title={song.title} artist={song.artist} />,
        trailing: <PlayerMeter color={tone} size="expanded" active={playing} />,
        bottom: (
          <div className="island-nav__bottom">
            <PlayerControls playback={playback} duration={song.duration} onToggle={toggle} />
            <nav className="island-nav__links" aria-label="Primary">
              {links.map((l) => (
                <a key={l.href} className="island-nav__link" href={l.href} onClick={close}>{l.label}</a>
              ))}
            </nav>
          </div>
        ),
      }
    : {
        kind: 'compact',
        leading: <Artwork seed={seed} src={song.cover} size={22} radius={6} />,
        trailing: <PlayerMeter color={tone} size="compact" active={playing} />,
      };

  const dark = luma(backdrop) < 80;

  return (
    <div
      ref={root}
      className="island-nav"
      data-island-nav=""
      data-open={open || undefined}
      data-dark={dark || undefined}
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
        onPointerDown={(e) => { if (e.pointerType !== 'mouse') setPressed(true); }}
        onPointerUp={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onClick={(e) => {
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
        pressed={pressed}
        backdrop={backdrop}
        metrics={metrics}
      />
      <audio ref={audio} src={song.src} preload="none" />
    </div>
  );
};

export default IslandNav;
