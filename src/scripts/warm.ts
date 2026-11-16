/**
 * Gets a page ready before it is pressed: the page itself and the scripts it runs. The island warms
 * the music page as it opens (IslandNav.tsx). The view transition into that page shows it as soon as
 * it is swapped in (scripts/song-transition.ts), and the carousel only stands in place once its
 * script has run (it parks the row on its scroll position); a script still on its way over a phone's
 * network left the row empty for most of the opening and the records appeared at the end.
 * Preloaded, the script runs straight after the swap, before the opening reaches the carousel.
 * No side effects on import: the island also renders on the server.
 */
const path = (url: URL) => url.pathname.replace(/\/+$/, '') || '/';
const warmed = new Set<string>();

export function warm(href: string) {
  const url = new URL(href, location.href);
  if (warmed.has(url.href) || path(url) === path(new URL(location.href))) return;
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  warmed.add(url.href);
  fetch(url)
    .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
    .then((html) => {
      const page = new DOMParser().parseFromString(html, 'text/html');
      const have = new Set([...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[rel="modulepreload"]')].map((el) => ('src' in el ? el.src : el.href)));
      for (const script of page.querySelectorAll('script[type="module"][src]')) {
        const src = new URL(script.getAttribute('src')!, url).href;
        if (have.has(src)) continue;
        const link = document.createElement('link');
        link.rel = 'modulepreload';
        link.href = src;
        document.head.append(link);
      }
    })
    .catch(() => warmed.delete(url.href));
}
