/**
 * Sketch s2/a, "Vellum": the names printed on each record, worked out from data/music.ts. A name is
 * the artist, everyone featured on a track, and each label. Every name gets one fixed place in a
 * single run of text shared by all the sheets, so a name on several records lands on the same spot on
 * each of their sheets and overprints there.
 */
import { vinyls, type Vinyl } from '@/data/music';

export type Kind = 'artist' | 'guest' | 'label';
export interface Name { text: string; kind: Kind; on: Set<string> }

const split = (s: string, commas: boolean) =>
  s.split(commas ? /,\s*|\s*&\s*/ : /\s*&\s*/).map((x) => x.trim()).filter(Boolean);

function collect() {
  const names = new Map<string, Name>();
  const add = (text: string, kind: Kind, v: Vinyl) => {
    const key = text.toLowerCase();
    let n = names.get(key);
    // An artist who is also a guest elsewhere stays an artist.
    if (!n) names.set(key, (n = { text, kind, on: new Set() }));
    else if (kind === 'artist') n.kind = 'artist';
    n.on.add(v.id);
  };
  for (const v of vinyls) {
    for (const a of split(v.artist, false)) add(a, 'artist', v);
    for (const t of v.tracks) if (typeof t !== 'string') for (const g of split(t.feat, true)) add(g, 'guest', v);
    for (const l of split(v.label, true)) add(l, 'label', v);
  }
  // Alphabetical, ignoring a leading "The"/"A", so each record's names are spread across the field
  // rather than bunched, and the overprint reads as a texture of the whole collection.
  const sortKey = (s: string) => s.replace(/^(the|a)\s+/i, '').toLowerCase();
  return [...names.values()].sort((a, b) => sortKey(a.text).localeCompare(sortKey(b.text)));
}

export const names = collect();
