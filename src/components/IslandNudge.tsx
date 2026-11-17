import { useEffect, useState } from 'react';

import { Glyph } from '@/components/islandcn/glyph';
import { MusicGlyph } from '@/components/islandcn/glyphs';
import { islandAccent } from '@/components/islandcn/theme';
import type { IslandPresentation } from '@/lib/island';

/**
 * The island's invitation to be pressed. The song no longer starts on a tap anywhere on the page
 * (island-audio.ts), and the island rests as the bare pill until the visitor plays it, so nothing
 * would say there is a song. A moment after the page has settled the island buds a second bubble
 * with a music note in it, as iOS does when a second activity starts. It stays whenever the song
 * isn't playing: the island opened and closed again (a hover, a tap) or the song paused brings it
 * back; only while the song plays does the island show the cover and the meter instead.
 *
 * The note is islandcn's music companion (examples/demo-stage.tsx upstream): its music glyph, at
 * the compact glyph size, in its pink. The bubble buds off on the engine's split, the motion iOS
 * uses for a second activity (geometry.ts sends idle to minimal through it).
 */

/** After the page has settled: a bubble that comes with the page's own entrance is lost in it. */
const budDelay = 1400;

const bubble: IslandPresentation = {
  kind: 'minimal',
  attached: null,
  detached: <Glyph icon={MusicGlyph} color={islandAccent.pink} />,
};

/**
 * The bubble, from a moment after the island first mounts (it stays mounted for the whole visit,
 * Island.astro), or null before then. IslandNav shows it whenever the island is closed and the song
 * isn't playing.
 */
export const useIslandNudge = (): IslandPresentation | null => {
  const [out, setOut] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setOut(true), budDelay);
    return () => clearTimeout(timer);
  }, []);
  return out ? bubble : null;
};
