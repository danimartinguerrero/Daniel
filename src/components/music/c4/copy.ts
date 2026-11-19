/**
 * Music, way c4: the words of the page's continuation. The facts are the owner's: he plays guitar and
 * bass, not very well, and in his spare time he makes beats with FL Studio and an Akai MPK Mini.
 */
export const made = {
  /** The last passage in the middle of the ring, before the records are cut into a new one. */
  bridge: 'I make music too.',
  /** The two sides of the record that comes out of the new sleeve: the letter and the lettering round
      its label (set at `size`, and spaced to go once round), and what it says under the record. */
  sides: [
    { side: 'A', ring: 'GUITAR · BASS · NOT VERY WELL · GUITAR · BASS · NOT VERY WELL ·', size: 5.4, text: 'I play guitar and bass, though not very well.' },
    { side: 'B', ring: 'BEATS · FL STUDIO · AKAI MPK MINI ·', size: 7.2, text: 'In my spare time I make beats with FL Studio and an Akai MPK Mini.' },
  ],
  /** Its name under the ring, once it lies among the others. */
  caption: { title: 'Guitar, bass and beats', meta: 'Mine, still in the making' },
} as const;
