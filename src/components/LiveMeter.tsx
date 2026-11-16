import { useEffect, useRef } from 'react';

import type { IslandAudio } from './island-audio';

interface LiveMeterProps {
  /** Where the levels come from. */
  audio: IslandAudio | null;
  /** Bar colour. */
  color: string;
  /** "compact" is 17 pt tall in the pill; "expanded" 20 pt in the card's top corner, set in as islandcn's player sets it. */
  size: 'compact' | 'expanded';
  /**
   * performance.now() until which the bars hold still: the island's open and close. While the
   * shape moves the meter is blurred and scaled with its content, and a bar that moves inside a
   * blurred layer has the whole layer drawn and blurred again, every frame. Defaults to never.
   */
  hold?: { readonly current: number };
}

/** islandcn's player meter: six bars 2.4 wide and 1.9 apart. */
const bars = 6;
const barWidth = 2.4;
const gap = 1.9;
/** Where a bar rests with no sound, as islandcn's meter rests. */
const rest = 0.18;

/**
 * The player's level meter, drawn as islandcn draws it, but following the song's real spectrum:
 * each bar is one band, low to high. Levels are written straight to the bars every frame, so the
 * island never re-renders for them.
 */
export const LiveMeter = ({ audio, color, size, hold }: LiveMeterProps) => {
  const row = useRef<HTMLSpanElement | null>(null);
  const height = size === 'compact' ? 17 : 20;

  useEffect(() => {
    const el = row.current;
    if (!audio || !el) return;
    const children = [...el.children] as HTMLElement[];
    // A meter that arrives with the island takes the song's levels once, then holds them too.
    let shown = false;
    return audio.subscribe((levels) => {
      if (shown && hold && performance.now() < hold.current) return;
      shown = true;
      for (let i = 0; i < children.length; i++) {
        children[i].style.transform = `scaleY(${(rest + (1 - rest) * (levels[i] ?? 0)).toFixed(3)})`;
      }
    });
  }, [audio, hold]);

  const meter = (
    <span ref={row} aria-hidden style={{ display: 'flex', alignItems: 'center', gap, height, flex: 'none' }}>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          style={{ display: 'block', width: barWidth, height, borderRadius: barWidth, background: color, transform: `scaleY(${rest})`, transformOrigin: '50% 50%' }}
        />
      ))}
    </span>
  );
  return size === 'compact' ? meter : <div style={{ paddingRight: 8.2, paddingTop: 8.3 }}>{meter}</div>;
};
