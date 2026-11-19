/**
 * The music page: its words and the records on the shelf.
 *
 * The records are the owner's own vinyl collection, in his order. Track lists are the standard album
 * as pressed on vinyl, checked against MusicBrainz (good kid, m.A.A.d city is the standard edition,
 * not the deluxe). Each sleeve is the album's front cover, public/img/music/<id>.webp, made with
 * scripts/album-covers.mjs. `about` is a short description written for this page from the source it
 * links to, in its own words: none of it is quoted.
 */

export const musicCopy = {
  eyebrow: 'Music',
  headline: 'I love music.',
  lede: 'And I love making things with it. The song playing at the top of this site is one of them.',
  shelf: {
    eyebrow: 'On vinyl',
    headline: 'My records.',
    lede: 'These are the albums I own on vinyl. Pick one and unwrap it.',
  },
  /** In the middle of the ring, once the page has climbed above the records: how the collection came
      about and what putting a record on is to me. One passage at a time; each fills with light as the
      page is scrolled, then makes way for the next. */
  collection: [
    'My father encouraged me to start my own collection. His is huge, but I keep adding to mine, thinking I’ll catch up with him one day.',
    'When I want to relax or study, I put on a record I really like. For me it is a spiritual thing.',
    'First I switch on the stereo, then the turntable. I clean the record and, finally, set it playing. I love the sound of the needle as it lands.',
  ],
  record: {
    unwrap: 'Unwrap',
    unwrapHint: 'Slide to unwrap',
    tracklist: 'Tracklist',
    info: 'About this record',
    about: 'The album',
    close: 'Put it back',
    /** Labels for the facts in the info block. */
    fields: { year: 'Year', label: 'Label', genre: 'Genre', format: 'Format', tracks: 'Tracks' },
  },
} as const;

/** A track with guests, as Apple Music credits them ("feat. …"). */
export type Track = string | { title: string; feat: string };
const ft = (title: string, feat: string): Track => ({ title, feat });

export interface Vinyl {
  /** Stable id, used in the DOM (`data-vinyl`) and as the cover's file name. */
  id: string;
  title: string;
  artist: string;
  year: number;
  label: string;
  genre: string;
  /** How it comes, as printed on a hype sticker: "LP", "2×LP". */
  format: string;
  /** The tracks in order: a name, or a name and who is featured on it. */
  tracks: readonly Track[];
  /** A couple of sentences on what the album is, written from `source`. */
  about: string;
  /** The owner's personal connection to this record, collected in conversation. */
  whyILikeIt?: string;
  /** Where `about` comes from, shown as a link under it. */
  source: { label: string; url: string };
}

const apple = (url: string) => ({ label: 'Based on Apple Music’s notes', url });

