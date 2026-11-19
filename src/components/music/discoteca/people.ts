/**
 * Discoteca: what the floor says about the collection, worked out from data/music.ts so it stays true
 * when a record is added. Nothing here is written by hand.
 *
 * - The records in the order they came out (a tie keeps the shelf's order).
 * - The people on more than one record: whoever the record is by, and everyone a track names as a
 *   guest ("feat."). On the shelf as it is that is Kendrick Lamar (his three albums, and his verse on
 *   "Like That"), Anna Wise and Pink Floyd. A band is one name; a duo ("Future & Metro Boomin") is two.
 */
import { vinyls, type Vinyl } from '@/data/music';

export interface Person {
  name: string;
  /** Indexes into `vinyls` (the shelf's order, which is the carousel's), oldest record first. */
  records: number[];
  /** What the person does on each of those records, a line each: the album's title when it is theirs,
      the songs and the album when they are a guest on it. */
  lines: string[];
}

/** Indexes into `vinyls`, oldest first. */
export const byYear: number[] = vinyls.map((_, i) => i).sort((a, b) => vinyls[a]!.year - vinyls[b]!.year || a - b);

// A guest credit names several people as "A, B & C"; a record's artist is split only at " & ", since a
// name can hold a comma ("Tyler, the Creator").
const guests = (feat: string) => feat.split(/, | & /).map((s) => s.trim()).filter(Boolean);
const artists = (v: Vinyl) => v.artist.split(' & ').map((s) => s.trim());

function gather(): Person[] {
  const found = new Map<string, Map<number, string[]>>(); // name → record → songs (empty: the record is theirs)
  const on = (name: string, i: number) => {
    let recs = found.get(name);
    if (!recs) found.set(name, (recs = new Map()));
    let songs = recs.get(i);
    if (!songs) recs.set(i, (songs = []));
    return songs;
  };
  vinyls.forEach((v, i) => {
    for (const a of artists(v)) on(a, i).length = 0;
    for (const t of v.tracks) {
      if (typeof t === 'string') continue;
      for (const g of guests(t.feat)) {
        const songs = on(g, i);
        // A guest who is also the record's artist is on it as the artist.
        if (!artists(v).includes(g)) songs.push(t.title);
      }
    }
  });
  const quote = (s: string) => `“${s}”`;
  const list = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
  const people: Person[] = [];
  for (const [name, recs] of found) {
    if (recs.size < 2) continue;
    const records = byYear.filter((i) => recs.has(i));
    const lines = records.map((i) => {
      const songs = recs.get(i)!;
      const title = vinyls[i]!.title;
      return songs.length ? `${list(songs.map(quote))} on ${title}` : title;
    });
    people.push({ name, records, lines });
  }
  // The person on the most records first; then by name.
  return people.sort((a, b) => b.records.length - a.records.length || a.name.localeCompare(b.name));
}

export const people: Person[] = gather();
