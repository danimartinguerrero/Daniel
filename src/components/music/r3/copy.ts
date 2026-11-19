/**
 * Music, direction 3: the page's words. The headline stays as the site has it (the intro splits it at
 * "music"); the rest is tightened for a page that sets the collection out as type.
 */
import { musicCopy, vinyls } from '@/data/music';

const years = vinyls.map((v) => v.year);
const first = Math.min(...years);
const last = Math.max(...years);
const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const count = words[vinyls.length] ?? String(vinyls.length);

export const r3Copy = {
  headline: musicCopy.headline,
  lede: musicCopy.lede,
  shelf: {
    eyebrow: musicCopy.shelf.eyebrow,
    headline: musicCopy.shelf.headline,
    // The count and the range are worked out from the records, so they stay true as the shelf changes.
    lede: `The ${count} albums I own on vinyl, from ${first} to ${last}. Pick one and unwrap it.`,
  },
  /** What a spine in the stack says to a screen reader when pressed. */
  show: (title: string, artist: string) => `Show ${title} by ${artist}`,
} as const;