export const vinyls: readonly Vinyl[] = [
  {
    id: 'to-pimp-a-butterfly',
    whyILikeIt: "I bought this vinyl because it’s my favourite Kendrick album and one of my favourite albums of all time. Its narrative feels complete, exploring so many of the problems facing Black communities in the US through jazz and rap. In secondary school, I wrote a philosophical and literary analysis of it. My reading is that Kendrick uses genres built by the community to tell the community’s own stories and struggles. I think the whole album is brilliant, especially “How Much a Dollar Cost”.",
    title: 'To Pimp a Butterfly',
    artist: 'Kendrick Lamar',
    year: 2015,
    label: 'TDE, Aftermath, Interscope',
    genre: 'Jazz rap',
    format: '2×LP',
    tracks: [ft('Wesley’s Theory', 'George Clinton & Thundercat'), 'For Free? (Interlude)', 'King Kunta', ft('Institutionalized', 'Bilal, Anna Wise & Snoop Dogg'), ft('These Walls', 'Bilal, Anna Wise & Thundercat'), 'u', 'Alright', 'For Sale? (Interlude)', 'Momma', 'Hood Politics', ft('How Much a Dollar Cost', 'James Fauntleroy & Ronald Isley'), ft('Complexion (A Zulu Love)', 'Rapsody'), 'The Blacker the Berry', 'You Ain’t Gotta Lie (Momma Said)', 'i', 'Mortal Man'],
    about: "Kendrick Lamar’s third album came out in 2015, three years after good kid, m.A.A.d city made him a star. He made it with jazz and funk players, among them Thundercat, Kamasi Washington, Flying Lotus and George Clinton, and on songs like “King Kunta” and “Alright” he raps about fame and race.",
    source: apple('https://music.apple.com/us/album/to-pimp-a-butterfly/1440828886'),
  },
  {
    id: 'damn',
    whyILikeIt: "My girlfriend gave me this vinyl. I love how complete its narrative feels: listening from beginning to end or in reverse gives me two completely different readings of the album. The psychedelic beats are another highlight, alongside the more classic production on “FEAR.” by The Alchemist. It brings together so much of what I enjoy, from trap to classic rap, with Kendrick exploring the genre and playing with the beats. It’s an album I’d always recommend.",
    title: 'DAMN.',
    artist: 'Kendrick Lamar',
    year: 2017,
    label: 'TDE, Aftermath, Interscope',
    genre: 'Hip-hop',
    format: '2×LP',
    tracks: ['BLOOD.', 'DNA.', 'YAH.', 'ELEMENT.', 'FEEL.', ft('LOYALTY.', 'Rihanna'), 'PRIDE.', 'HUMBLE.', 'LUST.', ft('LOVE.', 'Zacari'), ft('XXX.', 'U2'), 'FEAR.', 'GOD.', 'DUCKWORTH.'],
    about: "Two years after To Pimp a Butterfly, Kendrick Lamar dropped most of the jazz and made a rawer, more direct record that ends by rewinding to its own first line. Every title is one word in capitals with a full stop, and in 2018 it won the Pulitzer Prize for Music, the first album outside classical and jazz to do so.",
    source: apple('https://music.apple.com/us/album/damn/1440881047'),
  },
  {
    id: 'ye',
    whyILikeIt: "My girlfriend gave me this vinyl too. I love how much this short album has to say, especially about Kanye’s bipolar disorder. The beats are incredible. Some songs move away from his usual production style, while others, like “All Mine”, capture his personality perfectly for me. “No Mistakes” is a work of art.",
    title: 'ye',
    artist: 'Kanye West',
    year: 2018,
    label: 'GOOD Music, Def Jam',
    genre: 'Hip-hop',
    format: 'LP',
    tracks: ['I Thought About Killing You', 'Yikes', 'All Mine', ft('Wouldn’t Leave', 'PARTYNEXTDOOR'), 'No Mistakes', ft('Ghost Town', 'PARTYNEXTDOOR'), 'Violent Crimes'],
    about: "Kanye West recorded his eighth album in Wyoming with a small group of collaborators, and at seven songs and 23 minutes it is the shortest of his career. He talks openly about his mental health and his bipolar disorder, over chopped samples and gospel-style backing vocals.",
    source: apple('https://music.apple.com/us/album/ye/1441460375'),
  },
  {
    id: 'good-kid-maad-city',
    whyILikeIt: "A friend gave me this record for my birthday. It’s a classic with such a solid tracklist, from “Money Trees” to “The Art of Peer Pressure”, and I love hearing Kendrick and Drake together on “Poetic Justice”. To me, this is the album that made Kendrick a star and set him on the path to To Pimp a Butterfly, his best album in my opinion.",
    title: 'good kid, m.A.A.d city',
    artist: 'Kendrick Lamar',
    year: 2012,
    label: 'TDE, Aftermath, Interscope',
    genre: 'West Coast hip-hop',
    format: '2×LP',
    tracks: ['Sherane a.k.a Master Splinter’s Daughter', 'Bitch, Don’t Kill My Vibe', 'Backseat Freestyle', 'The Art of Peer Pressure', ft('Money Trees', 'Jay Rock'), ft('Poetic Justice', 'Drake'), 'good kid', ft('m.A.A.d city', 'MC Eiht'), 'Swimming Pools (Drank) (Extended Version)', 'Sing About Me, I’m Dying of Thirst', ft('Real', 'Anna Wise'), ft('Compton', 'Dr. Dre')],
    about: "Kendrick Lamar’s first album on a major label is subtitled “a short film” and plays like one, following his teenage years in Compton through his friends, his parents’ voicemails and a girl called Sherane. Gang violence and drinking run all the way through it, and so does prayer.",
    source: apple('https://music.apple.com/us/album/good-kid-m-a-a-d-city-deluxe-version/1440818890'),
  },
  {
    id: 'we-dont-trust-you',
    whyILikeIt: "I bought the red vinyl edition myself. Future and Metro had such a recognisable sound together throughout the 2010s that a full collaborative album felt overdue. I love the beats, and every guest fits perfectly. It’s one of my favourite modern trap albums, especially “Type Shit” and “Everyday Hustle”. “Like That” also kicked off the Kendrick and Drake feud, and I think this record will go down in trap history. I like the more R&B-focused follow-up, We Still Don’t Trust You, but I prefer this first volume.",
    title: 'We Don’t Trust You',
    artist: 'Future & Metro Boomin',
    year: 2024,
    label: 'Freebandz, Boominati, Epic, Republic',
    genre: 'Trap',
    format: '2×LP',
    tracks: ['We Don’t Trust You', ft('Young Metro', 'The Weeknd'), 'Ice Attack', ft('Type Shit', 'Travis Scott & Playboi Carti'), 'Claustrophobic', ft('Like That', 'Kendrick Lamar'), 'Slimed In', 'Magic Don Juan (Princess Diana)', ft('Cinderella', 'Travis Scott'), 'Runnin Outta Time', 'Fried (She a Vibe)', 'Ain’t No Love', ft('Everyday Hustle', 'Rick Ross'), 'GTA', 'Seen It All', 'WTFYM', 'Where My Twin @'],
    about: "Future and Metro Boomin had worked together since “Honest” in 2013 and “Mask Off” in 2017, and this, from March 2024, is their first full album as a duo. It moves from breakup songs and party records to darker tracks like “Like That”, where Kendrick Lamar’s verse takes shots at Drake and J. Cole.",
    source: apple('https://music.apple.com/us/album/we-dont-trust-you/1737149923'),
  },
  {
    id: 'igor',
    whyILikeIt: "I bought this vinyl myself. I love how involved Tyler is in every part of his albums, from writing to production. IGOR tells a deeply personal story through an alter ego that, to me, marked a turning point in his career. After the success of Flower Boy, he chose to make something much harder to digest. I admire that decision, and I think the result is one of his most culturally significant records. I love it.",
    title: 'IGOR',
    artist: 'Tyler, the Creator',
    year: 2019,
    label: 'Columbia',
    genre: 'Neo-soul, hip-hop',
    format: 'LP',
    tracks: ['IGOR’S THEME', 'EARFQUAKE', 'I THINK', 'BOYFRIEND', 'RUNNING OUT OF TIME', 'NEW MAGIC WAND', 'A BOY IS A GUN*', 'PUPPET', 'WHAT’S GOOD', 'GONE, GONE / THANK YOU', 'I DON’T LOVE YOU ANYMORE', 'ARE WE STILL FRIENDS?'],
    about: "On his fifth album Tyler, the Creator mostly sings, over thick synthesizers that owe a lot to Pharrell and N.E.R.D. The songs follow a love affair from falling for someone to begging them to stay, with jazz, funk and gospel worked into the arrangements.",
    source: apple('https://music.apple.com/us/album/igor/1463409338'),
  },
  {
    id: 'in-the-court',
    whyILikeIt: "I bought this vinyl myself. This is one of my favourite albums. To me, it explores psychedelic rock in a way that feels unlike anything that came before it. I hear it as a precursor to The Dark Side of the Moon. It’s a difficult record to get into, but once you become familiar with its sound, you learn to appreciate it. That process is part of what I love about it.",
    title: 'In the Court of the Crimson King',
    artist: 'King Crimson',
    year: 1969,
    label: 'Island',
    genre: 'Progressive rock',
    format: 'LP',
    tracks: ['21st Century Schizoid Man', 'I Talk to the Wind', 'Epitaph', 'Moonchild', 'The Court of the Crimson King'],
    about: "King Crimson recorded their debut in 1969, less than a year after forming in London, and it is often called the first progressive rock album. It goes from the distorted saxophone attack of “21st Century Schizoid Man” to long, slow pieces built on Mellotron, like “Epitaph” and the title track.",
    source: apple('https://music.apple.com/us/album/in-the-court-of-the-crimson-king-expanded-edition/918534711'),
  },
  {
    id: 'dark-side',
    whyILikeIt: "This was the first vinyl I ever bought. It’s one of my favourite Pink Floyd albums, and I see it as a turning point for both the band and the history of rock. I love how the longer songs tell real stories, and the changes in rhythm throughout the record. My favourites are “Time” and “The Great Gig in the Sky”.",
    title: 'The Dark Side of the Moon',
    artist: 'Pink Floyd',
    year: 1973,
    label: 'Harvest',
    genre: 'Progressive rock',
    format: 'LP',
    tracks: ['Speak to Me', 'Breathe (In the Air)', 'On the Run', 'Time', 'The Great Gig in the Sky', 'Money', 'Us and Them', 'Any Colour You Like', 'Brain Damage', 'Eclipse'],
    about: "Pink Floyd’s 1973 album runs as one continuous piece that opens and closes with a heartbeat, and its songs are about time, money, war and madness. It leans on synthesizers, tape loops and recorded voices more than on guitars, and it became one of the best-selling albums ever made.",
    source: apple('https://music.apple.com/us/album/the-dark-side-of-the-moon/1065973699'),
  },
  {
    id: 'the-wall',
    whyILikeIt: "I bought this record in a vintage vinyl shop. I love it: alongside The Dark Side of the Moon, it’s one of my favourite Pink Floyd albums. A little long, though.",
    title: 'The Wall',
    artist: 'Pink Floyd',
    year: 1979,
    label: 'Harvest',
    genre: 'Rock opera',
    format: '2×LP',
    tracks: ['In the Flesh?', 'The Thin Ice', 'Another Brick in the Wall, Part 1', 'The Happiest Days of Our Lives', 'Another Brick in the Wall, Part 2', 'Mother', 'Goodbye Blue Sky', 'Empty Spaces', 'Young Lust', 'One of My Turns', 'Don’t Leave Me Now', 'Another Brick in the Wall, Part 3', 'Goodbye Cruel World', 'Hey You', 'Is There Anybody Out There?', 'Nobody Home', 'Vera', 'Bring the Boys Back Home', 'Comfortably Numb', 'The Show Must Go On', 'In the Flesh', 'Run Like Hell', 'Waiting for the Worms', 'Stop', 'The Trial', 'Outside the Wall'],
    about: "Roger Waters wrote Pink Floyd’s 1979 double album about Pink, a rock star who builds a wall around himself and ends up a fascist dictator in his own head. The idea came in 1977, after Waters spat at a fan at a concert in Montreal, and the four sides tell the story in order.",
    source: apple('https://music.apple.com/us/album/the-wall/1065975633'),
  },
  {
    id: 'low-end-theory',
    whyILikeIt: "I bought this vinyl myself. This is my favourite A Tribe Called Quest album. I love its classic East Coast boom bap sound and the way it brings funk rhythms together with rap. The fusion is spectacular, and the whole record is so much fun. My favourite track is “Butter”. It’s an album I’d happily recommend.",
    title: 'The Low End Theory',
    artist: 'A Tribe Called Quest',
    year: 1991,
    label: 'Jive',
    genre: 'Jazz rap',
    format: '2×LP',
    tracks: ['Excursions', 'Buggin’ Out', 'Rap Promoter', 'Butter', ft('Verses from the Abstract', 'Vinia Mojica & Ron Carter'), ft('Show Business', 'Diamond D, Lord Jamar & Sadat X'), 'Vibes and Stuff', 'The Infamous Date Rape', 'Check the Rhime', 'Everything Is Fair', 'Jazz (We’ve Got)', 'Skypager', 'What?', ft('Scenario', 'Busta Rhymes, Dinco D & Charlie Brown')],
    about: "A Tribe Called Quest’s second album puts Q-Tip’s bass-heavy jazz samples under Phife Dawg’s quick, self-mocking rhymes. The jazz bassist Ron Carter plays on “Verses from the Abstract”, and the record ends with “Scenario”, a posse cut with Leaders of the New School.",
    source: apple('https://music.apple.com/us/album/the-low-end-theory/278911460'),
  },
  {
    id: 'illmatic',
    whyILikeIt: "My girlfriend gave me the special coloured vinyl edition. It’s a classic East Coast boom bap record and, honestly, one of the greatest rap albums of all time in my opinion.",
    title: 'Illmatic',
    artist: 'Nas',
    year: 1994,
    label: 'Columbia',
    genre: 'East Coast hip-hop',
    format: 'LP',
    tracks: ['The Genesis', 'N.Y. State of Mind', ft('Life’s a Bitch', 'AZ & Olu Dara'), 'The World Is Yours', 'Halftime', 'Memory Lane (Sittin’ in da Park)', ft('One Love', 'Q-Tip'), 'One Time 4 Your Mind', 'Represent', 'It Ain’t Hard to Tell'],
    about: "The Queensbridge rapper was about 20 when he made his first album, ten tracks of dense rhymes about the streets he grew up on. The beats come from DJ Premier, Pete Rock, Large Professor, Q-Tip and L.E.S., and many of them are built on dark jazz samples.",
    source: apple('https://music.apple.com/us/album/illmatic/662324135'),
  },
  {
    id: 'nation-of-millions',
    whyILikeIt: "My uncle gave me this record from his own collection. I love its aggressive rap sound, which reminds me of N.W.A. To me, it’s an essential album for understanding rap.",
    title: 'It Takes a Nation of Millions to Hold Us Back',
    artist: 'Public Enemy',
    year: 1988,
    label: 'Def Jam',
    genre: 'Hip-hop',
    format: 'LP',
    tracks: ['Countdown to Armageddon', 'Bring the Noise', 'Don’t Believe the Hype', 'Cold Lampin’ with Flavor', 'Terminator X to the Edge of Panic', 'Mind Terrorist', 'Louder Than a Bomb', 'Caught, Can We Get a Witness?', 'Show ’Em Whatcha Got', 'She Watch Channel Zero?!', 'Night of the Living Baseheads', 'Black Steel in the Hour of Chaos', 'Security of the First World', 'Rebel Without a Pause', 'Prophets of Rage', 'Party for Your Right to Fight'],
    about: 'On Public Enemy’s second album, Chuck D and Flavor Flav trade lines over the Bomb Squad’s layers of samples. The turntables get a lead of their own on “Terminator X to the Edge of Panic,” where the scratch cuts in and out like a switch.',
    source: apple('https://music.apple.com/us/album/it-takes-a-nation-of-millions-to-hold-us-back/1440837788'),
  },
];
