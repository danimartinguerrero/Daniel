// Refreshes the film data from Daniel's public Letterboxd RSS feed (letterboxd.com/danielmtg/rss/):
// the diary, his reviews and the posters, which it downloads at 1000×1500 and stores as WebP at two widths.
// Run with `npm run letterboxd`; it rewrites src/data/letterboxd.json and public/cine/p/.
// It only reads the RSS feed and the poster images the feed links to.
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';

const USER = 'danielmtg';
const FEED = `https://letterboxd.com/${USER}/rss/`;
const OUT_DIR = new URL('../public/cine/p/', import.meta.url);
const DATA = new URL('../src/data/letterboxd.json', import.meta.url);
const WIDTHS = [400, 800];

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&(\w+);/g, (m, n) => entities[n] ?? m);
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1].trim()) : '';
};
const slugOf = (link) => link.match(/\/film\/([^/]+)\//)?.[1] ?? '';

const res = await fetch(FEED, { headers: { 'user-agent': 'danimartinguerrero.github.io site build (RSS reader)' } });
if (!res.ok) throw new Error(`Feed: HTTP ${res.status}`);
const xml = await res.text();
const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);

const entries = [];
const lists = [];
for (const item of items) {
  const link = tag(item, 'link');
  const description = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] ?? '';
  if (!item.includes('<letterboxd:filmTitle>')) {
    // A list: its title and the films it names.
    const films = [...description.matchAll(/<a href="[^"]+">([^<]+)<\/a>/g)].map((m) => decode(m[1]));
    const more = description.match(/plus (\d+) more/)?.[1];
    lists.push({ title: tag(item, 'title'), url: link, films, total: films.length + (more ? +more : 0) });
    continue;
  }
  const poster = description.match(/<img src="([^"]+)"/)?.[1] ?? '';
  const spoilers = description.includes('This review may contain spoilers');
  const paragraphs = [...description.matchAll(/<p>([\s\S]*?)<\/p>/g)]
    .map((m) => decode(m[1].replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')).trim())
    .filter((p) => p && !p.startsWith('Watched on') && !p.includes('This review may contain spoilers'));
  entries.push({
    title: tag(item, 'letterboxd:filmTitle'),
    year: +tag(item, 'letterboxd:filmYear') || null,
    watched: tag(item, 'letterboxd:watchedDate'),
    rating: +tag(item, 'letterboxd:memberRating') || null,
    liked: tag(item, 'letterboxd:memberLike') === 'Yes',
    rewatch: tag(item, 'letterboxd:rewatch') === 'Yes',
    spoilers,
    review: spoilers ? [] : paragraphs,
    url: link,
    slug: slugOf(link),
    posterSource: poster,
  });
}

await mkdir(OUT_DIR, { recursive: true });
const wanted = new Set();
for (const e of entries) {
  if (!e.posterSource || !e.slug) continue;
  const files = WIDTHS.map((w) => `${e.slug}-${w}.webp`);
  files.forEach((f) => wanted.add(f));
  e.poster = { base: `/cine/p/${e.slug}`, widths: WIDTHS };
  if (files.every((f) => existsSync(new URL(f, OUT_DIR)))) continue;
  const big = e.posterSource.replace(/-0-\d+-0-\d+-crop/, '-0-1000-0-1500-crop');
  const img = await fetch(big);
  if (!img.ok) { console.warn(`Poster for ${e.title}: HTTP ${img.status}`); delete e.poster; continue; }
  const buf = Buffer.from(await img.arrayBuffer());
  for (const w of WIDTHS) {
    await sharp(buf).resize({ width: w, height: Math.round(w * 1.5), fit: 'cover' }).webp({ quality: 86 }).toFile(new URL(`${e.slug}-${w}.webp`, OUT_DIR).pathname);
  }
  console.log(`poster: ${e.title}`);
}
// Drop posters the feed no longer links to.
for (const f of await readdir(OUT_DIR)) if (!wanted.has(f)) await rm(new URL(f, OUT_DIR));

for (const e of entries) delete e.posterSource;
await writeFile(DATA, `${JSON.stringify({ user: USER, fetched: new Date().toISOString().slice(0, 10), entries, lists }, null, 2)}\n`);
console.log(`${entries.length} diary entries, ${lists.length} lists`);
