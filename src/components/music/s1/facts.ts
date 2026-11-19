/**
 * s1: what the sketches say about the collection, worked out from data/music.ts when the page is
 * built, so it stays true when a record is added. Nothing here is typed in.
 */
import { vinyls, type Track } from '@/data/music';
import covers from '@/data/music-covers.json';

const discsOf = (format: string) => {
  const m = /^(\d+)×/.exec(format);
  return m ? Number(m[1]) : 1;
};

export const records = vinyls.length;
export const discs = vinyls.reduce((n, v) => n + discsOf(v.format), 0);
export const doubles = vinyls.filter((v) => discsOf(v.format) === 2).length;
export const tracks = vinyls.reduce((n, v) => n + v.tracks.length, 0);
export const firstYear = Math.min(...vinyls.map((v) => v.year));
export const lastYear = Math.max(...vinyls.map((v) => v.year));

/** The artist with the most records, and how many. */
const byArtist = new Map<string, number>();
for (const v of vinyls) byArtist.set(v.artist, (byArtist.get(v.artist) ?? 0) + 1);
export const [topArtist, topArtistCount] = [...byArtist].sort((a, b) => b[1] - a[1])[0]!;

const feats = (t: Track) => (typeof t === 'string' ? [] : t.feat.split(/, | & /));
/** Everyone credited as a guest on a track, once each. */
export const guests = new Set(vinyls.flatMap((v) => v.tracks.flatMap(feats)));

/** The record with the most tracks. */
export const longest = [...vinyls].sort((a, b) => b.tracks.length - a.tracks.length)[0]!;

/** A record's label colour (worked out from its cover by scripts/album-covers.mjs). */
export const labelColour = (id: string) => (covers as Record<string, { label: string }>)[id]?.label ?? '#444';
export const recordOf = (year: number) => vinyls.find((v) => v.year === year)!;
