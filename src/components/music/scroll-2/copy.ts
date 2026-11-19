/**
 * Music, way scroll-2: what the page says after the ring of records. The owner's words, and nothing
 * more: in his spare time he plays the guitar and the bass, not very well; he is trying to learn the
 * piano (trying, not playing it); and he likes to experiment in FL Studio with his Akai MPK Mini
 * (experimenting, not making songs).
 */
export const playingCopy = {
  /** The chapter's name, small, as "On vinyl" is over the records. */
  eyebrow: 'Playing',
  title: 'Guitar and bass.',
  lede: 'I play both in my spare time, though not very well.',
  /** Over each neck, so the drawing says which is which. */
  guitar: 'Guitar',
  bass: 'Bass',
  piano: 'I’m also trying to learn the piano.',
  /** Over the keys: the right hand's fingering for the scale they show, the first thing a learner reads. */
  pianoNote: 'C major, right hand',
  studio: 'And I like to experiment in FL\u00a0Studio with my Akai MPK\u00a0Mini.',
  /** The model's credit (CC BY asks for it where the work is shown). */
  credit: {
    title: 'AKAI MPK Mini',
    author: 'cooper',
    source: 'https://sketchfab.com/3d-models/akai-mpk-mini-f7a837c9b469472084940ab3d6609eb2',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
} as const;
