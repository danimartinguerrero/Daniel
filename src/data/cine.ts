/**
 * Daniel's Letterboxd, as of 21 November 2026, copied from his profile (letterboxd.com/danielmtg).
 * Letterboxd can't be read from where the site is built, so the figures and posters are kept here by hand:
 * the posters are cut from screenshots of the profile, in public/cine/. Update this file to refresh the page.
 */

export const letterboxd = {
  user: 'danielmtg',
  url: 'https://letterboxd.com/danielmtg/',
  bio: 'Unspoken feelings are unforgettable',
  /** Where the bio comes from: the line from Nostalgia that changed how Daniel looks at things. */
  bioSource: 'Nostalgia, Andréi Tarkovski',
  films: 635,
  thisYear: 38,
  lists: 2,
  following: 59,
  followers: 53,
  watchlist: 387,
  diary: 82,
};

export interface Film {
  title: string;
  year?: number;
  img: string;
}

/** The four favourites, in the profile's order. */
export const favorites: Film[] = [
  { title: 'Interstellar', year: 2014, img: '/cine/interstellar.webp' },
  { title: 'Donnie Darko', year: 2001, img: '/cine/donnie-darko.webp' },
  { title: 'Twin Peaks', img: '/cine/twin-peaks.webp' },
  { title: 'Nostalgia', year: 1983, img: '/cine/nostalgia.webp' },
];

/** Stars out of five, halves allowed. */
export interface Watched extends Film {
  rating: number;
  liked?: boolean;
}

/** Recent activity, newest first. */
export const recent: Watched[] = [
  { title: 'Frieren: Beyond Journey’s End', year: 2023, img: '/cine/frieren.webp', rating: 5, liked: true },
  { title: 'Hell’s Paradise', year: 2023, img: '/cine/hells-paradise.webp', rating: 5, liked: true },
  { title: 'Backrooms', img: '/cine/backrooms.webp', rating: 3.5, liked: true },
  { title: 'La Bola Negra', img: '/cine/la-bola-negra.webp', rating: 4.5, liked: true },
];

export interface Review {
  title: string;
  year: number;
  img: string;
  rating: number;
  watched: string; // ISO date
  text: string;
  lang: string;
}

export const reviews: Review[] = [
  {
    title: 'Frieren: Beyond Journey’s End', year: 2023, img: '/cine/frieren.webp', rating: 5, watched: '2026-11-12',
    text: 'Una celebración a la vida en su forma más pura, amable y honesta.', lang: 'es',
  },
  {
    title: 'Hell’s Paradise', year: 2023, img: '/cine/hells-paradise.webp', rating: 5, watched: '2026-11-04',
    text: 'Those who take cannot understand; those who were stolen from shall never forget…', lang: 'en',
  },
];

/** The diary, by month, newest first. */
export const diary: { month: string; iso: string; entries: { day: number; title: string }[] }[] = [
  { month: 'Noviembre', iso: '2026-11', entries: [{ day: 12, title: 'Frieren: Beyond Journey’s End' }, { day: 4, title: 'Hell’s Paradise' }, { day: 1, title: 'Backrooms' }] },
  { month: 'Octubre', iso: '2026-10', entries: [{ day: 10, title: 'La Bola Negra' }] },
  { month: 'Septiembre', iso: '2026-09', entries: [{ day: 20, title: 'Demon Slayer: Kimetsu no Yaiba Infinity Castle' }, { day: 12, title: 'Harakiri' }] },
  { month: 'Agosto', iso: '2026-08', entries: [{ day: 11, title: 'Doctor Who: Twice Upon a Time' }] },
  { month: 'Julio', iso: '2026-07', entries: [{ day: 29, title: 'Midnight Cowboy' }, { day: 22, title: 'The Odyssey' }, { day: 20, title: 'Cinema Paradiso' }] },
];

export const list = {
  title: 'Verlas a solas para sentirlo todo',
  films: 33,
  img: '/cine/list.webp',
  url: 'https://letterboxd.com/danielmtg/lists/',
};

/** "★★★★½" for 4.5. */
export const stars = (rating: number) => '★'.repeat(Math.floor(rating)) + (rating % 1 ? '½' : '');
