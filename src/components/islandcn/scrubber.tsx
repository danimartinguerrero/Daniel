"use client";

/*
 * Local addition (personal site), not part of islandcn: upstream's player bar only shows progress
 * (`TimeProgress`). This is the same bar, drawn by the kit's `LinearProgress`, that can also be
 * dragged, tapped and keyed to seek.
 */
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";

import { IslandStyle } from "./island-style";
import { LinearProgress, type PlayheadSource } from "./linear-progress";
import { formatClock } from "./ticking-time";

interface ScrubberProps {
  /** Where the playhead is. */
  source: PlayheadSource;
  /** The whole length in ms. */
  duration: number;
  /** Fill colour. */
  color: string;
  /** Unfilled colour. */
  track: string;
  /** Bar height in pt at rest; it grows by two thirds while held. */
  height: number;
  /** Called once with the chosen position (ms) when a drag ends, a tap lands or a key moves it. */
  onSeek: (ms: number) => void;
  /**
   * Called with the position the bar is holding: the one under the finger while dragging, and the
   * chosen one after the lift until the song is there. Called with null when the bar is the song's
   * again. Whatever reads the time beside the bar shows the same place as the bar, all the way.
   */
  onScrub?: (ms: number | null) => void;
}

/** Room above and below the 6 pt bar that still takes the press: a 36 pt target in a 14 pt row. */
const reach = 15;
/** Arrow keys move this far; Page Up and Page Down three times it. */
const step = 5000;

const css = `
.icn-scrub { display: block; position: relative; cursor: pointer; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; outline: none; }
.icn-scrub:focus-visible { outline: 2px solid currentColor; outline-offset: 4px; border-radius: 6px; }
/* The track swells under the finger, as a player's scrubber does, and its fill follows at once. */
.icn-scrub > span > span { transition: height 180ms cubic-bezier(0.23, 1, 0.32, 1), border-radius 180ms cubic-bezier(0.23, 1, 0.32, 1); }
@media (prefers-reduced-motion: reduce) { .icn-scrub > span > span { transition: none; } }
`;

const playheadAt = (source: PlayheadSource, duration: number) =>
  Math.min(duration, Math.max(0, source.kind === "elapsed" ? Date.now() - source.since : source.ms));

/**
 * A track's scrubber. It fills with time like `TimeProgress`; press or drag anywhere along it and
 * the fill follows the pointer, then the song jumps there on release (seeking on every move makes
 * audio stutter). Arrow keys, Page Up/Down, Home and End seek too.
 */
export const Scrubber = ({ source, duration, color, track, height, onSeek, onScrub }: ScrubberProps) => {
  const [position, setPosition] = useState(() => playheadAt(source, duration));
  /** The position under the pointer while held, and after release until the song has caught up. */
  const [scrub, setScrub] = useState<number | null>(null);
  const [held, setHeld] = useState(false);
  const root = useRef<HTMLSpanElement | null>(null);
  const pointer = useRef<number | null>(null);
  /** The latest position under the pointer: a quick tap ends before the state has rendered. */
  const chosen = useRef<number | null>(null);
  const settle = useRef(0);
  /** Where the last key press sent the song, until the song reports it: the next press goes on from there. */
  const keyed = useRef<number | null>(null);
  const key = source.kind === "elapsed" ? `e${source.since}` : `f${source.ms}`;
  const report = useRef(onScrub);
  report.current = onScrub;
  /** Holds the bar at a position, or gives it back to the song, and says so. */
  const hold = (ms: number | null) => {
    setScrub(ms);
    report.current?.(ms);
  };

  useEffect(() => {
    setPosition(playheadAt(source, duration));
    keyed.current = null;
    // The song has moved (the seek landed): the bar is the song's again.
    if (pointer.current === null) {
      window.clearTimeout(settle.current);
      hold(null);
    }
    if (source.kind !== "elapsed") return;
    const timer = window.setInterval(() => setPosition(playheadAt(source, duration)), 500);
    return () => window.clearInterval(timer);
    // `key` holds every field of `source` that matters.
  }, [key, duration]);

  useEffect(() => () => window.clearTimeout(settle.current), []);

  const at = (clientX: number) => {
    const box = root.current?.getBoundingClientRect();
    if (!box || box.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * duration;
  };

  const release = (commit: boolean) => {
    pointer.current = null;
    setHeld(false);
    const ms = chosen.current;
    chosen.current = null;
    if (!commit || ms === null) {
      hold(null);
      return;
    }
    onSeek(ms);
    // Hold the chosen spot until the song reports it, so the fill and the times never dart back in between.
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => hold(null), 1000);
  };

  const onPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // Presses inside island content must not reach the island's own press handling.
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = event.pointerId;
    window.clearTimeout(settle.current);
    const ms = at(event.clientX);
    chosen.current = ms;
    setHeld(true);
    hold(ms);
  };
  const onPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    if (pointer.current !== event.pointerId) return;
    const ms = at(event.clientX);
    chosen.current = ms;
    hold(ms);
  };
  const onPointerUp = (event: PointerEvent<HTMLSpanElement>) => {
    if (pointer.current === event.pointerId) release(true);
  };
  const onPointerCancel = (event: PointerEvent<HTMLSpanElement>) => {
    if (pointer.current === event.pointerId) release(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    // Two quick presses: the second starts where the first is taking the song, not where it still is.
    const now = keyed.current ?? playheadAt(source, duration);
    const to =
      event.key === "ArrowRight" || event.key === "ArrowUp" ? now + step
      : event.key === "ArrowLeft" || event.key === "ArrowDown" ? now - step
      : event.key === "PageUp" ? now + step * 3
      : event.key === "PageDown" ? now - step * 3
      : event.key === "Home" ? 0
      : event.key === "End" ? duration
      : null;
    if (to === null) return;
    event.preventDefault();
    keyed.current = Math.min(duration, Math.max(0, to));
    onSeek(keyed.current);
  };

  const shown = scrub ?? position;
  return (
    <span
      ref={root}
      className="icn-scrub"
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration / 1000)}
      aria-valuenow={Math.round(shown / 1000)}
      aria-valuetext={`${formatClock(shown)} of ${formatClock(duration)}`}
      style={{ padding: `${reach}px 0`, margin: `${-reach}px 0` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      onKeyDown={onKeyDown}
    >
      <IslandStyle id="scrub" css={css} />
      <LinearProgress
        value={duration > 0 ? shown / duration : 0}
        color={color}
        track={track}
        height={held ? Math.round(height * 5) / 3 : height}
        ends="square"
        // Under the finger and on a jump the fill is exact; left alone it glides between half-second ticks.
        glide={scrub === null ? 500 : 0}
      />
    </span>
  );
};
