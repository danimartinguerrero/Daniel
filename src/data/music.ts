/**
 * The music page: its words and the records on the shelf.
 *
 * EXAMPLE DATA. The records below are placeholders so the shelf has something on it: the albums are
 * real (titles, artists, years, labels and track names are facts), but they are not yet the owner's
 * collection, and every `why` is an invented stand-in for his own words. Replace both before this
 * page goes live. The sleeves are original generated art drawn from `palette` and `motif`; they
 * deliberately do not reproduce the albums' real covers.
 */

export const musicCopy = {
  eyebrow: 'Music',
  headline: 'I love music.',
  lede: 'And I love making things with it. The song playing at the top of this site is one of them.',
  shelf: {
    eyebrow: 'On vinyl',
    headline: 'My records.',
    lede: 'These are the albums I own on vinyl. Pick one, unwrap it, and I’ll tell you why it’s here.',
  },
  record: {
    unwrap: 'Unwrap',
    unwrapHint: 'Slide to unwrap',
    tracklist: 'Tracklist',
    info: 'About this record',
    why: 'Why I love it',
    close: 'Put it back',
    /** Labels for the facts in the info block. */
    fields: { year: 'Year', label: 'Label', genre: 'Genre', format: 'Format', tracks: 'Tracks' },
  },
} as const;

/** An original abstract figure for the generated sleeve. None of them imitates a real cover. */
export type SleeveMotif = 'rings' | 'bands' | 'arcs' | 'grid' | 'dots' | 'horizon' | 'waves' | 'sun';

export interface Vinyl {
  /** Stable id, used in the DOM (`data-vinyl`). */
  id: string;
  title: string;
  artist: string;
  year: number;
  label: string;
  genre: string;
  /** How it comes, as printed on a hype sticker: "LP", "2×LP". */
  format: string;
  /** Track names in order. */
  tracks: readonly string[];
  /** EXAMPLE: stands in for the owner's own words. */
  why: string;
  /** Sleeve colours: a deep ground, a middle tone, a light tone and one accent. */
  palette: readonly [deep: string, mid: string, light: string, accent: string];
  motif: SleeveMotif;
}

