/** The words of version b1. Written through the humanizer skill; facts only from the brief. */

/** Counts in a sentence read as words up to twenty; above that they stay digits. */
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
export const inWords = (n: number) => WORDS[n] ?? String(n);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const copy = {
  /** Over the grid, in the style of "My records.", carrying on from the lede ("And I love making things with it"). */
  heading: 'Off the record.',
  beats: {
    title: 'In my spare time I make beats in FL Studio.',
    /** Under the drawing: what it is, so nobody takes it for one of mine. */
    caption: 'A pattern, drawn the way FL Studio’s channel rack shows one.',
    /** The channel rack's four default channels, top to bottom. */
    channels: ['Kick', 'Clap', 'Hat', 'Snare'],
    drawingLabel: 'A drawing of a drum pattern in FL Studio’s channel rack: four rows of sixteen steps, some of them lit.',
  },
  play: {
    title: 'I play guitar and bass.',
    honest: 'Not very well.',
  },
  gear: {
    line: 'My controller is an Akai MPK Mini.',
    gloss: 'It’s a small MIDI keyboard with pads.',
  },
  shelf: {
    line: (n: number, from: number, to: number) =>
      `${capital(inWords(n))} ${n === 1 ? 'record' : 'records'}, ${from === to ? `all from ${from}` : `from ${from} to ${to}`}.`,
    coversLabel: 'The covers, oldest first',
  },
  artist: {
    line: (count: number, total: number, artist: string) => `${capital(inWords(count))} of the ${inWords(total)} are by ${artist}.`,
  },
} as const;
