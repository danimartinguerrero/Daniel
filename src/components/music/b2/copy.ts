/** The words of version b2. Written through the humanizer skill; facts only from the brief. */

/**
 * The block under the records is said in statements, one paragraph each. A statement is made of parts;
 * `line` starts a part on a line of its own, so its words reach the reading line later than the setup
 * and the turn lands a beat after it
 * ('wide': only where the screen is wide enough for the part to fit on one line). Words joined by a
 * no-break space are one word, so a name never breaks across lines. `note` is a small gloss under the
 * last statement.
 */
export interface Part { text: string; line?: boolean | 'wide' }
export interface Statement { id: string; parts: Part[] }

export const statements: Statement[] = [
  {
    id: 'play',
    parts: [
      { text: 'I play guitar and bass.' },
      { text: 'Not very well.', line: true },
    ],
  },
  {
    id: 'beats',
    parts: [
      { text: 'In my spare time,' },
      { text: 'I make beats.', line: true },
    ],
  },
  {
    id: 'gear',
    parts: [
      { text: 'I make them in FL\u00a0Studio,' },
      { text: 'on an Akai\u00a0MPK\u00a0Mini.', line: 'wide' },
    ],
  },
];

export const note = 'An MPK\u00a0Mini is a small MIDI keyboard with pads.';
