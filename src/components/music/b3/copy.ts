/**
 * The words of version b3: the back of a record sleeve. Written through the humanizer skill; facts only
 * from the brief. Side A is computed from the records in src/data/music.ts, so it stays true when a
 * record is added; nothing about the collection is typed in here.
 */
import { vinyls } from '@/data/music';

/** How many discs a format holds: "2×LP" is two, "LP" one. */
const discs = (format: string) => Number(/^(\d+)\s*×/.exec(format)?.[1] ?? 1);

const years = vinyls.map((v) => v.year);
const labels = [...new Set(vinyls.flatMap((v) => v.label.split(',').map((l) => l.trim())))].sort((a, b) =>
  a.localeCompare(b, 'en', { sensitivity: 'base' }),
);
const list = (items: readonly string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

export const collection = {
  albums: vinyls.length,
  discs: vinyls.reduce((n, v) => n + discs(v.format), 0),
  tracks: vinyls.reduce((n, v) => n + v.tracks.length, 0),
  first: Math.min(...years),
  last: Math.max(...years),
  labels,
};

export const copy = {
  eyebrow: 'Turn it over',
  title: 'The other side.',
  sideA: {
    name: 'Side A',
    what: 'What I listen to',
    /** The accessible name of a row, which turns the carousel to that record. */
    show: (title: string) => `Show ${title} in the records above`,
  },
  sideB: {
    name: 'Side B',
    what: 'What I play and make',
    /** The right-hand column holds what a sleeve would print as durations: here, the honest aside. */
    tracks: [
      { title: 'Guitar', aside: 'Not very well' },
      { title: 'Bass', aside: 'Same' },
      { title: 'Beats', credit: 'FL Studio, Akai MPK Mini', aside: 'Spare time' },
    ],
  },
  /** The small print along the foot of the sleeve. */
  foot: {
    /** Where a sleeve prints the running time of a side, the size of Side A. */
    total: `Side A: ${collection.albums} albums on ${collection.discs} discs, ${collection.tracks} tracks`,
    lines: [
      'Beats made in FL Studio with an Akai MPK Mini, a small MIDI keyboard with pads.',
      `The records on Side A first came out between ${collection.first} and ${collection.last}, on ${list(collection.labels)}.`,
    ],
  },
} as const;
