import { useCallback, useEffect, useRef, useState } from 'react';

import { IslandView, islandMetrics, type IslandPresentation } from '@/lib/island';

/**
 * The navigation as the island, drawn by the islandcn engine (src/lib/island): the resting pill at
 * the top, which opens into the expanded island with the links when hovered (fine pointers), tapped
 * (touch) or focused, and closes when left. The engine solves the springs, the shape and the
 * crossfades; this file only decides when it is open and what the open island holds.
 */
const links = [
  { href: '#projects', label: 'Projects' },
  { href: '#studies', label: 'Studies' },
  { href: '#how-i-work', label: 'How I work' },
  { href: '#contact', label: 'Contact' },
] as const;

const idle: IslandPresentation = { kind: 'idle' };

/** The page colour just below the island, so the engine's keyline knows how dark it is. */
const backdropUnder = (y: number): string | undefined => {
  const x = Math.round(innerWidth / 2);
  for (const el of document.elementsFromPoint(x, Math.min(innerHeight - 1, y))) {
    if (el.closest('[data-island-nav]')) continue;
    const colour = getComputedStyle(el).backgroundColor;
    const parts = colour.match(/\d+(\.\d+)?/g);
    if (!parts || (parts.length > 3 && Number(parts[3]) === 0)) continue;
    return colour;
  }
  return undefined;
};

const luma = (colour: string | undefined) => {
  const [r, g, b] = (colour?.match(/\d+(\.\d+)?/g) ?? ['255', '255', '255']).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const IslandNav = () => {
  const [open, setOpen] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [backdrop, setBackdrop] = useState<string | undefined>(undefined);
  const root = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const fine = useRef(false);

  useEffect(() => {
    const media = matchMedia('(hover: hover) and (pointer: fine)');
    fine.current = media.matches;
    const onChange = () => { fine.current = media.matches; };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // What is under the island: once per frame while scrolling, and once more when it settles.
  useEffect(() => {
    const below = islandMetrics.idle.height + 14 + 6;
    let ticking = false;
    let settle: number | undefined;
    const read = () => setBackdrop(backdropUnder(below));
    const sense = () => {
      clearTimeout(settle);
      settle = window.setTimeout(read, 120);
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { read(); ticking = false; });
    };
    read();
    addEventListener('scroll', sense, { passive: true });
    addEventListener('resize', sense);
    return () => {
      clearTimeout(settle);
      removeEventListener('scroll', sense);
      removeEventListener('resize', sense);
    };
  }, []);

  // A press outside, Escape, or focus moving elsewhere closes it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && root.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const inside = root.current?.contains(document.activeElement) ?? false;
      setOpen(false);
      if (inside) trigger.current?.blur();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  const presentation: IslandPresentation = open
    ? {
        kind: 'expanded',
        center: (
          <nav className="island-nav__links" aria-label="Primary">
            {links.map((l) => (
              <a key={l.href} className="island-nav__link" href={l.href} onClick={close}>{l.label}</a>
            ))}
          </nav>
        ),
      }
    : idle;

  const dark = luma(backdrop) < 80;

  return (
    <div
      ref={root}
      className="island-nav"
      data-island-nav=""
      data-open={open || undefined}
      data-dark={dark || undefined}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse' && fine.current) setOpen(true); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse' && fine.current) setOpen(false); }}
      onBlur={(e) => { if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}
    >
      <button
        ref={trigger}
        className="island-nav__hit"
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        onPointerDown={(e) => { if (e.pointerType !== 'mouse') setPressed(true); }}
        onPointerUp={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onClick={(e) => {
          // A mouse that hovers has already opened it; a click then keeps it open.
          if (e.detail > 0 && fine.current) { setOpen(true); return; }
          setOpen((v) => !v);
        }}
        onFocus={(e) => { if (e.target.matches(':focus-visible')) setOpen(true); }}
      />
      {/* After the button, so Tab goes from it into the links. */}
      <IslandView
        presentation={presentation}
        placement="viewport"
        label="Navigation"
        pressed={pressed}
        backdrop={backdrop}
      />
    </div>
  );
};

export default IslandNav;
