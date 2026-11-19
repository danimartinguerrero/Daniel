/** The words of version b4. Written through the humanizer skill; facts only from the brief. Anything
 * about the collection (years, counts) is worked out from src/data/music.ts in Below.astro, so these
 * are functions of what the data says, not typed-in numbers. */

const words = ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];
/** A count as a word, while that reads well; past twenty the figure. */
export const count = (n: number) => words[n] ?? String(n);

export const copy = {
  /** The section's heading, from the oldest record's year. */
  headline: (first: number) => `From ${first} to now.`,
  /** Under each run of records that came out close together. */
  run: (n: number, from: number, to: number) => (from === to ? `${count(n)} from ${from}` : `${count(n)} from ${from} to ${to}`),
  now: 'Now',
  /** The end of the line: what I do myself, in the same title-and-line form as a record. The names
      are held together with no-break spaces so a line never breaks inside one. */
  me: [
    { title: 'Guitar and bass', line: 'I play both, not very well.' },
    { title: 'Beats', line: 'In my spare time I make them in FL\u00a0Studio, with an Akai\u00a0MPK\u00a0Mini.' },
  ],
  /** For screen readers: what a cover on the line does. */
  pick: (title: string, artist: string, year: number) => `${title} by ${artist}, ${year}. Show it in my records`,
  label: 'My records by year, and what I do now',
} as const;
