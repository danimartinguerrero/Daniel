import { useEffect, useState } from 'react';

import type { IslandPresentation } from '@/lib/island';

/**
 * The island's music companion bubble: a detached circular orb beside the resting pill that links
 * straight to /music. A moment after the page has settled it buds off the pill on the engine's
 * split, as iOS buds a second activity.
 */

/** After the page has settled: a bubble that comes with the page's own entrance is lost in it. */
const budDelay = 1400;

const MusicIcon = () => (
  <span className="island-nav__music-icon" aria-hidden="true">
    <svg width="21" height="21" viewBox="0 0 24 24" fill="#fff">
      <path d="M8.6 6.7 Q8.6 5.4 9.9 5.15 L18.7 3.45 Q20.0 3.2 20.0 4.5 L20.0 16.0 L18.1 16.0 L18.1 7.67 Q18.1 7.07 17.5 7.19 L11.1 8.42 Q10.5 8.53 10.5 9.13 L10.5 18.0 L8.6 18.0 Z" />
      <ellipse cx="7.15" cy="18.15" rx="3.45" ry="2.55" transform="rotate(-16 7.15 18.15)" />
      <ellipse cx="16.65" cy="16.25" rx="3.45" ry="2.55" transform="rotate(-16 16.65 16.25)" />
    </svg>
  </span>
);

const bubble: IslandPresentation = {
  kind: 'minimal',
  attached: null,
  detached: <MusicIcon />,
};

/**
 * The music bubble, from a moment after the island first mounts (it stays mounted for the whole
 * visit, Island.astro), or null before then. IslandNav shows it whenever the island is closed.
 */
export const useIslandNudge = (): IslandPresentation | null => {
  const [out, setOut] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setOut(true), budDelay);
    return () => clearTimeout(timer);
  }, []);
  return out ? bubble : null;
};
