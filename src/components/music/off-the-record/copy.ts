/**
 * Music, way "Off the record": what the page says after the ring of records. The owner's own words and
 * nothing more: in his spare time he plays the guitar and the bass, though not very well; he is trying
 * to learn the piano (learning it, not playing it); he likes to experiment in FL Studio with his Akai
 * MPK Mini (experimenting, not making finished songs). Each plate says one of those and only that.
 */
export const offTheRecordCopy = {
  eyebrow: 'In my spare time',
  headline: 'Off the record.',
  lede: 'What I do with music when I’m not listening to it.',
  /** The control under the plates, and what a screen reader calls the set. */
  label: 'What I play',
  back: 'Back to my records',
  plates: [
    {
      id: 'guitar',
      tab: 'Guitar',
      /** The plate's word, one line per entry. */
      word: ['Guitar.'],
      status: 'Not very well',
      text: 'I play it in my spare time, though not very well.',
      /** The dot on the status: one of the colours of “music.” at the top of the page. */
      hue: '#f5821f',
    },
    {
      id: 'bass',
      tab: 'Bass',
      word: ['Bass.'],
      status: 'Not very well either',
      text: 'The bass too. I play it, just not much better.',
      hue: '#e03a3e',
    },
    {
      id: 'piano',
      tab: 'Piano',
      word: ['Piano.'],
      status: 'Learning',
      text: 'I’m trying to learn it.',
      hue: '#963d97',
    },
    {
      id: 'studio',
      tab: 'FL Studio',
      word: ['FL', 'Studio.'],
      status: 'Experimenting',
      text: 'I like to experiment in FL Studio with my Akai MPK Mini.',
      hue: '#009ddc',
    },
  ],
} as const;
