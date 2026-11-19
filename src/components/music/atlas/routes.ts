/**
 * Music, way "atlas": what the records on the shelf share, as threads between them. Every fact here is
 * already on the page, in data/music.ts: an artist, a guest in a track list, a label, a genre, or a line
 * of a record's `about`. Nothing is brought in from outside, so nothing here needs a source of its own.
 *
 * A route is one thing shared, told under the ring (`title`, `text`) while its threads are drawn. A
 * thread runs from the older record to the newer one, the way the light is drawn along it. `label` is
 * written along the thread, as a river's name is along the river on a map; every thread has one, so a
 * thread lit at the end, with its record at the front of the ring, always says what it is.
 */

export interface Thread {
  from: string;
  to: string;
  label?: string;
}

export interface Route {
  id: string;
  title: string;
  text: string;
  threads: readonly Thread[];
  /** How much of the scroll it takes, against the others (1 = one share). */
  weight?: number;
}

export const atlasCopy = {
  intro: {
    title: 'What they share',
    text: 'People, sounds and ideas run from one record to another. Keep scrolling to follow them.',
  },
  all: {
    title: 'All eleven',
    /** What the record at the front of the ring (or the one pointed at) is tied to. */
    tied: (title: string, others: readonly string[]) =>
      `${title} is tied to ${others.length > 1 ? `${others.slice(0, -1).join(', ')} and ${others.at(-1)}` : others[0]}.`,
    /** On a screen with a mouse or trackpad. */
    point: 'Point at another record to follow its threads.',
    /** On a touch screen: the ring turns under a finger, and the record that comes to the front lights
        its threads. A tap still takes a record out. */
    touch: 'Turn the ring to follow another record’s threads.',
  },
} as const;

export const routes: readonly Route[] = [
  {
    id: 'kendrick',
    title: 'Kendrick Lamar',
    text: 'Three of his albums, from good kid, m.A.A.d city in 2012 to DAMN. in 2017, and his verse on “Like That” from We Don’t Trust You.',
    threads: [
      { from: 'good-kid-maad-city', to: 'to-pimp-a-butterfly', label: 'Kendrick Lamar' },
      { from: 'to-pimp-a-butterfly', to: 'damn', label: 'Kendrick Lamar' },
      { from: 'damn', to: 'we-dont-trust-you', label: '“Like That”' },
    ],
    weight: 1.5,
  },
  {
    id: 'drake',
    title: 'Drake',
    text: 'He is the guest on “Poetic Justice”. Twelve years later, Kendrick’s verse on “Like That” takes shots at him.',
    threads: [{ from: 'good-kid-maad-city', to: 'we-dont-trust-you', label: 'Drake' }],
  },
  {
    id: 'q-tip',
    title: 'Q-Tip',
    text: 'The Low End Theory is built on his bass-heavy jazz samples. Three years later he made beats for Illmatic, and he is on “One Love”.',
    threads: [{ from: 'low-end-theory', to: 'illmatic', label: 'Q-Tip' }],
  },
  {
    id: 'jazz-rap',
    title: 'Jazz rap',
    text: 'Ron Carter plays on The Low End Theory. Twenty-four years later, Thundercat and Kamasi Washington play on To Pimp a Butterfly.',
    threads: [{ from: 'low-end-theory', to: 'to-pimp-a-butterfly', label: 'jazz rap' }],
  },
  {
    id: 'story',
    title: 'Told as a story',
    text: 'The Wall follows a rock star called Pink, IGOR a love affair, and good kid, m.A.A.d city plays like a short film.',
    threads: [
      { from: 'the-wall', to: 'good-kid-maad-city', label: 'told as a story' },
      { from: 'good-kid-maad-city', to: 'igor', label: 'told as a story' },
    ],
  },
  {
    id: 'gospel',
    title: 'Gospel',
    text: 'ye has gospel-style backing vocals. A year later, IGOR works gospel into its arrangements, with jazz and funk.',
    threads: [{ from: 'ye', to: 'igor', label: 'gospel' }],
  },
  {
    id: 'loop',
    title: 'Back to the start',
    text: 'The Dark Side of the Moon opens and closes with a heartbeat. DAMN. ends by rewinding to its own first line.',
    threads: [{ from: 'dark-side', to: 'damn', label: 'back to the start' }],
  },
  {
    id: 'prog',
    title: 'Progressive rock',
    text: 'In the Court of the Crimson King is often called the first progressive rock album. The Dark Side of the Moon came four years later.',
    threads: [{ from: 'in-the-court', to: 'dark-side', label: 'prog rock' }],
  },
  {
    id: 'pink-floyd',
    title: 'Pink Floyd',
    text: 'Both on Harvest, six years apart. One runs as a single piece; the other tells its story over four sides.',
    threads: [{ from: 'dark-side', to: 'the-wall', label: 'Pink Floyd' }],
  },
];
