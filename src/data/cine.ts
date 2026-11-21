/**
 * Daniel's films. The diary, reviews and posters come from his public Letterboxd RSS feed
 * (scripts/letterboxd.mjs → letterboxd.json). The profile figures and the four favourites are not in
 * the feed, so they are kept here by hand (as of 21 November 2026).
 */
import feed from './letterboxd.json';
import { href } from '@/lib/paths';

export const profile = {
  user: 'danielmtg',
  url: 'https://letterboxd.com/danielmtg/',
  quote: 'Unspoken feelings are unforgettable',
  quoteSource: 'Nostalgia, Andréi Tarkovski',
  films: 635,
  thisYear: 38,
  following: 59,
  followers: 53,
  watchlist: 387,
};

/** The four favourites, in the profile's order. Typeset, not pictured: the feed has no posters for them. */
export const favorites = [
  { title: 'Interstellar', year: 2014, by: 'Christopher Nolan' },
  { title: 'Donnie Darko', year: 2001, by: 'Richard Kelly' },
  { title: 'Twin Peaks', year: 1990, by: 'David Lynch y Mark Frost' },
  { title: 'Nostalgia', year: 1983, by: 'Andréi Tarkovski' },
];

export interface Entry {
  title: string;
  year: number | null;
  watched: string;
  rating: number | null;
  liked: boolean;
  rewatch: boolean;
  spoilers: boolean;
  review: string[];
  url: string;
  slug: string;
  poster?: { base: string; widths: number[] };
}

export const entries = feed.entries as Entry[];
export const lists = feed.lists as { title: string; url: string; films: string[]; total: number }[];
export const fetched = feed.fetched;

/** "★★★★½". */
export const stars = (r: number | null) => (r ? '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : '') : '');

/** The poster as <img> attributes: two widths of WebP at 2:3. */
export const poster = (e: Entry, sizes: string) => e.poster && {
  src: href(`${e.poster.base}-${e.poster.widths[0]}.webp`),
  srcset: e.poster.widths.map((w) => `${href(`${e.poster!.base}-${w}.webp`)} ${w}w`).join(', '),
  sizes, width: 400, height: 600,
};

/** Review text without emoji, for setting in type. */
export const clean = (s: string) => s
  .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu, '')
  .replace(/\s+([.,;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim()
  .replace(/^["“«]+|["”»]+$/g, '').trim();

export const date = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', opts).replace('.', '');

/** The reviews worth setting as quotes: written, spoiler-free, of a sensible length. */
export const quotable = entries.filter((e, i, all) => {
  const text = clean(e.review.join(' '));
  return !e.spoilers && text.length >= 40 && text.length <= 360 && !text.endsWith(':') && all.findIndex((o) => o.slug === e.slug) === i;
});
