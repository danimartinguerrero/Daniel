export type LitLine = { span: number; progress: number } & (
  { mask: HTMLElement; text: HTMLElement } | { words: HTMLElement[] }
);

export function measureTextFill(element: HTMLElement): LitLine[] {
  element.querySelector('.v4-lit')?.remove();
  const words = [...element.querySelectorAll<HTMLElement>('[data-w]')];
  const bounds = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const pad = parseFloat(style.fontSize) * 0.25;
  const edgeShare = parseFloat(style.getPropertyValue('--fill-edge')) || 0.25;
  const layer = document.createElement('span');
  layer.className = 'v4-lit';
  layer.setAttribute('aria-hidden', 'true');
  const rects = words.map(word => word.getBoundingClientRect());
  const lines: LitLine[] = [];
  let start = 0;
  for (let end = 1; end <= words.length; end++) {
    const first = rects[start]!;
    if (end < words.length && Math.abs(rects[end]!.top - first.top) < 2) continue;
    const width = rects[end - 1]!.right - first.left;
    const edge = width * edgeShare;
    const span = width + 2 * pad + edge;
    if (element.hasAttribute('data-fill-inline')) {
      // Colour the original glyphs so the heading keeps its native spacing throughout the reveal.
      const lineWords = words.slice(start, end);
      lineWords.forEach((word, i) => {
        word.style.setProperty('--word-offset', `${rects[start + i]!.left - first.left + pad}px`);
        word.style.setProperty('--edge', `${edge}px`);
      });
      lines.push({ words: lineWords, span, progress: -1 });
      start = end;
      continue;
    }
    const mask = document.createElement('span');
    mask.className = 'v4-lit__win';
    mask.style.cssText = `left:${first.left - bounds.left - pad}px;top:${first.top - bounds.top - pad}px;width:${span}px;height:${first.height + 2 * pad}px;--edge:${edge}px`;
    const text = document.createElement('span');
    text.className = 'v4-lit__line';
    text.style.cssText = `left:${pad}px;top:${pad}px;line-height:${first.height}px`;
    text.textContent = words.slice(start, end).map(word => word.textContent).join(' ');
    mask.append(text);
    layer.append(mask);
    lines.push({ span, mask, text, progress: -1 });
    start = end;
  }
  if (layer.childElementCount) element.append(layer);
  element.classList.add('is-armed');
  return lines;
}

export function paintTextFill(lines: LitLine[], filledLines: number) {
  lines.forEach((line, index) => {
    const progress = Math.min(1, Math.max(0, filledLines - index));
    if (progress === line.progress) return;
    line.progress = progress;
    if ('words' in line) {
      const front = `${(progress * line.span).toFixed(2)}px`;
      for (const word of line.words) word.style.setProperty('--fill-front', front);
      return;
    }
    const shift = (progress - 1) * line.span;
    line.mask.style.transform = `translate3d(${shift.toFixed(2)}px,0,0)`;
    line.text.style.transform = `translate3d(${(-shift).toFixed(2)}px,0,0)`;
  });
}

/* How long a filled passage stays lit before the page moves on, in lines' worth of scroll: the home
   page holds a part name for the last 30% of its stretch against 70% for filling it (index.astro). */
export const FILL_HOLD = 3 / 7;

/* The scroll a line takes to fill (--fill-line in global.css), in px on this screen. */
export function measureFillLine(host: HTMLElement): number {
  const probe = document.createElement('i');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;top:0;left:0;width:0;height:var(--fill-line);visibility:hidden;pointer-events:none';
  host.append(probe);
  const line = probe.getBoundingClientRect().height;
  probe.remove();
  return line || innerHeight * 0.35;
}

/* Hands a passage back to plain, lit text. */
export function clearTextFill(element: HTMLElement) {
  element.querySelector('.v4-lit')?.remove();
  element.classList.remove('is-armed');
}
