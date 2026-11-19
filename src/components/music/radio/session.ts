/**
 * Music, way "radio": the session that follows the ring. Once the last passage has gone, the page runs
 * a programme from the same records: one at a time they come up out of the ring and stand in the
 * middle of it, oldest first, each named underneath as a radio presenter names what has just played,
 * and twice the presenter talks between them. Nothing here is new: the order is the records' own years,
 * and the two things said are the owner's own facts (he plays the guitar and the bass, not very well;
 * he makes beats in FL Studio on an Akai MPK Mini).
 *
 * This module is only the running order and its timing, in svh of the page's scroll; climb.ts draws it.
 */
import { vinyls, type Vinyl } from '@/data/music';

export const talk = {
  /** After the rock records of the sixties and seventies, which are guitar and bass records. */
  playing: 'I play the guitar and the bass too, though not very well.',
  /** At the end, after the newest record. */
  beats: 'In my spare time I make beats in FL Studio, on an Akai MPK Mini.',
} as const;

export type Cue =
  | { kind: 'record'; record: Vinyl; start: number; len: number }
  | { kind: 'talk'; key: keyof typeof talk; text: string; start: number; len: number };

/** Oldest first. Two records of the same year keep the shelf's order. */
export const byYear: readonly Vinyl[] = [...vinyls].sort((a, b) => a.year - b.year);

/* The scroll the stage stays on screen for, in svh, from the moment it reaches the top of the screen.
   The first 290 are the music page's own climb as it is (the camera rises, the three passages fill);
   the session follows. */
export const CLIMB = 290;
const SESSION_FROM = 280; // the last passage, lit, is held a moment; then it makes way as the first record comes up
const FIRST = 26; // the first record: it has the passage to see off as well
const RECORD = 20; // each record after it: the one before goes down as it comes up, and it is held
const TALK = 44; // the presenter: the record goes down, the line comes in and fills with light, held
const END = 18; // a breath, then the page moves on

function build() {
  const cues: Cue[] = [];
  let at = SESSION_FROM;
  const push = (cue: Cue) => {
    cues.push(cue);
    at += cue.len;
  };
  byYear.forEach((record, i) => {
    push({ kind: 'record', record, start: at, len: i === 0 ? FIRST : RECORD });
    // The first talk comes once the records from before 1980 have played.
    const next = byYear[i + 1];
    if (record.year < 1980 && next && next.year >= 1980) push({ kind: 'talk', key: 'playing', text: talk.playing, start: at, len: TALK });
  });
  push({ kind: 'talk', key: 'beats', text: talk.beats, start: at, len: TALK });
  return { cues, end: at + END };
}

const built = build();
export const cues: readonly Cue[] = built.cues;
/** The whole stretch, in svh: what the page's CSS gives the climb (--climb-run). */
export const RUN = Math.ceil(built.end);

/* Within a cue, as shares of its length. A record comes up while the one before goes down, a little
   after it has set off, so the middle of the ring is never empty and never holds two; and it is held
   there for the rest of the cue. Its name is not timed here: the name of whichever record is most out on
   the deck is shown, whole (climb.ts). */
export const UP = { from: 0.12, to: 0.56 } as const;
export const UP_FIRST = { from: 0.1, to: 0.58 } as const;
export const DOWN = { from: 0, to: 0.4 } as const;
// A talk: the line comes in once the record has mostly gone (which of the two holds the middle is
// decided from these, climb.ts), fills, and is held lit.
export const LINE_IN = { from: 0.14, to: 0.3 } as const;
export const LINE_FILL = { from: 0.3, to: 0.84 } as const;
export const LINE_OUT = { from: 0, to: 0.2 } as const; // of the cue after it
