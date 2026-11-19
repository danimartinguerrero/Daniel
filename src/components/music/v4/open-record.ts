import type { Vinyl } from '@/data/music';

export function fillOpenRecord(overlay: HTMLElement, button: HTMLButtonElement, v: Vinyl) {
  const q = <T extends Element = HTMLElement>(selector: string, scope: ParentNode = overlay) => scope.querySelector<T>(selector)!;
  const tone = button.dataset.tone === 'light' ? 'light' : 'dark';
  overlay.dataset.tone = tone;
  // The disc's label takes its colour from the cover (worked out with the covers, see sleeve.ts).
  const label = button.dataset.label ?? '#444';
  overlay.style.setProperty('--label-bg', label);
  q('[data-v4-personal]').hidden = !v.whyILikeIt;
  q('[data-v4-personal-copy]').textContent = v.whyILikeIt ?? '';
  q('[data-v4-art]').innerHTML = q('.v4-art', button).innerHTML;
  q('[data-v4-title]').textContent = v.title;
  q('[data-v4-meta]').textContent = v.artist;
  q('[data-v4-edition]').textContent = [v.genre, v.year, v.format].join('  ·  ');
  q('[data-track-count]').textContent = String(v.tracks.length);
  overlay.style.setProperty('--record-wallpaper', `url("/img/music/backgrounds/${v.id}.webp")`);
  q('[data-v4-about]').textContent = v.about;
  const link = q<HTMLAnchorElement>('[data-v4-source]');
  link.href = v.source.url;
  q('[data-v4-source-label]', link).textContent = v.source.label;
  q('[data-tracklist]').replaceChildren(
    ...v.tracks.map((t) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = typeof t === 'string' ? t : t.title;
      if (typeof t !== 'string') {
        const feat = document.createElement('span');
        feat.className = 'v4-tracks__feat';
        feat.textContent = `feat. ${t.feat}`;
        name.append(' ', feat);
      }
      li.append(name);
      return li;
    }),
  );
  q('[data-v4-fact="year"]').textContent = String(v.year);
  q('[data-v4-fact="format"]').textContent = v.format;
  q('[data-v4-fact="tracks"]').textContent = `${v.tracks.length} ${v.tracks.length === 1 ? 'track' : 'tracks'}`;
  q('[data-v4-fact="genre"]').textContent = v.genre;
  q('[data-v4-fact="label"]').textContent = v.label;
}
