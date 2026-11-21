import { useEffect, useState } from 'react';

import type { IslandPresentation } from '@/lib/island';

/**
 * The island's film companion bubble: a detached circular orb beside the resting pill that links
 * straight to /cine. A moment after the page has settled it buds off the pill on the engine's
 * split, as iOS buds a second activity.
 */

/** After the page has settled: a bubble that comes with the page's own entrance is lost in it. */
const budDelay = 1400;

const FilmIcon = () => (
  <span className="island-nav__cine-icon" aria-hidden="true">
    <svg width="21" height="21" viewBox="0 0 24 24" fill="#fff" fillRule="evenodd">
      {/* A strip of film: two frames between two rows of perforations. */}
      <path d="M5.5 3h13A2.5 2.5 0 0 1 21 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-13A2.5 2.5 0 0 1 5.5 3ZM8.25 5.25v5.6h7.5v-5.6Zm0 7.9v5.6h7.5v-5.6ZM4.9 5.6v1.8h1.6V5.6Zm0 3.8v1.8h1.6V9.4Zm0 3.4v1.8h1.6v-1.8Zm0 3.8v1.8h1.6v-1.8Zm12.6-11v1.8h1.6V5.6Zm0 3.8v1.8h1.6V9.4Zm0 3.4v1.8h1.6v-1.8Zm0 3.8v1.8h1.6v-1.8Z" />
    </svg>
  </span>
);

const bubble: IslandPresentation = {
  kind: 'minimal',
  attached: null,
  detached: <FilmIcon />,
};

/**
 * The film bubble, from a moment after the island first mounts (it stays mounted for the whole
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
