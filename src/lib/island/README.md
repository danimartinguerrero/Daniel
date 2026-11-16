Vendored from https://github.com/opencoredev/islandcn (lib/island, commit 0011a41), MIT. See LICENSE.

Local changes (personal site), everything else is unmodified:

- `surface.tsx`: the CSS shadow box (`placeShadow`) is painted only at rest or when the shape outgrows it, and otherwise follows the shape by transform and its strength by opacity, so a moving shape no longer repaints a wide blurred shadow every frame.
- `platform.ts`: `shadowBoxes`, the CSS shadow on touch screens in any engine as well as in Apple's WebKit; desktop Chrome and Firefox keep the SVG filter.
