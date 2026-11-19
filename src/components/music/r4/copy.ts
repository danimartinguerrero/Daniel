/**
 * The words on this version of the page. The headline is the site's own (the intro splits it at
 * "music"); the rest is shorter, so the first screen holds the headline, the shelf and the records.
 * The old lede said the song at the top was one of the things I made: it is Nujabes', so it now says so.
 */
export const copy = {
  lede: 'I play guitar and bass, not very well, and make beats in my spare time. The song at the top of the page is Feather, by Nujabes.',
  shelf: {
    eyebrow: 'On vinyl',
    headline: 'My records.',
    // Two sentences, which a phone sets on two lines.
    lede: ['The albums I own on vinyl.', 'Pick one and unwrap it.'],
  },
} as const;
