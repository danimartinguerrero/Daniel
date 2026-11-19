/**
 * Music, way scroll-3: what the page says after the ring of records. The owner's own words, and only
 * these: in his spare time he plays the guitar and the bass, not very well; he is trying to learn the
 * piano; he likes to experiment in FL Studio with his Akai MPK Mini. "Not very well" is about the
 * guitar and the bass only. The piano is something he is learning, not something he plays, and FL
 * Studio is where he experiments, not where he makes finished songs: the sentences keep both apart.
 */
export const playingCopy = {
  eyebrow: 'In my spare time',
  /** One sentence for each thing, read in this order, each followed by a drawing of what it names. */
  strings: 'I play the guitar and the bass, but not very well.',
  piano: 'I’m also trying to learn the piano.',
  controller: 'And I like to experiment in FL Studio with my Akai MPK Mini.',
  /** The two necks look alike to most people: each is named over its drawing. */
  labels: { guitar: 'Guitar', bass: 'Bass' },
} as const;