export const vinyls: readonly Vinyl[] = [
  {
    id: 'modal-soul',
    title: 'Modal Soul',
    artist: 'Nujabes',
    year: 2005,
    label: 'Hyde Out Productions',
    genre: 'Jazzy hip-hop',
    format: '2×LP',
    tracks: ['Feather', 'Ordinary Joe', 'Reflection Eternal', 'Luv (Sic.) Pt. 3', 'Music Is Mine', 'Eclipse', 'The Sign', 'Thank You', 'World’s End Rhapsody', 'Modal Soul', 'Flowers', 'Sea of Cloud', 'Light on the Land', 'Horizon'],
    why: 'Feather is the song that plays at the top of this site. I put this record on when I want to think clearly, and it has not failed me yet.',
    palette: ['#3b1210', '#b3402c', '#e8a07a', '#2c5f8a'],
    motif: 'horizon',
  },
  {
    id: 'discovery',
    title: 'Discovery',
    artist: 'Daft Punk',
    year: 2001,
    label: 'Virgin',
    genre: 'French house',
    format: '2×LP',
    tracks: ['One More Time', 'Aerodynamic', 'Digital Love', 'Harder, Better, Faster, Stronger', 'Crescendolls', 'Nightvision', 'Superheroes', 'High Life', 'Something About Us', 'Voyager', 'Veridis Quo', 'Short Circuit', 'Face to Face', 'Too Long'],
    why: 'It sounds like someone having the best time of their life with a sampler. Every time I hear it I want to go and build something.',
    palette: ['#0b0b0f', '#2a2d6e', '#c9a13c', '#e6477a'],
    motif: 'bands',
  },
  {
    id: 'kind-of-blue',
    title: 'Kind of Blue',
    artist: 'Miles Davis',
    year: 1959,
    label: 'Columbia',
    genre: 'Modal jazz',
    format: 'LP',
    tracks: ['So What', 'Freddie Freeloader', 'Blue in Green', 'All Blues', 'Flamenco Sketches'],
    why: 'Five tracks and nothing is in a hurry. It is the record I play late, when the day is done and I only want to listen.',
    palette: ['#0a1a2f', '#1d4f7c', '#9cc3df', '#f0e2c0'],
    motif: 'arcs',
  },
  {
    id: 'dark-side',
    title: 'The Dark Side of the Moon',
    artist: 'Pink Floyd',
    year: 1973,
    label: 'Harvest',
    genre: 'Progressive rock',
    format: 'LP',
    tracks: ['Speak to Me', 'Breathe (In the Air)', 'On the Run', 'Time', 'The Great Gig in the Sky', 'Money', 'Us and Them', 'Any Colour You Like', 'Brain Damage', 'Eclipse'],
    why: 'I like that it only works as a whole. You put the needle down at the start and you stay until the end of side two.',
    palette: ['#08080a', '#26262c', '#8b8b96', '#f2c14e'],
    motif: 'rings',
  },
  {
    id: 'in-rainbows',
    title: 'In Rainbows',
    artist: 'Radiohead',
    year: 2007,
    label: 'XL Recordings',
    genre: 'Art rock',
    format: 'LP',
    tracks: ['15 Step', 'Bodysnatchers', 'Nude', 'Weird Fishes/Arpeggi', 'All I Need', 'Faust Arp', 'Reckoner', 'House of Cards', 'Jigsaw Falling into Place', 'Videotape'],
    why: 'The drums on this record are the reason I started paying attention to drums. Reckoner still gets me every time.',
    palette: ['#120a1c', '#7a1f4f', '#f08a3c', '#48c6c0'],
    motif: 'waves',
  },
  {
    id: 'rumours',
    title: 'Rumours',
    artist: 'Fleetwood Mac',
    year: 1977,
    label: 'Warner Bros.',
    genre: 'Soft rock',
    format: 'LP',
    tracks: ['Second Hand News', 'Dreams', 'Never Going Back Again', 'Don’t Stop', 'Go Your Own Way', 'Songbird', 'The Chain', 'You Make Loving Fun', 'I Don’t Want to Know', 'Oh Daddy', 'Gold Dust Woman'],
    why: 'My parents played it in the car, so I knew every song before I knew whose they were. Buying it on vinyl felt like closing a loop.',
    palette: ['#2b2118', '#8a6a48', '#e9dcc3', '#b5462f'],
    motif: 'dots',
  },
  {
    id: 'random-access-memories',
    title: 'Random Access Memories',
    artist: 'Daft Punk',
    year: 2013,
    label: 'Columbia',
    genre: 'Disco, funk',
    format: '2×LP',
    tracks: ['Give Life Back to Music', 'The Game of Love', 'Giorgio by Moroder', 'Within', 'Instant Crush', 'Lose Yourself to Dance', 'Touch', 'Get Lucky', 'Beyond', 'Motherboard', 'Fragments of Time', 'Doin’ It Right', 'Contact'],
    why: 'It is a record about loving how records are made. I listen to it for the sound of the room as much as for the songs.',
    palette: ['#050506', '#1c1c20', '#bfc3c9', '#d9a441'],
    motif: 'grid',
  },
  {
    id: 'abbey-road',
    title: 'Abbey Road',
    artist: 'The Beatles',
    year: 1969,
    label: 'Apple',
    genre: 'Rock',
    format: 'LP',
    tracks: ['Come Together', 'Something', 'Maxwell’s Silver Hammer', 'Oh! Darling', 'Octopus’s Garden', 'I Want You (She’s So Heavy)', 'Here Comes the Sun', 'Because', 'You Never Give Me Your Money', 'Sun King', 'Mean Mr. Mustard', 'Polythene Pam', 'She Came In Through the Bathroom Window', 'Golden Slumbers', 'Carry That Weight', 'The End', 'Her Majesty'],
    why: 'Side two is my favourite twenty minutes of music. I bought the record mostly so I could hear that medley without touching anything.',
    palette: ['#14241c', '#3f6f52', '#cfe3c0', '#f4d35e'],
    motif: 'sun',
  },
];
