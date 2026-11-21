/**
 * Where the site lives. It is served from a GitHub Pages project path (astro.config.mjs `base`), so
 * every link and asset inside the site goes through `href`. Safe on the server and in the browser.
 */
const raw = import.meta.env.BASE_URL;
/** The base path without its trailing slash: "" at a domain's root, "/Daniel" under Pages. */
export const base = raw.endsWith('/') ? raw.slice(0, -1) : raw;
/** A path inside the site, given from its root: href('/cine') → "/Daniel/cine". */
export const href = (path: string) => `${base}${path.startsWith('/') ? path : `/${path}`}`;
/** A pathname without trailing slashes, "/" for the root. */
export const normalizePath = (path: string) => path.replace(/\/+$/, '') || '/';
/** The home page and the film page, normalised. */
export const homePath = normalizePath(`${base}/`);
export const cinePath = normalizePath(href('/cine'));
