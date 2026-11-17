/**
 * Design 4, "Listening bar": the sleeve is the album's real front cover, public/img/music/<id>.webp.
 * What the page needs from each cover's colours (the tone under the tear tape, the disc label's colour)
 * is worked out with the images by scripts/album-covers.mjs and kept in data/music-covers.json.
 * No ids in the markup, so the same sleeve can be cloned into the pulled-out record.
 */
import type { Vinyl } from '@/data/music';
import covers from '@/data/music-covers.json';

type Look = { tone: 'light' | 'dark'; label: string };
const look = (v: Vinyl): Look => {
  const c = (covers as Record<string, Look>)[v.id];
  if (!c) throw new Error(`No cover for "${v.id}": run scripts/album-covers.mjs`);
  return c;
};

export function sleeveImg(v: Vinyl): string {
  return `<img src="/img/music/${v.id}.webp" width="800" height="800" alt="" decoding="async" draggable="false">`;
}

/** Whether the cover is light or dark where the tear strip crosses it. */
export const stripTone = (v: Vinyl) => look(v).tone;

/** The colour of the disc's centre label. */
export const labelColor = (v: Vinyl) => look(v).label;
