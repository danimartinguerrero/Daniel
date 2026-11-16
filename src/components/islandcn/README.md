Vendored from https://github.com/opencoredev/islandcn (components/islandcn, commit 0011a41), MIT: the now-playing preset and the kit it imports. See LICENSE.

Local changes (personal site), everything else is unmodified:

- `now-playing-activity.tsx`: play and pause cross over (`PlayPauseSwap`) instead of swapping in one frame; the paused time left rounds up as the running one does, so it no longer jumps a second on pause; `PlayerControls` takes `onSeek`, which makes the bar a scrubber and shows the spot under the finger in both times.
- `scrubber.tsx`: new, not from upstream (its bar only shows progress). The kit's `LinearProgress` made draggable, tappable and keyable.
