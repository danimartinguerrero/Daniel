import covers from './music-covers.json';
import { vinyls as collection } from './music';

export { musicCopy } from './music';

const motifs = ['horizon', 'bands', 'arcs', 'grid', 'dots', 'waves', 'sun', 'rings'] as const;

export const vinyls = collection.map((record, index) => {
  const cover = Object.hasOwn(covers, record.id) ? covers[record.id as keyof typeof covers] : undefined;
  const accent = cover?.label ?? '#949292';
  return {
    ...record,
    palette: ['#171719', cover?.tone === 'light' ? '#605958' : '#38363b', '#e9e5df', accent] as const,
    motif: motifs[index % motifs.length]!,
    tracks: record.tracks.map(track => typeof track === 'string' ? track : `${track.title} (feat. ${track.feat})`),
  };
});

export type Vinyl = (typeof vinyls)[number];
