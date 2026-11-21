// Refreshes Daniel's music from his public Spotify profile: each public playlist's name, cover and
// tracks, read from Spotify's own embed pages, and the covers saved as 640 px WebP in public/music/.
// Run with `npm run spotify`; it rewrites src/data/spotify.json. Playback on the site goes through
// Spotify's official embed player.
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const USER = '0qlsgddi6nc7uaz7gaib5tngw';
// The track the site offers to play first: Tonight, Tonight, by The Smashing Pumpkins (in "🥀").
const FEATURED = 'spotify:track:7bu0znpSbTks0O6I98ij0W';
const OUT = new URL('../public/music/', import.meta.url);
const DATA = new URL('../src/data/spotify.json', import.meta.url);

const get = async (url) => {
  const res = await fetch(url, { headers: { 'user-agent': 'danimartinguerrero.github.io site build' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
};
const entity = async (kind, id) => {
  const html = await (await get(`https://open.spotify.com/embed/${kind}/${id}`)).text();
  const json = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  if (!json) throw new Error(`No data for ${kind}/${id}`);
  return JSON.parse(json).props.pageProps.state.data.entity;
};
// The largest version of a cover: Spotify's 640 px variants.
const biggest = (url) => url
  // Album art is also on i.scdn.co, whatever CDN the embed names.
  .replace(/https:\/\/image-cdn-\w+\.spotifycdn\.com\/image\/(ab67616d)/, 'https://i.scdn.co/image/$1')
  // Playlist covers: the same path is served by every Spotify image CDN.
  .replace(/https:\/\/image-cdn-\w+\.spotifycdn\.com\//, 'https://image-cdn-fa.spotifycdn.com/')
  .replace('ab67706c0000da84', 'ab67706c0000bebb')
  .replace('ab67616d00001e02', 'ab67616d0000b273')
  .replace(/mosaic\.scdn\.co\/\d+\//, 'mosaic.scdn.co/640/');
const save = async (url, name) => {
  const buf = Buffer.from(await (await get(biggest(url))).arrayBuffer());
  await sharp(buf).resize(640, 640, { fit: 'cover' }).webp({ quality: 90 }).toFile(new URL(`${name}.webp`, OUT).pathname);
  return `/music/${name}.webp`;
};

await mkdir(OUT, { recursive: true });
const profile = await (await get(`https://open.spotify.com/user/${USER}`)).text();
const ids = [...new Set([...profile.matchAll(/\/playlist\/([A-Za-z0-9]{22})/g)].map((m) => m[1]))];

const playlists = [];
for (const id of ids) {
  const e = await entity('playlist', id);
  const tracks = (e.trackList ?? []).map((t) => ({ title: t.title, artist: t.subtitle, uri: t.uri, ms: t.duration }));
  const cover = e.coverArt?.sources?.[0]?.url;
  playlists.push({
    id, name: e.name, uri: `spotify:playlist:${id}`, url: `https://open.spotify.com/playlist/${id}`,
    cover: cover ? await save(cover, `playlist-${id}`) : null,
    count: tracks.length, tracks: tracks.slice(0, 12),
  });
  console.log(`playlist: ${e.name} (${tracks.length})`);
}

const trackId = FEATURED.split(':').pop();
const t = await entity('track', trackId);
const featured = {
  // The song's own name, without the reissue's label ("- Remastered 2012").
  title: (t.name ?? t.title).replace(/\s+-\s+(\d{4}\s+)?Remaster(ed)?(\s+\d{4})?$/i, ''), artist: (t.artists ?? []).map((a) => a.name).join(', ') || t.subtitle,
  uri: FEATURED, url: `https://open.spotify.com/track/${trackId}`, ms: t.duration,
  // A track's cover comes in its visual identity; the 300 px one is enough to name the 640 px original.
  cover: (t.visualIdentity?.image?.[0]?.url ?? t.coverArt?.sources?.[0]?.url) ? await save(t.visualIdentity?.image?.[0]?.url ?? t.coverArt.sources[0].url, `track-${trackId}`) : null,
};
console.log(`featured: ${featured.title} — ${featured.artist}`);

await writeFile(DATA, `${JSON.stringify({ user: USER, profile: `https://open.spotify.com/user/${USER}`, fetched: new Date().toISOString().slice(0, 10), featured, playlists }, null, 2)}\n`);
