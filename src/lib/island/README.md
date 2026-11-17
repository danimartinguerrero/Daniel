Vendored from https://github.com/opencoredev/islandcn (lib/island, commit 0011a41), MIT. See LICENSE.

Local changes (personal site), everything else is unmodified:

- `surface.tsx`: the CSS shadow box (`placeShadow`) is painted only at rest or when the shape outgrows it, and otherwise follows the shape by transform and its strength by opacity, so a moving shape no longer repaints a wide blurred shadow every frame.
- `platform.ts`: `shadowBoxes`, the CSS shadow on touch screens in any engine as well as in Apple's WebKit; desktop Chrome and Firefox keep the SVG filter.
- `geometry.ts`: idle to `minimal` takes the split (the bubble buds off the bare pill as it does off a compact one) instead of `appear`.
- `view.tsx`: `IslandView` takes `pressTarget`, `pressStyle` and `joining`, which the surface already had, so a controlled island can press and join its bubble as the activity stack does.
- `metrics.ts`, `surface.tsx`: `keyline.idle`, the keyline's strength on the bare pill and a pill no wider than it (0, as upstream, by default).
- `surface.tsx`: the keyline's strength is set on its group (its paths drawn opaque), so overlapping bands aren't drawn twice as bright: that took a speck off the pill's top edge as the bubble came out and went in.
